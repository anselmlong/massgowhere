(async function () {
  const S = window.MassSchedule;
  const data = await (await fetch("data.json", { cache: "no-cache" })).json();
  const byId = new Map(data.parishes.map((p) => [p.id, p]));

  const state = { tab: "masses", sort: "time", lang: "", mode: "transit", me: null, shown: 40 };
  const $ = (id) => document.getElementById(id);

  // ---------- time + distance helpers ----------
  const tz = { timeZone: "Asia/Singapore" };
  // "12:00 MN" is stored as 23:59 (myCatholicSG's convention)
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-GB", { ...tz, hour: "2-digit", minute: "2-digit" }) === "23:59" ? "Midnight" : new Date(ms).toLocaleTimeString("en-SG", { ...tz, hour: "numeric", minute: "2-digit" }).replace(" ", " ");
  const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", tz);
  function fmtDay(ms) {
    const now = Date.now();
    if (dayKey(ms) === dayKey(now)) return "Today";
    if (dayKey(ms) === dayKey(now + 864e5)) return "Tomorrow";
    return new Date(ms).toLocaleDateString("en-SG", { ...tz, weekday: "short", day: "numeric", month: "short" });
  }
  function fmtIn(ms) {
    const m = Math.round((ms - Date.now()) / 60000);
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `in ${h}h ${m % 60}m` : fmtDay(ms);
  }
  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Rough door-to-door estimates from straight-line distance (roads are ~1.3x longer).
  function travel(distKm) {
    const road = distKm * 1.3;
    return {
      walking: Math.round((road / 4.8) * 60),
      driving: Math.round(4 + (road / 30) * 60),
      transit: Math.round(10 + (road / 17) * 60),
    };
  }
  const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000 / 10) * 10} m` : `${d.toFixed(1)} km`);
  const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);
  const modeLabel = { transit: "by transit", driving: "by car", walking: "walking" };
  const gmaps = (p, mode) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, ${p.address}, Singapore ${p.postal || ""}`)}&travelmode=${mode}` +
    (state.me ? `&origin=${state.me.lat},${state.me.lng}` : "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shortName = (n) => n.replace(/^Church of (the )?/, "").replace(/^St /, "St ");

  // ---------- data ----------
  function events() {
    const all = S.expandAll(data, Date.now(), 8);
    return state.lang ? all.filter((e) => e.lang === state.lang) : all;
  }
  function dist(p) {
    return state.me ? km(state.me, p) : null;
  }

  const langs = [...new Set(Object.values(data.rules).flat().map((r) => r.lang))].sort((a, b) => (a === "English" ? -1 : b === "English" ? 1 : a.localeCompare(b)));
  $("lang").insertAdjacentHTML("beforeend", langs.map((l) => `<option>${esc(l)}</option>`).join(""));
  $("asof").textContent = new Date(data.asOf + "T12:00:00+08:00").toLocaleDateString("en-SG", { ...tz, day: "numeric", month: "short", year: "numeric" });

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([1.3521, 103.8198], 11);
  L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png", {
    minZoom: 11, maxZoom: 19, detectRetina: true,
    attribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:14px;width:14px;vertical-align:-2px"> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>',
  }).addTo(map);
  map.setMaxBounds([[1.13, 103.55], [1.5, 104.1]]);

  const pinIcon = (hl) => L.divIcon({ className: "", html: `<div class="pin${hl ? " hl" : ""}"><span>✝</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] });
  const markers = new Map();
  for (const p of data.parishes) {
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(false), title: p.name, keyboard: true }).addTo(map);
    m.on("click", () => openSheet(p.id));
    markers.set(p.id, m);
  }
  let meMarker = null;
  function setMe(lat, lng, source) {
    state.me = { lat, lng, source };
    const icon = L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    if (meMarker) meMarker.setLatLng([lat, lng]);
    else meMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000, title: "You" }).addTo(map);
    state.sort = "distance";
    $("sort").value = "distance";
    const near = [...data.parishes].sort((a, b) => km(state.me, a) - km(state.me, b)).slice(0, 3);
    map.fitBounds(L.latLngBounds([[lat, lng], ...near.map((p) => [p.lat, p.lng])]).pad(0.25), { maxZoom: 15 });
    $("loc-hint").textContent = source === "gps" ? "Using your current location." : "Using the spot you tapped. Tap again to move it.";
    render();
  }
  map.on("click", (e) => setMe(e.latlng.lat, e.latlng.lng, "tap"));

  $("locate").addEventListener("click", () => {
    const btn = $("locate");
    if (!navigator.geolocation) return ($("loc-hint").textContent = "Your browser can't share location. Tap the map instead.");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.disabled = false;
        btn.querySelector("span").textContent = "Update my location";
        setMe(pos.coords.latitude, pos.coords.longitude, "gps");
      },
      (err) => {
        btn.disabled = false;
        btn.querySelector("span").textContent = "Use my location";
        $("loc-hint").textContent = err.code === 1
          ? "Location permission was blocked. Allow it in your browser settings, or tap the map instead."
          : "Couldn't get your location. Tap the map to set a starting point.";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });

  // ---------- rendering ----------
  function summary(evs) {
    const el = $("summary");
    if (!state.me) return (el.hidden = true);
    const ranked = [...data.parishes].map((p) => ({ p, d: km(state.me, p) })).sort((a, b) => a.d - b.d);
    const nearest = ranked[0];
    const nextAtNearest = evs.find((e) => e.pid === nearest.p.id);
    // earliest Mass you can still get to with the chosen travel mode (+5 min buffer)
    const reachable = evs.find((e) => {
      const p = byId.get(e.pid);
      const d = km(state.me, p);
      return d <= 8 && e.start - Date.now() >= (travel(d)[state.mode] + 5) * 60000;
    });
    const t = (d) => `${fmtKm(d)} · ~${fmtMin(travel(d)[state.mode])} ${modeLabel[state.mode]}`;
    let html = `<div class="card"><div class="label">Nearest church</div>
      <div class="big">${esc(nearest.p.name)}</div>
      <div class="meta">${t(nearest.d)}${nextAtNearest ? ` · next Mass <b>${fmtDay(nextAtNearest.start)} ${fmtTime(nextAtNearest.start)}</b>` : ""}</div>
      <div class="actions"><a class="chip-btn go" href="${gmaps(nearest.p, state.mode)}" target="_blank" rel="noopener">Directions</a>
      <button class="chip-btn" data-open="${nearest.p.id}">Mass times</button></div></div>`;
    if (reachable) {
      const p = byId.get(reachable.pid), d = km(state.me, p);
      html += `<div class="card"><div class="label">Next Mass you can make</div>
        <div class="big">${fmtTime(reachable.start)} <span style="font-size:15px;font-weight:500">${fmtDay(reachable.start)} · ${fmtIn(reachable.start)}</span></div>
        <div class="meta">${esc(p.name)}${reachable.lang !== "English" ? ` <span class="tag">${esc(reachable.lang)}</span>` : ""}<br>${t(d)}</div>
        <div class="actions"><a class="chip-btn go" href="${gmaps(p, state.mode)}" target="_blank" rel="noopener">Directions</a>
        <button class="chip-btn" data-open="${p.id}">Church details</button></div></div>`;
    }
    el.innerHTML = html;
    el.hidden = false;
  }

  function distCell(p) {
    const d = dist(p);
    if (d == null) return "";
    return `<b>${fmtKm(d)}</b>~${fmtMin(travel(d)[state.mode])}`;
  }

  function renderMasses(evs) {
    let list = evs;
    if (state.sort === "distance" && state.me) {
      // nearest churches first; within a church, soonest first; show each church's next few Masses
      const perChurch = new Map();
      for (const e of evs) {
        const arr = perChurch.get(e.pid) || [];
        if (arr.length < 3) arr.push(e);
        perChurch.set(e.pid, arr);
      }
      list = [...perChurch.entries()].sort((a, b) => dist(byId.get(a[0])) - dist(byId.get(b[0]))).flatMap(([, arr]) => arr);
    }
    if (!list.length) return `<li class="empty">No Masses found for this filter in the next week.</li>`;
    return list.slice(0, state.shown).map((e) => {
      const p = byId.get(e.pid);
      return `<li class="item" tabindex="0" data-open="${p.id}">
        <div class="when"><div class="t">${fmtTime(e.start)}</div><div class="d">${fmtDay(e.start)}</div></div>
        <div class="what"><div class="n">${esc(shortName(p.name))}${e.lang !== "English" ? `<span class="tag">${esc(e.lang)}</span>` : ""}</div>
          <div class="m">${esc([e.loc !== "Main Church" ? e.loc : "", e.note].filter(Boolean).join(" · ") || fmtIn(e.start))}</div></div>
        <div class="dist">${distCell(p)}</div></li>`;
    }).join("") + (list.length > state.shown ? `<li><button class="chip-btn more" id="more">Show more</button></li>` : "");
  }

  function renderChurches(evs) {
    const nextBy = new Map();
    for (const e of evs) if (!nextBy.has(e.pid)) nextBy.set(e.pid, e);
    let ps = [...data.parishes];
    if (state.sort === "distance" && state.me) ps.sort((a, b) => dist(a) - dist(b));
    else ps.sort((a, b) => (nextBy.get(a.id)?.start ?? Infinity) - (nextBy.get(b.id)?.start ?? Infinity));
    return ps.map((p) => {
      const n = nextBy.get(p.id);
      return `<li class="item" tabindex="0" data-open="${p.id}">
        <div class="when">${n ? `<div class="t">${fmtTime(n.start)}</div><div class="d">${fmtDay(n.start)}</div>` : `<div class="d">—</div>`}</div>
        <div class="what"><div class="n">${esc(p.name)}</div><div class="m">${esc(p.address)}</div></div>
        <div class="dist">${distCell(p)}</div></li>`;
    }).join("");
  }

  function render() {
    const evs = events();
    summary(evs);
    $("list").innerHTML = state.tab === "masses" ? renderMasses(evs) : renderChurches(evs);
    const hl = new Set(evs.slice(0, 1).map((e) => e.pid));
    for (const [id, m] of markers) m.setIcon(pinIcon(hl.has(id)));
  }

  // ---------- church detail ----------
  function openSheet(id) {
    const p = byId.get(id);
    const evs = S.expandParish(String(id), data, Date.now(), 7).filter((e) => !state.lang || e.lang === state.lang);
    const days = new Map();
    for (const e of evs) {
      const k = fmtDay(e.start);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(e);
    }
    const d = dist(p);
    const tr = d != null ? travel(d) : null;
    $("sheet-body").innerHTML = `
      <h2 id="sheet-title">${esc(p.name)}</h2>
      <p class="addr">${esc(p.address)}, Singapore ${esc(p.postal || "")}${d != null ? ` · ${fmtKm(d)} away` : ""}</p>
      ${tr ? `<div class="travel"><div><b>~${fmtMin(tr.transit)}</b>transit</div><div><b>~${fmtMin(tr.driving)}</b>car</div><div><b>~${fmtMin(tr.walking)}</b>walk</div></div>` : ""}
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="chip-btn go" href="${gmaps(p, state.mode)}" target="_blank" rel="noopener">Directions in Google Maps</a>
        ${p.link ? `<a class="chip-btn" href="https://mycatholic.sg/parish/${encodeURIComponent(p.link)}" target="_blank" rel="noopener">Parish page</a>` : ""}
        ${p.phone ? `<a class="chip-btn" href="tel:${esc(p.phone.replace(/\s/g, ""))}">Call</a>` : ""}
      </div>
      <div class="week">${[...days].map(([k, es]) => `<h3>${esc(k)}</h3><ul>${es.map((e) =>
        `<li><span class="t">${fmtTime(e.start)}</span><span>${esc(e.lang)}${e.loc !== "Main Church" ? ` · ${esc(e.loc)}` : ""}${e.note ? ` <span class="x">· ${esc(e.note)}</span>` : ""}</span></li>`).join("")}</ul>`).join("") ||
        `<p class="empty">No Masses listed for the next week${state.lang ? ` in ${esc(state.lang)}` : ""}.</p>`}</div>`;
    $("sheet").hidden = false;
    $("sheet-close").focus();
    map.panTo([p.lat, p.lng]);
  }
  const closeSheet = () => ($("sheet").hidden = true);
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // ---------- controls ----------
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open && !e.target.closest("a")) return openSheet(Number(open.dataset.open));
    if (e.target.id === "more") { state.shown += 40; render(); }
  });
  $("list").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.open) openSheet(Number(e.target.dataset.open));
  });
  for (const t of document.querySelectorAll(".tab")) {
    t.addEventListener("click", () => {
      state.tab = t.dataset.tab;
      state.shown = 40;
      document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      render();
    });
  }
  $("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    if (state.sort === "distance" && !state.me) $("loc-hint").textContent = "Share your location (or tap the map) to sort by distance.";
    render();
  });
  $("lang").addEventListener("change", (e) => { state.lang = e.target.value; state.shown = 40; render(); });
  $("mode").addEventListener("change", (e) => { state.mode = e.target.value; render(); });

  render();
  setInterval(render, 60000); // keep "next Mass" fresh while the page is open
})();
