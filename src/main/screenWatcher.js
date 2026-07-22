const { desktopCapturer, screen } = require("electron");
const moondream = require("../moondream/moondreamClient"); // adjust path
const { blockFirefox } = require("./firefoxBlocker");       // adjust path

async function captureScreenBuffer() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height }
  });

  if (!sources.length) {
    throw new Error("No screen sources available — check Screen Recording permission.");
  }

  return sources[0].thumbnail.toPNG(); // raw PNG buffer
}

async function analyzeScreenForCAI() {
  try {
    const pngBuffer = await captureScreenBuffer();

    const result = await moondream.answerQuestion(
      pngBuffer,
      "Is the user currently on the website character.ai? Answer YES or NO only."
    );

    const answer = result.toUpperCase().trim();
    return answer.includes("YES");
  } catch (err) {
    console.error("Moondream error:", err);
    return false;
  }
}

function startCAIMonitoring() {
  setInterval(async () => {
    const isOnCAI = await analyzeScreenForCAI();

    if (isOnCAI) {
      console.log("Detected character.ai — blocking Firefox...");
      blockFirefox();
    }
  }, 8000);
}

module.exports = { startCAIMonitoring };
