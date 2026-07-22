const {
  buildDateBoundarySample,
  buildNtpSample,
  buildSample,
  parseHttpDate,
  parsePinduoduoBody,
  parsePinduoduoYakTime,
  parseTaobaoBody,
  selectBestSample,
} = typeof module !== "undefined" ? require("./time-core") : window.timeCore;

const SAMPLE_COUNT = 3;
const PHASE_PROBE_COUNT = 14;
const PHASE_PROBE_DELAY_MS = 80;
const MAX_PHASE_UNCERTAINTY_MS = 100;

const sources = {
  beijing: {
    id: "beijing",
    label: "北京时间",
    description: "国家授时中心 NTP",
    strategies: [
      {
        id: "ntsc-ntp",
        label: "国家授时中心 NTP",
        precisionLabel: "毫秒级",
        type: "ntp",
      },
    ],
  },
  jd: {
    id: "jd",
    label: "京东时间",
    description: "京东 API 秒边界校准",
    strategies: [
      {
        id: "jd-phase",
        label: "京东 API 相位校准",
        precisionLabel: "毫秒校准",
        type: "date-boundary",
        method: "GET",
        url: "https://api.m.jd.com/",
      },
    ],
  },
  pinduoduo: {
    id: "pinduoduo",
    label: "拼多多时间",
    description: "拼多多服务器时间",
    strategies: [
      {
        id: "pdd-server-time",
        label: "拼多多 _stm",
        precisionLabel: "毫秒级",
        method: "GET",
        url: "https://api.pinduoduo.com/api/server/_stm",
        parse: ({ body }) => parsePinduoduoBody(body),
      },
      {
        id: "pdd-yak-time",
        label: "拼多多 yak-timeinfo",
        precisionLabel: "毫秒级",
        method: "HEAD",
        url: "https://www.pinduoduo.com/",
        parse: ({ headers }) => parsePinduoduoYakTime(headers),
      },
      {
        id: "pdd-phase",
        label: "拼多多 Date 相位校准",
        precisionLabel: "毫秒校准",
        type: "date-boundary",
        method: "GET",
        url: "https://www.pinduoduo.com/",
      },
    ],
  },
  taobao: {
    id: "taobao",
    label: "淘宝时间",
    description: "淘宝 H5 时间戳",
    strategies: [
      {
        id: "taobao-timestamp",
        label: "淘宝 H5 时间戳",
        precisionLabel: "毫秒级",
        method: "GET",
        url: "https://h5api.m.taobao.com/h5/mtop.common.gettimestamp/1.0/",
        parse: ({ body }) => parseTaobaoBody(body),
      },
      {
        id: "taobao-phase",
        label: "淘宝 Date 相位校准",
        precisionLabel: "毫秒校准",
        type: "date-boundary",
        method: "GET",
        url: "https://www.taobao.com/",
      },
    ],
  },
  meituan: {
    id: "meituan",
    label: "美团时间",
    description: "美团官网秒边界校准",
    strategies: [
      {
        id: "meituan-phase",
        label: "美团官网相位校准",
        precisionLabel: "毫秒校准",
        type: "date-boundary",
        method: "GET",
        url: "https://www.meituan.com/",
      },
    ],
  },
  "meituan-flash": {
    id: "meituan-flash",
    label: "美团闪购时间",
    description: "美团闪购官网秒边界校准",
    strategies: [
      {
        id: "meituan-flash-phase",
        label: "美团闪购相位校准",
        precisionLabel: "毫秒校准",
        type: "date-boundary",
        method: "GET",
        url: "https://brandhub.meituan.com/",
      },
    ],
  },
  "taobao-flash": {
    id: "taobao-flash",
    label: "淘宝闪购时间",
    description: "淘宝闪购官网秒边界校准",
    strategies: [
      {
        id: "taobao-flash-phase",
        label: "淘宝闪购相位校准",
        precisionLabel: "毫秒校准",
        type: "date-boundary",
        method: "GET",
        url: "https://www.ele.me/",
      },
    ],
  },
};

function getPublicSources() {
  return Object.values(sources).map(({ id, label, description }) => ({
    id,
    label,
    description,
  }));
}

async function synchronizeSource(sourceId) {
  const source = sources[sourceId];

  if (!source) {
    throw new Error(`Unknown time source: ${sourceId}`);
  }

  const failures = [];

  for (const strategy of source.strategies) {
    const samples = [];
    const sampleCount = strategy.type === "date-boundary" ? 1 : SAMPLE_COUNT;

    for (let attempt = 0; attempt < sampleCount; attempt += 1) {
      try {
        samples.push(await collectSample(strategy));
      } catch (error) {
        failures.push(`${strategy.label}: ${error.message}`);
      }
    }

    if (samples.length) {
      return {
        sourceId: source.id,
        sourceLabel: source.label,
        ...selectBestSample(samples),
      };
    }
  }

  throw new Error(failures.at(-1) || `${source.label} synchronization failed.`);
}

async function collectSample(strategy) {
  if (strategy.type === "ntp") {
    return collectNtpSample(strategy);
  }

  if (strategy.type === "date-boundary") {
    return collectDateBoundarySample(strategy);
  }

  return collectHttpSample(strategy);
}

async function collectNtpSample(strategy) {
  return buildNtpSample(await window.floatingClock.requestNtpTime(), strategy);
}

async function collectDateBoundarySample(strategy) {
  let previous;

  for (let attempt = 0; attempt < PHASE_PROBE_COUNT; attempt += 1) {
    const current = await collectHttpDateSample(strategy);

    if (previous && current.remoteEpochMs === previous.remoteEpochMs + 1000) {
      const sample = buildDateBoundarySample(previous, current, strategy);
      if (sample.uncertaintyMs <= MAX_PHASE_UNCERTAINTY_MS) {
        return sample;
      }
    }

    previous = current;

    if (attempt < PHASE_PROBE_COUNT - 1) {
      await delay(PHASE_PROBE_DELAY_MS);
    }
  }

  throw new Error(`${strategy.label} did not produce a ${MAX_PHASE_UNCERTAINTY_MS} ms phase window.`);
}

async function collectHttpSample(strategy) {
  const startedAtMs = Date.now();
  const response = await requestText(strategy);
  const finishedAtMs = Date.now();

  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}`);
  }

  const remoteEpochMs = strategy.parse(response);
  return buildSample(remoteEpochMs, startedAtMs, finishedAtMs, strategy);
}

async function collectHttpDateSample(strategy) {
  const startedAtMs = Date.now();
  const response = await requestText(strategy);
  const finishedAtMs = Date.now();

  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}`);
  }

  const age = getHeader(response.headers, "age");
  if (age !== undefined && (!Number.isFinite(Number(age)) || Number(age) > 0)) {
    throw new Error("Cached HTTP response.");
  }

  return {
    startedAtMs,
    finishedAtMs,
    remoteEpochMs: parseHttpDate(response.headers),
  };
}

function requestText(strategy) {
  return window.floatingClock.requestTime(strategy.id);
}

function getHeader(headers, name) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const timeSources = {
  getPublicSources,
  synchronizeSource,
};

if (typeof module !== "undefined") {
  module.exports = timeSources;
}

if (typeof window !== "undefined") {
  window.timeSources = timeSources;
}
