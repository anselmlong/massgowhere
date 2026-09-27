// GET /api/next?lat=1.30&lng=103.8&mode=transit|drive|walk[&lang=English]
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

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  try {
    await answer(req, res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Something went wrong working out the next Mass. Please try again." });
  }
};

async function answer(req, res) {
  const u = new URL(req.url, "http://x");
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const mode = MODES.has(u.searchParams.get("mode")) ? u.searchParams.get("mode") : "transit";
  const lang = u.searchParams.get("lang") || "";
  // same rough box as bot/bot.py: a lat/lng box cannot fully separate Woodlands from Johor Bahru
  if (!(lat > 1.15 && lat < 1.475 && lng > 103.59 && lng < 104.1)) {
    return send(res, 400, { error: "lat/lng must be a point in Singapore" });
  }
  const now = Date.now();
  const origin = { lat, lng };
  const events = S.expandAll(data, now, HORIZON_DAYS).filter((e) => !lang || e.lang.toLowerCase() === lang.toLowerCase());
  const travel = async (p, departMs) => {
    const minutes = await routeMinutes(origin, p, mode, departMs);
    return minutes == null ? null : { minutes, source: "onemap" };
  };
  const r = await rank({ origin, now, mode, parishes: data.parishes, events, travel });
  const byId = new Map(data.parishes.map((p) => [p.id, p]));

  send(res, 200, {
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
    specialDay: r.best ? S.specialDay(r.best.start, data) : null,
    dataAsOf: data.asOf,
  });
}
