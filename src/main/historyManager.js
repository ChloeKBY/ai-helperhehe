/**
 * historyManager.js
 *
 * Persists the conversation to disk (src/memory/chatHistory.json) so it
 * survives app restarts — unlike the old in-memory-only version, which
 * lost everything when you quit.
 */

const fs = require("fs");
const path = require("path");

const HISTORY_PATH = path.join(__dirname, "..", "memory", "chatHistory.json");

function load() {
  if (!fs.existsSync(HISTORY_PATH)) {
    const blank = { messages: [] };
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(blank, null, 2));
    return blank;
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    // Corrupted file — start fresh rather than crashing the app
    return { messages: [] };
  }
}

function save(historyObj) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(historyObj, null, 2));
}

/** Appends one message ({role: "user"|"vivian", text}) with a timestamp. */
function appendMessage(role, text) {
  const history = load();
  history.messages.push({ role, text, timestamp: Date.now() });
  save(history);
  return history;
}

/** Wipes the entire persisted history (used by the "New chat" action). */
function clear() {
  save({ messages: [] });
}

module.exports = { load, save, appendMessage, clear };
