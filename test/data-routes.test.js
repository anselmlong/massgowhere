const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const schedule = require("../api/schedule.js");
const parish = require("../api/parish.js");
const way = require("../api/way.js");

function res() {
  return { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}

test("schedule route serves the committed data.json and is CDN-cached", async () => {
  const out = res();
  await schedule({ url: "/api/schedule", method: "GET" }, out);
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/data.json"), "utf8"));
  assert.equal(out.statusCode, 200);
  assert.equal(JSON.parse(out.body).asOf, file.asOf);
  assert.equal(JSON.parse(out.body).parishes.length, file.parishes.length);
  assert.match(out.headers["Cache-Control"], /s-maxage=300/);
  assert.match(out.headers["Cache-Control"], /stale-while-revalidate=/);
});

test("parish route serves one church file and refuses a bad id", async () => {
  const out = res();
  await parish({ url: "/api/parish?id=1", method: "GET" }, out);
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/parish/1.json"), "utf8"));
  assert.equal(out.statusCode, 200);
  assert.deepEqual(JSON.parse(out.body).bulletin, file.bulletin);
  assert.match(out.headers["Cache-Control"], /s-maxage=300/);

  const bad = res();
  await parish({ url: "/api/parish?id=../data", method: "GET" }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.headers["Cache-Control"], "no-store");

  const missing = res();
  await parish({ url: "/api/parish?id=99", method: "GET" }, missing);
  assert.equal(missing.statusCode, 404);
});

test("a Mass on the way is CDN-cached when it succeeds", async () => {
  const out = res();
  await way({ url: "/api/way?from=1.3007,103.8385&to=1.3521,103.8198&mode=walk&fast=1" }, out);
  assert.equal(out.statusCode, 200);
  assert.ok(JSON.parse(out.body).best);
  assert.match(out.headers["Cache-Control"], /s-maxage=60/);
  const bad = res();
  await way({ url: "/api/way?from=0,0&to=1.3,103.8" }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.headers["Cache-Control"], "no-store");
});
