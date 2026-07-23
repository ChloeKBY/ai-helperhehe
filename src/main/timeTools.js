/**
 * timeTools.js
 *
 * Reads the user's timezone from memory (userMemory.json's "timezone"
 * fact) and formats the current date/time in it — this is what makes
 * "what time is it?" actually correct instead of just guessing.
 */

const memoryManager = require("../memory/memoryManager");

/** Pulls the "timezone" fact out of userMemory.json, if set. */
function getUserTimezone() {
  const memory = memoryManager.load();
  const fact = memory.facts.find((f) => f.key === "timezone");
  if (!fact || !fact.value || fact.value.startsWith("PUT ")) return null;
  return fact.value.trim();
}

/** Returns a friendly current time string, e.g. "3:42 PM". */
function getCurrentTime() {
  const timezone = getUserTimezone();
  const options = { hour: "numeric", minute: "2-digit", hour12: true };
  if (timezone) options.timeZone = timezone;
  return new Date().toLocaleTimeString("en-US", options);
}

/** Returns a friendly current date string, e.g. "Wednesday, July 22". */
function getCurrentDate() {
  const timezone = getUserTimezone();
  const options = { weekday: "long", month: "long", day: "numeric" };
  if (timezone) options.timeZone = timezone;
  return new Date().toLocaleDateString("en-US", options);
}

module.exports = { getUserTimezone, getCurrentTime, getCurrentDate };
