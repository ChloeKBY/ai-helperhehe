/**
 * siteBlocker.js
 *
 * Blocks a specific DOMAIN (not the whole browser) by redirecting it to
 * 127.0.0.1 in /etc/hosts — the domain simply fails to load ("can't
 * connect") for as long as the entry is in place, while every other site
 * and app works completely normally.
 *
 * Modifying /etc/hosts requires admin rights, so this will show a native
 * macOS password prompt the first time it runs (via AppleScript's "with
 * administrator privileges") — that's expected, not a bug.
 */

const { exec } = require("child_process");

const HOSTS_PATH = "/etc/hosts";
const TAG = "# added-by-evie-site-blocker"; // marks our lines so we can cleanly remove them later

function run(shellCommand) {
  return new Promise((resolve, reject) => {
    // Escape double-quotes so the shell command survives being wrapped in
    // AppleScript's own double-quoted string.
    const escaped = shellCommand.replace(/"/g, '\\"');
    exec(
      `osascript -e 'do shell script "${escaped}" with administrator privileges'`,
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      }
    );
  });
}

/**
 * Blocks a domain (and its www. variant) for durationMs, then automatically
 * removes the block. Returns a function to cancel the block early.
 */
async function blockDomain(domain, durationMs) {
  const line1 = `127.0.0.1 ${domain} ${TAG}`;
  const line2 = `127.0.0.1 www.${domain} ${TAG}`;

  await run(
    `echo "${line1}" >> ${HOSTS_PATH} && echo "${line2}" >> ${HOSTS_PATH} && dscacheutil -flushcache && killall -HUP mDNSResponder`
  );

  const timeoutHandle = setTimeout(() => {
    unblockDomain(domain).catch((err) =>
      console.warn("Failed to auto-unblock domain:", err.message)
    );
  }, durationMs);

  return () => {
    clearTimeout(timeoutHandle);
    return unblockDomain(domain);
  };
}

/** Removes all of our tagged lines for this domain from /etc/hosts. */
async function unblockDomain(domain) {
  // Rebuilds /etc/hosts without any line containing both our tag AND this domain.
  await run(
    `grep -v "${TAG}" ${HOSTS_PATH} > /tmp/hosts_evie_tmp && mv /tmp/hosts_evie_tmp ${HOSTS_PATH} && dscacheutil -flushcache && killall -HUP mDNSResponder`
  );
}

module.exports = { blockDomain, unblockDomain };
