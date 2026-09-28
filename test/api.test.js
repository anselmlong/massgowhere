const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/next.js");

// estimate-only (fast=1) so the test never calls OneMap
async function call(qs) {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  await handler({ url: `/api/next?lat=1.3007&lng=103.8385&mode=transit&fast=1&${qs}` }, res);
  return res;
}

test("at= plans from a later departure: every answer leaves no earlier than it", async () => {
  const at = Math.ceil((Date.now() + 2 * 864e5) / 9e5) * 9e5;
  const r = await call(`at=${at}`);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.at, new Date(at).toISOString());
  assert.ok(r.body.best, "a Mass within two days of the planned time");
  for (const e of [r.body.best, ...r.body.alternatives]) assert.ok(Date.parse(e.leaveBy) >= at);
});

test("at= in the past or missing means now; more than a week ahead is refused", async () => {
  assert.equal((await call(`at=${Date.now() - 3600e3}`)).body.at, null);
  assert.equal((await call("")).body.at, null);
  assert.equal((await call(`at=${Date.now() + 10 * 864e5}`)).statusCode, 400);
});

test("part= keeps every answer in that time of day; an unknown part is refused", async () => {
  const S = require("../public/schedule.js");
  for (const part of Object.keys(S.PARTS)) {
    const r = await call(`part=${part}`);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.part, part);
    assert.ok(r.body.best, `a ${part} Mass within two days`);
    for (const e of [r.body.best, ...r.body.alternatives]) assert.equal(S.partOf(Date.parse(e.start)), part, `${e.start} is ${part}`);
  }
  assert.equal((await call("part=brunch")).statusCode, 400);
});
