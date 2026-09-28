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
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
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

  // ---------- home ----------
  function modePicker(current) {
    return `<fieldset class="modes" aria-label="How are you travelling?" style="border:0;margin:0;min-inline-size:0">
      ${MODES.map((m) => `<label><input type="radio" name="mode" value="${m.id}" ${m.id === current ? "checked" : ""}><span>${svg(m.icon)}${m.label}</span></label>`).join("")}
    </fieldset>`;
  }
  function renderHome() {
    const mode = store.get("mgw-mode") || "transit";
    const last = store.get("mgw-origin");
    // a named place from last time (not raw GPS, which is stale by now), within the last 30 days
    const again = last && last.label !== "your location" && Date.now() - (last.at || 0) < 30 * 864e5 ? last : null;
    view.innerHTML = `
      <section class="home">
        <div>
          <h1>Find a Mass you can make.</h1>
          <p class="lede">From wherever you are in Singapore: the next Mass you can reach in time, and when to set off.</p>
        </div>
        ${modePicker(mode)}
        <div class="actions">
          <button class="btn btn-primary" id="locate" type="button">${svg(ICON.locate)}<span>Use my location</span></button>
          ${again ? `<a class="again" href="#/next?lat=${again.lat}&lng=${again.lng}&mode=${mode}&from=${encodeURIComponent(again.label)}">Check again from ${esc(again.label)}</a>` : ""}
          <p class="msg" id="msg" role="status" hidden></p>
          <div class="or">or</div>
          <div>
            <div class="search">
              ${svg(ICON.search)}
              <input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Postal code or place" aria-label="Postal code or place" aria-controls="suggest">
              <button class="clear" type="button" aria-label="Clear search" hidden>${svg(ICON.x)}</button>
            </div>
            <ul class="suggest" id="suggest" hidden></ul>
          </div>
        </div>
      </section>
      <div class="home-foot"><a class="btn btn-quiet browse" href="#/churches">${svg(ICON.map)}<span>Browse all churches on a map</span></a></div>`;
    view.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
      store.set("mgw-mode", r.value);
      const a = view.querySelector(".again");
      if (a) a.href = a.href.replace(/mode=\w+/, `mode=${r.value}`);
    }));
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
    clearable(input, () => { list.hidden = true; });
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
    const title = (x) => (x.BUILDING && x.BUILDING !== "NIL" ? x.BUILDING : x.SEARCHVAL)
      .replace(/\b\w+/g, (w) => (/^(MRT|LRT|NUS|NTU|SMU|CBD|HDB)$/.test(w) || /^[A-Z]{1,3}\d+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()));
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
    const myHash = location.hash;
    const stale = () => location.hash !== myHash;
    store.set("mgw-origin", { ...origin, label: from, at: Date.now() });
    const bar = `<div class="bar"><button class="back" type="button" aria-label="Back" onclick="location.hash='#/'">${svg(ICON.back)}</button>
      <span class="from">From ${esc(from)} · ${mode.label}</span></div>`;
    view.innerHTML = `${bar}<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p id="step">Looking at Mass times at 32 parishes…</p></div>`;
    const stepTimer = setTimeout(() => { const el = document.getElementById("step"); if (el) el.textContent = `Checking ${mode.id === "transit" ? "bus & MRT routes" : mode.id === "drive" ? "driving routes" : "walking routes"} from ${from}…`; }, 900);
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
        view.innerHTML = `${bar}<section class="answer reveal"><h1>No Mass you can reach in the next two days.</h1>
          <p class="lede">Try another way of travelling, or browse the churches and their times.</p>
          <p style="margin-top:28px"><a class="btn btn-quiet" href="#/churches">Browse all churches</a></p></section>`;
        painted = true;
        return;
      }
      const start = new Date(b.start).getTime(), leave = new Date(b.leaveBy).getTime();
      const t = clockParts(start);
      const p = b.parish;
      const est = b.travelSource === "estimate";
      const leaveText = leave - Date.now() < 2 * 60000 ? "Leave now" : `Leave by ${clock(leave)}`;
      const meta = [b.language !== "English" ? `${b.language} Mass` : "", b.note].filter(Boolean).join(" · ");
      const special = S.specialDay(start, d);
      const alt = (res.alternatives || []).filter(Boolean);
      const near = res.nearest && res.nearest.parish.id !== p.id ? res.nearest : null;
      view.innerHTML = `${bar}
        <section class="answer reveal">
          <p class="day">${dayLabel(start)}${start - Date.now() < 12 * 3600e3 ? `, ${until(start)}` : ""}</p>
          <p class="time">${t.hm}<small>${t.ap}</small></p>
          <h1 class="church">${esc(p.name)}</h1>
          ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
          <div class="leave" id="leave"><strong>${leaveText}</strong><span>${est ? "about " : ""}${mins(b.travelMin)} ${mode.phrase}</span></div>
          <a class="btn btn-primary" href="${gmaps(p, mode.id, origin)}" target="_blank" rel="noopener">${svg(ICON.nav)}<span>Navigate</span></a>
          <div class="sub"><a class="link" href="#/church/${p.id}">Mass times at this church</a></div>
          ${est ? `<p class="est" style="text-align:center">Travel time is an estimate; checking live routes…</p>` : ""}
          ${special ? `<p class="notice">${esc(special)}: Mass times often change ${dayKey(start) === dayKey(Date.now()) ? "today" : "that day"}. Please check with the parish.</p>` : ""}
          ${alt.length || near ? `<button class="see-more" type="button" onclick="document.getElementById('more').scrollIntoView({ behavior: 'smooth' })">${svg(ICON.down)}<span>${alt.length ? "More churches you can make it to" : "See the nearest church"}</span></button>` : ""}
        </section>
        ${alt.length || near ? `<section class="more" id="more" aria-label="Other options">
          ${alt.length ? `<h2>Other churches you can make it to</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
          ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
            <a class="row" href="#/church/${near.parish.id}">${near.next ? `<span class="t">${clock(new Date(near.next.start).getTime())}<small>${dayLabel(new Date(near.next.start).getTime())}</small></span>` : `<span class="t">–</span>`}
            <span class="n">${esc(near.parish.name)}<small>${near.next ? `Leave by ${clock(new Date(near.next.leaveBy).getTime())}` : "No reachable Mass in the next two days"}</small></span><span class="d">${mins(near.travelMin)}</span></a></li></ul>` : ""}
        </section>` : ""}
        <p class="browse-wrap"><a class="btn btn-quiet browse" href="#/churches">${svg(ICON.map)}<span>See all churches on a map</span></a></p>
        <p class="source">${sourceLine(d.parishes.find((x) => x.id === p.id))} Please confirm feast days with the parish.</p>
        <p class="blessing">${esc(blessing(start))}</p>`;
      rememberTrips(origin, mode.id, [b, ...alt, near && near.next && { ...near.next, parish: near.parish, travelMin: near.travelMin, travelSource: near.travelSource }]);
      view.focus({ preventScroll: true });
      tickLeave(start, leave, b.travelMin, est, mode);
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
      if (leaveBox) {
        const leaveText = leave - Date.now() < 2 * 60000 ? "Leave now" : `Leave by ${clock(leave)}`;
        leaveBox.innerHTML = `<strong>${leaveText}</strong><span>${est ? "about " : ""}${mins(b.travelMin)} ${mode.phrase}</span>`;
      }
      // drop the "checking live routes…" note once we have exact numbers
      const estNote = view.querySelector(".answer .est");
      if (estNote && !est) estNote.remove();
      tickLeave(new Date(b.start).getTime(), leave, b.travelMin, est, mode);
      // re-render only the "other options" block with exact times (keeps the hero steady)
      const alt = (res.alternatives || []).filter(Boolean);
      const near = res.nearest && res.nearest.parish.id !== b.parish.id ? res.nearest : null;
      const more = view.querySelector("section.more");
      if (more) {
        more.innerHTML = `${alt.length ? `<h2>Other churches you can make it to</h2><ul class="rows">${alt.map((a) => row(a, mode)).join("")}</ul>` : ""}
          ${near ? `<h2 style="margin-top:${alt.length ? 26 : 0}px">Nearest church</h2><ul class="rows"><li>
            <a class="row" href="#/church/${near.parish.id}">${near.next ? `<span class="t">${clock(new Date(near.next.start).getTime())}<small>${dayLabel(new Date(near.next.start).getTime())}</small></span>` : `<span class="t">–</span>`}
            <span class="n">${esc(near.parish.name)}<small>${near.next ? `Leave by ${clock(new Date(near.next.leaveBy).getTime())}` : "No reachable Mass in the next two days"}</small></span><span class="d">${mins(near.travelMin)}</span></a></li></ul>` : ""}`;
      }
      rememberTrips(origin, mode.id, [b, ...alt, near && near.next && { ...near.next, parish: near.parish, travelMin: near.travelMin, travelSource: near.travelSource }]);
    };
    try {
      const full = await fetchNext(q, false);
      if (!stale()) refine(full);
    } catch { /* keep the estimate frame on network failure */ }
    if (!painted) {
      view.innerHTML = `${bar}<section class="answer"><h1>We couldn’t check Mass times just now.</h1>
        <p class="lede">Check your connection and try again.</p>
        <p style="margin-top:28px"><button class="btn btn-primary" type="button" onclick="window.dispatchEvent(new HashChangeEvent('hashchange'))">Try again</button></p></section>`;
    }
  }
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
    for (const e of list) if (e && e.parish) trips[e.parish.id] = { minutes: e.travelMin, source: e.travelSource };
    store.set("mgw-trips", { key: `${origin.lat},${origin.lng},${mode}`, at: Date.now(), trips });
  }
  function tripTo(p, origin, mode) {
    const t = store.get("mgw-trips");
    if (t && t.key === `${origin.lat},${origin.lng},${mode}` && Date.now() - t.at < 30 * 60000 && t.trips[p.id]) return t.trips[p.id];
    return { minutes: R.estimateMinutes(R.haversineKm(origin, p), mode), source: "estimate" };
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
      <span class="d">${mins(a.travelMin)}</span></a></li>`;
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
      if (n) lead = `<div class="next-here"><strong>Next Mass you can make: ${clock(n.start)} ${dayLabel(n.start).toLowerCase()}</strong>
        <span>Leave by ${about}${clock(n.start - (t.minutes + R.BUFFER_MIN) * 60000)} · ${about}${mins(t.minutes)} ${modeOf(mode).phrase}</span></div>`;
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
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const map = new ml.Map({
      container: mapEl,
      style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`,
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
