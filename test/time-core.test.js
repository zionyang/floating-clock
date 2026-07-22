const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSample,
  parseHttpDate,
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
  assert.equal(selectBestSample([slower, faster]), faster);
});
