// Expands parish schedule rules into concrete service times.
// All date math is done in fixed Singapore time (UTC+8, no DST), independent of the viewer's timezone.
//
// Public holidays are not modelled: parishes vary too much; the UI shows a "check with the parish" notice instead.
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
    const start = sgtDay(fromMs);
    const byKey = new Map();

    for (let i = 0; i <= days; i++) {
      const day = new Date(start.getTime() + i * 86400000);
      const date = iso(day);
      for (const r of rules) {
        if (ruleOn(r, day)) byKey.set(slotKey(date, r), { ...r, date });
      }
    }
    for (const e of dated) {
      if (e.k !== "r" && e.k !== "o") continue;
      if (byKey.delete(slotKey(e.date, e))) continue;
      // location strings get renamed after cancellations are entered: accept same date + time + type,
      // but only when exactly one slot matches (never cancel a church and a chapel Mass at once)
      const loose = [e.date, e.t, norm(e.type)].join("|") + "|";
      const hits = [...byKey.keys()].filter((k) => k.startsWith(loose));
      if (hits.length === 1) byKey.delete(hits[0]);
    }
    for (const e of dated) {
      if (e.k === "o") byKey.set(slotKey(e.date, e), { ...e });
      else if (e.k === "a") {
        const k = slotKey(e.date, e);
        if (byKey.has(k)) byKey.set(k, { ...byKey.get(k), note: e.note || byKey.get(k).note }); // same slot: keep one, prefer the special note
        else byKey.set(k, { ...e });
      }
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

  // A day when regular times often change: public holidays, Christmas Eve/Day, 1 Jan, Holy Thursday to Easter Sunday.
  function easterUTC(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  }
  function specialDay(ms, data) {
    const day = sgtDay(ms), date = iso(day), md = date.slice(5);
    if (md === "12-24") return "Christmas Eve";
    if (md === "12-25") return "Christmas Day";
    if (md === "01-01") return "New Year's Day";
    const off = Math.round((day.getTime() - easterUTC(day.getUTCFullYear())) / 86400000);
    const triduum = { "-3": "Holy Thursday", "-2": "Good Friday", "-1": "Holy Saturday", "0": "Easter Sunday" }[off];
    if (triduum) return triduum;
    return (data && data.holidays && data.holidays[date]) || null;
  }

  // Time of day, in Singapore time. Contiguous so every Mass falls in exactly one: a Sunday 11:30am is
  // morning, a 3:15pm Tagalog Mass is evening (Saturday 4pm vigils sit there too).
  const PARTS = {
    morning: { label: "Morning", range: "before noon", from: 0, to: 12 },
    lunch: { label: "Lunchtime", range: "noon to 3pm", from: 12, to: 15 },
    evening: { label: "Evening", range: "from 3pm", from: 15, to: 24 },
  };
  function partOf(ms) {
    const h = new Date(ms + SGT_OFFSET_MS).getUTCHours();
    return Object.keys(PARTS).find((k) => h >= PARTS[k].from && h < PARTS[k].to);
  }
  const inPart = (part) => (e) => !PARTS[part] || partOf(e.start) === part;

  // A Mass for your Sunday obligation: any Sunday Mass, or Saturday evening's (the earliest in Singapore start at 4pm).
  // Holy days of obligation are not modelled.
  const SUNDAY_EVE_MIN = 16 * 60;
  function forSunday(e) {
    const d = new Date(e.start + SGT_OFFSET_MS), wd = d.getUTCDay();
    return wd === 0 || (wd === 6 && d.getUTCHours() * 60 + d.getUTCMinutes() >= SUNDAY_EVE_MIN);
  }
  // a Saturday Mass from 4pm: a Sunset Mass, which counts for Sunday
  const isSunset = (ms) => { const d = new Date(ms + SGT_OFFSET_MS); return d.getUTCDay() === 6 && d.getUTCHours() * 60 + d.getUTCMinutes() >= SUNDAY_EVE_MIN; };
  // myCatholicSG spells a few languages two ways ("English.", "Mandarin (中文)")
  const langName = (l) => String(l || "English").replace(/\s*\(.*\)$/, "").replace(/\.$/, "").trim();
  const inLang = (lang) => (e) => !lang || langName(e.lang).toLowerCase() === String(lang).toLowerCase();

  const api = { expandParish, expandAll, toInstant, sgtDay, ruleOn, specialDay, easterUTC, SGT_OFFSET_MS, PARTS, partOf, inPart, forSunday, isSunset, langName, inLang };
  if (typeof module !== "undefined") module.exports = api;
  else root.MassSchedule = api;
})(this);
