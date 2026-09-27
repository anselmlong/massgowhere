// GET /api/next?lat=1.30&lng=103.8&mode=transit|drive|walk[&lang=English][&type=Mass]
// The one answer every client (website, Telegram bots) shows: which Mass you can make, and when to leave.
const S = require("../public/schedule.js");
const data = require("../public/data.json");
const { rank } = require("../public/rank.js");
const { routeMinutes } = require("../lib/onemap.js");

const HORIZON_DAYS = 2;
const MODES = new Set(["transit", "drive", "walk"]);

function summarize(e, byId) {
  if (!e) return null;
  const p = byId.get(e.pid);
  return {
    parish: { id: p.id, name: p.name, address: p.address, postal: p.postal, lat: p.lat, lng: p.lng },
    start: new Date(e.start).toISOString(),
    leaveBy: e.leaveBy != null ? new Date(e.leaveBy).toISOString() : null,
    travelMin: e.travelMin,
    travelSource: e.travelSource,
    distanceKm: Math.round(e.distanceKm * 10) / 10,
    language: e.lang,
    location: e.loc,
    note: e.note || "",
  };
}

module.exports = async function handler(req, res) {
  const u = new URL(req.url, "http://x");
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const mode = MODES.has(u.searchParams.get("mode")) ? u.searchParams.get("mode") : "transit";
  const lang = u.searchParams.get("lang") || "";
  if (!(lat > 1.1 && lat < 1.5 && lng > 103.5 && lng < 104.1)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "lat/lng must be a point in Singapore" }));
  }
  const now = Date.now();
  const origin = { lat, lng };
  const events = S.expandAll(data, now, HORIZON_DAYS).filter((e) => !lang || e.lang === lang);
  const travel = async (p, departMs) => {
    const minutes = await routeMinutes(origin, p, mode, departMs);
    return minutes == null ? null : { minutes, source: "onemap" };
  };
  const r = await rank({ origin, now, mode, parishes: data.parishes, events, travel });
  const byId = new Map(data.parishes.map((p) => [p.id, p]));

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({
    now: new Date(now).toISOString(),
    mode,
    best: summarize(r.best, byId),
    alternatives: r.alternatives.map((e) => summarize(e, byId)),
    nearest: r.nearest && {
      parish: summarize({ ...r.nearest, start: now, leaveBy: null, lang: "", loc: "" }, byId).parish,
      travelMin: r.nearest.travelMin,
      travelSource: r.nearest.travelSource,
      distanceKm: Math.round(r.nearest.distanceKm * 10) / 10,
      next: summarize(r.nearest.next, byId),
    },
    dataAsOf: data.asOf,
  }));
};
