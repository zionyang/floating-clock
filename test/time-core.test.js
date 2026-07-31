const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDateBoundarySample,
  buildNtpSample,
  buildSample,
  formatTimePrecision,
  getDisplayPrecision,
  parseHttpDate,
  parseJdRequestId,
  parseMeituanBody,
  parsePinduoduoBody,
  parsePinduoduoYakTime,
  parseTaobaoBody,
  selectBestSample,
} = require("../src/time-core");

test("parses response timestamps from each supported payload shape", () => {
  assert.equal(
    parseHttpDate({ date: "Thu, 21 May 2026 03:39:17 GMT" }),
    Date.UTC(2026, 4, 21, 3, 39, 17),
  );
  assert.equal(parsePinduoduoBody('{"server_time":1779334800339}'), 1779334800339);
  assert.equal(parsePinduoduoYakTime({ "yak-timeinfo": "1779334701993|3" }), 1779334701993);
  assert.equal(parseTaobaoBody('{"data":{"t":"1779334837885"}}'), 1779334837885);
  assert.equal(
    parseJdRequestId({
      "x-api-request-id": "10192119733-147598-1779334800339",
      date: new Date(1779334800339).toUTCString(),
    }),
    1779334800339,
  );
  assert.equal(parseMeituanBody('{"data":1779334800339,"message":"成功","status":0}'), 1779334800339);
});

test("rejects JD request ids and Meituan payloads that fail validation", () => {
  const date = new Date(1779334800339).toUTCString();

  assert.throws(() => parseJdRequestId({ date }), /X-API-Request-Id/);
  assert.throws(
    () => parseJdRequestId({ "x-api-request-id": "10192119733-147598-12345", date }),
    /X-API-Request-Id/,
  );
  assert.throws(
    () => parseJdRequestId({
      "x-api-request-id": "10192119733-147598-1779334800339",
      date: new Date(1779334800339 + 60_000).toUTCString(),
    }),
    /disagreed with the Date header/,
  );
  assert.throws(() => parseMeituanBody('{"data":1779334800339,"status":1}'), /server time/);
  assert.throws(() => parseMeituanBody('{"message":"成功","status":0}'), /server time/);
});

test("builds offsets from the request midpoint and keeps the fastest sample", () => {
  const strategy = {
    id: "taobao-timestamp",
    label: "淘宝 H5 时间戳",
    precisionLabel: "毫秒级",
  };
  const slower = buildSample(2000, 1000, 1100, strategy);
  const faster = buildSample(2000, 1000, 1020, strategy);

  assert.equal(faster.offsetMs, 990);
  assert.equal(faster.uncertaintyMs, 10);
  assert.equal(selectBestSample([slower, faster]), faster);
});

test("builds an error-bounded millisecond sample from a Date boundary", () => {
  const strategy = {
    id: "meituan-phase",
    label: "美团官网相位校准",
    precisionLabel: "毫秒校准",
  };
  const sample = buildDateBoundarySample(
    { remoteEpochMs: 2000, startedAtMs: 1080, finishedAtMs: 1100 },
    { remoteEpochMs: 3000, startedAtMs: 1180, finishedAtMs: 1200 },
    strategy,
  );

  assert.equal(sample.offsetMs, 1860);
  assert.equal(sample.calibrationWindowMs, 120);
  assert.equal(sample.uncertaintyMs, 60);
  assert.throws(
    () => buildDateBoundarySample(
      { remoteEpochMs: 2000, startedAtMs: 1080, finishedAtMs: 1100 },
      { remoteEpochMs: 4000, startedAtMs: 1180, finishedAtMs: 1200 },
      strategy,
    ),
  );
});

test("keeps the NTP command's local timing sample", () => {
  const sample = buildNtpSample(
    { checkedAtEpochMs: 1020, offsetMs: 990, roundTripMs: 20 },
    { id: "ntsc-ntp", label: "国家授时中心 NTP", precisionLabel: "毫秒级" },
  );

  assert.equal(sample.offsetMs, 990);
  assert.equal(sample.uncertaintyMs, 10);
});

test("keeps the selected precision across a refresh for standard and Mini values", () => {
  const value = "12:34:56.789";

  for (const surface of ["standard", "Mini"]) {
    assert.equal(
      formatTimePrecision(value, getDisplayPrecision(false, true, "millisecond"), true),
      "12:34:56",
      `${surface} should keep seconds`,
    );
    assert.equal(
      formatTimePrecision(value, getDisplayPrecision(true, true, "second"), true),
      value,
      `${surface} should keep milliseconds`,
    );
  }

  assert.equal(formatTimePrecision(value, true, true), value);
  assert.equal(formatTimePrecision(value, true, false), "12:34:56");
});
