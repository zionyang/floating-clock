use std::{
    collections::HashMap,
    net::UdpSocket,
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::StateFlags;

const SHORTCUT: &str = "Ctrl+Alt+T";
const NTP_SERVERS: &[&str] = &[
    "ntp.ntsc.ac.cn:123",
    "ntp.tencent.com:123",
    "ntp.aliyun.com:123",
    "time.cloudflare.com:123",
];
const NTP_TIMEOUT_MS: u64 = 1500;
const NTP_PACKET_LENGTH: usize = 48;
const NTP_UNIX_EPOCH_SECONDS: u64 = 2_208_988_800;
const STANDARD_WINDOW_WIDTH: f64 = 392.0;
const STANDARD_WINDOW_HEIGHT: f64 = 392.0;
const MINI_WINDOW_MIN_WIDTH: f64 = 236.0;
const MINI_WINDOW_MAX_WIDTH: f64 = 1200.0;
const MINI_WINDOW_HEIGHT: f64 = 92.0;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Default)]
struct ControlsState {
    standard_topmost: AtomicBool,
    click_through: AtomicBool,
    mini: AtomicBool,
}

struct ControlsMenu {
    launch_at_login: CheckMenuItem<tauri::Wry>,
    topmost: CheckMenuItem<tauri::Wry>,
    mini: CheckMenuItem<tauri::Wry>,
    click_through: CheckMenuItem<tauri::Wry>,
}

struct UpdateMenu {
    item: MenuItem<tauri::Wry>,
    available: AtomicBool,
    busy: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowControls {
    launch_at_login: bool,
    topmost: bool,
    click_through: bool,
    mini: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowPresentation {
    mini: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    body: String,
    headers: HashMap<String, String>,
    status_code: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NtpResponse {
    checked_at_epoch_ms: i64,
    offset_ms: i64,
    round_trip_ms: i64,
}

fn strategy_request(strategy_id: &str) -> Option<(&'static str, &'static str, bool)> {
    match strategy_id {
        "jd-request-id" => Some(("HEAD", "https://api.m.jd.com/", false)),
        "jd-phase" => Some(("GET", "https://api.m.jd.com/", true)),
        "pdd-server-time" => Some(("GET", "https://api.pinduoduo.com/api/server/_stm", false)),
        "pdd-yak-time" => Some(("HEAD", "https://www.pinduoduo.com/", false)),
        "pdd-phase" => Some(("GET", "https://www.pinduoduo.com/", true)),
        "taobao-timestamp" => Some((
            "GET",
            "https://h5api.m.taobao.com/h5/mtop.common.gettimestamp/1.0/",
            false,
        )),
        "taobao-phase" => Some(("GET", "https://www.taobao.com/", true)),
        "meituan-server-time" | "meituan-flash-server-time" => Some((
            "GET",
            "https://cube.meituan.com/ipromotion/cube/toc/component/base/getServerCurrentTime",
            false,
        )),
        "meituan-phase" => Some(("GET", "https://www.meituan.com/", true)),
        "meituan-flash-phase" => Some(("GET", "https://brandhub.meituan.com/", true)),
        "taobao-flash-timestamp" => Some((
            "GET",
            "https://waimai-guide.ele.me/h5/mtop.common.gettimestamp/1.0/",
            false,
        )),
        "taobao-flash-phase" => Some(("GET", "https://www.ele.me/", true)),
        "damai-timestamp" => Some((
            "GET",
            "https://mtop.damai.cn/h5/mtop.common.gettimestamp/1.0/",
            false,
        )),
        "damai-phase" => Some(("HEAD", "https://www.damai.cn/", true)),
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

fn should_hide_window_for_shortcut(visible: bool, focused: bool) -> bool {
    visible && focused
}

fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if should_hide_window_for_shortcut(
            window.is_visible().unwrap_or(false),
            window.is_focused().unwrap_or(false),
        ) {
            let _ = window.hide();
        } else {
            show_window(app);
        }
    }
}

fn supports_self_update(exe_name: Option<&str>) -> bool {
    // ponytail: the distributed portable file is renamed; use an installer marker if names converge.
    exe_name.is_some_and(|name| name.eq_ignore_ascii_case("floating-clock.exe"))
}

fn running_installed_build() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.file_name()?.to_str().map(str::to_owned))
        .as_deref()
        .is_some_and(|name| supports_self_update(Some(name)))
}

async fn check_for_update(app: AppHandle, install: bool, announce_current: bool) {
    let menu = app.state::<UpdateMenu>();
    if menu
        .busy
        .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
    {
        return;
    }
    let _ = menu.item.set_enabled(false);
    let _ = menu.item.set_text(if install {
        "正在准备更新…"
    } else {
        "正在检查更新…"
    });

    let result = async {
        let Some(update) = app
            .updater()
            .map_err(|error| error.to_string())?
            .check()
            .await
            .map_err(|error| error.to_string())?
        else {
            return Ok::<_, String>(None);
        };
        let version = update.version.to_string();
        if install {
            let _ = menu.item.set_text(format!("正在下载 {version}…"));
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|error| error.to_string())?;
        }
        Ok(Some(version))
    }
    .await;

