(function installTauriBridge() {
  if (window.floatingClock || !window.__TAURI__) {
    return;
  }

  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  window.floatingClock = {
    close: () => invoke("quit"),
    minimize: () => invoke("hide_window"),
    getSources: () => Promise.resolve(window.timeSources.getPublicSources()),
    syncSource: (sourceId) => window.timeSources.synchronizeSource(sourceId),
    requestTime: (strategyId) => invoke("request_time", { strategyId }),
    getWindowControls: () => invoke("get_window_controls"),
    setLaunchAtLogin: (enabled) => invoke("set_launch_at_login", { enabled }),
    setTopmost: (enabled) => invoke("set_topmost", { enabled }),
    onWindowControlsChanged: (callback) => {
      const unlisten = listen("window-controls-changed", ({ payload }) => callback(payload));
      return async () => (await unlisten)();
    },
  };
}());
