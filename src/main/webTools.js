/**
 * webTools.js
 *
 * Opens websites in Firefox — Google searches, known sites by name
 * ("open wikipedia", "open pinterest"), and specific Wikipedia articles
 * ("open the wikipedia page about octopuses").
 */

const { exec } = require("child_process");

// Common sites you can call by name instead of typing the full URL.
// Add more here any time you want a new shortcut.
const KNOWN_SITES = {
  wikipedia: "https://en.wikipedia.org",
  pinterest: "https://www.pinterest.com",
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  reddit: "https://www.reddit.com",
  notion: "https://www.notion.so",
  "character.ai": "https://character.ai",
  "c.ai": "https://character.ai",
  discord: "https://discord.com/app",
  twitter: "https://twitter.com",
  x: "https://twitter.com",
  gmail: "https://mail.google.com",
  github: "https://github.com"
};

function openUrlInFirefox(url) {
  return new Promise((resolve, reject) => {
    exec(`open -a Firefox "${url}"`, (err) => {
      if (err) return reject(new Error(`Couldn't open ${url} in Firefox.`));
      resolve(url);
    });
  });
}

/** Opens a Google search for the given query. */
function googleSearch(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return openUrlInFirefox(url);
}

/** Opens a known site by name, e.g. "wikipedia", "pinterest". */
function openKnownSite(siteName) {
  const key = siteName.toLowerCase().trim();
  const url = KNOWN_SITES[key];
  if (!url) return Promise.reject(new Error(`I don't know a site called "${siteName}" yet.`));
  return openUrlInFirefox(url);
}

/** Opens a specific Wikipedia article by subject name. */
function openWikipediaArticle(subject) {
  const title = subject.trim().replace(/\s+/g, "_");
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  return openUrlInFirefox(url);
}

module.exports = { googleSearch, openKnownSite, openWikipediaArticle, openUrlInFirefox, KNOWN_SITES };
