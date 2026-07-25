const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("standard time values show a precision-switch tooltip while unavailable precision stays in the footer", () => {
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
  assert.match(
    html,
    /<div class="statusbar-detail">\s*<p id="offsetStatus">本机偏移 --<\/p>\s*<p id="precisionNotice" class="precision-notice" role="status" hidden><\/p>\s*<\/div>/,
  );
  assert.match(html, /<span id="clockPrecisionTooltip" class="time-precision-tooltip" role="tooltip" hidden>显示整秒<\/span>/);
  assert.match(html, /<span id="countdownPrecisionTooltip" class="time-precision-tooltip" role="tooltip" hidden>显示整秒<\/span>/);
  assert.doesNotMatch(html, /id="clockValue"[^>]*title=/);
  assert.doesNotMatch(html, /id="countdownValue"[^>]*title=/);
  assert.match(html, /<p id="miniValue" class="mini-value">/);
  assert.match(css, /\.statusbar-detail\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\)/);
  assert.match(css, /\.statusbar \.precision-notice\s*\{[\s\S]*?color:\s*#ff6f61[\s\S]*?text-align:\s*right/);
  assert.match(css, /\.statusbar p\s*\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.statusbar p\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /\.statusbar p\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.time-value-wrapper\s*\{[\s\S]*?position:\s*relative/);
  assert.match(css, /\.time-precision-tooltip\s*\{[\s\S]*?pointer-events:\s*none[\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.time-value-toggle:hover \+ \.time-precision-tooltip,[\s\S]*?\.time-value-toggle:focus-visible \+ \.time-precision-tooltip/);
  assert.match(app, /sourcePrecision:\s*"unknown"/);
  assert.match(app, /sourceSupportsMilliseconds:\s*null/);
  assert.match(app, /timePrecisionUserChosen:\s*false/);
  assert.match(app, /precisionNotice:\s*""/);
  assert.match(app, /showMilliseconds:\s*true/);
  assert.match(app, /elements\.clockValue\.addEventListener\("click", toggleTimePrecision\)/);
  assert.match(app, /elements\.countdownValue\.addEventListener\("click", toggleTimePrecision\)/);
  assert.match(app, /if \(!state\.timePrecisionUserChosen\) \{\s*state\.showMilliseconds = syncResult\.precision === "millisecond";/);
  assert.match(app, /state\.timePrecisionUserChosen = true/);
  assert.match(app, /function canToggleTimePrecision\(\) \{\s*return state\.hasValidOffset && state\.sourcePrecision !== "unknown";/);
  assert.match(app, /function formatTimePrecision\(value\) \{\s*return state\.showMilliseconds && canToggleTimePrecision\(\) \? value : value\.replace\(/);
  assert.match(app, /if \(!canToggleTimePrecision\(\)\) \{\s*return;/);
  assert.match(app, /elements\.precisionNotice/);
  assert.match(app, /elements\.clockPrecisionTooltip/);
  assert.match(app, /elements\.countdownPrecisionTooltip/);
  assert.match(app, /tooltip\.hidden = unavailable/);
  assert.match(app, /value\.toggleAttribute\("aria-describedby", !unavailable\)/);
  assert.match(app, /function updatePrecisionNotice\(\)/);
  assert.match(app, /function getPrecisionNotice\(syncResult\)/);
  assert.match(app, /"非平台级严格毫秒"/);
  assert.match(app, /"毫秒校准失败"/);
  assert.doesNotMatch(app, /不支持毫秒/);
  assert.match(app, /precision-unavailable/);
  assert.match(app, /\? "显示整秒"\s*:\s*"显示毫秒"/);
  assert.doesNotMatch(app, /element\.title\s*=/);
  assert.doesNotMatch(app, /elements\.miniValue\.addEventListener/);
});

test("countdown keeps the selected source offset instead of switching to Beijing time", () => {
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(app, /const sourceNow = Date\.now\(\) \+ state\.offsetMs;/);
  assert.match(app, /const remainingMs = state\.countdownTargetEpochMs - sourceNow;/);
  assert.doesNotMatch(app, /syncSource\(["']beijing["']\)/);
});
