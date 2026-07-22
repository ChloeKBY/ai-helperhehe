/**
 * preload.js
 *
 * The ONLY bridge between the sandboxed renderer and the main process.
 * Exposes a minimal, explicit API via contextBridge — the renderer never
 * gets raw Node or Electron access, and never sees the Ollama call directly.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vivian", {
  // Send a chat message, get the full response back once streaming finishes
  sendMessage: (message) => ipcRenderer.invoke("chat:send", message),

  // Subscribe to streamed tokens as they arrive (for live typing effect)
  onToken: (callback) => {
    ipcRenderer.on("chat:token", (event, token) => callback(token));
  },

  // Memory read/update (renderer never touches the file system directly)
  getMemory: () => ipcRenderer.invoke("memory:get"),
  updateMemory: (key, value) => ipcRenderer.invoke("memory:update", { key, value }),

  // Fires when the productivity watcher intervenes (e.g. closed an app)
  onIntervention: (callback) => {
    ipcRenderer.on("productivity:intervened", (event, message) => callback(message));
  },

  // Manual window dragging (since the sprite needs to handle clicks too,
  // which -webkit-app-region: drag blocks)
  moveWindowBy: (dx, dy) => ipcRenderer.send("window:moveBy", { dx, dy })
});
