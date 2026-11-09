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

test("isSunset: a Saturday Mass from 4pm counts as a Sunset Mass", () => {
  assert.equal(S.isSunset(Date.UTC(2026, 9, 3, 8, 0)), true);   // Sat 16:00 SGT
  assert.equal(S.isSunset(Date.UTC(2026, 9, 3, 7, 59)), false); // Sat 15:59 SGT
  assert.equal(S.isSunset(Date.UTC(2026, 9, 4, 10, 0)), false); // Sun 18:00 SGT
});

test("a parish with no weekday Mass on public holidays: its Monday-Friday Masses drop out that day only", () => {
  const data = {
    rules: { 9: [{ d: 1, t: "13:15", weeks: [], except: [], type: "Mass", lang: "English", loc: "" },
                 { d: 0, t: "08:30", weeks: [], except: [], type: "Mass", lang: "English", loc: "" }] },
    dated: {}, holidays: { "2026-11-09": "Deepavali (Observed)", "2026-11-08": "Deepavali" }, noWeekdayMassOnPH: ["9"],
  };
  const day = (iso) => Date.parse(`${iso}T00:00:00+08:00`);
  assert.equal(S.expandParish("9", data, day("2026-11-09"), 0).length, 0);   // Monday holiday: none
  assert.equal(S.expandParish("9", data, day("2026-11-16"), 0).length, 1);   // next Monday: as usual
  assert.equal(S.expandParish("9", data, day("2026-11-08"), 0).length, 1);   // Sunday holiday: Sunday Mass stays
  assert.equal(S.expandParish("9", { ...data, noWeekdayMassOnPH: [] }, day("2026-11-09"), 0).length, 1); // other parishes unchanged
});


test("a parish with a public-holiday timetable uses it on a weekday holiday, in place of the weekday Mass", () => {
  const data = {
    rules: { 7: [{ d: 3, t: "12:15", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" },
                 { d: 0, t: "11:00", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" }] },
    dated: {}, holidays: { "2026-11-04": "Deepavali", "2026-11-08": "Deepavali" },
    phMasses: { 7: ["09:00"] },
  };
  const day = (iso) => Date.parse(`${iso}T00:00:00+08:00`);
  // Wednesday holiday: the 12:15 goes, the 9am holiday Mass takes its place
  assert.deepEqual(times(S.expandParish("7", data, day("2026-11-04"), 0)), ["2026-11-04 09:00 "]);
  // the same Wednesday a week later is an ordinary day again
  assert.deepEqual(times(S.expandParish("7", data, day("2026-11-11"), 0)), ["2026-11-11 12:15 English"]);
  // a holiday on a Sunday must not replace the Sunday Masses
  assert.deepEqual(times(S.expandParish("7", data, day("2026-11-08"), 0)), ["2026-11-08 11:00 English"]);
  // a parish with no published timetable keeps its weekday times
  assert.deepEqual(times(S.expandParish("8", { ...data, phMasses: {} }, day("2026-11-04"), 0)), []);
});

test("a hand-checked date override drops and adds Masses for one parish only", () => {
  const data = {
    rules: { 10: [{ d: 0, t: "12:30", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" },
                  { d: 0, t: "08:00", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" }],
             11: [{ d: 0, t: "12:30", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" }] },
    dated: {}, holidays: {},
    byDate: { "2026-11-08": { 10: { drop: ["12:30"], add: [{ t: "09:00", lang: "English", loc: "Main Church" }] } } },
  };
  const day = Date.parse("2026-11-08T00:00:00+08:00");
  assert.deepEqual(times(S.expandParish("10", data, day, 0)), ["2026-11-08 08:00 English", "2026-11-08 09:00 English"]);
  assert.deepEqual(times(S.expandParish("11", data, day, 0)), ["2026-11-08 12:30 English"]);
  // and the following Sunday is untouched
  assert.equal(S.expandParish("10", data, day + 7 * 86400000, 0).length, 2);
});

test("a holiday Mass at the hour the parish itself lists is not shown twice", () => {
  const data = {
    rules: { 12: [{ d: 1, t: "18:00", weeks: [], except: [], type: "Mass", lang: "English", loc: "Main Church" }] },
    dated: { 12: [{ k: "o", date: "2026-11-09", t: "08:00", type: "Mass", lang: "English", loc: "Main Church", note: "" }] },
    holidays: { "2026-11-09": "Deepavali (Observed)" }, phMasses: { 12: ["08:00"] },
  };
  const evs = S.expandParish("12", data, Date.parse("2026-11-09T00:00:00+08:00"), 0);
  assert.deepEqual(times(evs), ["2026-11-09 08:00 English"]);
});

test("a holiday timetable keeps each Mass's language", () => {
  const data = {
    rules: { 10: [{ d: 1, t: "12:30", weeks: [], except: [], type: "Mass", lang: "English", loc: "" }] },
    dated: {}, holidays: { "2026-11-09": "Deepavali (Observed)" },
    phMasses: { 10: [{ t: "09:00", lang: "English" }, { t: "10:00", lang: "Tamil" }] },
  };
  const evs = S.expandParish("10", data, Date.parse("2026-11-09T00:00:00+08:00"), 0);
  assert.deepEqual(evs.map((e) => `${e.t} ${e.lang}`), ["09:00 English", "10:00 Tamil"]);
});
