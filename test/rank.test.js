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

test("skips a Mass you can no longer make; a nearer Mass later in the window beats a farther earlier one", async () => {
  const events = [{ pid: 1, start: min(10) }, { pid: 1, start: min(90) }, { pid: 2, start: min(40) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 13, 2: 20, 3: 50 }) });
  // 08:10 at Near needs 13 min: too late. Earliest reachable is Mid 08:40; Near 09:30 is within 90 min and 7 min closer.
  assert.equal(r.best.pid, 1);
  assert.equal(r.best.start, min(90));
  assert.equal(r.best.leaveBy, min(77)); // leave by = start - travel: you arrive as Mass starts, no padding
  assert.deepEqual(r.alternatives.map((e) => e.pid), [2]);
});

test("prefers a slightly later Mass that is much closer", async () => {
  const events = [{ pid: 2, start: min(30) }, { pid: 1, start: min(40) }];
  const r = await rank({ origin, now: T0, parishes, events, travel: fixedTravel({ 1: 5, 2: 20, 3: 50 }) });
  assert.equal(r.best.pid, 1); // 10 min later, 15 min shorter trip
  assert.deepEqual(r.alternatives.map((e) => e.pid), [2]);
});

test("does not trade a much earlier Mass for a closer one beyond the 90-minute window", async () => {
  const events = [{ pid: 2, start: min(30) }, { pid: 1, start: min(150) }];
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

test("nearest wins inside the window, earlier start breaks ties", async () => {
  const ps = [...parishes, { id: 4, name: "Near2", lat: 1.301, lng: 103.80 }];
  const events = [{ pid: 2, start: min(30) }, { pid: 1, start: min(100) }, { pid: 4, start: min(60) }];
  const r = await rank({ origin, now: T0, parishes: ps, events, travel: fixedTravel({ 1: 8, 2: 20, 4: 8 }) });
  assert.equal(r.best.pid, 4); // same 8-min trip as Near, but earlier
  assert.deepEqual(r.alternatives.map((e) => e.pid), [1, 2]);
});

test("a crowd of same-time parishes cannot push the reachable best out of the shortlist", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, name: `P${i}`, lat: 1.30 + 0.005 * (i + 1), lng: 103.80 }));
  const ps = [...parishes, ...many];
  const events = [...many.map((p) => ({ pid: p.id, start: min(10) })), { pid: 2, start: min(40) }];
  const travel = async (p) => ({ minutes: p.id >= 10 ? 14 : 20, source: "test" });
  const r = await rank({ origin, now: T0, parishes: ps, events, travel });
  assert.equal(r.best.pid, 2);
});

test("the earliest reachable Mass is found even when unreachable-but-sooner Masses crowd the list", async () => {
  // four parishes with Masses too soon to reach, one farther parish whose later Mass is reachable
  const ps = [
    ...[0, 1, 2, 3].map((i) => ({ id: 20 + i, name: `Soon${i}`, lat: 1.40 + 0.002 * i, lng: 103.80 })),
    { id: 30, name: "Reachable", lat: 1.30, lng: 103.90 },
  ];
  const o = { lat: 1.30, lng: 103.80 };
  const events = [...[0, 1, 2, 3].map((i) => ({ pid: 20 + i, start: min(20 + i) })), { pid: 30, start: min(90) }];
  const r = await rank({ origin: o, now: T0, parishes: ps, events });
  assert.equal(r.best.pid, 30);
});

test("a nearer church with a Mass inside the window is routed even if it is not in the first shortlist", async () => {
  const ring = Array.from({ length: 7 }, (_, i) => ({ id: 40 + i, name: `R${i}`, lat: 1.30 + 0.01 * (i + 1), lng: 103.80 }));
  const o = { lat: 1.30, lng: 103.80 };
  // the 5 nearest have Masses only much later; parish 46 (7th nearest) has one inside the window
  const events = [...ring.slice(0, 5).map((p) => ({ pid: p.id, start: min(600) })), { pid: 45, start: min(60) }, { pid: 46, start: min(80) }];
  const travel = async (p) => ({ minutes: p.id === 46 ? 20 : 40, source: "test" });
  const r = await rank({ origin: o, now: T0, parishes: ring, events, travel });
  assert.equal(r.best.pid, 46);
});

test("fast mode does not call the travel function and reports every trip as an estimate", async () => {
  let travelCalls = 0;
  const travel = async (p) => { travelCalls++; return { minutes: 1, source: "onemap" }; };
  const events = [{ pid: 1, start: min(40) }, { pid: 2, start: min(60) }];
  const r = await rank({ origin, now: T0, parishes, events, travel, fast: true });
  assert.equal(travelCalls, 0, "fast must not touch OneMap");
  assert.ok(r.best);
  assert.equal(r.best.travelSource, "estimate");
  for (const a of r.alternatives) assert.equal(a.travelSource, "estimate");
  assert.ok(r.best.travelMin > 0);
});

test("bus & MRT mode: a church a few hundred metres away is a walk, not a 10-minute-minimum transit trip", async () => {
  const close = [{ id: 9, name: "Round the corner", lat: 1.3005, lng: 103.8039 }]; // ~0.3 km
  const r = await rank({ origin, now: T0, mode: "transit", parishes: close, events: [{ pid: 9, start: min(60) }], fast: true });
  assert.equal(r.best.travelWalk, true);
  assert.ok(r.best.travelMin < 10, `expected a short walk, got ${r.best.travelMin} min`);
});

test("bus & MRT mode walks only a short way: 10 min always, up to 15 if no slower, never further", () => {
  const { preferWalk } = require("../public/rank.js");
  assert.equal(preferWalk(6, 12), true);   // the church across the road
  assert.equal(preferWalk(9, 5), true);    // still a short walk even if one bus stop is quicker
  assert.equal(preferWalk(14, 16), true);  // a modest walk that beats the bus
  assert.equal(preferWalk(14, 12), false); // the bus is quicker
  assert.equal(preferWalk(20, 21), false); // 20 min on foot is not what "bus & MRT" means
  assert.equal(preferWalk(null, 12), false);
});
