const { exec } = require("child_process");

function blockFirefox() {
  exec("pkill Firefox", (err) => {
    if (err) console.log("Firefox was not running.");
  });

  console.log("Firefox blocked.");
}

module.exports = { blockFirefox };
