const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("Mini mode uses native dragging, ordered window controls, and standard-titlebar double click", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");
  const capability = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "capabilities", "default.json"), "utf8");

  assert.match(html, /<main id="clockShell" class="clock-shell">/);
  assert.match(html, /<div class="titlebar-left-actions" data-tauri-drag-region="false">\s*<button id="miniModeButton" class="titlebar-action"/);
  assert.match(html, /id="miniModeButton"[\s\S]*?id="topmostButton"[\s\S]*?class="window-actions"[\s\S]*?id="minimizeButton"[\s\S]*?id="closeButton"/);
  assert.match(html, /title="进入 Mini 模式"/);
  assert.match(
    html,
    /<span class="titlebar-drag-surface" data-tauri-drag-region="deep">\s*<span class="time-precision-tooltip presentation-switch-tooltip" role="tooltip">双击切换显示<\/span>\s*<\/span>/,
  );
  assert.match(html, /class="lucide-icon window-mode-icon"/);
  assert.match(html, /<rect x="3" y="5" width="18" height="14" rx="2" \/>/);
  assert.match(html, /<path d="M7 12h10" \/>/);
  assert.match(html, /<rect x="5" y="5" width="14" height="14" rx="1" \/>/);
  assert.doesNotMatch(html, />Mini<\/button>/);
  assert.doesNotMatch(html, />标准<\/button>/);
  assert.match(html, /<section class="mini-panel" aria-label="Mini 模式时间">/);
  assert.match(html, /id="miniSource" class="mini-source">加载时间源…<\/p>/);
  assert.match(html, /id="miniValue" class="mini-value"/);
  assert.match(html, /id="miniDate" class="mini-date">等待校准<\/p>/);
  assert.match(
    html,
    /<span class="time-precision-tooltip presentation-switch-tooltip mini-presentation-tooltip" role="tooltip">双击切换显示<\/span>/,
  );
  assert.doesNotMatch(html, /miniDragSurface/);
  assert.match(html, /<div class="mini-actions" data-tauri-drag-region="false">/);
  assert.match(
    html,
    /id="miniCloseButton"[\s\S]*?id="miniRestoreButton"[\s\S]*?id="miniMinimizeButton"/,
  );
  assert.match(html, /id="miniCloseButton" class="mini-action" type="button" title="退出程序"/);
  assert.match(html, /id="miniRestoreButton" class="mini-action" type="button" title="恢复标准模式"/);
  assert.match(html, /id="miniMinimizeButton" class="mini-action" type="button" title="隐藏到托盘"/);
  assert.doesNotMatch(html, /id="miniHideButton"/);
  assert.match(html, /<path d="m7 7 10 10" \/>/);
  assert.match(html, /<path d="m17 7-10 10" \/>/);
  assert.match(html, /<path d="M5 12h14" \/>/);
  assert.match(css, /\.clock-shell\.mini\s*\{\s*display:\s*block;\s*padding:\s*10px 12px;\s*cursor:\s*grab;/);
  assert.match(css, /\.clock-shell\.mini > :not\(\.mini-panel\):not\(\.mini-actions\)/);
  assert.match(css, /\.clock-shell\.mini \.mini-panel\s*\{[\s\S]*?grid-template-rows:\s*12px 40px 12px[\s\S]*?gap:\s*3px[\s\S]*?align-items:\s*center/);
  assert.match(css, /\.mini-source\s*\{[\s\S]*?color:\s*var\(--color-mini-source\)[\s\S]*?font-size:\s*11px/);
  assert.match(css, /\.mini-value\s*\{[\s\S]*?font-size:\s*40px[\s\S]*?transform:\s*translateY\(-2px\)/);
  assert.match(css, /\.mini-date\s*\{[\s\S]*?color:\s*rgba\(var\(--color-text-rgb\), 0\.64\)[\s\S]*?font-size:\s*12px/);
  assert.match(css, /\.clock-shell\.mini:hover \.mini-actions/);
  assert.match(css, /\.titlebar-drag-surface\s*\{[\s\S]*?right:\s*80px[\s\S]*?left:\s*80px/);
  assert.match(css, /\.titlebar-drag-surface \.presentation-switch-tooltip\s*\{[\s\S]*?left:\s*calc\(50% \+ 30px\)/);
  assert.match(css, /\.titlebar-drag-surface:hover \.presentation-switch-tooltip,[\s\S]*?\.mini-panel:hover \.mini-presentation-tooltip/);
  assert.match(css, /\.mini-presentation-tooltip\s*\{[\s\S]*?top:\s*auto[\s\S]*?bottom:\s*-8px/);
  assert.match(css, /\.mini-actions\s*\{[\s\S]*?top:\s*50%[\s\S]*?right:\s*0[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /\.mini-actions\s*\{[\s\S]*?transform:\s*translate\(4px, -50%\)/);
  assert.match(css, /\.mini-action\s*\{[\s\S]*?width:\s*20px[\s\S]*?height:\s*20px/);
  assert.match(css, /\.mini-action:first-child\s*\{\s*border-radius:\s*var\(--radius-mini-action\) 0 0 0;/);
  assert.match(css, /\.mini-action:last-child\s*\{\s*border-radius:\s*0 0 0 var\(--radius-mini-action\);/);
  assert.doesNotMatch(css, /mini-close-action/);
  assert.doesNotMatch(css, /-webkit-app-region/);
  assert.match(css, /\.mini-action\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(css, /\.mini-value\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(app, /state\.presentation = mini \? "mini" : "standard"/);
  assert.match(app, /elements\.clockShell\.setAttribute\("data-tauri-drag-region", mini \? "deep" : "false"\)/);
  assert.match(app, /elements\.miniSource\.textContent = selectedSource\?\.label \|\| "时间源"/);
  assert.match(app, /const displayDate = formatDisplayDate\(sourceNow\);/);
  assert.match(app, /elements\.dateValue\.textContent = displayDate;/);
  assert.match(app, /elements\.miniDate\.textContent = displayDate;/);
  assert.match(app, /function formatDisplayDate\(timestamp\) \{[\s\S]*?dateFormatter\.formatToParts\(timestamp\)[\s\S]*?`\$\{date\} \$\{weekday\}`/);
  assert.match(capability, /"core:window:allow-start-dragging"/);
  assert.match(app, /setWindowPresentation\(true, nextWidth\)/);
  assert.match(app, /elements\.titlebar\.addEventListener\("mousedown", \(event\) => \{/);
  assert.match(app, /event\.target\.closest\("button, input, select, summary"\)/);
  assert.match(app, /setWindowPresentation\(true\);/);
  assert.match(app, /elements\.miniCloseButton\.addEventListener\("click", \(\) => window\.floatingClock\.close\(\)\)/);
  assert.match(app, /elements\.miniMinimizeButton\.addEventListener\("click", \(\) => window\.floatingClock\.minimize\(\)\)/);
  assert.match(app, /elements\.miniPanel\.addEventListener\("mousedown", \(event\) => \{/);
  assert.match(app, /event\.detail !== 2/);
  assert.match(app, /event\.stopPropagation\(\);/);
  assert.match(app, /elements\.miniPanel\.addEventListener\("dblclick", \(\) => setWindowPresentation\(false\)\)/);
  assert.doesNotMatch(app, /startMiniWindowDrag/);
  assert.doesNotMatch(app, /startWindowDrag/);
  assert.doesNotMatch(app, /floatingClock\.presentation/);
});
