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
const MODEL_NAME = "phi3:mini"; // swap to "gemma2:2b" if you want it lighter still

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
  const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\nVivian:`;

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_NAME,
      prompt: fullPrompt,
      stream: true
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

module.exports = { streamChat, chat, isOllamaRunning, MODEL_NAME };
