// GET /api/way?from=1.35,103.85&to=1.30,103.83&mode=transit|drive|walk[&at=<epoch ms>][&by=<epoch ms>][&fast=1]
// A Mass on the way from A to B: the one that adds the least to the trip, and still gets you to B by `by` if given.
const S = require("../public/schedule.js");
const data = require("../public/data.json");
const { planWay } = require("../public/way.js");
const { tripMinutes } = require("../lib/onemap.js");

const MODES = new Set(["transit", "drive", "walk"]);
const PLAN_DAYS = 7;

const inSingapore = (p) => p && p.lat > 1.15 && p.lat < 1.475 && p.lng > 103.59 && p.lng < 104.1;
function point(raw) {
  const [lat, lng] = String(raw || "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
// a time within the next week; missing or past -> null; beyond a week -> undefined (refused)
function when(raw, now) {
  if (!raw) return null;
  const ms = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(ms) || ms <= now) return null;
  return ms > now + (PLAN_DAYS + 1) * 864e5 ? undefined : ms;
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
    send(res, 500, { error: "Something went wrong finding a Mass on the way. Please try again." });
  }
};

async function answer(req, res) {
  const u = new URL(req.url, "http://x");
  const from = point(u.searchParams.get("from")), to = point(u.searchParams.get("to"));
  if (!inSingapore(from) || !inSingapore(to)) return send(res, 400, { error: "from and to must be lat,lng points in Singapore" });
  const mode = MODES.has(u.searchParams.get("mode")) ? u.searchParams.get("mode") : "transit";
  const now = Date.now();
  const at = when(u.searchParams.get("at"), now), by = when(u.searchParams.get("by"), now);
  if (at === undefined || by === undefined) return send(res, 400, { error: `times must be within the next ${PLAN_DAYS} days` });
  const depart = at ?? now;
  if (by != null && by <= depart) return send(res, 400, { error: "by must be after you set off" });
  const fast = u.searchParams.get("fast") === "1";

  // Masses from when you set off until you need to arrive (or two days, when there's no deadline)
  const events = S.expandAll(data, depart, 2).filter((e) => e.start >= depart && (by == null || e.start < by));
  const travel = async (a, b, departMs) => {
    const t = await tripMinutes(a, b, mode, departMs);
    return t && { minutes: t.minutes, walk: t.walk, source: "onemap" };
  };
  const r = await planWay({ from, to, depart, arriveBy: by, mode, parishes: data.parishes, events, travel: fast ? null : travel, fast });
  const byId = new Map(data.parishes.map((p) => [p.id, p]));
  const iso = (ms) => new Date(ms).toISOString();
  const pack = (s) => s && {
    parish: (({ id, name, address, postal, lat, lng }) => ({ id, name, address, postal, lat, lng }))(byId.get(s.pid)),
    start: iso(s.start), end: iso(s.end), leaveBy: iso(s.leaveBy), arrive: iso(s.arrive),
    toMin: s.toMin, toWalk: !!s.toWalk, onwardMin: s.onwardMin, onwardWalk: !!s.onwardWalk,
    detourMin: s.detourMin, travelSource: s.travelSource,
    language: s.lang, location: s.loc, note: s.note || "",
  };
  send(res, 200, {
    depart: iso(depart), by: by ? iso(by) : null, mode,
    direct: { minutes: r.direct.minutes, source: r.direct.source },
    best: pack(r.best),
    alternatives: r.alternatives.map(pack),
    specialDay: r.best ? S.specialDay(r.best.start, data) : null,
    dataAsOf: data.asOf,
  });
}
