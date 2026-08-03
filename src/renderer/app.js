const elements = {
  clockShell: document.querySelector("#clockShell"),
  clockModeButton: document.querySelector("#clockModeButton"),
  clockPanel: document.querySelector("#clockPanel"),
  clockPrecisionTooltip: document.querySelector("#clockPrecisionTooltip"),
  clockValue: document.querySelector("#clockValue"),
  closeButton: document.querySelector("#closeButton"),
  countdownModeButton: document.querySelector("#countdownModeButton"),
  countdownPanel: document.querySelector("#countdownPanel"),
  countdownPrecisionTooltip: document.querySelector("#countdownPrecisionTooltip"),
  countdownValue: document.querySelector("#countdownValue"),
  dateValue: document.querySelector("#dateValue"),
  topmostButton: document.querySelector("#topmostButton"),
  minimizeButton: document.querySelector("#minimizeButton"),
  miniCloseButton: document.querySelector("#miniCloseButton"),
  miniDate: document.querySelector("#miniDate"),
  miniMinimizeButton: document.querySelector("#miniMinimizeButton"),
  miniModeButton: document.querySelector("#miniModeButton"),
  miniPanel: document.querySelector(".mini-panel"),
  miniRestoreButton: document.querySelector("#miniRestoreButton"),
  miniSource: document.querySelector("#miniSource"),
  miniValue: document.querySelector("#miniValue"),
  sourceMenu: document.querySelector("#sourceMenu"),
  sourceOptions: document.querySelector("#sourceOptions"),
  sourceSelect: document.querySelector("#sourceSelect"),
  sourceSelectValue: document.querySelector("#sourceSelectValue"),
  sourceSwitchDialog: document.querySelector("#sourceSwitchDialog"),
  startCountdownButton: document.querySelector("#startCountdownButton"),
  stopCountdownButton: document.querySelector("#stopCountdownButton"),
  syncButton: document.querySelector("#syncButton"),
  syncStatus: document.querySelector("#syncStatus"),
  targetInput: document.querySelector("#targetInput"),
  targetTimeZoneLabel: document.querySelector("#targetTimeZoneLabel"),
  themeMenu: document.querySelector("#themeMenu"),
  themeOptions: document.querySelector("#themeOptions"),
  themeSelect: document.querySelector("#themeSelect"),
  themeOptionButtons: document.querySelectorAll(".theme-option"),
  titlebar: document.querySelector(".titlebar"),
  titleBadge: document.querySelector("#titleBadge"),
  titleMain: document.querySelector("#titleMain"),
  titleSubtitle: document.querySelector("#titleSubtitle"),
  quickTargetButtons: document.querySelectorAll("[data-quick-target]"),
};
const {
  getNextBeijingTargetAtTime,
  getNextLocalHour,
  getNextLocalTargetAtTime,
  getNextHour,
  isFutureTarget,
} = window.countdownCore;
const {
  formatTimePrecision: formatTimeValue,
  getDisplayPrecision,
} = window.timeCore;

const CRITICAL_WINDOW_MS = 5000;
const AUTO_SYNC_INTERVAL_MS = 10 * 60_000;
const MINI_WINDOW_MIN_WIDTH = 236;
const STANDARD_WINDOW_WIDTH = 392;
const LOCAL_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const THEME_TITLES = {
  amber: { title: "悬浮时钟", badge: "🌙", subtitle: "AMBER" },
  light: { title: "悬浮时钟", badge: "☀️", subtitle: "MIST" },
  black: { title: "悬浮时钟", badge: "🟢", subtitle: "JADE" },
  sakura: { title: "悬浮时钟", badge: "🌸", subtitle: "SAKURA" },
};
const THEME_IDS = new Set(Object.keys(THEME_TITLES));
const STORAGE_KEYS = {
  mode: "floatingClock.mode",
  sourceId: "floatingClock.sourceId",
  theme: "floatingClock.theme",
};
const state = {
  countdownTargetEpochMs: null,
  hasValidOffset: false,
  launchAtLogin: false,
  mode: readStoredMode(),
  offsetMs: 0,
  offsetSourceId: null,
  presentation: "standard",
  showMilliseconds: true,
  sourcePrecision: "unknown",
  sourceSupportsMilliseconds: null,
  topmost: true,
  miniResizeFrame: null,
  miniValueLength: null,
  miniWidth: MINI_WINDOW_MIN_WIDTH,
  sourceId: readStoredSourceId(),
  sources: [],
  syncDetails: null,
  syncStatusText: "准备校准",
  syncTimer: null,
  showSyncDetails: false,
  theme: readStoredTheme(),
};

const beijingDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const beijingTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

applyTheme(state.theme, false);
bootstrap();

async function bootstrap() {
  bindEvents();
  updateTimePrecisionControls();
  const controls = await window.floatingClock.getWindowControls();
  updateWindowControls(controls);
  applyPresentation(Boolean(controls.mini));
  window.floatingClock.onWindowControlsChanged(updateWindowControls);
  window.floatingClock.onWindowPresentationChanged((presentation) => {
    applyPresentation(Boolean(presentation.mini));
  });

  state.sources = await window.floatingClock.getSources();
  for (const source of state.sources) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "source-option";
    option.dataset.sourceId = source.id;
    option.textContent = source.label;
    option.title = source.description;
    option.addEventListener("click", () => selectSource(source.id));
    elements.sourceOptions.append(option);
  }

  if (!state.sources.some(({ id }) => id === state.sourceId)) {
    state.sourceId = "beijing";
    localStorage.setItem(STORAGE_KEYS.sourceId, state.sourceId);
  }

  updateSourceSelect();
  setDefaultCountdownTarget();
  setMode(state.mode);
  await syncSelectedSource();
  refreshAutoSyncTimer();
  render();
  window.setInterval(render, 16);
}

function bindEvents() {
  elements.closeButton.addEventListener("click", () => window.floatingClock.close());
  elements.topmostButton.addEventListener("click", toggleWindowTopmost);
  elements.minimizeButton.addEventListener("click", () => window.floatingClock.minimize());
  elements.clockValue.addEventListener("click", toggleTimePrecision);
  elements.countdownValue.addEventListener("click", toggleTimePrecision);
  elements.syncStatus.addEventListener("click", toggleSyncDetails);
  elements.titlebar.addEventListener("mousedown", (event) => {
    if (
      event.button !== 0
      || event.detail !== 2
      || event.target.closest("button, input, select, summary")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setWindowPresentation(true);
  }, true);
  elements.miniModeButton.addEventListener("click", () => setWindowPresentation(true));
  elements.miniRestoreButton.addEventListener("click", () => setWindowPresentation(false));
  elements.miniCloseButton.addEventListener("click", () => window.floatingClock.close());
  elements.miniMinimizeButton.addEventListener("click", () => window.floatingClock.minimize());
  elements.miniPanel.addEventListener("mousedown", (event) => {
    if (state.presentation !== "mini" || event.button !== 0 || event.detail !== 2) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setWindowPresentation(false);
  }, true);
  elements.miniPanel.addEventListener("dblclick", () => setWindowPresentation(false));
  elements.syncButton.addEventListener("click", syncSelectedSource);
  elements.themeOptionButtons.forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.theme));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (elements.sourceSwitchDialog.open) {
      event.preventDefault();
      elements.sourceSwitchDialog.close("cancel");
      return;
    }

    if (
      state.presentation === "standard"
      && (elements.sourceMenu.open || elements.themeMenu.open)
    ) {
      elements.sourceMenu.open = false;
      elements.themeMenu.open = false;
      document.activeElement?.blur();
      return;
    }

    document.activeElement?.blur();
    window.floatingClock.minimize();
  });
  document.addEventListener("click", (event) => {
    if (!elements.sourceMenu.contains(event.target)) {
      elements.sourceMenu.open = false;
    }
    if (!elements.themeMenu.contains(event.target)) {
      elements.themeMenu.open = false;
    }
  });

  elements.clockModeButton.addEventListener("click", () => setMode("clock"));
  elements.countdownModeButton.addEventListener("click", () => setMode("countdown"));
  elements.startCountdownButton.addEventListener("click", startCountdown);
  elements.stopCountdownButton.addEventListener("click", stopCountdown);
  elements.quickTargetButtons.forEach((button) => {
    button.addEventListener("click", () => setQuickCountdownTarget(button.dataset.quickTarget));
  });
}

