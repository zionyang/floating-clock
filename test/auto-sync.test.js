const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("automatically recalibrates the selected source every ten minutes", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "app.js"), "utf8");

  assert.match(app, /const AUTO_SYNC_INTERVAL_MS = 10 \* 60_000;/);
  assert.match(app, /window\.setInterval\(syncSelectedSource, AUTO_SYNC_INTERVAL_MS\)/);
  assert.doesNotMatch(app, /window\.setInterval\(syncSelectedSource, 60_000\)/);
});
