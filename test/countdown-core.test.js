const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  getNextBeijingTargetAtTime,
  getNextLocalHour,
  getNextLocalTargetAtTime,
  getNextHour,
  isFutureTarget,
} = require("../src/countdown-core");

test("moves a passed Beijing quick target to tomorrow", () => {
  const sourceNow = Date.UTC(2026, 4, 22, 4, 11, 37);

  assert.equal(
    getNextBeijingTargetAtTime(sourceNow, "10:00"),
    Date.UTC(2026, 4, 23, 2, 0, 0),
  );
});

test("keeps an upcoming Beijing quick target on the current day", () => {
  const sourceNow = Date.UTC(2026, 4, 22, 4, 11, 37);

  assert.equal(
    getNextBeijingTargetAtTime(sourceNow, "20:00"),
    Date.UTC(2026, 4, 22, 12, 0, 0),
  );
});

test("uses the system local calendar for local quick targets", () => {
  const sourceNow = new Date(2026, 4, 22, 9, 30, 15, 250).getTime();
  const nextHour = new Date(getNextLocalHour(sourceNow));
  const nextTen = new Date(getNextLocalTargetAtTime(sourceNow, "10:00"));
  const nextEight = new Date(getNextLocalTargetAtTime(sourceNow, "08:00"));

  assert.equal(nextHour.getHours(), 10);
  assert.equal(nextHour.getMinutes(), 0);
  assert.equal(nextHour.getSeconds(), 0);
  assert.equal(nextTen.getDate(), 22);
  assert.equal(nextTen.getHours(), 10);
  assert.equal(nextTen.getMinutes(), 0);
  assert.equal(nextEight.getDate(), 23);
  assert.equal(nextEight.getHours(), 8);
});

test("requires countdown targets to be later than source time", () => {
  assert.equal(getNextHour(Date.UTC(2026, 4, 22, 4, 11, 37)), Date.UTC(2026, 4, 22, 5, 0, 0));
  assert.equal(isFutureTarget(Date.UTC(2026, 4, 22, 5, 0, 0), Date.UTC(2026, 4, 22, 4, 11, 37)), true);
  assert.equal(isFutureTarget(Date.UTC(2026, 4, 22, 4, 11, 37), Date.UTC(2026, 4, 22, 4, 11, 37)), false);
  assert.equal(isFutureTarget(Date.UTC(2026, 4, 22, 4, 0, 0), Date.UTC(2026, 4, 22, 4, 11, 37)), false);
});

test("quick countdown targets wait for the explicit start action", () => {
  const app = fs.readFileSync(
    path.join(__dirname, "..", "src", "renderer", "app.js"),
    "utf8",
  );
  const quickTargetHandler = app.match(
    /function setQuickCountdownTarget\(target\) \{[\s\S]*?\n\}/,
  )?.[0];
  const targetInput = {
    value: "",
    classList: { add() {}, remove() {} },
    offsetWidth: 0,
  };
  const targetValues = {
    "next-hour": 1000,
    "10:00": 2000,
    "20:00": 3000,
  };
  let started = false;
  let flashes = 0;

  assert.ok(quickTargetHandler);
  const context = {
    elements: { targetInput },
    flashTargetInput: () => {
      flashes += 1;
    },
    getNextTargetAtTime: (_sourceNow, target) => targetValues[target],
    getNextTargetHour: () => targetValues["next-hour"],
    getSourceNow: () => 123,
    parseTargetInput: (value) => Number(value),
    startCountdown: () => {
      started = true;
    },
    toTargetInputValue: (target) => String(target),
  };

  for (const target of ["next-hour", "10:00", "20:00"]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      vm.runInNewContext(`(${quickTargetHandler})(${JSON.stringify(target)})`, context);
      assert.equal(targetInput.value, String(targetValues[target]));
    }
  }

  assert.equal(started, false);
  assert.equal(flashes, 3);
});

test("keeps browser script helpers out of the renderer global lexical scope", () => {
  const browserContext = vm.createContext({
    Date,
    Intl,
    module: { exports: {} },
    window: {},
  });
  const browserScript = fs.readFileSync(
    path.join(__dirname, "..", "src", "countdown-core.js"),
    "utf8",
  );

  vm.runInContext(browserScript, browserContext);
  vm.runInContext(
    "const { getNextHour } = window.countdownCore; window.nextHour = getNextHour(0);",
    browserContext,
  );

  assert.equal(browserContext.window.nextHour, 60 * 60 * 1000);
});
