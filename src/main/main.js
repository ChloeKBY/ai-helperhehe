/**
 * main.js
 *
 * Electron main process. Creates the transparent, frameless, always-on-top
 * PNGtuber window, and wires up secure IPC handlers for everything the
 * renderer needs (chat, memory, focus watching, process control).
 *
 * Security notes:
 * - contextIsolation: true, nodeIntegration: false — renderer has NO direct
 *   Node/Electron access. Everything privileged goes through preload.js + IPC.
 * - No secrets live in the renderer at any point.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const ollamaClient = require("../ollama/ollamaClient");
const memoryManager = require("../memory/memoryManager");
const { startCAIMonitoring } = require("./screenWatcher");
const { tryHandleCommand } = require("./commandParser");

let mainWindow;

app.whenReady().then(() => {
  createWindow();
  startCAIMonitoring();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 200,
    height: 320,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------- IPC handlers: the ONLY way the renderer talks to the system ---------- */

// Chat: renderer sends a user message, main streams tokens back
ipcMain.handle("chat:send", async (event, userMessage) => {
  try {
    // Check for a recognized command (reminder, file move, organize) first —
    // if it matches, act on it directly instead of asking the LLM to "chat"
    // about doing something without actually doing it.
    const commandReply = tryHandleCommand(userMessage);
    if (commandReply !== null) {
      event.sender.send("chat:token", commandReply);
      return { fullResponse: commandReply };
    }

    const running = await ollamaClient.isOllamaRunning();
    if (!running) {
      return { error: "Ollama isn't running. Start it with `ollama serve` and try again." };
    }

    const personalityTemplate = fs.readFileSync(
      path.join(__dirname, "../ollama/personalityPrompt.txt"),
      "utf-8"
    );
    const memoryContext = memoryManager.formatForPrompt();
    const systemPrompt = personalityTemplate.replace("{{MEMORY_CONTEXT}}", memoryContext);

    let fullResponse = "";
    await ollamaClient.streamChat(systemPrompt, userMessage, (token) => {
      fullResponse += token;
      event.sender.send("chat:token", token);
    });

    return { fullResponse };
  } catch (err) {
    console.error("chat:send failed:", err);
    return { error: `Something went wrong: ${err.message}` };
  }
});

// Memory: renderer can request current memory (read-only from that side)
ipcMain.handle("memory:get", async () => {
  return memoryManager.load();
});

ipcMain.handle("memory:update", async (event, { key, value }) => {
  return memoryManager.update(key, value);
});

// Manual window dragging: renderer sends mouse deltas while dragging
ipcMain.on("window:moveBy", (event, dx, dy) => {
  if (!mainWindow) return;

  const numericDx = Number(dx);
  const numericDy = Number(dy);
  if (!Number.isFinite(numericDx) || !Number.isFinite(numericDy)) {
    console.warn("window:moveBy ignored invalid args:", { dx, dy });
    return;
  }

  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(Math.round(x + numericDx), Math.round(y + numericDy));
});

module.exports = { mainWindow };
