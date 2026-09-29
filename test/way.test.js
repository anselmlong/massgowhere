const test = require("node:test");
const assert = require("node:assert/strict");
const { planWay, massMinutes } = require("../public/way.js");

const T0 = Date.UTC(2026, 9, 5, 9, 0); // Mon 5 Oct 2026, 17:00 SGT
const min = (m) => T0 + m * 60000;
const A = { lat: 1.35, lng: 103.85 }, B = { lat: 1.30, lng: 103.85 };
const parishes = [
  { id: 1, name: "On the way", lat: 1.325, lng: 103.851 },
  { id: 2, name: "Off to the side", lat: 1.33, lng: 103.90 },
  { id: 3, name: "Behind you", lat: 1.40, lng: 103.85 },
];
// fixed door-to-door minutes for each leg, keyed "from>to"
const name = (p) => (p === A ? "A" : p === B ? "B" : String(p.id));
const legs = { "A>B": 30, "A>1": 15, "1>B": 17, "A>2": 25, "2>B": 30, "A>3": 12, "3>B": 45 };
const travel = async (a, b) => ({ minutes: legs[`${name(a)}>${name(b)}`], source: "test" });

test("picks the Mass that adds least to the trip, and says how much", async () => {
  const events = [{ pid: 1, start: min(60) }, { pid: 2, start: min(40) }, { pid: 3, start: min(30) }];
  const r = await planWay({ from: A, to: B, depart: T0, parishes, events, travel });
  assert.equal(r.best.pid, 1);
  assert.equal(r.best.detourMin, 2); // 15 + 17 - 30
  assert.equal(r.best.leaveBy, min(45));
  assert.equal(r.best.end, min(60 + 40)); // weekday Mass: about 40 min
  assert.equal(r.best.arrive, min(60 + 40 + 17));
  assert.deepEqual(r.alternatives.map((s) => s.pid), [2, 3]);
});

test("an arrive-by time rules out Masses that would make you late", async () => {
  const events = [{ pid: 1, start: min(60) }, { pid: 2, start: min(40) }];
  // stop 1 gets you to B at 117 min; stop 2 at 40 + 40 + 30 = 110 min
  const r = await planWay({ from: A, to: B, depart: T0, arriveBy: min(112), parishes, events, travel });
  assert.equal(r.best.pid, 2);
  assert.equal(r.alternatives.length, 0);
  const none = await planWay({ from: A, to: B, depart: T0, arriveBy: min(90), parishes, events, travel });
  assert.equal(none.best, null);
});

test("a Mass you can't reach in time from where you start doesn't count", async () => {
  const events = [{ pid: 1, start: min(10) }, { pid: 2, start: min(40) }];
  const r = await planWay({ from: A, to: B, depart: T0, parishes, events, travel });
  assert.equal(r.best.pid, 2); // 1 starts before you could get there (15 min)
});

test("without a deadline, tonight's small detour beats tomorrow's zero detour", async () => {
  const events = [{ pid: 2, start: min(40) }, { pid: 1, start: min(24 * 60) }];
  const r = await planWay({ from: A, to: B, depart: T0, parishes, events, travel });
  assert.equal(r.best.pid, 2);
});

test("Mass length: about an hour on Sunday and Saturday evening, 40 minutes otherwise", () => {
  assert.equal(massMinutes(Date.UTC(2026, 9, 4, 1)), 60);  // Sun 09:00 SGT
  assert.equal(massMinutes(Date.UTC(2026, 9, 3, 10)), 60); // Sat 18:00 SGT
  assert.equal(massMinutes(Date.UTC(2026, 9, 3, 0)), 40);  // Sat 08:00 SGT
  assert.equal(massMinutes(T0), 40);                        // Mon 17:00 SGT
});

test("on the way, a little late only when asked; lateness counts double against the detour", async () => {
  // 1 starts in 5 min but is 15 min away: 10 min late, 2-min detour. 2 starts in 40 min: on time, 25-min detour
  const events = [{ pid: 1, start: min(5) }, { pid: 2, start: min(40) }];
  const strict = await planWay({ from: A, to: B, depart: T0, parishes, events, travel });
  assert.equal(strict.best.pid, 2);
  const late = await planWay({ from: A, to: B, depart: T0, parishes, events, travel, lateMin: 15 });
  assert.equal(late.best.pid, 1); // 2 + 2*10 = 22 < 25
  assert.equal(late.best.lateMin, 10);
});
