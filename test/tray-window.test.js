const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rust = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", "lib.rs"), "utf8");

test("tray toggle hides a visible window without requiring focus", () => {
  assert.match(
    rust,
    /fn should_hide_window_from_tray\(visible: bool\) -> bool \{\s*visible\s*\}/,
  );
  assert.match(
    rust,
    /fn toggle_window_from_tray\(app: &AppHandle\) \{[\s\S]*?should_hide_window_from_tray\([\s\S]*?window\.is_visible\(\)\.unwrap_or\(false\)[\s\S]*?\)[\s\S]*?window\.hide\(\)/,
  );
  assert.match(rust, /"toggle" => toggle_window_from_tray\(app\)/);
  assert.match(
    rust,
    /fn restore_click_through\(app: &AppHandle\) -> bool \{[\s\S]*?apply_click_through\(app, false\)[\s\S]*?show_window\(app\);[\s\S]*?true\s*\}/,
  );
  assert.match(
    rust,
    /fn handle_tray_icon_click\(app: &AppHandle\) \{\s*if restore_click_through\(app\) \{\s*return;\s*\}\s*toggle_window_from_tray\(app\);\s*\}/,
  );
  assert.match(rust, /handle_tray_icon_click\(tray\.app_handle\(\)\)/);
  assert.doesNotMatch(rust, /MenuItem::with_id\(app, "show", "显示"/);
  assert.doesNotMatch(rust, /"show" => show_window\(app\)/);
  assert.match(
    rust,
    /fn handle_global_shortcut\(app: &AppHandle\) \{\s*if restore_click_through\(app\) \{\s*return;\s*\}\s*toggle_window\(app\);\s*\}/,
  );
});
