(function (root) {
// Adoration and Confession: when each parish has them, and which one you can get to.
//
// The times come from data.services (data/services.json, hand-checked from parish websites and myCatholicSG; see its
// _about). Unlike a Mass, most of these are windows that are open for a while:
//   "open"    an Adoration room's hours, or a Confession slot: you can walk in any time before it closes
//   "session" something with a start time only (a Holy Hour, Confession "after the morning Mass"): be there when it starts
// Confession "N minutes before Mass" is worked out from the Mass times themselves, so a cancelled Mass takes its
// Confession with it.
//
// Rule for the answer (kept explainable, like rank.js):
//   1. A window is reachable if you'd get there before its last useful moment: MIN_STAY before an Adoration room
//      closes, CONFESSION_MARGIN before Confession ends (there may be a queue), or 5 minutes before a session starts.
//   2. You arrive when it opens, or now + travel if it's already open.
//   3. Take the earliest arrival; among arrivals within WINDOW_MIN of it, the shortest trip wins.
const S = typeof module !== "undefined" ? require("./schedule.js") : root.MassSchedule;
const R = typeof module !== "undefined" ? require("./rank.js") : root.MassRank;

const KINDS = ["adoration", "confession"];
const HORIZON_DAYS = { adoration: 2, confession: 7 }; // most Confession is only at weekends
const MIN_STAY = 20;          // an Adoration room closing sooner than this after you arrive isn't worth the trip
const CONFESSION_MARGIN = 10; // arrive at least this long before Confession ends
const WINDOW_MIN = 60;
const MAX_ROUTED = 8;
const MAX_TRIP_MIN = 75;
const MIN = 60000, DAY = 864e5;

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minOfDay = (ms) => { const d = new Date(ms + S.SGT_OFFSET_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const iso = (day) => day.toISOString().slice(0, 10);
const onDay = (e, day) => e.days.includes(day.getUTCDay()) && (!e.weeks || S.ruleOn({ d: day.getUTCDay(), weeks: e.weeks }, day));
const dated = (e, date) => (!e.since || date >= e.since) && (!e.until || date <= e.until);
const onHoliday = (e, ph) => (e.ph === "skip" ? !ph : e.ph === "only" ? ph : true);
// which Masses have Confession before them
function massMatches(sel, e) {
  const d = new Date(e.start + S.SGT_OFFSET_MS).getUTCDay(), m = minOfDay(e.start);
  if (sel === "all") return true;
  if (sel === "weekend") return (d === 6 && m >= toMin("14:00")) || d === 0;
  return sel.some((s) => s.days.includes(d) && (!s.from || m >= toMin(s.from)));
}
const isLang = (want, l) => !want || String(l || "English").toLowerCase().startsWith(want.toLowerCase());

// every Adoration or Confession window at one parish that is still open (or starts) from fromMs, for `days` days
function expandServices(pid, data, kind, fromMs, days) {
  const spec = data.services && data.services.parishes && data.services.parishes[pid] && data.services.parishes[pid][kind];
  if (!spec) return [];
  const out = [];
  const first = S.sgtDay(fromMs).getTime() - DAY; // yesterday too: a room open since this morning, a vigil past midnight
  const masses = (spec.beforeMass || spec.slots) ? S.expandParish(String(pid), data, first - S.SGT_OFFSET_MS, days + 1) : [];
  const base = { pid: Number(pid), kind };
  const open = (start, end, x, extra = {}) => out.push({ ...base, from: x.source || spec.from || "", type: "open", start, end,
    lastIn: end - (kind === "adoration" ? MIN_STAY : CONFESSION_MARGIN) * MIN, loc: x.loc || spec.loc || "", note: x.note || spec.note || "", name: x.name || "", ...extra });
  const session = (start, x) => out.push({ ...base, from: x.source || spec.from || "", type: "session", start, end: null, lastIn: start - R.BUFFER_MIN * MIN,
    loc: x.loc || spec.loc || "", note: x.note || spec.note || "", name: x.name || "" });
  for (let i = 0; i <= days + 1; i++) {
    const day = new Date(first + i * DAY), date = iso(day), ph = !!(data.holidays && data.holidays[date]);
    const ok = (e) => onDay(e, day) && dated(e, date) && onHoliday(e, ph);
    for (const e of (spec.hours || []).filter(ok)) {
      const start = S.toInstant(date, e.from);
      let end = S.toInstant(date, e.to);
      if (end <= start) end += DAY; // a night vigil
      open(start, end, e);
    }
    for (const e of (spec.sessions || []).filter(ok)) session(S.toInstant(date, e.t), e);
    for (const e of (spec.dated || []).filter((x) => x.date === date)) session(S.toInstant(date, e.t), e);
    for (const e of (spec.slots || []).filter(ok)) {
      if (e.t) { session(S.toInstant(date, e.t), e); continue; }
      const start = S.toInstant(date, e.from);
      if (e.to !== "mass") { open(start, S.toInstant(date, e.to), e); continue; }
      // "until Mass begins": no Mass that day (cancelled, say), no Confession
      const m = masses.find((x) => x.start > start && x.start - start <= 3 * 3600e3);
      if (m) open(start, m.start, e, { mass: m.start });
    }
  }
  for (const m of masses) {
    const date = iso(S.sgtDay(m.start));
    for (const b of spec.beforeMass || []) {
      if (!dated(b, date) || !massMatches(b.masses, m) || !isLang(b.lang, m.lang)) continue;
      if ((b.except || []).some((x) => x.d === new Date(m.start + S.SGT_OFFSET_MS).getUTCDay() && toMin(x.t) === minOfDay(m.start))) continue;
      open(m.start - b.min * MIN, m.start - (b.end || 0) * MIN, b, { mass: m.start });
    }
  }
  // two rules can describe the same slot; keep one
  const seen = new Set();
  return out
    .filter((w) => (w.end ?? w.start) > fromMs)
    .sort((a, b) => a.start - b.start)
    .filter((w) => { const k = `${w.start}|${w.end}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// parishes that mention Adoration or Confession without clear times: left out of the finder, pointed to instead
function unconfirmed(data, kind) {
  const all = (data.services && data.services.parishes) || {};
  return Object.entries(all).filter(([, x]) => x[kind] && x[kind].unconfirmed).map(([pid, x]) => ({ pid: Number(pid), text: x[kind].unconfirmed }));
}

function expandAllServices(data, kind, fromMs, days = HORIZON_DAYS[kind]) {
  const all = [];
  for (const p of data.parishes) all.push(...expandServices(String(p.id), data, kind, fromMs, days));
  return all.sort((a, b) => a.start - b.start);
}

// when you'd get there, and when to set off, for a window and a trip of `minutes`
function plan(w, minutes, now) {
  const target = w.type === "session" ? w.lastIn : w.start; // aim to be there as it opens, or 5 min before it starts
  const arrive = Math.max(now + minutes * MIN, target);
  return { arrive, leaveAt: Math.max(now, target - minutes * MIN), leaveBy: w.lastIn - minutes * MIN, openOnArrival: w.type === "open" && arrive >= w.start };
}

/**
 * @param {object} p
 * @param {{lat:number,lng:number}} p.origin
 * @param {number} p.now
 * @param {"transit"|"drive"|"walk"} p.mode
 * @param {Array} p.parishes
 * @param {Array} p.windows       from expandAllServices
 * @param {(parish, departMs)=>Promise<{minutes,source,walk}|null>} [p.travel]
 * @param {boolean} [p.fast]      estimate-only
 * @returns {Promise<{best, alternatives, considered}>}
 */
async function rankOpen({ origin, now, mode = "transit", parishes, windows, travel, fast = false }) {
  const byId = new Map(parishes.map((p) => [p.id, p]));
  const km = (id) => R.haversineKm(origin, byId.get(id));
  const est = new Map(parishes.map((p) => [p.id, R.estimateMinutes(km(p.id), mode)]));
  const trip = new Map();
  if (fast) for (const id of est.keys()) trip.set(id, { minutes: est.get(id), source: "estimate", walk: R.walksFaster(km(id), mode) });

  // the first window at each parish you'd make on the estimate
  const firstOn = (minutesOf) => {
    const m = new Map();
    for (const w of windows) {
      if (m.has(w.pid) || !byId.has(w.pid)) continue;
      const t = minutesOf(w.pid);
      if (t != null && t <= MAX_TRIP_MIN && now + t * MIN <= w.lastIn) m.set(w.pid, w);
    }
    return m;
  };
  const guess = firstOn((id) => est.get(id));
  const byArrival = [...guess.entries()].sort((a, b) => plan(a[1], est.get(a[0]), now).arrive - plan(b[1], est.get(b[0]), now).arrive).map(([id]) => id);
  const ids = [...new Set([...byArrival.slice(0, MAX_ROUTED), ...[...guess.keys()].sort((a, b) => est.get(a) - est.get(b)).slice(0, 2)])];
  await Promise.all(ids.filter((id) => !trip.has(id)).map(async (id) => {
    let r = null;
    if (travel) { try { r = await travel(byId.get(id), plan(guess.get(id), est.get(id), now).leaveAt); } catch { r = null; } }
    trip.set(id, r && Number.isFinite(r.minutes)
      ? { minutes: Math.round(r.minutes), source: r.source || "route", walk: mode === "transit" && !!r.walk }
      : { minutes: est.get(id), source: "estimate", walk: R.walksFaster(km(id), mode) });
  }));

  const reach = [...firstOn((id) => trip.get(id)?.minutes).entries()].map(([id, w]) => {
    const t = trip.get(id);
    return { ...w, ...plan(w, t.minutes, now), travelMin: t.minutes, travelSource: t.source, travelWalk: !!t.walk, distanceKm: km(id) };
  }).sort((a, b) => a.arrive - b.arrive || a.travelMin - b.travelMin);
  const byTrip = (a, b) => a.travelMin - b.travelMin || a.arrive - b.arrive;
  const soon = reach.length ? reach.filter((e) => e.arrive <= reach[0].arrive + WINDOW_MIN * MIN).sort(byTrip) : [];
  const best = soon[0] || null;
  const alternatives = [...soon.slice(1), ...reach.filter((e) => !soon.includes(e))].slice(0, 3);
  return { best, alternatives, considered: trip.size };
}

const api = { expandServices, expandAllServices, unconfirmed, rankOpen, plan, KINDS, HORIZON_DAYS, MIN_STAY, CONFESSION_MARGIN, WINDOW_MIN };
if (typeof module !== "undefined") module.exports = api;
else root.MassServices = api;
})(this);
