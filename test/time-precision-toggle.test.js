const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("standard time values use repeatable in-app precision tooltips while Mini only inherits the state", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(
    html,
    /<button id="clockValue" class="time-value time-value-toggle" type="button" aria-describedby="clockPrecisionTooltip" aria-label="显示整秒">/,
  );
  assert.match(
    html,
    /<button id="countdownValue" class="time-value time-value-toggle countdown-value" type="button" aria-describedby="countdownPrecisionTooltip" aria-label="显示整秒">/,
  );
  assert.match(html, /<span id="clockPrecisionTooltip" class="time-precision-tooltip" role="tooltip">显示整秒<\/span>/);
  assert.match(html, /<span id="countdownPrecisionTooltip" class="time-precision-tooltip" role="tooltip">显示整秒<\/span>/);
  assert.doesNotMatch(html, /id="clockValue"[^>]*title=/);
  assert.doesNotMatch(html, /id="countdownValue"[^>]*title=/);
  assert.match(html, /<p id="miniValue" class="mini-value">/);
  assert.match(css, /\.time-value-wrapper\s*\{[\s\S]*?position:\s*relative/);
  assert.match(css, /\.time-precision-tooltip\s*\{[\s\S]*?pointer-events:\s*none[\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.time-value-toggle:hover \+ \.time-precision-tooltip,[\s\S]*?\.time-value-toggle:focus-visible \+ \.time-precision-tooltip/);
  assert.match(css, /transition-delay:\s*400ms, 400ms, 0s/);
  assert.match(app, /showMilliseconds:\s*true/);
  assert.match(app, /elements\.clockValue\.addEventListener\("click", toggleTimePrecision\)/);
  assert.match(app, /elements\.countdownValue\.addEventListener\("click", toggleTimePrecision\)/);
  assert.match(app, /function formatTimePrecision\(value\) \{\s*return state\.showMilliseconds \? value : value\.replace\(/);
  assert.match(app, /elements\.clockPrecisionTooltip/);
  assert.match(app, /elements\.countdownPrecisionTooltip/);
  assert.match(app, /\? "显示整秒"\s*:\s*"显示毫秒"/);
  assert.doesNotMatch(app, /element\.title\s*=/);
  assert.doesNotMatch(app, /elements\.miniValue\.addEventListener/);
});
