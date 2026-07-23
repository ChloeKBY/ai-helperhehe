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

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const ollamaClient = require("../ollama/ollamaClient");
const memoryManager = require("../memory/memoryManager");
const { startCAIMonitoring } = require("./screenWatcher");
const { tryHandleCommand } = require("./commandParser");
const historyManager = require("./historyManager");

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
    show: false, // don't show until fully ready — avoids a visible flash of cut-off/unstyled content while the page loads
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

// The renderer tells us once its first sprite frame (background stripped)
// is actually ready — showing on THIS instead of just "ready-to-show"
// avoids a flash of the raw opaque-background image before JS processes it.
ipcMain.on("renderer:ready", () => {
  if (mainWindow) mainWindow.show();
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------- IPC handlers: the ONLY way the renderer talks to the system ---------- */

// Chat: renderer sends a user message, main streams tokens back
ipcMain.handle("chat:send", async (event, userMessage) => {
  try {
    historyManager.appendMessage("user", userMessage);

    // Check for a recognized command (reminder, file move, organize) first —
    // if it matches, act on it directly instead of asking the LLM to "chat"
    // about doing something without actually doing it.
    const commandReply = await tryHandleCommand(userMessage);
    if (commandReply !== null) {
      event.sender.send("chat:token", commandReply);
      historyManager.appendMessage("vivian", commandReply);
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

    historyManager.appendMessage("vivian", fullResponse);
    return { fullResponse };
  } catch (err) {
    console.error("chat:send failed:", err);
    return { error: `Something went wrong: ${err.message}` };
  }
});

// History: renderer loads persisted history on startup, and can clear it
ipcMain.handle("history:get", async () => {
  return historyManager.load();
});

ipcMain.handle("history:clear", async () => {
  historyManager.startNewSession();
  return { cleared: true };
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
  const [winWidth, winHeight] = mainWindow.getSize();

  // Clamp to the screen's visible bounds — without this, a fast/aggressive
  // drag can throw the window fully off-screen (huge single-event deltas
  // during quick mouse motion), where it becomes unreachable to click back.
  // Keep at least a sliver of the window on-screen at all times.
  const display = screen.getDisplayNearestPoint({ x, y });
  const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = display.workArea;
  const minVisible = 40; // pixels of the window that must stay on-screen

  let newX = x + numericDx;
  let newY = y + numericDy;
  newX = Math.max(areaX - winWidth + minVisible, Math.min(newX, areaX + areaWidth - minVisible));
  newY = Math.max(areaY - winHeight + minVisible, Math.min(newY, areaY + areaHeight - minVisible));

  mainWindow.setPosition(Math.round(newX), Math.round(newY));
});

module.exports = { mainWindow };
