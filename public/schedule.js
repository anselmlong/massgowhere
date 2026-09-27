// Expands parish schedule rules into concrete service times.
// All date math is done in fixed Singapore time (UTC+8, no DST), independent of the viewer's timezone.
//
// Recurring rule: {d: weekday 0=Sun, t: "HH:MM", weeks: [] | [1..5, -1=last], except: [...], type, lang, loc, note}
// Dated entry:    {k: "a"dd | "r"emove | "o"verride, date: "YYYY-MM-DD", t, type, lang, loc, note}
(function (root) {
  const SGT_OFFSET_MS = 8 * 3600 * 1000;

  // SGT wall-clock date of an instant, as a UTC-midnight Date (use getUTC* on it)
  function sgtDay(ms) {
    const d = new Date(ms + SGT_OFFSET_MS);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const iso = (day) => day.toISOString().slice(0, 10);
  function toInstant(isoDate, hhmm) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    return Date.UTC(y, m - 1, d, h, mi) - SGT_OFFSET_MS;
  }
  const norm = (s) => (s || "").trim().toLowerCase();
  const slotKey = (date, e) => [date, e.t, norm(e.type), norm(e.loc)].join("|");

  // which occurrence of its weekday this date is (1..5), and whether it is the last one in the month
  function weekOf(day) {
    const n = Math.floor((day.getUTCDate() - 1) / 7) + 1;
    const last = new Date(day.getTime() + 7 * 86400000).getUTCMonth() !== day.getUTCMonth();
    return { n, last };
  }
  function ruleOn(r, day) {
    if (r.d !== day.getUTCDay()) return false;
    const { n, last } = weekOf(day);
    const inList = (list) => list.includes(n) || (last && list.includes(-1));
    const weeks = r.weeks || (r.k === "n" ? [r.n] : []);
    if (weeks.length && !inList(weeks)) return false;
    if ((r.except || []).length && inList(r.except)) return false;
    return true;
  }

  // Returns events sorted by start, for one parish, between fromMs and fromMs + days (inclusive of that SGT day).
  function expandParish(pid, data, fromMs, days, types = ["Mass"]) {
    const want = (e) => !types || types.includes(e.type || "Mass");
    const rules = (data.rules[pid] || []).filter(want);
    const dated = (data.dated[pid] || []).filter(want);
    const parish = (data.parishes || []).find((p) => String(p.id) === String(pid)) || {};
    const ph = parish.publicHoliday || {};
    const holidays = data.holidays || {};
    const start = sgtDay(fromMs);
    const byKey = new Map();

    for (let i = 0; i <= days; i++) {
      const day = new Date(start.getTime() + i * 86400000);
      const date = iso(day);
      const dow = day.getUTCDay();
      const phWeekday = holidays[date] && dow >= 1 && dow <= 5 && (ph.noWeekday || (ph.times || []).length);
      for (const r of rules) {
        if (!ruleOn(r, day)) continue;
        if (phWeekday && (r.type || "Mass") === "Mass") continue; // replaced by the public-holiday schedule
        byKey.set(slotKey(date, r), { ...r, date });
      }
      if (phWeekday && want({ type: "Mass" })) {
        for (const t of ph.times || []) {
          const e = { type: "Mass", t, lang: "English", loc: "Main Church", note: `${holidays[date]} (public holiday)` };
          byKey.set(slotKey(date, e), { ...e, date });
        }
      }
    }
    for (const e of dated) {
      if (e.k !== "r" && e.k !== "o") continue;
      if (byKey.delete(slotKey(e.date, e))) continue;
      // location strings get renamed after cancellations are entered; fall back to same date + time + type
      const loose = [e.date, e.t, norm(e.type)].join("|") + "|";
      for (const k of byKey.keys()) if (k.startsWith(loose)) byKey.delete(k);
    }
    for (const e of dated) {
      if (e.k === "a" || e.k === "o") byKey.set(slotKey(e.date, e) + "|" + e.k, { ...e });
    }
    const endMs = start.getTime() - SGT_OFFSET_MS + (days + 1) * 86400000;
    const out = [];
    for (const e of byKey.values()) {
      const s = toInstant(e.date, e.t);
      if (s >= fromMs && s < endMs) out.push({ ...e, pid: Number(pid), start: s });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  function expandAll(data, fromMs, days, types = ["Mass"]) {
    const all = [];
    for (const p of data.parishes) all.push(...expandParish(String(p.id), data, fromMs, days, types));
    return all.sort((a, b) => a.start - b.start);
  }

  const api = { expandParish, expandAll, toInstant, sgtDay, ruleOn, SGT_OFFSET_MS };
  if (typeof module !== "undefined") module.exports = api;
  else root.MassSchedule = api;
})(this);
