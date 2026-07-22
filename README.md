# Floating Clock

Windows floating clock built with Electron for time-sensitive shopping tasks.

## Features

- Frameless always-on-top clock window that can be dragged from the title bar.
- Fixed-size window with a taskbar entry plus tray recall controls.
- Single-instance startup that brings back the running overlay instead of duplicating it.
- Global `Ctrl+Alt+T` show-hide shortcut and tray menu for fast recall.
- Saved window placement and remembered last selected mode/time source.
- Tray toggles for launch-at-login and mouse click-through mode.
- Title-bar topmost toggle for keeping the overlay above other windows only when needed.
- Switch between real-time clock mode and Beijing-time countdown mode.
- Countdown quick targets for the next hour and the next upcoming `10:00` or `20:00`.
- Critical-second highlighting for the last five seconds before each hour or countdown target.
- Switch time sources between Beijing time, JD, Pinduoduo, and Taobao.
- Source calibration runs in the Electron main process and uses the best of three samples.
- Falls back from millisecond marketplace endpoints to response-header time when needed.

## Time Sources

| Source | Primary strategy | Fallback |
| --- | --- | --- |
| Beijing time | `www.ntsc.ac.cn` `Date` header | local time after a sync failure |
| JD | `api.m.jd.com` `Date` header | local time after a sync failure |
| Pinduoduo | `api.pinduoduo.com/api/server/_stm` | `yak-timeinfo`, then `Date` |
| Taobao | `h5api.m.taobao.com` timestamp payload | `www.taobao.com` `Date` header |

Header-based sources are only second-resolution and can be affected by response caching or network delay. The UI shows which strategy and precision were actually used.

Closing or minimizing the window hides it to the tray. Use `Ctrl+Alt+T`, the tray icon, or the tray menu to bring it back. Exit from the tray menu when you want the app to stop running.

Launch-at-login and mouse click-through are tray-menu controls. Click-through makes the overlay ignore mouse input until you toggle that tray item off again. The title-bar diamond toggles whether the overlay stays above other windows.

## Run

```powershell
npm install
npm start
```

## Test

```powershell
npm test
```
