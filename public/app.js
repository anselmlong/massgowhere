(function () {
  const S = window.MassSchedule;
  const R = window.MassRank;
  const view = document.getElementById("view");
  const TZ = { timeZone: "Asia/Singapore" };
  const MODES = [
    { id: "transit", label: "Bus & MRT", word: "bus & MRT", phrase: "by bus & MRT", gmaps: "transit", icon: '<path d="M7 16.5V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v10.5M7 12h10M9 20l-1.5 1.5M15 20l1.5 1.5"/><rect x="7" y="3" width="10" height="16" rx="3"/><circle cx="9.5" cy="15.5" r=".8" fill="currentColor"/><circle cx="14.5" cy="15.5" r=".8" fill="currentColor"/>' },
    { id: "drive", label: "Car", word: "car", phrase: "by car", gmaps: "driving", icon: '<path d="M5 17h14M5 17v2M19 17v2M4 13l1.6-5A2 2 0 0 1 7.5 6.6h9a2 2 0 0 1 1.9 1.4L20 13v4H4z"/><circle cx="8" cy="14" r=".8" fill="currentColor"/><circle cx="16" cy="14" r=".8" fill="currentColor"/>' },
    { id: "walk", label: "Walk", word: "walking", phrase: "on foot", gmaps: "walking", icon: '<circle cx="13" cy="4.5" r="1.8"/><path d="M9 21l2.5-6.5L14 16v5M11.5 14.5L12.5 9l-3 1.5L8 13.5M12.5 9l2 3.5 3 1"/>' },
  ];
  const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[0];
  // in bus & MRT mode a church close by is quicker on foot; the answer then says so and Navigate walks you there
  const tripMode = (e, mode) => (e && e.walk ? modeOf("walk") : mode);
  const svg = (paths, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    locate: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    nav: '<path d="M4 11.5 20 4l-7.5 16-2-6.5z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    recent: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l2.5 1.5"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
  };

  // ---------- storage (optional) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ---------- liturgical season -> accent ----------
  const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
  function season(ms) {
    const dayDate = S.sgtDay(ms), day = dayDate.getTime(), y = dayDate.getUTCFullYear(), D = 864e5, W = 7 * D;
    const isSun = dayDate.getUTCDay() === 0;
    const sunOnOrBefore = day - dayDate.getUTCDay() * D;
    const label = (n, of) => `${ord(n)} ${isSun ? "Sunday" : "Week"} ${of}`;
    const E = S.easterUTC(y);
    const xmas = Date.UTC(y, 11, 25);
    const advent = xmas - ((new Date(xmas).getUTCDay() || 7) + 21) * D; // 1st Sunday of Advent
    const christKing = advent - W;
    // Singapore keeps Epiphany on the Sunday between 2 and 8 Jan; Baptism of the Lord is the next Sunday,
    // or the Monday after when Epiphany falls on 7 or 8 Jan
    const jan2 = Date.UTC(y, 0, 2);
    const epiphany = jan2 + ((7 - new Date(jan2).getUTCDay()) % 7) * D;
    const baptism = new Date(epiphany).getUTCDate() >= 7 ? epiphany + D : epiphany + W;
    const ash = E - 46 * D, pentecost = E + 49 * D;
    if (day <= baptism) return { kind: "christmas", name: day === baptism ? "Baptism of the Lord" : "Christmas season", accent: "gold" };
    if (day === E - 7 * D) return { kind: "holyweek", name: "Palm Sunday", accent: "red" };
    if (day === E - 2 * D) return { kind: "holyweek", name: "Good Friday", accent: "red" };
    if (day > E - 7 * D && day < E) return { kind: "holyweek", name: "Holy Week", accent: "violet" };
    if (day >= ash && day < E - 7 * D) {
      if (day < ash + 4 * D) return { kind: "lent", name: day === ash ? "Ash Wednesday" : "After Ash Wednesday", accent: "violet" };
      return { kind: "lent", name: label(Math.floor((sunOnOrBefore - (ash + 4 * D)) / W) + 1, "of Lent"), accent: "violet" };
    }
    if (day >= E && day < pentecost) return { kind: "easter", name: day === E ? "Easter Sunday" : label(Math.floor((sunOnOrBefore - E) / W) + 1, "of Easter"), accent: "gold" };
    if (day === pentecost) return { kind: "pentecost", name: "Pentecost Sunday", accent: "red" };
    if (day >= advent && day < xmas) return { kind: "advent", name: label(Math.floor((sunOnOrBefore - advent) / W) + 1, "of Advent"), accent: "violet" };
    if (day >= xmas) return { kind: "christmas", name: day === xmas ? "Christmas Day" : "Christmas season", accent: "gold" };
    // Ordinary Time: part 1 counts up from the Baptism of the Lord; part 2 counts back from Christ the King (34th)
    // week 1 is the week of the Baptism; the Sunday after it is always the 2nd Sunday (Baptism may be a Monday)
    const otBase = baptism - (new Date(baptism).getUTCDay() * D);
    const n = day < ash ? Math.floor((sunOnOrBefore - otBase) / W) + 1 : 34 - Math.round((christKing - sunOnOrBefore) / W);
    return { kind: "ordinary", name: label(n, "in Ordinary Time"), accent: "green" };
  }
  // closing line on an answer, in the voice of the season
  const BLESSING = {
    ordinary: "Go in peace!", advent: "Come, Lord Jesus.", christmas: "Glory to God in the highest.",
    lent: "Return to the Lord with all your heart.", holyweek: "We adore you, O Christ, and we bless you.",
    easter: "Alleluia, He is risen.", pentecost: "Come, Holy Spirit.",
  };
  const blessing = (ms) => BLESSING[season(ms).kind] || BLESSING.ordinary;
  const PALETTES = [
    { id: "season", label: "Seasonal" }, { id: "green", label: "Green" }, { id: "blue", label: "Marian blue" },
    { id: "violet", label: "Violet" }, { id: "red", label: "Red" },
  ];
  function applyPalette() {
    const qp = new URLSearchParams(location.search).get("palette");
    if (qp) store.set("mgw-palette", qp);
    const choice = store.get("mgw-palette") || "season";
    const s = season(Date.now());
    document.documentElement.dataset.accent = choice === "season" ? s.accent : choice;
    const el = document.getElementById("season");
    el.querySelector("span").textContent = s.name;
    el.hidden = choice !== "season";
    return choice;
  }
  function paletteMenu() {
    const params = new URLSearchParams(location.search);
    if (params.has("preview")) store.set("mgw-preview", true);
    if (!store.get("mgw-preview")) return;
    const box = document.getElementById("palette-picker");
    const draw = () => {
      const cur = applyPalette();
      box.innerHTML = PALETTES.map((p) => {
        const acc = p.id === "season" ? season(Date.now()).accent : p.id;
        return `<button type="button" data-p="${p.id}" aria-pressed="${cur === p.id}"><i style="background:var(--accent)" data-accent="${acc}"></i>${p.label}</button>`;
      }).join("");
      box.querySelectorAll("i").forEach((i) => { i.style.background = getComputedStyle(document.documentElement).getPropertyValue("--accent"); });
      // show each chip in its own colour
      box.querySelectorAll("button").forEach((b) => {
        const probe = document.createElement("span");
        probe.dataset.accent = b.querySelector("i").dataset.accent;
        probe.style.display = "none";
        document.body.appendChild(probe);
        b.querySelector("i").style.background = getComputedStyle(probe).getPropertyValue("--accent");
        probe.remove();
      });
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]");
      if (!b) return;
      store.set("mgw-palette", b.dataset.p);
      draw();
    });
    box.hidden = false;
    draw();
  }

  // ---------- formatting ----------
  const clock = (ms) => new Date(ms).toLocaleTimeString("en-SG", { ...TZ, hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  function clockParts(ms) {
    const s = clock(ms);
    const m = s.match(/^(.*?)(am|pm)$/);
    return m ? { hm: m[1], ap: m[2] } : { hm: s, ap: "" };
  }
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (v) => { const d = S.sgtDay(new Date(v).getTime()); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", TZ);
  function dayLabel(ms) {
    const now = Date.now();
    if (dayKey(ms) === dayKey(now)) return "Today";
    if (dayKey(ms) === dayKey(now + 864e5)) return "Tomorrow";
    return new Date(ms).toLocaleDateString("en-SG", { ...TZ, weekday: "long", day: "numeric", month: "short" });
  }
  function until(ms) {
    const m = Math.round((ms - Date.now()) / 60000);
    if (m <= 1) return "starting now";
    if (m < 60) return `in ${m} minutes`;
    const h = Math.round(m / 60);
    return h < 24 ? `in about ${h} hour${h === 1 ? "" : "s"}` : dayLabel(ms);
  }
  const mins = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim());
  // ---------- leave-at planning: 15-minute steps, up to a week ahead ----------
  const Q = 15 * 60000, DAY = 864e5, ROW = 44;
  const sgMidnight = (ms) => S.sgtDay(ms).getTime() - S.SGT_OFFSET_MS;
  const nextQuarter = (ms) => Math.ceil((ms + 60000) / Q) * Q;
  const maxAt = () => sgMidnight(Date.now()) + 7 * DAY - Q;
  const wk = (ms, weekday = "short") => new Date(ms).toLocaleDateString("en-SG", { ...TZ, weekday });
  const dnum = (ms) => new Date(ms).toLocaleDateString("en-SG", { ...TZ, day: "numeric", month: "short" });
  // "5:30pm", "tomorrow 7:00am", "Sun 7:30am"
  function whenText(at) {
    if (at == null) return "now";
    const d = dayLabel(at);
    return `${d === "Today" ? "" : d === "Tomorrow" ? "tomorrow " : `${wk(at)} `}${clock(at)}`;
  }
  const parseAt = (v) => { const n = Number(v); return v && Number.isFinite(n) && n > Date.now() ? Math.min(n, maxAt()) : null; };
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmaps = (p, mode, origin) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, Singapore ${p.postal || ""}`.trim())}` +
    `&travelmode=${modeOf(mode).gmaps}${origin ? `&origin=${origin.lat},${origin.lng}` : ""}`;

  // ---------- data ----------
  let dataP = null;
  const data = () => (dataP ||= fetch("data.json", { cache: "no-cache", signal: AbortSignal.timeout(8000) })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch((e) => { dataP = null; throw e; }));

  // ---------- router ----------
  let currentMap = null;
  function route() {
    if (currentMap) { currentMap.remove(); currentMap = null; }
    const [path, qs] = location.hash.replace(/^#/, "").split("?");
    const q = new URLSearchParams(qs || "");
    window.scrollTo(0, 0);
    if (path.startsWith("/next")) return renderNext(q);
    if (path.startsWith("/church/")) return renderChurch(Number(path.split("/")[2]), q);
    if (path.startsWith("/churches")) return renderChurches(q);
    return renderHome();
  }
  const go = (hash) => { location.hash = hash; };
  window.addEventListener("hashchange", route);

  // ---------- bottom sheets (place, time, travel) ----------
  const sheetRoot = document.createElement("div");
  sheetRoot.className = "sheet-root";
  sheetRoot.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"></div>`;
  document.body.appendChild(sheetRoot);
  const sheet = sheetRoot.querySelector(".sheet");
  let sheetOpener = null;
  function openSheet(title, body, focusSel) {
    sheetOpener = document.activeElement;
    sheet.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2>
      <button class="sheet-close" type="button" data-close aria-label="Close">${svg(ICON.x)}</button></div><div class="sheet-body">${body}</div>`;
    sheetRoot.classList.add("open");
    document.documentElement.classList.add("sheet-lock");
    setTimeout(() => sheet.querySelector(focusSel || "button")?.focus({ preventScroll: true }), 40);
  }
  function closeSheet() {
    if (!sheetRoot.classList.contains("open")) return;
    sheetRoot.classList.remove("open");
    document.documentElement.classList.remove("sheet-lock");
    if (sheetOpener && sheetOpener.isConnected) sheetOpener.focus({ preventScroll: true });
  }
  sheetRoot.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  // drag the handle or title down to dismiss, like a native sheet
  let drag = null;
  sheet.addEventListener("touchstart", (e) => {
    if (!e.target.closest(".grab, .sheet-head") || e.target.closest("button")) return;
    drag = { y: e.touches[0].clientY, dy: 0 };
    sheet.style.transition = "none";
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    sheet.style.translate = `-50% ${drag.dy}px`;
  }, { passive: true });
  sheet.addEventListener("touchend", () => {
    if (!drag) return;
    const far = drag.dy > 90;
    drag = null;
    sheet.style.transition = sheet.style.translate = "";
    if (far) closeSheet();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("hashchange", closeSheet);

  function openModeSheet(current, pick) {
    const sub = { transit: "Trains and buses", drive: "Driving or a ride", walk: "On foot" };
    openSheet("How are you travelling?", `<div class="opts">${MODES.map((m) => `
      <button class="opt" type="button" data-mode="${m.id}" aria-pressed="${m.id === current}">${svg(m.icon)}<span>${m.label}<small>${sub[m.id]}</small></span></button>`).join("")}</div>`, "[aria-pressed='true']");
    sheet.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { closeSheet(); pick(b.dataset.mode); }));
  }

  // places people searched before, newest first (not raw GPS, which is stale by now)
  const recentPlaces = () => (store.get("mgw-recent") || []).filter((r) => Date.now() - (r.at || 0) < 60 * DAY).slice(0, 4);
  function rememberPlace(p) {
    if (!p.label || p.label === "your location") return;
    store.set("mgw-recent", [{ ...p, at: Date.now() }, ...(store.get("mgw-recent") || []).filter((r) => r.label !== p.label)].slice(0, 6));
  }
  const placeTitle = (x) => (x.BUILDING && x.BUILDING !== "NIL" ? x.BUILDING : x.SEARCHVAL)
    .replace(/\b\w+/g, (w) => (/^(MRT|LRT|NUS|NTU|SMU|CBD|HDB)$/.test(w) || /^[A-Z]{1,3}\d+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()));

  function openPlaceSheet(pick) {
    const recent = recentPlaces();
    openSheet("Leaving from", `
      <div class="search">${svg(ICON.search)}<input id="place-q" type="search" inputmode="search" autocomplete="off" placeholder="Postal code or place" aria-label="Postal code or place" aria-controls="place-res">
        <button class="clear" type="button" aria-label="Clear search" hidden>${svg(ICON.x)}</button></div>
      <div id="place-res" class="opts"></div>`, "#place-q");
    const input = sheet.querySelector("#place-q"), res = sheet.querySelector("#place-res");
    const home = () => {
      res.innerHTML = `<button class="opt" type="button" data-here>${svg(ICON.locate)}<span>Use my location<small>Where you are when you tap Find</small></span></button>
        ${recent.length ? `<p class="label">Recent</p><div class="recent">${recent.map((r, i) => `<button type="button" data-recent="${i}">${svg(ICON.recent)}${esc(r.label)}</button>`).join("")}</div>` : ""}`;
    };
    home();
    res.addEventListener("click", (e) => {
      if (e.target.closest("[data-here]")) { closeSheet(); return pick(null); }
      const r = e.target.closest("[data-recent]");
      if (r) { closeSheet(); return pick(recent[Number(r.dataset.recent)]); }
      const f = e.target.closest("[data-found]");
      if (f) { closeSheet(); return pick(JSON.parse(f.dataset.found)); }
    });
    clearable(input, home);
    let timer, seq = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const v = input.value.trim();
      if (v.length < 2) return home();
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const r = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(v)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`);
          const j = await r.json();
          if (my !== seq) return;
          const hits = (j.results || []).slice(0, 5);
          res.innerHTML = hits.length
            ? hits.map((x) => `<button class="opt" type="button" data-found="${esc(JSON.stringify({ lat: Number(Number(x.LATITUDE).toFixed(5)), lng: Number(Number(x.LONGITUDE).toFixed(5)), label: placeTitle(x) }))}">${svg(ICON.pin)}<span>${esc(placeTitle(x))}<small>${esc(x.ADDRESS)}</small></span></button>`).join("")
            : `<p class="muted">No match for “${esc(v)}”. Try a postal code, MRT station or street.</p>`;
        } catch { res.innerHTML = `<p class="muted">Search is unavailable right now. Use your location instead.</p>`; }
      }, 250);
    });
  }

  // one column of an alarm-clock picker: scroll-snap does the physics, we read where it came to rest
  function wheel(el, labels, index, onSettle) {
    el.innerHTML = labels.map((l, i) => `<div class="it" data-i="${i}">${l}</div>`).join("");
    el.tabIndex = 0;
    el.setAttribute("role", "spinbutton");
    el.setAttribute("aria-valuemin", 0);
    el.setAttribute("aria-valuemax", labels.length - 1);
    const items = [...el.children];
    let cur = index, timer;
    const paint = () => {
      if (reduceMotion()) return;
      const mid = el.scrollTop / ROW;
      items.forEach((it, i) => { const d = Math.max(-3, Math.min(3, i - mid)); it.style.transform = `rotateX(${d * -20}deg) scale(${1 - Math.abs(d) * 0.04})`; });
    };
    const born = Date.now();
    const read = () => {
      const was = cur;
      cur = Math.max(0, Math.min(labels.length - 1, Math.round(el.scrollTop / ROW)));
      // a faint tick per row, like a real picker (Android; iOS Safari has no vibration)
      if (cur !== was && Date.now() - born > 300 && navigator.vibrate) navigator.vibrate(4);
      items.forEach((it, i) => it.classList.toggle("sel", i === cur));
      el.setAttribute("aria-valuenow", cur);
      el.setAttribute("aria-valuetext", labels[cur]);
    };
    const set = (i, smooth) => el.scrollTo({ top: i * ROW, behavior: smooth && !reduceMotion() ? "smooth" : "auto" });
    el.addEventListener("scroll", () => { paint(); read(); clearTimeout(timer); timer = setTimeout(onSettle, 140); }, { passive: true });
    el.addEventListener("click", (e) => { const it = e.target.closest(".it"); if (it) set(Number(it.dataset.i), true); });
    el.addEventListener("keydown", (e) => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      set(Math.max(0, Math.min(labels.length - 1, cur + step)), true);
    });
    el.scrollTop = index * ROW;
    read(); paint();
    return { get: () => cur, set };
  }

  function openTimeSheet(current, pick) {
    const now = Date.now(), today = sgMidnight(now);
    const days = Array.from({ length: 7 }, (_, i) => today + i * DAY);
    // shortcuts for the times people plan around: after work, Saturday vigil, Sunday morning
    const sat = days.find((d) => wk(d) === "Sat"), sun = days.find((d) => wk(d) === "Sun");
    const quick = [
      now + 30 * 60000 < today + 22 * 3600e3 ? { t: nextQuarter(now + 29 * 60000), l: "In 30 min" } : null,
      today + 18 * 3600e3 > now + Q ? { t: today + 18 * 3600e3, l: "Tonight 6pm" } : null,
      sat && sat + 16.5 * 3600e3 > now ? { t: sat + 16.5 * 3600e3, l: `${sat === today ? "Today" : "Sat"} 4:30pm` } : null,
      sun && sun + 7.5 * 3600e3 > now ? { t: sun + 7.5 * 3600e3, l: `${sun === today ? "Today" : "Sun"} 7:30am` } : null,
    ].filter(Boolean);
    openSheet("Leave at", `
      <div class="quick"><button class="q now" type="button" data-at="">Leave now</button>${quick.map((x) => `<button class="q" type="button" data-at="${x.t}">${x.l}</button>`).join("")}</div>
      <div class="wheels">
        <div class="wheel day" aria-label="Day"></div><div class="wheel" aria-label="Hour"></div><div class="wheel" aria-label="Minute"></div><div class="wheel" aria-label="AM or PM"></div>
      </div>
      <button class="btn btn-primary set" type="button"></button>`, ".wheel");
    const els = sheet.querySelectorAll(".wheel"), setBtn = sheet.querySelector(".set");
    const split = (ms) => {
      const h24 = Number(new Date(ms).toLocaleTimeString("en-GB", { ...TZ, hour: "2-digit", hour12: false }));
      return [Math.round((sgMidnight(ms) - today) / DAY), (h24 + 11) % 12, new Date(ms).getUTCMinutes() / 15, h24 >= 12 ? 1 : 0];
    };
    const compose = () => days[W[0].get()] + (((W[1].get() + 1) % 12) + W[3].get() * 12) * 3600e3 + W[2].get() * Q;
    // a time that has already passed springs forward to the next quarter hour
    const settle = () => {
      let at = compose();
      const min = nextQuarter(Date.now());
      if (at < min) { at = min; split(at).forEach((v, k) => W[k].set(v, true)); }
      const d = dayLabel(at);
      setBtn.dataset.at = at;
      setBtn.innerHTML = `${svg(ICON.clock)}<span>Leave ${d === "Today" ? "today" : d === "Tomorrow" ? "tomorrow" : wk(at, "long")} at ${clock(at)}</span>`;
    };
    const init = split(current ?? nextQuarter(now));
    const W = [
      wheel(els[0], days.map((d, i) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${wk(d)} ${dnum(d)}`)), init[0], settle),
      wheel(els[1], Array.from({ length: 12 }, (_, i) => String(i + 1)), init[1], settle),
      wheel(els[2], ["00", "15", "30", "45"], init[2], settle),
      wheel(els[3], ["am", "pm"], init[3], settle),
    ];
    settle();
    sheet.querySelectorAll("[data-at]").forEach((b) => b.addEventListener("click", () => { closeSheet(); pick(b.dataset.at ? Number(b.dataset.at) : null); }));
  }

  // ---------- home ----------
  // the plan being written on the home screen; kept while you look at answers, reset on reload
  const plan = { place: null, at: null };
  function renderHome() {
    const mode = store.get("mgw-mode") || "transit";
    if (plan.at != null && plan.at <= Date.now()) plan.at = null;
    const here = !plan.place && plan.at == null;
    view.innerHTML = `
      <section class="home">
        <h1>Find a Mass you can attend.</h1>
        <p class="sentence">I’m leaving from
          <button class="tok" type="button" id="t-place" aria-label="Leaving from: ${esc(plan.place ? plan.place.label : "my location")}. Change"><span>${esc(plan.place ? plan.place.label : "my location")}</span>${svg(ICON.chev)}</button><br>at
          <button class="tok" type="button" id="t-time" aria-label="Leaving at: ${esc(whenText(plan.at))}. Change"><span>${esc(whenText(plan.at))}</span>${svg(ICON.chev)}</button> by
          <button class="tok" type="button" id="t-mode" aria-label="Travelling by: ${esc(modeOf(mode).label)}. Change"><span>${esc(modeOf(mode).word)}</span>${svg(ICON.chev)}</button></p>
        <p class="hint">Tap an underlined word to change it.</p>
        <div class="actions">
          <button class="btn btn-primary" id="find" type="button">${svg(here ? ICON.locate : ICON.search)}<span>${here ? "Find a Mass near me" : "Find a Mass"}</span></button>
          <p class="msg" id="msg" role="status" hidden></p>
          <a class="btn btn-quiet browse" href="#/churches">${svg(ICON.map)}<span>Browse all churches on a map</span></a>
        </div>
      </section>`;
    // the word you just changed glows for a moment, so the sentence visibly answers back
    const changed = (id) => { renderHome(); const t = view.querySelector(id); t.focus({ preventScroll: true }); t.classList.add("just"); };
    view.querySelector("#t-place").addEventListener("click", () => openPlaceSheet((p) => { plan.place = p; changed("#t-place"); }));
    view.querySelector("#t-time").addEventListener("click", () => openTimeSheet(plan.at, (at) => { plan.at = at; changed("#t-time"); }));
    view.querySelector("#t-mode").addEventListener("click", () => openModeSheet(mode, (m) => { store.set("mgw-mode", m); changed("#t-mode"); }));
    const msg = view.querySelector("#msg");
    const say = (t) => { msg.textContent = t; msg.hidden = false; };
    const btn = view.querySelector("#find");
    const at = () => (plan.at != null && plan.at > Date.now() ? `&at=${plan.at}` : "");
    btn.addEventListener("click", () => {
      if (plan.place) return go(`/next?lat=${plan.place.lat}&lng=${plan.place.lng}&mode=${mode}&from=${encodeURIComponent(plan.place.label)}${at()}`);
      if (!navigator.geolocation) return say("Your browser can’t share location. Tap “my location” to search for a place instead.");
      btn.setAttribute("aria-busy", "true");
      btn.querySelector("span").textContent = "Finding you…";
      navigator.geolocation.getCurrentPosition(
        (pos) => go(`/next?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&mode=${mode}&from=${encodeURIComponent("your location")}${at()}`),
        (err) => {
          btn.removeAttribute("aria-busy");
          btn.querySelector("span").textContent = here ? "Find a Mass near me" : "Find a Mass";
          say(err.code === 1 ? "Location is blocked for this site. Allow it in your browser settings, or tap “my location” to search for a place." : "Couldn’t get your location just now. Tap “my location” to search for a place instead.");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  function clearable(input, onClear) {
    const btn = input.parentElement.querySelector(".clear");
    const sync = () => { btn.hidden = !input.value; };
    input.addEventListener("input", sync);
    btn.addEventListener("click", () => { input.value = ""; sync(); onClear && onClear(); input.dispatchEvent(new Event("input")); input.focus(); });
  }

  // ---------- result ----------
  async function fetchNext(q, fast = false) {
    const params = new URLSearchParams({ lat: q.get("lat"), lng: q.get("lng"), mode: q.get("mode") || "transit" });
    const at = parseAt(q.get("at"));
    if (at) params.set("at", at);
    if (fast) params.set("fast", "1");
    try {
      const r = await fetch(`api/next?${params}`, { cache: "no-store", signal: AbortSignal.timeout(fast ? 4000 : 12000) });
      if (r.status === 400) return { outside: true };
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      // offline or API down: same ranking in the browser, travel times estimated
      const d = await data();
      const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
      const now = at ?? Date.now();
      const out = await R.rank({ origin, now, mode: params.get("mode"), parishes: d.parishes, events: S.expandAll(d, now, 2) });
      const byId = new Map(d.parishes.map((p) => [p.id, p]));
      const pack = (e) => e && { parish: byId.get(e.pid), start: e.start, leaveBy: e.leaveBy, travelMin: e.travelMin, travelSource: e.travelSource, walk: e.travelWalk, distanceKm: e.distanceKm, language: e.lang, location: e.loc, note: e.note };
      return { mode: params.get("mode"), best: pack(out.best), alternatives: out.alternatives.map(pack),
        nearest: out.nearest && { parish: byId.get(out.nearest.pid), travelMin: out.nearest.travelMin, travelSource: out.nearest.travelSource, walk: out.nearest.travelWalk, next: pack(out.nearest.next) } };
    }
  }

  async function renderNext(q) {
    const mode = modeOf(q.get("mode"));
    const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
    const from = q.get("from") || "your location";
    const at = parseAt(q.get("at"));
    const myHash = location.hash;
    const stale = () => location.hash !== myHash;
    store.set("mgw-origin", { ...origin, label: from, at: Date.now() });
    rememberPlace({ ...origin, label: from });
    // only the leave time changes here; where from and how are set on the home screen
    const bar = `<div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button>
        <span class="from">From ${esc(from)} · ${mode.label}</span></div>
      <div class="when${at ? " set" : ""}"><button class="nudge" type="button" data-nudge="-1" aria-label="Leave 15 minutes earlier" ${at ? "" : "disabled"}>${svg(ICON.left)}</button>
        <button class="when-chip" type="button" id="when" aria-label="Leaving ${esc(whenText(at))}. Change the time">${svg(ICON.clock)}<span>${at ? `Leaving ${esc(whenText(at))}` : "Leaving now"}</span></button>
        <button class="nudge" type="button" data-nudge="1" aria-label="Leave 15 minutes later">${svg(ICON.right)}</button></div>`;
    // a time change keeps the answer on screen, dimmed, until the new one arrives
    const soft = softNext && view.querySelector(".answer");
    softNext = false;
    if (soft) {
      view.querySelector(".bar").remove();
      view.querySelector(".when")?.remove();
      view.insertAdjacentHTML("afterbegin", bar);
      if (nudgeDir) view.querySelector("#when span").classList.add(nudgeDir > 0 ? "from-right" : "from-left");
      nudgeDir = 0;
      view.querySelectorAll(".answer, .more").forEach((el) => el.classList.add("busy"));
    } else view.innerHTML = `${bar}<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p id="step">Looking at Mass times at 32 parishes…</p></div>`;
    const stepTimer = setTimeout(() => { const el = document.getElementById("step"); if (el) el.textContent = `Checking ${mode.id === "transit" ? "bus & MRT routes" : mode.id === "drive" ? "driving routes" : "walking routes"} from ${from}…`;
    }, 900);
    if (soft) clearTimeout(stepTimer);
    // data.json only adds the source line and special-day notice; never block the answer on it
    const d = await Promise.race([data(), new Promise((_, no) => setTimeout(no, 4000))]).catch(() => ({ parishes: [], holidays: {} }));
    if (stale()) return;

    // Fast first frame: estimate-only answer in a few ms, then auto-refine with exact OneMap times.
    let painted = false;
    const paint = (res) => {
      if (stale()) return;
      if (res.outside) {
        view.innerHTML = `${bar}<section class="answer"><h1>That’s outside Singapore.</h1>
          <p class="lede">MassGoWhere covers Singapore’s 32 parishes. Search for a Singapore postal code or place instead.</p>
          <p style="margin-top:28px"><a class="btn btn-quiet" href="#/">Back to search</a></p></section>`;
        painted = true;
        return;
      }
      const b = res.best;
      if (!b) {
        view.innerHTML = `${bar}<section class="answer reveal"><h1>No Mass you can reach ${at ? `within two days of ${esc(whenText(at))}` : "in the next two days"}.</h1>
          <p class="lede">Try another time or way of travelling, or browse the churches and their times.</p>
          <p style="margin-top:28px"><a class="btn btn-quiet" href="#/churches">Browse all churches</a></p></section>`;
        painted = true;
        return;
      }
      const start = new Date(b.start).getTime(), leave = new Date(b.leaveBy).getTime();
      const t = clockParts(start);
      const p = b.parish;
      const est = b.travelSource === "estimate";
      const meta = [b.language !== "English" ? `${b.language} Mass` : "", b.note].filter(Boolean).join(" · ");
      const special = S.specialDay(start, d);
      const alt = (res.alternatives || []).filter(Boolean);
      const near = res.nearest && res.nearest.parish.id !== p.id ? res.nearest : null;
      view.innerHTML = `${bar}
        <section class="answer reveal">
          <p class="day">${dayLabel(start)}${at ? (dayKey(at) === dayKey(start) ? `, ${mins(Math.round((start - at) / 60000))} after you set off` : "") : start - Date.now() < 12 * 3600e3 ? `, ${until(start)}` : ""}</p>
          <p class="time">${t.hm}<small>${t.ap}</small></p>
          <h1 class="church">${esc(p.name)}</h1>
          ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
          <div class="leave${at ? " plan" : ""}" id="leave">${leaveHTML(b, at, mode)}</div>
          <a class="btn btn-primary" href="${gmaps(p, tripMode(b, mode).id, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          <div class="sub"><a class="link" href="#/church/${p.id}">Mass times at this church</a></div>
          ${est ? `<p class="est" style="text-align:center">Travel time is an estimate; checking live routes…</p>` : ""}
          ${special ? `<p class="notice">${esc(special)}: Mass times often change ${dayKey(start) === dayKey(Date.now()) ? "today" : "that day"}. Please check with the parish.</p>` : ""}
          ${alt.length || near ? `<button class="see-more" type="button" onclick="document.getElementById('more').scrollIntoView({ behavior: 'smooth' })">${svg(ICON.down)}<span>${alt.length ? "More churches you can make it to" : "See the nearest church"}</span></button>` : ""}
        </section>
        ${alt.length || near ? `<section class="more" id="more" aria-label="Other options">
          ${alt.length ? `<h2>Other churches you can make it to</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
          ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
            <a class="row" href="#/church/${near.parish.id}">${near.next ? `<span class="t">${clock(new Date(near.next.start).getTime())}<small>${dayLabel(new Date(near.next.start).getTime())}</small></span>` : `<span class="t">–</span>`}
            <span class="n">${esc(near.parish.name)}<small>${near.next ? `Leave by ${clock(new Date(near.next.leaveBy).getTime())}` : "No reachable Mass in the next two days"}</small></span><span class="d">${mins(near.travelMin)}${near.walk ? " walk" : ""}</span></a></li></ul>` : ""}
        </section>` : ""}
        <p class="browse-wrap"><a class="btn btn-quiet browse" href="#/churches">${svg(ICON.map)}<span>See all churches on a map</span></a></p>
        <p class="source">${sourceLine(d.parishes.find((x) => x.id === p.id))} Please confirm feast days with the parish.</p>
        <p class="blessing">${esc(blessing(start))}</p>`;
      rememberTrips(origin, mode.id, [b, ...alt, near && near.next && { ...near.next, parish: near.parish, travelMin: near.travelMin, travelSource: near.travelSource, walk: near.walk }]);
      view.focus({ preventScroll: true });
      if (at) clearInterval(leaveTimer); else tickLeave(start, leave, b.travelMin, est, tripMode(b, mode));
      // the "more churches" cue is only for when the list starts below the fold
      const moreEl = view.querySelector("section.more"), cue = view.querySelector(".see-more");
      if (moreEl && cue && moreEl.getBoundingClientRect().top < innerHeight - 80) cue.hidden = true;
      painted = true;
    };

    // 1) instant estimate frame
    try {
      paint(await fetchNext(q, true));
    } catch { /* offline; the refine attempt below may also fail -> error screen */ }
    clearTimeout(stepTimer);
    if (stale()) return;

    // 2) exact refine — swap in live OneMap times without repainting the hero answer
    const refine = (res) => {
      if (stale()) return;
      if (!res.best) return; // answer unchanged on "no Mass"; leave the frame as-is
      const b = res.best;
      // if real routing moved the best to a different church, repaint the whole view
      const heroName = view.querySelector(".answer .church");
      const same = heroName && heroName.textContent === b.parish.name;
      if (!same) return paint(res);
      const leave = new Date(b.leaveBy).getTime();
      const est = b.travelSource === "estimate";
      const leaveBox = document.getElementById("leave");
      if (leaveBox) leaveBox.innerHTML = leaveHTML(b, at, mode);
      // drop the "checking live routes…" note once we have exact numbers
      const estNote = view.querySelector(".answer .est");
      if (estNote && !est) estNote.remove();
      if (!at) tickLeave(new Date(b.start).getTime(), leave, b.travelMin, est, tripMode(b, mode));
      // re-render only the "other options" block with exact times (keeps the hero steady)
      const alt = (res.alternatives || []).filter(Boolean);
      const near = res.nearest && res.nearest.parish.id !== b.parish.id ? res.nearest : null;
      const more = view.querySelector("section.more");
      if (more) {
        more.innerHTML = `${alt.length ? `<h2>Other churches you can make it to</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
          ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
            <a class="row" href="#/church/${near.parish.id}">${near.next ? `<span class="t">${clock(new Date(near.next.start).getTime())}<small>${dayLabel(new Date(near.next.start).getTime())}</small></span>` : `<span class="t">–</span>`}
            <span class="n">${esc(near.parish.name)}<small>${near.next ? `Leave by ${clock(new Date(near.next.leaveBy).getTime())}` : "No reachable Mass in the next two days"}</small></span><span class="d">${mins(near.travelMin)}${near.walk ? " walk" : ""}</span></a></li></ul>` : ""}`;
      }
      rememberTrips(origin, mode.id, [b, ...alt, near && near.next && { ...near.next, parish: near.parish, travelMin: near.travelMin, travelSource: near.travelSource, walk: near.walk }]);
    };
    try {
      const full = await fetchNext(q, false);
      if (!stale()) refine(full);
    } catch { /* keep the estimate frame on network failure */ }
    // never leave the answer dimmed and unclickable, whichever frames arrived
    view.querySelectorAll(".busy").forEach((el) => el.classList.remove("busy"));
    if (!painted) {
      view.innerHTML = `${bar}<section class="answer"><h1>We couldn’t check Mass times just now.</h1>
        <p class="lede">Check your connection and try again.</p>
        <p style="margin-top:28px"><button class="btn btn-primary" type="button" onclick="window.dispatchEvent(new HashChangeEvent('hashchange'))">Try again</button></p></section>`;
    }
  }
  // "Leave by" when you're going now; "Leave at" (with arrival and the latest you could go) when planning
  function leaveHTML(b, at, mode) {
    mode = tripMode(b, mode);
    const about = b.travelSource === "estimate" ? "about " : "";
    const leave = new Date(b.leaveBy).getTime();
    if (!at) return `<strong>${leave - Date.now() < 2 * 60000 ? "Leave now" : `Leave by ${clock(leave)}`}</strong><span>${about}${mins(b.travelMin)} ${mode.phrase}</span>`;
    return `<strong>Leave at ${clock(at)}</strong><span>Arrive ${about}${clock(at + b.travelMin * 60000)} · ${mins(b.travelMin)} ${mode.phrase}</span>` +
      (leave - at >= 5 * 60000 ? `<span>You could leave as late as <em>${clock(leave)}</em></span>` : "");
  }
  // changing the leave time on the answer screen rewrites the link in place (no history entry per tap) and re-ranks
  let softNext = false, nudgeDir = 0;
  function setLeaveAt(at) {
    const [path, qs] = location.hash.replace(/^#/, "").split("?");
    const q = new URLSearchParams(qs || "");
    if (at) q.set("at", at); else q.delete("at");
    history.replaceState(null, "", `#${path}?${q}`);
    softNext = true;
    route();
  }
  view.addEventListener("click", (e) => {
    if (!location.hash.startsWith("#/next")) return;
    const cur = parseAt(new URLSearchParams(location.hash.split("?")[1] || "").get("at"));
    const n = e.target.closest("[data-nudge]");
    if (n) {
      const t = (cur ?? nextQuarter(Date.now()) - Q) + Number(n.dataset.nudge) * Q;
      nudgeDir = Number(n.dataset.nudge);
      return setLeaveAt(t <= Date.now() ? null : Math.min(t, maxAt()));
    }
    if (e.target.closest("#when")) openTimeSheet(cur, setLeaveAt);
  });
  // the leave-by line counts down while the page is open; at zero it says so and the Navigate button draws the eye
  let leaveTimer = null;
  function tickLeave(start, leave, travelMin, est, mode) {
    clearInterval(leaveTimer);
    const draw = () => {
      const box = document.getElementById("leave");
      if (!box) return clearInterval(leaveTimer);
      const m = Math.ceil((leave - Date.now()) / 60000);
      const trip = `${est ? "about " : ""}${mins(travelMin)} ${mode.phrase}`;
      if (Date.now() > leave + 5 * 60000 || Date.now() >= start) {
        clearInterval(leaveTimer);
        box.innerHTML = `<strong>You may have missed this one</strong><span><button class="link" type="button" onclick="window.dispatchEvent(new HashChangeEvent('hashchange'))">Find the next Mass</button></span>`;
        document.querySelector(".answer .btn-primary")?.classList.remove("go-now");
      } else if (m <= 0) {
        box.innerHTML = `<strong>Time to leave</strong><span>${trip}</span>`;
        document.querySelector(".answer .btn-primary")?.classList.add("go-now");
      } else if (m <= 60) {
        box.innerHTML = `<strong>Leave by ${clock(leave)}</strong><span>in ${mins(m)} · ${trip}</span>`;
      }
    };
    draw();
    leaveTimer = setInterval(draw, 30000);
  }

  // trips routed for the answer screen, so the church page shows the same numbers (principle: same answer everywhere)
  function rememberTrips(origin, mode, list) {
    const trips = {};
    for (const e of list) if (e && e.parish) trips[e.parish.id] = { minutes: e.travelMin, source: e.travelSource, walk: !!e.walk };
    store.set("mgw-trips", { key: `${origin.lat},${origin.lng},${mode}`, at: Date.now(), trips });
  }
  function tripTo(p, origin, mode) {
    const t = store.get("mgw-trips");
    if (t && t.key === `${origin.lat},${origin.lng},${mode}` && Date.now() - t.at < 30 * 60000 && t.trips[p.id]) return t.trips[p.id];
    const km = R.haversineKm(origin, p);
    return { minutes: R.estimateMinutes(km, mode), source: "estimate", walk: R.walksFaster(km, mode) };
  }
  function sourceLine(p) {
    if (!p) return "";
    const src = p.source || {}, sc = p.siteCheck;
    const mc = `<a href="${esc(src.url || "#")}" target="_blank" rel="noopener">myCatholicSG</a>`;
    if (sc && sc.agrees) return `Times from ${mc}, confirmed on the <a href="${esc(sc.url)}" target="_blank" rel="noopener">parish website</a> ${fmtDate(sc.checkedAt)}.`;
    if (sc) return `Times from ${mc} (updated ${fmtDate(src.fetchedAt)}). The <a href="${esc(sc.url)}" target="_blank" rel="noopener">parish website</a> lists some different times; check it before you go.`;
    return `Times from ${mc}, updated ${fmtDate(src.fetchedAt)}.`;
  }

  function row(a, mode) {
    const s = new Date(a.start).getTime();
    return `<li><a class="row" href="#/church/${a.parish.id}">
      <span class="t">${clock(s)}<small>${dayLabel(s)}</small></span>
      <span class="n">${esc(a.parish.name)}${a.language !== "English" ? `<span class="tag">${esc(a.language)}</span>` : ""}<small>Leave by ${clock(new Date(a.leaveBy).getTime())}</small></span>
      <span class="d">${mins(a.travelMin)}${a.walk ? " walk" : ""}</span></a></li>`;
  }

  // ---------- church ----------
  async function loadData() {
    const h = location.hash;
    try {
      const d = await data();
      return location.hash === h ? d : null;
    } catch {
      if (location.hash === h) view.innerHTML = `<section class="answer"><h1>We couldn’t load the church list.</h1>
        <p class="lede">Check your connection and try again.</p>
        <p style="margin-top:28px"><button class="btn btn-primary" type="button" onclick="window.dispatchEvent(new HashChangeEvent('hashchange'))">Try again</button></p></section>`;
      return null;
    }
  }

  async function renderChurch(id) {
    const d = await loadData();
    if (!d) return;
    const p = d.parishes.find((x) => x.id === id);
    if (!p) return go("/churches");
    const origin = store.get("mgw-origin");
    const mode = store.get("mgw-mode") || "transit";
    const now = Date.now();
    const evs = S.expandParish(String(id), d, now, 7);
    const days = new Map();
    for (const e of evs) {
      const k = dayLabel(e.start);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(e);
    }
    // the next Mass you can still make here, if we know where you are (estimated trip)
    let lead = "";
    if (origin) {
      const t = tripTo(p, origin, mode), about = t.source === "estimate" ? "about " : "";
      const n = evs.find((e) => e.start - (t.minutes + R.BUFFER_MIN) * 60000 >= now);
      if (n) lead = `<div class="next-here"><strong>Next Mass you can attend: ${clock(n.start)} ${dayLabel(n.start).toLowerCase()}</strong>
        <span>Leave by ${about}${clock(n.start - (t.minutes + R.BUFFER_MIN) * 60000)} · ${about}${mins(t.minutes)} ${tripMode(t, modeOf(mode)).phrase}</span></div>`;
    }
    const langTag = (e) => (e.lang && e.lang !== "English" ? `<span class="tag">${esc(e.lang)}</span>` : "");
    const dayList = ([k, es]) => `<h3>${esc(k)}</h3><ul>${es.map((e) => {
      const bits = [e.loc && !/^main church$/i.test(e.loc) ? esc(e.loc) : "", e.note ? esc(e.note) : ""].filter(Boolean).join(" · ");
      return `<li><span class="t">${clock(e.start)}</span><span>${langTag(e)}${bits ? `<span class="x">${bits}</span>` : ""}</span></li>`;
    }).join("")}</ul>`;
    const all = [...days];
    const soon = all.slice(0, 2), rest = all.slice(2);
    // notes that only restate a language already tagged on the rows add nothing
    const notes = (p.notes || []).filter((n) => !/^(all )?(saturday|sunday|weekday|masses?)\b.*\b(is|are) in (english|mandarin|tamil|tagalog|indonesian)/i.test(n) && !/unless (otherwise )?(indicated|stated)/i.test(n));
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="history.length > 1 ? history.back() : (location.hash='#/')">${svg(ICON.back)}</button></div>
      <section class="church-page">
        <h1>${esc(p.name)}</h1>
        <p class="addr">${esc(p.address)}, Singapore ${esc(p.postal || "")}</p>
        ${lead}
        <div class="acts" style="margin-top:${lead ? 14 : 0}px">
          <a class="btn btn-primary" href="${gmaps(p, mode, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          ${p.phone ? `<a class="btn btn-quiet" href="tel:${esc(p.phone.replace(/\s/g, ""))}" aria-label="Call the parish">${svg(ICON.phone)}</a>` : ""}
        </div>
        <div class="week">
          ${soon.map(dayList).join("") || `<p class="lede">No Masses listed for the coming week. Please check with the parish.</p>`}
          ${rest.length ? `<details class="rest"><summary>Rest of the week</summary>${rest.map(dayList).join("")}</details>` : ""}
        </div>
        ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
        ${all.some(([, es]) => S.specialDay(es[0].start, d)) ? `<p class="notice">${esc(all.map(([, es]) => S.specialDay(es[0].start, d)).filter(Boolean)[0])} is coming up: times that day may differ. Please check with the parish.</p>` : ""}
        <p class="source">${sourceLine(p)}${!p.siteCheck && p.website ? ` Parish website: <a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>.` : ""}</p>
      </section>`;
  }

  // ---------- all churches ----------
  let maplibreP = null;
  const maplibre = () => (maplibreP ||= new Promise((ok, fail) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js";
    js.onload = () => ok(window.maplibregl); js.onerror = (e) => { maplibreP = null; fail(e); };
    document.head.appendChild(js);
  }));
  const PIN = '<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M16 39s13-12.4 13-22.5C29 8.9 23.2 3 16 3S3 8.9 3 16.5C3 26.6 16 39 16 39z"/><path class="x" d="M14.6 9.5h2.8v4.3h4.1v2.7h-4.1v8.3h-2.8v-8.3h-4.1v-2.7h4.1z"/></svg>';

  async function renderChurches(q) {
    const d = await loadData();
    if (!d) return;
    const origin = store.get("mgw-origin");
    const now = Date.now();
    const next = new Map();
    for (const e of S.expandAll(d, now, 7)) if (!next.has(e.pid)) next.set(e.pid, e);
    const dist = (p) => (origin ? R.haversineKm(origin, p) : null);
    const mode = store.get("mgw-mode") || "transit";
    // the next Mass here, and when to leave for it, when we know where you are (same estimate as the church page)
    const nextLine = (p) => {
      const n = next.get(p.id);
      if (!origin) return n ? `Next Mass ${clock(n.start)} ${dayLabel(n.start).toLowerCase()}` : "No Mass listed this week";
      const t = tripTo(p, origin, mode), about = t.source === "estimate" ? "about " : "";
      const lead = (t.minutes + R.BUFFER_MIN) * 60000;
      const m = S.expandParish(String(p.id), d, now, 7).find((e) => e.start - lead >= now);
      return m ? `Next Mass ${clock(m.start)} ${dayLabel(m.start).toLowerCase()} · leave by ${about}${clock(m.start - lead)}` : "No Mass you can make this week";
    };
    const ps = [...d.parishes].sort((a, b) => (origin ? dist(a) - dist(b) : a.name.localeCompare(b.name)));
    const asMap = q.get("view") !== "list";
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button></div>
      <section class="list-head">
        <h1>All churches</h1>
        <div class="seg" role="group" aria-label="View">
          <button type="button" aria-pressed="${asMap}" data-v="map">Map</button>
          <button type="button" aria-pressed="${!asMap}" data-v="list">List</button>
        </div>
        ${asMap ? "" : `<div class="search">${svg(ICON.search)}<input id="filter" type="search" placeholder="Filter by name or area" aria-label="Filter churches"><button class="clear" type="button" aria-label="Clear filter" hidden>${svg(ICON.x)}</button></div>`}
        <p class="muted" style="margin:0">${asMap ? "Tap a church for its next Mass." : origin ? `Nearest first, from ${esc(origin.label)}` : "A to Z. Share your location on the home screen to sort by distance."}</p>
      </section>
      ${asMap ? `<div id="map" role="region" aria-label="Map of churches"></div>
        <p class="legend"><span><i class="l-church"></i>Church</span>${origin ? `<span><i class="l-you"></i>${esc(origin.label === "your location" ? "You" : origin.label)}</span>` : ""}</p>` : `<ul class="rows" id="rows"></ul>`}
      <p class="source">${d.parishes.length} parishes.</p>`;
    view.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => go(`/churches${b.dataset.v === "list" ? "?view=list" : ""}`)));
    if (!asMap) {
      const rows = view.querySelector("#rows");
      const draw = (f) => {
        const list = ps.filter((p) => !f || `${p.name} ${p.address}`.toLowerCase().includes(f));
        rows.innerHTML = list.map((p) => {
          const km = dist(p);
          const far = km != null ? `${km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km"} · ` : "";
          return `<li><a class="row row-church" href="#/church/${p.id}">
            <span class="n">${esc(p.name)}<small>${far}${nextLine(p)}</small></span></a></li>`;
        }).join("") || `<li class="lede">No church matches that.</li>`;
      };
      draw("");
      const filter = view.querySelector("#filter");
      clearable(filter);
      filter.addEventListener("input", (e) => draw(e.target.value.trim().toLowerCase()));
      return;
    }
    const mapEl = view.querySelector("#map");
    let ml;
    try { ml = await maplibre(); } catch { mapEl.innerHTML = '<p class="lede" style="padding:20px">The map could not load. Use the list instead.</p>'; return; }
    if (!mapEl.isConnected) return;
    const map = new ml.Map({
      container: mapEl,
      // a normal full-colour street map (parks, water, MRT lines) in both themes, so places are easy to recognise
      style: "https://tiles.openfreemap.org/styles/liberty",
      // frame you and your five nearest churches, or every church when we don't know where you are
      bounds: (() => {
        const pts = origin ? [origin, ...ps.slice(0, 5)] : d.parishes;
        return [[Math.min(...pts.map((p) => p.lng)), Math.min(...pts.map((p) => p.lat))],
                [Math.max(...pts.map((p) => p.lng)), Math.max(...pts.map((p) => p.lat))]];
      })(),
      fitBoundsOptions: { padding: { top: 56, bottom: 40, left: 36, right: 36 } },
      maxBounds: [[103.45, 1.1], [104.2, 1.55]],
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    currentMap = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
    for (const p of d.parishes) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "church-pin";
      el.setAttribute("aria-label", p.name);
      el.innerHTML = PIN;
      const popup = new ml.Popup({ offset: 40, closeButton: false, maxWidth: "260px" }).setHTML(
        `<strong>${esc(p.name)}</strong><span>${nextLine(p)}</span><a href="#/church/${p.id}">Mass times and directions</a>`);
      popup.on("open", () => el.setAttribute("aria-expanded", "true"));
      popup.on("close", () => el.setAttribute("aria-expanded", "false"));
      new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
    }
    if (origin) {
      const me = document.createElement("div");
      me.className = "me";
      me.setAttribute("aria-label", "You");
      new ml.Marker({ element: me }).setLngLat([origin.lng, origin.lat]).addTo(map);
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest(".btn-primary[href^='https://www.google.com/maps']") && navigator.vibrate) navigator.vibrate(12);
  });
  applyPalette();
  paletteMenu();
  route();
})();
