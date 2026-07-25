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
  offsetStatus: document.querySelector("#offsetStatus"),
  precisionNotice: document.querySelector("#precisionNotice"),
  sourceMenu: document.querySelector("#sourceMenu"),
  sourceOptions: document.querySelector("#sourceOptions"),
  sourceSelect: document.querySelector("#sourceSelect"),
  sourceSelectValue: document.querySelector("#sourceSelectValue"),
  startCountdownButton: document.querySelector("#startCountdownButton"),
  stopCountdownButton: document.querySelector("#stopCountdownButton"),
  syncButton: document.querySelector("#syncButton"),
  syncStatus: document.querySelector("#syncStatus"),
  targetInput: document.querySelector("#targetInput"),
  titlebar: document.querySelector(".titlebar"),
  quickTargetButtons: document.querySelectorAll("[data-quick-target]"),
};
const {
  getNextBeijingTargetAtTime,
  getNextHour,
  isFutureTarget,
} = window.countdownCore;

const CRITICAL_WINDOW_MS = 5000;
const AUTO_SYNC_INTERVAL_MS = 10 * 60_000;
const MINI_WINDOW_MIN_WIDTH = 236;
const STANDARD_WINDOW_WIDTH = 392;
const STORAGE_KEYS = {
  mode: "floatingClock.mode",
  sourceId: "floatingClock.sourceId",
};
const state = {
  countdownTargetEpochMs: null,
  hasValidOffset: false,
  launchAtLogin: false,
  mode: readStoredMode(),
  offsetMs: 0,
  offsetSourceId: null,
  presentation: "standard",
  precisionNotice: "",
  showMilliseconds: true,
  sourcePrecision: "unknown",
  sourceSupportsMilliseconds: null,
  timePrecisionUserChosen: false,
  topmost: true,
  miniResizeFrame: null,
  miniValueLength: null,
  miniWidth: MINI_WINDOW_MIN_WIDTH,
  sourceId: readStoredSourceId(),
  sources: [],
  syncTimer: null,
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

bootstrap();

async function bootstrap() {
  bindEvents();
  updateTimePrecisionControls();
  updatePrecisionNotice();
  setDefaultCountdownTarget();
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
  }

  updateSourceSelect();
  setMode(state.mode);
  await syncSelectedSource();
  render();
  window.setInterval(render, 16);
  state.syncTimer = window.setInterval(syncSelectedSource, AUTO_SYNC_INTERVAL_MS);
}

