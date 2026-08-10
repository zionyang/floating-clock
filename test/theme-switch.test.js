const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("uses the current-theme icon and keeps the English theme title", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(html, /<details id="themeMenu" class="theme-menu">/);
  assert.match(html, /<span id="titleName" class="title-name">\s*<span id="titleSubtitle" class="title-subtitle">AMBER<\/span>\s*<span class="title-main">悬浮时钟<\/span>\s*<\/span>/);
  assert.doesNotMatch(html, /titleBadge|title-theme-badge/);
  assert.match(html, /<summary id="themeSelect" class="theme-select" title="切换主题" aria-label="切换主题，当前为月亮主题">\s*<span id="themeSelectIcon" class="theme-select-icon" aria-hidden="true">🌙<\/span>/);
  assert.match(html, /data-theme="amber" aria-label="切换到月亮主题"><span class="theme-option-icon" aria-hidden="true">🌙<\/span>/);
  assert.match(html, /data-theme="light" aria-label="切换到太阳主题"><span class="theme-option-icon" aria-hidden="true">☀️<\/span>/);
  assert.match(html, /data-theme="black" aria-label="切换到玉绿主题"><span class="theme-option-icon" aria-hidden="true">🟢<\/span>/);
  assert.match(html, /data-theme="sakura" aria-label="切换到樱花主题"><span class="theme-option-icon" aria-hidden="true">🌸<\/span>/);
  assert.doesNotMatch(html, /琥珀暗|晨雾浅|墨玉黑|樱粉/);
  assert.match(css, /:root\[data-theme="light"\]\s*\{/);
  assert.match(css, /:root\[data-theme="black"\]\s*\{[\s\S]*?--radius-shell:\s*0[\s\S]*?--color-accent:\s*#58c7a2[\s\S]*?--color-accent-rgb:\s*88, 199, 162/);
  assert.match(css, /:root\[data-theme="sakura"\]\s*\{[\s\S]*?--radius-shell:\s*8px[\s\S]*?--radius-panel:\s*16px[\s\S]*?--radius-control:\s*11px[\s\S]*?--color-accent:\s*#ff75b5[\s\S]*?--color-text-rgb:\s*135, 91, 137[\s\S]*?--color-border-rgb:\s*248, 128, 183[\s\S]*?--color-surface-rgb:\s*255, 147, 195/);
  assert.match(css, /:root\[data-theme="sakura"\] \.titlebar-action\s*\{\s*border-radius:\s*50%/);
  assert.match(css, /\.theme-menu:not\(\[open\]\) \.theme-options/);
  assert.match(css, /\.theme-menu\s*\{[\s\S]*?right:\s*12px[\s\S]*?bottom:\s*12px/);
  assert.match(css, /\.theme-options\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px\)[\s\S]*?width:\s*max-content[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /\.theme-option\s*\{[\s\S]*?width:\s*28px[\s\S]*?height:\s*28px[\s\S]*?display:\s*grid/);
  assert.match(css, /\.theme-select-icon\s*\{[\s\S]*?font-size:\s*18px/);
  assert.match(css, /\.theme-select:hover,[\s\S]*?\.theme-menu\[open\] \.theme-select\s*\{[\s\S]*?box-shadow:/);
  assert.doesNotMatch(css, /theme-option\[aria-pressed/);
  assert.match(app, /const THEME_DEFINITIONS = \{[\s\S]*?amber:\s*\{ titleName: "AMBER", icon: "🌙", accessibleName: "月亮主题" \}[\s\S]*?light:\s*\{ titleName: "MIST", icon: "☀️", accessibleName: "太阳主题" \}[\s\S]*?black:\s*\{ titleName: "JADE", icon: "🟢", accessibleName: "玉绿主题" \}[\s\S]*?sakura:\s*\{ titleName: "SAKURA", icon: "🌸", accessibleName: "樱花主题" \}/);
  assert.match(app, /const THEME_IDS = new Set\(Object\.keys\(THEME_DEFINITIONS\)\)/);
  assert.match(app, /theme:\s*"floatingClock\.theme"/);
  assert.match(app, /return THEME_IDS\.has\(theme\) \? theme : "amber"/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(app, /const themeDefinition = THEME_DEFINITIONS\[theme\]/);
  assert.match(app, /elements\.titleSubtitle\.textContent = themeDefinition\.titleName/);
  assert.match(app, /elements\.themeSelectIcon\.textContent = themeDefinition\.icon/);
  assert.match(app, /button\.hidden = button\.dataset\.theme === theme/);
  assert.match(app, /elements\.themeSelect\.setAttribute\("aria-label", `切换主题，当前为\$\{themeDefinition\.accessibleName\}`\)/);
  assert.doesNotMatch(app, /THEME_TITLES|titleBadge|titleMain|themeOptions/);
  assert.match(css, /\.title-name\s*\{[\s\S]*?display:\s*flex[\s\S]*?align-items:\s*flex-end/);
  assert.match(css, /\.title-subtitle\s*\{[\s\S]*?font-size:\s*8px/);
  assert.doesNotMatch(css, /title-theme-badge/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.theme, theme\)/);
});
