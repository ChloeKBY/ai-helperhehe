/**
 * reminders.js
 *
 * Sets one-off and repeating reminders that show a native macOS
 * notification when they fire, using AppleScript's `display notification`
 * (no extra npm dependency needed — this is built into macOS).
 */

const { exec } = require("child_process");
const memoryManager = require("../memory/memoryManager");

const activeReminders = new Map(); // id -> the interval/timeout handle
let nextId = 1;

/** Escapes double-quotes so the message can't break out of the AppleScript string. */
function sanitize(text) {
  return String(text).replace(/"/g, '\\"');
}

/**
 * If the user has set an "ntfy_topic" fact in userMemory.json, also pushes
 * the notification to their phone via ntfy.sh (free, no account needed —
 * they just install the ntfy app and subscribe to the same topic name).
 */
async function pushToPhone(message) {
  const memory = memoryManager.load();
  const fact = memory.facts.find((f) => f.key === "ntfy_topic");
  if (!fact || !fact.value || fact.value.startsWith("PUT ")) return; // not configured, skip silently

  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(fact.value.trim())}`, {
      method: "POST",
      body: message
    });
  } catch (err) {
    console.warn("Phone push failed (ntfy.sh unreachable?):", err.message);
  }
}

function showNotification(title, message) {
  const script = `display notification "${sanitize(message)}" with title "${sanitize(title)}"`;
  exec(`osascript -e '${script}'`, (err) => {
    if (err) console.warn("Notification failed:", err.message);
  });
  pushToPhone(message);
}

/**
 * Sets a one-off reminder that fires once after delayMs.
 * @returns {number} an id you can use to cancel it with cancelReminder()
 */
function setReminder(message, delayMs) {
  const id = nextId++;
  const handle = setTimeout(() => {
    showNotification("Vivian", message);
    activeReminders.delete(id);
  }, delayMs);

  activeReminders.set(id, handle);
  return id;
}

/**
 * Sets a repeating reminder that fires every intervalMs, forever until
 * cancelled (useful for things like "remind me to hydrate every hour").
 */
function setRepeatingReminder(message, intervalMs) {
  const id = nextId++;
  const handle = setInterval(() => {
    showNotification("Vivian", message);
  }, intervalMs);

  activeReminders.set(id, handle);
  return id;
}

/** Cancels a reminder (one-off or repeating) by its id. */
function cancelReminder(id) {
  const handle = activeReminders.get(id);
  if (!handle) return false;
  clearTimeout(handle); // works for both setTimeout and setInterval handles
  clearInterval(handle);
  activeReminders.delete(id);
  return true;
}

module.exports = { setReminder, setRepeatingReminder, cancelReminder, showNotification };
