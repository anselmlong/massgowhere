// GET /api/next?lat=1.30&lng=103.8&mode=transit|drive|walk[&lang=English][&part=morning|lunch|evening][&sunday=1][&at=<epoch ms or ISO time>][&late=15]
// sunday=1: only Masses for the Sunday obligation (Sunday, or Saturday from 4pm).
// The one answer every client (website, Telegram bots) shows: which Mass you can make, and when to leave.
// &kind=adoration|confession instead finds an Adoration room open or Confession you can get to (see public/services.js);
// part, lang and late don't apply there.
const S = require("../public/schedule.js");
const data = require("../public/data.json");
const { rank } = require("../public/rank.js");
const { rankOpen, expandAllServices, unconfirmed, KINDS } = require("../public/services.js");
const { tripMinutes } = require("../lib/onemap.js");

const HORIZON_DAYS = 2;
const LONG_HORIZON_DAYS = 7; // a Sunday Mass or a language with few Masses can be most of a week away
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
    walk: !!e.travelWalk, // bus & MRT mode, but walking there is quicker
    lateMin: e.lateMin || 0, // leaving now, minutes after the start you'd arrive (only with late=)
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
  const part = u.searchParams.get("part") || "";
  if (part && !S.PARTS[part]) return send(res, 400, { error: `part must be one of ${Object.keys(S.PARTS).join(", ")}` });
  // same rough box as bot/bot.py: a lat/lng box cannot fully separate Woodlands from Johor Bahru
  if (!(lat > 1.15 && lat < 1.475 && lng > 103.59 && lng < 104.1)) {
    return send(res, 400, { error: "lat/lng must be a point in Singapore" });
  }
  const fast = u.searchParams.get("fast") === "1";
  const at = leaveAt(u.searchParams.get("at"), Date.now());
  if (at === undefined) return send(res, 400, { error: `at must be within the next ${PLAN_DAYS} days` });
  const now = at ?? Date.now();
  const origin = { lat, lng };
  const kind = u.searchParams.get("kind") || "";
  if (kind && !KINDS.includes(kind)) return send(res, 400, { error: `kind must be one of ${KINDS.join(", ")}` });
  if (kind) return answerOpen(res, { kind, origin, now, at, mode, fast });
  // late=N (max 15): Masses that have just started still count if you'd walk in at most N minutes late
  const lateMin = Math.max(0, Math.min(15, Number(u.searchParams.get("late")) || 0));
  const sunday = u.searchParams.get("sunday") === "1";
  const events = S.expandAll(data, now - lateMin * 60000, sunday || lang ? LONG_HORIZON_DAYS : HORIZON_DAYS)
    .filter(S.inLang(lang))
    .filter(S.inPart(part))
    .filter((e) => !sunday || S.forSunday(e));
  const travel = async (p, departMs) => {
    const t = await tripMinutes(origin, p, mode, departMs);
    return t && { minutes: t.minutes, walk: t.walk, source: "onemap" };
  };
  // fast=1: estimate-only ranking (no OneMap routing) for an instant first frame;
  // the client follows up with the default full call to refine exact travel times.
  const travelFn = fast ? null : travel;
  const r = await rank({ origin, now, mode, parishes: data.parishes, events, travel: travelFn, fast, lateMin });
  const byId = new Map(data.parishes.map((p) => [p.id, p]));

  send(res, 200, {
    now: new Date(now).toISOString(),
    at: at ? new Date(at).toISOString() : null,
    mode,
    part: part || null,
    sunday,
    lang: lang || null,
    best: summarize(r.best, byId),
    alternatives: r.alternatives.map((e) => summarize(e, byId)),
    nearest: r.nearest && {
      parish: summarize({ ...r.nearest, start: now, leaveBy: null, lang: "", loc: "" }, byId).parish,
      travelMin: r.nearest.travelMin,
      travelSource: r.nearest.travelSource,
      walk: !!r.nearest.travelWalk,
      distanceKm: Math.round(r.nearest.distanceKm * 10) / 10,
      next: summarize(r.nearest.next, byId),
    },
    specialDay: r.best ? S.specialDay(r.best.start, data) : null,
    dataAsOf: data.asOf,
  });
}

// Adoration or Confession: the window you can get to, when you'd arrive and when to leave
function summarizeOpen(e, byId) {
  if (!e) return null;
  const p = byId.get(e.pid);
  const t = (ms) => (ms == null ? null : new Date(ms).toISOString());
  return {
    parish: { id: p.id, name: p.name, address: p.address, postal: p.postal, lat: p.lat, lng: p.lng, website: p.website, link: p.link },
    kind: e.kind,
    type: e.type, // "open": walk in any time before it closes; "session": starts at a set time (a Holy Hour)
    start: t(e.start),
    end: t(e.end),
    lastIn: t(e.lastIn), // the latest useful arrival
    arrive: t(e.arrive),
    openOnArrival: e.openOnArrival,
    leaveAt: t(e.leaveAt), // to arrive as it opens (or now, if it's already open)
    leaveBy: t(e.leaveBy), // the latest you can set off
    mass: t(e.mass), // Confession before this Mass
    travelMin: e.travelMin,
    travelSource: e.travelSource,
    walk: !!e.travelWalk,
    distanceKm: Math.round(e.distanceKm * 10) / 10,
    name: e.name || "",
    location: e.loc || "",
    note: e.note || "",
    source: e.from || "",
  };
}

async function answerOpen(res, { kind, origin, now, at, mode, fast }) {
  const travel = async (p, departMs) => {
    const t = await tripMinutes(origin, p, mode, departMs);
    return t && { minutes: t.minutes, walk: t.walk, source: "onemap" };
  };
  const r = await rankOpen({ origin, now, mode, parishes: data.parishes, windows: expandAllServices(data, kind, now), travel: fast ? null : travel, fast });
  const byId = new Map(data.parishes.map((p) => [p.id, p]));
  send(res, 200, {
    now: new Date(now).toISOString(),
    at: at ? new Date(at).toISOString() : null,
    mode,
    kind,
    best: summarizeOpen(r.best, byId),
    alternatives: r.alternatives.map((e) => summarizeOpen(e, byId)),
    specialDay: r.best ? S.specialDay(r.best.start, data) : null,
    checked: (data.services && data.services.checked) || null,
    // parishes left out because their times aren't clear: say so, and send people to the parish
    unconfirmed: unconfirmed(data, kind).map((x) => ({ parish: { id: x.pid, name: byId.get(x.pid).name }, text: x.text })),
  });
}
