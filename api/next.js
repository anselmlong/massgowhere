// GET /api/next?lat=1.30&lng=103.8&mode=transit|drive|walk[&lang=English][&at=<epoch ms or ISO time>]
// The one answer every client (website, Telegram bots) shows: which Mass you can make, and when to leave.
const S = require("../public/schedule.js");
const data = require("../public/data.json");
const { rank } = require("../public/rank.js");
const { routeMinutes } = require("../lib/onemap.js");

const HORIZON_DAYS = 2;
const MODES = new Set(["transit", "drive", "walk"]);
const PLAN_DAYS = 7;

// "leave at": a planned departure time, up to a week ahead. Missing, unreadable or already past -> now.
function leaveAt(raw, now) {
  if (!raw) return null;
  const ms = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(ms) || ms <= now) return null;
  return ms > now + (PLAN_DAYS + 1) * 864e5 ? undefined : ms;
}

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
  const fast = u.searchParams.get("fast") === "1";
  const at = leaveAt(u.searchParams.get("at"), Date.now());
  if (at === undefined) return send(res, 400, { error: `at must be within the next ${PLAN_DAYS} days` });
  const now = at ?? Date.now();
  const origin = { lat, lng };
  const events = S.expandAll(data, now, HORIZON_DAYS).filter((e) => !lang || e.lang.toLowerCase() === lang.toLowerCase());
  const travel = async (p, departMs) => {
    const minutes = await routeMinutes(origin, p, mode, departMs);
    return minutes == null ? null : { minutes, source: "onemap" };
  };
  // fast=1: estimate-only ranking (no OneMap routing) for an instant first frame;
  // the client follows up with the default full call to refine exact travel times.
  const travelFn = fast ? null : travel;
  const r = await rank({ origin, now, mode, parishes: data.parishes, events, travel: travelFn, fast });
  const byId = new Map(data.parishes.map((p) => [p.id, p]));

  send(res, 200, {
    now: new Date(now).toISOString(),
    at: at ? new Date(at).toISOString() : null,
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
