const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = (...segments) => path.join(__dirname, "..", "src", "renderer", ...segments);

test("Mini mode uses native dragging, ordered window controls, and standard-titlebar double click", () => {
  const html = fs.readFileSync(rendererPath("index.html"), "utf8");
  const css = fs.readFileSync(rendererPath("styles.css"), "utf8");
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");
  const bridge = fs.readFileSync(rendererPath("../tauri-bridge.js"), "utf8");
  const rust = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", "lib.rs"), "utf8");
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
  assert.match(html, /<section class="mini-panel" aria-label="Mini 模式时间" data-tauri-drag-region="deep">/);
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
  const miniRule = css.match(/\.clock-shell\.mini\s*\{([^}]*)\}/)?.[1] || "";
  const blackMiniRule = css.match(/:root\[data-theme="black"\]\s*\.clock-shell\.mini\s*\{([^}]*)\}/)?.[1] || "";
  const titlebarTooltipRule = css.match(/\.titlebar-drag-surface \.presentation-switch-tooltip\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(css, /\.clock-shell\.mini\s*\{\s*display:\s*block;\s*padding:\s*0;\s*cursor:\s*grab;/);
  assert.doesNotMatch(css, /--radius-mini-shell/);
  assert.doesNotMatch(miniRule, /border-radius:/);
  assert.doesNotMatch(miniRule, /border:\s*1px solid rgba\(var\(--color-accent-rgb\)/);
  assert.doesNotMatch(miniRule, /background:\s*var\(--color-shell-base\)/);
  assert.doesNotMatch(miniRule, /box-shadow:\s*none/);
  assert.doesNotMatch(miniRule, /inset 3px 0 0/);
  assert.match(css, /:root\[data-theme="black"\]\s*\.clock-shell\.mini\s*\{[\s\S]*?border-radius:\s*0[\s\S]*?border:\s*1px solid rgba\(var\(--color-accent-rgb\), 0\.34\)[\s\S]*?background-color:\s*var\(--color-shell-base\)[\s\S]*?background-image:\s*linear-gradient\(90deg, rgba\(var\(--color-accent-rgb\), 0\.14\), rgba\(var\(--color-surface-rgb\), 0\.04\)\)/);
  assert.doesNotMatch(blackMiniRule, /inset 3px 0 0 var\(--color-accent\)/);
  assert.match(blackMiniRule, /box-shadow:\s*none/);
  assert.match(css, /:root\[data-theme="sakura"\]\s*\{[\s\S]*?--radius-shell:\s*8px/);
  assert.match(css, /:root\[data-theme="sakura"\]\s*\.clock-shell\s*\{/);
  assert.doesNotMatch(miniRule, /0 0 0 1px/);
  assert.match(css, /\.clock-shell\.mini > :not\(\.mini-panel\):not\(\.mini-actions\)/);
  assert.match(css, /\.clock-shell\.mini \.mini-panel\s*\{[\s\S]*?grid-template-rows:\s*14px 40px 14px[\s\S]*?gap:\s*2px[\s\S]*?padding:\s*8px 14px[\s\S]*?align-items:\s*center/);
  assert.match(css, /\.mini-source\s*\{[\s\S]*?color:\s*var\(--color-mini-source\)[\s\S]*?font-size:\s*11px/);
  assert.match(css, /\.mini-value\s*\{[\s\S]*?font-size:\s*40px[\s\S]*?transform:\s*translateY\(-1px\)/);
  assert.match(css, /\.mini-date\s*\{[\s\S]*?color:\s*rgba\(var\(--color-text-rgb\), 0\.64\)[\s\S]*?font-size:\s*12px/);
  assert.match(css, /\.clock-shell\.mini:hover \.mini-actions/);
  assert.match(css, /\.titlebar-drag-surface\s*\{[\s\S]*?right:\s*80px[\s\S]*?left:\s*80px/);
  assert.match(titlebarTooltipRule, /left:\s*50%/);
  assert.match(css, /\.titlebar-drag-surface:hover \.presentation-switch-tooltip,[\s\S]*?\.mini-panel:hover \.mini-presentation-tooltip/);
  assert.match(css, /\.mini-presentation-tooltip\s*\{[\s\S]*?top:\s*auto[\s\S]*?bottom:\s*6px/);
  assert.match(css, /\.mini-actions\s*\{[\s\S]*?top:\s*50%[\s\S]*?right:\s*0[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /\.mini-actions\s*\{[\s\S]*?transform:\s*translate\(4px, -50%\)/);
  assert.match(css, /\.mini-action\s*\{[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px[\s\S]*?border-radius:\s*0/);
  assert.doesNotMatch(css, /\.mini-action:first-child/);
  assert.doesNotMatch(css, /\.mini-action:last-child/);
  assert.doesNotMatch(css, /mini-close-action/);
  assert.doesNotMatch(css, /-webkit-app-region/);
  assert.match(css, /\.mini-action\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(css, /\.mini-value\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(app, /const nextPresentation = mini \? "mini" : "standard"/);
  assert.match(app, /state\.presentation = nextPresentation/);
  assert.match(rust, /set_skip_taskbar\(mini\)/);
  assert.match(app, /elements\.clockShell\.setAttribute\("data-tauri-drag-region", "false"\)/);
  assert.match(bridge, /resizeMiniWindow: \(width\) => invoke\("resize_mini_window", \{ width \}\)/);
  assert.match(app, /window\.floatingClock\.resizeMiniWindow\(nextWidth\)/);
  assert.match(
    app,
    /await window\.floatingClock\.resizeMiniWindow\(nextWidth\);[\s\S]*?await window\.floatingClock\.setWindowCornerPreference\([\s\S]*?state\.presentation === "mini" && state\.theme === "black"/,
  );
  assert.doesNotMatch(app, /window\.floatingClock\.setWindowPresentation\(true, nextWidth\)/);
  assert.match(rust, /fn resize_mini_window\(/);
  assert.match(rust, /fn apply_window_corner_preference\(window: &tauri::WebviewWindow, square: bool\)/);
  assert.match(rust, /DWMWA_WINDOW_CORNER_PREFERENCE/);
  assert.match(rust, /DWMWA_BORDER_COLOR/);
  assert.match(rust, /DWMWA_COLOR_NONE/);
  assert.match(rust, /DWMWA_COLOR_DEFAULT/);
  assert.match(rust, /DWMWCP_DONOTROUND/);
  assert.match(rust, /set_shadow\(!mini\)/);
  assert.doesNotMatch(rust, /CreateRoundRectRgn|SetWindowRgn/);
  assert.match(rust, /fn set_window_corner_preference\(app: AppHandle, square: bool\)/);
  assert.match(bridge, /setWindowPresentation: \(mini, width\) => invoke\("set_window_presentation", \{ mini, width \}\)/);
  assert.match(bridge, /setWindowCornerPreference: \(square\) => invoke\("set_window_corner_preference", \{ square \}\)/);
  assert.doesNotMatch(app, /miniRadius/);
  assert.match(app, /setWindowCornerPreference\(mini && state\.theme === "black"\)/);
  assert.match(app, /state\.presentation === "mini" && theme === "black"/);
  assert.match(app, /elements\.miniSource\.textContent = selectedSource\?\.label \|\| "时间源"/);
  assert.match(app, /const displayDate = formatDisplayDate\(sourceNow\);/);
  assert.match(app, /elements\.dateValue\.textContent = displayDate;/);
  assert.match(app, /elements\.miniDate\.textContent = displayDate;/);
  assert.match(app, /function formatDisplayDate\(timestamp\) \{[\s\S]*?if \(isLocalTimeSource\(\)\)[\s\S]*?LOCAL_WEEKDAYS\[value\.getDay\(\)\][\s\S]*?beijingDateFormatter\.formatToParts\(timestamp\)[\s\S]*?`\$\{date\} \$\{weekday\}`/);
  assert.match(capability, /"core:window:allow-start-dragging"/);
  assert.match(app, /window\.floatingClock\.resizeMiniWindow\(nextWidth\)/);
  assert.match(app, /elements\.titlebar\.addEventListener\("mousedown", \(event\) => \{/);
  assert.match(app, /event\.target\.closest\("button, input, select, summary"\)/);
  assert.match(app, /setWindowPresentation\(true\);/);
  assert.match(app, /elements\.miniCloseButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(app, /elements\.miniMinimizeButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(app, /elements\.miniPanel\.addEventListener\("mousedown", \(event\) => \{/);
  assert.match(app, /event\.detail !== 2/);
  assert.match(app, /event\.stopPropagation\(\);/);
  assert.match(app, /elements\.miniPanel\.addEventListener\("dblclick", \(\) => setWindowPresentation\(false\)\)/);
  assert.doesNotMatch(app, /startMiniWindowDrag/);
  assert.doesNotMatch(app, /startWindowDrag/);
  assert.doesNotMatch(app, /floatingClock\.presentation/);
});

test("Mini presentation buttons do not let the second click re-enter Mini mode", () => {
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(app, /PRESENTATION_DOUBLE_CLICK_GUARD_MS/);
  assert.match(app, /presentationDoubleClickGuardUntil: 0/);
  assert.match(app, /function markPresentationButtonAction\(\)/);
  assert.match(app, /function suppressPresentationDoubleClick\(event\)/);
  assert.match(app, /document\.addEventListener\("mousedown", suppressPresentationDoubleClick, true\)/);
  assert.match(app, /document\.addEventListener\("click", suppressPresentationDoubleClick, true\)/);
  assert.match(app, /document\.addEventListener\("dblclick", suppressPresentationDoubleClick, true\)/);
  assert.match(app, /elements\.miniRestoreButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(app, /elements\.miniMinimizeButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(app, /elements\.miniCloseButton\.addEventListener\("click", \(event\) => \{/);
  assert.match(app, /if \(event\.detail > 1\) return;/);
});

test("Presentation changes clear stale focus before applying the new layout", () => {
  const app = fs.readFileSync(rendererPath("app.js"), "utf8");

  assert.match(
    app,
    /function applyPresentation\(mini\) \{[\s\S]*?const nextPresentation = mini \? "mini" : "standard";[\s\S]*?if \(state\.presentation !== nextPresentation\) \{[\s\S]*?document\.activeElement\?\.blur\(\);[\s\S]*?\}[\s\S]*?state\.presentation = nextPresentation;/,
  );
});
