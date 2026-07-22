use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const SHORTCUT: &str = "Ctrl+Alt+T";

#[derive(Default)]
struct ControlsState {
    topmost: AtomicBool,
    click_through: AtomicBool,
}

struct ControlsMenu {
    launch_at_login: CheckMenuItem<tauri::Wry>,
    topmost: CheckMenuItem<tauri::Wry>,
    click_through: CheckMenuItem<tauri::Wry>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowControls {
    launch_at_login: bool,
    topmost: bool,
    click_through: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    body: String,
    headers: HashMap<String, String>,
    status_code: u16,
}

fn strategy_request(strategy_id: &str) -> Option<(&'static str, &'static str)> {
    match strategy_id {
        "ntsc-date" => Some(("HEAD", "https://www.ntsc.ac.cn/")),
        "jd-date" => Some(("GET", "https://api.m.jd.com/")),
        "pdd-server-time" => Some(("GET", "https://api.pinduoduo.com/api/server/_stm")),
        "pdd-yak-time" | "pdd-date" => Some(("HEAD", "https://www.pinduoduo.com/")),
        "taobao-timestamp" => Some((
            "GET",
            "https://h5api.m.taobao.com/h5/mtop.common.gettimestamp/1.0/",
        )),
        "taobao-date" => Some(("HEAD", "https://www.taobao.com/")),
        _ => None,
    }
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_window(app);
        }
    }
}

fn window_controls(app: &AppHandle) -> Result<WindowControls, String> {
    let state = app.state::<ControlsState>();
    Ok(WindowControls {
        launch_at_login: app
            .autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())?,
        topmost: state.topmost.load(Ordering::Relaxed),
        click_through: state.click_through.load(Ordering::Relaxed),
    })
}

fn emit_controls(app: &AppHandle) -> Result<WindowControls, String> {
    let controls = window_controls(app)?;
    app.emit("window-controls-changed", controls.clone())
        .map_err(|error| error.to_string())?;
    Ok(controls)
}

fn apply_topmost(app: &AppHandle, enabled: bool) -> Result<WindowControls, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("main window is unavailable")?;
    window
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())?;
    app.state::<ControlsState>()
        .topmost
        .store(enabled, Ordering::Relaxed);
    app.state::<ControlsMenu>()
        .topmost
        .set_checked(enabled)
        .map_err(|error| error.to_string())?;
    emit_controls(app)
}

fn apply_click_through(app: &AppHandle, enabled: bool) -> Result<WindowControls, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("main window is unavailable")?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())?;
    app.state::<ControlsState>()
        .click_through
        .store(enabled, Ordering::Relaxed);
    app.state::<ControlsMenu>()
        .click_through
        .set_checked(enabled)
        .map_err(|error| error.to_string())?;
    emit_controls(app)
}

#[tauri::command]
fn get_window_controls(app: AppHandle) -> Result<WindowControls, String> {
    window_controls(&app)
}

#[tauri::command]
fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<WindowControls, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable()
    } else {
        manager.disable()
    }
    .map_err(|error| error.to_string())?;
    app.state::<ControlsMenu>()
        .launch_at_login
        .set_checked(enabled)
        .map_err(|error| error.to_string())?;
    emit_controls(&app)
}

#[tauri::command]
fn set_topmost(app: AppHandle, enabled: bool) -> Result<WindowControls, String> {
    apply_topmost(&app, enabled)
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("main window is unavailable")?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn request_time(strategy_id: String) -> Result<HttpResponse, String> {
    let (method, url) = strategy_request(&strategy_id).ok_or("unknown time strategy")?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3500))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .request(
            method
                .parse()
                .map_err(|error| format!("invalid method: {error}"))?,
            url,
        )
        .header("Cache-Control", "no-cache")
        .header("User-Agent", "FloatingClock/0.1")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status_code = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect();
    let body = response.text().await.map_err(|error| error.to_string())?;

    Ok(HttpResponse {
        body,
        headers,
        status_code,
    })
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "toggle", "显示或隐藏", true, Some(SHORTCUT))?;
    let show = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let launch_at_login = CheckMenuItem::with_id(
        app,
        "launch-at-login",
        "开机启动",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let topmost = CheckMenuItem::with_id(app, "topmost", "窗口置顶", true, true, None::<&str>)?;
    let click_through =
        CheckMenuItem::with_id(app, "click-through", "鼠标穿透", true, false, None::<&str>)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_hide,
            &show,
            &separator,
            &launch_at_login,
            &topmost,
            &click_through,
            &separator_two,
            &quit,
        ],
    )?;

    app.manage(ControlsMenu {
        launch_at_login,
        topmost,
        click_through,
    });

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .expect("application icon is missing")
                .clone(),
        )
        .tooltip("悬浮时钟 - Ctrl+Alt+T 显示或隐藏")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_window(app),
            "show" => show_window(app),
            "launch-at-login" => {
                let enabled = !app.autolaunch().is_enabled().unwrap_or(false);
                let _ = set_launch_at_login(app.clone(), enabled);
            }
            "topmost" => {
                let enabled = !app.state::<ControlsState>().topmost.load(Ordering::Relaxed);
                let _ = apply_topmost(app, enabled);
            }
            "click-through" => {
                let enabled = !app
                    .state::<ControlsState>()
                    .click_through
                    .load(Ordering::Relaxed);
                let _ = apply_click_through(app, enabled);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app)
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(ControlsState {
            topmost: AtomicBool::new(true),
            click_through: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            get_window_controls,
            hide_window,
            request_time,
            set_launch_at_login,
            set_topmost,
        ])
        .setup(|app| {
            setup_tray(app)?;
            app.global_shortcut().register(SHORTCUT)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[cfg(test)]
mod tests {
    use super::strategy_request;

    #[test]
    fn network_command_only_accepts_known_time_strategies() {
        assert!(strategy_request("taobao-timestamp").is_some());
        assert!(strategy_request("https://example.com").is_none());
    }
}
