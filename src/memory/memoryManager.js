/**
 * memoryManager.js
 *
 * Handles loading, saving, and merging Vivian's memory about you,
 * and formatting it for injection into the model's system prompt.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_PATH = path.join(__dirname, "userMemory.json");
const PERSONAL_FACTS_PATH = path.join(__dirname, "personalFacts.json");

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

/** Loads the structured personalFacts.json (nested profile format), if present. */
function loadPersonalFacts() {
  if (!fs.existsSync(PERSONAL_FACTS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PERSONAL_FACTS_PATH, "utf-8"));
  } catch {
    return null; // corrupted file — skip it rather than crashing
  }
}

/** Flattens a nested value (string, array, or object) into readable text. */
function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join("; ");
  }
  return String(value);
}

/** Turns personalFacts.json's nested "memory" object into prompt-ready lines. */
function formatPersonalFacts() {
  const data = loadPersonalFacts();
  if (!data || !data.memory) return "";

  const lines = Object.entries(data.memory)
    .filter(([, value]) => {
      // skip empty arrays/objects/placeholder strings so blank fields
      // don't clutter the prompt before the user fills them in
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object" && value !== null) return Object.keys(value).length > 0;
      return value && !String(value).startsWith("PUT ");
    })
    .map(([key, value]) => `- ${key}: ${formatValue(value)}`);

  if (!lines.length) return "";

  const header = data.system || "User profile:";
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Formats stored facts as plain text to inject into the system prompt,
 * so the model has context about you in every conversation. Combines
 * both the flat userMemory.json facts and the structured
 * personalFacts.json profile.
 */
function formatForPrompt() {
  const memory = load();
  const flatLines = memory.facts.length
    ? memory.facts.map((f) => `- ${f.key}: ${f.value}`)
    : [];

  const personalSection = formatPersonalFacts();

  const parts = [];
  if (personalSection) parts.push(personalSection);
  if (flatLines.length) parts.push(`Additional known context:\n${flatLines.join("\n")}`);

  return parts.join("\n\n");
}

module.exports = { load, save, update, merge, formatForPrompt, loadPersonalFacts };
