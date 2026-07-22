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

const ollamaClient = require("../ollama/ollamaClient");
const memoryManager = require("../memory/memoryManager");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------- IPC handlers: the ONLY way the renderer talks to the system ---------- */

// Chat: renderer sends a user message, main streams tokens back
ipcMain.handle("chat:send", async (event, userMessage) => {
  const running = await ollamaClient.isOllamaRunning();
  if (!running) {
    return { error: "Ollama isn't running. Start it and try again." };
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
    // Push each token to the renderer as it arrives
    event.sender.send("chat:token", token);
  });

  return { fullResponse };
});

// Memory: renderer can request current memory (read-only from that side)
ipcMain.handle("memory:get", async () => {
  return memoryManager.load();
});

ipcMain.handle("memory:update", async (event, { key, value }) => {
  return memoryManager.update(key, value);
});

module.exports = { mainWindow };
