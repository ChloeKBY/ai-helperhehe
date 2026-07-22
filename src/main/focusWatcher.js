/**
 * focusWatcher.js
 *
 * Cheap, low-frequency check of which app is currently focused on macOS.
 * This is the "first filter" — it runs constantly with negligible CPU cost,
 * and only flags when a heavier check (screenWatcher.js) should run.
 *
 * Uses AppleScript via osascript, which is a tiny, near-instant call —
 * nowhere near the cost of an LLM call or screenshot.
 */

const { exec } = require("child_process");

/** Returns the name of the currently focused application. */
function getFocusedApp() {
  return new Promise((resolve, reject) => {
    const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
    exec(`osascript -e '${script}'`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

/**
 * Watches focus changes and calls onFlagged(appName, durationMs) when a
 * "watched" app (e.g. Firefox, if you're monitoring c.ai usage) has stayed
 * focused continuously for longer than thresholdMs.
 *
 * This is intentionally simple polling (every few seconds) rather than a
 * true event listener, since macOS doesn't expose a cheap focus-change
 * event to a sandboxed Electron app — polling at a low frequency like this
 * still costs near-zero CPU.
 */
function watchFocus({ watchedApps, thresholdMs, onFlagged, intervalMs = 5000 }) {
  let currentApp = null;
  let focusStartTime = null;

  const interval = setInterval(async () => {
    try {
      const app = await getFocusedApp();

      if (app !== currentApp) {
        currentApp = app;
        focusStartTime = Date.now();
        return;
      }

      if (watchedApps.includes(currentApp)) {
        const duration = Date.now() - focusStartTime;
        if (duration >= thresholdMs) {
          onFlagged(currentApp, duration);
        }
      }
    } catch (err) {
      console.warn("focusWatcher check failed:", err.message);
    }
  }, intervalMs);

  return () => clearInterval(interval); // call this to stop watching
}

module.exports = { getFocusedApp, watchFocus };
