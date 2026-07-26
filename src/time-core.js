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

function parseJdRequestId(headers) {
  const rawValue = headers["x-api-request-id"];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const tail = typeof value === "string" ? value.split("-").at(-1) : "";

  if (!/^\d{13}$/.test(tail)) {
    throw new Error("JD did not return a millisecond X-API-Request-Id.");
  }

  const epochMs = Number(tail);
  const dateEpochMs = parseHttpDate(headers);

  if (Math.abs(epochMs - dateEpochMs) > 3000) {
    throw new Error("JD X-API-Request-Id disagreed with the Date header.");
  }

  return epochMs;
}

function parseMeituanBody(body) {
  const payload = JSON.parse(body);
  const epochMs = Number(payload?.data);

  if (payload?.status !== 0 || !Number.isFinite(epochMs)) {
    throw new Error("Meituan did not return a server time.");
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
    precision: strategy.precision,
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
    precision: strategy.precision,
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
    precision: strategy.precision,
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
  parseJdRequestId,
  parseMeituanBody,
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