    match result {
        Ok(Some(version)) if !install => {
            menu.available.store(true, Ordering::Relaxed);
            let _ = menu.item.set_text(format!("安装更新 {version}"));
        }
        Ok(None) => {
            menu.available.store(false, Ordering::Relaxed);
            let _ = menu.item.set_text(if announce_current {
                "已是最新版本（点击检查）"
            } else {
                "检查更新"
            });
        }
        Err(error) => {
            eprintln!("Update failed: {error}");
            menu.available.store(false, Ordering::Relaxed);
            let _ = menu.item.set_text("更新检查失败（点击重试）");
        }
        _ => {}
    }
    menu.busy.store(false, Ordering::Relaxed);
    let _ = menu.item.set_enabled(true);
}

fn window_controls(app: &AppHandle) -> Result<WindowControls, String> {
    let state = app.state::<ControlsState>();
    let mini = state.mini.load(Ordering::Relaxed);
    Ok(WindowControls {
        launch_at_login: app
            .autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())?,
        topmost: effective_topmost(state.standard_topmost.load(Ordering::Relaxed), mini),
        click_through: state.click_through.load(Ordering::Relaxed),
        mini,
    })
}

fn effective_topmost(standard_topmost: bool, mini: bool) -> bool {
    mini || standard_topmost
}

fn topmost_change_allowed(mini: bool) -> bool {
    !mini
}

fn normalize_mini_width(width: f64) -> f64 {
    if width.is_finite() {
        width.clamp(MINI_WINDOW_MIN_WIDTH, MINI_WINDOW_MAX_WIDTH)
    } else {
        MINI_WINDOW_MIN_WIDTH
    }
}

fn emit_controls(app: &AppHandle) -> Result<WindowControls, String> {
    let controls = window_controls(app)?;
    app.emit("window-controls-changed", controls.clone())
        .map_err(|error| error.to_string())?;
    Ok(controls)
}

fn apply_topmost(app: &AppHandle, enabled: bool) -> Result<WindowControls, String> {
    let state = app.state::<ControlsState>();
    if !topmost_change_allowed(state.mini.load(Ordering::Relaxed)) {
        return Err("Mini 模式固定置顶，不能取消".to_owned());
    }

    let window = app
        .get_webview_window("main")
        .ok_or("main window is unavailable")?;
    window
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())?;
    state.standard_topmost.store(enabled, Ordering::Relaxed);
    app.state::<ControlsMenu>()
        .topmost
        .set_checked(enabled)
        .map_err(|error| error.to_string())?;
    emit_controls(app)
}

