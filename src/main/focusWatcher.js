/**
 * focusWatcher.js
 *
 * Cheap, low-frequency check of the currently focused app AND its window
 * title on macOS. This is the "first filter" — runs constantly with
 * negligible CPU cost, and only flags when a heavier check
 * (screenWatcher.js) should run.
 *
 * Why title, not just app name: watching "Firefox" as a whole would flag
 * you for studying on Firefox just as much as for browsing c.ai on
 * Firefox — they're the same app. So instead we match on keywords in the
 * window title (which shows the page title, even in private/incognito
 * windows) to only flag specific SITES, not the whole browser.
 *
 * Uses AppleScript via osascript — a tiny, near-instant call, nowhere near
 * the cost of an LLM call or screenshot.
 */

const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT_PATH = path.join(os.tmpdir(), "vivian-focus-check.scpt");

// Written once to a temp file rather than passed as a single-line `-e`
// string — AppleScript needs real line breaks between statements, and
// collapsing them into spaces (an earlier bug here) causes syntax errors.
const APPLESCRIPT_SOURCE = `
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  set frontWindowTitle to ""
  try
    tell process frontApp
      set frontWindowTitle to name of front window
    end tell
  end try
  return frontApp & "|||" & frontWindowTitle
end tell
`;

fs.writeFileSync(SCRIPT_PATH, APPLESCRIPT_SOURCE);

/** Returns { appName, windowTitle } for whatever's currently focused. */
function getFocusedWindow() {
  return new Promise((resolve, reject) => {
    exec(`osascript "${SCRIPT_PATH}"`, (err, stdout) => {
      if (err) return reject(err);
      const [appName, windowTitle] = stdout.trim().split("|||");
      resolve({ appName: appName || "", windowTitle: windowTitle || "" });
    });
  });
}

/**
 * Watches for specific SITE keywords appearing in the window title of a
 * given app (e.g. app: "Firefox", titleKeywords: ["character.ai", "c.ai"]),
 * and calls onFlagged(matchedKeyword, durationMs) once that keyword has
 * been continuously visible in the title for longer than thresholdMs.
 *
 * Works with private/incognito windows too, since the page title still
 * renders in the title bar regardless of browsing mode.
 *
 * @param {Object} config
 * @param {string} config.app - the app to watch (e.g. "Firefox")
 * @param {string[]} config.titleKeywords - case-insensitive keywords to
 *   match against the window title (e.g. site names)
 * @param {number} config.thresholdMs - how long a match must persist
 *   before triggering
 * @param {(matchedKeyword: string, durationMs: number) => void} config.onFlagged
 * @param {number} [config.intervalMs=5000] - polling frequency
 */
function watchFocus({ app, titleKeywords, thresholdMs, onFlagged, intervalMs = 5000 }) {
  let currentMatch = null; // the keyword currently matched, or null
  let matchStartTime = null;
  let alreadyFlaggedForThisMatch = false;

  const interval = setInterval(async () => {
    try {
      const { appName, windowTitle } = await getFocusedWindow();

      if (appName !== app) {
        currentMatch = null;
        return;
      }

      const lowerTitle = windowTitle.toLowerCase();
      const matched = titleKeywords.find((kw) => lowerTitle.includes(kw.toLowerCase()));

      if (!matched) {
        currentMatch = null;
        return;
      }

      if (matched !== currentMatch) {
        currentMatch = matched;
        matchStartTime = Date.now();
        alreadyFlaggedForThisMatch = false;
        return;
      }

      const duration = Date.now() - matchStartTime;
      if (duration >= thresholdMs && !alreadyFlaggedForThisMatch) {
        alreadyFlaggedForThisMatch = true; // don't re-fire every poll after threshold
        onFlagged(matched, duration);
      }
    } catch (err) {
      console.warn("focusWatcher check failed:", err.message);
    }
  }, intervalMs);

  return () => clearInterval(interval); // call this to stop watching
}

module.exports = { getFocusedWindow, watchFocus };
