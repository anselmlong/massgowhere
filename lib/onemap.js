// OneMap routing (Singapore Land Authority). Token is fetched from email/password and cached (valid 72h).
const BASE = "https://www.onemap.gov.sg";
let token = null;
let tokenExp = 0;
const cache = new Map(); // key -> {minutes, at}
const CACHE_MS = 30 * 60000;

async function getToken() {
  if (token && Date.now() < tokenExp - 3600e3) return token;
  const r = await fetch(`${BASE}/api/auth/post/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ONEMAP_EMAIL, password: process.env.ONEMAP_PASSWORD }),
  });
  if (!r.ok) throw new Error(`OneMap auth ${r.status}`);
  const j = await r.json();
  token = j.access_token;
  tokenExp = Number(j.expiry_timestamp) * 1000;
  return token;
}

function sgtParts(ms) {
  const d = new Date(ms + 8 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`,
  };
}

/** Door-to-door minutes from origin to dest, or null if OneMap has no route. */
async function routeMinutes(origin, dest, mode, departMs = Date.now()) {
  const key = [origin.lat.toFixed(3), origin.lng.toFixed(3), dest.lat, dest.lng, mode, Math.floor(departMs / 3600e3)].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.minutes;

  const routeType = mode === "transit" ? "pt" : mode === "drive" ? "drive" : "walk";
  const q = new URLSearchParams({ start: `${origin.lat},${origin.lng}`, end: `${dest.lat},${dest.lng}`, routeType });
  if (routeType === "pt") {
    const { date, time } = sgtParts(departMs);
    q.set("date", date); q.set("time", time); q.set("mode", "TRANSIT"); q.set("maxWalkDistance", "1000"); q.set("numItineraries", "1");
  }
  const r = await fetch(`${BASE}/api/public/routingsvc/route?${q}`, {
    headers: { Authorization: await getToken() },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`OneMap route ${r.status}`);
  const j = await r.json();
  const seconds = routeType === "pt" ? j?.plan?.itineraries?.[0]?.duration : j?.route_summary?.total_time;
  const minutes = Number.isFinite(seconds) ? Math.ceil(seconds / 60) : null;
  cache.set(key, { minutes, at: Date.now() });
  return minutes;
}

module.exports = { routeMinutes };
