const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Tauri bridge reuses the browser time-source pipeline", async () => {
  const calls = [];
  const window = {
    __TAURI__: {
      core: {
        invoke: async (command, arguments) => {
          calls.push({ command, arguments });
          return {
            body: JSON.stringify({ server_time: Date.now() }),
            headers: {},
            statusCode: 200,
          };
        },
      },
      event: { listen: async () => () => {} },
    },
  };
  const context = vm.createContext({ console, Date, JSON, Promise, window });

  for (const file of ["time-core.js", "time-sources.js", "tauri-bridge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"), context);
  }

  const result = await window.floatingClock.syncSource("pinduoduo");
  assert.equal(result.strategyId, "pdd-server-time");
  assert.deepEqual(calls.map(({ command }) => command), ["request_time", "request_time", "request_time"]);
  assert.deepEqual(calls.map(({ arguments }) => arguments.strategyId), [
    "pdd-server-time",
    "pdd-server-time",
    "pdd-server-time",
  ]);

  await window.floatingClock.close();
  assert.equal(calls.at(-1).command, "quit");
});

test("Tauri bridge exposes the fixed NTP command for Beijing time", async () => {
  const calls = [];
  const window = {
    __TAURI__: {
      core: {
        invoke: async (command) => {
          calls.push(command);
          if (command === "request_ntp_time") {
            return { checkedAtEpochMs: 1020, offsetMs: 990, roundTripMs: 20 };
          }
          throw new Error(`Unexpected command: ${command}`);
        },
      },
      event: { listen: async () => () => {} },
    },
  };
  const context = vm.createContext({ console, Date, JSON, Promise, window });

  for (const file of ["time-core.js", "time-sources.js", "tauri-bridge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"), context);
  }

  const result = await window.floatingClock.syncSource("beijing");
  assert.equal(result.strategyId, "ntsc-ntp");
  assert.deepEqual(calls, ["request_ntp_time", "request_ntp_time", "request_ntp_time"]);
});

test("Tauri bridge exposes Mini presentation changes", async () => {
  const calls = [];
  const listeners = new Map();
  const window = {
    __TAURI__: {
      core: {
        invoke: async (command, arguments) => {
          calls.push({ command, arguments });
          if (command === "set_window_presentation") {
            return { mini: arguments.mini };
          }
          throw new Error(`Unexpected command: ${command}`);
        },
      },
      event: {
        listen: async (eventName, callback) => {
          listeners.set(eventName, callback);
          return () => listeners.delete(eventName);
        },
      },
    },
  };
  const context = vm.createContext({ Promise, window });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "tauri-bridge.js"), "utf8"), context);

  const result = await window.floatingClock.setWindowPresentation(true, 320);
  assert.equal(result.mini, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "set_window_presentation");
  assert.equal(calls[0].arguments.mini, true);
  assert.equal(calls[0].arguments.width, 320);

  let received = null;
  await window.floatingClock.onWindowPresentationChanged((presentation) => {
    received = presentation;
  });
  listeners.get("window-presentation-changed")({ payload: { mini: false } });
  assert.equal(received.mini, false);
});

test("Meituan falls back to its own seconds-level Date calibration when the millisecond endpoint fails", async () => {
  const calls = [];
  const baseDate = 1_700_000_000_000;
  const dates = [baseDate + 1000, baseDate + 2000].map((value) => new Date(value).toUTCString());
  const timestamps = [0, 0, 0, 100, 450, 500, 800];
  const MockDate = function MockDate(...argumentsList) {
    return new Date(...argumentsList);
  };
  MockDate.now = () => timestamps.shift() || 800;
  MockDate.parse = Date.parse;
  const window = {
    __TAURI__: {
      core: {
        invoke: async (command, arguments) => {
          calls.push({ command, arguments });
          if (arguments.strategyId === "meituan-server-time") {
            throw new Error("HTTP 403");
          }
          return { body: "", headers: { date: dates.shift() }, statusCode: 200 };
        },
      },
      event: { listen: async () => () => {} },
    },
  };
  const context = vm.createContext({
    console,
    Date: MockDate,
    JSON,
    Promise,
    setTimeout: (callback) => callback(),
    window,
  });

  for (const file of ["time-core.js", "time-sources.js", "tauri-bridge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"), context);
  }

  const result = await window.floatingClock.syncSource("meituan");
  assert.equal(result.strategyId, "meituan-phase");
  assert.equal(result.precision, "second");
  assert.equal(result.precisionLabel, "秒级");
  assert.equal(result.uncertaintyMs, 350);
  assert.deepEqual(calls.map(({ command }) => command), [
    "request_time",
    "request_time",
    "request_time",
    "request_time",
    "request_time",
  ]);
  assert.deepEqual(calls.map(({ arguments }) => arguments.strategyId), [
    "meituan-server-time",
    "meituan-server-time",
    "meituan-server-time",
    "meituan-phase",
    "meituan-phase",
  ]);
});

