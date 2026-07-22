/**
 * renderer.js
 *
 * Click-to-chat interaction: click the character to reveal an input box,
 * type a question and press Enter, and her reply streams into a speech
 * bubble above her head. The bubble auto-hides after a few seconds of
 * inactivity so the window stays small and out of the way otherwise.
 *
 * Runs in the sandboxed renderer process — only talks to the outside
 * world via window.vivian (exposed by preload.js).
 */

const sprite = document.getElementById("sprite");
const speechBubble = document.getElementById("speechBubble");
const inputBox = document.getElementById("inputBox");
const chatInput = document.getElementById("chatInput");

let currentResponse = "";
let hideBubbleTimeout = null;

/** Clicking the character toggles the input box open. */
sprite.addEventListener("click", () => {
  speechBubble.classList.remove("visible");
  inputBox.classList.add("visible");
  chatInput.focus();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
  if (e.key === "Escape") inputBox.classList.remove("visible");
});

async function handleSend() {
  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.value = "";
  inputBox.classList.remove("visible");

  currentResponse = "";
  speechBubble.classList.add("visible");
  speechBubble.textContent = "...";
  setSprite("thinking");

  clearTimeout(hideBubbleTimeout);

  try {
    const result = await window.vivian.sendMessage(message);

    if (result.error) {
      speechBubble.textContent = `(${result.error})`;
      setSprite("stern");
    } else {
      setSprite("idle");
    }
  } catch (err) {
    speechBubble.textContent = `(Something broke: ${err.message})`;
    setSprite("stern");
  }

  scheduleHideBubble();
}

// Streamed tokens update the bubble live as they arrive
window.vivian.onToken((token) => {
  currentResponse += token;
  speechBubble.textContent = currentResponse;
});

// Productivity interventions also show up in the speech bubble
window.vivian.onIntervention((message) => {
  currentResponse = message;
  speechBubble.classList.add("visible");
  speechBubble.textContent = currentResponse;
  setSprite("stern");
  scheduleHideBubble();
});

/** Hides the speech bubble a few seconds after the reply finishes. */
function scheduleHideBubble() {
  clearTimeout(hideBubbleTimeout);
  hideBubbleTimeout = setTimeout(() => {
    speechBubble.classList.remove("visible");
  }, 8000);
}

/** Swaps the sprite image based on emotional state. */
function setSprite(state) {
  const validStates = ["idle", "thinking", "stern", "excited", "disappointed"];
  if (!validStates.includes(state)) state = "idle";
  sprite.src = `../../assets/pngtuber/${state}.png`;
}
