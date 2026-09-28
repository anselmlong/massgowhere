(function (root) {
// Picks the Mass you can realistically make, given where you are, how you travel, and the time.
//
// Rule (kept deliberately explainable, every client shows the same answer):
//   1. A Mass is reachable if  now + travel + buffer <= start  (and the trip is at most MAX_TRIP_MIN).
//   2. Take the earliest reachable start time S.
//   3. Among reachable Masses starting within WINDOW_MIN of S, pick the SHORTEST TRIP;
//      the earlier start breaks ties. Travel efficiency first, while still "a Mass that starts soon".
//   4. "Leave by" = start - travel - buffer.

const BUFFER_MIN = 5;
const WINDOW_MIN = 90;
const MAX_ROUTED = 8;
const MAX_TRIP_MIN = 75; // never suggest a trip longer than this

function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rough door-to-door minutes from straight-line distance; used to shortlist and as a fallback.
// "Bus & MRT" never beats walking to a church down the road: when walking is quicker, that is the trip.
const walkMinutes = (km) => Math.round(((km * 1.3) / 4.8) * 60);
const transitMinutes = (km) => Math.round(10 + ((km * 1.3) / 17) * 60); // includes getting to the stop and waiting
function estimateMinutes(km, mode) {
  if (mode === "walk") return walkMinutes(km);
  if (mode === "drive") return Math.round(4 + ((km * 1.3) / 30) * 60);
  return Math.min(transitMinutes(km), walkMinutes(km));
}
const walksFaster = (km, mode) => mode === "transit" && walkMinutes(km) <= transitMinutes(km);

/**
 * @param {object} p
 * @param {{lat:number,lng:number}} p.origin
 * @param {number} p.now            epoch ms
 * @param {"transit"|"drive"|"walk"} p.mode
 * @param {Array} p.parishes        [{id,name,lat,lng,...}]
 * @param {Array} p.events          upcoming Masses [{pid,start,...}], any order
 * @param {(parish, departMs)=>Promise<{minutes:number,source:string}|null>} [p.travel]  real routing; null -> estimate
 * @param {boolean} [p.fast]        estimate-only: skip real routing, every trip is an estimate (much faster)
 * @returns {Promise<{best, alternatives, nearest, considered}>}
 */
async function rank({ origin, now, mode = "transit", parishes, events, travel, fast = false }) {
  const byId = new Map(parishes.map((p) => [p.id, p]));
  const est = new Map(parishes.map((p) => [p.id, estimateMinutes(haversineKm(origin, p), mode)]));
  const estWalk = (id) => walksFaster(haversineKm(origin, byId.get(id)), mode);

  const trip = new Map();
  const departAt = new Map();
  // fast mode: pre-fill every parish's trip with its distance estimate (no network
  // calls), so ranking runs entirely locally and answers in a few milliseconds.
  // Reaching and leave-by are then judged on the estimate, same as a cold-cache
  // fallback — a slower /api/next refine swaps in exact OneMap times.
  if (fast) {
    for (const id of est.keys()) trip.set(id, { minutes: est.get(id), source: "estimate", walk: estWalk(id) });
  }

  // Travel is routed in two passes so neither the closest church nor the soonest Mass can be missed:
  //   pass 1: the nearest parishes, those whose first Mass is reachable on the estimate, and the nearest overall;
  //   pass 2: once the window [S, S+WINDOW] is known, any other parish with a Mass in it, nearest first.
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const departFor = (pid, e) => Math.max(now, e.start - (est.get(pid) + BUFFER_MIN) * 60000);
  const firstReachable = new Map(); // strict: reachable on the estimate
  for (const e of sorted) {
    if (firstReachable.has(e.pid)) continue;
    if (e.start - (est.get(e.pid) + BUFFER_MIN) * 60000 >= now) firstReachable.set(e.pid, e);
  }
  async function route(ids) {
    await Promise.all(ids.filter((id) => !trip.has(id)).map(async (id) => {
      let r = null;
      // route for when you'd actually set off (transit at 1am is not transit at 6am)
      if (travel) {
        try { r = await travel(byId.get(id), departAt.get(id) ?? now); } catch { r = null; }
      }
      trip.set(id, r && Number.isFinite(r.minutes)
        ? { minutes: Math.round(r.minutes), source: r.source || "route", walk: mode === "transit" && !!r.walk }
        : { minutes: est.get(id), source: "estimate", walk: estWalk(id) });
    }));
  }
  for (const [pid, e] of firstReachable) departAt.set(pid, departFor(pid, e));
  const withMass = [...firstReachable.keys()];
  const byNear = [...withMass].sort((a, b) => est.get(a) - est.get(b)).slice(0, 5);
  const bySoon = [...withMass].sort((a, b) => firstReachable.get(a).start - firstReachable.get(b).start).slice(0, 3);
  const nearestIds = [...est.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([id]) => id);
  await route([...new Set([...byNear, ...bySoon, ...nearestIds])]);

  const reachableNow = () => events
    .filter((e) => trip.has(e.pid) && trip.get(e.pid).minutes <= MAX_TRIP_MIN)
    .filter((e) => e.start - (trip.get(e.pid).minutes + BUFFER_MIN) * 60000 >= now)
    .sort((a, b) => a.start - b.start);
  const first = reachableNow()[0] || firstReachable.get(bySoon[0]);
  if (first) {
    const end = first.start + WINDOW_MIN * 60000;
    const inWindow = new Map();
    for (const e of sorted) {
      if (e.start < first.start || e.start > end || trip.has(e.pid) || inWindow.has(e.pid)) continue;
      if (e.start - (est.get(e.pid) + BUFFER_MIN) * 60000 >= now) inWindow.set(e.pid, e);
    }
    const extra = [...inWindow.keys()].sort((a, b) => est.get(a) - est.get(b)).slice(0, MAX_ROUTED - 3);
    for (const pid of extra) departAt.set(pid, departFor(pid, inWindow.get(pid)));
    await route(extra);
  }

  const reachable = events
    .filter((e) => trip.has(e.pid))
    .map((e) => {
      const t = trip.get(e.pid);
      const leaveBy = e.start - (t.minutes + BUFFER_MIN) * 60000;
      return { ...e, travelMin: t.minutes, travelSource: t.source, travelWalk: !!t.walk, leaveBy, distanceKm: haversineKm(origin, byId.get(e.pid)) };
    })
    .filter((e) => e.leaveBy >= now && e.travelMin <= MAX_TRIP_MIN)
    .sort((a, b) => a.start - b.start || a.travelMin - b.travelMin);

  const byTrip = (a, b) => a.travelMin - b.travelMin || a.start - b.start;
  let best = null;
  let windowEnd = -Infinity;
  if (reachable.length) {
    windowEnd = reachable[0].start + WINDOW_MIN * 60000;
    best = reachable.filter((e) => e.start <= windowEnd).sort(byTrip)[0];
  }
  // alternatives: other churches in the same window by trip length, then later Masses by start
  const inWindow = reachable.filter((e) => e.start <= windowEnd).sort(byTrip);
  const later = reachable.filter((e) => e.start > windowEnd);
  const seen = new Set(best ? [best.pid] : []);
  const alternatives = [];
  for (const e of [...inWindow, ...later]) {
    if (seen.has(e.pid)) continue;
    seen.add(e.pid);
    alternatives.push(e);
    if (alternatives.length === 3) break;
  }

  const nearestId = [...trip.entries()].filter(([, t]) => t.minutes <= MAX_TRIP_MIN).sort((a, b) => a[1].minutes - b[1].minutes)[0]?.[0];
  const nearest = nearestId == null ? null : {
    pid: nearestId,
    travelMin: trip.get(nearestId).minutes,
    travelSource: trip.get(nearestId).source,
    travelWalk: !!trip.get(nearestId).walk,
    distanceKm: haversineKm(origin, byId.get(nearestId)),
    next: reachable.find((e) => e.pid === nearestId) || null,
  };
  return { best, alternatives, nearest, considered: trip.size };
}

const api = { rank, estimateMinutes, walksFaster, haversineKm, BUFFER_MIN, WINDOW_MIN };
if (typeof module !== "undefined") module.exports = api;
else root.MassRank = api;
})(this);
