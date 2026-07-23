/**
 * screenWatcher.js
 *
 * Periodically screenshots the screen and asks the local vision model
 * (Gemma 3 4B via Ollama) whether the target site/app is currently open —
 * but ONLY when the target browser is actually focused (a cheap check
 * gates the expensive vision call, to avoid constant heavy inference
 * eating CPU/battery/heat when it isn't even relevant).
 * If it's been open past the threshold, triggers an intervention
 * (mouse drag + closing/blocking the browser).
 *
 * IMPORTANT: this requires `ollama pull gemma3:4b` to have been run once.
 * If that model isn't pulled, EVERY check fails silently unless you're
 * watching the terminal — this version surfaces repeated failures as an
 * actual macOS notification so it's not a silent, invisible bug.
 */

const { desktopCapturer, screen } = require("electron");
const moondream = require("../moondream/moondream");
const { blockFirefox } = require("./firefoxBlocker");
const { dragMouseToCorner } = require("./mouseControl");
const { showNotification } = require("./reminders");
const { getFocusedWindow } = require("./focusWatcher");

// Which site to watch for. Swap "character.ai" for whatever you're testing.
const TARGET_SITE_QUESTION =
  "Look carefully at this screenshot for a Character.AI chat interface. Answer YES if you see ANY of these: a small 'c.ai' tag/badge next to a character's name, a chat conversation with character avatars and message bubbles, a message input box with placeholder text like 'Message [name]...', or small disclaimer text saying something like 'This is A.I. and not a real person'. If you see a normal web page, code editor, terminal, or desktop with none of those signs, answer NO. Answer with exactly one word: YES or NO.";

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

  // Cap the captured size — full Retina resolution is unnecessarily huge,
  // but too small makes browser tab text illegible, which likely
  // contributes to the model's yes-bias guessing. 1200px is a middle
  // ground: still much smaller than native res, but text should be legible.
  const maxWidth = 1200;
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
      // CHEAP gate first: only bother with the expensive vision call at all
      // if the target browser is actually the focused app right now. This
      // AppleScript check is near-instant — nowhere near the CPU/GPU cost
      // of a full vision model inference. Running that every few seconds
      // regardless of what's focused was almost certainly the cause of the
      // laptop heat, since Gemma 3 4B does real inference work every single
      // cycle, forever, even when Firefox wasn't even open.
      const { appName } = await getFocusedWindow();
      console.log(`[screenWatcher] focused app: "${appName}" (target: "${TARGET_BROWSER}")`); // remove once confirmed working
      if (appName !== TARGET_BROWSER) {
        caiDetectedAt = null; // not even in the browser — nothing to track
        return;
      }

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
          "Screen watching keeps failing — check that `ollama pull gemma3:4b` has been run, and that Screen Recording permission is granted."
        );
      }
    }
  }, 15000); // slower base rate too — the vision call is heavy, no need to hammer it
}

module.exports = { startCAIMonitoring };
