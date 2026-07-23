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

/**
 * Distinguishes a click (open the input box) from a drag (move the
 * window) on the same sprite element, since Electron's CSS drag-region
 * blocks click events entirely if applied directly.
 */
let dragStartX = 0;
let dragStartY = 0;
let isDragging = false;
let lastX = 0;
let lastY = 0;
const DRAG_THRESHOLD = 4; // pixels of movement before it counts as a drag, not a click

sprite.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  sprite.setPointerCapture(e.pointerId);

  isDragging = false;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  lastX = e.screenX;
  lastY = e.screenY;

  const onPointerMove = (moveEvent) => {
    const totalDx = moveEvent.screenX - dragStartX;
    const totalDy = moveEvent.screenY - dragStartY;
    if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
      isDragging = true;
    }

    if (isDragging) {
      const dx = moveEvent.screenX - lastX;
      const dy = moveEvent.screenY - lastY;
      window.vivian.moveWindowBy(dx, dy);
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
    }
  };

  const onPointerUp = (upEvent) => {
    sprite.releasePointerCapture(upEvent.pointerId);
    sprite.removeEventListener("pointermove", onPointerMove);
    sprite.removeEventListener("pointerup", onPointerUp);
    sprite.removeEventListener("pointercancel", onPointerUp);

    if (!isDragging) {
      // It was a click, not a drag — open the input box
      speechBubble.classList.remove("visible");
      inputBox.classList.add("visible");
      chatInput.focus();
    }
  };

  sprite.addEventListener("pointermove", onPointerMove);
  sprite.addEventListener("pointerup", onPointerUp);
  sprite.addEventListener("pointercancel", onPointerUp);
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
  setSprite("confused"); // "thinking" face while waiting on a response

  clearTimeout(hideBubbleTimeout);

  try {
    const result = await window.vivian.sendMessage(message);

    if (result.error) {
      speechBubble.textContent = `(${result.error})`;
      setSprite("uncomfortable");
    } else {
      setSprite("happy");
    }
  } catch (err) {
    speechBubble.textContent = `(Something broke: ${err.message})`;
    setSprite("uncomfortable");
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
  setSprite("upset");
  scheduleHideBubble();
});

/** Hides the speech bubble a few seconds after the reply finishes. */
function scheduleHideBubble() {
  clearTimeout(hideBubbleTimeout);
  hideBubbleTimeout = setTimeout(() => {
    speechBubble.classList.remove("visible");
    setSprite("idle"); // back to neutral once she's done talking
  }, 8000);
}

/**
 * Swaps the sprite image based on emotional state.
 * "idle" maps to the neutral expression (idle.png) — the rest use Evie's
 * actual expression names directly: confused, dumbfounded, happy,
 * surprised, uncomfortable, upset.
 */
function setSprite(state) {
  const validStates = [
    "idle",
    "confused",
    "dumbfounded",
    "happy",
    "surprised",
    "uncomfortable",
    "upset"
  ];
  if (!validStates.includes(state)) state = "idle";
  sprite.src = `../../assets/pngtuber/${state}.png`;
}
