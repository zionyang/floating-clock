const {
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
} = typeof module !== "undefined" ? require("./time-core") : window.timeCore;

const SAMPLE_COUNT = 3;
const PHASE_PROBE_COUNT = 14;
const PHASE_PROBE_DELAY_MS = 80;
const MAX_MILLISECOND_UNCERTAINTY_MS = 100;

const PUBLIC_SOURCE_IDS = [
  "local",
  "beijing",
  "jd",
  "jd-seconds",
  "meituan",
  "meituan-flash",
  "taobao",
  "taobao-flash",
  "damai",
  "pinduoduo",
];

const sources = {
  local: {
    id: "local",
    label: "本机时间",
    description: "显示当前系统时间",
    kind: "local",
  },
  beijing: {
    id: "beijing",
    label: "北京时间",
    description: "用于通用倒计时",
    strategies: [
      {
        id: "ntsc-ntp",
        label: "国家授时中心 NTP",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        type: "ntp",
      },
    ],
  },
  jd: {
    id: "jd",
    label: "京东时间",
    description: "用于京东活动",
    strategies: [
      {
        id: "jd-request-id",
        label: "京东 API 毫秒时间戳",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "HEAD",
        url: "https://api.m.jd.com/",
        parse: ({ headers }) => parseJdRequestId(headers),
      },
      {
        id: "jd-phase",
        label: "京东 API 相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "GET",
        url: "https://api.m.jd.com/",
      },
    ],
  },
  "jd-seconds": {
    id: "jd-seconds",
    label: "京东秒送时间",
    description: "用于京东秒送活动",
    calibrationSourceId: "jd",
  },
  pinduoduo: {
    id: "pinduoduo",
    label: "拼多多时间",
    description: "用于拼多多活动",
    strategies: [
      {
        id: "pdd-server-time",
        label: "拼多多 _stm",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "GET",
        url: "https://api.pinduoduo.com/api/server/_stm",
        parse: ({ body }) => parsePinduoduoBody(body),
      },
      {
        id: "pdd-yak-time",
        label: "拼多多 yak-timeinfo",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "HEAD",
        url: "https://www.pinduoduo.com/",
        parse: ({ headers }) => parsePinduoduoYakTime(headers),
      },
      {
        id: "pdd-phase",
        label: "拼多多 Date 相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "GET",
        url: "https://www.pinduoduo.com/",
      },
    ],
  },
  taobao: {
    id: "taobao",
    label: "淘宝时间",
    description: "用于淘宝活动",
    strategies: [
      {
        id: "taobao-timestamp",
        label: "淘宝 H5 时间戳",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "GET",
        url: "https://h5api.m.taobao.com/h5/mtop.common.gettimestamp/1.0/",
        parse: ({ body }) => parseTaobaoBody(body),
      },
      {
        id: "taobao-phase",
        label: "淘宝 Date 相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "GET",
        url: "https://www.taobao.com/",
      },
    ],
  },
  meituan: {
    id: "meituan",
    label: "美团时间",
    description: "用于美团活动",
    strategies: [
      {
        id: "meituan-server-time",
        label: "美团服务器时间",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "GET",
        url: "https://cube.meituan.com/ipromotion/cube/toc/component/base/getServerCurrentTime",
        parse: ({ body }) => parseMeituanBody(body),
      },
      {
        id: "meituan-phase",
        label: "美团官网相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "GET",
        url: "https://www.meituan.com/",
      },
    ],
  },
  "meituan-flash": {
    id: "meituan-flash",
    label: "美团闪购时间",
    description: "用于美团闪购活动",
    strategies: [
      {
        id: "meituan-flash-server-time",
        label: "美团服务器时间（闪购共用）",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "GET",
        url: "https://cube.meituan.com/ipromotion/cube/toc/component/base/getServerCurrentTime",
        parse: ({ body }) => parseMeituanBody(body),
      },
      {
        id: "meituan-flash-phase",
        label: "美团闪购相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "GET",
        url: "https://brandhub.meituan.com/",
      },
    ],
  },
  "taobao-flash": {
    id: "taobao-flash",
    label: "淘宝闪购时间",
    description: "用于淘宝闪购活动",
    strategies: [
      {
        id: "taobao-flash-timestamp",
        label: "饿了么 H5 时间戳",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "GET",
        url: "https://waimai-guide.ele.me/h5/mtop.common.gettimestamp/1.0/",
        parse: ({ body }) => parseTaobaoBody(body),
      },
      {
        id: "taobao-flash-phase",
        label: "淘宝闪购相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "GET",
        url: "https://www.ele.me/",
      },
    ],
  },
  damai: {
    id: "damai",
    label: "大麦时间",
    description: "用于大麦活动",
    strategies: [
      {
        id: "damai-timestamp",
        label: "大麦 H5 时间戳",
        precisionLabel: "毫秒级",
        precision: "millisecond",
        method: "GET",
        url: "https://mtop.damai.cn/h5/mtop.common.gettimestamp/1.0/",
        parse: ({ body }) => parseTaobaoBody(body),
      },
      {
        id: "damai-phase",
        label: "大麦官网相位校准",
        precisionLabel: "秒级",
        precision: "second",
        type: "date-boundary",
        method: "HEAD",
        url: "https://www.damai.cn/",
      },
    ],
  },
};

function getPublicSources() {
  return PUBLIC_SOURCE_IDS.map((id) => {
    const { label, description, kind = "calibrated" } = sources[id];
    return { id, label, description, kind };
  });
}

async function synchronizeSource(sourceId) {
  const selectedSource = sources[sourceId];

  if (!selectedSource) {
    throw new Error(`Unknown time source: ${sourceId}`);
  }

  if (selectedSource.kind === "local") {
    throw new Error("Local time does not require synchronization.");
  }

  const calibrationSource = sources[
    selectedSource.calibrationSourceId || selectedSource.id
  ];

  const failures = [];

  for (const strategy of calibrationSource.strategies) {
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
      const sample = selectBestSample(samples);
      return {
        sourceId: selectedSource.id,
        sourceLabel: selectedSource.label,
        ...toDisplayPrecision(sample),
      };
    }
  }

  throw new Error(
    failures.at(-1) || `${selectedSource.label} synchronization failed.`,
  );
}

function toDisplayPrecision(sample) {
  const supportsMilliseconds = sample.precision === "millisecond";

  if (sample.strategyId === "ntsc-ntp") {
    return { ...sample, supportsMilliseconds };
  }

  if (
    supportsMilliseconds
    && sample.uncertaintyMs > MAX_MILLISECOND_UNCERTAINTY_MS
  ) {
    return {
      ...sample,
      supportsMilliseconds,
      precision: "second",
      precisionLabel: "秒级",
    };
  }

  return { ...sample, supportsMilliseconds };
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
      return buildDateBoundarySample(previous, current, strategy);
    }

    previous = current;

    if (attempt < PHASE_PROBE_COUNT - 1) {
      await delay(PHASE_PROBE_DELAY_MS);
    }
  }

  throw new Error(`${strategy.label} did not produce a Date boundary.`);
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
