const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { getPublicSources } = require("../src/time-sources");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("uses a custom dark time-source menu instead of a native select", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(html, /<details id="sourceMenu" class="source-menu">/);
  assert.match(html, /<div id="sourceOptions" class="source-options"><\/div>/);
  assert.match(html, /<dialog id="sourceSwitchDialog" class="source-switch-dialog"/);
  assert.doesNotMatch(html, /<select id="sourceSelect"/);
  assert.match(css, /\.source-options\s*\{[\s\S]*?background:\s*var\(--color-raised\)/);
  assert.match(css, /\.source-options\s*\{[\s\S]*?max-height:\s*246px[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.source-menu:not\(\[open\]\) \.source-options\s*\{\s*display:\s*none/);
  assert.match(css, /:where\(button, input, summary\):focus-visible/);
  assert.match(app, /function selectSource\(sourceId\)/);
  assert.match(app, /function confirmSourceSwitch\(\)/);
  assert.match(app, /function resetCountdownForSourceSwitch\(\)/);
  assert.match(app, /state\.countdownTargetEpochMs !== null/);
  assert.match(app, /elements\.sourceSwitchDialog\.showModal\(\)/);
  assert.match(app, /document\.activeElement\?\.blur\(\)/);
  assert.doesNotMatch(app, /sourceSelect\.focus\(\)/);
  assert.doesNotMatch(app, /selectedOptions/);
});

test("time-source menu descriptions stay focused on the activity", () => {
  assert.deepEqual(
    getPublicSources().map(({ description }) => description),
    [
      "显示当前系统时间",
      "用于通用倒计时",
      "用于京东活动",
      "用于京东秒送活动",
      "用于美团活动",
      "用于美团闪购活动",
      "用于淘宝活动",
      "用于淘宝闪购活动",
      "用于大麦活动",
      "用于拼多多活动",
    ],
  );
});
