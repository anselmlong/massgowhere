// Expands myCatholicSG-style schedule rules into concrete Mass times.
// All date math is done in fixed Singapore time (UTC+8, no DST), independent of the viewer's timezone.
(function (root) {
  const SGT_OFFSET_MS = 8 * 3600 * 1000;

  // SGT wall-clock date of an instant, as a UTC-midnight Date (use getUTC* on it)
  function sgtDay(ms) {
    const d = new Date(ms + SGT_OFFSET_MS);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  function iso(day) {
    return day.toISOString().slice(0, 10);
  }
  // instant for an SGT wall-clock date ("YYYY-MM-DD") + "HH:MM"
  function toInstant(isoDate, hhmm) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    return Date.UTC(y, m - 1, d, h, mi) - SGT_OFFSET_MS;
  }
  const norm = (s) => (s || "").trim().toLowerCase();
  const slotKey = (date, e) => [date, e.t, norm(e.type), norm(e.loc)].join("|");

  // Returns events sorted by start, for one parish, between fromMs and fromMs + days.
  function expandParish(pid, data, fromMs, days) {
    const rules = data.rules[pid] || [];
    const dated = data.dated[pid] || [];
    const start = sgtDay(fromMs);
    const byKey = new Map();

    for (let i = 0; i <= days; i++) {
      const day = new Date(start.getTime() + i * 86400000);
      const dow = day.getUTCDay();
      const date = iso(day);
      const nth = Math.floor((day.getUTCDate() - 1) / 7) + 1; // this weekday's occurrence in the month
      for (const r of rules) {
        if (r.d !== dow) continue;
        if (r.k === "n" && r.n !== nth) continue;
        byKey.set(slotKey(date, r), { ...r, date });
      }
    }
    // remove + override both cancel the matching recurring slot; override and add then add their own event
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

  function expandAll(data, fromMs, days) {
    const all = [];
    for (const p of data.parishes) all.push(...expandParish(String(p.id), data, fromMs, days));
    return all.sort((a, b) => a.start - b.start);
  }

  // Dated removes/overrides in the window that matched no recurring slot (data-quality check)
  function unmatched(data, fromMs, days) {
    const res = [];
    const start = sgtDay(fromMs);
    const endIso = iso(new Date(start.getTime() + days * 86400000));
    for (const p of data.parishes) {
      const pid = String(p.id);
      const rules = data.rules[pid] || [];
      for (const e of data.dated[pid] || []) {
        if (e.k === "a" || e.date < iso(start) || e.date > endIso) continue;
        const [y, m, d] = e.date.split("-").map(Number);
        const day = new Date(Date.UTC(y, m - 1, d));
        const nth = Math.floor((d - 1) / 7) + 1;
        const hit = rules.some(
          (r) => r.d === day.getUTCDay() && (r.k === "w" || r.n === nth) &&
            slotKey(e.date, r) === slotKey(e.date, e)
        );
        if (!hit) res.push({ pid, ...e });
      }
    }
    return res;
  }

  const api = { expandParish, expandAll, unmatched, toInstant, sgtDay, SGT_OFFSET_MS };
  if (typeof module !== "undefined") module.exports = api;
  else root.MassSchedule = api;
})(this);
