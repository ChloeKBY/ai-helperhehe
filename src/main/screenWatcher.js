const { desktopCapturer, screen } = require("electron");
const moondream = require("../moondream/moondream");
const { blockFirefox } = require("./firefoxBlocker");
const { dragMouseToCorner } = require("./mouseControl");

let caiDetectedAt = null;
let interventionInProgress = false;

async function captureScreenBuffer() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height }
  });

  if (!sources.length) {
    throw new Error("No screen sources available — check Screen Recording permission.");
  }

  return sources[0].thumbnail.toPNG();
}

async function analyzeScreenForCAI() {
  try {
    const pngBuffer = await captureScreenBuffer();

    const result = await moondream.answerQuestion(
      pngBuffer,
      "Is the user currently on Wikipedia? Answer YES or NO only." // TEMP: testing with Wikipedia instead of character.ai — swap back after
    );

    const answer = String(result).toUpperCase().trim();
    return answer.includes("YES");
  } catch (err) {
    console.error("Moondream screen analysis failed:", err);
    return false;
  }
}

async function performCAIIntervention() {
  if (interventionInProgress) return;
  interventionInProgress = true;

  try {
    await dragMouseToCorner("bottom-right");
    blockFirefox();
  } catch (err) {
    console.error("CAI intervention failed:", err);
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
      const isOnCAI = await analyzeScreenForCAI();
      if (isOnCAI) {
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
      console.warn("CAI monitoring loop error:", err);
    }
  }, 8000);
}

module.exports = { startCAIMonitoring };