async function syncSelectedSource() {
  if (isLocalTimeSource()) {
    applyLocalTime();
    return;
  }

  const sourceId = state.sourceId;
  elements.syncButton.disabled = true;
  setSyncStatus("同步中...", null);

  try {
    const syncResult = await window.floatingClock.syncSource(sourceId);
    if (sourceId !== state.sourceId) {
      return;
    }

    const hadValidOffset = state.hasValidOffset;
    state.offsetMs = syncResult.offsetMs;
    state.offsetSourceId = syncResult.sourceId;
    state.sourcePrecision = syncResult.precision;
    state.sourceSupportsMilliseconds = syncResult.supportsMilliseconds;
    state.showMilliseconds = getDisplayPrecision(
      state.showMilliseconds,
      hadValidOffset,
      syncResult.precision,
    );
    state.hasValidOffset = true;
    updateTimePrecisionControls();
    updateTargetInputMinimum();
    setSyncStatus(getSyncStatus(syncResult), {
      sourceLabel: syncResult.sourceLabel,
      strategyLabel: syncResult.strategyLabel,
      roundTripMs: syncResult.roundTripMs,
      calibrationWindowMs: syncResult.calibrationWindowMs,
      precisionLabel: syncResult.precisionLabel,
      uncertaintyMs: syncResult.uncertaintyMs,
      offsetMs: syncResult.offsetMs,
    });
  } catch (error) {
    if (sourceId !== state.sourceId) {
      return;
    }

    const sourceLabel = getSelectedSource()?.label || "时间源";
    if (state.hasValidOffset && state.offsetSourceId === state.sourceId) {
      setSyncStatus(`${sourceLabel} · 校准失败，沿用上次结果`);
    } else {
      state.offsetMs = 0;
      state.offsetSourceId = null;
      state.hasValidOffset = false;
      state.sourcePrecision = "unknown";
      state.sourceSupportsMilliseconds = null;
      setSyncStatus(`${sourceLabel} · 校准失败，暂用本机时间`, null);
    }

    updateTimePrecisionControls();

    console.error(error);
  } finally {
    if (sourceId === state.sourceId) {
      updateSyncControls();
    }
  }
}

async function selectSource(sourceId) {
  elements.sourceMenu.open = false;
  document.activeElement?.blur();

  if (sourceId === state.sourceId) {
    return;
  }

  if (
    state.countdownTargetEpochMs !== null
    && !(await confirmSourceSwitch())
  ) {
    return;
  }

  resetCountdownForSourceSwitch();
  state.sourceId = sourceId;
  state.sourcePrecision = "unknown";
  state.sourceSupportsMilliseconds = null;
  updateTimePrecisionControls();
  localStorage.setItem(STORAGE_KEYS.sourceId, state.sourceId);
  updateSourceSelect();
  refreshAutoSyncTimer();
  await syncSelectedSource();
}

function applyLocalTime() {
  state.offsetMs = 0;
  state.offsetSourceId = null;
  state.hasValidOffset = false;
  state.sourcePrecision = "millisecond";
  state.sourceSupportsMilliseconds = true;
  setSyncStatus("本机时间 · 未校准", null);
  updateTimePrecisionControls();
  updateTargetInputMinimum();
  updateSyncControls();
}

function refreshAutoSyncTimer() {
  if (state.syncTimer !== null) {
    window.clearInterval(state.syncTimer);
    state.syncTimer = null;
  }

  if (!isLocalTimeSource()) {
    state.syncTimer = window.setInterval(syncSelectedSource, AUTO_SYNC_INTERVAL_MS);
  }
}

function confirmSourceSwitch() {
  return new Promise((resolve) => {
    elements.sourceSwitchDialog.addEventListener(
      "close",
      () => resolve(elements.sourceSwitchDialog.returnValue === "confirm"),
      { once: true },
    );
    elements.sourceSwitchDialog.showModal();
  });
}

function resetCountdownForSourceSwitch() {
  stopCountdown();
  elements.targetInput.value = "";
}

function getSelectedSource() {
  return state.sources.find(({ id }) => id === state.sourceId);
}

function isLocalTimeSource() {
  return getSelectedSource()?.kind === "local";
}

