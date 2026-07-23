/**
 * windowManager.js
 *
 * App-level and window-level controls: quitting apps cleanly, closing or
 * repositioning the frontmost window, and toggling Dock visibility.
 * All via AppleScript/System Events — no extra dependencies needed.
 */

const { exec } = require("child_process");
const { screen } = require("electron");

function run(script) {
  return new Promise((resolve, reject) => {
    const lines = script.trim().split("\n").map((l) => `-e '${l.trim()}'`).join(" ");
    exec(`osascript ${lines}`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

/** Quits an app cleanly (like clicking Quit in its menu). */
async function quitApp(appName) {
  await run(`tell application "${appName}" to quit`);
}

/** Closes the frontmost window (like pressing Cmd+W). */
async function closeFrontmostWindow() {
  await run(`
    tell application "System Events"
      keystroke "w" using command down
    end tell
  `);
}

/**
 * Moves the frontmost window to a named screen position
 * ("top-left", "top-right", "bottom-left", "bottom-right", "center").
 */
async function moveFrontmostWindowTo(position) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const positions = {
    "top-left": [0, 0],
    "top-right": [Math.round(width / 2), 0],
    "bottom-left": [0, Math.round(height / 2)],
    "bottom-right": [Math.round(width / 2), Math.round(height / 2)],
    center: [Math.round(width / 4), Math.round(height / 4)]
  };
  const [x, y] = positions[position] || positions.center;

  await run(`
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      tell process frontApp
        set position of front window to {${x}, ${y}}
      end tell
    end tell
  `);
}

/** Shows or hides the macOS Dock. */
async function setDockVisible(visible) {
  return new Promise((resolve, reject) => {
    const value = visible ? "false" : "true"; // autohide=false means "always visible"
    exec(
      `defaults write com.apple.dock autohide -bool ${value} && killall Dock`,
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { quitApp, closeFrontmostWindow, moveFrontmostWindowTo, setDockVisible };