fn apply_presentation(
    app: &AppHandle,
    mini: bool,
    requested_width: f64,
) -> Result<WindowPresentation, String> {
    let state = app.state::<ControlsState>();
    let previous_mini = state.mini.load(Ordering::Relaxed);
    let effective_topmost = effective_topmost(state.standard_topmost.load(Ordering::Relaxed), mini);
    let width = if mini {
        normalize_mini_width(requested_width)
    } else {
        STANDARD_WINDOW_WIDTH
    };
    let height = if mini {
        MINI_WINDOW_HEIGHT
    } else {
        STANDARD_WINDOW_HEIGHT
    };
    let window = app
        .get_webview_window("main")
        .ok_or("main window is unavailable")?;

    window
        .set_always_on_top(effective_topmost)
        .map_err(|error| error.to_string())?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;

    state.mini.store(mini, Ordering::Relaxed);
    let menu = app.state::<ControlsMenu>();
    menu.mini
        .set_checked(mini)
        .map_err(|error| error.to_string())?;
    menu.topmost
        .set_checked(effective_topmost)
        .map_err(|error| error.to_string())?;
    menu.topmost
        .set_enabled(!mini)
        .map_err(|error| error.to_string())?;

    let presentation = WindowPresentation { mini };
    if previous_mini != mini {
        app.emit("window-presentation-changed", presentation.clone())
            .map_err(|error| error.to_string())?;
    }
    emit_controls(app)?;
    Ok(presentation)
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
fn set_window_presentation(
    app: AppHandle,
    mini: bool,
    width: f64,
) -> Result<WindowPresentation, String> {
    apply_presentation(&app, mini, width)
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("main window is unavailable")?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn epoch_ms() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    i64::try_from(duration.as_millis()).map_err(|error| error.to_string())
}

fn ntp_timestamp(packet: &[u8], offset: usize) -> Result<i64, String> {
    if packet.len() < offset + 8 {
        return Err("incomplete NTP timestamp".to_owned());
    }

    let seconds = u32::from_be_bytes([
        packet[offset],
        packet[offset + 1],
        packet[offset + 2],
        packet[offset + 3],
    ]) as u64;
    let fraction = u32::from_be_bytes([
        packet[offset + 4],
        packet[offset + 5],
        packet[offset + 6],
        packet[offset + 7],
    ]) as u64;
    let unix_seconds = seconds
        .checked_sub(NTP_UNIX_EPOCH_SECONDS)
        .ok_or("invalid NTP epoch")?;
    let milliseconds = unix_seconds
        .checked_mul(1000)
        .and_then(|value| value.checked_add(fraction * 1000 / 4_294_967_296))
        .ok_or("NTP timestamp overflow")?;

    i64::try_from(milliseconds).map_err(|error| error.to_string())
}

fn ntp_request_timestamp(epoch_ms: i64) -> Result<[u8; 8], String> {
    let epoch_ms = u64::try_from(epoch_ms).map_err(|error| error.to_string())?;
    let seconds = (epoch_ms / 1000)
        .checked_add(NTP_UNIX_EPOCH_SECONDS)
        .ok_or("NTP timestamp overflow")?;
    let seconds = u32::try_from(seconds).map_err(|error| error.to_string())?;
    let fraction = ((epoch_ms % 1000) * 4_294_967_296 / 1000) as u32;
    let mut timestamp = [0_u8; 8];
    timestamp[..4].copy_from_slice(&seconds.to_be_bytes());
    timestamp[4..].copy_from_slice(&fraction.to_be_bytes());
    Ok(timestamp)
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    if let Some(client) = HTTP_CLIENT.get() {
        return Ok(client);
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| error.to_string())?;
    let _ = HTTP_CLIENT.set(client);
    HTTP_CLIENT
        .get()
        .ok_or("HTTP client initialization failed".to_owned())
}

fn cache_busted_url(url: &str) -> Result<String, String> {
    let separator = if url.contains('?') { '&' } else { '?' };
    Ok(format!("{url}{separator}clock_probe={}", epoch_ms()?))
}

#[tauri::command]
async fn request_ntp_time() -> Result<NtpResponse, String> {
    tauri::async_runtime::spawn_blocking(request_ntp_time_blocking)
        .await
        .map_err(|error| error.to_string())?
}

fn request_ntp_time_blocking() -> Result<NtpResponse, String> {
    let mut failures = Vec::with_capacity(NTP_SERVERS.len());

    for &server in NTP_SERVERS {
        match request_ntp_time_from_server(server) {
            Ok(response) => return Ok(response),
            Err(error) => failures.push(format!("{server}: {error}")),
        }
    }

    Err(format!("all NTP servers failed: {}", failures.join("; ")))
}

fn request_ntp_time_from_server(server: &str) -> Result<NtpResponse, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    socket
        .set_read_timeout(Some(Duration::from_millis(NTP_TIMEOUT_MS)))
        .map_err(|error| error.to_string())?;
    socket
        .set_write_timeout(Some(Duration::from_millis(NTP_TIMEOUT_MS)))
        .map_err(|error| error.to_string())?;
    socket.connect(server).map_err(|error| error.to_string())?;

    let mut request = [0_u8; NTP_PACKET_LENGTH];
    request[0] = 0x1b;
    let started_at_epoch_ms = epoch_ms()?;
    request[40..].copy_from_slice(&ntp_request_timestamp(started_at_epoch_ms)?);
    socket.send(&request).map_err(|error| error.to_string())?;

    let mut response = [0_u8; NTP_PACKET_LENGTH];
    let response_length = socket
        .recv(&mut response)
        .map_err(|error| error.to_string())?;
    let finished_at_epoch_ms = epoch_ms()?;

    if response_length < NTP_PACKET_LENGTH {
        return Err("incomplete NTP response".to_owned());
    }
    if response[1] == 0 || response[0] & 0b111 != 4 {
        return Err("invalid NTP server response".to_owned());
    }
    if response[24..32] != request[40..48] {
        return Err("NTP response did not match the request".to_owned());
    }

    let server_received_at_epoch_ms = ntp_timestamp(&response, 32)?;
    let server_transmitted_at_epoch_ms = ntp_timestamp(&response, 40)?;
    let server_processing_ms = server_transmitted_at_epoch_ms - server_received_at_epoch_ms;
    let round_trip_ms = (finished_at_epoch_ms - started_at_epoch_ms - server_processing_ms).max(0);
    let offset_ms = ((server_received_at_epoch_ms - started_at_epoch_ms)
        + (server_transmitted_at_epoch_ms - finished_at_epoch_ms))
        / 2;

    Ok(NtpResponse {
        checked_at_epoch_ms: finished_at_epoch_ms,
        offset_ms,
        round_trip_ms,
    })
}

