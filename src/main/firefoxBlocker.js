const { exec } = require("child_process");

function closeFirefox() {
  return new Promise((resolve) => {
    exec(`osascript -e 'tell application "Firefox" to quit'`, () => resolve());
  });
}

/**
 * Repeatedly closes Firefox for the given duration, so it can't just be
 * reopened immediately after the first quit. A single `pkill`/`quit` only
 * closes it once — this enforces the block for the whole window.
 */
function blockFirefox(durationMs = 2 * 60 * 60 * 1000) {
  const endTime = Date.now() + durationMs;

  closeFirefox(); // close it immediately

  const interval = setInterval(() => {
    if (Date.now() >= endTime) {
      clearInterval(interval);
      return;
    }
    closeFirefox();
  }, 3000);

  return () => clearInterval(interval); // call to cancel the block early
}

module.exports = { closeFirefox, blockFirefox };
