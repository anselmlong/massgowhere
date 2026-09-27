// Sanity checks: unmatched cancellations and a few spot checks.
const S = require("../public/schedule.js");
const data = require("../public/data.json");
const now = Date.now();
const fmt = (ms) => new Date(ms).toLocaleString("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const name = (pid) => data.parishes.find((p) => String(p.id) === String(pid)).name;
const futureDated = Object.values(data.dated).flat().filter((e) => e.k !== "a");
const um = S.unmatched(data, now, 120);
console.log(`future removes/overrides in 120d: ${futureDated.filter(e=>e.date>=new Date(now+8*36e5).toISOString().slice(0,10)).length}, unmatched: ${um.length}`);
for (const e of um.slice(0, 15)) console.log("  unmatched", e.k, e.date, e.t, e.type, e.loc, "@", name(e.pid), e.note);
console.log("\nnext 8 Masses anywhere:");
for (const e of S.expandAll(data, now, 7).slice(0, 8)) console.log(" ", fmt(e.start), e.lang, "-", name(e.pid), e.note ? `(${e.note})` : "");
for (const pid of ["5", "26", "6"]) {
  console.log(`\n${name(pid)} next 7 days:`);
  for (const e of S.expandParish(pid, data, now, 7)) console.log(" ", fmt(e.start), e.lang, e.loc, e.k, e.note);
}