function bindEvents() {
  elements.closeButton.addEventListener("click", () => window.floatingClock.close());
  elements.topmostButton.addEventListener("click", toggleWindowTopmost);
  elements.minimizeButton.addEventListener("click", () => window.floatingClock.minimize());
  elements.clockValue.addEventListener("click", toggleTimePrecision);
  elements.countdownValue.addEventListener("click", toggleTimePrecision);
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
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (state.presentation === "standard" && elements.sourceMenu.open) {
      elements.sourceMenu.open = false;
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
  elements.syncButton.disabled = true;
  elements.syncStatus.textContent = "校准中...";

  try {
    const syncResult = await window.floatingClock.syncSource(state.sourceId);
    state.offsetMs = syncResult.offsetMs;
    state.offsetSourceId = syncResult.sourceId;
    state.sourcePrecision = syncResult.precision;
    state.sourceSupportsMilliseconds = syncResult.supportsMilliseconds;
    if (!state.timePrecisionUserChosen) {
      state.showMilliseconds = syncResult.precision === "millisecond";
    }
    state.precisionNotice = getPrecisionNotice(syncResult);
    state.hasValidOffset = true;
    updateTimePrecisionControls();
    updatePrecisionNotice();
    updateTargetInputMinimum();
    const quality = syncResult.calibrationWindowMs === undefined
      ? `RTT ${syncResult.roundTripMs} ms`
      : `校准窗 ${syncResult.calibrationWindowMs} ms`;
    elements.syncStatus.textContent = `${syncResult.sourceLabel} · ${syncResult.strategyLabel} · ${quality}`;
    elements.offsetStatus.textContent =
      `${syncResult.precisionLabel} · 误差 ±${syncResult.uncertaintyMs} ms · 偏移 ${formatSignedMs(syncResult.offsetMs)}`;
  } catch (error) {
    const sourceLabel = getSelectedSource()?.label || "时间源";
    elements.syncStatus.textContent = `${sourceLabel}校准失败`;

    if (state.hasValidOffset && state.offsetSourceId === state.sourceId) {
      elements.offsetStatus.textContent = `保留偏移 ${formatSignedMs(state.offsetMs)}`;
      state.precisionNotice = `${sourceLabel}校准失败，沿用上次校准`;
    } else {
      state.offsetMs = 0;
      state.offsetSourceId = null;
      state.hasValidOffset = false;
      state.sourcePrecision = "unknown";
      state.sourceSupportsMilliseconds = null;
      elements.offsetStatus.textContent = "暂用本机时间";
      state.precisionNotice = `${sourceLabel}校准失败，暂用本机时间`;
    }

    updateTimePrecisionControls();
    updatePrecisionNotice();

    console.error(error);
  } finally {
    elements.syncButton.disabled = false;
  }
}

async function selectSource(sourceId) {
  elements.sourceMenu.open = false;
  document.activeElement?.blur();

  if (sourceId === state.sourceId) {
    return;
  }

  state.sourceId = sourceId;
  state.sourcePrecision = "unknown";
  state.sourceSupportsMilliseconds = null;
  state.timePrecisionUserChosen = false;
  state.precisionNotice = "";
  updateTimePrecisionControls();
  updatePrecisionNotice();
  localStorage.setItem(STORAGE_KEYS.sourceId, state.sourceId);
  updateSourceSelect();
  await syncSelectedSource();
}

function getSelectedSource() {
  return state.sources.find(({ id }) => id === state.sourceId);
}

function updateSourceSelect() {
  const selectedSource = getSelectedSource();
  elements.sourceSelectValue.textContent = selectedSource?.label || "时间源";
  elements.sourceSelect.title = selectedSource?.description || "";
  elements.miniSource.textContent = selectedSource?.label || "时间源";

  elements.sourceOptions.querySelectorAll(".source-option").forEach((option) => {
    const selected = option.dataset.sourceId === state.sourceId;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}

function render() {
  const sourceNow = Date.now() + state.offsetMs;
  const clockParts = getBeijingTimeParts(sourceNow);
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
  state.timePrecisionUserChosen = true;
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

function getPrecisionNotice(syncResult) {
  if (syncResult.precision === "millisecond") {
    return "";
  }

  return syncResult.supportsMilliseconds
    ? "毫秒校准失败"
    : "非平台级严格毫秒";
}

function updatePrecisionNotice() {
  elements.precisionNotice.hidden = !state.precisionNotice;
  elements.precisionNotice.textContent = state.precisionNotice;
}

function setDefaultCountdownTarget() {
  const nextHour = getNextHour(getSourceNow());
  elements.targetInput.value = toBeijingInputValue(nextHour);
  updateTargetInputMinimum();
}

function startCountdown() {
  const sourceNow = getSourceNow();
  const target = parseBeijingInput(elements.targetInput.value);
  if (!Number.isFinite(target)) {
    elements.countdownValue.textContent = "目标时间无效";
    return;
  }

  if (!isFutureTarget(target, sourceNow)) {
    elements.countdownValue.textContent = "请选择未来时间";
    elements.targetInput.value = toBeijingInputValue(getNextHour(sourceNow));
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

function getBeijingTimeParts(epochMs) {
  const parts = timeFormatter.formatToParts(epochMs);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: String(Math.floor(epochMs % 1000)).padStart(3, "0"),
  };
}

function isClockCritical(epochMs) {
  const nextHourDistanceMs = 3_600_000 - positiveModulo(epochMs, 3_600_000);

  return nextHourDistanceMs <= CRITICAL_WINDOW_MS;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function setCriticalState(element, isCritical) {
  element.classList.toggle("critical", isCritical);
}

function setQuickCountdownTarget(target) {
  const sourceNow = getSourceNow();
  const targetEpochMs = target === "next-hour"
    ? getNextHour(sourceNow)
    : getNextBeijingTargetAtTime(sourceNow, target);

  elements.targetInput.value = toBeijingInputValue(targetEpochMs);
  startCountdown();
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

function updateTargetInputMinimum(epochMs = getSourceNow()) {
  elements.targetInput.min = toBeijingInputValue(epochMs + 1);
}

function getSourceNow() {
  return Date.now() + state.offsetMs;
}

function canToggleTimePrecision() {
  return state.hasValidOffset && state.sourcePrecision !== "unknown";
}

function formatTimePrecision(value) {
  return state.showMilliseconds && canToggleTimePrecision() ? value : value.replace(/\.\d{3}$/, "");
}

function formatDisplayDate(timestamp) {
  const parts = dateFormatter.formatToParts(timestamp);
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
