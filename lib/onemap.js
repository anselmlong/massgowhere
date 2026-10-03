// OneMap routing (Singapore Land Authority). Token is fetched from email/password and cached (valid 72h).
const BASE = "https://www.onemap.gov.sg";
let token = null;
let tokenExp = 0;
let tokenP = null;          // in-flight login, shared by concurrent callers
let authFailedAt = 0;       // back off for a few minutes after a failed login
const cache = new Map();    // key -> {minutes, at}; insertion-ordered, capped
const CACHE_MS = 30 * 60000;
const CACHE_MAX = 2000;

async function getToken() {
  if (token && Date.now() < tokenExp - 3600e3) return token;
  if (Date.now() - authFailedAt < 5 * 60000) throw new Error("OneMap auth recently failed");
  tokenP ||= (async () => {
    try {
      const r = await fetch(`${BASE}/api/auth/post/getToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: process.env.ONEMAP_EMAIL, password: process.env.ONEMAP_PASSWORD }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`OneMap auth ${r.status}`);
      const j = await r.json();
      if (!j.access_token) throw new Error("OneMap auth: no token");
      token = j.access_token;
      const exp = Number(j.expiry_timestamp) * 1000;
      tokenExp = Number.isFinite(exp) && exp > Date.now() ? exp : Date.now() + 71 * 3600e3;
      return token;
    } catch (e) {
      authFailedAt = Date.now();
      throw e;
    } finally {
      tokenP = null;
    }
  })();
  return tokenP;
}

function sgtParts(ms) {
  const d = new Date(ms + 8 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`,
  };
}

// OneMap's driving route is free-flow: the same at 8am as at 2pm. Stretch it in Singapore's weekday rush hours.
// Bus & MRT already follow the timetable for the departure time, and walking doesn't change.
const PEAK_FACTOR = 1.4;
const PEAKS = [[7 * 60 + 30, 9 * 60 + 30], [17 * 60 + 30, 20 * 60]]; // minutes after midnight, SGT
function driveFactor(departMs) {
  const d = new Date(departMs + 8 * 3600e3);
  const day = d.getUTCDay(), min = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && PEAKS.some(([a, b]) => min >= a && min < b) ? PEAK_FACTOR : 1;
}

/** Door-to-door minutes from origin to dest, or null if OneMap has no route. */
async function routeMinutes(origin, dest, mode, departMs = Date.now()) {
  const key = [origin.lat.toFixed(3), origin.lng.toFixed(3), dest.lat, dest.lng, mode, Math.floor(departMs / (15 * 60000))].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.minutes;

  const routeType = mode === "transit" ? "pt" : mode === "drive" ? "drive" : "walk";
  const q = new URLSearchParams({ start: `${origin.lat},${origin.lng}`, end: `${dest.lat},${dest.lng}`, routeType });
  if (routeType === "pt") {
    const { date, time } = sgtParts(departMs);
    q.set("date", date); q.set("time", time); q.set("mode", "TRANSIT"); q.set("maxWalkDistance", "1000"); q.set("numItineraries", "1");
  }
  const get = async () => fetch(`${BASE}/api/public/routingsvc/route?${q}`, {
    headers: { Authorization: await getToken() },
    signal: AbortSignal.timeout(5000),
  });
  let r = await get();
  if (r.status === 401) { token = null; tokenExp = 0; r = await get(); } // token revoked or rotated early
  if (!r.ok) throw new Error(`OneMap route ${r.status}`);
  const j = await r.json();
  const seconds = routeType === "pt" ? j?.plan?.itineraries?.[0]?.duration : j?.route_summary?.total_time;
  const factor = routeType === "drive" ? driveFactor(departMs) : 1;
  const minutes = Number.isFinite(seconds) ? Math.ceil(seconds * factor / 60) : null;
  if (minutes != null) {
    cache.set(key, { minutes, at: Date.now() });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  return minutes;
}

const { preferWalk } = require("../public/rank.js");
const WALK_CHECK_KM = 2; // a 15-minute walk is ~1.2 km in a straight line; beyond 2 km it is always the bus
function straightKm(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * The trip as someone would really make it: {minutes, walk} or null.
 * OneMap's public-transport router always puts you on a bus or train, so for a church close by
 * we also route the walk, and walk when preferWalk says so (a short walk, or a slightly longer one
 * that is no slower than the bus).
 */
async function tripMinutes(origin, dest, mode, departMs = Date.now()) {
  if (mode !== "transit" || straightKm(origin, dest) > WALK_CHECK_KM) {
    const minutes = await routeMinutes(origin, dest, mode, departMs);
    return minutes == null ? null : { minutes, walk: mode === "walk" };
  }
  const [pt, walk] = await Promise.all([
    routeMinutes(origin, dest, "transit", departMs).catch(() => null),
    routeMinutes(origin, dest, "walk", departMs).catch(() => null),
  ]);
  if (preferWalk(walk, pt)) return { minutes: walk, walk: true };
  if (pt != null) return { minutes: pt, walk: false };
  return walk == null ? null : { minutes: walk, walk: true }; // no bus route at all: walking is the trip
}

// One trip, but give up after `ms` (null): an answer must not wait on one slow OneMap call; that church falls back
// to its distance estimate. The call carries on in the background and still fills the cache for next time.
const TRIP_BUDGET_MS = 3500;
function tripMinutesWithin(origin, dest, mode, departMs, ms = TRIP_BUDGET_MS) {
  return Promise.race([
    tripMinutes(origin, dest, mode, departMs).catch(() => null),
    new Promise((ok) => setTimeout(() => ok(null), ms)),
  ]);
}

// Place search (postal codes, MRT stations, buildings, streets): OneMap's elastic search. OneMap now wants a token for
// search: without one it still answers, with an "Authentication token missing" warning beside the results. So: with our
// token first; if that reply has an error and no results (a token OneMap rejects), again without one. Results count
// whenever there are any, warning or not. Throws when nothing usable came back, so "not found" ([]) only means OneMap
// found nothing.
let searchWarned = "";
async function searchPlaces(q, limit = 5) {
  const url = `${BASE}/api/common/elastic/search?` + new URLSearchParams({ searchVal: q, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
  const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Mrt|Lrt|Nus|Ntu|Smu|Cbd|Hdb|[A-Za-z]{1,3}\d+)\b/g, (m) => m.toUpperCase());
  let token = null;
  try { token = await getToken(); } catch (e) { console.warn("OneMap login failed, searching without a token:", e.message); }
  let last;
  for (const auth of token ? [token, null, null] : [null, null]) {
    const headers = { "User-Agent": "Mozilla/5.0 (compatible; MassGoWhere; +https://massgowhere.com)" };
    if (auth) headers.Authorization = auth;
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch { throw new Error(`OneMap search ${r.status}: ${text.slice(0, 200)}`); }
      const results = Array.isArray(j.results) ? j.results : [];
      if (j.error && j.error !== searchWarned) { searchWarned = j.error; console.warn(`OneMap search (${auth ? "with" : "without"} token):`, j.error); }
      // an error with no results is a refusal (a rejected token, say), not "nothing found": try the next way
      if ((j.error || !r.ok || !Array.isArray(j.results)) && !results.length) throw new Error(`OneMap search ${r.status}: ${j.error || text.slice(0, 200)}`);
      return results.slice(0, limit).map((x) => ({
        lat: Number(x.LATITUDE), lng: Number(x.LONGITUDE), postal: x.POSTAL !== "NIL" ? x.POSTAL : "",
        name: title(x.BUILDING && x.BUILDING !== "NIL" ? x.BUILDING : x.SEARCHVAL), address: title(x.ADDRESS || ""),
      })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

module.exports = { tripMinutesWithin, TRIP_BUDGET_MS, routeMinutes, tripMinutes, driveFactor, searchPlaces };
