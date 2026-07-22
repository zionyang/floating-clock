const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("hides the window until its saved position is restored", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src-tauri", "tauri.conf.json"), "utf8"));
  const mainWindow = config.app.windows.find(({ label }) => label === "main");

  assert.equal(mainWindow.visible, false);
});
