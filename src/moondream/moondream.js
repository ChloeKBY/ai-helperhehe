const ollamaClient = require("../ollama/ollamaClient");

async function answerQuestion(imageBuffer, question) {
  const base64Image = imageBuffer.toString("base64");
  return ollamaClient.analyzeImage(base64Image, question);
}

module.exports = { answerQuestion };
