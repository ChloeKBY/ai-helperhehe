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
const { watchFocus } = require("./focusWatcher");
const { checkProductivity } = require("./screenWatcher");
const { closeApp, blockApp } = require("./processWatcher");
const { dragMouseToCorner } = require("./mouseControl");
const fs = require("fs");

/**
 * Productivity rule config. Edit these to change what counts as
 * "watched" and how long before Vivian steps in.
 *
 * IMPORTANT: this watches for specific SITE keywords in the browser's
 * window title — not the browser app as a whole. So studying on Firefox
 * for an hour won't trigger anything; only having one of these keywords
 * in the title for that long will.
 */
const WATCHED_APP = "Firefox";
const WATCHED_TITLE_KEYWORDS = ["character.ai", "c.ai"]; // add more sites here
const FOCUS_THRESHOLD_MS = 5 * 60 * 1000; // TESTING: 5 minutes (change back to 60*60*1000 for real use)
const BLOCK_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

let stopFocusWatch = null;
let currentlyBlocking = false; // prevents re-triggering while already blocked

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

/**
 * Starts the always-on, low-cost focus watcher. When a watched app has
 * been focused past the threshold, it triggers ONE screenshot + vision
 * check (not continuous) to decide whether to actually intervene.
 */
function startProductivityWatch() {
  stopFocusWatch = watchFocus({
    app: WATCHED_APP,
    titleKeywords: WATCHED_TITLE_KEYWORDS,
    thresholdMs: FOCUS_THRESHOLD_MS,
    onFlagged: async (matchedKeyword, durationMs) => {
      if (currentlyBlocking) return; // don't stack triggers while already blocked

      try {
        const result = await checkProductivity(matchedKeyword);
        console.log("Screen check result:", result);

        if (result.verdict === "distracted") {
          currentlyBlocking = true;
          await closeApp(WATCHED_APP);

          try {
            await dragMouseToCorner("bottom-right");
          } catch (err) {
            console.warn("Mouse drag failed (cliclick installed?):", err.message);
          }

          blockApp(WATCHED_APP, BLOCK_DURATION_MS);
          setTimeout(() => {
            currentlyBlocking = false;
          }, BLOCK_DURATION_MS);

          if (mainWindow) {
            mainWindow.webContents.send(
              "productivity:intervened",
              `Closed Firefox — "${matchedKeyword}" has been open a while. Taking a ${BLOCK_DURATION_MS / 60000}-minute break from it.`
            );
          }
        }
      } catch (err) {
        console.warn("Productivity check failed (likely missing screen permission):", err.message);
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  startProductivityWatch();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (stopFocusWatch) stopFocusWatch();
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
