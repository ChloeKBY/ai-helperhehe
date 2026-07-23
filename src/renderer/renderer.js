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

/**
 * The sprite PNGs have a solid flat background color baked in (not real
 * alpha transparency), so the window shows a colored box around her
 * instead of a transparent cutout. This strips that background at
 * runtime: samples the color from the image's corner pixel, then makes
 * every closely-matching pixel transparent. Results are cached per
 * source path so this only runs once per sprite, not on every swap.
 */
const transparentSpriteCache = new Map(); // original src -> processed data URL

function stripBackgroundColor(src) {
  if (transparentSpriteCache.has(src)) {
    return Promise.resolve(transparentSpriteCache.get(src));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;

      // Sample the background color from the top-left corner pixel
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];
      const TOLERANCE = 30; // allows for slight anti-aliasing/JPEG-like variance near edges

      for (let i = 0; i < data.length; i += 4) {
        const diff =
          Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
        if (diff < TOLERANCE) {
          data[i + 3] = 0; // make this pixel fully transparent
        }
      }

      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      transparentSpriteCache.set(src, dataUrl);
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Sets the sprite's actual displayed image, with the background stripped. */
async function setSpriteSrc(rawSrc) {
  try {
    const transparentSrc = await stripBackgroundColor(rawSrc);
    sprite.src = transparentSrc;
  } catch {
    sprite.src = rawSrc; // fall back to the original if processing fails for any reason
  }
}

let conversation = []; // { role: "user" | "vivian", text: string }[]
let streamingIndex = -1; // index in `conversation` currently being streamed into

// Load whatever was saved from before (persists across app restarts now)
window.vivian.getHistory().then((history) => {
  conversation = history.messages.map((m) => ({ role: m.role, text: m.text }));
});

// Show the idle sprite (background stripped) as the very first thing,
// and only THEN tell main to reveal the window — otherwise the window
// could show before the transparent version is ready, flashing the raw
// opaque-background image for a moment first.
(async () => {
  const transparentSrc = await stripBackgroundColor("../../assets/pngtuber/idle.png");
  sprite.src = transparentSrc;
  currentSpriteState = "idle";
  window.vivian.notifyRendererReady();
})();

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

  // Batch rapid pointermove events into at most one window move per
  // animation frame — without this, aggressive/fast dragging can queue up
  // far more IPC calls than the window can actually process in time,
  // causing it to keep visibly "catching up" (janky movement) even after
  // you've already released the mouse.
  let pendingDx = 0;
  let pendingDy = 0;
  let rafHandle = null;

  const flushPendingMove = () => {
    rafHandle = null;
    if (pendingDx !== 0 || pendingDy !== 0) {
      window.vivian.moveWindowBy(pendingDx, pendingDy);
      pendingDx = 0;
      pendingDy = 0;
    }
  };

  const onPointerMove = (moveEvent) => {
    const totalDx = moveEvent.screenX - dragStartX;
    const totalDy = moveEvent.screenY - dragStartY;
    if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
      isDragging = true;
    }

    if (isDragging) {
      pendingDx += moveEvent.screenX - lastX;
      pendingDy += moveEvent.screenY - lastY;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;

      if (rafHandle === null) {
        rafHandle = requestAnimationFrame(flushPendingMove);
      }
    }
  };

  const onPointerUp = (upEvent) => {
    sprite.releasePointerCapture(upEvent.pointerId);
    sprite.removeEventListener("pointermove", onPointerMove);
    sprite.removeEventListener("pointerup", onPointerUp);
    sprite.removeEventListener("pointercancel", onPointerUp);

    // Cancel any move still queued for the next frame — this is the part
    // that was missing before, letting a stray final move fire after release.
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }

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
  currentSpriteState = state;
  setSpriteSrc(`../../assets/pngtuber/${state}.png`);
}

/**
 * While she's just sitting idle (not mid-conversation), occasionally
 * swap between the two idle variants for a little life/variety, instead
 * of always showing the exact same still frame.
 */
let currentSpriteState = "idle";
let idleAlternationTimer = null;
function startIdleAlternation() {
  clearInterval(idleAlternationTimer);
  idleAlternationTimer = setInterval(() => {
    // Only swap if she's actually idle right now — don't interrupt mid-chat
    if (currentSpriteState === "idle" || currentSpriteState === "idle_2") {
      setSprite(Math.random() < 0.5 ? "idle" : "idle_2");
    }
  }, 6000 + Math.random() * 6000); // every 6-12s, a little randomized so it doesn't feel mechanical
}
startIdleAlternation();
