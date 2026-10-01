(function (root) {
// Picks the Mass you can realistically make, given where you are, how you travel, and the time.
//
// Rule (kept deliberately explainable, every client shows the same answer):
//   1. A Mass is reachable if  now + travel + buffer <= start  (and the trip is at most MAX_TRIP_MIN).
//   2. Take the earliest reachable start time S.
//   3. Among reachable Masses starting within WINDOW_MIN of S, pick the SHORTEST TRIP;
//      the earlier start breaks ties. Travel efficiency first, while still "a Mass that starts soon".
//   4. "Leave by" = start - travel - buffer.

const BUFFER_MIN = 5;       // leave-by gets you there 5 minutes early, to settle in and prepare for Mass
const MAX_LATE_MIN = 15;    // "I don't mind being a bit late": at most this late
const LATE_WINDOW_MIN = 30; // ...and then only Masses starting within 30 min of the earliest one count
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
// In "Bus & MRT" mode a church down the road is a walk, but anything more than a short walk is a bus or
// train ride, because that is how the person chose to travel (and a bus trip's time includes the wait).
const SHORT_WALK_MIN = 10; // always walk this far
const MAX_WALK_MIN = 15;   // walk this far only if it is no slower than the bus
const preferWalk = (walk, pt) => walk != null && (walk <= SHORT_WALK_MIN || (walk <= MAX_WALK_MIN && (pt == null || walk <= pt)));
const walkMinutes = (km) => Math.round(((km * 1.3) / 4.8) * 60);
const transitMinutes = (km) => Math.round(10 + ((km * 1.3) / 17) * 60); // includes getting to the stop and waiting
function estimateMinutes(km, mode) {
  if (mode === "walk") return walkMinutes(km);
  if (mode === "drive") return Math.round(4 + ((km * 1.3) / 30) * 60);
  return walksFaster(km, mode) ? walkMinutes(km) : transitMinutes(km);
}
function walksFaster(km, mode) { return mode === "transit" && preferWalk(walkMinutes(km), transitMinutes(km)); }

/**
 * @param {object} p
 * @param {{lat:number,lng:number}} p.origin
 * @param {number} p.now            epoch ms
 * @param {"transit"|"drive"|"walk"} p.mode
 * @param {Array} p.parishes        [{id,name,lat,lng,...}]
 * @param {Array} p.events          upcoming Masses [{pid,start,...}], any order
 * @param {(parish, departMs)=>Promise<{minutes:number,source:string}|null>} [p.travel]  real routing; null -> estimate
 * @param {boolean} [p.fast]        estimate-only: skip real routing, every trip is an estimate (much faster)
 * @param {number} [p.lateMin]      0 (default) or up to MAX_LATE_MIN: a Mass still counts if you'd arrive this late.
 *                                  Then the window is LATE_WINDOW_MIN and the least-late Mass wins (then shortest trip),
 *                                  so an on-time Mass a little later beats arriving late now. Callers pass events
 *                                  from now - lateMin, so Masses that have just started are included.
 * @returns {Promise<{best, alternatives, nearest, considered}>}
 */
async function rank({ origin, now, mode = "transit", parishes, events, travel, fast = false, lateMin = 0 }) {
  const grace = Math.max(0, Math.min(MAX_LATE_MIN, lateMin)) * 60000;
  // Normally you arrive BUFFER_MIN early. When a little lateness is allowed, what counts is arriving no later than
  // start + grace (the early-arrival buffer is waived), and "late" is measured from the start.
  const slack = grace ? grace + BUFFER_MIN * 60000 : 0;
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
    if (e.start - (est.get(e.pid) + BUFFER_MIN) * 60000 + slack >= now) firstReachable.set(e.pid, e);
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
    .filter((e) => e.start - (trip.get(e.pid).minutes + BUFFER_MIN) * 60000 + slack >= now)
    .sort((a, b) => a.start - b.start);
  const first = reachableNow()[0] || firstReachable.get(bySoon[0]);
  const winMs = (grace ? LATE_WINDOW_MIN : WINDOW_MIN) * 60000;
  if (first) {
    const end = first.start + winMs;
    const inWindow = new Map();
    for (const e of sorted) {
      if (e.start < first.start || e.start > end || trip.has(e.pid) || inWindow.has(e.pid)) continue;
      if (e.start - (est.get(e.pid) + BUFFER_MIN) * 60000 + slack >= now) inWindow.set(e.pid, e);
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
      // leaving now, how many minutes after the start you'd walk in (0 = on time)
      const lateBy = Math.max(0, Math.ceil((now - leaveBy) / 60000) - BUFFER_MIN);
      return { ...e, travelMin: t.minutes, travelSource: t.source, travelWalk: !!t.walk, leaveBy, lateMin: lateBy, distanceKm: haversineKm(origin, byId.get(e.pid)) };
    })
    .filter((e) => e.leaveBy + slack >= now && e.travelMin <= MAX_TRIP_MIN)
    .sort((a, b) => a.start - b.start || a.travelMin - b.travelMin);

  const byTrip = (a, b) => (grace ? a.lateMin - b.lateMin : 0) || a.travelMin - b.travelMin || a.start - b.start;
  let best = null;
  let windowEnd = -Infinity;
  if (reachable.length) {
    windowEnd = reachable[0].start + winMs;
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

const api = { rank, estimateMinutes, walksFaster, preferWalk, haversineKm, BUFFER_MIN, WINDOW_MIN, MAX_LATE_MIN };
if (typeof module !== "undefined") module.exports = api;
else root.MassRank = api;
})(this);
