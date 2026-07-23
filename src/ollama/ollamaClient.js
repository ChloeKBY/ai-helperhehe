/**
 * ollamaClient.js
 *
 * Talks to a locally running Ollama instance (http://localhost:11434).
 * No API key required — this replaces the paid Claude API call with a
 * free local model call.
 *
 * Requires: `ollama pull phi3:mini` to have been run once on the machine.
 * Also requires Ollama itself to be installed and running as a background
 * service (the Ollama app / `ollama serve`).
 */

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "gemma3:4b"; // handles both chat AND vision — one model for everything now

/**
 * Sends a prompt to the local model and streams the response back
 * chunk-by-chunk via the onToken callback.
 *
 * @param {string} systemPrompt - personality + injected memory
 * @param {string} userMessage - what the user just said
 * @param {(token: string) => void} onToken - called for each streamed chunk
 * @returns {Promise<string>} the full assembled response
 */
async function streamChat(systemPrompt, userMessage, onToken) {
  const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\nEvie:`;

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_NAME,
      prompt: fullPrompt,
      stream: true,
      options: {
        num_predict: 80, // hard cap on response length — keeps her replies short and snappy
        stop: ["\nUser:", "\nuser:", "User:", "\nEvie:", "---", "Now let's"] // prevents the model from hallucinating fake continuations of the conversation
      }
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line for next chunk

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.response) {
          fullText += parsed.response;
          onToken(parsed.response);
        }
      } catch (err) {
        // Malformed chunk — skip it rather than crashing the stream
        console.warn("Skipped malformed Ollama chunk:", line);
      }
    }
  }

  return fullText;
}

/**
 * One-shot (non-streaming) version, useful for things like screen
 * analysis where you just want a final verdict, not token-by-token.
 */
async function chat(systemPrompt, userMessage) {
  let full = "";
  await streamChat(systemPrompt, userMessage, (token) => {
    full += token;
  });
  return full;
}

/**
 * Checks whether Ollama is actually running before we try to use it.
 * Useful to show a friendly error in the UI instead of a raw fetch failure.
 */
async function isOllamaRunning() {
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    return res.ok;
  } catch {
    return false;
  }
}

const VISION_MODEL_NAME = "gemma3:4b"; // same model as chat now — no separate vision model needed

/**
 * Sends a base64-encoded screenshot to a local vision model for a judgment
 * call (e.g. "is this person studying or procrastinating?"). One-shot,
 * not streamed, since we just want a short verdict.
 *
 * Requires: `ollama pull moondream` (or swap MODEL_NAME to "llava-phi3").
 *
 * @param {string} base64Image - image data WITHOUT the data:image/... prefix
 * @param {string} question - what to ask about the image
 * @returns {Promise<string>} the model's answer
 */
async function analyzeImage(base64Image, question) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL_NAME,
      prompt: question,
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0 // deterministic, less prone to random yes/no guessing
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama vision request failed: ${response.status}`);
  }

  const data = await response.json();
  console.log("[ollamaClient] full vision response:", JSON.stringify(data)); // remove once debugged
  return data.response || "";
}

module.exports = {
  streamChat,
  chat,
  isOllamaRunning,
  analyzeImage,
  MODEL_NAME,
  VISION_MODEL_NAME
};
