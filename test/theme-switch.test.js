const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("offers validated preset themes and remembers the selected theme", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(html, /<details id="themeMenu" class="theme-menu">/);
  assert.match(html, /<span id="titleName" class="title-name">\s*<span id="titleSubtitle" class="title-subtitle">AMBER<\/span>\s*<span id="titleMain" class="title-main">悬浮时钟<\/span>\s*<span id="titleBadge" class="title-theme-badge">🌙<\/span>\s*<\/span>/);
  assert.match(html, /<summary id="themeSelect" class="theme-select" title="切换主题" aria-label="切换主题">🎨<\/summary>/);
  assert.match(html, /data-theme="amber">琥珀暗<\/button>/);
  assert.match(html, /data-theme="light">晨雾浅<\/button>/);
  assert.match(html, /data-theme="black">墨玉黑<\/button>/);
  assert.match(html, /data-theme="sakura">樱粉<\/button>/);
  assert.match(css, /:root\[data-theme="light"\]\s*\{/);
  assert.match(css, /:root\[data-theme="black"\]\s*\{[\s\S]*?--radius-shell:\s*0[\s\S]*?--color-accent:\s*#58c7a2[\s\S]*?--color-accent-rgb:\s*88, 199, 162/);
  assert.match(css, /:root\[data-theme="sakura"\]\s*\{[\s\S]*?--radius-shell:\s*8px[\s\S]*?--radius-panel:\s*16px[\s\S]*?--radius-control:\s*11px[\s\S]*?--color-accent:\s*#ff75b5[\s\S]*?--color-text-rgb:\s*135, 91, 137[\s\S]*?--color-border-rgb:\s*248, 128, 183[\s\S]*?--color-surface-rgb:\s*255, 147, 195/);
  assert.match(css, /:root\[data-theme="sakura"\] \.titlebar-action\s*\{\s*border-radius:\s*50%/);
  assert.match(css, /\.theme-menu:not\(\[open\]\) \.theme-options/);
  assert.match(css, /\.theme-menu\s*\{[\s\S]*?right:\s*12px[\s\S]*?bottom:\s*12px/);
  assert.match(css, /\.theme-options\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px\)/);
  assert.match(app, /const THEME_TITLES = \{[\s\S]*?amber:\s*\{ title: "悬浮时钟", badge: "🌙", subtitle: "AMBER" \}[\s\S]*?light:\s*\{ title: "悬浮时钟", badge: "☀️", subtitle: "MIST" \}[\s\S]*?black:\s*\{ title: "悬浮时钟", badge: "🟢", subtitle: "JADE" \}[\s\S]*?sakura:\s*\{ title: "悬浮时钟", badge: "🌸", subtitle: "SAKURA" \}/);
  assert.match(app, /const THEME_IDS = new Set\(Object\.keys\(THEME_TITLES\)\)/);
  assert.match(app, /theme:\s*"floatingClock\.theme"/);
  assert.match(app, /return THEME_IDS\.has\(theme\) \? theme : "amber"/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(app, /elements\.titleMain\.textContent = THEME_TITLES\[theme\]\.title/);
  assert.match(app, /elements\.titleBadge\.textContent = THEME_TITLES\[theme\]\.badge/);
  assert.match(app, /elements\.titleSubtitle\.textContent = THEME_TITLES\[theme\]\.subtitle/);
  assert.match(css, /\.title-name\s*\{[\s\S]*?display:\s*flex[\s\S]*?align-items:\s*flex-end/);
  assert.match(css, /\.title-theme-badge\s*\{[\s\S]*?font-family:\s*"Segoe UI Emoji"[\s\S]*?font-size:\s*15px/);
  assert.match(css, /\.title-subtitle\s*\{[\s\S]*?font-size:\s*8px/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.theme, theme\)/);
  assert.match(app, /button\.setAttribute\("aria-pressed", String\(button\.dataset\.theme === theme\)\)/);
});
