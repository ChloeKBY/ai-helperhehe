/**
 * renderer.js
 *
 * Click-to-chat interaction: click the character to reveal an input box,
 * type a question and press Enter, and her reply streams into a speech
 * bubble above her head. The bubble now STAYS until you click away from
 * her (no more auto-hide timer making it vanish before you can read it).
 *
 * Keeps a running conversation history so you can scroll back through it
 * within the bubble, with a "new chat" option to clear it.
 *
 * Runs in the sandboxed renderer process — only talks to the outside
 * world via window.vivian (exposed by preload.js).
 */

const wrapper = document.getElementById("wrapper");
const sprite = document.getElementById("sprite");
const speechBubble = document.getElementById("speechBubble");
const inputBox = document.getElementById("inputBox");
const chatInput = document.getElementById("chatInput");
const newChatBtn = document.getElementById("newChatBtn");

let conversation = []; // { role: "user" | "vivian", text: string }[]
let streamingIndex = -1; // index in `conversation` currently being streamed into

// Load whatever was saved from before (persists across app restarts now)
window.vivian.getHistory().then((history) => {
  conversation = history.messages.map((m) => ({ role: m.role, text: m.text }));
});

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
      inputBox.classList.add("visible");
      speechBubble.classList.add("visible"); // show history alongside the input
      chatInput.focus();
    }
  };

  sprite.addEventListener("pointermove", onPointerMove);
  sprite.addEventListener("pointerup", onPointerUp);
  sprite.addEventListener("pointercancel", onPointerUp);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
  if (e.key === "Escape") closeInput();
});

/** When the window loses focus (you clicked elsewhere on your Mac), close the popup. */
window.addEventListener("blur", () => {
  closeInput();
  speechBubble.classList.remove("visible");
  setSprite("idle");
});

function closeInput() {
  inputBox.classList.remove("visible");
}

newChatBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  conversation = [];
  await window.vivian.clearHistory();
  renderConversation();
});

async function handleSend() {
  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.value = "";

  conversation.push({ role: "user", text: message });
  conversation.push({ role: "vivian", text: "" });
  streamingIndex = conversation.length - 1;

  speechBubble.classList.add("visible");
  renderConversation();
  setSprite("confuse"); // thinking face while waiting

  try {
    const result = await window.vivian.sendMessage(message);

    if (result.error) {
      conversation[streamingIndex].text = `(${result.error})`;
      setSprite("stern");
    } else {
      setSprite("soft");
    }
  } catch (err) {
    conversation[streamingIndex].text = `(Something broke: ${err.message})`;
    setSprite("stern");
  }

  renderConversation();
}

// Streamed tokens update the in-progress message live as they arrive
window.vivian.onToken((token) => {
  if (streamingIndex === -1) return;
  conversation[streamingIndex].text += token;
  setSprite("talking");
  renderConversation();
});

// Productivity interventions also show up as a message in the history
window.vivian.onIntervention((message) => {
  conversation.push({ role: "vivian", text: message });
  speechBubble.classList.add("visible");
  renderConversation();
  setSprite("stern_talking");
});

/** Redraws the whole conversation transcript inside the scrollable bubble. */
function renderConversation() {
  speechBubble.innerHTML = "";

  for (const msg of conversation) {
    const line = document.createElement("div");
    line.className = msg.role === "user" ? "msg-user" : "msg-vivian";
    line.textContent = msg.text || "...";
    speechBubble.appendChild(line);
  }

  speechBubble.scrollTop = speechBubble.scrollHeight; // auto-scroll to latest
}

/**
 * Swaps the sprite image based on emotional state, using the new
 * expression set: idle, idle_2 (alt idle), talking, stern_talking,
 * stern, confuse, soft, mlem.
 */
function setSprite(state) {
  const validStates = [
    "idle",
    "idle_2",
    "talking",
    "stern_talking",
    "stern",
    "confuse",
    "soft",
    "mlem"
  ];
  if (!validStates.includes(state)) state = "idle";
  sprite.src = `../../assets/pngtuber/${state}.png`;
}
