/**
 * processWatcher.js
 *
 * Handles closing and temporarily blocking apps on macOS, used for
 * enforcing productivity rules (e.g. closing Firefox after prolonged
 * c.ai use, and preventing it from reopening for a cooldown period).
 *
 * All destructive actions here should be confirmed with the user first
 * at the call site — this module just provides the mechanism.
 */

const { exec } = require("child_process");

/** Force-quits an app by name. */
function closeApp(appName) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e 'tell application "${appName}" to quit'`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Blocks an app from reopening for a given duration by repeatedly closing
 * it if it gets relaunched. Returns a function to cancel the block early.
 */
function blockApp(appName, durationMs) {
  const endTime = Date.now() + durationMs;

  const interval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(interval);
      return;
    }
    try {
      await closeApp(appName);
    } catch {
      // App probably isn't open right now — nothing to do
    }
  }, 3000);

  return () => clearInterval(interval);
}

module.exports = { closeApp, blockApp };
