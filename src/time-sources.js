const {
  buildSample,
  parseHttpDate,
  parsePinduoduoBody,
  parsePinduoduoYakTime,
  parseTaobaoBody,
  selectBestSample,
} = typeof module !== "undefined" ? require("./time-core") : window.timeCore;

const SAMPLE_COUNT = 3;
const REQUEST_TIMEOUT_MS = 3500;

const sources = {
  beijing: {
    id: "beijing",
    label: "北京时间",
    description: "国家授时中心响应头",
    strategies: [
      {
        id: "ntsc-date",
        label: "国家授时中心 Date",
        precisionLabel: "秒级",
        method: "HEAD",
        url: "https://www.ntsc.ac.cn/",
        parse: ({ headers }) => parseHttpDate(headers),
      },
    ],
  },
  jd: {
    id: "jd",
    label: "京东时间",
    description: "京东 API 响应头",
    strategies: [
      {
        id: "jd-date",
        label: "京东 API Date",
        precisionLabel: "秒级",
        method: "GET",
        url: "https://api.m.jd.com/",
        parse: ({ headers }) => parseHttpDate(headers),
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
        id: "pdd-date",
        label: "拼多多 Date",
        precisionLabel: "秒级",
        method: "HEAD",
        url: "https://www.pinduoduo.com/",
        parse: ({ headers }) => parseHttpDate(headers),
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
        id: "taobao-date",
        label: "淘宝 Date",
        precisionLabel: "秒级",
        method: "HEAD",
        url: "https://www.taobao.com/",
        parse: ({ headers }) => parseHttpDate(headers),
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

    for (let attempt = 0; attempt < SAMPLE_COUNT; attempt += 1) {
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
  const startedAtMs = Date.now();
  const response = await requestText(strategy);
  const finishedAtMs = Date.now();

  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}`);
  }

  const remoteEpochMs = strategy.parse(response);
  return buildSample(remoteEpochMs, startedAtMs, finishedAtMs, strategy);
}

function requestText(strategy) {
  if (typeof window !== "undefined") {
    return window.floatingClock.requestTime(strategy.id);
  }

  const { request } = require("node:https");
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      strategy.url,
      {
        method: strategy.method,
        headers: {
          "Cache-Control": "no-cache",
          "User-Agent": "FloatingClock/0.1",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const chunks = [];

        response.setEncoding("utf8");
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            body: chunks.join(""),
            headers: response.headers,
            statusCode: response.statusCode || 0,
          });
        });
      },
    );

    clientRequest.on("timeout", () => {
      clientRequest.destroy(new Error("Request timed out."));
    });
    clientRequest.on("error", reject);
    clientRequest.end();
  });
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
