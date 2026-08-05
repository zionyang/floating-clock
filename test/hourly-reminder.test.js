const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererDir = path.join(__dirname, "..", "src", "renderer");
const html = fs.readFileSync(path.join(rendererDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(rendererDir, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(rendererDir, "app.js"), "utf8");

test("整点提醒使用独立弹出层，不改变固定布局", () => {
  assert.match(html, /<details id="reminderMenu" class="reminder-menu">/);
  assert.match(html, /<summary id="reminderSelect" class="reminder-select"[^>]*>🔔<\/summary>/);
  assert.doesNotMatch(html, /class="reminder-title"/);
  assert.match(html, /id="hourlyHighlightToggle"[^>]*type="checkbox"[^>]*role="switch"/);
  assert.match(html, /id="hourlyChimeToggle"[^>]*type="checkbox"[^>]*role="switch"/);
  assert.match(css, /\.reminder-menu\s*\{[\s\S]*?position:\s*absolute[\s\S]*?right:\s*44px[\s\S]*?bottom:\s*12px/);
  assert.match(css, /\.reminder-options\s*\{[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*calc\(100% \+ 8px\)/);
  assert.match(css, /\.reminder-select\.active\s*\{[\s\S]*?border:\s*1px solid rgba\(var\(--color-accent-rgb\), 0\.76\)[\s\S]*?background:\s*rgba\(var\(--color-accent-rgb\), 0\.22\)[\s\S]*?box-shadow:/);
  assert.match(css, /\.statusbar\s*\{[\s\S]*?height:\s*42px[\s\S]*?min-height:\s*42px/);
});

test("两个开关独立持久化，且高亮开关不影响倒计时警告", () => {
  assert.match(app, /hourlyHighlight:\s*"floatingClock\.hourlyHighlight"/);
  assert.match(app, /hourlyChime:\s*"floatingClock\.hourlyChime"/);
  assert.match(app, /hourlyHighlightEnabled:\s*readStoredBoolean\(STORAGE_KEYS\.hourlyHighlight, true\)/);
  assert.match(app, /hourlyChimeEnabled:\s*readStoredBoolean\(STORAGE_KEYS\.hourlyChime, false\)/);
  assert.match(app, /const clockCritical = state\.hourlyHighlightEnabled && isClockCritical\(sourceNow\)/);
  assert.match(app, /countdownCritical = remainingMs <= CRITICAL_WINDOW_MS/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.hourlyHighlight, String\(enabled\)\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.hourlyChime, String\(enabled\)\)/);
});

test("整点报时只在时钟界面跨过整点时触发一次", () => {
  assert.match(app, /function maybePlayHourlyChime\(sourceNow\)/);
  assert.match(app, /state\.lastChimeHourKey/);
  assert.match(app, /state\.hourlyChimeEnabled && elapsedMs >= 0 && elapsedMs <= 5000/);
  assert.match(app, /function playHourlyChime\(\)/);
  assert.match(app, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(app, /state\.mode === "clock"/);
});
