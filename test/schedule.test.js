const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../public/schedule.js");

const at = (iso, hhmm = "00:00") => S.toInstant(iso, hhmm);
const times = (evs) => evs.map((e) => `${e.date} ${e.t} ${e.lang}`);
const base = (rules, extra = {}) => ({ parishes: [{ id: 1, ...extra.parish }], rules: { 1: rules }, dated: { 1: extra.dated || [] }, holidays: extra.holidays || {} });

test("last-Sunday and except-3rd-Sunday rules (Blessed Sacrament style)", () => {
  const data = base([
    { d: 0, t: "13:00", weeks: [-1], except: [], type: "Mass", lang: "Indonesian", loc: "" },
    { d: 0, t: "15:15", weeks: [], except: [3], type: "Mass", lang: "Tagalog", loc: "" },
    { d: 0, t: "15:15", weeks: [3], except: [], type: "Mass", lang: "English", loc: "" },
  ]);
  // Oct 2026 Sundays: 4, 11, 18 (3rd), 25 (last)
  const evs = S.expandParish("1", data, at("2026-10-01"), 30);
  assert.deepEqual(times(evs), [
    "2026-10-04 15:15 Tagalog", "2026-10-11 15:15 Tagalog", "2026-10-18 15:15 English",
    "2026-10-25 13:00 Indonesian", "2026-10-25 15:15 Tagalog",
  ]);
});

test("special days are flagged: public holidays, Christmas, Triduum", () => {
  const data = { holidays: { "2026-11-09": "Deepavali (Observed)" } };
  assert.equal(S.specialDay(at("2026-11-09", "10:00"), data), "Deepavali (Observed)");
  assert.equal(S.specialDay(at("2026-12-25", "10:00"), data), "Christmas Day");
  assert.equal(S.specialDay(at("2026-04-03", "10:00"), data), "Good Friday"); // Easter 2026 = 5 Apr
  assert.equal(S.specialDay(at("2026-10-07", "10:00"), data), null);
});

test("a dated addition in an existing slot does not duplicate it", () => {
  const data = base([{ d: 3, t: "18:00", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church", note: "" }],
    { dated: [{ k: "a", date: "2026-10-07", t: "18:00", type: "Mass", lang: "English", loc: "Main Church", note: "Feast of Our Lady of the Rosary" }] });
  const evs = S.expandParish("1", data, at("2026-10-07"), 0);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].note, "Feast of Our Lady of the Rosary");
});

test("dated cancellation removes the slot; other types filtered out by default", () => {
  const data = base([
    { d: 3, t: "07:00", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" },
    { d: 3, t: "19:00", weeks: [], except: [], type: "Devotion", lang: "English", loc: "" },
  ], { dated: [{ k: "r", date: "2026-10-07", t: "07:00", type: "Mass", loc: "Chapel" }] });
  assert.deepEqual(times(S.expandParish("1", data, at("2026-10-07"), 0)), []);
  assert.equal(S.expandParish("1", data, at("2026-10-07"), 0, ["Devotion"]).length, 1);
});

test("time of day: contiguous buckets in Singapore time", () => {
  const S = require("../public/schedule.js");
  const at = (hhmm) => S.toInstant("2026-10-04", hhmm);
  assert.equal(S.partOf(at("06:00")), "morning");
  assert.equal(S.partOf(at("11:59")), "morning");
  assert.equal(S.partOf(at("12:00")), "lunch");
  assert.equal(S.partOf(at("14:59")), "lunch");
  assert.equal(S.partOf(at("15:00")), "evening");
  assert.equal(S.partOf(at("23:30")), "evening");
});