function updateSourceSelect() {
  const selectedSource = getSelectedSource();
  elements.sourceSelectValue.textContent = selectedSource?.label || "时间源";
  elements.sourceSelect.title = selectedSource?.description || "";
  elements.miniSource.textContent = selectedSource?.label || "时间源";
  elements.targetTimeZoneLabel.textContent = isLocalTimeSource()
    ? "目标本机时间"
    : "目标北京时间";
  updateSyncControls();

  elements.sourceOptions.querySelectorAll(".source-option").forEach((option) => {
    const selected = option.dataset.sourceId === state.sourceId;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}

function updateSyncControls() {
  const localTime = isLocalTimeSource();
  elements.syncButton.disabled = localTime;
  elements.syncButton.title = localTime ? "本机时间无需校准" : "重新校准";
  elements.syncButton.setAttribute("aria-label", elements.syncButton.title);
}

function render() {
  const sourceNow = Date.now() + state.offsetMs;
  const clockParts = getClockTimeParts(sourceNow);
  const clockText = formatTimePrecision(
    `${clockParts.hour}:${clockParts.minute}:${clockParts.second}.${clockParts.millisecond}`,
  );
  const clockCritical = isClockCritical(sourceNow);
  updateTargetInputMinimum(sourceNow);

  elements.clockValue.textContent = clockText;
  const displayDate = formatDisplayDate(sourceNow);
  elements.dateValue.textContent = displayDate;
  elements.miniDate.textContent = displayDate;
  setCriticalState(elements.clockValue, clockCritical);

  let countdownText = "00:00:00.000";
  let countdownCritical = false;
  if (state.countdownTargetEpochMs === null) {
  } else {
    const remainingMs = state.countdownTargetEpochMs - sourceNow;
    if (remainingMs <= 0) {
      stopCountdown();
    } else {
      countdownText = formatCountdown(remainingMs);
      countdownCritical = remainingMs <= CRITICAL_WINDOW_MS;
    }
  }

  countdownText = formatTimePrecision(countdownText);
  elements.countdownValue.textContent = countdownText;

  setCriticalState(elements.countdownValue, countdownCritical);
  updateMiniValue(
    state.mode === "clock" ? clockText : countdownText,
    state.mode === "clock" ? clockCritical : countdownCritical,
  );
}

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem(STORAGE_KEYS.mode, mode);
  const clockMode = mode === "clock";

  elements.clockPanel.hidden = !clockMode;
  elements.countdownPanel.hidden = clockMode;
  elements.clockModeButton.classList.toggle("active", clockMode);
  elements.countdownModeButton.classList.toggle("active", !clockMode);
  elements.clockModeButton.setAttribute("aria-selected", String(clockMode));
  elements.countdownModeButton.setAttribute("aria-selected", String(!clockMode));
  render();
}

function toggleTimePrecision() {
  if (!canToggleTimePrecision()) {
    return;
  }

  state.showMilliseconds = !state.showMilliseconds;
  updateTimePrecisionControls();
  render();
}

function updateTimePrecisionControls() {
  const unavailable = !canToggleTimePrecision();
  const label = unavailable
    ? "毫秒显示不可用"
    : state.showMilliseconds
      ? "显示整秒"
      : "显示毫秒";

  [
    [elements.clockValue, elements.clockPrecisionTooltip],
    [elements.countdownValue, elements.countdownPrecisionTooltip],
  ].forEach(([value, tooltip]) => {
    value.setAttribute("aria-label", label);
    value.setAttribute("aria-disabled", String(unavailable));
    value.classList.toggle("precision-unavailable", unavailable);
    value.toggleAttribute("aria-describedby", !unavailable);
    tooltip.hidden = unavailable;
    tooltip.textContent = label;
  });
}

function getSyncStatus(syncResult) {
  if (syncResult.precision === "millisecond") {
    return `${syncResult.sourceLabel} · 已同步`;
  }

  return `${syncResult.sourceLabel} · ${syncResult.supportsMilliseconds
    ? "已同步，精度不足"
    : "已同步，已降级"}`;
}

function setSyncStatus(text, details = state.syncDetails) {
  state.syncStatusText = text;
  state.syncDetails = details;
  state.showSyncDetails = false;
  renderSyncStatus();
}

function toggleSyncDetails(event) {
  if (event.detail !== 3) {
    return;
  }

  event.preventDefault();
  state.showSyncDetails = !state.showSyncDetails;
  renderSyncStatus();
}

function renderSyncStatus() {
  elements.syncStatus.textContent = state.showSyncDetails
    ? formatSyncDetails(state.syncDetails)
    : state.syncStatusText;
  elements.syncStatus.classList.toggle("sync-status-details", state.showSyncDetails);
}

function formatSyncDetails(details) {
  if (!details) {
    return "暂无校时详情";
  }

  const quality = details.calibrationWindowMs === undefined
    ? `RTT ${details.roundTripMs} ms`
    : `校准窗 ${details.calibrationWindowMs} ms`;

  return `${details.sourceLabel} · ${details.strategyLabel} · ${quality}\n${details.precisionLabel} · 误差 ±${details.uncertaintyMs} ms · 偏移 ${formatSignedMs(details.offsetMs)}`;
}

function setDefaultCountdownTarget() {
  const nextHour = getNextTargetHour(getSourceNow());
  elements.targetInput.value = toTargetInputValue(nextHour);
  updateTargetInputMinimum();
}

function startCountdown() {
  const sourceNow = getSourceNow();
  const target = parseTargetInput(elements.targetInput.value);
  if (!Number.isFinite(target)) {
    elements.countdownValue.textContent = "目标时间无效";
    return;
  }

  if (!isFutureTarget(target, sourceNow)) {
    elements.countdownValue.textContent = "请选择未来时间";
    elements.targetInput.value = toTargetInputValue(getNextTargetHour(sourceNow));
    updateTargetInputMinimum(sourceNow);
    return;
  }

  state.countdownTargetEpochMs = target;
  setMode("countdown");
}

function stopCountdown() {
  state.countdownTargetEpochMs = null;
}

async function toggleWindowTopmost() {
  updateWindowControls(await window.floatingClock.setTopmost(!state.topmost));
}

async function setWindowPresentation(mini) {
  const presentation = await window.floatingClock.setWindowPresentation(
    mini,
    mini ? state.miniWidth : STANDARD_WINDOW_WIDTH,
  );
  applyPresentation(Boolean(presentation.mini));
}

function applyPresentation(mini) {
  state.presentation = mini ? "mini" : "standard";
  elements.clockShell.setAttribute("data-tauri-drag-region", mini ? "deep" : "false");
  elements.clockShell.classList.toggle("mini", mini);
  if (mini) {
    scheduleMiniResize(true);
  } else {
    state.miniValueLength = null;
  }
}

function updateMiniValue(value, critical) {
  elements.miniValue.textContent = value;
  setCriticalState(elements.miniValue, critical);

  const valueLengthChanged = state.miniValueLength !== value.length;
  state.miniValueLength = value.length;
  if (state.presentation === "mini" && valueLengthChanged) {
    scheduleMiniResize();
  }
}

function scheduleMiniResize(force = false) {
  if (state.presentation !== "mini" || state.miniResizeFrame !== null) {
    return;
  }

  state.miniResizeFrame = window.requestAnimationFrame(async () => {
    state.miniResizeFrame = null;
    const measuredWidth = Math.ceil(elements.miniValue.getBoundingClientRect().width + 40);
    const nextWidth = Math.max(MINI_WINDOW_MIN_WIDTH, measuredWidth);
    if (!force && nextWidth === state.miniWidth) {
      return;
    }

    state.miniWidth = nextWidth;
    try {
      await window.floatingClock.setWindowPresentation(true, nextWidth);
    } catch (error) {
      console.error(error);
    }
  });
}

function updateWindowControls(controls) {
  state.launchAtLogin = Boolean(controls.launchAtLogin);
  state.topmost = Boolean(controls.topmost);
  elements.topmostButton.classList.toggle("active", state.topmost);
  elements.topmostButton.title = state.topmost ? "取消窗口置顶" : "窗口置顶";
  elements.topmostButton.setAttribute("aria-label", elements.topmostButton.title);
}

function getClockTimeParts(epochMs) {
  return isLocalTimeSource()
    ? getLocalTimeParts(epochMs)
    : getBeijingTimeParts(epochMs);
}

function getBeijingTimeParts(epochMs) {
  const parts = beijingTimeFormatter.formatToParts(epochMs);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: String(Math.floor(epochMs % 1000)).padStart(3, "0"),
  };
}

