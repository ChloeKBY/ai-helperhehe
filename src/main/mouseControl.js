/**
 * mouseControl.js
 *
 * Moves the actual mouse cursor on macOS, using the `cliclick` CLI tool
 * (install via `brew install cliclick` — not an npm package, a tiny signed
 * binary, so no native module compilation headaches in Electron).
 *
 * Used for a playful "drag your mouse to the corner" intervention when
 * Vivian closes a watched site.
 */

const { exec } = require("child_process");
const { screen } = require("electron");

/** Moves the mouse to an absolute screen position (instant jump). */
function moveMouseTo(x, y) {
  return new Promise((resolve, reject) => {
    exec(`cliclick m:${x},${y}`, (err) => {
      if (err) return reject(new Error("cliclick failed — is it installed? `brew install cliclick`"));
      resolve();
    });
  });
}

/**
 * Moves the mouse smoothly to a position over a duration, by stepping
 * through intermediate points. More noticeable/funny than an instant jump.
 */
async function dragMouseTo(targetX, targetY, durationMs = 400, steps = 20) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const cursor = screen.getCursorScreenPoint();

  const startX = cursor.x;
  const startY = cursor.y;
  const stepDelay = durationMs / steps;

  for (let i = 1; i <= steps; i++) {
    const x = Math.round(startX + ((targetX - startX) * i) / steps);
    const y = Math.round(startY + ((targetY - startY) * i) / steps);
    await moveMouseTo(x, y);
    await new Promise((r) => setTimeout(r, stepDelay));
  }
}

/** Drags the mouse into whichever corner is specified (default bottom-right). */
async function dragMouseToCorner(corner = "bottom-right") {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const margin = 5; // keep it just inside the edge

  const positions = {
    "top-left": [margin, margin],
    "top-right": [width - margin, margin],
    "bottom-left": [margin, height - margin],
    "bottom-right": [width - margin, height - margin]
  };

  const [x, y] = positions[corner] || positions["bottom-right"];
  await dragMouseTo(x, y);
}

module.exports = { moveMouseTo, dragMouseTo, dragMouseToCorner };
