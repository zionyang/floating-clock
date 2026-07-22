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