function getLocalTimeParts(epochMs) {
  const value = new Date(epochMs);
  const pad = (number) => String(number).padStart(2, "0");

  return {
    hour: pad(value.getHours()),
    minute: pad(value.getMinutes()),
    second: pad(value.getSeconds()),
    millisecond: String(value.getMilliseconds()).padStart(3, "0"),
  };
}

function isClockCritical(epochMs) {
  const nextHourDistanceMs = getNextTargetHour(epochMs) - epochMs;

  return nextHourDistanceMs <= CRITICAL_WINDOW_MS;
}

function setCriticalState(element, isCritical) {
  element.classList.toggle("critical", isCritical);
}

function setQuickCountdownTarget(target) {
  const sourceNow = getSourceNow();
  const targetEpochMs = target === "next-hour"
    ? getNextTargetHour(sourceNow)
    : getNextTargetAtTime(sourceNow, target);

  elements.targetInput.value = toTargetInputValue(targetEpochMs);
  startCountdown();
}

function getNextTargetHour(epochMs) {
  return isLocalTimeSource() ? getNextLocalHour(epochMs) : getNextHour(epochMs);
}

function getNextTargetAtTime(epochMs, time) {
  return isLocalTimeSource()
    ? getNextLocalTargetAtTime(epochMs, time)
    : getNextBeijingTargetAtTime(epochMs, time);
}

