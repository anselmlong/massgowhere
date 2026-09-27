(function () {
  const S = window.MassSchedule;
  const R = window.MassRank;
  const view = document.getElementById("view");
  const TZ = { timeZone: "Asia/Singapore" };
  const MODES = [
    { id: "transit", label: "Bus & MRT", phrase: "by bus & MRT", gmaps: "transit", icon: '<path d="M7 16.5V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v10.5M7 12h10M9 20l-1.5 1.5M15 20l1.5 1.5"/><rect x="7" y="3" width="10" height="16" rx="3"/><circle cx="9.5" cy="15.5" r=".8" fill="currentColor"/><circle cx="14.5" cy="15.5" r=".8" fill="currentColor"/>' },
    { id: "drive", label: "Car", phrase: "by car", gmaps: "driving", icon: '<path d="M5 17h14M5 17v2M19 17v2M4 13l1.6-5A2 2 0 0 1 7.5 6.6h9a2 2 0 0 1 1.9 1.4L20 13v4H4z"/><circle cx="8" cy="14" r=".8" fill="currentColor"/><circle cx="16" cy="14" r=".8" fill="currentColor"/>' },
    { id: "walk", label: "Walk", phrase: "on foot", gmaps: "walking", icon: '<circle cx="13" cy="4.5" r="1.8"/><path d="M9 21l2.5-6.5L14 16v5M11.5 14.5L12.5 9l-3 1.5L8 13.5M12.5 9l2 3.5 3 1"/>' },
  ];
  const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[0];
  const svg = (paths, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    locate: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    nav: '<path d="M4 11.5 20 4l-7.5 16-2-6.5z"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
  };

  // ---------- storage (optional) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ---------- liturgical season -> accent ----------
  function easter(y) { // anonymous Gregorian computus
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, month - 1, day);
  }
  function season(ms) {
    const day = S.sgtDay(ms).getTime(), y = S.sgtDay(ms).getUTCFullYear(), D = 864e5;
    const E = easter(y);
    const xmas = Date.UTC(y, 11, 25);
    const advent = xmas - ((new Date(xmas).getUTCDay() || 7) + 21) * D;   // 4th Sunday before Christmas
    const jan6 = Date.UTC(y, 0, 6);
    const baptism = jan6 + (7 - new Date(jan6).getUTCDay()) * D;           // Sunday after 6 Jan
    if (day <= baptism) return { name: "Christmas", accent: "gold" };
    if (day >= E - 46 * D && day < E - 7 * D) return { name: "Lent", accent: "violet" };
    if (day === E - 7 * D || day === E - 2 * D) return { name: day === E - 7 * D ? "Palm Sunday" : "Good Friday", accent: "red" };
    if (day > E - 7 * D && day < E) return { name: "Holy Week", accent: "violet" };
    if (day >= E && day < E + 49 * D) return { name: "Easter", accent: "gold" };
    if (day === E + 49 * D) return { name: "Pentecost", accent: "red" };
    if (day >= advent && day < xmas) return { name: "Advent", accent: "violet" };
    if (day >= xmas) return { name: "Christmas", accent: "gold" };
    return { name: "Ordinary Time", accent: "green" };
  }
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
  const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", TZ);
  function dayLabel(ms) {
    const now = Date.now();
    if (dayKey(ms) === dayKey(now)) return "Today";
    if (dayKey(ms) === dayKey(now + 864e5)) return "Tomorrow";
    return new Date(ms).toLocaleDateString("en-SG", { ...TZ, weekday: "long", day: "numeric", month: "short" });
  }
  function until(ms) {
    const m = Math.round((ms - Date.now()) / 60000);
    if (m <= 1) return "now";
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `in ${h} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : dayLabel(ms);
  }
  const mins = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim());
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (n) => n.replace(/^Church of (the )?/, "").replace(/^(St|Sts) /, "$1 ");
  const gmaps = (p, mode, origin) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, Singapore ${p.postal || ""}`.trim())}` +
    `&travelmode=${modeOf(mode).gmaps}${origin ? `&origin=${origin.lat},${origin.lng}` : ""}`;

  // ---------- data ----------
  let dataP = null;
  const data = () => (dataP ||= fetch("data.json", { cache: "no-cache" }).then((r) => r.json()));

  // ---------- router ----------
  function route() {
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

  // ---------- home ----------
  function modePicker(current) {
    return `<fieldset class="modes" aria-label="How are you travelling?" style="border:0;margin:0;min-inline-size:0">
      ${MODES.map((m) => `<label><input type="radio" name="mode" value="${m.id}" ${m.id === current ? "checked" : ""}><span>${svg(m.icon)}${m.label}</span></label>`).join("")}
    </fieldset>`;
  }
  function renderHome() {
    const mode = store.get("mgw-mode") || "transit";
    view.innerHTML = `
      <section class="home reveal">
        <div>
          <h1>Find a Mass you can make.</h1>
          <p class="lede">From wherever you are in Singapore: the next Mass you can reach in time, and when to set off.</p>
        </div>
        ${modePicker(mode)}
        <div class="actions">
          <button class="btn btn-primary" id="locate" type="button">${svg(ICON.locate)}<span>Use my location</span></button>
          <p class="msg" id="msg" role="status" hidden></p>
          <div class="or">or</div>
          <div>
            <div class="search">
              ${svg(ICON.search)}
              <input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Postal code or place" aria-label="Postal code or place" aria-controls="suggest">
            </div>
            <ul class="suggest" id="suggest" hidden></ul>
          </div>
        </div>
      </section>
      <div class="home-foot"><a class="link" href="#/churches">Browse all churches</a></div>`;
    view.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => store.set("mgw-mode", r.value)));
    const msg = view.querySelector("#msg");
    const btn = view.querySelector("#locate");
    btn.addEventListener("click", () => {
      if (!navigator.geolocation) return say("Your browser can’t share location. Search for a postal code or place instead.");
      btn.setAttribute("aria-busy", "true");
      btn.querySelector("span").textContent = "Finding you…";
      navigator.geolocation.getCurrentPosition(
        (pos) => go(`/next?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&mode=${currentMode()}&from=${encodeURIComponent("your location")}`),
        (err) => {
          btn.removeAttribute("aria-busy");
          btn.querySelector("span").textContent = "Use my location";
          say(err.code === 1 ? "Location is blocked for this site. Allow it in your browser settings, or search for a place below." : "Couldn’t get your location just now. Search for a postal code or place instead.");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
    function say(t) { msg.textContent = t; msg.hidden = false; }
    const currentMode = () => view.querySelector('input[name="mode"]:checked').value;

    const input = view.querySelector("#q"), list = view.querySelector("#suggest");
    let timer, seq = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const v = input.value.trim();
      if (v.length < 2) { list.hidden = true; return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const r = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(v)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`);
          const j = await r.json();
          if (my !== seq) return;
          const res = (j.results || []).slice(0, 5);
          list.innerHTML = res.length
            ? res.map((x, i) => `<li><button type="button" data-i="${i}">${esc(title(x))}<small>${esc(x.ADDRESS)}</small></button></li>`).join("")
            : `<li><button type="button" disabled>No match for “${esc(v)}”<small>Try a postal code, MRT station or street</small></button></li>`;
          list.hidden = false;
          list.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => {
            const x = res[Number(b.dataset.i)];
            go(`/next?lat=${Number(x.LATITUDE).toFixed(5)}&lng=${Number(x.LONGITUDE).toFixed(5)}&mode=${currentMode()}&from=${encodeURIComponent(title(x))}`);
          }));
        } catch { list.innerHTML = `<li><button type="button" disabled>Search is unavailable right now<small>Use your location instead</small></button></li>`; list.hidden = false; }
      }, 250);
    });
    const title = (x) => (x.BUILDING && x.BUILDING !== "NIL" ? x.BUILDING : x.SEARCHVAL).replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
  }

  // ---------- result ----------
  async function fetchNext(q) {
    const params = new URLSearchParams({ lat: q.get("lat"), lng: q.get("lng"), mode: q.get("mode") || "transit" });
    try {
      const r = await fetch(`api/next?${params}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      // offline or API down: same ranking in the browser, travel times estimated
      const d = await data();
      const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
      const now = Date.now();
      const out = await R.rank({ origin, now, mode: params.get("mode"), parishes: d.parishes, events: S.expandAll(d, now, 2) });
      const byId = new Map(d.parishes.map((p) => [p.id, p]));
      const pack = (e) => e && { parish: byId.get(e.pid), start: e.start, leaveBy: e.leaveBy, travelMin: e.travelMin, travelSource: e.travelSource, distanceKm: e.distanceKm, language: e.lang, location: e.loc, note: e.note };
      return { mode: params.get("mode"), best: pack(out.best), alternatives: out.alternatives.map(pack),
        nearest: out.nearest && { parish: byId.get(out.nearest.pid), travelMin: out.nearest.travelMin, travelSource: out.nearest.travelSource, next: pack(out.nearest.next) } };
    }
  }

  async function renderNext(q) {
    const mode = modeOf(q.get("mode"));
    const origin = { lat: Number(q.get("lat")), lng: Number(q.get("lng")) };
    const from = q.get("from") || "your location";
    store.set("mgw-origin", { ...origin, label: from, at: Date.now() });
    const bar = `<div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button>
      <span class="from">From ${esc(from)} · ${mode.label}</span></div>`;
    view.innerHTML = `${bar}<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p>Checking Mass times and routes…</p></div>`;
    const [res, d] = await Promise.all([fetchNext(q), data()]);
    if (!location.hash.startsWith("#/next")) return;
    const b = res.best;
    if (!b) {
      view.innerHTML = `${bar}<section class="answer reveal"><h1>No Mass you can reach in the next two days.</h1>
        <p class="lede">Try another way of travelling, or browse the churches and their times.</p>
        <p style="margin-top:28px"><a class="btn btn-quiet" href="#/churches">Browse all churches</a></p></section>`;
      return;
    }
    const start = new Date(b.start).getTime(), leave = new Date(b.leaveBy).getTime();
    const t = clockParts(start);
    const p = b.parish;
    const est = b.travelSource === "estimate";
    const leaveText = leave - Date.now() < 2 * 60000 ? "Leave now" : `Leave by ${clock(leave)}`;
    const meta = [b.language !== "English" ? `${b.language} Mass` : "", b.note].filter(Boolean).join(" · ");
    const src = d.parishes.find((x) => x.id === p.id)?.source;
    const alt = (res.alternatives || []).filter(Boolean);
    const near = res.nearest && res.nearest.parish.id !== p.id ? res.nearest : null;
    view.innerHTML = `${bar}
      <section class="answer reveal" aria-labelledby="ans">
        <p class="day">${dayLabel(start)}${start - Date.now() < 12 * 3600e3 ? ` · ${until(start)}` : ""}</p>
        <p class="time" id="ans">${t.hm}<small>${t.ap}</small></p>
        <p class="church">${esc(p.name)}</p>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        <div class="leave"><strong>${leaveText}</strong><span>${est ? "about " : ""}${mins(b.travelMin)} ${mode.phrase}</span></div>
        <a class="btn btn-primary" href="${gmaps(p, mode.id, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
        <div class="sub"><a class="link" href="#/church/${p.id}">Mass times at this church</a></div>
        ${est ? `<p class="est" style="text-align:center">Travel time is an estimate; Google Maps will give the live route.</p>` : ""}
      </section>
      ${alt.length || near ? `<section class="more" aria-label="Other options">
        ${alt.length ? `<h2>Other Masses you can make</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
        ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
          <a class="row" href="#/church/${near.parish.id}"><span class="t">${mins(near.travelMin)}<small>${mode.label.toLowerCase()}</small></span>
          <span class="n">${esc(short(near.parish.name))}<small>${near.next ? `Next Mass you can make: ${clock(new Date(near.next.start).getTime())} ${dayLabel(new Date(near.next.start).getTime()).toLowerCase()}` : "No reachable Mass soon"}</small></span><span class="d"></span></a></li></ul>` : ""}
      </section>` : ""}
      <p class="source">${src ? `Times from ${src.kind === "parish site" ? "the parish website" : "myCatholicSG"}, checked ${new Date(src.fetchedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}. ` : ""}Please confirm special feast days with the parish.</p>
      <p class="blessing">Go in peace.</p>`;
    view.focus({ preventScroll: true });
  }
  function row(a, mode) {
    const s = new Date(a.start).getTime();
    return `<li><a class="row" href="#/church/${a.parish.id}">
      <span class="t">${clock(s)}<small>${dayLabel(s)}</small></span>
      <span class="n">${esc(short(a.parish.name))}${a.language !== "English" ? `<span class="tag">${esc(a.language)}</span>` : ""}<small>Leave by ${clock(new Date(a.leaveBy).getTime())}</small></span>
      <span class="d">${mins(a.travelMin)}</span></a></li>`;
  }

  // ---------- church ----------
  async function renderChurch(id) {
    const d = await data();
    const p = d.parishes.find((x) => x.id === id);
    if (!p) return go("/churches");
    const origin = store.get("mgw-origin");
    const mode = store.get("mgw-mode") || "transit";
    const evs = S.expandParish(String(id), d, Date.now(), 7);
    const days = new Map();
    for (const e of evs) {
      const k = dayLabel(e.start);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(e);
    }
    const src = p.source || {};
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="history.length > 1 ? history.back() : (location.hash='#/')">${svg(ICON.back)}</button></div>
      <section class="church-page reveal">
        <h1>${esc(p.name)}</h1>
        <p class="addr">${esc(p.address)}, Singapore ${esc(p.postal || "")}</p>
        <div class="acts">
          <a class="btn btn-primary" href="${gmaps(p, mode, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          ${p.phone ? `<a class="btn btn-quiet" href="tel:${esc(p.phone.replace(/\s/g, ""))}" aria-label="Call the parish">${svg(ICON.phone)}</a>` : ""}
        </div>
        <div class="week">
          ${[...days].map(([k, es]) => `<h3>${esc(k)}</h3><ul>${es.map((e) => `<li><span class="t">${clock(e.start)}</span><span>${esc(e.lang)}${e.loc && !/^main church$/i.test(e.loc) ? ` · ${esc(e.loc)}` : ""}${e.note ? `<span class="x"> · ${esc(e.note)}</span>` : ""}</span></li>`).join("")}</ul>`).join("") || `<p class="lede">No Masses listed for the coming week. Please check with the parish.</p>`}
        </div>
        ${(p.notes || []).length ? `<ul class="notes">${p.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
        <p class="source">Times from <a href="${esc(src.url || p.website || "#")}" target="_blank" rel="noopener">${src.kind === "parish site" ? "the parish website" : "myCatholicSG"}</a>${src.fetchedAt ? `, checked ${new Date(src.fetchedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}` : ""}.${p.website && src.kind !== "parish site" ? ` Parish website: <a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>.` : ""}</p>
      </section>`;
  }

  // ---------- all churches ----------
  let leafletP = null;
  const leaflet = () => (leafletP ||= new Promise((ok, fail) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => ok(window.L); s.onerror = fail;
    document.head.appendChild(s);
  }));

  async function renderChurches(q) {
    const d = await data();
    const origin = store.get("mgw-origin");
    const now = Date.now();
    const next = new Map();
    for (const e of S.expandAll(d, now, 7)) if (!next.has(e.pid)) next.set(e.pid, e);
    const dist = (p) => (origin ? R.haversineKm(origin, p) : null);
    const ps = [...d.parishes].sort((a, b) => (origin ? dist(a) - dist(b) : a.name.localeCompare(b.name)));
    const asMap = q.get("view") === "map";
    view.innerHTML = `
      <div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button></div>
      <section class="list-head reveal">
        <h1>All churches</h1>
        <div class="seg" role="group" aria-label="View">
          <button type="button" aria-pressed="${!asMap}" data-v="list">List</button>
          <button type="button" aria-pressed="${asMap}" data-v="map">Map</button>
        </div>
        ${asMap ? "" : `<div class="search">${svg(ICON.search)}<input id="filter" type="search" placeholder="Filter by name or area" aria-label="Filter churches"></div>`}
      </section>
      ${asMap ? `<div id="map" role="region" aria-label="Map of churches"></div>` : `<ul class="rows" id="rows"></ul>`}
      <p class="source">${origin ? `Sorted by distance from ${esc(origin.label)}.` : "Sorted by name."} ${d.parishes.length} parishes.</p>`;
    view.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => go(`/churches${b.dataset.v === "map" ? "?view=map" : ""}`)));
    if (!asMap) {
      const rows = view.querySelector("#rows");
      const draw = (f) => {
        const list = ps.filter((p) => !f || `${p.name} ${p.address}`.toLowerCase().includes(f));
        rows.innerHTML = list.map((p) => {
          const n = next.get(p.id);
          const km = dist(p);
          return `<li><a class="row" href="#/church/${p.id}"><span class="t">${n ? clock(n.start) : "–"}<small>${n ? dayLabel(n.start) : ""}</small></span>
            <span class="n">${esc(short(p.name))}<small>${esc(p.address)}</small></span><span class="d">${km != null ? `${km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km"}` : ""}</span></a></li>`;
        }).join("") || `<li class="lede">No church matches that.</li>`;
      };
      draw("");
      view.querySelector("#filter").addEventListener("input", (e) => draw(e.target.value.trim().toLowerCase()));
      return;
    }
    const L = await leaflet();
    const map = L.map("map", { zoomControl: true }).setView([1.3521, 103.8198], 11);
    L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png", {
      minZoom: 11, maxZoom: 19, detectRetina: true,
      attribution: '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>',
    }).addTo(map);
    const icon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
    for (const p of d.parishes) {
      const n = next.get(p.id);
      L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(map)
        .bindPopup(`<strong>${esc(p.name)}</strong><br>${n ? `Next Mass ${clock(n.start)} ${dayLabel(n.start).toLowerCase()}` : ""}<br><a href="#/church/${p.id}">Mass times</a>`);
    }
    if (origin) L.circleMarker([origin.lat, origin.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map);
  }

  applyPalette();
  paletteMenu();
  route();
})();
