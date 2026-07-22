const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} = require("electron");
const { getPublicSources, synchronizeSource } = require("./time-sources");

const TOGGLE_SHORTCUT = "CommandOrControl+Alt+T";
const WINDOW_SIZE = {
  width: 392,
  height: 392,
};
const MIN_VISIBLE_PIXELS = 56;

let mainWindow;
let tray;
let isQuitting = false;
let isClickThrough = false;
let isWindowTopmost = true;
let saveWindowPositionTimer;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function createWindow() {
  const initialPosition = getStoredWindowPosition();

  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    ...initialPosition,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: isWindowTopmost,
    resizable: false,
    maximizable: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applyWindowTopmost();
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("moved", scheduleWindowPositionSave);
  mainWindow.on("close", (event) => {
    saveWindowPosition();

    if (!isQuitting) {
      event.preventDefault();
      hideWindow();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("悬浮时钟 - Ctrl+Alt+T 显示或隐藏");
  refreshTrayMenu();
  tray.on("click", toggleWindow);
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示或隐藏",
        accelerator: TOGGLE_SHORTCUT,
        click: toggleWindow,
      },
      {
        label: "显示",
        click: () => showWindow({ focus: true }),
      },
      { type: "separator" },
      {
        label: "开机启动",
        type: "checkbox",
        checked: getLaunchAtLogin(),
        click: ({ checked }) => setLaunchAtLogin(checked),
      },
      {
        label: "窗口置顶",
        type: "checkbox",
        checked: isWindowTopmost,
        click: ({ checked }) => setWindowTopmost(checked),
      },
      {
        label: "鼠标穿透",
        type: "checkbox",
        checked: isClickThrough,
        click: ({ checked }) => setClickThrough(checked),
      },
      { type: "separator" },
      {
        label: "退出",
        click: quitApp,
      },
    ]),
  );
}

function createTrayIcon() {
  const iconFile = process.platform === "win32" ? "tray-clock.ico" : "tray-clock.png";
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", iconFile));

  if (icon.isEmpty()) {
    throw new Error(`Failed to load tray icon asset: ${iconFile}`);
  }

  return icon;
}

function registerGlobalShortcut() {
  const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggleWindowFromShortcut);

  if (!registered) {
    console.warn(`Failed to register global shortcut: ${TOGGLE_SHORTCUT}`);
  }
}

function toggleWindowFromShortcut() {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) {
    hideWindow();
    return;
  }

  showWindow({ focus: true });
}

function toggleWindow() {
  if (mainWindow?.isVisible()) {
    hideWindow();
    return;
  }

  showWindow();
}

function showWindow({ focus = false } = {}) {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  applyWindowTopmost();

  if (focus) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow.showInactive();
}

function getWindowControlsState() {
  return {
    clickThrough: isClickThrough,
    launchAtLogin: getLaunchAtLogin(),
    topmost: isWindowTopmost,
  };
}

function getLaunchAtLogin() {
  return app.getLoginItemSettings().openAtLogin;
}

function setLaunchAtLogin(openAtLogin) {
  app.setLoginItemSettings({ openAtLogin });
  refreshTrayMenu();
  return getWindowControlsState();
}

function setWindowTopmost(topmost) {
  isWindowTopmost = Boolean(topmost);
  applyWindowTopmost();
  mainWindow?.webContents.send("window:controls-changed", getWindowControlsState());
  refreshTrayMenu();
  return getWindowControlsState();
}

function applyWindowTopmost() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setAlwaysOnTop(isWindowTopmost, "screen-saver");
}

function setClickThrough(clickThrough) {
  isClickThrough = Boolean(clickThrough);
  mainWindow?.setIgnoreMouseEvents(isClickThrough, { forward: true });
  mainWindow?.webContents.send("window:controls-changed", getWindowControlsState());
  refreshTrayMenu();
  return getWindowControlsState();
}

function hideWindow() {
  mainWindow?.hide();
}

function quitApp() {
  isQuitting = true;
  saveWindowPosition();
  app.quit();
}

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function getStoredWindowPosition() {
  try {
    const savedState = JSON.parse(fs.readFileSync(getWindowStatePath(), "utf8"));
    const position = {
      x: Number(savedState.x),
      y: Number(savedState.y),
    };

    if (isWindowPositionVisible(position)) {
      return position;
    }
  } catch (error) {
    return {};
  }

  return {};
}

function isWindowPositionVisible(position) {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return false;
  }

  return screen.getAllDisplays().some(({ workArea }) => {
    const visibleWidth =
      Math.min(position.x + WINDOW_SIZE.width, workArea.x + workArea.width) -
      Math.max(position.x, workArea.x);
    const visibleHeight =
      Math.min(position.y + WINDOW_SIZE.height, workArea.y + workArea.height) -
      Math.max(position.y, workArea.y);

    return visibleWidth >= MIN_VISIBLE_PIXELS && visibleHeight >= MIN_VISIBLE_PIXELS;
  });
}

function scheduleWindowPositionSave() {
  clearTimeout(saveWindowPositionTimer);
  saveWindowPositionTimer = setTimeout(saveWindowPosition, 250);
}

function saveWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { x, y } = mainWindow.getBounds();

  try {
    fs.mkdirSync(path.dirname(getWindowStatePath()), { recursive: true });
    fs.writeFileSync(getWindowStatePath(), JSON.stringify({ x, y }, null, 2));
  } catch (error) {
    console.warn("Failed to persist the floating clock window position.", error);
  }
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow({ focus: true }));

  app.whenReady().then(() => {
    ipcMain.handle("clock:sources", () => getPublicSources());
    ipcMain.handle("clock:sync", (_event, sourceId) => synchronizeSource(sourceId));
    ipcMain.handle("window:controls", getWindowControlsState);
    ipcMain.handle("window:launch-at-login", (_event, enabled) => setLaunchAtLogin(enabled));
    ipcMain.handle("window:topmost", (_event, enabled) => setWindowTopmost(enabled));
    ipcMain.on("window:minimize", hideWindow);
    ipcMain.on("window:close", () => mainWindow?.close());

    createWindow();
    createTray();
    registerGlobalShortcut();

    app.on("activate", () => {
      if (!mainWindow) {
        createWindow();
        return;
      }

      showWindow({ focus: true });
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  saveWindowPosition();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
