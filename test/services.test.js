const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../public/schedule.js");
const { expandServices, expandAllServices, rankOpen } = require("../public/services.js");
const real = require("../public/data.json");

const at = (date, t) => S.toInstant(date, t);
const MIN = 60000;
// Thu 1 Oct 2026; Fri 2 Oct is a first Friday; Sat 3, Sun 4; Mon 5 Oct is a made-up public holiday
const data = (services, rules = {}, dated = {}) => ({
  parishes: [{ id: 1, lat: 1.3, lng: 103.8 }, { id: 2, lat: 1.32, lng: 103.8 }],
  holidays: { "2026-10-05": "Test Day" }, rules, dated, services: { parishes: services },
});
const room = (hours, extra = {}) => ({ 1: { adoration: { loc: "Room", hours, ...extra } } });
const daily = [0, 1, 2, 3, 4, 5, 6];

test("a room that opened this morning is open now", () => {
  const w = expandServices("1", data(room([{ days: daily, from: "07:00", to: "21:00" }])), "adoration", at("2026-10-01", "15:00"), 2);
  assert.equal(w[0].start, at("2026-10-01", "07:00"));
  assert.equal(w[0].end, at("2026-10-01", "21:00"));
  assert.equal(w[0].lastIn, at("2026-10-01", "20:40")); // 20 minutes before it closes
});

test("a night vigil runs past midnight, and is still open the next morning", () => {
  const d = data(room([{ days: [5], weeks: [1], from: "22:00", to: "07:00" }]));
  const w = expandServices("1", d, "adoration", at("2026-10-03", "03:00"), 1);
  assert.equal(w.length, 1);
  assert.equal(w[0].start, at("2026-10-02", "22:00"));
  assert.equal(w[0].end, at("2026-10-03", "07:00"));
  // not on the second Friday
  assert.equal(expandServices("1", d, "adoration", at("2026-10-09", "12:00"), 1).length, 0);
});

test("public holidays: closed, or their own hours", () => {
  const d = data(room([{ days: daily, from: "07:00", to: "21:00", ph: "skip" }, { days: daily, from: "08:00", to: "16:00", ph: "only" }]));
  const w = expandServices("1", d, "adoration", at("2026-10-05", "00:00"), 0).filter((x) => x.start >= at("2026-10-05", "00:00"));
  assert.deepEqual(w.map((x) => [x.start, x.end]), [[at("2026-10-05", "08:00"), at("2026-10-05", "16:00")]]);
});

test("dated entries switch on their dates", () => {
  const d = data({ 1: { confession: { beforeMass: [{ min: 15, masses: "all", until: "2026-10-02" }, { min: 30, masses: "all", since: "2026-10-03" }] } } },
    { 1: [{ d: 5, t: "18:00", type: "Mass" }, { d: 6, t: "18:00", type: "Mass" }] });
  const w = expandServices("1", d, "confession", at("2026-10-02", "00:00"), 1);
  assert.deepEqual(w.map((x) => (x.end - x.start) / MIN), [15, 30]);
});

test("Confession before weekend Masses: not Saturday morning, English only, exceptions, ending early", () => {
  const rules = { 1: [
    { d: 6, t: "07:00", type: "Mass", lang: "English" }, { d: 6, t: "18:00", type: "Mass", lang: "English" },
    { d: 0, t: "08:30", type: "Mass", lang: "Mandarin" }, { d: 0, t: "10:00", type: "Mass", lang: "English" },
    { d: 0, t: "12:00", type: "Mass", lang: "English" }, { d: 3, t: "18:00", type: "Mass", lang: "English" },
  ] };
  const d = data({ 1: { confession: { beforeMass: [{ min: 30, end: 10, masses: "weekend", lang: "English", except: [{ d: 0, t: "12:00" }] }] } } }, rules);
  const w = expandServices("1", d, "confession", at("2026-10-03", "00:00"), 1);
  assert.deepEqual(w.map((x) => [x.start, x.end, x.mass]), [
    [at("2026-10-03", "17:30"), at("2026-10-03", "17:50"), at("2026-10-03", "18:00")],
    [at("2026-10-04", "09:30"), at("2026-10-04", "09:50"), at("2026-10-04", "10:00")],
  ]);
});

test("a cancelled Mass takes its Confession with it", () => {
  const rules = { 1: [{ d: 6, t: "18:00", type: "Mass" }] };
  const dated = { 1: [{ k: "r", date: "2026-10-03", t: "18:00", type: "Mass" }] };
  const spec = { 1: { confession: { beforeMass: [{ min: 30, masses: "weekend" }], slots: [{ days: [6], from: "17:15", to: "mass" }] } } };
  assert.equal(expandServices("1", data(spec, rules, dated), "confession", at("2026-10-03", "00:00"), 0).length, 0);
  assert.equal(expandServices("1", data(spec, rules), "confession", at("2026-10-03", "00:00"), 0).length, 2);
});

