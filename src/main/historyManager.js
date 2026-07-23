/**
 * historyManager.js
 *
 * Persists chat history as SEPARATE SESSION FILES (one JSON file per
 * conversation), instead of one shared file — so hitting "New Chat"
 * starts a fresh session without erasing the previous one. All sessions
 * are saved permanently in src/memory/chatSessions/ and can be reloaded.
 */

const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = path.join(__dirname, "..", "memory", "chatSessions");
const CURRENT_SESSION_PATH = path.join(SESSIONS_DIR, "_current.json");

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getCurrentSessionId() {
  ensureDir();
  if (!fs.existsSync(CURRENT_SESSION_PATH)) {
    const id = `session-${Date.now()}`;
    fs.writeFileSync(CURRENT_SESSION_PATH, JSON.stringify({ currentId: id }));
    return id;
  }
  try {
    return JSON.parse(fs.readFileSync(CURRENT_SESSION_PATH, "utf-8")).currentId;
  } catch {
    const id = `session-${Date.now()}`;
    fs.writeFileSync(CURRENT_SESSION_PATH, JSON.stringify({ currentId: id }));
    return id;
  }
}

function sessionFilePath(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

/** Loads the currently active session's messages. */
function load() {
  const id = getCurrentSessionId();
  const filePath = sessionFilePath(id);
  if (!fs.existsSync(filePath)) {
    const blank = { messages: [] };
    fs.writeFileSync(filePath, JSON.stringify(blank, null, 2));
    return blank;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { messages: [] };
  }
}

function save(historyObj) {
  const id = getCurrentSessionId();
  fs.writeFileSync(sessionFilePath(id), JSON.stringify(historyObj, null, 2));
}

/** Appends one message ({role: "user"|"vivian", text}) with a timestamp. */
function appendMessage(role, text) {
  const history = load();
  history.messages.push({ role, text, timestamp: Date.now() });
  save(history);
  return history;
}

/**
 * Starts a brand new session — the OLD session's file is kept on disk
 * untouched, this just points "current" at a new empty one.
 */
function startNewSession() {
  ensureDir();
  const id = `session-${Date.now()}`;
  fs.writeFileSync(CURRENT_SESSION_PATH, JSON.stringify({ currentId: id }));
  fs.writeFileSync(sessionFilePath(id), JSON.stringify({ messages: [] }, null, 2));
  return id;
}

/** Lists all saved sessions (id + first message preview + timestamp), most recent first. */
function listSessions() {
  ensureDir();
  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "_current.json");

  const sessions = files.map((f) => {
    const id = f.replace(/\.json$/, "");
    const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
    const firstUserMsg = data.messages.find((m) => m.role === "user");
    return {
      id,
      preview: firstUserMsg ? firstUserMsg.text.slice(0, 40) : "(empty)",
      messageCount: data.messages.length,
      timestamp: parseInt(id.replace("session-", ""), 10) || 0
    };
  });

  return sessions.sort((a, b) => b.timestamp - a.timestamp);
}

/** Switches the active session to a previously saved one. */
function switchToSession(id) {
  ensureDir();
  fs.writeFileSync(CURRENT_SESSION_PATH, JSON.stringify({ currentId: id }));
}

module.exports = { load, save, appendMessage, startNewSession, listSessions, switchToSession };
