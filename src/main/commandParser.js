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
const { openApp } = require("./appLauncher");
const windowManager = require("./windowManager");
const finderTools = require("./finderTools");
const webTools = require("./webTools");
const timeTools = require("./timeTools");

const TIME_UNIT_MS = {
  second: 1000,
  seconds: 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000
};

/**
 * Checks if "open X" actually means a website, Wikipedia article, or
 * folder, rather than launching a Mac app. Returns a reply string if
 * handled, or null to fall through to opening it as an app.
 */
async function tryHandleWebOrFolderOpen(appName) {
  const lower = appName
    .toLowerCase()
    .replace(/\s*(for me|please|for me please)$/i, "")
    .replace(/\s*(in|on) firefox$/i, "")
    .trim();

  // "open the wikipedia page about OCTOPUSES" / "open wikipedia page on X"
  const wikiArticleMatch = lower.match(/^(?:the )?wikipedia page (?:about|on|for) (.+)/i);
  if (wikiArticleMatch) {
    const subject = wikiArticleMatch[1];
    try {
      await webTools.openWikipediaArticle(subject);
      return `O-okay, opening the Wikipedia page for "${subject}"...!`;
    } catch (err) {
      return `Um, ${err.message}`;
    }
  }

  // "open wikipedia" / "open pinterest" / any known site name
  if (webTools.KNOWN_SITES[lower]) {
    try {
      await webTools.openKnownSite(lower);
      return `O-okay, opening ${lower}...!`;
    } catch (err) {
      return `Um, ${err.message}`;
    }
  }

  // "open folder X" / "open the X folder"
  const folderMatch = lower.match(/^folder (.+)/i) || lower.match(/^(.+) folder$/i);
  if (folderMatch) {
    const folderName = folderMatch[1].trim();
    try {
      await finderTools.openFolder(folderName);
      return `O-okay, opening the ${folderName} folder...!`;
    } catch (err) {
      return `Um, ${err.message}`;
    }
  }

  return null; // not a website/folder — treat as a regular app name
}

/** Strips common polite/filler openers AND trailing punctuation so patterns match cleanly. */
function stripFiller(message) {
  return message
    .replace(/^(can you|could you|would you|please|hey evie,?|evie,?)\s*/i, "")
    .replace(/[?!.]+$/, "") // trailing punctuation, e.g. "open VLC?" -> "open VLC"
    .trim();
}

/**
 * Tries to parse and execute a command from the user's message.
 * @returns {Promise<string|null>} a confirmation message if a command matched, else null
 */
async function tryHandleCommand(rawMessage) {
  const message = stripFiller(rawMessage);

  // "open X" — launches an app by name (matches anywhere in the sentence,
  // e.g. "hey uh, can you open Firefox for me" still works now)
  const openMatch = message.match(/\bopen (?:up )?(?:the )?(.+?)(?:\.app)?[?!.]*$/i);
  if (openMatch) {
    const [, rawAppName] = openMatch;
    const appName = rawAppName.replace(/[?!.,]+$/, "").trim();

    // Before treating this as "launch an app", check if it's actually one
    // of the web/folder shortcuts below (they also start with "open").
    const websiteReply = await tryHandleWebOrFolderOpen(appName);
    if (websiteReply !== null) return websiteReply;

    try {
      await openApp(appName);
      return `O-okay, opening ${appName}...!`;
    } catch (err) {
      return `Eep— ${err.message}`;
    }
  }

  // "quit X" / "close X" — closes an app entirely
  const quitMatch = message.match(/\b(?:quit|close) (?:the )?(.+?)(?:\.app)?[?!.]*$/i);
  if (quitMatch) {
    const [, rawAppName] = quitMatch;
    const appName = rawAppName.replace(/[?!.,]+$/, "").trim();

    // "close this window" / "close the window" means the frontmost window,
    // not an app named "window" or "this"
    if (/^(this|the)?\s*window$/i.test(appName)) {
      try {
        await windowManager.closeFrontmostWindow();
        return "O-okay, closing that window...!";
      } catch (err) {
        return `Um, I couldn't close that: ${err.message}`;
      }
    }

    try {
      await windowManager.quitApp(appName);
      return `A-alright, quitting ${appName}...`;
    } catch (err) {
      return `Eep— couldn't quit ${appName}: ${err.message}`;
    }
  }

  // "move the window to X" (corner positions)
  const moveWindowMatch = message.match(
    /move (?:the )?window to (?:the )?(top.left|top.right|bottom.left|bottom.right|center)/i
  );
  if (moveWindowMatch) {
    const position = moveWindowMatch[1].toLowerCase().replace(/\s+/g, "-");
    try {
      await windowManager.moveFrontmostWindowTo(position);
      return `M-moved it to the ${position.replace("-", " ")}!`;
    } catch (err) {
      return `Um, I couldn't move that window: ${err.message}`;
    }
  }

  // "show the dock" / "hide the dock"
  const dockMatch = message.match(/\b(show|hide) (?:the )?dock\b/i);
  if (dockMatch) {
    const wantVisible = dockMatch[1].toLowerCase() === "show";
    try {
      await windowManager.setDockVisible(wantVisible);
      return wantVisible ? "There we go, dock's back!" : "O-okay, hiding the dock...";
    } catch (err) {
      return `Um, something went wrong with the dock: ${err.message}`;
    }
  }

  // "find TERM in finder" — Spotlight search + reveal
  const findMatch = message.match(/find (.+?) in finder/i);
  if (findMatch) {
    const [, term] = findMatch;
    try {
      const found = await finderTools.findAndRevealFolder(term.trim());
      return `F-found it! ${found}`;
    } catch (err) {
      return `Um, ${err.message}`;
    }
  }

  // "google X" / "search for X"
  const googleMatch = message.match(/\b(?:google|search for) (.+?)[?!.]*$/i);
  if (googleMatch) {
    const [, query] = googleMatch;
    try {
      await webTools.googleSearch(query.trim());
      return `O-okay, searching for "${query.trim()}"...!`;
    } catch (err) {
      return `Um, ${err.message}`;
    }
  }

  // "what time is it" / "what day is it" / "what's the date"
  if (/what (?:time|day|date)/i.test(message) || /what's the (?:time|date)/i.test(message)) {
    const timezone = timeTools.getUserTimezone();
    if (!timezone) {
      return "Um... I don't actually know your timezone yet! You can set it in userMemory.json.";
    }
    const time = timeTools.getCurrentTime();
    const date = timeTools.getCurrentDate();
    return `I-it's ${time} on ${date}!`;
  }

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

  // File move — covers several natural phrasings:
  //   "move X to Y"
  //   "move X from Y to Z"          (source folder ignored — X is resolved as typed)
  //   "put X on/in Y" / "put X on my Y"
  //   "send X to Y"
  //   "grab X from Y and put it on Z" / "...move it to Z"
  const moveDestPatterns = [
    /move (.+?) from .+? to (?:my |the )?(.+)/i,
    /move (.+?) to (?:my |the )?(.+)/i,
    /put (.+?) (?:on|in) (?:my |the )?(.+)/i,
    /send (.+?) to (?:my |the )?(.+)/i,
    /grab (.+?) from .+? and (?:put it (?:on|in)|move it to) (?:my |the )?(.+)/i
  ];

  for (const pattern of moveDestPatterns) {
    const match = message.match(pattern);
    if (match) {
      const [, source, dest] = match;
      try {
        const result = fileManager.moveFile(source.trim(), dest.trim());
        return `Moved it! ${result.from} -> ${result.to}`;
      } catch (err) {
        return `Um, I couldn't move that: ${err.message}`;
      }
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
