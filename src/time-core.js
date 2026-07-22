(function exposeTimeCore() {
function parseHttpDate(headers) {
  const rawValue = headers.date;
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const epochMs = Date.parse(value);

  if (!Number.isFinite(epochMs)) {
    throw new Error("The response did not include a valid Date header.");
  }

  return epochMs;
}

function parsePinduoduoBody(body) {
  const payload = JSON.parse(body);
  const epochMs = Number(payload.server_time);

  if (!Number.isFinite(epochMs)) {
    throw new Error("Pinduoduo did not return server_time.");
  }

  return epochMs;
}

function parsePinduoduoYakTime(headers) {
  const rawValue = headers["yak-timeinfo"];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const firstField = typeof value === "string" ? value.split("|")[0] : "";
  const epochMs = Number(firstField);

  if (!Number.isFinite(epochMs)) {
    throw new Error("Pinduoduo did not return yak-timeinfo.");
  }

  return epochMs;
}

function parseTaobaoBody(body) {
  const payload = JSON.parse(body);
  const epochMs = Number(payload?.data?.t);

  if (!Number.isFinite(epochMs)) {
    throw new Error("Taobao did not return data.t.");
  }

  return epochMs;
}

function buildSample(remoteEpochMs, startedAtMs, finishedAtMs, strategy) {
  const roundTripMs = Math.max(0, finishedAtMs - startedAtMs);
  const midpointMs = startedAtMs + roundTripMs / 2;

  return {
    checkedAtEpochMs: finishedAtMs,
    offsetMs: Math.round(remoteEpochMs - midpointMs),
    roundTripMs: Math.round(roundTripMs),
    strategyId: strategy.id,
    strategyLabel: strategy.label,
    precisionLabel: strategy.precisionLabel,
    uncertaintyMs: Math.ceil(roundTripMs / 2),
  };
}

function buildDateBoundarySample(previous, next, strategy) {
  if (next.remoteEpochMs !== previous.remoteEpochMs + 1000) {
    throw new Error("Date samples did not cross one server-second boundary.");
  }

  const lowerBoundOffsetMs = next.remoteEpochMs - next.finishedAtMs;
  const upperBoundOffsetMs = next.remoteEpochMs - previous.startedAtMs;
  const calibrationWindowMs = Math.max(0, upperBoundOffsetMs - lowerBoundOffsetMs);

  return {
    checkedAtEpochMs: next.finishedAtMs,
    offsetMs: Math.round((lowerBoundOffsetMs + upperBoundOffsetMs) / 2),
    roundTripMs: Math.round(next.finishedAtMs - next.startedAtMs),
    calibrationWindowMs: Math.round(calibrationWindowMs),
    uncertaintyMs: Math.ceil(calibrationWindowMs / 2),
    strategyId: strategy.id,
    strategyLabel: strategy.label,
    precisionLabel: strategy.precisionLabel,
  };
}

function buildNtpSample(response, strategy) {
  const checkedAtEpochMs = Number(response.checkedAtEpochMs);
  const offsetMs = Number(response.offsetMs);
  const roundTripMs = Number(response.roundTripMs);

  if (![checkedAtEpochMs, offsetMs, roundTripMs].every(Number.isFinite)) {
    throw new Error("NTP response did not include a valid sample.");
  }

  return {
    checkedAtEpochMs,
    offsetMs: Math.round(offsetMs),
    roundTripMs: Math.max(0, Math.round(roundTripMs)),
    uncertaintyMs: Math.ceil(Math.max(0, roundTripMs) / 2),
    strategyId: strategy.id,
    strategyLabel: strategy.label,
    precisionLabel: strategy.precisionLabel,
  };
}

function selectBestSample(samples) {
  if (!samples.length) {
    throw new Error("No time samples were collected.");
  }

  return [...samples].sort((left, right) => left.roundTripMs - right.roundTripMs)[0];
}

const timeCore = {
  buildDateBoundarySample,
  buildNtpSample,
  buildSample,
  parseHttpDate,
  parsePinduoduoBody,
  parsePinduoduoYakTime,
  parseTaobaoBody,
  selectBestSample,
};

if (typeof module !== "undefined") {
  module.exports = timeCore;
}

if (typeof window !== "undefined") {
  window.timeCore = timeCore;
}
}());