test("a direct millisecond field falls back to seconds display when network uncertainty is too high", async () => {
  const timestamps = [100, 360, 600, 860, 1100, 1360];
  const MockDate = function MockDate(...argumentsList) {
    return new Date(...argumentsList);
  };
  MockDate.now = () => timestamps.shift() || 1360;
  MockDate.parse = Date.parse;
  const window = {
    __TAURI__: {
      core: {
        invoke: async () => ({
          body: JSON.stringify({ server_time: 1_700_000_000_000 }),
          headers: {},
          statusCode: 200,
        }),
      },
      event: { listen: async () => () => {} },
    },
  };
  const context = vm.createContext({ console, Date: MockDate, JSON, Promise, window });

  for (const file of ["time-core.js", "time-sources.js", "tauri-bridge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"), context);
  }

  const result = await window.floatingClock.syncSource("pinduoduo");
  assert.equal(result.strategyId, "pdd-server-time");
  assert.equal(result.uncertaintyMs, 130);
  assert.equal(result.precision, "second");
  assert.equal(result.precisionLabel, "秒级");
});

test("Beijing keeps millisecond display after any valid NTP response", async () => {
  const window = {
    __TAURI__: {
      core: {
        invoke: async (command) => {
          assert.equal(command, "request_ntp_time");
          return { checkedAtEpochMs: 1_700_000_000_000, offsetMs: 15, roundTripMs: 500 };
        },
      },
      event: { listen: async () => () => {} },
    },
  };
  const context = vm.createContext({ console, Date, JSON, Promise, window });

  for (const file of ["time-core.js", "time-sources.js", "tauri-bridge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"), context);
  }

  const result = await window.floatingClock.syncSource("beijing");
  assert.equal(result.roundTripMs, 500);
  assert.equal(result.uncertaintyMs, 250);
  assert.equal(result.precision, "millisecond");
  assert.equal(result.precisionLabel, "毫秒级");
});

test("listed sources report their actual precision and include Damai", async () => {
  const baseDate = Math.floor(Date.now() / 1000) * 1000;
  const phaseCalls = new Map();
  const window = {
    __TAURI__: {
      core: {
        invoke: async (command, arguments = {}) => {
          if (command === "request_ntp_time") {
            return { checkedAtEpochMs: baseDate, offsetMs: 0, roundTripMs: 20 };
          }

          const { strategyId } = arguments;
          if (strategyId === "pdd-server-time") {
            return { body: JSON.stringify({ server_time: baseDate }), headers: {}, statusCode: 200 };
          }
          if (strategyId === "taobao-timestamp" || strategyId === "taobao-flash-timestamp" || strategyId === "damai-timestamp") {
            return { body: JSON.stringify({ data: { t: baseDate } }), headers: {}, statusCode: 200 };
          }
          if (strategyId === "jd-request-id") {
            return {
              body: "",
              headers: {
                date: new Date(baseDate).toUTCString(),
                "x-api-request-id": `10192119733-147598-${baseDate}`,
              },
              statusCode: 200,
            };
          }
          if (strategyId === "meituan-server-time" || strategyId === "meituan-flash-server-time") {
            return {
              body: JSON.stringify({ data: baseDate, message: "成功", status: 0 }),
              headers: {},
              statusCode: 200,
            };
          }

          const count = phaseCalls.get(strategyId) || 0;
          phaseCalls.set(strategyId, count + 1);
          return {
            body: "",
            headers: { date: new Date(baseDate + count * 1000).toUTCString() },
            statusCode: 200,
          };
        },
      },
      event: { listen: async () => () => {} },
    },
  };
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Promise,
    setTimeout: (callback) => callback(),
    window,
  });

  for (const file of ["time-core.js", "time-sources.js", "tauri-bridge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"), context);
  }

  assert.deepEqual(
    Array.from((await window.floatingClock.getSources()).map(({ id }) => id)),
    ["beijing", "jd", "pinduoduo", "taobao", "meituan", "meituan-flash", "taobao-flash", "damai"],
  );

  const expectedPrecision = {
    beijing: "millisecond",
    jd: "millisecond",
    pinduoduo: "millisecond",
    taobao: "millisecond",
    meituan: "millisecond",
    "meituan-flash": "millisecond",
    "taobao-flash": "millisecond",
    damai: "millisecond",
  };

  for (const [sourceId, precision] of Object.entries(expectedPrecision)) {
    const result = await window.floatingClock.syncSource(sourceId);
    assert.equal(result.precision, precision);
    assert.ok(Number.isFinite(result.offsetMs));
  }
});