function parseTargetInput(value) {
  return isLocalTimeSource() ? parseLocalInput(value) : parseBeijingInput(value);
}

function toTargetInputValue(epochMs) {
  return isLocalTimeSource() ? toLocalInputValue(epochMs) : toBeijingInputValue(epochMs);
}

function parseBeijingInput(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
  );

  if (!match) {
    return Number.NaN;
  }

  const [, year, month, day, hour, minute, second = "0", millisecond = "0"] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, "0")),
  );
}

function parseLocalInput(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
  );

  if (!match) {
    return Number.NaN;
  }

  const [, year, month, day, hour, minute, second = "0", millisecond = "0"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, "0")),
  ).getTime();
}

function toBeijingInputValue(epochMs) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(epochMs);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const millisecond = String(Math.floor(epochMs % 1000)).padStart(3, "0");

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${millisecond}`;
}

function toLocalInputValue(epochMs) {
  const value = new Date(epochMs);
  const pad = (number) => String(number).padStart(2, "0");
  const millisecond = String(value.getMilliseconds()).padStart(3, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${millisecond}`;
}

function updateTargetInputMinimum(epochMs = getSourceNow()) {
  elements.targetInput.min = toTargetInputValue(epochMs + 1);
}

function getSourceNow() {
  return Date.now() + state.offsetMs;
}

function canToggleTimePrecision() {
  return hasDisplayTimeBasis() && state.sourcePrecision !== "unknown";
}

function formatTimePrecision(value) {
  return formatTimeValue(value, state.showMilliseconds, hasDisplayTimeBasis());
}

function hasDisplayTimeBasis() {
  return isLocalTimeSource() || state.hasValidOffset;
}

function formatDisplayDate(timestamp) {
  if (isLocalTimeSource()) {
    const value = new Date(timestamp);
    const pad = (number) => String(number).padStart(2, "0");
    return `${value.getFullYear()}/${pad(value.getMonth() + 1)}/${pad(value.getDate())} ${LOCAL_WEEKDAYS[value.getDay()]}`;
  }

  const parts = beijingDateFormatter.formatToParts(timestamp);
  const weekday = parts.find(({ type }) => type === "weekday")?.value || "";
  const date = parts
    .filter(({ type }) => type !== "weekday")
    .map(({ value }) => value)
    .join("")
    .trim();

  return weekday ? `${date} ${weekday}` : date;
}

function formatCountdown(remainingMs) {
  const sign = remainingMs < 0 ? "+" : "";
  const absoluteMs = Math.abs(Math.trunc(remainingMs));
  const hours = Math.floor(absoluteMs / 3_600_000);
  const minutes = Math.floor((absoluteMs % 3_600_000) / 60_000);
  const seconds = Math.floor((absoluteMs % 60_000) / 1000);
  const milliseconds = absoluteMs % 1000;

  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatSignedMs(value) {
  return `${value >= 0 ? "+" : ""}${Math.round(value)} ms`;
}

function readStoredMode() {
  return localStorage.getItem(STORAGE_KEYS.mode) === "countdown" ? "countdown" : "clock";
}

function readStoredSourceId() {
  return localStorage.getItem(STORAGE_KEYS.sourceId) || "beijing";
}

function readStoredTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme);
  return THEME_IDS.has(theme) ? theme : "amber";
}

function applyTheme(theme, persist = true) {
  if (!THEME_IDS.has(theme)) {
    theme = "amber";
  }

  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  elements.titleMain.textContent = THEME_TITLES[theme].title;
  elements.titleBadge.textContent = THEME_TITLES[theme].badge;
  elements.titleSubtitle.textContent = THEME_TITLES[theme].subtitle;
  elements.themeMenu.open = false;

  elements.themeOptionButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
  });

  const label = elements.themeOptions.querySelector(`[data-theme="${theme}"]`)?.textContent || "琥珀暗";
  elements.themeSelect.title = `切换主题（当前：${label}）`;
  elements.themeSelect.setAttribute("aria-label", elements.themeSelect.title);

  if (persist) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }
}
