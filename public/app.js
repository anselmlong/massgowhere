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
  // time of day (see schedule.js): "any" when unset
  const PARTS = window.MassSchedule.PARTS;
  const partOf = (id) => (PARTS[id] ? id : "");
  const partWord = (id) => ({ morning: "a morning Mass", lunch: "a lunchtime Mass", evening: "an evening Mass" }[id] || "any Mass");
  const partIcon = (id) => ICON[id] || ICON.clock;
  const partAdj = (id) => (PARTS[id] ? `${PARTS[id].label.toLowerCase()} ` : "");
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
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    recent: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l2.5 1.5"/>',
    telegram: '<path d="M21 4 3 11.2l6.3 2.3M21 4l-3.2 16-8.5-6.5M21 4 9.3 13.5v5.7l3.2-3.3"/>',
    morning: '<path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0M12 5v3.2M5.2 9.7l1.9 1.6M18.8 9.7l-1.9 1.6M9 20.5h6"/>',
    lunch: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5"/>',
    evening: '<path d="M19.5 14.6A7.6 7.6 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1z"/>',
    sunday: '<path d="M12 3v18M7 8.5h10"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
    adoration: '<circle cx="12" cy="9" r="3.2"/><path d="M12 2.5v1.8M12 13.7v7.8M5.5 9h1.8M16.7 9h1.8M7.4 4.4l1.3 1.3M15.3 12.3l1.3 1.3M7.4 13.6l1.3-1.3M15.3 5.7l1.3-1.3M8.5 21.5h7"/>',
    confession: '<path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z"/><path d="M9 10.5h6"/>',
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
  // ---------- design options (preview only, ?preview=1): layout, colour theme, font ----------
  // Each choice is remembered per browser and can be set by link (?layout=list&look=parchment&font=atkinson).
  const LOOKS = [
    ["season", "Seasonal", "White, accent follows the Church’s season"], ["green", "Green", "White with liturgical green"],
    ["blue", "Blue", "White with Marian blue"], ["violet", "Violet", "White with Advent violet"], ["red", "Red", "White with feast red"],
    ["parchment", "Parchment & gold", "Warm paper and old gold"], ["marian", "Marian", "Soft blue-white and deep blue"],
    ["terracotta", "Terracotta", "Warm clay, like a parish courtyard"], ["sage", "Sage", "Quiet green-grey, very calm"],
  ];
  const FONTS = [
    ["geist", "Geist", "Crisp and modern", "Geist:wght@400;500;600;700"],
    ["atkinson", "Atkinson Hyperlegible", "Designed for easy reading (default)", "Atkinson+Hyperlegible+Next:wght@400;500;600;700"],
    ["figtree", "Figtree", "Friendly and round", "Figtree:wght@400;500;600;700"],
    ["nunito", "Nunito", "Soft and gentle", "Nunito:wght@400;500;600;700"],
    ["serif", "Source Serif + Sans", "Serif headings, like a missal", "Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=Source+Sans+3:wght@400;500;600;700"],
  ];
  const LAYOUTS = [
    ["simple", "Simple", "One big button; options tucked behind “Change”"],
    ["list", "Settings list", "Labelled rows: From, Leaving, Travel, Mass"],
    ["wizard", "Step by step", "One question at a time: what, where from, when, how, which Mass (default)"],
    ["quick", "Quick picks", "Travel and time of day as tap-to-choose buttons"],
    ["sentence", "Sentence", "The earlier “I’m leaving from…” sentence"],
  ];
  const MODES_UI = [["light", "Light", "Always light (default)"], ["dark", "Dark", "Always dark"], ["auto", "Match my phone", "Follows the phone’s light or dark setting"]];
  const pickFrom = (list, v, dflt) => (list.some(([k]) => k === v) ? v : dflt);
  const design = () => ({
    look: pickFrom(LOOKS, store.get("mgw-palette"), "season"),
    font: pickFrom(FONTS, store.get("mgw-font"), "atkinson"),
    layout: pickFrom(LAYOUTS, store.get("mgw-layout"), "wizard"),
    scheme: pickFrom(MODES_UI, store.get("mgw-scheme"), "light"),
  });
  function applyPalette() {
    const qs = new URLSearchParams(location.search);
    if (qs.get("palette") || qs.get("look")) store.set("mgw-palette", qs.get("look") || qs.get("palette"));
    if (qs.get("font")) store.set("mgw-font", qs.get("font"));
    if (qs.get("layout")) store.set("mgw-layout", qs.get("layout"));
    if (qs.get("scheme")) store.set("mgw-scheme", qs.get("scheme"));
    const { look, font, scheme } = design();
    const s = season(Date.now());
    const root = document.documentElement;
    const accents = ["green", "blue", "violet", "red"];
    root.dataset.accent = look === "season" ? s.accent : accents.includes(look) ? look : "green";
    if (accents.includes(look) || look === "season") delete root.dataset.look; else root.dataset.look = look;
    const f = FONTS.find(([k]) => k === font);
    // Atkinson is in index.html; any other font is fetched when chosen
    if (font !== "atkinson" && !document.getElementById(`font-${font}`)) {
      const l = document.createElement("link");
      l.id = `font-${font}`; l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${f[3]}&display=swap`;
      document.head.appendChild(l);
    }
    root.dataset.font = font;
    // follows the phone unless chosen otherwise in design options
    if (scheme === "auto") delete root.dataset.theme; else root.dataset.theme = scheme;
    const dark = scheme === "dark" || (scheme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    requestAnimationFrame(() => document.getElementById("theme-color")?.setAttribute("content", getComputedStyle(root).getPropertyValue("--bg").trim() || (dark ? "#111317" : "#ffffff")));
    const el = document.getElementById("season");
    // "26th Week in Ordinary Time" wraps on a phone; the bar says the season, the full name is in the tooltip
    const short = s.name.replace(/^\d+\w\w (Sunday|Week) (in|of) /, "");
    el.querySelector("span").textContent = short.charAt(0).toUpperCase() + short.slice(1);
    el.title = s.name;
    el.hidden = look !== "season";
  }
  function openDesignSheet() {
    const cur = design();
    const sel = (key, label, list) => `<label class="pick"><span>${label}</span><select data-d="${key}">${list.map(([k, l, sub]) =>
      `<option value="${k}"${cur[key] === k ? " selected" : ""}>${esc(l)} — ${esc(sub)}</option>`).join("")}</select>${svg(ICON.chev)}</label>`;
    openSheet("Design options", `
      <p class="muted" style="margin:0">Try each combination on this phone. Only you see these choices.</p>
      ${sel("layout", "Home screen layout", LAYOUTS)}
      ${sel("scheme", "Light or dark", MODES_UI)}
      ${sel("look", "Colour theme", LOOKS)}
      ${sel("font", "Font", FONTS)}
      <button class="btn btn-quiet" type="button" data-share>${svg(ICON.recent)}<span>Copy a link to this combination</span></button>`, "select");
    const store_ = { layout: "mgw-layout", look: "mgw-palette", font: "mgw-font", scheme: "mgw-scheme" };
    sheet.querySelectorAll("select[data-d]").forEach((x) => x.addEventListener("change", () => {
      store.set(store_[x.dataset.d], x.value);
      applyPalette();
      if (!location.hash || location.hash === "#/") renderHome();
    }));
    sheet.querySelector("[data-share]").addEventListener("click", async (e) => {
      const d = design();
      const url = `${location.origin}/?preview=1&layout=${d.layout}&look=${d.look}&font=${d.font}&scheme=${d.scheme}${location.hash}`;
      try { await navigator.clipboard.writeText(url); e.currentTarget.querySelector("span").textContent = "Link copied"; } catch { prompt("Copy this link", url); }
    });
  }
  function paletteMenu() {
    const params = new URLSearchParams(location.search);
    if (params.has("preview")) store.set("mgw-preview", true);
    if (!store.get("mgw-preview")) return;
    const box = document.getElementById("palette-picker");
    box.innerHTML = `<button type="button">${svg(ICON.info)}Design options</button>`;
    box.querySelector("button").addEventListener("click", openDesignSheet);
    box.hidden = false;
    document.documentElement.classList.add("previewing");
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
    if (m < -1) return `started ${-m} minutes ago`;
    if (m <= 1) return "starting now";
    if (m < 60) return `in ${m} minutes`;
    const h = Math.round(m / 60);
    return h < 24 ? `in about ${h} hour${h === 1 ? "" : "s"}` : dayLabel(ms);
  }
  const mins = (m) => (m < 60 ? `${Math.max(1, m)} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim()); // never "0 min"
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
  // what a parish's own website says beyond Mass times (public/parish/<id>.json, not every parish has one);
  // the church page renders without it
  const infoP = new Map();
  const parishInfo = (id) => {
    if (!infoP.has(id)) infoP.set(id, fetch(`parish/${id}.json`, { cache: "no-cache", signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => { infoP.delete(id); return null; }));
    return infoP.get(id);
  };

  // ---------- router ----------
  let currentMap = null;
  function route() {
    if (currentMap) { currentMap.remove(); currentMap = null; }
    const [path, qs] = location.hash.replace(/^#/, "").split("?");
    const q = new URLSearchParams(qs || "");
    window.scrollTo(0, 0);
    if (path.startsWith("/next")) return renderNext(q);
    if (path.startsWith("/open")) return renderOpen(q);
    if (path.startsWith("/church/")) return renderChurch(Number(path.split("/")[2]), q);
    if (path.startsWith("/churches")) return renderChurches(q);
    if (path.startsWith("/way")) return renderWay(q);
    return renderHome();
  }
  const go = (hash) => { location.hash = hash; };
  window.addEventListener("hashchange", route);
  // screens are #/ routes, which Vercel Analytics can't see on its own: report each one as a page view,
  // by route name only (never the query string, which holds coordinates)
  window.addEventListener("hashchange", () => {
    const path = location.hash.replace(/^#/, "").split("?")[0].replace(/^\/church\/\d+/, "/church/[id]") || "/";
    try { window.va && window.va("pageview", { route: path, path }); } catch { /* analytics is optional */ }
  });

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

  function openPartSheet(current, pick) {
    const opts = [["", "Any time", "The soonest Mass you can make"], ...Object.entries(PARTS).map(([id, x]) => [id, x.label, x.range[0].toUpperCase() + x.range.slice(1)]),
      ["sunday", "Sunday or Sunset Mass", "Sunday, or Saturday from 4pm"]];
    openSheet("Which Mass?", `<div class="opts">${opts.map(([id, l, sub]) => `
      <button class="opt" type="button" data-part="${id}" aria-pressed="${id === current}">${svg(id === "sunday" ? ICON.sunday : partIcon(id))}<span>${l}<small>${sub}</small></span></button>`).join("")}</div>`, "[aria-pressed='true']");
    sheet.querySelectorAll("[data-part]").forEach((b) => b.addEventListener("click", () => { closeSheet(); pick(b.dataset.part); }));
  }

  // Mass languages, English first; the list comes from the timetable, so a new language appears by itself
  function openLangSheet(current, pick) {
    data().then((d) => {
      const langs = [...new Set(Object.values(d.rules).flat().filter((r) => r.type === "Mass").map((r) => S.langName(r.lang)))]
        .sort((a, b) => (a === "English" ? -1 : b === "English" ? 1 : a.localeCompare(b)));
      openSheet("Mass in which language?", `<div class="opts">${[["", "Any language"], ...langs.map((l) => [l, l])].map(([v, l]) => `
        <button class="opt" type="button" data-lang="${esc(v)}" aria-pressed="${v === current}">${svg(ICON.globe)}<span>${esc(l)}</span></button>`).join("")}</div>`, "[aria-pressed='true']");
      sheet.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { closeSheet(); pick(b.dataset.lang); }));
    }).catch(() => {});
  }

  // the two explainers, for anyone unsure what the site does or why it picked a Mass
  const HOW_STEPS = () => `
      <ol class="how-steps">
        <li><strong>Mass times for all 32 parishes.</strong> Gathered from myCatholicSG, and checked each month against every parish’s own website.</li>
        <li><strong>Where you are.</strong> Your location, or a postal code or place you search for, tells us which churches are around you.</li>
        <li><strong>Real travel times.</strong> For the nearby churches we ask OneMap, Singapore’s official map, how long the trip takes by bus &amp; MRT, car or on foot, and time it so you arrive 5 minutes before Mass begins, with a moment to settle in and prepare.</li>
        <li><strong>One answer.</strong> The Mass you can make and when to leave, with the other churches you can reach listed below. Navigate opens Google Maps.</li>
      </ol>
      <p class="muted">Times can change on feast days and public holidays, so check with the parish. MassGoWhere is an independent project, not run by the Archdiocese.</p>`;
  // under the headline, a plain "How does this work?" link opens the explainer in place
  const headline = () => `<div class="intro-head"><h1>Find a Mass you can make.</h1>
      <button class="how link" type="button" id="how" aria-expanded="false" aria-controls="how-pop">How does this work?</button></div>`;
  const howPop = () => `<div class="how-pop" id="how-pop" hidden>${HOW_STEPS()}</div>`;
  function wireHow(root) {
    const btn = root.querySelector("#how"), pop = root.querySelector("#how-pop");
    if (!btn || !pop) return;
    const set = (open) => { pop.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => set(pop.hidden));
  }
  // the season mark says why the site wears the colour it does, and shows the whole year of colours with today marked
  const COLOUR_WORDS = {
    ordinary: () => "Green for Ordinary Time: the long, steady season of growth between the great feasts.",
    advent: () => "Violet for Advent: weeks of waiting and getting ready for Christmas.",
    lent: () => "Violet for Lent: prayer, fasting and almsgiving on the way to Easter.",
    holyweek: (s) => (s.accent === "red" ? `Red for ${s.name}, the colour of the Lord’s Passion.` : "Violet for Holy Week, as the Church walks towards Easter."),
    christmas: () => "White and gold for Christmas: joy at the birth of Christ. Gold shows up on a white page, so the site wears gold.",
    easter: () => "White and gold for Easter: the joy of the Resurrection. Gold shows up on a white page, so the site wears gold.",
    pentecost: () => "Red for Pentecost: the fire of the Holy Spirit.",
  };
  function openSeasonSheet() {
    const now = Date.now(), s = season(now), D = 864e5;
    const y = S.sgtDay(now).getUTCFullYear();
    const days = Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / D);
    // one run per stretch of the same colour, from 1 Jan to 31 Dec (noon in Singapore, so each day is itself)
    const runs = [];
    for (let i = 0; i < days; i++) {
      const a = season(Date.UTC(y, 0, 1, 4) + i * D).accent;
      if (runs.length && runs[runs.length - 1].a === a) runs[runs.length - 1].n++; else runs.push({ a, n: 1 });
    }
    const today = Math.round((S.sgtDay(now).getTime() - Date.UTC(y, 0, 1)) / D);
    openSheet("Today’s colour", `
      <div class="why">
        <p>MassGoWhere takes its colour from the Church’s year, the way the vestments change at Mass.</p>
        <p><strong>${esc(s.name)}.</strong> ${esc(COLOUR_WORDS[s.kind](s))}</p>
      </div>
      <figure class="year" aria-label="The Church’s year in colour, January to December, with today marked">
        <div class="year-band" aria-hidden="true">${runs.map((r) => `<i class="c-${r.a}" style="flex:${r.n}"></i>`).join("")}</div>
        <b class="year-now" style="left:${((today + 0.5) / days * 100).toFixed(2)}%" aria-hidden="true"></b>
        <figcaption><span>Jan</span><span>Today</span><span>Dec</span></figcaption>
      </figure>
      <p class="muted" style="margin:0">Feasts and saints’ days can have a colour of their own; the site follows the season.</p>`, ".sheet-close");
    const cap = sheet.querySelector(".year figcaption span:nth-child(2)");
    // "Today" sits under the marker, kept clear of the two ends
    cap.style.left = `clamp(3.2em, ${((today + 0.5) / days * 100).toFixed(2)}%, calc(100% - 3.2em))`;
  }
  document.getElementById("season").addEventListener("click", openSeasonSheet);

  function openWhySheet({ from, mode, at, part, sunday, lang }) {
    const adj = `${sunday ? "Sunday " : ""}${partAdj(part)}`;
    openSheet("Why this Mass?", `
      <div class="why">
        <p>We looked for the earliest ${adj}Mass${lang ? ` in ${esc(lang)}` : ""} you can still reach, leaving ${esc(at ? whenText(at) : "now")} ${mode.phrase} from ${esc(from)}.</p>
        <p>If another church has a Mass starting within ${R.WINDOW_MIN} minutes of that one, we pick the shortest trip, so you aren’t sent across the island to arrive a few minutes sooner.</p>
        <p>Travel times come from OneMap, Singapore’s official map. “Leave by” gets you there 5 minutes early, so you have time to settle in and prepare for Mass.</p>
        ${sunday ? `<p>For your Sunday obligation we count Sunday Masses and Saturday Sunset Masses (from 4pm).</p>` : ""}
        <p>The other churches you can make it to are listed below the answer.</p>
      </div>`, ".sheet-close");
  }

  // places people searched before, newest first (not raw GPS, which is stale by now)
  const recentPlaces = () => (store.get("mgw-recent") || []).filter((r) => Date.now() - (r.at || 0) < 60 * DAY).slice(0, 4);
  function rememberPlace(p) {
    if (!p.label || p.label === "your location") return;
    store.set("mgw-recent", [{ ...p, at: Date.now() }, ...(store.get("mgw-recent") || []).filter((r) => r.label !== p.label)].slice(0, 6));
  }
  const placeTitle = (x) => (x.BUILDING && x.BUILDING !== "NIL" ? x.BUILDING : x.SEARCHVAL)
    .replace(/\b\w+/g, (w) => (/^(MRT|LRT|NUS|NTU|SMU|CBD|HDB)$/.test(w) || /^[A-Z]{1,3}\d+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()));

  function openPlaceSheet(pick, { title = "Leaving from", here = true } = {}) {
    const recent = recentPlaces();
    openSheet(title, `
      <div class="search">${svg(ICON.search)}<input id="place-q" type="search" inputmode="search" autocomplete="off" placeholder="Postal code or place" aria-label="Postal code or place" aria-controls="place-res">
        <button class="clear" type="button" aria-label="Clear search" hidden>${svg(ICON.x)}</button></div>
      <div id="place-res" class="opts"></div>`, "#place-q");
    const input = sheet.querySelector("#place-q"), res = sheet.querySelector("#place-res");
    const home = () => {
      res.innerHTML = `${here ? `<button class="opt" type="button" data-here>${svg(ICON.locate)}<span>Use my location<small>Where you are when you tap Find</small></span></button>` : ""}
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

  // title/none/verb/quick/earliest let the same wheels ask "Need to be there by" as well as "Leave at"
  function openTimeSheet(current, pick, { title = "Leave at", none = "Leave now", verb = "Leave", quick: shortcuts = null, earliest = 0 } = {}) {
    const now = Date.now(), today = sgMidnight(now);
    const days = Array.from({ length: 7 }, (_, i) => today + i * DAY);
    // shortcuts for the times people plan around: after work, Saturday vigil, Sunday morning
    const sat = days.find((d) => wk(d) === "Sat"), sun = days.find((d) => wk(d) === "Sun");
    const quick = shortcuts || [
      now + 30 * 60000 < today + 22 * 3600e3 ? { t: nextQuarter(now + 29 * 60000), l: "In 30 min" } : null,
      today + 18 * 3600e3 > now + Q ? { t: today + 18 * 3600e3, l: "Tonight 6pm" } : null,
      sat && sat + 16.5 * 3600e3 > now ? { t: sat + 16.5 * 3600e3, l: `${sat === today ? "Today" : "Sat"} 4:30pm` } : null,
      sun && sun + 7.5 * 3600e3 > now ? { t: sun + 7.5 * 3600e3, l: `${sun === today ? "Today" : "Sun"} 7:30am` } : null,
    ].filter(Boolean);
    openSheet(title, `
      <div class="quick"><button class="q now" type="button" data-at="">${none}</button>${quick.map((x) => `<button class="q" type="button" data-at="${x.t}">${x.l}</button>`).join("")}</div>
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
      const min = Math.max(nextQuarter(Date.now()), earliest);
      if (at < min) { at = min; split(at).forEach((v, k) => W[k].set(v, true)); }
      const d = dayLabel(at);
      setBtn.dataset.at = at;
      setBtn.innerHTML = `${svg(ICON.clock)}<span>${verb} ${d === "Today" ? "today" : d === "Tomorrow" ? "tomorrow" : wk(at, "long")} at ${clock(at)}</span>`;
    };
    const init = split(current ?? Math.max(nextQuarter(now), earliest));
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
  // sunday: only Masses for the Sunday obligation (not remembered: it's for this weekend); lang is remembered
  // kind and step belong to the step-by-step layout: what you're looking for, and which question you're on
  const plan = { place: null, at: null, part: "", sunday: false, lang: store.get("mgw-lang") || "", kind: "mass", step: 0 };
  // "Sunday" is a Which Mass choice but its own filter (sunday=1): any Sunday Mass, or Saturday's from 4pm
  const setPart = (x) => { plan.sunday = x === "sunday"; plan.part = plan.sunday ? "" : x; };
  // the "I might be up to 15 min late" switch is hidden (and ignored) until there's demand for it
  const LATE_UI = false;
  function renderHome() {
    const mode = store.get("mgw-mode") || "transit";
    if (plan.at != null && plan.at <= Date.now()) plan.at = null;
    const here = !plan.place && plan.at == null;
    const layout = design().layout;
    const place = plan.place ? plan.place.label : "my location";
    // can't avoid being late? a Mass that has just started still counts, up to 15 minutes in
    const lateSwitch = `<label class="late-switch"><input type="checkbox" id="late" ${store.get("mgw-late") ? "checked" : ""}>
          <span>I might be up to 15 min late</span></label>`;
    const findBtn = `${LATE_UI ? lateSwitch : ""}<button class="btn btn-primary btn-find" id="find" type="button">${svg(here ? ICON.locate : ICON.search)}<span>${here ? "Find a Mass near me" : "Find a Mass"}</span></button>
          <p class="msg" id="msg" role="status" hidden></p>
          <details class="also">
            <summary>Adoration or Confession</summary>
            <ul class="more-ways">
              <li><button type="button" data-kind="adoration">${svg(ICON.adoration)}<span>Adoration room open near me</span>${svg(ICON.right, "go")}</button></li>
              <li><button type="button" data-kind="confession">${svg(ICON.confession)}<span>Confession near me<small>Most parishes hear Confession before weekend Masses</small></span>${svg(ICON.right, "go")}</button></li>
            </ul>
          </details>`;
    // the ways out of the home screen that aren't the answer: quiet rows, not rival buttons
    const more = `<ul class="more-ways">
        <li><a href="#/way">${svg(ICON.route)}<span>Catch a Mass on the way</span>${svg(ICON.right, "go")}</a></li>
        <li><a href="#/churches">${svg(ICON.map)}<span>Browse churches and Mass times</span>${svg(ICON.right, "go")}</a></li>
      </ul>`;
    const promise = `<div class="intro">${headline()}
        <blockquote class="lede quote"><p>“It would be easier for the world to survive without the sun than to do without Holy Mass.”</p><footer>St Padre Pio</footer></blockquote>${howPop()}</div>`;
    const summary = [plan.place ? `From ${place}` : "", plan.at == null ? "Leaving now" : `Leaving ${whenText(plan.at)}`, modeOf(mode).label, plan.sunday ? "Sunday or Sunset Mass" : plan.part ? `${PARTS[plan.part].label} Mass` : "Any Mass", plan.lang ? `in ${plan.lang}` : ""].filter(Boolean).join(" · ");
    let body;
    const wiz = layout === "wizard";
    const KINDS_W = [["mass", "A Mass", "", ICON.clock], ["adoration", "An Adoration room", "", ICON.adoration], ["confession", "Confession", "", ICON.confession]];
    const steps = plan.kind === "mass" ? ["what", "from", "when", "how", "which"] : ["what", "from", "when", "how"];
    const si = Math.min(plan.step, steps.length - 1), step = steps[si], last = si === steps.length - 1;
    if (wiz) {
      let n = 0;
      const opt = (attr, val, icon, label, sub, on) => `<button class="opt" type="button" style="--i:${n++}" data-${attr}="${esc(val)}" aria-pressed="${!!on}">${svg(icon)}<span>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
      const Q = { what: "What are you looking for?", from: "Where are you leaving from?", when: "When are you leaving?", how: "How are you getting there?", which: "Which Mass?" };
      let opts = "";
      if (step === "what") opts = KINDS_W.map(([k, l, s, i]) => opt("w-kind", k, i, l, s, plan.kind === k)).join("");
      else if (step === "from") opts = opt("w-from", "here", ICON.locate, "My location", "", !plan.place) + opt("w-from", "place", ICON.pin, plan.place ? esc(place) : "Somewhere else", plan.place ? "Tap to change" : "A postal code, MRT station or street", !!plan.place);
      else if (step === "when") opts = opt("w-when", "now", ICON.clock, "Now", "", plan.at == null) + opt("w-when", "later", ICON.recent, plan.at == null ? "Later" : esc(whenText(plan.at)), plan.at == null ? "Tonight, tomorrow, this weekend…" : "Tap to change", plan.at != null);
      else if (step === "how") opts = MODES.map((m) => opt("w-mode", m.id, m.icon, m.label, "", m.id === mode)).join("");
      else {
        // "Any" is the default; the rest are dropdowns so a tap never redraws the screen
        // the same big choices as every other step, and like them a tap moves on: here it finds the Mass. Language
        // comes first, as it has to be set before that tap
        opts = `<label class="pick wiz-pick wiz-lang"><span>Language</span><select id="w-lang"><option value="">Any language</option>${plan.lang ? `<option value="${esc(plan.lang)}" selected>${esc(plan.lang)}</option>` : ""}</select>${svg(ICON.chev)}</label>` +
          [["", "Any Mass", "The soonest one you can make", ICON.clock], ["sunday", "Sunday or Sunset Mass", "Saturday from 4pm counts for Sunday", ICON.sunday],
            ...Object.entries(PARTS).map(([id, x]) => [id, x.label, x.range[0].toUpperCase() + x.range.slice(1), partIcon(id)])]
            .map(([v, l, sub, icon]) => opt("w-part", v, icon, l, sub, false)).join("");
      }
      const kindWord = { mass: "Mass", adoration: "Adoration", confession: "Confession" }[plan.kind];
      const finish = si === 0 ? "" : `
        ${LATE_UI && last && plan.kind === "mass" ? `<label class="late-switch"><input type="checkbox" id="late" ${store.get("mgw-late") ? "checked" : ""}>
          <span>Might be a few minutes late?<small>Also count a Mass that has just started, up to 15 minutes in.</small></span></label>` : ""}
        ${last && step === "which" ? "" : `<button class="btn ${last ? "btn-primary btn-find" : "btn-quiet wiz-skip"}" id="find" type="button" style="--i:${n}">${svg(plan.place ? ICON.search : ICON.locate)}<span>${plan.kind === "mass" ? (plan.place ? "Find a Mass" : "Find a Mass near me") : `Find ${kindWord}${plan.place ? "" : " near me"}`}${last ? "" : " now"}</span></button>`}
        <p class="msg" id="msg" role="status" hidden></p>`;
      // what you've answered so far sits above as chips; tap one to change it
      const said = { what: KINDS_W.find(([k]) => k === plan.kind)[1], from: plan.place ? place : "My location", when: plan.at == null ? "Now" : whenText(plan.at), how: modeOf(mode).label, which: "" };
      const chips = steps.slice(0, si).map((k, i) => `<button class="wiz-chip" type="button" data-w-goto="${i}" style="--i:${i}">${esc(said[k])}<span aria-hidden="true">${svg(ICON.chev)}</span></button>`).join("");
      body = `${si === 0 ? promise : ""}
        <div class="wiz" role="group" aria-label="${Q[step]}">
          ${chips ? `<div class="wiz-chips">${chips}</div>` : ""}
          <h2 class="wiz-q" id="wiz-q" tabindex="-1" key="${step}">${Q[step]}</h2>
          <div class="opts">${opts}</div>
          ${finish}
        </div>${si === 0 ? more : ""}`;
    } else if (layout === "simple") {
      body = `${promise}
        <div class="actions">${findBtn}
          <div class="summary"><span>${esc(summary)}</span><button class="link" type="button" id="opts">Change</button></div>
        </div>${more}`;
    } else if (layout === "list") {
      const row = (id, label, value) => `<li><button type="button" id="${id}"><span class="k">${label}</span><span class="v">${esc(value)}</span>${svg(ICON.right, "go")}</button></li>`;
      body = `${promise}
        <ul class="settings" aria-label="Your trip">
          ${row("t-place", "From", plan.place ? place : "My location")}
          ${row("t-time", "Leaving", plan.at == null ? "Now" : whenText(plan.at))}
          ${row("t-mode", "Travel by", modeOf(mode).label)}
          ${row("t-part", "Mass", plan.sunday ? "Sunday or Sunset" : plan.part ? `${PARTS[plan.part].label} (${PARTS[plan.part].range})` : "Any time")}
          ${row("t-lang", "Language", plan.lang || "Any language")}
        </ul>
        <div class="actions">${findBtn}</div>${more}`;
    } else if (layout === "quick") {
      const seg = (name, opts, cur) => `<div class="qseg" role="radiogroup" aria-label="${name}" style="--n:${opts.length};--i:${Math.max(0, opts.findIndex(([v]) => v === cur))}">${opts.map(([v, l, icon]) =>
        `<button type="button" role="radio" aria-checked="${v === cur}" data-${name === "Travel" ? "qmode" : "qpart"}="${v}"${name === "Mass" && v ? ` title="${esc(v === "sunday" ? "Sunday, or a Sunset Mass on Saturday from 4pm: for your Sunday obligation" : PARTS[v].range)}"` : ""}>${icon ? svg(icon) : ""}<span>${l}</span></button>`).join("")}</div>`;
      body = `${promise}
        <div class="quick-form">
          <p class="qlabel">How are you travelling?</p>
          ${seg("Travel", MODES.map((m) => [m.id, m.label, m.icon]), mode)}
          <p class="qlabel">Which Mass?</p>
          ${seg("Mass", [["", "Any", ICON.clock], ...Object.entries(PARTS).map(([k, x]) => [k, k === "lunch" ? "Lunch" : x.label, partIcon(k)]), ["sunday", "Sunday", ICON.sunday]], plan.sunday ? "sunday" : plan.part)}
          <p class="from-line">${esc(plan.place ? `From ${place}` : "From where you are")}, ${esc(plan.at == null ? "leaving now" : `leaving ${whenText(plan.at)}`)}${plan.lang ? `, Mass in ${esc(plan.lang)}` : ""}. <button class="link" type="button" id="opts">Change</button></p>
        </div>
        <div class="actions">${findBtn}</div>${more}`;
    } else {
      body = `<div class="intro">${headline()}
          <blockquote class="lede quote"><p>“It would be easier for the world to survive without the sun than to do without Holy Mass.”</p><footer>St Padre Pio</footer></blockquote>
          ${howPop()}
        </div>
        <p class="sentence">I’m leaving from
          <button class="tok" type="button" id="t-place" aria-label="Leaving from: ${esc(place)}. Change"><span>${esc(place)}</span>${svg(ICON.chev)}</button><br>at
          <button class="tok" type="button" id="t-time" aria-label="Leaving at: ${esc(whenText(plan.at))}. Change"><span>${esc(whenText(plan.at))}</span>${svg(ICON.chev)}</button> by
          <button class="tok" type="button" id="t-mode" aria-label="Travelling by: ${esc(modeOf(mode).label)}. Change"><span>${esc(modeOf(mode).word)}</span>${svg(ICON.chev)}</button><br>for
          <button class="tok" type="button" id="t-part" aria-label="Looking for: ${esc(partWord(plan.part))}. Change"><span>${esc(partWord(plan.part))}</span>${svg(ICON.chev)}</button></p>
        <p class="hint">Tap an underlined word to change it.</p>
        <div class="actions">${findBtn}
          <a class="btn btn-quiet browse" href="#/churches">${svg(ICON.map)}<span>Browse churches and Mass times</span></a>
          <a class="btn btn-quiet browse" href="#/way">${svg(ICON.route)}<span>Catch a Mass on the way</span></a>
        </div>
        <a class="tg" href="https://t.me/massgowherebot" target="_blank" rel="noopener">${svg(ICON.telegram)}<span><strong>Prefer Telegram? Use @massgowherebot</strong><small>Send it your location or a postal code and it replies with the Mass you can make.</small></span>${svg(ICON.right, "go")}</a>`;
    }
    view.innerHTML = `<section class="home home-${layout}">${body}</section>`;
    warmMap();
    // the choice you just changed glows for a moment, so the screen visibly answers back
    const changed = (id) => { renderHome(); const t = view.querySelector(id) || view.querySelector("#opts"); t?.focus({ preventScroll: true }); t?.classList.add("just"); };
    const on = (id, fn) => view.querySelector(id)?.addEventListener("click", fn);
    const pickPlace = () => openPlaceSheet((p) => { plan.place = p; changed("#t-place"); });
    const pickTime = () => openTimeSheet(plan.at, (at) => { plan.at = at; changed("#t-time"); });
    const pickMode = () => openModeSheet(mode, (m) => { store.set("mgw-mode", m); changed("#t-mode"); });
    const pickPart = () => openPartSheet(plan.sunday ? "sunday" : plan.part, (x) => { setPart(x); changed("#t-part"); });
    const pickLang = () => openLangSheet(plan.lang, (x) => { plan.lang = x; store.set("mgw-lang", x); changed("#t-lang"); });
    wireHow(view);
    if (wiz) {
      // each answer moves to the next question; the last one stays put and shows the Find button
      const next = () => { plan.step++; renderHome(); view.querySelector("#wiz-q")?.focus({ preventScroll: true }); };
      // on the last step an answer only moves the highlight; nothing is redrawn
      const answer = (set, b) => { set(); if (!last) return next(); b.parentElement.querySelectorAll(".opt").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); };
      const each = (sel, fn) => view.querySelectorAll(sel).forEach((b) => b.addEventListener("click", () => fn(b.dataset, b)));
      each("[data-w-goto]", (d) => { plan.step = Number(d.wGoto); renderHome(); view.querySelector("#wiz-q")?.focus({ preventScroll: true }); });
      each("[data-w-kind]", (d) => { plan.kind = d.wKind; next(); });
      each("[data-w-from]", (d, b) => (d.wFrom === "here" ? answer(() => { plan.place = null; }, b) : openPlaceSheet((p) => { plan.place = p; next(); }, { here: false })));
      each("[data-w-when]", (d, b) => (d.wWhen === "now" ? answer(() => { plan.at = null; }, b) : openTimeSheet(plan.at, (at) => { plan.at = at; next(); })));
      each("[data-w-mode]", (d, b) => answer(() => store.set("mgw-mode", d.wMode), b));
      // the last step: a choice just marks itself (no redraw); Find goes
      // the last step: tapping a kind of Mass finds it, as every other step's tap moves on
      each("[data-w-part]", (d, b) => { setPart(d.wPart); findFrom(b, "/next?", massOpts()); });
      const lang = view.querySelector("#w-lang");
      if (lang) {
        lang.addEventListener("change", () => { plan.lang = lang.value; store.set("mgw-lang", lang.value); });
        // the languages come from the timetable, so a new one shows up by itself
        data().then((d) => {
          const langs = [...new Set(Object.values(d.rules).flat().filter((r) => r.type === "Mass").map((r) => S.langName(r.lang)))].sort((x, y) => (x === "English" ? -1 : y === "English" ? 1 : x.localeCompare(y)));
          lang.innerHTML = [["", "Any language"], ...langs.map((l) => [l, l])].map(([v, l]) => `<option value="${esc(v)}"${v === plan.lang ? " selected" : ""}>${esc(l)}</option>`).join("");
        }).catch(() => {});
      }
    }
    on("#t-place", pickPlace); on("#t-time", pickTime); on("#t-mode", pickMode); on("#t-part", pickPart); on("#t-lang", pickLang);
    // "Change": every option in one sheet, each opening its own picker
    on("#opts", () => {
      const all = layout === "quick"
        ? [["place", ICON.pin, "Leaving from", place], ["time", ICON.clock, "Leaving at", whenText(plan.at)], ["lang", ICON.globe, "Language", plan.lang || "Any language"]]
        : [["place", ICON.pin, "Leaving from", place], ["time", ICON.clock, "Leaving at", whenText(plan.at)],
           ["mode", modeOf(mode).icon, "Travelling by", modeOf(mode).label], ["part", partIcon(plan.part), "Which Mass", plan.part ? PARTS[plan.part].label : "Any time"],
           ["lang", ICON.globe, "Language", plan.lang || "Any language"]];
      openSheet("Your trip", `<div class="opts">${all.map(([k, icon, l, v]) => `<button class="opt" type="button" data-o="${k}">${svg(icon)}<span>${l}<small>${esc(v)}</small></span></button>`).join("")}</div>`);
      sheet.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        closeSheet();
        setTimeout({ place: pickPlace, time: pickTime, mode: pickMode, part: pickPart, lang: pickLang }[b.dataset.o], 200);
      }));
    });
    // a tap moves the highlight to the new choice (see .qseg::before); nothing else on the screen depends on it
    const choose = (b, set) => {
      const group = b.closest(".qseg"), all = [...group.querySelectorAll("[role=radio]")];
      all.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      group.style.setProperty("--i", all.indexOf(b));
      set();
    };
    view.querySelectorAll("[data-qmode]").forEach((b) => b.addEventListener("click", () => choose(b, () => store.set("mgw-mode", b.dataset.qmode))));
    view.querySelectorAll("[data-qpart]").forEach((b) => b.addEventListener("click", () => choose(b, () => setPart(b.dataset.qpart))));
    const msg = view.querySelector("#msg");
    const say = (t) => { msg.textContent = t; msg.hidden = false; };
    const btn = view.querySelector("#find");
    view.querySelector("#late")?.addEventListener("change", (e) => store.set("mgw-late", e.target.checked));
    const at = () => (plan.at != null && plan.at > Date.now() ? `&at=${plan.at}` : "");
    const massOpts = () => at() + (plan.part ? `&part=${plan.part}` : "") + (plan.sunday ? "&sunday=1" : "") + (plan.lang ? `&lang=${encodeURIComponent(plan.lang)}` : "") + (LATE_UI && store.get("mgw-late") ? "&late=15" : "");
    // the Mass button and the Adoration / Confession rows all start from the same place: the one chosen, or where you are
    const findFrom = (b, path, extra) => {
      const mode = store.get("mgw-mode") || "transit"; // the quick picks change it without redrawing
      if (plan.place) return go(`${path}lat=${plan.place.lat}&lng=${plan.place.lng}&mode=${mode}&from=${encodeURIComponent(plan.place.label)}${extra}`);
      if (!navigator.geolocation) return say("Your browser can’t share location. Choose a place to leave from instead.");
      const label = b.querySelector("span").firstChild, was = label.textContent;
      b.setAttribute("aria-busy", "true");
      label.textContent = "Finding you…";
      navigator.geolocation.getCurrentPosition(
        (pos) => go(`${path}lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&mode=${mode}&from=${encodeURIComponent("your location")}${extra}`),
        (err) => {
          b.removeAttribute("aria-busy");
          label.textContent = was;
          say(err.code === 1 ? "Location is blocked for this site. Allow it in your browser settings, or choose a place to leave from." : "Couldn’t get your location just now. Choose a place to leave from instead.");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    };
    btn?.addEventListener("click", () => (wiz && plan.kind !== "mass" ? findFrom(btn, `/open?kind=${plan.kind}&`, at()) : findFrom(btn, "/next?", massOpts())));
    view.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => findFrom(b, `/open?kind=${b.dataset.kind}&`, at())));
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
    const part = partOf(q.get("part"));
    if (part) params.set("part", part);
    const late = Math.min(15, Number(q.get("late")) || 0);
    if (late) params.set("late", late);
    const sunday = q.get("sunday") === "1", lang = q.get("lang") || "";
    if (sunday) params.set("sunday", "1");
    if (lang) params.set("lang", lang);
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
      const out = await R.rank({ origin, now, mode: params.get("mode"), parishes: d.parishes, events: S.expandAll(d, now - late * 60000, sunday || lang ? 7 : 2).filter(S.inPart(part)).filter(S.inLang(lang)).filter((e) => !sunday || S.forSunday(e)), lateMin: late });
      const byId = new Map(d.parishes.map((p) => [p.id, p]));
      const pack = (e) => e && { parish: byId.get(e.pid), start: e.start, leaveBy: e.leaveBy, travelMin: e.travelMin, travelSource: e.travelSource, walk: e.travelWalk, lateMin: e.lateMin || 0, distanceKm: e.distanceKm, language: e.lang, location: e.loc, note: e.note };
      return { mode: params.get("mode"), best: pack(out.best), alternatives: out.alternatives.map(pack),
        nearest: out.nearest && { parish: byId.get(out.nearest.pid), travelMin: out.nearest.travelMin, travelSource: out.nearest.travelSource, walk: out.nearest.travelWalk, next: pack(out.nearest.next) },
        around: out.around.map((a) => ({ parish: byId.get(a.pid), travelMin: a.travelMin, travelSource: a.travelSource, walk: a.travelWalk, next: pack(a.next) })) };
    }
  }

  async function renderNext(q) {
    const mode = modeOf(q.get("mode"));
    const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
    const from = q.get("from") || "your location";
    const at = parseAt(q.get("at"));
    const part = partOf(q.get("part"));
    const sunday = q.get("sunday") === "1", lang = q.get("lang") || "";
    const adj = `${sunday ? "Sunday or Sunset " : ""}${partAdj(part)}`;
    const inLang = lang ? ` in ${lang}` : "";
    const myHash = location.hash;
    const stale = () => location.hash !== myHash;
    store.set("mgw-origin", { ...origin, label: from, at: Date.now() });
    rememberPlace({ ...origin, label: from });
    // only the leave time changes here; where from and how are set on the home screen
    const bar = `<div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button>
        <span class="from">From ${esc(from)} · ${mode.label}${sunday ? " · Sunday or Sunset" : ""}${part ? ` · ${PARTS[part].label} Masses` : ""}${lang ? ` · ${esc(lang)}` : ""}</span></div>
      <div class="when one${at ? " set" : ""}"><button class="when-chip" type="button" id="when" aria-label="Leaving ${esc(whenText(at))}. Change the time">${svg(ICON.clock)}<span>${at ? `Leaving ${esc(whenText(at))}` : "Leaving now"}</span><em class="chg">Change</em></button></div>`;
    // a time change keeps the answer on screen, dimmed, until the new one arrives
    const soft = softNext && view.querySelector(".answer");
    softNext = false;
    if (soft) {
      view.querySelector(".bar").remove();
      view.querySelector(".when")?.remove();
      view.insertAdjacentHTML("afterbegin", bar);
      view.querySelectorAll(".answer, .more").forEach((el) => el.classList.add("busy"));
    } else view.innerHTML = `${bar}<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p id="step">Looking at Mass times at 32 parishes…</p></div>`;
    const stepTimer = setTimeout(() => { const el = document.getElementById("step"); if (el) el.textContent = `Checking ${mode.id === "transit" ? "bus & MRT routes" : mode.id === "drive" ? "driving routes" : "walking routes"} from ${from}…`;
    }, 900);
    if (soft) clearTimeout(stepTimer);
    // data.json only adds the source line and special-day notice; it must not
    // hold up the answer, so fetch it in parallel and patch it in when it lands.
    const d = { parishes: [], holidays: {} };
    const dataP = Promise.race([data(), new Promise((_, no) => setTimeout(no, 4000))])
      .then((loaded) => { for (const k of Object.keys(loaded || {})) d[k] = loaded[k]; })
      .catch(() => {});
    // backfill whatever depends on data.json, only if the answer is already painted
    const applyData = () => {
      const church = view.querySelector(".answer .church");
      const src = view.querySelector(".source");
      if (src && d.parishes.length) {
        const pid = church?.getAttribute("data-id");
        const p = d.parishes.find((x) => String(x.id) === String(pid)) || d.parishes[0];
        if (p) src.innerHTML = answerSource(p, Number(church?.getAttribute("data-start")) || 0);
      }
    };

    // a small photo of the church beside the time, so you know it when you see it; the credits list is tiny and
    // usually lands before the answer, and if not the photo slots into empty space without moving anything
    let photos = null;
    const thumbHTML = (p) => {
      const c = photos?.[p.id];
      if (!c) return "";
      const src = c.src && /^https?:/.test(c.src) ? c.src : `photos/thumb/${p.id}.jpg`;
      return `<button class="church-thumb" type="button" data-photo="${esc(p.id)}" aria-label="See a bigger photo of the church"><img src="${esc(src)}" alt="" width="72" height="72" decoding="async" referrerpolicy="no-referrer"></button>`;
    };
    photoCredits().then((c) => {
      photos = c;
      const row = view.querySelector(".answer .time-row"), id = view.querySelector(".answer .church")?.getAttribute("data-id");
      if (row && id && !row.querySelector(".church-thumb")) row.insertAdjacentHTML("beforeend", thumbHTML({ id }));
    });

    // Fast first frame: estimate-only answer in a few ms, then auto-refine with exact OneMap times.
    let painted = false, amap = null;
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
        view.innerHTML = `${bar}<section class="answer reveal"><h1>No ${adj}Mass${esc(inLang)} you can reach ${sunday || lang ? (at ? `within a week of ${esc(whenText(at))}` : "this week") : at ? `within two days of ${esc(whenText(at))}` : "in the next two days"}.</h1>
          <p class="lede">Try another time${part ? ", time of day" : ""}${lang ? ", language" : ""} or way of travelling, or browse the churches and their times.</p>
          <p style="margin-top:28px"><a class="btn btn-quiet" href="#/churches">Browse all churches</a></p></section>`;
        painted = true;
        return;
      }
      const start = new Date(b.start).getTime(), leave = new Date(b.leaveBy).getTime();
      const t = clockParts(start);
      const p = b.parish;
      const est = b.travelSource === "estimate";
      const meta = [S.isSunset(start) ? "Sunset Mass: counts for Sunday" : "", b.language !== "English" ? `${b.language} Mass` : "", b.note].filter(Boolean).join(" · ");
      const special = S.specialDay(start, d);
      const alt = (res.alternatives || []).filter(Boolean);
      const near = res.nearest && res.nearest.parish.id !== p.id ? res.nearest : null;
      view.innerHTML = `${bar}
        <section class="answer ${soft ? "retimed" : "reveal"}">
          <div class="day-row"><p class="day">${dayLabel(start)}${at ? (dayKey(at) === dayKey(start) && new Date(b.leaveBy).getTime() - at <= LONG_WAIT ? `, ${mins(Math.round((start - at) / 60000))} after you set off` : "") : start - Date.now() < 12 * 3600e3 ? `, ${until(start)}` : ""}</p>
            <button class="why-btn" type="button" id="why" aria-label="Why this Mass?" title="Why this Mass?">${svg(ICON.info)}</button></div>
          <div class="time-row"><p class="time">${t.hm}<small>${t.ap}</small></p>${thumbHTML(p)}</div>
          <h1 class="church" data-id="${p.id}" data-start="${start}"><a href="#/church/${p.id}" aria-label="${esc(p.name)}: Mass times and details"><span>${esc(p.name)}</span>${svg(ICON.right)}</a></h1>
          ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
          <div class="leave${at ? " plan" : ""}" id="leave">${leaveHTML(b, at, mode)}</div>
          <a class="btn btn-primary" href="${gmaps(p, tripMode(b, mode).id, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          ${est ? `<p class="est" style="text-align:center">Travel time is an estimate; checking live routes…</p>` : ""}
          ${special ? `<p class="notice">${esc(special)}: Mass times often change ${dayKey(start) === dayKey(Date.now()) ? "today" : "that day"}. Please check with the parish.</p>` : ""}
          <button class="see-more" type="button" onclick="document.getElementById('near-map').scrollIntoView({ behavior: 'smooth' })">${svg(ICON.down)}<span>${alt.length ? "More churches you can make it to" : "See it on a map"}</span></button>
        </section>
        <section class="near-map" id="near-map" aria-label="Map of the churches near you">
          <div id="map" class="answer-map"></div>
          <p class="legend"><span><i class="l-you"></i>${esc(from === "your location" ? "You" : from)}</span><span><i class="l-church"></i>Our pick</span>${alt.length || near ? `<span><i class="l-church dim"></i>In the list below</span>` : ""}${(res.around || []).some((a) => a.parish && ![p, ...alt.map((x) => x.parish), near?.parish].some((q) => q && q.id === a.parish.id)) ? `<span><i class="l-church faint"></i>Also nearby</span>` : ""}<span>Each time is the next Mass you can make there</span></p>
        </section>
        ${alt.length || near ? `<section class="more" id="more" aria-label="Other options">
          ${alt.length ? `<h2>Other churches you can make it to</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
          ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
            <a class="row" href="#/church/${near.parish.id}">${near.next ? `<span class="t">${clock(new Date(near.next.start).getTime())}<small>${dayLabel(new Date(near.next.start).getTime())}</small></span>` : `<span class="t">–</span>`}
            <span class="n">${esc(near.parish.name)}<small>${near.next ? `Leave by ${clock(new Date(near.next.leaveBy).getTime())}` : `No reachable ${adj}Mass in the next two days`}</small></span><span class="d">${mins(near.travelMin)} ${near.walk ? "walk" : "away"}</span></a></li></ul>` : ""}
        </section>` : ""}
        <p class="browse-wrap"><a class="link" href="#/churches${part ? `?part=${part}` : ""}">Browse all churches and Mass times</a></p>
        <p class="source">${answerSource(d.parishes.find((x) => x.id === p.id), start)}</p>`;
      rememberTrips(origin, mode.id, [b, ...alt, near && near.next && { ...near.next, parish: near.parish, travelMin: near.travelMin, travelSource: near.travelSource, walk: near.walk }]);
      view.focus({ preventScroll: true });
      if (at || b.lateMin > 0) clearInterval(leaveTimer); else tickLeave(start, leave, b.travelMin, est, tripMode(b, mode));
      amap = answerMap(view.querySelector("#map"), origin, from === "your location" ? "You" : from, stale);
      amap.update(res);
      // the "more churches" cue is only for when the map starts below the fold
      const moreEl = view.querySelector("#near-map"), cue = view.querySelector(".see-more");
      if (moreEl && cue && moreEl.getBoundingClientRect().top < innerHeight - 80) cue.hidden = true;
      painted = true;
    };

    // Ask for the estimate and the live answer together. Live usually lands within a couple of seconds: wait for it
    // so the answer appears once and never jumps. Only when it's slow do we show the estimate first, then settle
    // the live times in place (a gentle highlight, no repaint).
    const fullP = fetchNext(q, false).then((r) => ({ r }), (e) => ({ e }));
    const fastP = fetchNext(q, true);
    const LIVE_WAIT_MS = 2500;
    const quick = await Promise.race([fullP, new Promise((ok) => setTimeout(() => ok(null), LIVE_WAIT_MS))]);
    let liveShown = false;
    if (quick && quick.r) {
      paint(quick.r);
      liveShown = true;
    } else {
      try { paint(await fastP); } catch { /* offline; the live attempt below may also fail -> error screen */ }
    }
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
      if (leaveBox) {
        const before = leaveBox.textContent;
        leaveBox.innerHTML = leaveHTML(b, at, mode);
        // times moved a little: say so quietly rather than flicker
        if (leaveBox.textContent !== before) { leaveBox.classList.remove("updated"); void leaveBox.offsetWidth; leaveBox.classList.add("updated"); }
      }
      // drop the "checking live routes…" note once we have exact numbers
      const estNote = view.querySelector(".answer .est");
      if (estNote && !est) estNote.remove();
      if (!at && !(b.lateMin > 0)) tickLeave(new Date(b.start).getTime(), leave, b.travelMin, est, tripMode(b, mode));
      // re-render only the "other options" block with exact times (keeps the hero steady)
      const alt = (res.alternatives || []).filter(Boolean);
      const near = res.nearest && res.nearest.parish.id !== b.parish.id ? res.nearest : null;
      const more = view.querySelector("section.more");
      if (more) {
        more.innerHTML = `${alt.length ? `<h2>Other churches you can make it to</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
          ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
            <a class="row" href="#/church/${near.parish.id}">${near.next ? `<span class="t">${clock(new Date(near.next.start).getTime())}<small>${dayLabel(new Date(near.next.start).getTime())}</small></span>` : `<span class="t">–</span>`}
            <span class="n">${esc(near.parish.name)}<small>${near.next ? `Leave by ${clock(new Date(near.next.leaveBy).getTime())}` : `No reachable ${adj}Mass in the next two days`}</small></span><span class="d">${mins(near.travelMin)} ${near.walk ? "walk" : "away"}</span></a></li></ul>` : ""}`;
      }
      rememberTrips(origin, mode.id, [b, ...alt, near && near.next && { ...near.next, parish: near.parish, travelMin: near.travelMin, travelSource: near.travelSource, walk: near.walk }]);
      amap?.update(res);
    };
    if (!liveShown) {
      const full = await fullP;
      if (full.r && !stale()) refine(full.r);
    }
    // once data.json has landed, backfill the source line (and any data-dependent bits)
    await dataP;
    if (!stale()) applyData();
    // never leave the answer dimmed and unclickable, whichever frames arrived
    view.querySelectorAll(".busy").forEach((el) => el.classList.remove("busy"));
    if (!painted) {
      view.innerHTML = `${bar}<section class="answer"><h1>We couldn’t check Mass times just now.</h1>
        <p class="lede">Check your connection and try again.</p>
        <p style="margin-top:28px"><button class="btn btn-primary" type="button" onclick="window.dispatchEvent(new HashChangeEvent('hashchange'))">Try again</button></p></section>`;
    }
  }
  // the headline is "Leave by <the latest you can go>", now or planned; "Leave now" only when that's right away
  // a leave-by on another day than the one you're setting off from says which day
  const onDay = (ms, from) => {
    if (dayKey(ms) === dayKey(from)) return "";
    return dayKey(ms) === dayKey(from + DAY) ? " tomorrow" : ` on ${wk(ms, "long")}`;
  };
  const LONG_WAIT = 60 * 60000; // arriving more than an hour early isn't a plan anyone means
  function leaveHTML(b, at, mode) {
    mode = tripMode(b, mode);
    const about = b.travelSource === "estimate" ? "about " : "";
    const leave = new Date(b.leaveBy).getTime();
    const trip = `${about}${mins(b.travelMin)} ${mode.phrase}`;
    if (b.lateMin > 0) return `<strong>${at ? `Leave at ${clock(at)}` : "Leave now"}</strong><span class="late">You’ll be about ${mins(b.lateMin)} late</span><span>${trip}</span>`;
    const early = `<span class="early">You’ll arrive 5 min early, to prepare for Mass.</span>`;
    if (!at) return `<strong>${leave - Date.now() < 2 * 60000 ? "Leave now" : `Leave by ${clock(leave)}${onDay(leave, Date.now())}`}</strong><span>${trip}</span>${early}`;
    // the first Mass after your time may be hours away (late at night: tomorrow morning); then the useful
    // answer is when to set off for it, not "arrive at 10:31pm" for a 7am Mass
    if (leave - at > LONG_WAIT) return `<strong>Leave by ${clock(leave)}${onDay(leave, at)}</strong><span>${trip}</span><span>First Mass after ${esc(whenText(at))}</span>`;
    // the headline is always the latest you can leave; your planned time is said underneath
    return `<strong>Leave by ${clock(leave)}${onDay(leave, at)}</strong><span>${trip}</span>` +
      (leave - at >= 5 * 60000 ? `<span>Leaving at ${clock(at)} gets you there by ${about}${clock(at + b.travelMin * 60000)}</span>` : "") + early;
  }
  // changing the leave time on the answer screen rewrites the link in place (no history entry per tap) and re-ranks
  let softNext = false;
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
    if (e.target.closest("#when")) openTimeSheet(cur, setLeaveAt);
    const ph = e.target.closest("[data-photo]");
    if (ph) openPhoto(ph.dataset.photo, view.querySelector(".answer .church span")?.textContent || "The church");
    if (e.target.closest("#why")) {
      const q = new URLSearchParams(location.hash.split("?")[1] || "");
      openWhySheet({ from: q.get("from") || "your location", mode: modeOf(q.get("mode")), at: cur, part: partOf(q.get("part")), sunday: q.get("sunday") === "1", lang: q.get("lang") || "" });
    }
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
        box.innerHTML = `<strong>Time to leave</strong><span>${trip}</span><span class="early">You’ll arrive 5 min early, to prepare for Mass.</span>`;
        document.querySelector(".answer .btn-primary")?.classList.add("go-now");
      } else if (m <= 60) {
        box.innerHTML = `<strong>Leave by ${clock(leave)}</strong><span>in ${mins(m)} · ${trip}</span><span class="early">You’ll arrive 5 min early, to prepare for Mass.</span>`;
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
    if (sc) return `Times from ${mc}, checked daily. The <a href="${esc(sc.url)}" target="_blank" rel="noopener">parish website</a> lists some different times; check it before you go.`;
    return `Times from ${mc}, checked daily.`;
  }

  // Under an answer: say where the time comes from, and warn only when it matters for *this* Mass, i.e. the parish's
  // own website doesn't list it. (A general "some times differ" made people doubt answers that were fine.)
  function answerSource(p, start) {
    if (!p) return "";
    const src = p.source || {};
    const mc = `<a href="${esc(src.url || "#")}" target="_blank" rel="noopener">myCatholicSG</a>`;
    const rules = p.info?.rules;
    if (rules?.length && start) {
      const day = S.sgtDay(start).getTime() - S.SGT_OFFSET_MS;
      const listed = S.expandParish(String(p.id), { rules: { [p.id]: rules }, dated: {} }, day, 0).some((e) => e.start === start);
      if (!listed) return `<span class="late">This time isn’t on the <a href="${esc(p.info.url || p.website || "#")}" target="_blank" rel="noopener">parish website</a>.</span> Please check with the parish before you go. Times from ${mc}.`;
    }
    return `Times from ${mc}, checked daily. Please confirm feast days with the parish.`;
  }

  function row(a, mode) {
    const s = new Date(a.start).getTime();
    return `<li><a class="row" href="#/church/${a.parish.id}">
      <span class="t">${clock(s)}<small>${dayLabel(s)}</small></span>
      <span class="n">${esc(a.parish.name)}${S.isSunset(s) ? `<span class="tag">Sunset</span>` : ""}${a.language !== "English" ? `<span class="tag">${esc(a.language)}</span>` : ""}<small>${a.lateMin > 0 ? `<span class="late">Leave now · ${mins(a.lateMin)} late</span>` : `Leave by ${clock(new Date(a.leaveBy).getTime())}`}</small></span>
      <span class="d">${mins(a.travelMin)} ${a.walk ? "walk" : "away"}</span></a></li>`;
  }

  // ---------- Adoration or Confession (#/open?kind=adoration&lat=..&lng=..&mode=..) ----------
  // Same shape as the Mass answer, worded for a room that is open for a while, or Confession before a Mass.
  const KIND = {
    adoration: { title: "Adoration", looking: "Adoration rooms", none: "an Adoration room open", days: "in the next two days" },
    confession: { title: "Confession", looking: "Confession times", none: "Confession", days: "in the next week" },
  };
  async function fetchOpen(q, kind, fast) {
    const params = new URLSearchParams({ lat: q.get("lat"), lng: q.get("lng"), mode: q.get("mode") || "transit", kind });
    const at = parseAt(q.get("at"));
    if (at) params.set("at", at);
    if (fast) params.set("fast", "1");
    try {
      const r = await fetch(`api/next?${params}`, { cache: "no-store", signal: AbortSignal.timeout(fast ? 4000 : 12000) });
      if (r.status === 400) return { outside: true };
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      // offline or API down: the same answer worked out here, travel times estimated
      const d = await data();
      const X = window.MassServices, now = at ?? Date.now();
      const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
      const out = await X.rankOpen({ origin, now, mode: params.get("mode"), parishes: d.parishes, windows: X.expandAllServices(d, kind, now), fast: true });
      const byId = new Map(d.parishes.map((p) => [p.id, p]));
      const pack = (e) => e && { ...e, parish: byId.get(e.pid), walk: e.travelWalk, location: e.loc, source: e.from };
      return { kind, best: pack(out.best), alternatives: out.alternatives.map(pack), checked: d.services?.checked,
        unconfirmed: X.unconfirmed(d, kind).map((x) => ({ parish: byId.get(x.pid), text: x.text })) };
    }
  }
  async function renderOpen(q) {
    const kind = KIND[q.get("kind")] ? q.get("kind") : "adoration", K = KIND[kind];
    clearInterval(leaveTimer); // a Mass answer's countdown must not write into this screen's leave box
    const mode = modeOf(q.get("mode"));
    const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
    const from = q.get("from") || "your location";
    const at = parseAt(q.get("at"));
    const myHash = location.hash, stale = () => location.hash !== myHash;
    store.set("mgw-origin", { ...origin, label: from, at: Date.now() });
    rememberPlace({ ...origin, label: from });
    const bar = `<div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button>
        <span class="from">${K.title} · From ${esc(from)} · ${mode.label}${at ? ` · leaving ${esc(whenText(at))}` : ""}</span></div>`;
    view.innerHTML = `${bar}<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p>Looking at ${K.looking} at 32 parishes…</p></div>`;
    const ms = (v) => (v == null ? null : new Date(v).getTime());
    const t0 = () => at ?? Date.now();
    // Today / Tomorrow / Sat 3 Oct, as on the calendar; "now" words only when you're going now, else your planned time
    const rel = (x) => { const l = dayLabel(x); return l === "Today" || l === "Tomorrow" ? l : `${wk(x)} ${dnum(x)}`; };
    const goNow = at ? `Leave at ${clock(at)}` : "Leave now";
    // the headline: open now, or when it opens (or starts)
    const when = (b) => {
      const start = ms(b.start), end = ms(b.end);
      if (b.type === "session") return { day: `${rel(start)} · ${b.name || K.title}`, time: clockParts(start), pre: "" };
      if (start <= t0()) return { day: `${at ? "Open when you get there" : "Open now"}${dayKey(end) !== dayKey(t0()) ? ` · closes ${rel(end).replace(/^To/, "to")}` : ""}`, time: clockParts(end), pre: "until " };
      return { day: `${rel(start)} · ${kind === "adoration" ? "open" : "Confession"} until ${clock(end)}`, time: clockParts(start), pre: kind === "adoration" ? "opens " : "" };
    };
    const leaveBox = (b) => {
      const tm = tripMode(b, mode), about = b.travelSource === "estimate" ? "about " : "";
      const trip = `${about}${mins(b.travelMin)} ${tm.phrase}`;
      const leaveAt = ms(b.leaveAt), leaveBy = ms(b.leaveBy), start = ms(b.start), lastIn = ms(b.lastIn);
      const now = t0(), day = (x) => onDay(x, now);
      const soonNow = leaveAt - now < 2 * 60000;
      if (b.type === "session") return `<strong>${soonNow ? goNow : `Leave by ${clock(leaveBy)}${day(leaveBy)}`}</strong><span>${trip}</span><span class="early">You’ll arrive 5 min before it starts.</span>`;
      // the latest you could arrive, said the same way whether it has opened or not; no "leave as late as": for
      // Confession that only sets you up to miss it (a queue, and it stops when Mass begins)
      const stay = kind === "adoration" ? `Get there by ${clock(lastIn)}${day(lastIn)} to have at least 20 minutes before it closes.`
        : `Get there by ${clock(lastIn)}: Confession ends at ${clock(ms(b.end))}, and there may be a queue.`;
      if (start <= now + b.travelMin * 60000) {
        return `<strong>${soonNow ? goNow : `Leave at ${clock(leaveAt)}`}</strong><span>${trip}, arriving ${about}${clock(ms(b.arrive))}</span><span class="early">${stay}</span>`;
      }
      // Confession not started yet: the latest you can leave is set by when it opens (be there at the start: the queue
      // forms early and it stops when Mass begins); an Adoration room you can come to any time before it closes
      if (kind === "confession") return `<strong>${soonNow ? goNow : `Leave by ${clock(leaveAt)}${day(leaveAt)}`}</strong><span>${trip}, arriving as it starts at ${clock(start)}</span><span class="early">Confession ends at ${clock(ms(b.end))}, and there may be a queue.</span>`;
      return `<strong>Leave at ${clock(leaveAt)}${day(leaveAt)}</strong><span>${trip}, arriving as it opens</span><span class="early">${stay}</span>`;
    };
    const meta = (b) => [kind === "confession" && b.mass ? `Before the ${clock(ms(b.mass))} Mass` : "", b.location, b.type === "session" ? "" : b.name, b.note].filter(Boolean);
    const altRow = (a) => {
      const start = ms(a.start), open = a.type === "open" && start <= t0();
      return `<li><a class="row" href="#/church/${a.parish.id}">
        <span class="t">${open ? `Open<small>until ${clock(ms(a.end))}</small>` : `${clock(start)}<small>${rel(start)}</small>`}</span>
        <span class="n">${esc(a.parish.name)}<small>${a.type === "session" ? esc(a.name || "") : a.mass ? `Before the ${clock(ms(a.mass))} Mass` : `Arrive ${clock(ms(a.arrive))}`}</small></span>
        <span class="d">${mins(a.travelMin)} ${a.walk ? "walk" : "away"}</span></a></li>`;
    };
    const paint = (res) => {
      if (stale()) return;
      if (res.outside) {
        view.innerHTML = `${bar}<section class="answer"><h1>That’s outside Singapore.</h1><p class="lede">MassGoWhere covers Singapore’s 32 parishes. Search for a Singapore postal code or place instead.</p>
          <p style="margin-top:28px"><a class="btn btn-quiet" href="#/">Back to search</a></p></section>`;
        return;
      }
      const b = res.best;
      // churches that mention it without clear times are still possible places to go: listed, open, nearest first
      const near = (x) => (x.parish.lat != null ? R.haversineKm(origin, x.parish) : 1e9);
      const unsure = (res.unconfirmed || []).length ? `<section class="rest unsure"><h2>Also possible: check the parish website</h2>
          <p class="muted">These parishes have ${kind === "adoration" ? "an Adoration room" : "Confession"} but don’t clearly say when it’s open. Check their website before you go.</p>
          <ul class="rows">${[...res.unconfirmed].sort((a, b) => near(a) - near(b)).map((x) => `<li><a class="row row-church" href="#/church/${x.parish.id}"><span class="n">${esc(x.parish.name)}<small class="times">${esc(x.text)}</small></span></a>${x.parish.website ? `<a class="btn btn-quiet" href="${esc(x.parish.website)}" target="_blank" rel="noopener"><span>Website</span></a>` : ""}</li>`).join("")}</ul></section>` : "";
      const browse = `<p class="browse-wrap"><a class="btn btn-quiet browse" href="#/churches?view=list&filters=1&what=${kind}">${svg(ICON.map)}<span>${K.title} times at every church</span></a></p>`;
      if (!b) {
        view.innerHTML = `${bar}<section class="answer reveal"><h1>No ${K.none} you can reach ${K.days}.</h1>
          <p class="lede">Try another way of travelling, or look at the times at every church.</p></section>${unsure}${browse}`;
        return;
      }
      const p = b.parish, w = when(b), alt = (res.alternatives || []).filter(Boolean);
      const special = res.specialDay ?? S.specialDay(ms(b.start), null);
      const src = b.source === "myCatholicSG" ? `<a href="https://mycatholic.sg/parish/${esc(p.link || "")}" target="_blank" rel="noopener">myCatholicSG</a>`
        : b.source === "reported" ? "a report to MassGoWhere, not yet on the parish website"
        : `the <a href="${esc(p.website || `#/church/${p.id}`)}" target="_blank" rel="noopener">parish website</a>`;
      view.innerHTML = `${bar}
        <section class="answer reveal">
          <div class="day-row"><p class="day">${esc(w.day)}</p></div>
          <p class="time">${w.pre ? `<small class="pre">${w.pre}</small>` : ""}${w.time.hm}<small>${w.time.ap}</small></p>
          <h1 class="church" data-id="${p.id}"><a href="#/church/${p.id}" aria-label="${esc(p.name)}: times and details"><span>${esc(p.name)}</span>${svg(ICON.right)}</a></h1>
          ${meta(b).length ? `<p class="meta">${meta(b).map(esc).join(" · ")}</p>` : ""}
          <div class="leave" id="leave">${leaveBox(b)}</div>
          <a class="btn btn-primary" href="${gmaps(p, tripMode(b, mode).id, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          ${b.travelSource === "estimate" ? `<p class="est" style="text-align:center">Travel time is an estimate; checking live routes…</p>` : ""}
          ${special ? `<p class="notice">${esc(special)}: times often change that day. Please check with the parish.</p>` : ""}
          ${kind === "confession" ? `<p class="muted">Confession depends on a priest being free, so it can start late or end early.</p>` : ""}
        </section>
        <section class="near-map" id="near-map" aria-label="Map of the churches you can get to">
          <div id="map" class="answer-map"></div>
          <p class="legend"><span><i class="l-you"></i>${esc(from === "your location" ? "You" : from)}</span><span><i class="l-church"></i>Our pick</span>${alt.length ? `<span><i class="l-church dim"></i>In the list below</span>` : ""}<span>${kind === "adoration" ? "“Open”, or the time it opens" : "When Confession starts, or “Open” if it already has"}</span></p>
        </section>
        ${alt.length ? `<section class="more" aria-label="Other options"><h2>Other churches you can get to</h2><ul class="rows">${alt.map(altRow).join("")}</ul></section>` : ""}
        ${unsure}${browse}
        <p class="source">Times from ${src}${res.checked ? `, checked ${fmtDate(res.checked)}` : ""}. Parishes change them; check with the parish before you go.</p>`;
      // the same map as a Mass answer: "Open" where it's open when you'd arrive, else when it opens or starts
      const openOn = (e) => e.type === "open" && ms(e.start) <= t0(); // as the list says it: open now
      answerMap(view.querySelector("#map"), origin, from === "your location" ? "You" : from, stale, {
        pin: (e) => (openOn(e) ? "Open" : clock(ms(e.start))),
        line: (e) => `${e.type === "session" ? `${esc(e.name || K.title)} ${clock(ms(e.start))} ${esc(rel(ms(e.start)).toLowerCase())}`
          : openOn(e) ? `Open until ${clock(ms(e.end))}` : `${rel(ms(e.start))} ${clock(ms(e.start))} to ${clock(ms(e.end))}`} · leave ${kind === "confession" && !openOn(e) ? "by" : "at"} ${clock(ms(e.leaveAt))}`,
        link: "Times and details",
      }).update(res);
      view.focus({ preventScroll: true });
    };
    // as on the Mass answer: wait briefly for live routes, else show the estimate and repaint once live arrives
    const fullP = fetchOpen(q, kind, false).then((r) => ({ r }), (e) => ({ e }));
    const quick = await Promise.race([fullP, new Promise((ok) => setTimeout(() => ok(null), 2500))]);
    if (quick && quick.r) return paint(quick.r);
    try { paint(await fetchOpen(q, kind, true)); } catch { /* the live call may still work */ }
    const full = await fullP;
    if (full.r) paint(full.r);
    else if (!view.querySelector(".answer")) view.innerHTML = `${bar}<section class="answer"><h1>We couldn’t check just now.</h1><p class="lede">Check your connection and try again.</p></section>`;
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

  // who took each church photo (public/photos/credits.json, written by scripts/fetch_photos.py); a church without one shows none
  let photosP = null;
  const photoCredits = () => (photosP ||= fetch("photos/credits.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  // the credit line, as on the church page: the parish's own photo, or a licensed one from Flickr or Wikimedia Commons
  const photoCaption = (c) => (!c.license
    ? `Photo: <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.author)}</a> (${esc(c.via || "parish website")})`
    : `Photo: ${esc(c.author)}, <a href="${esc(c.licenseUrl || c.page)}" target="_blank" rel="noopener">${esc(c.license)}</a> · <a href="${esc(c.page)}" target="_blank" rel="noopener">${/flickr/.test(c.page) ? "Flickr" : "Wikimedia Commons"}</a>`);
  // the answer's small photo, full size over the page; a tap anywhere but the credit link (or Esc) closes it
  function openPhoto(id, name) {
    photoCredits().then((all) => {
      const c = all[id];
      if (!c) return;
      const dlg = document.createElement("dialog");
      dlg.className = "photo-view";
      dlg.innerHTML = `<figure><img src="${esc(c.src || `photos/${id}.jpg`)}" alt="${esc(name)}" referrerpolicy="no-referrer">
        <figcaption><strong>${esc(name)}</strong><span>${photoCaption(c)}</span></figcaption></figure>
        <button class="photo-close" type="button" aria-label="Close">${svg(ICON.x)}</button>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (!e.target.closest("a")) dlg.close(); });
      dlg.addEventListener("close", () => dlg.remove());
      dlg.showModal();
    });
  }
  async function renderChurch(id) {
    const h = location.hash;
    const [d, info, photos] = await Promise.all([loadData(), parishInfo(id), photoCredits()]);
    if (!d || location.hash !== h) return;
    const p = d.parishes.find((x) => x.id === id);
    if (!p) return go("/churches");
    const origin = store.get("mgw-origin");
    const mode = store.get("mgw-mode") || "transit";
    const now = Date.now();
    const evs = S.expandParish(String(id), d, now, 7);
    // a Mass the parish's bulletin or website says is off that day: kept in the list (times stay myCatholicSG's), marked
    const hm = (ms) => new Date(ms).toLocaleTimeString("en-GB", { ...TZ, hour: "2-digit", minute: "2-digit" });
    // (only a reviewed read may strike one off; the automatic bulletin read is listed under "Changes" instead)
    const key = (e) => `${dayKey(e.start)} ${hm(e.start)}`;
    const offs = new Set((info?.dated || []).filter((x) => x.action === "cancel" && x.reviewed).map((x) => `${x.date} ${x.time}`));
    const isOff = (e) => offs.has(key(e));
    // The parish website's own regular Masses next to myCatholicSG's: a time on both shows once; a time on only one is
    // marked with where it comes from (tap for details). Answers and "Next Mass" still use myCatholicSG only.
    const siteEvs = info?.rules?.length ? S.expandParish(String(id), { rules: { [id]: info.rules }, dated: {} }, now, 7) : [];
    const lang = (l) => (l || "English").toLowerCase().replace(/^bahasa /, "").replace(/^indonesian$/, "indonesia");
    const siteBy = new Map(siteEvs.map((e) => [key(e), e]));
    const listEvs = !siteEvs.length ? evs : [...evs.map((e) => {
      const s = siteBy.get(key(e));
      siteBy.delete(key(e));
      return { ...e, src: s ? "both" : "mc", siteLang: s && lang(s.lang) !== lang(e.lang) ? s.lang : "" };
    }), ...[...siteBy.values()].map((e) => ({ ...e, src: "site" }))].sort((a, b) => a.start - b.start);
    const siteAt = info?.readAt?.[info?.from?.rules];
    const srcNote = { site: `On the parish website (read ${siteAt ? fmtDate(siteAt) : "recently"}), not on myCatholicSG. Check with the parish before you go.`,
      mc: `On myCatholicSG, not on the parish website. Check with the parish before you go.` };
    const srcTag = (e) => (e.src === "site" || e.src === "mc" ? `<button class="src" type="button" aria-expanded="false">${e.src === "site" ? "Parish website" : "myCatholicSG"}</button><span class="x src-note" hidden>${srcNote[e.src]}</span>` : "");
    const days = new Map();
    for (const e of listEvs) {
      const k = dayLabel(e.start);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(e);
    }
    // the next Mass you can still make here, if we know where you are (estimated trip)
    const X = window.MassServices, rel = (x) => { const l = dayLabel(x); return l === "Today" || l === "Tomorrow" ? l.toLowerCase() : `${wk(x)} ${dnum(x)}`; };
    const glance = (kind) => {
      const spec = d.services?.parishes?.[id]?.[kind];
      if (!spec) return "";
      const w = X.expandServices(String(id), d, kind, now, X.HORIZON_DAYS[kind]).find((x) => (x.type === "session" ? x.start : x.end) > now);
      const title = kind === "adoration" ? "Adoration" : "Confession";
      let text;
      if (w && w.type === "open" && w.start <= now) text = `${title} now, until ${clock(w.end)}`;
      else if (w && w.type === "open") text = `${title} ${rel(w.start)} ${clock(w.start)}–${clock(w.end)}${w.mass ? `, before the ${clock(w.mass)} Mass` : ""}`;
      else if (w) text = `${w.name || title} ${rel(w.start)} ${clock(w.start)}`;
      if (spec.unconfirmed) text = `${text ? `${text}. ` : ""}${title}: times not clear, check with the parish`;
      return text ? `<li>${svg(ICON[kind])}<span>${esc(text)}</span></li>` : "";
    };
    const glanceHTML = [glance("adoration"), glance("confession")].join("");
    let lead = "";
    if (origin) {
      const t = tripTo(p, origin, mode), about = t.source === "estimate" ? "about " : "";
      const n = evs.find((e) => !isOff(e) && e.start - (t.minutes + R.BUFFER_MIN) * 60000 >= now);
      if (n) lead = `<div class="next-here"><strong>Next Mass you can attend: ${clock(n.start)} ${dayLabel(n.start).toLowerCase()}</strong>
        <span>Leave by ${clock(n.start - (t.minutes + R.BUFFER_MIN) * 60000)} · ${about}${mins(t.minutes)} ${tripMode(t, modeOf(mode)).phrase}</span></div>`;
    }
    // the parish's own website (31 of 32 list one); the one without keeps the call button
    const site = p.website || (p.siteCheck && p.siteCheck.url) || "";
    const langTag = (e) => (e.lang && e.lang !== "English" ? `<span class="tag">${esc(e.lang)}</span>` : "");
    // one row a day: the day on the left, its times in an even grid beside it, each with its language or place in
    // small type underneath. A time with more to say (a note, a cancellation, a source marker) takes a line of its own.
    const quiet = (x) => (/[a-z]/.test(x) ? x : x.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())); // "CHAPEL" -> "Chapel"
    const dayList = ([k, es]) => {
      const [d1, d2] = k.split(", ");
      return `<div class="mass-day"><h3 title="${esc(k)}">${esc(d2 ? d1.slice(0, 3) : d1)}${d2 ? `<small>${esc(d2)}</small>` : ""}</h3><ul>${es.map((e) => {
        const place = e.loc && !/^main church$/i.test(e.loc) ? quiet(e.loc) : "";
        const sub = [e.lang && e.lang !== "English" ? e.lang : "", place].filter(Boolean).map(esc).join(" · ");
        const wide = isOff(e) || srcTag(e) || e.siteLang || e.note || sub.length > 14;
        const sunset = S.isSunset(e.start);
        if (!wide) return `<li><span class="t">${clock(e.start)}</span>${sub || sunset ? `<span class="x">${[sub, sunset && "Sunset"].filter(Boolean).join(" · ")}</span>` : ""}</li>`;
        const bits = [place && esc(place), e.note && esc(e.note)].filter(Boolean).join(" · ");
        return `<li class="wide${isOff(e) ? " off" : ""}"><span class="t">${clock(e.start)}</span>${S.isSunset(e.start) ? `<span class="tag">Sunset</span>` : ""}${langTag(e)}${isOff(e) ? `<span class="tag">Cancelled by the parish</span>` : ""}${srcTag(e)}${bits ? `<span class="x">${bits}</span>` : ""}${e.siteLang ? `<span class="x">Parish website says ${esc(e.siteLang)}</span>` : ""}</li>`;
      }).join("")}</ul></div>`;
    };
    const all = [...days];
    const soon = all.slice(0, 2), rest = all.slice(2);
    // notes that only restate a language already tagged on the rows add nothing
    // Confession, Adoration and devotions, where myCatholicSG lists them (about a third of parishes do)
    const SERVICES = [["Confession", "Confession"], ["Adoration", "Adoration"], ["Devotion", "Devotions"]];
    // What the parish's own website says (Adoration room hours, Holy Hour, Confession, devotions, office hours) reads
    // better than myCatholicSG's single start times, so it replaces those lists once a parish has been read.
    const lines = (v) => [].concat(v || []).map((x) => esc(x.text)).join("<br>");
    const dl = (rows) => { const r = rows.filter(([, v]) => v); return r.length ? `<dl class="info">${r.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""; };
    // what a visitor comes for stays open (Adoration, Confession, holiday Masses); the rest is folded, so the page stays short
    const rowsOf = (list) => (info ? list.map(([k, v]) => [k, lines(v)]).filter(([, v]) => v) : []);
    const infoRows = rowsOf([["Adoration", info?.adoration], ["Confession", info?.confession], ["Public holidays", info?.public_holidays]]);
    const moreRows = rowsOf([["Devotions", info?.devotions], ["Church open", info?.church_hours], ["Parish office", info?.office_hours],
      ["Languages", info?.languages], ["Good to know", info?.good_to_know]]);
    const infoHTML = (infoRows.length ? `<h2>At this parish</h2>${dl(infoRows)}` : "") +
      (moreRows.length ? `<details class="rest"><summary>More about this parish</summary>${dl(moreRows)}</details>` : "");
    const covered = new Set([info?.adoration && "Adoration", info?.confession && "Confession", info?.devotions?.length && "Devotion"].filter(Boolean));
    // dated items from the parish's bulletin and posters, from today on (the read ages; the page shouldn't)
    const today = dayKey(now);
    const at = (x) => Date.parse(`${x.date}T${x.time || "00:00"}:00+08:00`);
    const ahead = (xs) => (xs || []).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x.date) && x.date >= today).sort((a, b) => at(a) - at(b));
    const changes = ahead(info?.dated);
    const changesHTML = changes.length ? `<div class="week services"><h2>Changes to the usual Masses</h2><ul>${changes.map((x) => {
      const bits = [x.location, x.language].filter(Boolean).map(esc).join(" · ");
      return `<li><span class="t">${x.time ? clock(at(x)) : ""}</span><span>${esc(dayLabel(at(x)))}${x.action === "cancel" ? `<span class="tag">Cancelled</span>` : ""}
        <span class="x">${esc(x.title)}${bits ? ` · ${bits}` : ""}</span></span></li>`;
    }).join("")}</ul><p class="x">${changes.every((x) => x.reviewed) ? "From the parish’s bulletin and website." : `Read automatically from the parish’s ${info.bulletin ? `<a href="${esc(info.bulletin.url)}" target="_blank" rel="noopener">latest bulletin</a>` : "bulletin"} and website.`} Check with the parish before you go.</p></div>` : "";
    // this week's bulletin: myCatholicSG's, else the one on the parish website (scripts/fetch_bulletins.py, daily). Its
    // age is judged here, so an old one is never called current; none from the last three weeks says so plainly.
    // aged by the Sunday its title names when that is older than the upload ("September 20", posted 27 Sep)
    const b = p.bulletin, bAge = b?.date ? Math.round((Date.parse(today) - Date.parse(b.for || b.date)) / 864e5) : Infinity;
    const bWhere = b?.from === "website" ? "the parish website" : "myCatholicSG";
    const bDate = (v) => `${fmtDate(`${v}T12:00:00+08:00`)}${v.slice(0, 4) !== today.slice(0, 4) ? ` ${v.slice(0, 4)}` : ""}`;
    const bTitle = b?.title && !/_|\.pdf$/i.test(b.title) ? b.title : ""; // a file name says nothing new
    const ext = (url, label, cls = "btn btn-primary") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
    const bulletinHTML = b && bAge <= 21
      ? `<div class="bulletin"><div><strong>${bAge <= 9 ? "This week’s bulletin" : "Latest bulletin"}</strong>
          <span>${[bTitle && esc(bTitle), `${b.from === "website" ? "Dated" : "Posted"} ${bDate(b.date)} on ${bWhere}`].filter(Boolean).join(" · ")}</span>
          ${b.page && b.from !== "website" ? ext(b.page, "Earlier bulletins", "earlier") : ""}</div>
          ${ext(b.url, bAge <= 9 ? "This week" : "Open")}</div>`
      : `<div class="bulletin none"><div><strong>No current bulletin online</strong>
          <span>${b ? `The last one, on ${bWhere}, is from ${bDate(b.date)}. ` : ""}Check the parish’s own website for this week’s news.</span></div>
          ${ext(site || p.source.url, site ? "Website" : "myCatholicSG", "btn btn-quiet")}</div>`;
    const events = ahead(info?.events);
    const eventLi = (x) => `<li><span class="t">${esc(dnum(at(x)))}</span><span><strong>${esc(x.title)}</strong>
      <span class="x">${[x.time ? `${wk(at(x))} ${clock(at(x))}` : wk(at(x)), x.text].filter(Boolean).map(esc).join(" · ")}${x.url ? ` <a href="${esc(x.url)}" target="_blank" rel="noopener">More</a>` : ""}</span></span></li>`;
    // parish events (talks, retreats, feasts) are nice to know but not why you opened the page: folded with the rest
    const eventsHTML = events.length ? `<details class="rest"><summary>Parish events coming up (${events.length})</summary><ul class="events">${events.map(eventLi).join("")}</ul></details>` : "";
    // everything else, folded so the times stay near the top
    const c = info?.contacts || {};
    const tel = (n) => `<a href="tel:${esc(n.replace(/[^\d+]/g, ""))}">${esc(n)}</a>`;
    const contactHTML = dl([["Phone", c.phone && tel(c.phone)], ["WhatsApp", c.whatsapp && esc(c.whatsapp)],
      ["Email", c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`]]);
    const fold = (title, body) => (body ? `<details class="rest"><summary>${title}</summary>${body}</details>` : "");
    const linkOut = (x, label) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
    const more = info ? [
      fold("Getting there", dl([["Parking and transport", lines(info.getting_there)], ["Accessibility", lines(info.accessibility)]])),
      fold("Sacraments", info.sacraments ? dl(info.sacraments.map((x) => [esc(x.topic || "Sacraments"), `${esc(x.text)}${x.contact ? `<br><span class="x">Contact: ${esc(x.contact)}</span>` : ""}`])) : ""),
      fold("Groups and ministries", info.ministries ? dl(info.ministries.map((x) => [esc(x.name || ""), x.text !== x.name ? esc(x.text) : ""]).filter(([k]) => k)) : ""),
      fold("Contact the parish", contactHTML + dl([
        ["Livestream", info.livestream && `${esc(info.livestream.text)}${info.livestream.url ? ` ${linkOut(info.livestream, "Watch")}` : ""}`],
        ["Online", info.social && info.social.map((x) => linkOut(x, x.platform)).join(" · ")],
        ["Also", lines(info.other)]])),
    ].join("") : "";
    const readAt = info && Object.values(info.readAt || {}).filter(Boolean).sort().pop();
    const infoSource = info ? `<p class="x">From the <a href="${esc(info.url || p.website || "")}" target="_blank" rel="noopener">parish website</a>${info.bulletin ? " and bulletin" : ""}${readAt ? `, read ${fmtDate(readAt)}` : ""}.</p>` : "";
    const services = infoHTML + SERVICES.filter(([type]) => !covered.has(type)).map(([type, title]) => {
      const es = S.expandParish(String(id), d, now, 7, [type]);
      if (!es.length) return "";
      // a note every row shares ("Subject to availability of priest") is said once, under the list
      const shared = es.every((e) => e.note && e.note === es[0].note) ? es[0].note : "";
      return `<h2>${title}</h2><ul>${es.map((e) => {
        const bits = [e.loc && !/^main church$/i.test(e.loc) ? esc(e.loc) : "", !shared && e.note ? esc(e.note) : ""].filter(Boolean).join(" · ");
        return `<li><span class="t">${clock(e.start)}</span><span>${esc(dayLabel(e.start))}${langTag(e)}${bits ? `<span class="x">${bits}</span>` : ""}</span></li>`;
      }).join("")}</ul>${shared ? `<p class="x">${esc(shared)}</p>` : ""}`;
    }).join("") + eventsHTML + more + infoSource;
    const notes = (p.notes || []).filter((n) => !/^(all )?(saturday|sunday|weekday|masses?)\b.*\b(is|are) in (english|mandarin|tamil|tagalog|indonesian)/i.test(n) && !/unless (otherwise )?(indicated|stated)/i.test(n));
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="history.length > 1 ? history.back() : (location.hash='#/')">${svg(ICON.back)}</button></div>
      <section class="church-page">
        ${photos[id] ? `<figure class="church-photo"><img src="${esc(photos[id].src || `photos/${id}.jpg`)}" referrerpolicy="no-referrer" alt="${esc(p.name)}" width="960" height="600" decoding="async">
          <figcaption>${photoCaption(photos[id])}</figcaption></figure>` : ""}
        <h1>${esc(p.name)}</h1>
        <p class="addr">${esc(p.address)}, Singapore ${esc(p.postal || "")}</p>
        ${lead}
        ${glanceHTML ? `<ul class="glance">${glanceHTML}</ul>` : ""}
        <div class="acts" style="margin-top:${lead || glanceHTML ? 14 : 0}px">
          <a class="btn btn-primary" href="${gmaps(p, mode, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          ${site ? `<a class="btn btn-quiet" href="${esc(site)}" target="_blank" rel="noopener" aria-label="Parish website (opens in a new tab)">${svg(ICON.globe)}<span>Website</span></a>`
            : p.phone ? `<a class="btn btn-quiet" href="tel:${esc(p.phone.replace(/\s/g, ""))}" aria-label="Call the parish">${svg(ICON.phone)}</a>` : ""}
        </div>
        <div class="week">
          <h2 class="sr-only">Mass times this week</h2>
          ${soon.map(dayList).join("") || `<p class="lede">No Masses listed for the coming week. Please check with the parish.</p>`}
          ${rest.length ? `<details class="rest"><summary>Rest of the week</summary>${rest.map(dayList).join("")}</details>` : ""}
        </div>
        ${bulletinHTML}
        ${changesHTML}
        ${services ? `<div class="week services">${services}</div>` : ""}
        ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
        ${all.some(([, es]) => S.specialDay(es[0].start, d)) ? `<p class="notice">${esc(all.map(([, es]) => S.specialDay(es[0].start, d)).filter(Boolean)[0])} is coming up: times that day may differ. Please check with the parish.</p>` : ""}
        <p class="report">Something wrong or out of date? <button class="link" type="button" data-report="${esc(p.name)}">Tell us</button></p>
        <p class="source">${siteEvs.length ? `Times from myCatholicSG and the parish website; a time only one of them lists is marked. ` : sourceLine(p)}${!p.siteCheck && p.website ? ` Parish website: <a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>.` : ""}</p>
      </section>`;
    // a source marker opens its note in place (a hover tooltip never shows on a phone)
    view.querySelectorAll(".week button.src").forEach((b) => b.addEventListener("click", () => {
      const open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open));
      b.nextElementSibling.hidden = !open;
    }));
  }

  // ---------- a Mass on the way (#/way) ----------
  // You're going from A to B; which Mass can you fit in along the way? The form keeps its choices while you look at
  // answers; the answer's link carries them all (#/way?from=lat,lng&to=lat,lng&...), so it can be shared.
  const trip = { from: null, to: null, at: null, by: null };
  const pt = (p) => `${p.lat},${p.lng}`;
  const readPt = (v, label) => { const [lat, lng] = String(v || "").split(",").map(Number); return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label } : null; };
  const gdir = (a, b, mode) => `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${modeOf(mode).gmaps}`;

  function renderWay(q) {
    if (q.get("to")) return renderWayAnswer(q);
    const mode = store.get("mgw-mode") || "transit";
    if (trip.at != null && trip.at <= Date.now()) trip.at = null;
    if (trip.by != null && trip.by <= (trip.at ?? Date.now())) trip.by = null;
    const row = (id, label, value, empty) => `<li><button type="button" id="${id}"><span class="k">${label}</span><span class="v${empty ? " empty" : ""}">${esc(value)}</span>${svg(ICON.right, "go")}</button></li>`;
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button></div>
      <section class="way-form">
        <div class="intro"><h1>Catch a Mass on the way</h1>
          <p class="lede">Going somewhere? We’ll find a Mass you can stop at along the way.</p></div>
        <ul class="settings" aria-label="Your trip">
          ${row("w-from", "From", trip.from ? trip.from.label : "My location")}
          ${row("w-to", "To", trip.to ? trip.to.label : "Choose where you’re going", !trip.to)}
          ${row("w-at", "Leaving", trip.at == null ? "Now" : whenText(trip.at))}
          ${row("w-by", "Be there by", trip.by == null ? "No rush" : whenText(trip.by))}
          ${row("w-mode", "Travel by", modeOf(mode).label)}
          ${row("w-late", "OK to be a bit late?", store.get("mgw-late") ? "Yes, up to 15 min" : "No")}
        </ul>
        <div class="actions">
          <button class="btn btn-primary btn-find" id="w-find" type="button">${svg(ICON.route)}<span>Find a Mass on the way</span></button>
          <p class="msg" id="msg" role="status" hidden></p>
        </div>
        <details class="why-built"><summary>How we pick</summary>
          <p>We choose the Mass that makes your journey the least longer, and that still gets you there in time if you set “Be there by”. We assume Mass takes about an hour on Sundays and Saturday evenings, and about 40 minutes on weekdays.</p></details>
      </section>`;
    const redraw = (id) => { renderWay(new URLSearchParams()); const t = view.querySelector(id); t?.focus({ preventScroll: true }); t?.classList.add("just"); };
    const on = (id, fn) => view.querySelector(id).addEventListener("click", fn);
    const pickTo = () => openPlaceSheet((p) => { trip.to = p; redraw("#w-to"); }, { title: "Going to", here: false });
    on("#w-from", () => openPlaceSheet((p) => { trip.from = p; redraw("#w-from"); }));
    on("#w-to", pickTo);
    on("#w-at", () => openTimeSheet(trip.at, (at) => { trip.at = at; redraw("#w-at"); }));
    on("#w-by", () => {
      const base = trip.at ?? Date.now();
      const quick = [1, 2, 3].map((h) => ({ t: nextQuarter(base + h * 3600e3 - 60000), l: `In ${h} hour${h > 1 ? "s" : ""}` }));
      openTimeSheet(trip.by, (by) => { trip.by = by; redraw("#w-by"); },
        { title: "Need to be there by", none: "No rush", verb: "Be there", quick, earliest: nextQuarter(base + 45 * 60000) });
    });
    on("#w-mode", () => openModeSheet(mode, (m) => { store.set("mgw-mode", m); redraw("#w-mode"); }));
    on("#w-late", () => { store.set("mgw-late", !store.get("mgw-late")); redraw("#w-late"); });
    const btn = view.querySelector("#w-find"), msg = view.querySelector("#msg");
    const say = (t) => { msg.textContent = t; msg.hidden = false; };
    const goWith = (from) => {
      const qs = new URLSearchParams({ from: pt(from), fromName: from.label, to: pt(trip.to), toName: trip.to.label, mode: store.get("mgw-mode") || "transit" });
      if (trip.at) qs.set("at", trip.at);
      if (trip.by) qs.set("by", trip.by);
      if (store.get("mgw-late")) qs.set("late", 15);
      go(`/way?${qs}`);
    };
    btn.addEventListener("click", () => {
      if (!trip.to) return pickTo();
      if (trip.from) return goWith(trip.from);
      if (!navigator.geolocation) return say("Your browser can’t share location. Choose where you’re leaving from instead.");
      btn.setAttribute("aria-busy", "true");
      btn.querySelector("span").textContent = "Finding you…";
      navigator.geolocation.getCurrentPosition(
        (pos) => goWith({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)), label: "your location" }),
        (err) => {
          btn.removeAttribute("aria-busy");
          btn.querySelector("span").textContent = "Find a Mass on the way";
          say(err.code === 1 ? "Location is blocked for this site. Allow it in your browser settings, or choose where you’re leaving from." : "Couldn’t get your location just now. Choose where you’re leaving from instead.");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  }

  async function fetchWay(q, fast) {
    const params = new URLSearchParams({ from: q.get("from"), to: q.get("to"), mode: q.get("mode") || "transit" });
    for (const k of ["at", "by"]) { const v = parseAt(q.get(k)); if (v) params.set(k, v); }
    const late = Math.min(15, Number(q.get("late")) || 0);
    if (late) params.set("late", late);
    if (fast) params.set("fast", "1");
    try {
      const r = await fetch(`api/way?${params}`, { cache: "no-store", signal: AbortSignal.timeout(fast ? 5000 : 15000) });
      if (r.status === 400) return { outside: true };
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      // offline or API down: the same plan in the browser, travel times estimated
      const d = await data();
      const depart = parseAt(q.get("at")) ?? Date.now(), by = parseAt(q.get("by"));
      const out = await window.MassWay.planWay({ from: readPt(q.get("from")), to: readPt(q.get("to")), depart, arriveBy: by, mode: params.get("mode"),
        parishes: d.parishes, events: S.expandAll(d, depart - late * 60000, 2).filter((e) => e.start >= depart - late * 60000 && (!by || e.start < by)), fast: true, lateMin: late });
      const byId = new Map(d.parishes.map((p) => [p.id, p]));
      const pack = (x) => x && { parish: byId.get(x.pid), start: x.start, end: x.end, leaveBy: x.leaveBy, arrive: x.arrive, toMin: x.toMin, toWalk: x.toWalk,
        onwardMin: x.onwardMin, onwardWalk: x.onwardWalk, detourMin: x.detourMin, lateMin: x.lateMin, travelSource: "estimate", language: x.lang, note: x.note };
      return { best: pack(out.best), alternatives: out.alternatives.map(pack), direct: out.direct };
    }
  }

  async function renderWayAnswer(q) {
    const mode = modeOf(q.get("mode"));
    const from = readPt(q.get("from"), q.get("fromName") || "your location"), to = readPt(q.get("to"), q.get("toName") || "your destination");
    const at = parseAt(q.get("at")), by = parseAt(q.get("by"));
    const myHash = location.hash, stale = () => location.hash !== myHash;
    if (!from || !to) return go("/way");
    rememberPlace(to);
    const summary = [`From ${from.label === "your location" ? "your location" : from.label} to ${to.label}`, at ? `leaving ${whenText(at)}` : "leaving now",
      mode.phrase, by ? `there by ${whenText(by)}` : ""].filter(Boolean).join(" · ");
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/way'">${svg(ICON.back)}</button>
        <span class="from wrap">${esc(summary)}</span></div>
      <div id="way-answer"><div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p>Looking for a Mass along your way…</p></div></div>
      <div id="map" class="way-map" role="region" aria-label="Map of your trip" hidden></div>
      <p class="legend" id="way-legend" hidden><span><i class="l-you"></i>Start</span><span><i class="l-dest"></i>${esc(to.label)}</span><span><i class="l-church"></i>Mass on the way</span></p>
      <div id="way-more"></div>`;
    const answerEl = view.querySelector("#way-answer"), moreEl = view.querySelector("#way-more");
    const phrase = (walk) => (walk ? "on foot" : mode.phrase);
    let lastKey = "";

    const paint = (res, refining) => {
      if (stale()) return;
      if (res.outside) {
        answerEl.innerHTML = `<section class="answer"><h1>That trip isn’t in Singapore.</h1><p class="lede">MassGoWhere covers Singapore’s 32 parishes. Choose a start and destination in Singapore.</p>
          <p style="margin-top:24px"><a class="btn btn-quiet" href="#/way">Change the trip</a></p></section>`;
        return;
      }
      const b = res.best;
      if (!b) {
        answerEl.innerHTML = `<section class="answer"><h1>No Mass fits ${by ? `before you need to be there` : "on this trip"}.</h1>
          <p class="lede">${by ? `Nothing along the way lets you reach ${esc(to.label)} by ${esc(whenText(by))}. Try a later time, or leaving earlier.` : "Try leaving at another time, or a different way of travelling."}</p>
          <p style="margin-top:24px"><a class="btn btn-quiet" href="#/way">Change the trip</a></p></section>`;
        moreEl.innerHTML = "";
        return;
      }
      const start = new Date(b.start).getTime(), end = new Date(b.end).getTime(), leave = new Date(b.leaveBy).getTime(), arrive = new Date(b.arrive).getTime();
      const t = clockParts(start), p = b.parish, about = b.travelSource === "estimate" ? "about " : "";
      // the trip as three plain steps, each a time: leave, Mass, arrive. No arithmetic for the reader to do.
      answerEl.innerHTML = `
        <section class="answer">
          <p class="day">${dayLabel(start)}${b.language && b.language !== "English" ? ` · ${esc(b.language)} Mass` : ""}</p>
          <p class="time">${t.hm}<small>${t.ap}</small></p>
          <h1 class="church">${esc(p.name)}</h1>
          <ol class="trip-steps way-steps">
            <li><strong>${b.lateMin > 0 ? "Leave now" : `Leave by ${clock(leave)}${onDay(leave, at ?? Date.now())}`}</strong>
              <span>${b.lateMin > 0 ? `<span class="late">You’ll be about ${mins(b.lateMin)} late</span> · ` : ""}${about}${mins(b.toMin)} ${phrase(b.toWalk)}</span></li>
            <li><strong>Mass ${clock(start)} to about ${clock(end)}</strong></li>
            <li><strong>Reach ${esc(to.label)} ${about}${clock(arrive)}</strong>
              <span>${about}${mins(b.onwardMin)} ${phrase(b.onwardWalk)}</span></li>
          </ol>
          <a class="btn btn-primary" href="${gdir(from, p, b.toWalk ? "walk" : mode.id)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate to the church</span></a>
          <a class="link way-on" href="${gdir(p, to, b.onwardWalk ? "walk" : mode.id)}" target="_blank" rel="noopener">After Mass: directions to ${esc(to.label)}</a>
          ${refining ? `<p class="est" style="text-align:center">Travel times are estimates; checking live routes…</p>` : ""}
        </section>`;
      const alt = (res.alternatives || []).filter(Boolean);
      moreEl.innerHTML = alt.length ? `<section class="more" aria-label="Other Masses on the way"><h2>Other Masses on the way</h2><ul class="rows">${alt.map((a) => {
        const s0 = new Date(a.start).getTime();
        return `<li><a class="row" href="#/church/${a.parish.id}"><span class="t">${clock(s0)}<small>${dayLabel(s0)}</small></span>
          <span class="n">${esc(a.parish.name)}<small>${a.lateMin > 0 ? `<span class="late">${mins(a.lateMin)} late</span>` : `Leave by ${clock(new Date(a.leaveBy).getTime())}`}</small></span>
          <span class="d">${clock(new Date(a.arrive).getTime())}<small>at ${esc(to.label)}</small></span></a></li>`;
      }).join("")}</ul></section>` : "";
      drawMap(res);
    };

    // the map: start, destination, the stop (big pin) and the other options (small pins). No line between them:
    // a straight line reads as a route, and the real route is in Google Maps.
    const drawMap = async (res) => {
      const key = [res.best?.parish.id, ...(res.alternatives || []).map((a) => a?.parish.id)].join(",");
      if (key === lastKey) return;
      lastKey = key;
      const el = view.querySelector("#map");
      if (!el) return;
      el.hidden = false;
      view.querySelector("#way-legend").hidden = false;
      let ml;
      try { ml = await maplibre(); } catch { el.innerHTML = '<p class="lede" style="padding:20px">The map could not load.</p>'; return; }
      if (stale() || !el.isConnected) return;
      if (currentMap) { currentMap.remove(); currentMap = null; }
      const stops = [res.best, ...(res.alternatives || [])].filter(Boolean);
      const map = newMap(ml, el, [from, to, ...stops.map((s0) => s0.parish)], 40);
      currentMap = map;
      stops.slice(1).forEach((s0) => addPin(ml, map, s0.parish, `<strong>${esc(s0.parish.name)}</strong><span>Mass ${clock(new Date(s0.start).getTime())} ${dayLabel(new Date(s0.start).getTime()).toLowerCase()} · reach ${esc(to.label)} ${clock(new Date(s0.arrive).getTime())}</span><a href="#/church/${s0.parish.id}">Mass times</a>`, { dim: true, time: clock(new Date(s0.start).getTime()) }));
      addPin(ml, map, res.best.parish, `<strong>${esc(res.best.parish.name)}</strong><span>${clock(new Date(res.best.start).getTime())} · your stop</span><a href="#/church/${res.best.parish.id}">Mass times</a>`, { time: clock(new Date(res.best.start).getTime()) });
      addDot(ml, map, from, "me", "Start");
      addDot(ml, map, to, "dest", to.label);
    };

    // as on the main answer: wait a moment for live routes so the answer appears once; show the estimate only if
    // live is slow, then settle the live times in place
    const fullP = fetchWay(q, false).then((r) => ({ r }), (e) => ({ e }));
    const fastP = fetchWay(q, true);
    const quick = await Promise.race([fullP, new Promise((ok) => setTimeout(() => ok(null), 3000))]);
    if (quick && quick.r) paint(quick.r, false);
    else {
      try { const res = await fastP; paint(res, !res.outside && !!res.best); } catch { /* the live call may still work */ }
      const full = await fullP;
      if (full.r) {
        const box = answerEl.querySelector(".way-steps"), before = box && box.textContent;
        paint(full.r, false);
        const after = answerEl.querySelector(".way-steps");
        if (after && before && after.textContent !== before) after.classList.add("updated");
      } else if (!answerEl.querySelector(".answer")) {
        answerEl.innerHTML = `<section class="answer"><h1>We couldn’t plan that just now.</h1><p class="lede">Check your connection and try again.</p></section>`;
      }
    }
    answerEl.querySelector(".est")?.remove();
  }

  // ---------- all churches ----------
  // The map library is big (~800 KB) and only some visits use it, so it loads on demand; the home screen warms it
  // up in idle time (see warmMap) so opening a map is quick.
  const ML = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl";
  const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
  let maplibreP = null;
  const maplibre = () => (maplibreP ||= new Promise((ok, fail) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = `${ML}.css`;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = `${ML}.js`;
    js.onload = () => ok(window.maplibregl); js.onerror = (e) => { maplibreP = null; fail(e); };
    document.head.appendChild(js);
  }));
  let warmed = false;
  function warmMap() {
    if (warmed) return;
    warmed = true;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    idle(() => {
      for (const [href, as] of [[`${ML}.js`, "script"], [`${ML}.css`, "style"], [MAP_STYLE, "fetch"]]) {
        const l = document.createElement("link");
        l.rel = "prefetch"; l.href = href; l.as = as;
        if (as === "fetch") l.crossOrigin = "anonymous";
        document.head.appendChild(l);
      }
    });
  }
  // a church pin: a small drop with a cross; "dim" for the other options on a route
  const PIN = '<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M16 39s13-12.4 13-22.5C29 8.9 23.2 3 16 3S3 8.9 3 16.5C3 26.6 16 39 16 39z"/><path class="x" d="M15 9.5h2v3.8h3.8v2H17v6.7h-2v-6.7h-3.8v-2H15z"/></svg>';
  function newMap(ml, el, pts, pad = 44, extra = {}) {
    const lngs = pts.map((p) => p.lng), lats = pts.map((p) => p.lat);
    const map = new ml.Map({
      container: el,
      // a normal full-colour street map (parks, water, MRT lines) in both themes, so places are easy to recognise
      style: MAP_STYLE,
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      fitBoundsOptions: { padding: { top: pad + 16, bottom: pad, left: pad, right: pad }, maxZoom: 15 },
      maxBounds: [[103.45, 1.1], [104.2, 1.55]],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 0,                                   // tiles appear at once instead of fading in
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      ...extra,
    });
    map.touchZoomRotate.disableRotation();
    // the compact credit starts open and covers the bottom of a phone-sized map; start it folded to its (i) button
    map.once("load", () => el.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
    return map;
  }
  // a pin whose popup always fits: tapping it first slides the map so the pin sits low, with room above for the card
  function addPin(ml, map, p, html, { dim = false, faint = false, label = p.name, time = "" } = {}) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `church-pin${dim ? " dim" : ""}${faint ? " faint" : ""}`;
    el.setAttribute("aria-label", time ? `${label}, ${time}` : label);
    el.innerHTML = PIN + (time ? `<span class="pin-time" aria-hidden="true">${esc(time)}</span>` : "");
    const popup = new ml.Popup({ offset: 30, closeButton: false, maxWidth: "240px", anchor: "bottom", focusAfterOpen: false }).setHTML(html);
    popup.on("open", () => el.setAttribute("aria-expanded", "true"));
    popup.on("close", () => el.setAttribute("aria-expanded", "false"));
    el.addEventListener("click", () => {
      const h = map.getContainer().clientHeight;
      map.easeTo({ center: [p.lng, p.lat], offset: [0, Math.min(110, h / 2 - 40)], duration: reduceMotion() ? 0 : 300 });
    });
    return new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
  }
  function addDot(ml, map, p, cls, label) {
    const el = document.createElement("div");
    el.className = cls;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
    return new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
  }

  // the answer's map: you in the middle; our pick, the churches the answer lists, and the five closest churches, each
  // pin labelled with the Mass you can make there, so the choice can be checked at a glance. Three looks: our pick
  // (dark), in the list below (lighter), and also nearby but not listed (grey; its card says why: a later Mass, or a
  // longer trip than the ones listed). It loads only when scrolled near, and takes two
  // fingers to move, so a thumb scrolling the page doesn't get caught in it.
  const listed = (res) => [...(res.alternatives || []).filter(Boolean).map((a) => ({ parish: a.parish, next: a })), ...(res.nearest ? [res.nearest] : [])];
  // fmt (optional): how a pin and its card describe an option; Adoration and Confession pass their own
  function answerMap(el, origin, youLabel, stale, fmt = {}) {
    let res = null, map = null, ml = null, marks = [];
    const t = (ms) => clock(new Date(ms).getTime());
    const pinTime = fmt.pin || ((e) => t(e.start));
    const line = fmt.line || ((e) => `Mass ${t(e.start)} ${esc(dayLabel(new Date(e.start).getTime()).toLowerCase())} · leave by ${t(e.leaveBy)}`);
    const draw = () => {
      marks.forEach((m) => m.remove());
      const b = res.best, seen = new Set([b.parish.id]);
      const fresh = (o) => !seen.has(o.parish.id) && seen.add(o.parish.id);
      const inList = listed(res).filter(fresh);
      const nearby = (res.around || []).filter((a) => a.parish).filter(fresh);
      const card = (p, e, extra) => `<strong>${esc(p.name)}</strong><span>${e ? line(e) : "No Mass you can reach soon"}</span>${extra || ""}<a href="#/church/${p.id}">${fmt.link || "Mass times"}</a>`;
      // drawn first, so the pins in the list sit on top where they overlap
      marks = nearby.map((o) => addPin(ml, map, o.parish, card(o.parish, o.next, `<span>Not in the list: ${!o.next ? "no Mass you can reach soon" : new Date(o.next.start) > new Date(b.start) ? "its next Mass is later" : "a longer trip than the ones listed"}</span>`), { dim: true, faint: true, time: o.next ? pinTime(o.next) : "" }));
      marks.push(...inList.map((o) => addPin(ml, map, o.parish, card(o.parish, o.next, o.parish.id === res.nearest?.parish.id ? "<span>Nearest church</span>" : "<span>In the list below</span>"), { dim: true, time: o.next ? pinTime(o.next) : "" })));
      marks.push(addPin(ml, map, b.parish, card(b.parish, b, "<span>Our pick for you</span>"), { time: pinTime(b) }));
    };
    const start = async () => {
      try { ml = await maplibre(); } catch { el.innerHTML = '<p class="lede" style="padding:20px">The map could not load.</p>'; return; }
      if (stale() || !el.isConnected || !res) return;
      if (currentMap) currentMap.remove();
      // frame you in the middle (each pin with its mirror image across you) with our pick and every other pin within
      // 3x the closest other one's distance: in a dense area (Bras Basah) a church across town doesn't squash the
      // near ones together; in the suburbs everything fits. Pinch out for the rest
      const km = (p) => R.haversineKm(origin, p);
      const all = [...listed(res), ...(res.around || [])].map((x) => x.parish).filter(Boolean).sort((a, b) => km(a) - km(b));
      const reach = 3 * Math.max(km(all[0] || res.best.parish), km(res.best.parish));
      const ps = [res.best.parish, ...all.filter((p) => km(p) <= reach)];
      const pts = [origin, ...ps.flatMap((p) => [p, { lat: 2 * origin.lat - p.lat, lng: 2 * origin.lng - p.lng }])];
      map = currentMap = newMap(ml, el, pts, 40, { cooperativeGestures: true }); // room above pins for their time labels
      addDot(ml, map, origin, "me", youLabel);
      draw();
    };
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      start();
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return { update(r) { res = r; if (map) draw(); } };
  }

  // browse. The map is just the map: every church, tap for its next Mass. The list is every church with its next
  // Mass; "Filter" opens dropdowns that turn it into one day's timetable. The choices live in the link
  // (#/churches?view=list&filters=1&day=1&part=evening), so Back, Map/List and sharing all keep them.
  const SORTS = [["near", "Nearest"], ["soon", "Earliest Mass"], ["az", "A to Z"]];
  const RADII = [2, 5, 10];
  // myCatholicSG spells a few languages two ways ("English.", "Mandarin (中文)")
  const langName = S.langName;
  async function renderChurches(q) {
    const d = await loadData();
    if (!d) return;
    const origin = store.get("mgw-origin");
    const now = Date.now(), today = sgMidnight(now);
    const langs = [...new Set(Object.values(d.rules).flat().filter((r) => r.type === "Mass").map((r) => langName(r.lang)))]
      .sort((a, b) => (a === "English" ? -1 : b === "English" ? 1 : a.localeCompare(b)));
    const st = {
      view: q.get("view") === "list" ? "list" : "map",
      day: Math.max(0, Math.min(6, Number(q.get("day")) || 0)),
      part: partOf(q.get("part")),
      lang: langs.includes(q.get("lang")) ? q.get("lang") : "",
      km: origin && RADII.includes(Number(q.get("km"))) ? Number(q.get("km")) : 0,
      sort: SORTS.some(([k]) => k === q.get("sort")) ? q.get("sort") : origin ? "near" : "az",
      text: q.get("q") || "",
      // Mass (""), or Adoration or Confession times instead
      what: KIND[q.get("what")] ? q.get("what") : "",
      // filters are off unless asked for; a link with a day, time, language or distance in it opens with them on
      filters: q.get("filters") === "1" || ["what", "day", "part", "lang", "km"].some((k) => q.has(k)),
    };
    if (st.sort === "near" && !origin) st.sort = "az";
    const link = (o = {}) => {
      const x = { ...st, ...o }, qs = new URLSearchParams();
      if (x.view === "list") qs.set("view", "list");
      if (x.filters) {
        qs.set("filters", 1);
        if (x.what) qs.set("what", x.what);
        if (x.day) qs.set("day", x.day);
        if (x.part) qs.set("part", x.part);
        if (x.lang) qs.set("lang", x.lang);
        if (x.km) qs.set("km", x.km);
      }
      if (x.sort !== (origin ? "near" : "az")) qs.set("sort", x.sort);
      if (x.text) qs.set("q", x.text);
      return `#/churches${String(qs) ? `?${qs}` : ""}`;
    };
    const dist = (p) => (origin ? R.haversineKm(origin, p) : null);
    const head = (asMap) => `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="history.length > 1 ? history.back() : (location.hash='#/')">${svg(ICON.back)}</button></div>
      <section class="list-head">
        <h1>All churches</h1>
        <div class="seg" role="group" aria-label="View">
          <a href="${link({ view: "map" })}" aria-current="${asMap}">Map</a>
          <a href="${link({ view: "list" })}" aria-current="${!asMap}">List</a>
        </div>`;
    const toggle = () => view.querySelectorAll(".seg a").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", a.getAttribute("href"));
      route();
      view.querySelector(`.seg a[aria-current="true"]`)?.focus({ preventScroll: true });
    }));

    if (st.view === "list") {
      const dayStart = today + st.day * DAY;
      const dayName = st.day === 0 ? "today" : st.day === 1 ? "tomorrow" : `on ${wk(dayStart, "long")}`;
      const pick = (key, label, opts, extra = "") => `<label class="pick"><span>${label}</span>
        <select data-key="${key}" ${extra}>${opts.map(([v, l]) => `<option value="${v}"${String(st[key]) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${svg(ICON.chev)}</label>`;
      const days = Array.from({ length: 7 }, (_, i) => [i, i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${wk(today + i * DAY, "long")} ${dnum(today + i * DAY)}`]);
      view.innerHTML = `${head(false)}
        <div class="search">${svg(ICON.search)}<input id="filter" type="search" placeholder="Search by church name or area" aria-label="Search churches" value="${esc(st.text)}"><button class="clear" type="button" aria-label="Clear search" ${st.text ? "" : "hidden"}>${svg(ICON.x)}</button></div>
        <button class="filter-toggle" type="button" id="filters" aria-expanded="${st.filters}" aria-controls="picks">${svg(ICON.chev)}<span>${st.filters ? "Hide filters" : "Filter by day, time, language or distance"}</span></button>
        <div class="picks" id="picks"${st.filters ? "" : " hidden"}>
          ${pick("what", "Looking for", [["", "Mass"], ["adoration", "Adoration"], ["confession", "Confession"]]).replace('class="pick"', 'class="pick wide"')}
          ${pick("day", "Day", days)}
          ${pick("part", "Time", [["", "Any time"], ...Object.entries(PARTS).map(([k, x]) => [k, x.label])])}
          ${pick("lang", "Language", [["", st.what ? "Mass only" : "Any language"], ...langs.map((l) => [l, l])], st.what ? "disabled" : "")}
          ${origin ? pick("km", "Distance", [[0, "Any distance"], ...RADII.map((k) => [k, `Within ${k} km`])])
            : `<label class="pick" aria-disabled="true"><span>Distance</span><select disabled aria-describedby="nearby-note"><option value="">No location</option></select>${svg(ICON.chev)}</label>`}
        </div>
      </section>
      <div class="results"><p class="count" id="count" aria-live="polite"></p>
        <label class="sort"><span>Sort</span><select data-key="sort">${SORTS.filter(([k]) => k !== "near" || origin).map(([v, l]) => `<option value="${v}"${st.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select>${svg(ICON.chev)}</label></div>
      <ul class="rows" id="rows"></ul>
      <p class="source">Times from myCatholicSG${st.what ? " and parish websites" : ""}.${origin ? ` Distances are from ${esc(origin.label)}.` : ` <span id="nearby-note">Share your location on the home screen to sort and filter by distance.</span>`} Please confirm feast days and public holidays with the parish.</p>`;
      toggle();
      const rows = view.querySelector("#rows"), count = view.querySelector("#count");
      // with no filters, each church's next Mass this week, so every church is listed and can be tapped
      const next = new Map(d.parishes.map((p) => [p.id, S.expandParish(String(p.id), d, now, 7)[0]]));
      const draw = () => {
        // filtered: that day's Masses at each church in the chosen time and language (today: only those still to come),
        // or its Adoration and Confession times (today: those still open or to come) in the chosen time of day
        const P = PARTS[st.part], partFrom = P ? dayStart + P.from * 3600e3 : dayStart, partTo = P ? dayStart + P.to * 3600e3 : dayStart + DAY;
        const masses = !st.filters ? null : st.what
          ? new Map(d.parishes.map((p) => [p.id, window.MassServices.expandServices(String(p.id), d, st.what, dayStart, 0)
            .filter((w) => w.start < dayStart + DAY && (w.end ?? w.start) >= (st.day === 0 ? now : dayStart))
            .filter((w) => w.start < partTo && (w.end ?? w.start + 1) > partFrom)]))
          : new Map(d.parishes.map((p) => [p.id, S.expandParish(String(p.id), d, dayStart, 0)
            .filter((e) => e.start >= (st.day === 0 ? now : dayStart)).filter(S.inPart(st.part))
            .filter((e) => !st.lang || langName(e.lang) === st.lang)]));
        const first = (p) => (masses ? masses.get(p.id)[0] : next.get(p.id))?.start ?? Infinity;
        const order = {
          near: (a, b) => dist(a) - dist(b),
          soon: (a, b) => first(a) - first(b) || (origin ? dist(a) - dist(b) : a.name.localeCompare(b.name)),
          az: (a, b) => a.name.localeCompare(b.name),
        }[st.sort];
        const f = st.text.toLowerCase();
        // filtered, only churches with a Mass that fits: a row saying "no Mass" is noise in a timetable
        // Adoration or Confession a parish mentions without clear times: listed anyway, pointing to the parish
        const unsure = new Map(st.what ? window.MassServices.unconfirmed(d, st.what).map((x) => [x.pid, x.text]) : []);
        const shown = d.parishes
          .filter((p) => !masses || masses.get(p.id).length || unsure.has(p.id))
          .filter((p) => !masses || !st.km || dist(p) <= st.km)
          .filter((p) => !f || `${p.name} ${p.address} ${p.postal}`.toLowerCase().includes(f))
          .sort(order);
        const fits = shown.length;
        view.querySelector(".sort").hidden = !fits;
        const what = st.what ? `${KIND[st.what].title}${st.part ? ` ${{ morning: "in the morning", lunch: "at lunchtime", evening: "in the evening" }[st.part]}` : ""}`
          : `${st.part ? partWord(st.part).replace(/ Mass$/, "") : "a"}${st.lang ? ` ${st.lang}` : ""} Mass`;
        const when = st.day === 0 ? (st.what ? "today" : "still to come today") : dayName;
        const clear = `<a class="link" href="${link({ filters: false, text: "" })}" data-clear>${st.filters ? "Clear filters" : "Clear search"}</a>`;
        count.innerHTML = !masses
          ? (fits ? `${fits} ${st.text ? (fits === 1 ? "church matches" : "churches match") : "churches"}` : `No church matches your search. ${clear}`)
          : fits
          ? (() => { const sure = shown.filter((p) => masses.get(p.id).length).length, more = fits - sure;
            return `${sure} ${sure === 1 ? "church has" : "churches have"} ${esc(what)} ${when}${more ? `, and ${more} more don’t say clearly when` : ""}`; })()
          : `No church has ${esc(what)} ${when}${st.km ? ` within ${st.km} km` : ""}${st.text ? " that matches your search" : ""}. ${clear}`;
        rows.innerHTML = shown.map((p) => {
          const km = dist(p);
          const far = km != null ? `<span class="d">${km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km"}</span>` : "";
          const n = next.get(p.id);
          const times = !masses ? (n ? `Next Mass ${clock(n.start)} ${dayKey(n.start) === dayKey(now) ? "today" : dayKey(n.start) === dayKey(now + DAY) ? "tomorrow" : wk(n.start, "long")}` : "No Mass listed this week") : st.what && !masses.get(p.id).length ? `Times not clear: check with the parish<span class="x">${esc(unsure.get(p.id))}</span>` : st.what ? masses.get(p.id).map((w) => (w.type === "session" ? `${clock(w.start)} ${esc(w.name || "")}`.trim() : `${clock(w.start)}–${clock(w.end)}`)).join('<span class="sep"> · </span>') : masses.get(p.id).map((e) => `${clock(e.start)}${langName(e.lang) !== "English" && !st.lang ? ` <span class="tag">${esc(langName(e.lang))}</span>` : ""}`).join('<span class="sep"> · </span>');
          return `<li><a class="row row-church" href="#/church/${p.id}">
            <span class="n">${esc(p.name)}<small class="times">${times}</small></span>${far}</a></li>`;
        }).join("");
      };
      draw();
      const sync = () => {
        history.replaceState(null, "", link());
        view.querySelectorAll(".seg a").forEach((a) => { a.href = link({ view: a.textContent === "Map" ? "map" : "list" }); });
        draw();
      };
      view.querySelectorAll("select[data-key]").forEach((sel) => sel.addEventListener("change", () => {
        const k = sel.dataset.key;
        st[k] = k === "day" || k === "km" ? Number(sel.value) : sel.value;
        if (k === "day" || k === "what") return (history.replaceState(null, "", link()), route(), view.querySelector(`select[data-key="${k}"]`).focus());
        sync();
      }));
      // opening or closing the filters redraws the page; closing them drops what they were set to
      view.querySelector("#filters").addEventListener("click", () => {
        st.filters = !st.filters;
        if (!st.filters) Object.assign(st, { what: "", day: 0, part: "", lang: "", km: 0 });
        history.replaceState(null, "", link());
        route();
        view.querySelector("#filters").focus({ preventScroll: true });
      });
      const filter = view.querySelector("#filter");
      clearable(filter);
      filter.addEventListener("input", (e) => { st.text = e.target.value.trim(); sync(); });
      view.addEventListener("click", (e) => {
        const clear = e.target.closest("[data-clear]");
        if (!clear) return;
        e.preventDefault();
        history.replaceState(null, "", clear.getAttribute("href"));
        route();
      });
      return;
    }

    // the map: every church, tap for its next Mass (and when to leave for it, once we know where you are)
    const mode = store.get("mgw-mode") || "transit";
    const nextLine = (p) => {
      const evs = S.expandParish(String(p.id), d, now, 7);
      if (!origin) return evs[0] ? `Next Mass ${clock(evs[0].start)} ${dayLabel(evs[0].start).toLowerCase()}` : "No Mass listed this week";
      const t = tripTo(p, origin, mode), about = t.source === "estimate" ? "about " : "";
      const lead = (t.minutes + R.BUFFER_MIN) * 60000;
      const m = evs.find((e) => e.start - lead >= now);
      return m ? `Next Mass ${clock(m.start)} ${dayLabel(m.start).toLowerCase()} · leave by ${about}${clock(m.start - lead)}` : "No Mass you can make this week";
    };
    view.innerHTML = `${head(true)}
        <p class="muted" style="margin:0">Tap a church for its next Mass. For times by day, language or distance, use the list.</p>
      </section>
      <div id="map" role="region" aria-label="Map of churches"></div>
      <p class="legend"><span><i class="l-church"></i>Church</span>${origin ? `<span><i class="l-you"></i>${esc(origin.label === "your location" ? "You" : origin.label)}</span>` : ""}</p>
      <p class="source">${d.parishes.length} parishes. Times from myCatholicSG.</p>`;
    toggle();
    const mapEl = view.querySelector("#map");
    let ml;
    try { ml = await maplibre(); } catch { mapEl.innerHTML = '<p class="lede" style="padding:20px">The map could not load. Use the list instead.</p>'; return; }
    if (!mapEl.isConnected) return;
    const near5 = origin ? [...d.parishes].sort((a, b) => dist(a) - dist(b)).slice(0, 5) : [];
    // frame you and your five nearest churches, or every church when we don't know where you are
    const map = newMap(ml, mapEl, origin ? [origin, ...near5] : d.parishes);
    currentMap = map;
    for (const p of d.parishes) addPin(ml, map, p, `<strong>${esc(p.name)}</strong><span>${nextLine(p)}</span><a href="#/church/${p.id}">Mass times and directions</a>`);
    if (origin) addDot(ml, map, origin, "me", "You");
  }

  // feedback form in the footer: sent to Anselm on Telegram by /api/feedback
  const fb = document.getElementById("feedback");
  // "Tell us" on a church page opens the feedback form below, already saying which church
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-report]");
    if (!r || !fb) return;
    fb.closest("details").open = true;
    if (!fb.message.value.trim()) fb.message.value = `${r.dataset.report}: `;
    fb.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
    fb.message.focus({ preventScroll: true });
  });
  fb?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = fb.querySelector(".fb-status"), btn = fb.querySelector("button");
    const message = fb.message.value.trim();
    if (message.length < 2) { status.textContent = "Write a few words first."; fb.message.focus(); return; }
    btn.disabled = true; status.classList.remove("sent"); status.textContent = "Sending…";
    try {
      const r = await fetch("api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ message, contact: fb.contact.value.trim(), website: fb.website.value, page: location.hash.split("?")[0] || "#/" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      fb.reset();
      // received: a tick draws itself in the season's colour beside the thanks
      status.innerHTML = `${svg('<path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/>', "tick")}<span>Thank you! Anselm will read it.</span>`;
      status.classList.add("sent");
    } catch (err) {
      status.textContent = `${err.message && !/^\d+$/.test(err.message) ? err.message + " " : ""}You can also message @massgowherebot and send /feedback.`;
    } finally { btn.disabled = false; }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".btn-primary[href^='https://www.google.com/maps']") && navigator.vibrate) navigator.vibrate(12);
  });
  // light unless chosen otherwise; the header button flips between light and dark
  const themeBtn = document.getElementById("theme-toggle");
  const isDark = () => { const c = design().scheme; return c === "dark" || (c === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); };
  const paintToggle = () => {
    const dark = isDark();
    themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    themeBtn.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/></svg>';
  };
  themeBtn.addEventListener("click", () => { store.set("mgw-scheme", isDark() ? "light" : "dark"); applyPalette(); paintToggle(); });
  paintToggle();
  applyPalette();
  // the browser bar colour follows the phone switching between light and dark
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyPalette);
  paletteMenu();
  route();
})();
