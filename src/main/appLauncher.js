/**
 * appLauncher.js
 *
 * Opens a macOS application by name, using the built-in `open -a` command.
 * Works for anything in /Applications (or the user's Applications folder)
 * without needing the full path — "Firefox", "Discord", etc. all work.
 */

const { exec } = require("child_process");

function openApp(appName) {
  return new Promise((resolve, reject) => {
    exec(`open -a "${appName}"`, (err) => {
      if (err) return reject(new Error(`Couldn't open "${appName}" — is it installed?`));
      resolve();
    });
  });
}

module.exports = { openApp };
