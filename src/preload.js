const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("floatingClock", {
  close: () => ipcRenderer.send("window:close"),
  minimize: () => ipcRenderer.send("window:minimize"),
  getSources: () => ipcRenderer.invoke("clock:sources"),
  syncSource: (sourceId) => ipcRenderer.invoke("clock:sync", sourceId),
  getWindowControls: () => ipcRenderer.invoke("window:controls"),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("window:launch-at-login", enabled),
  setTopmost: (enabled) => ipcRenderer.invoke("window:topmost", enabled),
  onWindowControlsChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("window:controls-changed", listener);

    return () => ipcRenderer.removeListener("window:controls-changed", listener);
  },
});
