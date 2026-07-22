const { exec } = require("child_process");

function blockFirefox() {
  exec("pkill Firefox", () => {});
}

module.exports = { blockFirefox };
