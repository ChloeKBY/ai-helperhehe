/**
 * screenWatcher.js
 *
 * Periodically screenshots the screen and asks a local vision model
 * (Moondream via Ollama) whether the target site/app is currently open.
 * If it's been open past the threshold, triggers an intervention
 * (mouse drag + closing/blocking the browser).
 *
 * IMPORTANT: this requires `ollama pull moondream` to have been run once.
 * If that model isn't pulled, EVERY check fails silently unless you're
 * watching the terminal — this version now surfaces repeated failures as
 * an actual macOS notification so it's not a silent, invisible bug.
 */

const { desktopCapturer, screen } = require("electron");
const moondream = require("../moondream/moondream");
const { blockFirefox } = require("./firefoxBlocker");
const { dragMouseToCorner } = require("./mouseControl");
const { showNotification } = require("./reminders");

// Which site to watch for. Swap "character.ai" for whatever you're testing.
const TARGET_SITE_QUESTION =
  "Is the user currently on the website character.ai? Answer YES or NO only.";

// If you switch browsers (e.g. to Orion instead of Firefox), update this —
// it's the app name used for the close/block intervention.
const TARGET_BROWSER = "Firefox";

let caiDetectedAt = null;
let interventionInProgress = false;
let consecutiveFailures = 0;
let hasWarnedAboutFailures = false;

async function captureScreenBuffer() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  // Cap the captured size — sending a full-resolution Retina screenshot
  // (which can be several MB as base64) to a small vision model like
  // Moondream can silently fail/return empty instead of erroring. Scale
  // down to a max width of 800px, keeping aspect ratio.
  const maxWidth = 800;
  const scale = Math.min(1, maxWidth / width);
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: scaledWidth, height: scaledHeight }
  });

  if (!sources.length) {
    throw new Error("No screen sources available — check Screen Recording permission.");
  }

  return sources[0].thumbnail.toPNG();
}

async function analyzeScreenForCAI() {
  const pngBuffer = await captureScreenBuffer(); // let errors bubble up — caller handles them
  const result = await moondream.answerQuestion(pngBuffer, TARGET_SITE_QUESTION);
  const answer = String(result).toUpperCase().trim();
  console.log(`[screenWatcher] raw model answer: "${result}"`); // remove once you trust it's working
  return answer.includes("YES");
}

async function performCAIIntervention() {
  if (interventionInProgress) return;
  interventionInProgress = true;

  try {
    await dragMouseToCorner("bottom-right");
    blockFirefox(); // NOTE: targets Firefox specifically — see TARGET_BROWSER above
  } catch (err) {
    console.error("Intervention failed:", err);
  } finally {
    setTimeout(() => {
      interventionInProgress = false;
      caiDetectedAt = null;
    }, 10000);
  }
}

function startCAIMonitoring() {
  setInterval(async () => {
    try {
      const isOnTarget = await analyzeScreenForCAI();
      consecutiveFailures = 0; // a successful check (true OR false) resets the failure count

      if (isOnTarget) {
        if (!caiDetectedAt) {
          caiDetectedAt = Date.now();
        }

        const elapsed = Date.now() - caiDetectedAt;
        if (elapsed >= 30000) {
          await performCAIIntervention();
        }
      } else {
        caiDetectedAt = null;
      }
    } catch (err) {
      console.warn("Screen monitoring check failed:", err.message);
      consecutiveFailures++;

      // After several failures in a row, this is clearly broken (not just a
      // one-off blip) — tell the user instead of failing silently forever.
      if (consecutiveFailures >= 3 && !hasWarnedAboutFailures) {
        hasWarnedAboutFailures = true;
        showNotification(
          "Evie",
          "Screen watching keeps failing — check that `ollama pull moondream` has been run, and that Screen Recording permission is granted."
        );
      }
    }
  }, 8000);
}

module.exports = { startCAIMonitoring };
