/**
 * moondream.js
 *
 * NOTE: despite the filename, this now calls whatever VISION_MODEL_NAME
 * is set to in ollamaClient.js — currently gemma3:4b, not Moondream.
 * Kept the filename to avoid churning every import across the codebase;
 * feel free to rename later if it bugs you.
 */
const ollamaClient = require("../ollama/ollamaClient");

async function answerQuestion(imageBuffer, question) {
  const base64Image = imageBuffer.toString("base64");
  return ollamaClient.analyzeImage(base64Image, question);
}

module.exports = { answerQuestion };
