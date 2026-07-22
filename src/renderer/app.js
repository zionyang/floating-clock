const elements = {
  clockModeButton: document.querySelector("#clockModeButton"),
  clockPanel: document.querySelector("#clockPanel"),
  clockValue: document.querySelector("#clockValue"),
  closeButton: document.querySelector("#closeButton"),
  countdownModeButton: document.querySelector("#countdownModeButton"),
  countdownPanel: document.querySelector("#countdownPanel"),
  countdownValue: document.querySelector("#countdownValue"),
  dateValue: document.querySelector("#dateValue"),
  topmostButton: document.querySelector("#topmostButton"),
  minimizeButton: document.querySelector("#minimizeButton"),
  offsetStatus: document.querySelector("#offsetStatus"),
  sourceSelect: document.querySelector("#sourceSelect"),
  startCountdownButton: document.querySelector("#startCountdownButton"),
  stopCountdownButton: document.querySelector("#stopCountdownButton"),
  syncButton: document.querySelector("#syncButton"),
  syncStatus: document.querySelector("#syncStatus"),
  targetInput: document.querySelector("#targetInput"),
  quickTargetButtons: document.querySelectorAll("[data-quick-target]"),
};
const {
  getNextBeijingTargetAtTime,
  getNextHour,
  isFutureTarget,
} = window.countdownCore;

const CRITICAL_WINDOW_MS = 5000;
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
  topmost: true,
  sourceId: readStoredSourceId(),
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
  setDefaultCountdownTarget();
  updateWindowControls(await window.floatingClock.getWindowControls());
  window.floatingClock.onWindowControlsChanged(updateWindowControls);

  const sources = await window.floatingClock.getSources();
  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.label;
    option.title = source.description;
    elements.sourceSelect.append(option);
  }

  if (!elements.sourceSelect.querySelector(`option[value="${state.sourceId}"]`)) {
    state.sourceId = "beijing";
  }

  elements.sourceSelect.value = state.sourceId;
  setMode(state.mode);
  await syncSelectedSource();
  render();
  window.setInterval(render, 16);
  state.syncTimer = window.setInterval(syncSelectedSource, 60_000);
}

function bindEvents() {
  elements.closeButton.addEventListener("click", () => window.floatingClock.close());
  elements.topmostButton.addEventListener("click", toggleWindowTopmost);
  elements.minimizeButton.addEventListener("click", () => window.floatingClock.minimize());
  elements.syncButton.addEventListener("click", syncSelectedSource);
  elements.sourceSelect.addEventListener("change", async () => {
    state.sourceId = elements.sourceSelect.value;
    localStorage.setItem(STORAGE_KEYS.sourceId, state.sourceId);
    await syncSelectedSource();
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
    state.hasValidOffset = true;
    updateTargetInputMinimum();
    elements.syncStatus.textContent =
      `${syncResult.sourceLabel} · ${syncResult.strategyLabel} · RTT ${syncResult.roundTripMs} ms`;
    elements.offsetStatus.textContent =
      `${syncResult.precisionLabel} · 偏移 ${formatSignedMs(syncResult.offsetMs)}`;
  } catch (error) {
    elements.syncStatus.textContent = `${elements.sourceSelect.selectedOptions[0]?.textContent || "时间源"}校准失败`;

    if (state.hasValidOffset && state.offsetSourceId === state.sourceId) {
      elements.offsetStatus.textContent = `保留偏移 ${formatSignedMs(state.offsetMs)}`;
    } else {
      state.offsetMs = 0;
      state.offsetSourceId = null;
      state.hasValidOffset = false;
      elements.offsetStatus.textContent = "暂用本机时间";
    }

    console.error(error);
  } finally {
    elements.syncButton.disabled = false;
  }
}

function render() {
  const sourceNow = Date.now() + state.offsetMs;
  const clockParts = getBeijingTimeParts(sourceNow);
  updateTargetInputMinimum(sourceNow);

  elements.clockValue.textContent =
    `${clockParts.hour}:${clockParts.minute}:${clockParts.second}.${clockParts.millisecond}`;
  elements.dateValue.textContent = dateFormatter.format(sourceNow);
  setCriticalState(elements.clockValue, isClockCritical(sourceNow));

  if (state.countdownTargetEpochMs === null) {
    elements.countdownValue.textContent = "00:00:00.000";
    setCriticalState(elements.countdownValue, false);
    return;
  }

  const remainingMs = state.countdownTargetEpochMs - sourceNow;
  if (remainingMs <= 0) {
    stopCountdown();
    elements.countdownValue.textContent = "00:00:00.000";
    setCriticalState(elements.countdownValue, false);
    return;
  }

  elements.countdownValue.textContent = formatCountdown(remainingMs);
  setCriticalState(elements.countdownValue, remainingMs <= CRITICAL_WINDOW_MS);
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

function updateWindowControls(controls) {
  state.launchAtLogin = Boolean(controls.launchAtLogin);
  state.topmost = Boolean(controls.topmost);
  elements.topmostButton.classList.toggle("active", state.topmost);
  elements.topmostButton.textContent = state.topmost ? "◆" : "◇";
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