#[tauri::command]
async fn request_time(strategy_id: String) -> Result<HttpResponse, String> {
    let (method, url, cache_bust) =
        strategy_request(&strategy_id).ok_or("unknown time strategy")?;
    let request_url = if cache_bust {
        cache_busted_url(url)?
    } else {
        url.to_owned()
    };
    let timeout_ms = if cache_bust { 1000 } else { 3500 };
    let mut request = http_client()?
        .request(
            method
                .parse()
                .map_err(|error| format!("invalid method: {error}"))?,
            request_url,
        )
        .header("Cache-Control", "no-cache")
        .header("User-Agent", "FloatingClock/0.1")
        .timeout(Duration::from_millis(timeout_ms));

    if cache_bust {
        request = request.header("Pragma", "no-cache");
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
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

fn setup_tray(app: &tauri::App, shortcut_available: bool) -> tauri::Result<()> {
    let toggle_label = if shortcut_available {
        "显示或隐藏"
    } else {
        "显示或隐藏（快捷键不可用）"
    };
    let show_hide = MenuItem::with_id(
        app,
        "toggle",
        toggle_label,
        true,
        shortcut_available.then_some(SHORTCUT),
    )?;
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
    let mini = CheckMenuItem::with_id(app, "mini-mode", "Mini 模式", true, false, None::<&str>)?;
    let click_through =
        CheckMenuItem::with_id(app, "click-through", "鼠标穿透", true, false, None::<&str>)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let installed_build = running_installed_build();
    let update = MenuItem::with_id(
        app,
        "update",
        if installed_build {
            "检查更新"
        } else {
            "便携版不支持自动更新"
        },
        installed_build,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_hide,
            &show,
            &separator,
            &launch_at_login,
            &topmost,
            &mini,
            &click_through,
            &separator_two,
            &update,
            &quit,
        ],
    )?;

    app.manage(ControlsMenu {
        launch_at_login,
        topmost,
        mini,
        click_through,
    });
    app.manage(UpdateMenu {
        item: update,
        available: AtomicBool::new(false),
        busy: AtomicBool::new(false),
    });

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .expect("application icon is missing")
                .clone(),
        )
        .tooltip(if shortcut_available {
            "悬浮时钟 - Ctrl+Alt+T 显示或隐藏"
        } else {
            "悬浮时钟 - 全局快捷键不可用"
        })
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
                let enabled = !app
                    .state::<ControlsState>()
                    .standard_topmost
                    .load(Ordering::Relaxed);
                let _ = apply_topmost(app, enabled);
            }
            "mini-mode" => {
                let enabled = !app.state::<ControlsState>().mini.load(Ordering::Relaxed);
                let _ = apply_presentation(app, enabled, MINI_WINDOW_MIN_WIDTH);
            }
            "click-through" => {
                let enabled = !app
                    .state::<ControlsState>()
                    .click_through
                    .load(Ordering::Relaxed);
                let _ = apply_click_through(app, enabled);
            }
            "update" => {
                let install = app.state::<UpdateMenu>().available.load(Ordering::Relaxed);
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    check_for_update(app, install, true).await;
                });
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .build(),
        )
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("show-main-on-ready")
                .on_window_ready(|window| {
                    if window.label() == "main" {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
                .build(),
        )
        .manage(ControlsState {
            standard_topmost: AtomicBool::new(true),
            click_through: AtomicBool::new(false),
            mini: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            get_window_controls,
            hide_window,
            quit,
            request_ntp_time,
            request_time,
            set_launch_at_login,
            set_topmost,
            set_window_presentation,
        ])
        .setup(|app| {
            let shortcut_available = match app.global_shortcut().register(SHORTCUT) {
                Ok(()) => true,
                Err(error) => {
                    eprintln!("Global shortcut {SHORTCUT} is unavailable: {error}");
                    false
                }
            };
            setup_tray(app, shortcut_available)?;
            if running_installed_build() {
                let app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_update(app, false, false).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        effective_topmost, normalize_mini_width, ntp_request_timestamp, ntp_timestamp,
        should_hide_window_for_shortcut, strategy_request, supports_self_update,
        topmost_change_allowed, MINI_WINDOW_MAX_WIDTH, MINI_WINDOW_MIN_WIDTH, NTP_SERVERS,
    };

    #[test]
    fn network_command_only_accepts_known_time_strategies() {
        assert!(strategy_request("jd-request-id").is_some());
        assert!(strategy_request("taobao-timestamp").is_some());
        assert!(strategy_request("meituan-server-time").is_some());
        assert!(strategy_request("meituan-flash-server-time").is_some());
        assert!(strategy_request("meituan-flash-phase").is_some());
        assert!(strategy_request("taobao-flash-timestamp").is_some());
        assert!(strategy_request("damai-timestamp").is_some());
        assert!(strategy_request("damai-phase").is_some());
        assert!(strategy_request("https://example.com").is_none());
    }

    #[test]
    fn parses_fractional_ntp_timestamps() {
        let mut packet = [0_u8; 48];
        packet[40..48].copy_from_slice(&ntp_request_timestamp(1_700_000_000_500).unwrap());

        assert_eq!(ntp_timestamp(&packet, 40).unwrap(), 1_700_000_000_500);
    }

    #[test]
    fn ntp_uses_ntsc_as_primary_with_verified_fallbacks() {
        assert_eq!(NTP_SERVERS[0], "ntp.ntsc.ac.cn:123");
        assert!(NTP_SERVERS.contains(&"ntp.tencent.com:123"));
        assert!(NTP_SERVERS.contains(&"ntp.aliyun.com:123"));
        assert!(NTP_SERVERS.contains(&"time.cloudflare.com:123"));
    }

    #[test]
    fn shortcut_only_hides_the_focused_window() {
        assert!(should_hide_window_for_shortcut(true, true));
        assert!(!should_hide_window_for_shortcut(true, false));
        assert!(!should_hide_window_for_shortcut(false, false));
    }

    #[test]
    fn mini_mode_forces_topmost_without_losing_standard_preference() {
        assert!(!effective_topmost(false, false));
        assert!(effective_topmost(true, false));
        assert!(effective_topmost(false, true));
        assert!(effective_topmost(true, true));
    }

    #[test]
    fn mini_mode_rejects_topmost_changes() {
        assert!(topmost_change_allowed(false));
        assert!(!topmost_change_allowed(true));
    }

    #[test]
    fn mini_width_is_finite_and_bounded() {
        assert_eq!(normalize_mini_width(f64::NAN), MINI_WINDOW_MIN_WIDTH);
        assert_eq!(normalize_mini_width(1.0), MINI_WINDOW_MIN_WIDTH);
        assert_eq!(normalize_mini_width(320.0), 320.0);
        assert_eq!(normalize_mini_width(10_000.0), MINI_WINDOW_MAX_WIDTH);
    }

    #[test]
    fn only_installed_executable_name_enables_self_update() {
        assert!(supports_self_update(Some("floating-clock.exe")));
        assert!(supports_self_update(Some("FLOATING-CLOCK.EXE")));
        assert!(!supports_self_update(Some(
            "FloatingClock-0.1.4-tauri-win-x64.exe"
        )));
        assert!(!supports_self_update(None));
    }
}
