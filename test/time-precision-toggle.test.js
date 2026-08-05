const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("standard time values keep precision controls while status stays compact", () => {
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
  assert.match(html, /<footer class="statusbar">\s*<p id="syncStatus">准备校准<\/p>\s*<\/footer>/);
  assert.doesNotMatch(html, /id="offsetStatus"|id="precisionNotice"/);
  assert.match(html, /<span id="clockPrecisionTooltip" class="time-precision-tooltip" role="tooltip" hidden>显示整秒<\/span>/);
  assert.match(html, /<span id="countdownPrecisionTooltip" class="time-precision-tooltip" role="tooltip" hidden>显示整秒<\/span>/);
  assert.doesNotMatch(html, /id="clockValue"[^>]*title=/);
  assert.doesNotMatch(html, /id="countdownValue"[^>]*title=/);
  assert.match(html, /<p id="miniValue" class="mini-value">/);
  assert.match(css, /\.statusbar p\s*\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.statusbar p\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /\.statusbar p\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.time-value-wrapper\s*\{[\s\S]*?position:\s*relative/);
  assert.match(css, /\.time-precision-tooltip\s*\{[\s\S]*?pointer-events:\s*none[\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.time-value-toggle:hover \+ \.time-precision-tooltip,[\s\S]*?\.time-value-toggle:focus-visible \+ \.time-precision-tooltip/);
  assert.match(app, /sourcePrecision:\s*"unknown"/);
  assert.match(app, /sourceSupportsMilliseconds:\s*null/);
  assert.match(app, /showMilliseconds:\s*true/);
  assert.match(app, /elements\.clockValue\.addEventListener\("click", toggleTimePrecision\)/);
  assert.match(app, /elements\.countdownValue\.addEventListener\("click", toggleTimePrecision\)/);
  assert.match(app, /elements\.syncStatus\.addEventListener\("click", toggleSyncDetails\)/);
  assert.match(app, /event\.detail !== 3/);
  assert.match(app, /state\.showSyncDetails = !state\.showSyncDetails/);
  assert.match(app, /const hadValidOffset = state\.hasValidOffset;/);
  assert.match(app, /state\.showMilliseconds = getDisplayPrecision\(/);
  assert.match(app, /function canToggleTimePrecision\(\) \{\s*return hasDisplayTimeBasis\(\) && state\.sourcePrecision !== "unknown";/);
  assert.match(app, /function formatTimePrecision\(value\) \{\s*return formatTimeValue\(value, state\.showMilliseconds, hasDisplayTimeBasis\(\)\);/);
  assert.match(app, /function hasDisplayTimeBasis\(\) \{\s*return isLocalTimeSource\(\) \|\| state\.hasValidOffset;/);
  assert.match(app, /if \(!canToggleTimePrecision\(\)\) \{\s*return;/);
  assert.match(app, /elements\.clockPrecisionTooltip/);
  assert.match(app, /elements\.countdownPrecisionTooltip/);
  assert.match(app, /tooltip\.hidden = unavailable/);
  assert.match(app, /value\.toggleAttribute\("aria-describedby", !unavailable\)/);
  assert.match(app, /function getSyncStatus\(syncResult\)/);
  assert.match(app, /"已同步，精度不足"/);
  assert.match(app, /"已同步，已降级"/);
  assert.match(app, /校准失败，沿用上次结果/);
  assert.match(app, /"本机时间 · 未校准"/);
  assert.match(app, /function formatSyncDetails\(details\)/);
  assert.match(app, /details\.strategyLabel/);
  assert.match(app, /details\.roundTripMs/);
  assert.match(app, /details\.uncertaintyMs/);
  assert.match(app, /formatSignedMs\(details\.offsetMs\)/);
  assert.match(css, /\.statusbar #syncStatus\s*\{[\s\S]*?cursor:\s*default/);
  assert.match(css, /\.statusbar #syncStatus\.sync-status-details\s*\{[\s\S]*?white-space:\s*pre-line/);
  assert.doesNotMatch(app, /不支持毫秒/);
  assert.match(app, /precision-unavailable/);
  assert.match(app, /\? "显示整秒"\s*:\s*"显示毫秒"/);
  assert.doesNotMatch(app, /element\.title\s*=/);
  assert.doesNotMatch(app, /elements\.miniValue\.addEventListener/);
});

test("sync details reserve the statusbar height instead of moving the time panel", () => {
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");

  assert.match(css, /\.statusbar\s*\{[\s\S]*?height:\s*42px[\s\S]*?min-height:\s*42px/);
  assert.match(css, /\.statusbar #syncStatus\.sync-status-details\s*\{[\s\S]*?white-space:\s*pre-line[\s\S]*?line-height:\s*1\.5/);
});

test("countdown keeps the selected source offset instead of switching to Beijing time", () => {
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(app, /const sourceNow = Date\.now\(\) \+ state\.offsetMs;/);
  assert.match(app, /const remainingMs = state\.countdownTargetEpochMs - sourceNow;/);
  assert.doesNotMatch(app, /syncSource\(["']beijing["']\)/);
});

test("countdown target is prominent and uses a generic label", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(html, /<span id="targetTimeZoneLabel">目标时间<\/span>/);
  assert.match(html, /<button id="targetPickerTrigger"[^>]*type="button"/);
  assert.match(html, /<div id="targetPickerShield"[^>]*hidden/);
  assert.doesNotMatch(app, /目标北京时间|目标本机时间/);
  assert.match(app, /elements\.targetPickerTrigger\.addEventListener\("click", openTargetPicker\)/);
  assert.match(app, /elements\.targetInput\.addEventListener\("input", flashTargetInput\)/);
  assert.match(app, /elements\.targetInput\.addEventListener\("change", handleTargetInputChange\)/);
  assert.match(app, /function flashTargetInput\(\)\s*\{[\s\S]*?target-changed[\s\S]*?\}/);
  assert.match(app, /elements\.targetInput\.classList\.remove\("target-changed"\)/);
  assert.match(app, /elements\.targetInput\.classList\.add\("target-changed"\)/);
  assert.match(css, /\.target-row\s*\{[\s\S]*?padding-left:\s*8px[\s\S]*?border-left:\s*3px solid var\(--color-accent\)/);
  assert.match(css, /\.target-row input\s*\{[\s\S]*?height:\s*32px[\s\S]*?font-size:\s*14px[\s\S]*?font-weight:\s*700[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(css, /\.target-row\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.target-row input\.target-changed\s*\{[\s\S]*?animation:\s*target-change-pulse/);
  assert.match(css, /@keyframes target-change-pulse[\s\S]*?box-shadow:/);
  assert.doesNotMatch(css, /\.target-input-wrap:focus-within input\s*\{[^}]*box-shadow:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.target-row input\.target-changed[\s\S]*?animation:\s*none/);
  assert.match(css, /\.target-picker-shield\s*\{[\s\S]*?position:\s*fixed[\s\S]*?pointer-events:\s*auto/);
  assert.match(css, /\.target-picker-shield\[hidden\]\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(app, /suppressTargetPickerOutsideEvent/);
});

test("target picker can re-arm after it was dismissed", () => {
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");
  const pickerOpener = app.match(
    /function openTargetPicker\([^)]*\) \{[\s\S]*?\n\}/,
  )?.[0];
  const pickerCloser = app.match(
    /function closeTargetPicker\(\) \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(pickerOpener);
  assert.ok(pickerCloser);

  const state = { targetPickerOpen: false };
  const elements = {
    targetInput: {
      focus: () => {},
      blur: () => {},
      showPicker: () => {},
    },
    targetPickerShield: {
      hidden: true,
      setAttribute: () => {},
    },
    targetPickerTrigger: {
      setAttribute: () => {},
    },
  };
  const context = { elements, state };
  const openTargetPicker = vm.runInNewContext(`(${pickerOpener})`, context);
  const closeTargetPicker = vm.runInNewContext(`(${pickerCloser})`, context);
  openTargetPicker({ preventDefault: () => {} });
  assert.equal(state.targetPickerOpen, true);
  closeTargetPicker();
  assert.equal(state.targetPickerOpen, false);
  openTargetPicker({ preventDefault: () => {} });
  assert.equal(state.targetPickerOpen, true);
});

test("target picker shield consumes outside activation", () => {
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");
  const pickerHandler = app.match(
    /function dismissTargetPicker\(event\) \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(pickerHandler);

  let prevented = 0;
  let stopped = 0;
  let closed = 0;
  const context = {
    closeTargetPicker: () => {
      closed += 1;
    },
  };
  const suppressOutsideEvent = vm.runInNewContext(`(${pickerHandler})`, context);
  const outsideEvent = {
    preventDefault: () => {
      prevented += 1;
    },
    stopImmediatePropagation: () => {
      stopped += 1;
    },
  };

  suppressOutsideEvent(outsideEvent);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(closed, 1);
});