test("a Holy Hour is a start time: you need to be there 5 minutes before", () => {
  const d = data({ 1: { adoration: { sessions: [{ days: [5], weeks: [1], t: "19:00", name: "Holy Hour" }] } } });
  const [w] = expandServices("1", d, "adoration", at("2026-10-02", "12:00"), 0);
  assert.equal(w.type, "session");
  assert.equal(w.end, null);
  assert.equal(w.lastIn, at("2026-10-02", "18:55"));
});

const origin = { lat: 1.3, lng: 103.801 };
const fixed = (m) => async (p) => ({ minutes: m[p.id], source: "test" });
const W = (pid, start, end, type = "open") => ({ pid, type, start, end, lastIn: type === "session" ? start - 5 * MIN : end - 20 * MIN });

test("the nearest open room wins; one closing before you'd have 20 minutes there doesn't count", async () => {
  const now = at("2026-10-01", "20:00");
  const parishes = data({}).parishes;
  const windows = [W(1, at("2026-10-01", "07:00"), at("2026-10-01", "20:30")), W(2, at("2026-10-01", "07:00"), at("2026-10-01", "22:00"))];
  // #1 shuts at 8:30pm, so the last useful arrival is 8:10pm
  const close = await rankOpen({ origin, now, parishes, windows, travel: fixed({ 1: 5, 2: 20 }) });
  assert.equal(close.best.pid, 1);
  assert.equal(close.best.openOnArrival, true);
  assert.equal(close.best.arrive, now + 5 * MIN);
  const late = await rankOpen({ origin, now, parishes, windows, travel: fixed({ 1: 15, 2: 20 }) });
  assert.equal(late.best.pid, 2); // arriving at #1 at 8:15pm leaves under 20 minutes
  assert.deepEqual(late.alternatives, []);
});

test("a window later on: leave so you arrive as it opens, and the latest you can leave", async () => {
  const now = at("2026-10-03", "16:00");
  const windows = [W(1, at("2026-10-03", "17:30"), at("2026-10-03", "18:00"))];
  windows[0].lastIn = at("2026-10-03", "17:50");
  const r = await rankOpen({ origin, now, parishes: data({}).parishes, windows, travel: fixed({ 1: 20, 2: 30 }) });
  assert.equal(r.best.leaveAt, at("2026-10-03", "17:10"));
  assert.equal(r.best.leaveBy, at("2026-10-03", "17:30"));
  assert.equal(r.best.arrive, at("2026-10-03", "17:30"));
  assert.equal(r.best.openOnArrival, true);
});

test("every curated entry expands without error, and the finder has something for most parishes", () => {
  const now = at("2026-10-03", "12:00");
  const kinds = { adoration: new Set(), confession: new Set() };
  for (const kind of Object.keys(kinds)) for (const w of expandAllServices(real, kind, now)) {
    assert.ok(Number.isFinite(w.start) && (w.end == null || w.end > w.start) && Number.isFinite(w.lastIn), JSON.stringify(w));
    kinds[kind].add(w.pid);
  }
  assert.ok(kinds.adoration.size >= 15, `adoration at ${kinds.adoration.size} parishes`); // rooms with unclear times are left out
  // a parish whose times aren't clear never gets room hours, so the finder can't send anyone to a closed door
  for (const { pid } of require("../public/services.js").unconfirmed(real, "adoration")) {
    assert.ok(!real.services.parishes[pid].adoration.hours, `parish ${pid} is unconfirmed but has hours`);
  }
  assert.ok(kinds.confession.size >= 20, `confession at ${kinds.confession.size} parishes`);
});

test("every curated time and day is well formed, so no entry can silently drop out", () => {
  const src = require("../data/services.json");
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const [pid, kinds] of Object.entries(src.parishes)) for (const [kind, spec] of Object.entries(kinds)) {
    const where = `${pid} ${kind}`;
    for (const e of [...(spec.hours || []), ...(spec.sessions || []), ...(spec.slots || [])]) {
      assert.ok(Array.isArray(e.days) && e.days.length && e.days.every((d) => d >= 0 && d <= 6), `${where}: days ${JSON.stringify(e)}`);
      if (e.t) assert.match(e.t, HM, where);
      else { assert.match(e.from, HM, where); assert.ok(e.to === "mass" || HM.test(e.to), `${where}: to ${e.to}`); }
    }
    for (const e of spec.dated || []) { assert.match(e.date, /^\d{4}-\d\d-\d\d$/, where); assert.match(e.t, HM, where); }
    for (const b of spec.beforeMass || []) assert.ok(b.min > 0 && (b.masses === "all" || b.masses === "weekend" || Array.isArray(b.masses)), `${where}: ${JSON.stringify(b)}`);
    assert.ok(["parish website", "myCatholicSG"].includes(spec.from), `${where}: from ${spec.from}`);
  }
});
