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

test("public holiday replaces weekday Masses with the listed holiday times", () => {
  const data = base([{ d: 5, t: "06:30", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" }],
    { parish: { publicHoliday: { noWeekday: false, times: ["08:30"] } }, holidays: { "2026-12-25": "Christmas Day" } });
  const evs = S.expandParish("1", data, at("2026-12-24"), 1); // Thu 24 (no Mass rule), Fri 25 = holiday
  assert.deepEqual(times(evs), ["2026-12-25 08:30 English"]);
});

test("no weekday Mass on public holidays drops them, weekends unaffected", () => {
  const data = base([
    { d: 1, t: "13:15", weeks: [], except: [], type: "Mass", lang: "English", loc: "" },
    { d: 0, t: "08:30", weeks: [], except: [], type: "Mass", lang: "English", loc: "" },
  ], { parish: { publicHoliday: { noWeekday: true, times: [] } }, holidays: { "2026-11-09": "Deepavali (Observed)", "2026-11-08": "Deepavali" } });
  const evs = S.expandParish("1", data, at("2026-11-08"), 1); // Sun 8 (holiday but weekend), Mon 9 (holiday)
  assert.deepEqual(times(evs), ["2026-11-08 08:30 English"]);
});

test("dated cancellation removes the slot; other types filtered out by default", () => {
  const data = base([
    { d: 3, t: "07:00", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" },
    { d: 3, t: "19:00", weeks: [], except: [], type: "Devotion", lang: "English", loc: "" },
  ], { dated: [{ k: "r", date: "2026-10-07", t: "07:00", type: "Mass", loc: "Chapel" }] });
  assert.deepEqual(times(S.expandParish("1", data, at("2026-10-07"), 0)), []);
  assert.equal(S.expandParish("1", data, at("2026-10-07"), 0, ["Devotion"]).length, 1);
});
