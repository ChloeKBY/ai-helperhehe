/**
 * renderer.js
 *
 * Runs in the sandboxed renderer process. Only talks to the outside world
 * via window.vivian (exposed by preload.js) — no direct Node/Electron access.
 */

const chatBubble = document.getElementById("chatBubble");
const sprite = document.getElementById("sprite");

let currentResponse = "";

// Listen for streamed tokens as the model generates them
window.vivian.onToken((token) => {
  currentResponse += token;
  chatBubble.textContent = currentResponse;
  chatBubble.scrollTop = chatBubble.scrollHeight;
});

/**
 * Call this to send a message to Vivian. Wire this up to whatever input
 * method you add later (a text box, a global hotkey, voice input, etc.)
 */
async function sendToVivian(message) {
  currentResponse = "";
  setSprite("thinking");

  const result = await window.vivian.sendMessage(message);

  if (result.error) {
    chatBubble.textContent = `(${result.error})`;
    setSprite("stern");
    return;
  }

  setSprite("idle");
}

/** Swaps the sprite image based on emotional state. */
function setSprite(state) {
  const validStates = ["idle", "thinking", "stern", "excited", "disappointed"];
  if (!validStates.includes(state)) state = "idle";
  sprite.src = `../../assets/pngtuber/${state}.png`;
}

// Still exposed for DevTools testing/debugging if needed
window.sendToVivian = sendToVivian;

/* ---------- Wire up the actual input bar ---------- */
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

function handleSend() {
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  sendToVivian(message);
}

sendBtn.addEventListener("click", handleSend);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

// Show a message in the chat bubble whenever the productivity watcher steps in
window.vivian.onIntervention((message) => {
  currentResponse = message;
  chatBubble.textContent = currentResponse;
  setSprite("stern");
});
