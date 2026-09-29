(function (root) {
// A Mass on the way: you're going from A to B, maybe with a time you need to be at B; which Mass can you
// stop for that adds the least to the trip?
//
// Rule (explainable, same answer on the site and in the bot):
//   1. A Mass fits if you can reach the church by the time it starts (leaving A at your leave time), and, when you
//      gave an arrive-by time, you can still reach B by then after Mass ends.
//   2. Mass length is assumed: about an hour on Sundays and Saturday evenings, about 40 minutes otherwise.
//   3. Detour = (A to church) + (church to B) - (A to B). The smallest detour wins; the earlier Mass breaks ties.
//      Without an arrive-by time, only Masses within WINDOW_MIN of the earliest one that fits are considered,
//      so "no detour, but tomorrow" doesn't beat "a small detour, tonight".
//   4. Straight-line detour picks a shortlist; only those get routed (two legs each, plus A to B once).
const R = root.MassRank || (typeof require !== "undefined" ? require("./rank.js") : null);

const WINDOW_MIN = 120;
const SHORTLIST = 8;
const SGT = 8 * 3600e3;

// About an hour on Sunday and at Saturday evening (vigil) Masses, 40 minutes on weekdays
function massMinutes(start) {
  const d = new Date(start + SGT), day = d.getUTCDay(), h = d.getUTCHours();
  return day === 0 || (day === 6 && h >= 16) ? 60 : 40;
}

/**
 * @param {object} p
 * @param {{lat,lng}} p.from
 * @param {{lat,lng}} p.to
 * @param {number} p.depart          epoch ms you set off from A
 * @param {number|null} p.arriveBy   epoch ms you need to be at B by (optional)
 * @param {string} p.mode
 * @param {Array} p.parishes
 * @param {Array} p.events           upcoming Masses [{pid,start,...}]
 * @param {(a, b, departMs) => Promise<{minutes,source,walk}|null>} [p.travel]  real routing; omitted or fast -> estimates
 * @param {boolean} [p.fast]
 */
async function planWay({ from, to, depart, arriveBy = null, mode = "transit", parishes, events, travel, fast = false }) {
  const byId = new Map(parishes.map((p) => [p.id, p]));
  const est = (a, b) => {
    const km = R.haversineKm(a, b);
    return { minutes: R.estimateMinutes(km, mode), source: "estimate", walk: R.walksFaster(km, mode) };
  };
  const route = async (a, b, at) => {
    if (fast || !travel) return est(a, b);
    try {
      const r = await travel(a, b, at);
      if (r && Number.isFinite(r.minutes)) return { minutes: Math.round(r.minutes), source: r.source || "route", walk: !!r.walk };
    } catch { /* fall back to the estimate */ }
    return est(a, b);
  };

  // 1. with estimates: for each church, the earliest Mass that might fit. Estimates can run long (they assume a
  // slow bus), so this pass is generous and the real routes in step 3 have the final say.
  const direct0 = est(from, to).minutes;
  const optimistic = (m) => Math.floor(m * 0.7);
  const fitsEst = (e, toMin, onMin) => depart + optimistic(toMin) * 60000 <= e.start &&
    (!arriveBy || e.start + (massMinutes(e.start) + optimistic(onMin)) * 60000 <= arriveBy);
  const firstFit = new Map();
  const legs0 = new Map(parishes.map((p) => [p.id, { a: est(from, p).minutes, b: est(p, to).minutes }]));
  for (const e of [...events].sort((x, y) => x.start - y.start)) {
    if (firstFit.has(e.pid) || !legs0.has(e.pid)) continue;
    const l = legs0.get(e.pid);
    if (fitsEst(e, l.a, l.b)) firstFit.set(e.pid, e);
  }
  let cands = [...firstFit.entries()].map(([pid, e]) => ({ pid, e, detour: legs0.get(pid).a + legs0.get(pid).b - direct0 }));
  if (!arriveBy && cands.length) {
    const s0 = Math.min(...cands.map((c) => c.e.start));
    cands = cands.filter((c) => c.e.start <= s0 + WINDOW_MIN * 60000);
  }
  cands.sort((x, y) => x.detour - y.detour || x.e.start - y.e.start);
  cands = cands.slice(0, SHORTLIST);

  // 2. route the shortlist: A -> church leaving when you'd need to, church -> B when Mass ends, and A -> B once
  const [direct, ...routed] = await Promise.all([
    route(from, to, depart),
    ...cands.map(async (c) => {
      const p = byId.get(c.pid);
      const end = c.e.start + massMinutes(c.e.start) * 60000;
      const [a, b] = await Promise.all([route(from, p, Math.max(depart, c.e.start - legs0.get(c.pid).a * 60000)), route(p, to, end)]);
      return { ...c, a, b, end };
    }),
  ]);

  // 3. keep what still fits on real times; rank by detour, then earlier Mass
  const stops = routed
    .filter((c) => depart + c.a.minutes * 60000 <= c.e.start && (!arriveBy || c.end + c.b.minutes * 60000 <= arriveBy))
    .map((c) => ({
      pid: c.pid, start: c.e.start, end: c.end, lang: c.e.lang, loc: c.e.loc, note: c.e.note,
      leaveBy: c.e.start - c.a.minutes * 60000,
      toMin: c.a.minutes, toWalk: c.a.walk, onwardMin: c.b.minutes, onwardWalk: c.b.walk,
      arrive: c.end + c.b.minutes * 60000,
      detourMin: Math.max(0, c.a.minutes + c.b.minutes - direct.minutes),
      travelSource: c.a.source === "estimate" || c.b.source === "estimate" ? "estimate" : c.a.source,
    }))
    .sort((x, y) => x.detourMin - y.detourMin || x.start - y.start);
  return { best: stops[0] || null, alternatives: stops.slice(1, 4), direct };
}

const api = { planWay, massMinutes, WINDOW_MIN };
if (typeof module !== "undefined") module.exports = api;
else root.MassWay = api;
})(this);
