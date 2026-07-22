(function exposeCountdownCore() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;

  function getNextHour(epochMs) {
    return Math.floor(epochMs / HOUR_MS) * HOUR_MS + HOUR_MS;
  }

  function getNextBeijingTargetAtTime(epochMs, time) {
    const [hour, minute] = time.split(":").map(Number);
    const current = getBeijingDateParts(epochMs);
    const targetEpochMs = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      hour - 8,
      minute,
      0,
      0,
    );

    return targetEpochMs > epochMs ? targetEpochMs : targetEpochMs + DAY_MS;
  }

  function isFutureTarget(targetEpochMs, sourceNowEpochMs) {
    return Number.isFinite(targetEpochMs) && targetEpochMs > sourceNowEpochMs;
  }

  function getBeijingDateParts(epochMs) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(epochMs);
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));

    return {
      year: values.year,
      month: values.month,
      day: values.day,
    };
  }

  const countdownCore = {
    getNextBeijingTargetAtTime,
    getNextHour,
    isFutureTarget,
  };

  if (typeof module !== "undefined") {
    module.exports = countdownCore;
  }

  if (typeof window !== "undefined") {
    window.countdownCore = countdownCore;
  }
}());
