/* Fish Tracker – Fänge, Spots, Beißzeiten & Techniken mit Karte.
 * Alle Daten bleiben lokal auf dem Gerät (IndexedDB).
 */
(() => {
  "use strict";

  // ---------- Hilfsfunktionen ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, "0");
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toDateInput = (d) => toLocalInput(d).slice(0, 10);
  const fmtTime = (d) => (d instanceof Date && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "–");
  const fmtDate = (s) => new Date(s).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ---------- Datenbank (IndexedDB) ----------
  const DB = {
    db: null,
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open("fishtracker", 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("catches")) db.createObjectStore("catches", { keyPath: "id" });
          if (!db.objectStoreNames.contains("spots")) db.createObjectStore("spots", { keyPath: "id" });
        };
        r.onsuccess = () => { this.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      });
    },
    tx(store, mode, fn) {
      return new Promise((res, rej) => {
        const t = this.db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    },
    all(store) { return this.tx(store, "readonly", (s) => s.getAll()); },
    put(store, obj) { return this.tx(store, "readwrite", (s) => s.put(obj)); },
    del(store, id) { return this.tx(store, "readwrite", (s) => s.delete(id)); },
  };

  // ---------- Zustand ----------
  const state = {
    catches: [],
    spots: [],
    pos: null, // {lat,lng} – letzter GPS-Standort
    pickCallback: null,
    timesDate: new Date(),
  };
  const DEFAULT_CENTER = [51.163, 10.447]; // Deutschland
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ft_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ft_" + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- Navigation ----------
  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    store.set("view", name);
    if (name === "map") setTimeout(() => map.invalidateSize(), 50);
    if (name === "times") renderTimes();
    if (name === "stats") renderStats();
  }
  $$(".tabbar button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  // ---------- Karte ----------
  const map = L.map("map", { zoomControl: false }).setView(store.get("mapCenter", DEFAULT_CENTER), store.get("mapZoom", 6));
  L.control.zoom({ position: "topright" }).addTo(map);

  const baseLayers = {
    "Karte": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }),
    "Satellit": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
    }),
    "Topo": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, attribution: '&copy; OpenStreetMap, SRTM | <a href="https://opentopomap.org">OpenTopoMap</a>',
    }),
  };
  const seamarks = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>',
  });
  const catchLayer = L.layerGroup().addTo(map);
  const spotLayer = L.layerGroup().addTo(map);
  const publicLayer = L.layerGroup().addTo(map);

  (baseLayers[store.get("baseLayer", "Karte")] || baseLayers["Karte"]).addTo(map);
  L.control.layers(baseLayers, { "Seezeichen (OpenSeaMap)": seamarks, "Öffentliche Angelplätze": publicLayer }, { position: "topleft" }).addTo(map);
  map.on("baselayerchange", (e) => store.set("baseLayer", e.name));
  map.on("moveend", () => { store.set("mapCenter", [map.getCenter().lat, map.getCenter().lng]); store.set("mapZoom", map.getZoom()); });

  // Button: öffentliche Angelplätze (OpenStreetMap / Overpass) suchen
  const FindCtl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const b = L.DomUtil.create("button", "btn small");
      b.style.boxShadow = "var(--shadow)";
      b.textContent = "🔎 Angelplätze hier suchen";
      L.DomEvent.disableClickPropagation(b);
      b.onclick = findPublicSpots;
      return b;
    },
  });
  new FindCtl().addTo(map);

  const icon = (kind, emoji) => L.divIcon({
    className: "", iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30],
    html: `<div class="marker-pin marker-${kind}"><span>${emoji}</span></div>`,
  });

  let meMarker;
  function locate(fly = true) {
    if (!navigator.geolocation) { toast("Standort wird nicht unterstützt"); return Promise.resolve(null); }
    return new Promise((res) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          state.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
          store.set("lastPos", state.pos);
          const ll = [state.pos.lat, state.pos.lng];
          if (!meMarker) meMarker = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16] }), zIndexOffset: 1000 }).addTo(map).bindPopup("Du bist hier");
          else meMarker.setLatLng(ll);
          if (fly) map.flyTo(ll, Math.max(map.getZoom(), 14));
          res(state.pos);
        },
        () => { if (fly) toast("Standort nicht verfügbar – Berechtigung prüfen"); res(null); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  }
  $("#btnLocate").addEventListener("click", () => locate(true));

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (state.pickCallback) {
      const cb = state.pickCallback;
      state.pickCallback = null;
      cb({ lat, lng });
      return;
    }
    const el = document.createElement("div");
    el.innerHTML = `<div class="coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
      <button class="btn primary" data-a="c">🐟 Fang hier</button><button class="btn" data-a="s">📍 Spot hier</button>`;
    const pop = L.popup().setLatLng(e.latlng).setContent(el).openOn(map);
    el.querySelector('[data-a="c"]').onclick = () => { map.closePopup(pop); openCatchForm({ lat, lng }); };
    el.querySelector('[data-a="s"]').onclick = () => { map.closePopup(pop); openSpotForm({ lat, lng }); };
  });

  function renderMarkers() {
    catchLayer.clearLayers();
    spotLayer.clearLayers();
    if ($("#showCatches").checked) {
      state.catches.filter((c) => c.lat != null).forEach((c) => {
        const el = document.createElement("div");
        el.innerHTML = `<b>${esc(c.species || "Fang")}</b>${c.length ? ` · ${esc(c.length)} cm` : ""}${c.weight ? ` · ${esc(c.weight)} kg` : ""}<br>
          <span class="muted">${esc(fmtDate(c.date))}</span><br>
          ${c.technique ? `🎣 ${esc(c.technique)}<br>` : ""}${c.bait ? `🪱 ${esc(c.bait)}<br>` : ""}
          ${c.photo ? `<img src="${c.photo}" style="max-width:180px;border-radius:8px;margin-top:4px">` : ""}
          <div><button class="btn small">Bearbeiten</button></div>`;
        el.querySelector("button").onclick = () => openCatchForm(c);
        L.marker([c.lat, c.lng], { icon: icon("catch", "🐟") }).bindPopup(el).addTo(catchLayer);
      });
    }
    if ($("#showSpots").checked) {
      state.spots.forEach((s) => {
        const n = state.catches.filter((c) => c.spotId === s.id).length;
        const el = document.createElement("div");
        el.innerHTML = `<b>${esc(s.name)}</b><br>${s.water ? esc(s.water) + "<br>" : ""}
          ${s.species ? `🐟 ${esc(s.species)}<br>` : ""}<span class="muted">${n} Fänge</span>
          <div><button class="btn small primary" data-a="c">Fang hier</button><button class="btn small" data-a="e">Bearbeiten</button></div>`;
        el.querySelector('[data-a="c"]').onclick = () => openCatchForm({ lat: s.lat, lng: s.lng, spotId: s.id });
        el.querySelector('[data-a="e"]').onclick = () => openSpotForm(s);
        L.marker([s.lat, s.lng], { icon: icon("spot", "📍") }).bindPopup(el).addTo(spotLayer);
      });
    }
  }
  $("#showCatches").addEventListener("change", renderMarkers);
  $("#showSpots").addEventListener("change", renderMarkers);

  async function findPublicSpots() {
    if (map.getZoom() < 10) { toast("Bitte weiter hineinzoomen (Region/Stadt)"); return; }
    if (!navigator.onLine) { toast("Dafür wird Internet benötigt"); return; }
    const b = map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",");
    const q = `[out:json][timeout:25];(nwr["leisure"="fishing"](${bbox});nwr["fishing"="yes"](${bbox});nwr["leisure"="slipway"](${bbox});nwr["leisure"="marina"](${bbox}););out center 300;`;
    toast("Suche Angelplätze …", 8000);
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      publicLayer.clearLayers();
      if (!map.hasLayer(publicLayer)) publicLayer.addTo(map);
      data.elements.forEach((el) => {
        const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
        if (lat == null) return;
        const t = el.tags || {};
        const kind = t.leisure === "slipway" ? "Slipanlage" : t.leisure === "marina" ? "Hafen/Marina" : "Angelplatz";
        const name = t.name || kind;
        const div = document.createElement("div");
        div.innerHTML = `<b>${esc(name)}</b><br><span class="muted">${esc(kind)} · OpenStreetMap</span>
          ${t.fishing && t.fishing !== "yes" ? `<br>Angeln: ${esc(t.fishing)}` : ""}${t.description ? `<br>${esc(t.description)}` : ""}
          <div><button class="btn small primary">Als Spot speichern</button></div>`;
        div.querySelector("button").onclick = () => openSpotForm({ lat, lng, name, notes: `Aus OpenStreetMap (${kind}). Erlaubnis/Gewässerkarte prüfen.` });
        L.marker([lat, lng], { icon: icon("spot", "🎣"), opacity: 0.85 }).bindPopup(div).addTo(publicLayer);
      });
      toast(data.elements.length ? `${data.elements.length} Orte gefunden` : "Keine eingetragenen Angelplätze in diesem Ausschnitt");
    } catch {
      toast("Suche fehlgeschlagen – später erneut versuchen");
    }
  }

  // ---------- Formular-Dialog ----------
  const sheet = $("#sheet");
  let sheetSubmit = null, sheetDelete = null;
  $$("[data-close]", sheet).forEach((b) => b.addEventListener("click", () => sheet.close()));
  $("#sheetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sheetSubmit && (await sheetSubmit()) !== false) sheet.close();
  });
  $("#sheetDelete").addEventListener("click", async () => {
    if (sheetDelete && confirm("Wirklich löschen?")) { await sheetDelete(); sheet.close(); }
  });
  function openSheet(title, html, onSubmit, onDelete) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    sheetSubmit = onSubmit;
    sheetDelete = onDelete;
    $("#sheetDelete").hidden = !onDelete;
    if (!sheet.open) sheet.showModal();
    $("#sheetBody").scrollTop = 0;
  }
  const field = (label, inner, full) => `<label class="field${full ? " full" : ""}"><span>${label}</span>${inner}</label>`;
  const formVals = () => Object.fromEntries(new FormData($("#sheetForm")).entries());

  function locationBlock(o) {
    return `<div class="field full"><span>Position</span>
      <div class="row wrap"><span class="coord" id="fCoord">${o.lat != null ? `${(+o.lat).toFixed(5)}, ${(+o.lng).toFixed(5)}` : "keine"}</span>
      <span class="grow"></span>
      <button type="button" class="btn small" id="fGps">📡 GPS</button>
      <button type="button" class="btn small" id="fPick">🗺️ Auf Karte wählen</button></div>
      <input type="hidden" name="lat" value="${o.lat ?? ""}"><input type="hidden" name="lng" value="${o.lng ?? ""}"></div>`;
  }
  function wireLocation(reopen) {
    const setPos = (p) => {
      $('[name="lat"]').value = p.lat; $('[name="lng"]').value = p.lng;
      $("#fCoord").textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    };
    $("#fGps").onclick = async () => { const p = await locate(false); if (p) setPos(p); else toast("Kein GPS-Signal"); };
    $("#fPick").onclick = () => {
      const draft = formVals();
      sheet.close();
      showView("map");
      toast("Tippe auf die Karte, um die Position zu wählen", 5000);
      state.pickCallback = (p) => reopen({ ...draft, lat: p.lat, lng: p.lng });
    };
  }

  // ---------- Fänge ----------
  function speciesOptions() {
    const set = new Set(window.FISH_GUIDE.flatMap((f) => f.name.split(" & ")));
    ["Rapfen", "Karausche", "Rotfeder", "Äsche", "Saibling", "Regenbogenforelle", "Meerforelle", "Dorsch", "Hering", "Makrele", "Plattfisch", "Graskarpfen", "Ukelei", "Gründling"].forEach((s) => set.add(s));
    state.catches.forEach((c) => c.species && set.add(c.species));
    return [...set].sort((a, b) => a.localeCompare(b, "de")).map((s) => `<option value="${esc(s)}">`).join("");
  }
  function techniqueOptions() {
    const set = new Set(window.TECHNIQUES.map((t) => t.name));
    state.catches.forEach((c) => c.technique && set.add(c.technique));
    return [...set].map((s) => `<option value="${esc(s)}">`).join("");
  }

  async function openCatchForm(c = {}) {
    const existing = c.id ? state.catches.find((x) => x.id === c.id) : null;
    const o = { date: toLocalInput(new Date()), ...c };
    if (o.lat == null && !existing) {
      const p = state.pos || (store.get("lastPos") ?? null);
      if (p) { o.lat = p.lat; o.lng = p.lng; } else { o.lat = map.getCenter().lat; o.lng = map.getCenter().lng; }
    }
    let photo = o.photo || null;
    const spotsOpts = state.spots.map((s) => `<option value="${s.id}" ${o.spotId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const html = `
      ${field("Fischart *", `<input name="species" list="dlSpecies" required value="${esc(o.species)}" placeholder="z. B. Hecht"><datalist id="dlSpecies">${speciesOptions()}</datalist>`)}
      ${field("Datum & Uhrzeit", `<input type="datetime-local" name="date" value="${esc(o.date)}">`)}
      ${field("Länge (cm)", `<input type="number" name="length" step="0.5" min="0" inputmode="decimal" value="${esc(o.length)}">`)}
      ${field("Gewicht (kg)", `<input type="number" name="weight" step="0.01" min="0" inputmode="decimal" value="${esc(o.weight)}">`)}
      ${field("Technik", `<input name="technique" list="dlTech" value="${esc(o.technique)}" placeholder="z. B. Spinnfischen"><datalist id="dlTech">${techniqueOptions()}</datalist>`)}
      ${field("Köder", `<input name="bait" value="${esc(o.bait)}" placeholder="z. B. Gummifisch 12 cm">`)}
      ${field("Spot", `<select name="spotId"><option value="">– keiner –</option>${spotsOpts}</select>`)}
      ${field("Wassertiefe (m)", `<input type="number" name="depth" step="0.1" min="0" inputmode="decimal" value="${esc(o.depth)}">`)}
      ${locationBlock(o)}
      ${field("Zurückgesetzt?", `<select name="released"><option value="">–</option><option value="ja" ${o.released === "ja" ? "selected" : ""}>Ja, released</option><option value="nein" ${o.released === "nein" ? "selected" : ""}>Nein, entnommen</option></select>`)}
      ${field("Foto", `<input type="file" accept="image/*" id="fPhoto"><img id="fPhotoPrev" class="photo-prev" ${photo ? `src="${photo}"` : "hidden"}>`)}
      ${field("Notizen", `<textarea name="notes" placeholder="Wetter, Wasser, Besonderheiten …">${esc(o.notes)}</textarea>`, true)}
      ${existing?.weather ? `<p class="small muted field full">Wetter beim Fang: ${esc(weatherSummary(existing.weather))}</p>` : ""}`;
    openSheet(existing ? "Fang bearbeiten" : "Neuer Fang", html, async () => {
      const v = formVals();
      if (!v.species.trim()) return false;
      const rec = {
        ...(existing || { id: uid(), created: Date.now() }),
        species: v.species.trim(), date: v.date || toLocalInput(new Date()),
        length: num(v.length), weight: num(v.weight), depth: num(v.depth),
        technique: v.technique.trim(), bait: v.bait.trim(), spotId: v.spotId || null,
        released: v.released, notes: v.notes.trim(),
        lat: num(v.lat), lng: num(v.lng), photo,
      };
      if (!existing && navigator.onLine && rec.lat != null && Math.abs(new Date(rec.date) - Date.now()) < 3 * 3600e3) {
        rec.weather = await fetchCurrentWeather(rec.lat, rec.lng).catch(() => null);
      }
      await DB.put("catches", rec);
      await reload();
      toast(existing ? "Fang aktualisiert" : "Petri Heil! Fang gespeichert 🎣");
    }, existing ? async () => { await DB.del("catches", existing.id); await reload(); toast("Fang gelöscht"); } : null);
    // Wenn der Dialog aus dem Kartenwähler wieder geöffnet wird, Original-Datensatz behalten
    wireLocation((d) => openCatchForm({ ...(existing || {}), ...d, photo, id: existing?.id }));
    $("#fPhoto").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      photo = await resizeImage(f, 1280, 0.75);
      const img = $("#fPhotoPrev"); img.src = photo; img.hidden = false;
    });
  }

  function resizeImage(file, max, quality) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        res(cv.toDataURL("image/jpeg", quality));
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  function renderCatches() {
    const q = $("#catchSearch").value.trim().toLowerCase();
    const list = state.catches
      .filter((c) => !q || [c.species, c.bait, c.technique, c.notes, spotName(c.spotId)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    $("#catchList").innerHTML = list.length ? list.map((c) => `
      <div class="item" data-id="${c.id}">
        ${c.photo ? `<img src="${c.photo}" alt="">` : `<div class="ph">🐟</div>`}
        <div class="meta">
          <div class="title">${esc(c.species)}${c.length ? ` · ${esc(c.length)} cm` : ""}${c.weight ? ` · ${esc(c.weight)} kg` : ""}</div>
          <div class="sub">${esc(fmtDate(c.date))}${c.spotId ? ` · ${esc(spotName(c.spotId))}` : ""}</div>
          <div>${c.technique ? `<span class="tag">🎣 ${esc(c.technique)}</span>` : ""}${c.bait ? `<span class="tag">🪱 ${esc(c.bait)}</span>` : ""}${c.released === "ja" ? `<span class="tag">↩️ released</span>` : ""}</div>
        </div>
        ${c.lat != null ? `<button class="icon" data-map="${c.id}" title="Auf Karte zeigen">🗺️</button>` : ""}
      </div>`).join("")
      : `<div class="empty"><div class="big">🎣</div>${q ? "Keine Treffer." : "Noch keine Fänge. Trag deinen ersten Fang ein!"}</div>`;
  }
  $("#catchList").addEventListener("click", (e) => {
    const m = e.target.closest("[data-map]");
    if (m) { const c = state.catches.find((x) => x.id === m.dataset.map); showView("map"); map.flyTo([c.lat, c.lng], 15); return; }
    const it = e.target.closest(".item");
    if (it) openCatchForm(state.catches.find((x) => x.id === it.dataset.id));
  });
  $("#catchSearch").addEventListener("input", renderCatches);

  // ---------- Spots ----------
  const spotName = (id) => state.spots.find((s) => s.id === id)?.name || "";

  function openSpotForm(s = {}) {
    const existing = s.id ? state.spots.find((x) => x.id === s.id) : null;
    const o = { ...s };
    if (o.lat == null) { o.lat = map.getCenter().lat; o.lng = map.getCenter().lng; }
    const html = `
      ${field("Name *", `<input name="name" required value="${esc(o.name)}" placeholder="z. B. Schilfkante Nordufer">`, true)}
      ${field("Gewässer / Typ", `<input name="water" list="dlWater" value="${esc(o.water)}" placeholder="z. B. Baggersee"><datalist id="dlWater"><option value="See"><option value="Baggersee"><option value="Fluss"><option value="Bach"><option value="Kanal"><option value="Teich"><option value="Talsperre"><option value="Hafen"><option value="Küste / Meer"><option value="Forellensee"></datalist>`)}
      ${field("Zielfische", `<input name="species" value="${esc(o.species)}" placeholder="z. B. Hecht, Barsch">`)}
      ${field("Erlaubnis / Gewässerkarte", `<input name="permit" value="${esc(o.permit)}" placeholder="z. B. Vereinskarte, Tageskarte">`)}
      ${field("Bewertung", `<select name="rating">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${+o.rating === n ? "selected" : ""}>${n ? "★".repeat(n) : "–"}</option>`).join("")}</select>`)}
      ${locationBlock(o)}
      ${field("Notizen", `<textarea name="notes" placeholder="Tiefe, Struktur, Parken, Hänger …">${esc(o.notes)}</textarea>`, true)}`;
    openSheet(existing ? "Spot bearbeiten" : "Neuer Spot", html, async () => {
      const v = formVals();
      if (!v.name.trim()) return false;
      const rec = { ...(existing || { id: uid(), created: Date.now() }), name: v.name.trim(), water: v.water.trim(), species: v.species.trim(), permit: v.permit.trim(), rating: +v.rating || 0, notes: v.notes.trim(), lat: num(v.lat), lng: num(v.lng) };
      await DB.put("spots", rec);
      await reload();
      toast("Spot gespeichert 📍");
    }, existing ? async () => {
      await DB.del("spots", existing.id);
      for (const c of state.catches.filter((c) => c.spotId === existing.id)) await DB.put("catches", { ...c, spotId: null });
      await reload(); toast("Spot gelöscht");
    } : null);
    wireLocation((d) => openSpotForm({ ...(existing || {}), ...d, id: existing?.id }));
  }

  function renderSpots() {
    const q = $("#spotSearch").value.trim().toLowerCase();
    const list = state.spots
      .filter((s) => !q || [s.name, s.water, s.species, s.notes].join(" ").toLowerCase().includes(q))
      .map((s) => ({ ...s, n: state.catches.filter((c) => c.spotId === s.id).length }))
      .sort((a, b) => b.n - a.n || (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name));
    $("#spotList").innerHTML = list.length ? list.map((s) => {
      const top = topBy(state.catches.filter((c) => c.spotId === s.id), "species")[0];
      return `<div class="item" data-id="${s.id}">
        <div class="ph">📍</div>
        <div class="meta">
          <div class="title">${esc(s.name)} ${s.rating ? `<span class="stars small">${"★".repeat(s.rating)}</span>` : ""}</div>
          <div class="sub">${esc(s.water || "")}${s.species ? ` · ${esc(s.species)}` : ""}</div>
          <div><span class="tag">${s.n} Fänge</span>${top ? `<span class="tag">Top: ${esc(top[0])}</span>` : ""}${s.permit ? `<span class="tag">🎫 ${esc(s.permit)}</span>` : ""}</div>
        </div>
        <button class="icon" data-map="${s.id}" title="Auf Karte zeigen">🗺️</button>
      </div>`;
    }).join("") : `<div class="empty"><div class="big">📍</div>${q ? "Keine Treffer." : "Noch keine Spots gespeichert."}</div>`;
  }
  $("#spotList").addEventListener("click", (e) => {
    const m = e.target.closest("[data-map]");
    if (m) { const s = state.spots.find((x) => x.id === m.dataset.map); showView("map"); map.flyTo([s.lat, s.lng], 15); return; }
    const it = e.target.closest(".item");
    if (it) openSpotForm(state.spots.find((x) => x.id === it.dataset.id));
  });
  $("#spotSearch").addEventListener("input", renderSpots);

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    if (a.dataset.action === "new-catch") openCatchForm();
    if (a.dataset.action === "new-spot") openSpotForm(state.pos ? { ...state.pos } : {});
  });
  $("#fabCatch").addEventListener("click", () => openCatchForm());

  // ---------- Beißzeiten (Solunar) ----------
  const PHASES = [
    ["🌑", "Neumond"], ["🌒", "Zunehmende Sichel"], ["🌓", "Erstes Viertel"], ["🌔", "Zunehmender Mond"],
    ["🌕", "Vollmond"], ["🌖", "Abnehmender Mond"], ["🌗", "Letztes Viertel"], ["🌘", "Abnehmende Sichel"],
  ];
  const phaseInfo = (p) => PHASES[Math.round(p * 8) % 8];

  function solunar(date, lat, lng) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(day.getTime() + 864e5);
    const step = 6 * 60e3;
    const samples = [];
    for (let t = day.getTime() - 3600e3; t <= end.getTime() + 3600e3; t += step) samples.push([t, SunCalc.getMoonPosition(new Date(t), lat, lng).altitude]);
    const majors = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const [t, a] = samples[i];
      if (t < day.getTime() || t >= end.getTime()) continue;
      if (a > samples[i - 1][1] && a >= samples[i + 1][1]) majors.push({ t: new Date(t), label: "Mond im Zenit" });
      if (a < samples[i - 1][1] && a <= samples[i + 1][1]) majors.push({ t: new Date(t), label: "Mond im Nadir" });
    }
    const mt = SunCalc.getMoonTimes(day, lat, lng);
    const minors = [];
    if (mt.rise) minors.push({ t: mt.rise, label: "Mondaufgang" });
    if (mt.set) minors.push({ t: mt.set, label: "Monduntergang" });
    const sun = SunCalc.getTimes(new Date(day.getTime() + 12 * 3600e3), lat, lng);
    const ill = SunCalc.getMoonIllumination(new Date(day.getTime() + 12 * 3600e3));

    const periods = [
      ...majors.map((m) => ({ ...m, kind: "major", from: new Date(+m.t - 3600e3), to: new Date(+m.t + 3600e3) })),
      ...minors.map((m) => ({ ...m, kind: "minor", from: new Date(+m.t - 1800e3), to: new Date(+m.t + 1800e3) })),
    ].sort((a, b) => a.t - b.t);

    // Bewertung 0–100
    const dist = Math.min(ill.phase, Math.abs(ill.phase - 0.5), 1 - ill.phase); // 0 = Neu-/Vollmond, 0.25 = Viertel
    const phaseScore = 1 - dist / 0.25;
    let bonus = 0;
    const twilight = [sun.sunrise, sun.sunset].filter((d) => d && !isNaN(d));
    periods.forEach((p) => {
      if (twilight.some((s) => Math.abs(p.t - s) < 90 * 60e3)) { p.twilight = true; bonus += p.kind === "major" ? 14 : 8; }
    });
    const score = Math.max(5, Math.min(100, Math.round(30 + 45 * phaseScore + Math.min(bonus, 25))));
    return { day, periods, sun, ill, score };
  }

  function timesPlace() {
    const v = $("#timesPlace")?.value || "auto";
    if (v === "center") return { lat: map.getCenter().lat, lng: map.getCenter().lng, label: "Kartenmitte" };
    if (v.startsWith("spot:")) { const s = state.spots.find((x) => x.id === v.slice(5)); if (s) return { lat: s.lat, lng: s.lng, label: s.name }; }
    const p = state.pos || store.get("lastPos");
    if (p) return { ...p, label: "Mein Standort" };
    return { lat: map.getCenter().lat, lng: map.getCenter().lng, label: "Kartenmitte (kein GPS)" };
  }

  function renderTimesPlaceSelect() {
    const sel = $("#timesPlace");
    const cur = sel.value || store.get("timesPlace", "auto");
    sel.innerHTML = `<option value="auto">📡 Mein Standort</option><option value="center">🗺️ Kartenmitte</option>` +
      state.spots.map((s) => `<option value="spot:${s.id}">📍 ${esc(s.name)}</option>`).join("");
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "auto";
  }

  const stars = (score) => "★".repeat(Math.round(score / 20)) + "☆".repeat(5 - Math.round(score / 20));
  const scoreText = (s) => (s >= 80 ? "Hervorragend" : s >= 65 ? "Sehr gut" : s >= 50 ? "Gut" : s >= 35 ? "Mittel" : "Mäßig");

  function renderTimes() {
    renderTimesPlaceSelect();
    const place = timesPlace();
    const d = state.timesDate;
    $("#timesDate").value = toDateInput(d);
    const s = solunar(d, place.lat, place.lng);
    const [emo, pname] = phaseInfo(s.ill.phase);
    $("#todayRating").innerHTML = `<div class="rating"><div class="score">${s.score}</div>
      <div><div class="stars">${stars(s.score)}</div><div><b>${scoreText(s.score)}</b> · ${emo} ${pname} (${Math.round(s.ill.fraction * 100)} %)</div>
      <div class="small muted">☀️ Aufgang ${fmtTime(s.sun.sunrise)} · Untergang ${fmtTime(s.sun.sunset)}</div></div></div>`;

    // Zeitleiste
    const t0 = +s.day, span = 864e5, pct = (t) => Math.max(0, Math.min(100, ((t - t0) / span) * 100));
    let tl = "";
    if (s.sun.sunrise && !isNaN(s.sun.sunrise)) tl += `<div class="night" style="left:0;width:${pct(+s.sun.sunrise)}%"></div>`;
    if (s.sun.sunset && !isNaN(s.sun.sunset)) tl += `<div class="night" style="left:${pct(+s.sun.sunset)}%;right:0"></div>`;
    s.periods.forEach((p) => {
      const l = pct(+p.from), r = pct(+p.to);
      if (r > l) tl += `<div class="seg ${p.kind}" style="left:${l}%;width:${r - l}%" title="${p.label}"></div>`;
    });
    const now = Date.now();
    if (now >= t0 && now < t0 + span) tl += `<div class="now" style="left:${pct(now)}%"></div>`;
    $("#timeline").innerHTML = tl;
    $("#tlScale")?.remove();
    $("#timeline").insertAdjacentHTML("afterend", `<div class="tl-scale" id="tlScale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24 Uhr</span></div>`);

    $("#periods").innerHTML = s.periods.length ? s.periods.map((p) => `
      <div class="period"><span><span class="dot" style="background:var(--${p.kind === "major" ? "good" : "mid"})"></span>
      <b>${fmtTime(p.from)}–${fmtTime(p.to)}</b> ${p.kind === "major" ? "Hauptbeißzeit" : "Nebenbeißzeit"}</span>
      <span class="muted small">${p.label}${p.twilight ? " · 🌅 Dämmerung!" : ""}</span></div>`).join("")
      : `<p class="muted">Keine Perioden berechnet.</p>`;

    // Woche
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let w = "";
    for (let i = 0; i < 7; i++) {
      const dd = new Date(+today + i * 864e5 + 12 * 3600e3);
      const sc = solunar(dd, place.lat, place.lng);
      const sel = toDateInput(dd) === toDateInput(d) ? " sel" : "";
      w += `<div class="day${sel}" data-date="${toDateInput(dd)}"><div class="d">${dd.toLocaleDateString("de-DE", { weekday: "short" })} ${dd.getDate()}.</div>
        <div class="m">${phaseInfo(sc.ill.phase)[0]}</div><div class="s" style="color:var(--${sc.score >= 65 ? "good" : sc.score >= 45 ? "mid" : "bad"})">${sc.score}</div></div>`;
    }
    $("#week").innerHTML = w;

    // Eigene beste Uhrzeiten
    const blocks = Array(12).fill(0);
    state.catches.forEach((c) => { const h = new Date(c.date).getHours(); if (!isNaN(h)) blocks[Math.floor(h / 2)]++; });
    const max = Math.max(...blocks);
    $("#myHours").innerHTML = max ? `<div class="bars">${blocks.map((n, i) => `<div class="bar"><span>${pad(i * 2)}–${pad(i * 2 + 2)} Uhr</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><b>${n}</b></div>`).join("")}</div>`
      : `<p class="muted">Noch keine Fänge eingetragen.</p>`;

    renderWeather(place);
  }
  $("#week").addEventListener("click", (e) => {
    const d = e.target.closest(".day");
    if (d) { state.timesDate = new Date(d.dataset.date + "T12:00"); renderTimes(); }
  });
  $("#timesDate").addEventListener("change", (e) => { if (e.target.value) { state.timesDate = new Date(e.target.value + "T12:00"); renderTimes(); } });

  // ---------- Wetter (Open-Meteo, kostenlos, ohne API-Key) ----------
  const WMO = { 0: "☀️ Klar", 1: "🌤️ Überwiegend klar", 2: "⛅ Teilweise bewölkt", 3: "☁️ Bedeckt", 45: "🌫️ Nebel", 48: "🌫️ Reifnebel", 51: "🌦️ Leichter Niesel", 53: "🌦️ Niesel", 55: "🌧️ Starker Niesel", 61: "🌧️ Leichter Regen", 63: "🌧️ Regen", 65: "🌧️ Starker Regen", 66: "🌧️ Gefrierender Regen", 67: "🌧️ Gefrierender Regen", 71: "🌨️ Leichter Schnee", 73: "🌨️ Schnee", 75: "❄️ Starker Schnee", 77: "🌨️ Schneegriesel", 80: "🌦️ Schauer", 81: "🌧️ Schauer", 82: "⛈️ Heftige Schauer", 85: "🌨️ Schneeschauer", 86: "🌨️ Schneeschauer", 95: "⛈️ Gewitter", 96: "⛈️ Gewitter mit Hagel", 99: "⛈️ Gewitter mit Hagel" };
  const dirName = (deg) => ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  const weatherCache = new Map();

  async function getWeather(lat, lng) {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = weatherCache.get(key);
    if (hit && Date.now() - hit.t < 15 * 60e3) return hit.data;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,surface_pressure,precipitation` +
      `&hourly=surface_pressure&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&past_days=1&forecast_days=7&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    if (data.error || !data.current) throw new Error(data.reason);
    weatherCache.set(key, { t: Date.now(), data });
    return data;
  }
  async function fetchCurrentWeather(lat, lng) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,surface_pressure`, { signal: ctl.signal });
      const c = (await r.json()).current;
      return { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, clouds: c.cloud_cover, pressure: c.surface_pressure };
    } finally { clearTimeout(to); }
  }
  const weatherSummary = (w) => `${WMO[w.code] || ""}, ${Math.round(w.temp)} °C, Wind ${Math.round(w.wind)} km/h ${dirName(w.windDir)}, ${Math.round(w.pressure)} hPa`;

  function pressureTrend(data) {
    const times = data.hourly.time, p = data.hourly.surface_pressure;
    const nowIdx = times.findIndex((t) => t.slice(0, 13) === data.current.time.slice(0, 13));
    if (nowIdx < 3) return null;
    const past = p[nowIdx] - p[nowIdx - 3];
    const next = nowIdx + 3 < p.length ? p[nowIdx + 3] - p[nowIdx] : null;
    return { past, next };
  }

  async function renderWeather(place) {
    const box = $("#weather");
    if (!navigator.onLine) { box.innerHTML = `<p class="muted">Offline – Wetter nicht verfügbar.</p>`; return; }
    box.innerHTML = `<p class="muted">Wird geladen …</p>`;
    try {
      const data = await getWeather(place.lat, place.lng);
      const c = data.current;
      const tr = pressureTrend(data);
      const arrow = (v) => (v == null ? "" : v <= -1 ? "↘️ fallend" : v >= 1 ? "↗️ steigend" : "➡️ stabil");
      const tips = [];
      if (tr && tr.past <= -1) tips.push("Fallender Luftdruck – oft sehr gute Beißphase vor dem Wetterumschwung, besonders auf Raubfisch.");
      if (tr && tr.past >= 1.5) tips.push("Stark steigender Luftdruck – Fische sind oft vorsichtig. Fein fischen, tiefer suchen.");
      if (c.cloud_cover >= 70) tips.push("Bewölkt – Raubfische jagen häufig auch tagsüber.");
      if (c.cloud_cover < 20 && c.temperature_2m > 22) tips.push("Sonnig und warm – früh morgens oder abends angeln, tagsüber Schatten und Tiefe suchen.");
      if (c.wind_speed_10m >= 10 && c.wind_speed_10m <= 30) tips.push(`Wind aus ${dirName(c.wind_direction_10m)} – das windzugewandte Ufer ist oft nahrungsreich.`);
      if (c.wind_speed_10m > 40) tips.push("Starker Wind – Vorsicht am Wasser, besonders im Boot!");
      if ([95, 96, 99].includes(c.weather_code)) tips.push("⚠️ Gewitter: Kohlefaserruten leiten Blitze – Angelplatz verlassen!");
      if (c.temperature_2m < 5) tips.push("Kalt – langsam und tief fischen, kleine Köder.");
      const dly = data.daily;
      const todayIdx = dly.time.indexOf(data.current.time.slice(0, 10));
      box.innerHTML = `
        <div class="wx">
          <div>${WMO[c.weather_code] || "Wetter"}<b>${Math.round(c.temperature_2m)} °C</b></div>
          <div>Wind<b>${Math.round(c.wind_speed_10m)} km/h ${dirName(c.wind_direction_10m)}</b></div>
          <div>Luftdruck<b>${Math.round(c.surface_pressure)} hPa</b><span class="small">${tr ? arrow(tr.past) : ""}</span></div>
          <div>Bewölkung<b>${c.cloud_cover} %</b></div>
          <div>Niederschlag<b>${c.precipitation} mm</b></div>
        </div>
        ${tips.length ? `<ul class="small">${tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <div class="week" style="margin-top:8px">${dly.time.slice(Math.max(todayIdx, 0), Math.max(todayIdx, 0) + 7).map((t, i) => {
          const j = i + Math.max(todayIdx, 0);
          return `<div class="day" style="cursor:default"><div class="d">${new Date(t + "T12:00").toLocaleDateString("de-DE", { weekday: "short" })}</div>
            <div class="m">${(WMO[dly.weather_code[j]] || "").split(" ")[0]}</div>
            <div class="small"><b>${Math.round(dly.temperature_2m_max[j])}°</b> ${Math.round(dly.temperature_2m_min[j])}°</div></div>`;
        }).join("")}</div>
        <p class="small muted">Ort: ${esc(place.label)} · Daten: Open-Meteo.com</p>`;
    } catch {
      box.innerHTML = `<p class="muted">Wetter konnte nicht geladen werden.</p>`;
    }
  }

  // ---------- Techniken / Guide ----------
  function renderGuide() {
    const q = $("#guideSearch").value.trim().toLowerCase();
    const curMonth = new Date().getMonth();
    const fish = window.FISH_GUIDE.filter((f) => !q || JSON.stringify(f).toLowerCase().includes(q));
    const techs = window.TECHNIQUES.filter((t) => !q || JSON.stringify(t).toLowerCase().includes(q));
    const inSeason = window.FISH_GUIDE.filter((f) => f.months[curMonth] >= 2 && !f.closed.includes(curMonth)).map((f) => f.name);

    let html = "";
    if (!q) {
      html += `<div class="card"><h3>Jetzt im ${MONTHS[curMonth]} besonders gut</h3>
        <div>${inSeason.map((n) => `<span class="tag">${esc(n)}</span>`).join("") || "<span class='muted'>Ruhige Zeit – Winterangeln auf Hecht, Zander & Friedfisch in der Tiefe.</span>"}</div></div>
        <div class="card"><h3>Allgemeine Tipps</h3>${window.GENERAL_TIPS.map((t) => `<p class="small" style="margin:.3rem 0">${esc(t)}</p>`).join("")}</div>`;
    }
    if (fish.length) html += `<h3 class="section-title">Fischarten</h3>`;
    html += fish.map((f) => {
      const mine = state.catches.filter((c) => f.name.toLowerCase().includes((c.species || "").toLowerCase()) && c.species);
      const myBait = topBy(mine, "bait")[0], myTech = topBy(mine, "technique")[0];
      const biggest = mine.reduce((m, c) => (c.length > (m?.length || 0) ? c : m), null);
      return `<details class="fish"><summary><span style="font-size:1.5rem">${f.emoji}</span><span>${esc(f.name)}<br><span class="sub">${esc(f.type)}${mine.length ? ` · ${mine.length} eigene Fänge` : ""}</span></span></summary>
        <div class="body">
          <div class="months">${MONTHS.map((m, i) => `<span class="l${f.months[i]}${f.closed.includes(i) ? " closed" : ""}" title="${f.closed.includes(i) ? "Typische Schonzeit" : ""}">${m}</span>`).join("")}</div>
          <dl>
            <dt>Beste Tageszeit</dt><dd>${esc(f.daytime)}</dd>
            <dt>Wo suchen</dt><dd>${esc(f.spots)}</dd>
            <dt>Techniken</dt><dd>${f.techniques.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</dd>
            <dt>Köder</dt><dd>${esc(f.baits)}</dd>
            <dt>Tipps</dt><dd>${esc(f.tips)}</dd>
            ${mine.length ? `<dt>Deine Daten</dt><dd>${biggest?.length ? `Größter: ${esc(biggest.length)} cm. ` : ""}${myTech ? `Beste Technik: ${esc(myTech[0])}. ` : ""}${myBait ? `Bester Köder: ${esc(myBait[0])}.` : ""}</dd>` : ""}
          </dl>
          ${f.closed.length ? `<p class="small muted">Schraffierte Monate = typische Schonzeit. Genaue Termine und Mindestmaße je nach Bundesland/Gewässer prüfen!</p>` : ""}
        </div></details>`;
    }).join("");
    if (techs.length) html += `<h3 class="section-title">Techniken</h3>`;
    html += techs.map((t) => `<details class="fish"><summary><span style="font-size:1.5rem">🎣</span><span>${esc(t.name)}<br><span class="sub">${esc(t.desc)}</span></span></summary>
      <div class="body"><dl><dt>Ausrüstung</dt><dd>${esc(t.gear)}</dd><dt>So geht's</dt><dd>${esc(t.how)}</dd></dl></div></details>`).join("");
    if (!fish.length && !techs.length) html = `<div class="empty"><div class="big">🔎</div>Nichts gefunden.</div>`;
    $("#guide").innerHTML = html;
  }
  $("#guideSearch").addEventListener("input", renderGuide);

  // ---------- Statistik ----------
  function topBy(arr, key) {
    const m = new Map();
    arr.forEach((x) => { const v = (x[key] || "").trim?.() ?? x[key]; if (v) m.set(v, (m.get(v) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  const barList = (entries, fmt = (k) => k) => {
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return `<div class="bars">${entries.map(([k, n]) => `<div class="bar"><span title="${esc(fmt(k))}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(fmt(k))}</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><b>${n}</b></div>`).join("")}</div>`;
  };

  function renderStats() {
    const cs = state.catches;
    if (!cs.length) { $("#stats").innerHTML = `<div class="empty"><div class="big">📊</div>Sobald du Fänge einträgst, siehst du hier deine Statistiken.</div>`; return; }
    const species = topBy(cs, "species");
    const biggest = {};
    cs.forEach((c) => { if (c.length && (!biggest[c.species] || c.length > biggest[c.species].length)) biggest[c.species] = c; });
    const perMonth = Array(12).fill(0);
    cs.forEach((c) => { const m = new Date(c.date).getMonth(); if (!isNaN(m)) perMonth[m]++; });
    const phases = new Map();
    cs.forEach((c) => { const d = new Date(c.date); if (!isNaN(d)) { const n = phaseInfo(SunCalc.getMoonIllumination(d).phase); const k = n.join(" "); phases.set(k, (phases.get(k) || 0) + 1); } });
    const totalW = cs.reduce((s, c) => s + (c.weight || 0), 0);
    const released = cs.filter((c) => c.released === "ja").length;
    $("#stats").innerHTML = `
      <div class="card"><div class="wx">
        <div>Fänge<b>${cs.length}</b></div><div>Arten<b>${species.length}</b></div>
        <div>Spots<b>${state.spots.length}</b></div><div>Gesamtgewicht<b>${totalW.toFixed(1)} kg</b></div>
        <div>Released<b>${released}</b></div>
      </div></div>
      <div class="card"><h3>🏆 Rekorde</h3>${Object.values(biggest).sort((a, b) => b.length - a.length).map((c) => `<div class="period"><span><b>${esc(c.species)}</b> ${esc(c.length)} cm${c.weight ? ` / ${esc(c.weight)} kg` : ""}</span><span class="muted small">${esc(new Date(c.date).toLocaleDateString("de-DE"))}</span></div>`).join("") || "<p class='muted'>Trage Längen ein, um Rekorde zu sehen.</p>"}</div>
      <div class="card"><h3>Fischarten</h3>${barList(species.slice(0, 10))}</div>
      <div class="card"><h3>Erfolgreichste Techniken</h3>${barList(topBy(cs, "technique").slice(0, 8)) || ""}</div>
      <div class="card"><h3>Erfolgreichste Köder</h3>${barList(topBy(cs, "bait").slice(0, 8))}</div>
      <div class="card"><h3>Beste Spots</h3>${barList(topBy(cs.filter((c) => c.spotId), "spotId").slice(0, 8), spotName)}</div>
      <div class="card"><h3>Fänge pro Monat</h3>${barList(perMonth.map((n, i) => [MONTHS[i], n]))}</div>
      <div class="card"><h3>Fänge nach Mondphase</h3>${barList([...phases.entries()].sort((a, b) => b[1] - a[1]))}</div>`;
  }

  // ---------- Backup ----------
  $("#btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "fish-tracker", version: 1, exported: new Date().toISOString(), catches: state.catches, spots: state.spots })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fish-tracker-backup-${toDateInput(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.catches) || !Array.isArray(data.spots)) throw new Error("Format");
      for (const s of data.spots) if (s.id) await DB.put("spots", s);
      for (const c of data.catches) if (c.id) await DB.put("catches", c);
      await reload();
      toast(`Importiert: ${data.catches.length} Fänge, ${data.spots.length} Spots`);
    } catch { toast("Ungültige Backup-Datei"); }
    e.target.value = "";
  });

  // ---------- Installation & Offline ----------
  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("#installBox").hidden = false; });
  $("#btnInstall").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#installBox").hidden = true;
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIOS && !standalone) $("#iosHint").hidden = false;

  const updateNet = () => ($("#netStatus").hidden = navigator.onLine);
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // ---------- Start ----------
  async function reload() {
    [state.catches, state.spots] = await Promise.all([DB.all("catches"), DB.all("spots")]);
    renderMarkers();
    renderCatches();
    renderSpots();
    renderGuide();
    if ($("#view-stats").classList.contains("active")) renderStats();
    if ($("#view-times").classList.contains("active")) renderTimes();
  }

  (async () => {
    $("#timesPlace").value = store.get("timesPlace", "auto");
    $("#timesPlace").addEventListener("change", (e) => { store.set("timesPlace", e.target.value); renderTimes(); });
    state.pos = store.get("lastPos", null);
    await DB.open();
    await reload();
    showView(store.get("view", "map"));
    locate(!store.get("mapCenter", null));
  })();
})();
