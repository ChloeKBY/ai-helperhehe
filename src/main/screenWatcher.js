/**
 * screenWatcher.js
 *
 * Takes a screenshot and asks a local vision model whether the user looks
 * like they're studying/working vs. procrastinating.
 *
 * IMPORTANT: this is NOT meant to run continuously. It's designed to be
 * called only when focusWatcher.js flags that a watched app has been
 * focused for a while — that keeps the (relatively) expensive vision-model
 * call rare instead of constant.
 *
 * Uses Electron's desktopCapturer, which requires screen-recording
 * permission on macOS (System Settings > Privacy & Security > Screen
 * Recording). The user will be prompted the first time this runs.
 */

const { desktopCapturer, screen } = require("electron");
const ollamaClient = require("../ollama/ollamaClient");

/**
 * Captures the primary screen and returns it as a base64 PNG string
 * (without the data URL prefix, since Ollama wants raw base64).
 */
async function captureScreen() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height }
  });

  if (!sources.length) {
    throw new Error("No screen sources available — check Screen Recording permission.");
  }

  // toPNG() returns a Buffer; convert to base64 for the Ollama API
  const pngBuffer = sources[0].thumbnail.toPNG();
  return pngBuffer.toString("base64");
}

/**
 * Captures the screen and asks the vision model a judgment question.
 * Returns a simple verdict object rather than raw model text, so callers
 * (like main.js's productivity rules) don't have to parse free-form text.
 *
 * @param {string} context - what app/situation triggered this check, for
 *   logging/debugging purposes
 */
async function checkProductivity(context = "") {
  const base64Image = await captureScreen();

  const question =
    "Look at this screenshot of someone's computer screen. In one word, " +
    "answer whether they appear to be doing focused work/studying, or " +
    "browsing/procrastinating. Answer with only 'focused' or 'distracted'.";

  const rawAnswer = await ollamaClient.analyzeImage(base64Image, question);
  const verdict = rawAnswer.toLowerCase().includes("focused") ? "focused" : "distracted";

  return { verdict, rawAnswer, context, timestamp: Date.now() };
}

module.exports = { captureScreen, checkProductivity };
