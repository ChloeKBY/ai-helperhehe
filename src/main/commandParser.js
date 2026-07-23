/**
 * commandParser.js
 *
 * Looks at what the user typed BEFORE sending it to the LLM. If it matches
 * a recognizable command pattern (move a file, set a reminder), it handles
 * it directly using fileManager/reminders and returns a confirmation
 * message — so "remind me to drink water in 10 minutes" actually sets a
 * timer, instead of the model just chatting about reminders without doing
 * anything.
 *
 * If nothing matches, returns null and the message goes to the LLM as normal.
 */

const fileManager = require("./fileManager");
const reminders = require("./reminders");

const TIME_UNIT_MS = {
  second: 1000,
  seconds: 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000
};

/**
 * Tries to parse and execute a command from the user's message.
 * @returns {string|null} a confirmation message if a command matched, else null
 */
function tryHandleCommand(message) {
  // "remind me to X in Y minutes/seconds/hours"
  const reminderMatch = message.match(
    /remind me to (.+?) in (\d+)\s*(second|seconds|minute|minutes|hour|hours)/i
  );
  if (reminderMatch) {
    const [, task, amountStr, unit] = reminderMatch;
    const amount = parseInt(amountStr, 10);
    const delayMs = amount * TIME_UNIT_MS[unit.toLowerCase()];

    reminders.setReminder(task.trim(), delayMs);
    return `O-okay! I'll remind you to ${task.trim()} in ${amount} ${unit}.`;
  }

  // "remind me to X every Y minutes/hours" (repeating)
  const repeatingMatch = message.match(
    /remind me to (.+?) every (\d+)\s*(second|seconds|minute|minutes|hour|hours)/i
  );
  if (repeatingMatch) {
    const [, task, amountStr, unit] = repeatingMatch;
    const amount = parseInt(amountStr, 10);
    const intervalMs = amount * TIME_UNIT_MS[unit.toLowerCase()];

    reminders.setRepeatingReminder(task.trim(), intervalMs);
    return `G-got it, I'll remind you to ${task.trim()} every ${amount} ${unit} from now on.`;
  }

  // "move FILE to DESTINATION"
  const moveMatch = message.match(/move (.+?) to (.+)/i);
  if (moveMatch) {
    const [, source, dest] = moveMatch;
    try {
      const result = fileManager.moveFile(source.trim(), dest.trim());
      return `Moved it! ${result.from} -> ${result.to}`;
    } catch (err) {
      return `Um, I couldn't move that: ${err.message}`;
    }
  }

  // "organize FOLDER" / "clean up FOLDER"
  const organizeMatch = message.match(/(?:organize|clean up|sort) (.+)/i);
  if (organizeMatch) {
    const [, folder] = organizeMatch;
    try {
      const moved = fileManager.organizeFolderByType(folder.trim());
      if (moved.length === 0) {
        return `I looked through ${folder.trim()} but didn't find anything I recognized to sort.`;
      }
      return `Sorted ${moved.length} file(s) in ${folder.trim()} into folders by type!`;
    } catch (err) {
      return `Um, I couldn't organize that: ${err.message}`;
    }
  }

  return null; // no command matched — let the LLM handle it normally
}

module.exports = { tryHandleCommand };
