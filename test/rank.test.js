const test = require("node:test");
const assert = require("node:assert/strict");
const { rank } = require("../public/rank.js");

const T0 = Date.UTC(2026, 9, 4, 0, 0); // Sun 4 Oct 2026, 08:00 SGT
const min = (m) => T0 + m * 60000;
const parishes = [
  { id: 1, name: "Near", lat: 1.30, lng: 103.80 },
  { id: 2, name: "Mid", lat: 1.32, lng: 103.80 },
  { id: 3, name: "Far", lat: 1.40, lng: 103.90 },
];
const origin = { lat: 1.30, lng: 103.801 };
const fixedTravel = (m) => async (p) => ({ minutes: m[p.id], source: "test" });

test("skips a Mass you can no longer make and picks the next reachable one", async () => {
  const events = [{ pid: 1, start: min(10) }, { pid: 1, start: min(90) }, { pid: 2, start: min(40) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 8, 2: 20, 3: 50 }) });
  // 08:10 at Near needs 8+5 min -> leave by 07:57, too late. 08:40 at Mid: leave by 08:15. OK.
  assert.equal(r.best.pid, 2);
  assert.equal(r.best.start, min(40));
  assert.equal(r.best.leaveBy, min(15));
});

test("prefers a slightly later Mass that is much closer", async () => {
  const events = [{ pid: 2, start: min(30) }, { pid: 1, start: min(40) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 5, 2: 20, 3: 50 }) });
  assert.equal(r.best.pid, 1); // 10 min later, 15 min shorter trip
  assert.deepEqual(r.alternatives.map((e) => e.pid), [2]);
});

test("does not trade a much earlier Mass for a closer one beyond the window", async () => {
  const events = [{ pid: 2, start: min(30) }, { pid: 1, start: min(120) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 5, 2: 20, 3: 50 }) });
  assert.equal(r.best.pid, 2);
});

test("nearest church is by travel time and carries its next reachable Mass", async () => {
  const events = [{ pid: 1, start: min(5) }, { pid: 1, start: min(60) }, { pid: 2, start: min(40) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 8, 2: 20, 3: 50 }) });
  assert.equal(r.nearest.pid, 1);
  assert.equal(r.nearest.next.start, min(60));
});

test("falls back to the estimate when routing fails", async () => {
  const events = [{ pid: 1, start: min(60) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: async () => { throw new Error("down"); } });
  assert.equal(r.best.pid, 1);
  assert.equal(r.best.travelSource, "estimate");
});

test("nothing reachable -> best is null, nearest still reported", async () => {
  const events = [{ pid: 1, start: min(3) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 8, 2: 20, 3: 50 }) });
  assert.equal(r.best, null);
  assert.equal(r.nearest.pid, 1);
  assert.equal(r.nearest.next, null);
});

test("never suggests a trip over 75 minutes", async () => {
  const events = [{ pid: 3, start: min(100) }, { pid: 1, start: min(200) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 8, 2: 20, 3: 90 }) });
  assert.equal(r.best.pid, 1);
  assert.deepEqual(r.alternatives, []);
});
