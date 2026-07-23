/**
 * finderTools.js
 *
 * Opens folders directly in Finder, and searches for folders by name
 * using macOS Spotlight (mdfind) when you don't know the exact path.
 */

const { exec } = require("child_process");
const fileManager = require("./fileManager");

/** Opens a known folder path directly in Finder. */
function openFolder(folderPath) {
  return new Promise((resolve, reject) => {
    const resolved = fileManager.resolvePath(folderPath);
    exec(`open "${resolved}"`, (err) => {
      if (err) return reject(new Error(`Couldn't open folder: ${resolved}`));
      resolve(resolved);
    });
  });
}

/**
 * Searches for a folder by name using Spotlight, then reveals the first
 * match in Finder (highlighted, not just opened) — for when you don't
 * know exactly where something is.
 */
function findAndRevealFolder(name) {
  return new Promise((resolve, reject) => {
    exec(`mdfind -onlyin ~ "kind:folder ${name}"`, (err, stdout) => {
      if (err) return reject(new Error(`Search failed for: ${name}`));

      const results = stdout.trim().split("\n").filter(Boolean);
      if (!results.length) {
        return reject(new Error(`Couldn't find a folder matching "${name}"`));
      }

      const firstMatch = results[0];
      exec(`open -R "${firstMatch}"`, (revealErr) => {
        if (revealErr) return reject(new Error(`Found it but couldn't reveal it: ${firstMatch}`));
        resolve(firstMatch);
      });
    });
  });
}

module.exports = { openFolder, findAndRevealFolder };
