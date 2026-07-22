/**
 * memoryManager.js
 *
 * Handles loading, saving, and merging Vivian's memory about you,
 * and formatting it for injection into the model's system prompt.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_PATH = path.join(__dirname, "userMemory.json");

/** Loads the memory file, creating a blank one if it doesn't exist yet. */
function load() {
  if (!fs.existsSync(MEMORY_PATH)) {
    const blank = { facts: [] };
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(blank, null, 2));
    return blank;
  }
  const raw = fs.readFileSync(MEMORY_PATH, "utf-8");
  return JSON.parse(raw);
}

/** Overwrites the memory file with the given object. */
function save(memoryObj) {
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memoryObj, null, 2));
}

/** Adds a new fact (or updates an existing one with the same key). */
function update(key, value) {
  const memory = load();
  const existingIndex = memory.facts.findIndex((f) => f.key === key);
  if (existingIndex >= 0) {
    memory.facts[existingIndex].value = value;
  } else {
    memory.facts.push({ key, value });
  }
  save(memory);
  return memory;
}

/** Merges an array of {key, value} facts into memory in one go. */
function merge(newFacts) {
  const memory = load();
  for (const { key, value } of newFacts) {
    const idx = memory.facts.findIndex((f) => f.key === key);
    if (idx >= 0) memory.facts[idx].value = value;
    else memory.facts.push({ key, value });
  }
  save(memory);
  return memory;
}

/**
 * Formats stored facts as plain text to inject into the system prompt,
 * so the model has context about you in every conversation.
 */
function formatForPrompt() {
  const memory = load();
  if (!memory.facts.length) return "";
  const lines = memory.facts.map((f) => `- ${f.key}: ${f.value}`);
  return `Known context about the user:\n${lines.join("\n")}`;
}

module.exports = { load, save, update, merge, formatForPrompt };
