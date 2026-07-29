const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("uses a custom dark time-source menu instead of a native select", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(html, /<details id="sourceMenu" class="source-menu">/);
  assert.match(html, /<div id="sourceOptions" class="source-options"><\/div>/);
  assert.doesNotMatch(html, /<select id="sourceSelect"/);
  assert.match(css, /\.source-options\s*\{[\s\S]*?background:\s*var\(--color-raised\)/);
  assert.match(css, /\.source-menu:not\(\[open\]\) \.source-options\s*\{\s*display:\s*none/);
  assert.match(css, /:where\(button, input, summary\):focus-visible/);
  assert.match(app, /function selectSource\(sourceId\)/);
  assert.match(app, /document\.activeElement\?\.blur\(\)/);
  assert.doesNotMatch(app, /sourceSelect\.focus\(\)/);
  assert.doesNotMatch(app, /selectedOptions/);
});
