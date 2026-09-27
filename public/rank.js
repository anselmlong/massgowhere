(function (root) {
// Picks the Mass you can realistically make, given where you are, how you travel, and the time.
//
// Rule (kept deliberately explainable, every client shows the same answer):
//   1. A Mass is reachable if  now + travel + buffer <= start.
//   2. Take the earliest reachable start time S.
//   3. Among reachable Masses starting within WINDOW of S, prefer the shortest trip
//      (a Mass 10 min later but 20 min closer is the better pick).
//   4. "Leave by" = start - travel - buffer.

const BUFFER_MIN = 5;
const WINDOW_MIN = 15;
const MAX_ROUTED = 6;
const MAX_TRIP_MIN = 75; // never suggest a trip longer than this

function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rough door-to-door minutes from straight-line distance; used to shortlist and as a fallback.
function estimateMinutes(km, mode) {
  const road = km * 1.3;
  if (mode === "walk") return Math.round((road / 4.8) * 60);
  if (mode === "drive") return Math.round(4 + (road / 30) * 60);
  return Math.round(10 + (road / 17) * 60); // transit
}

/**
 * @param {object} p
 * @param {{lat:number,lng:number}} p.origin
 * @param {number} p.now            epoch ms
 * @param {"transit"|"drive"|"walk"} p.mode
 * @param {Array} p.parishes        [{id,name,lat,lng,...}]
 * @param {Array} p.events          upcoming Masses [{pid,start,...}], any order
 * @param {(parish, departMs)=>Promise<{minutes:number,source:string}|null>} [p.travel]  real routing; null -> estimate
 * @returns {Promise<{best, alternatives, nearest, considered}>}
 */
async function rank({ origin, now, mode = "transit", parishes, events, travel }) {
  const byId = new Map(parishes.map((p) => [p.id, p]));
  const est = new Map(parishes.map((p) => [p.id, estimateMinutes(haversineKm(origin, p), mode)]));

  // Shortlist parishes by when you could plausibly arrive at one of their Masses (optimistic estimate).
  const firstPlausible = new Map(); // pid -> {arrival score, departure time to route for}
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    if (firstPlausible.has(e.pid)) continue;
    const optimistic = now + est.get(e.pid) * 0.6 * 60000;
    if (e.start >= optimistic) {
      const depart = Math.max(now, e.start - (est.get(e.pid) + BUFFER_MIN) * 60000);
      firstPlausible.set(e.pid, { score: e.start + est.get(e.pid) * 60000, depart });
    }
  }
  const nearestIds = [...est.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([id]) => id);
  const shortlist = [...new Set([
    ...[...firstPlausible.entries()].sort((a, b) => a[1].score - b[1].score).slice(0, MAX_ROUTED).map(([id]) => id),
    ...nearestIds,
  ])];

  // Real travel time for the shortlist (parallel), estimate otherwise.
  const trip = new Map();
  await Promise.all(shortlist.map(async (id) => {
    let r = null;
    if (travel) {
      // route for when you'd actually set off (transit at 1am is not transit at 6am)
      try { r = await travel(byId.get(id), firstPlausible.get(id)?.depart ?? now); } catch { r = null; }
    }
    trip.set(id, r && Number.isFinite(r.minutes) ? { minutes: Math.round(r.minutes), source: r.source || "route" } : { minutes: est.get(id), source: "estimate" });
  }));

  const reachable = events
    .filter((e) => trip.has(e.pid))
    .map((e) => {
      const t = trip.get(e.pid);
      const leaveBy = e.start - (t.minutes + BUFFER_MIN) * 60000;
      return { ...e, travelMin: t.minutes, travelSource: t.source, leaveBy, distanceKm: haversineKm(origin, byId.get(e.pid)) };
    })
    .filter((e) => e.leaveBy >= now && e.travelMin <= MAX_TRIP_MIN)
    .sort((a, b) => a.start - b.start || a.travelMin - b.travelMin);

  let best = null;
  if (reachable.length) {
    const cutoff = reachable[0].start + WINDOW_MIN * 60000;
    best = reachable.filter((e) => e.start <= cutoff).sort((a, b) => a.travelMin - b.travelMin || a.start - b.start)[0];
  }
  // alternatives: other churches, same preference (soon, then short trip) using 15-min start buckets
  const bucket = (e) => Math.floor((e.start - now) / (WINDOW_MIN * 60000));
  const ordered = [...reachable].sort((a, b) => bucket(a) - bucket(b) || a.travelMin - b.travelMin);
  const seen = new Set(best ? [best.pid] : []);
  const alternatives = [];
  for (const e of ordered) {
    if (seen.has(e.pid)) continue;
    seen.add(e.pid);
    alternatives.push(e);
    if (alternatives.length === 3) break;
  }

  const nearestId = [...trip.entries()].sort((a, b) => a[1].minutes - b[1].minutes)[0]?.[0];
  const nearest = nearestId == null ? null : {
    pid: nearestId,
    travelMin: trip.get(nearestId).minutes,
    travelSource: trip.get(nearestId).source,
    distanceKm: haversineKm(origin, byId.get(nearestId)),
    next: reachable.find((e) => e.pid === nearestId) || null,
  };
  return { best, alternatives, nearest, considered: shortlist.length };
}

const api = { rank, estimateMinutes, haversineKm, BUFFER_MIN, WINDOW_MIN };
if (typeof module !== "undefined") module.exports = api;
else root.MassRank = api;
})(this);
