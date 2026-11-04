/* Fischerglück – Fänge, Spots, Beisszeiten, MeteoSwiss-Wetter und Wassertemperaturen
 * für Schweizer Gewässer. Alle persönlichen Daten bleiben lokal (IndexedDB).
 */
(() => {
  "use strict";

  // ───────────────────────── Hilfsfunktionen ─────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, "0");
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toDateKey = (d) => toLocalInput(d).slice(0, 10);
  const hm = (d) => (d instanceof Date && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "–");
  const fmtDateTime = (s) => new Date(s).toLocaleString("de-CH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (s) => new Date(s).toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric" });
  const nf = (v, d = 1) => (v == null || isNaN(v) ? "–" : (+v).toLocaleString("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: d }));
  const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
  const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const ic = (id, cls = "") => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const km = (a, b) => {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  async function fetchJSON(url, opts = {}, timeout = 12000) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }
  // Einfacher Speicher-Cache für Live-Daten
  const memo = new Map();
  async function cached(key, ttlMs, fn) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.t < ttlMs) return hit.p;
    const p = fn();
    memo.set(key, { t: Date.now(), p });
    p.catch(() => memo.delete(key));
    return p;
  }

  // ───────────────────────── Datenbank ─────────────────────────
  const DB = {
    db: null,
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open("fishtracker", 2);
        r.onupgradeneeded = () => {
          const db = r.result;
          for (const s of ["catches", "spots", "waters"]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
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
    all(s) { return this.tx(s, "readonly", (o) => o.getAll()); },
    put(s, v) { return this.tx(s, "readwrite", (o) => o.put(v)); },
    del(s, id) { return this.tx(s, "readwrite", (o) => o.delete(id)); },
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem("ft_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ft_" + k, JSON.stringify(v)); } catch { /* voll/privat */ } },
  };

  const state = {
    catches: [], spots: [], waters: [],
    activeId: store.get("activeWater", null),
    pos: store.get("lastPos", null),
    pickCallback: null,
    day: new Date(),
    place: "water",
    catchSeg: "list",
    wxOpen: store.get("wxOpen", false),
    wxDetail: store.get("wxDetail", false),
    guideSeg: "fish",
    stations: null,
    lakes: null,
  };

  // ───────────────────────── Statische Daten (GitHub Action) ─────────────────────────
  async function loadStatic() {
    const [st, lk] = await Promise.allSettled([fetchJSON("data/stations.json"), fetchJSON("data/lakes.json")]);
    state.stations = st.status === "fulfilled" ? st.value : { meteo: [], hydro: [] };
    state.lakes = lk.status === "fulfilled" ? lk.value : null;
  }

  // ───────────────────────── Gewässer ─────────────────────────
  const CATALOG = window.SWISS_WATERS;
  const KIND = { lake: "See", river: "Fluss", pond: "Weiher", canal: "Kanal", reservoir: "Stausee", stream: "Bach", water: "Gewässer" };
  const catalogOf = (w) => (w?.catalogKey ? CATALOG.find((c) => c.key === w.catalogKey) : null);
  const activeWater = () => state.waters.find((w) => w.id === state.activeId) || null;
  const waterById = (id) => state.waters.find((w) => w.id === id);
  const waterName = (id) => waterById(id)?.name || "";
  const inScope = (x) => !state.activeId || x.waterId === state.activeId;
  const scopedCatches = () => state.catches.filter(inScope);
  const scopedSpots = () => state.spots.filter(inScope);
  const speciesOfWater = (w) => catalogOf(w)?.species || w?.species || [];

  function refPoint(w = activeWater()) {
    if (w) return { lat: w.lat, lng: w.lng };
    if (state.pos) return state.pos;
    return { lat: 47.05, lng: 8.3 };
  }

  async function setActive(id) {
    state.activeId = id;
    store.set("activeWater", id);
    const w = activeWater();
    $("#wsName").textContent = w ? w.name : "Alle Gewässer";
    $("#wsKicker").textContent = w ? `${KIND[w.kind] || "Gewässer"}${w.cantons ? " · " + w.cantons : ""}` : "Gewässer";
    state.place = "water";
    drawWaterOutline(true);
    renderAll();
  }

  async function addCatalogWater(c) {
    let w = state.waters.find((x) => x.catalogKey === c.key);
    if (!w) {
      w = { id: "ch-" + c.key, catalogKey: c.key, name: c.name, kind: c.kind, lat: c.lat, lng: c.lng, cantons: c.cantons, created: Date.now() };
      await DB.put("waters", w);
      state.waters.push(w);
    }
    await setActive(w.id);
    ensureOutline(w);
    return w;
  }

  async function addOsmWater(r) {
    const id = "osm-" + r.osm_type[0] + r.osm_id;
    let w = state.waters.find((x) => x.id === id);
    if (!w) {
      const kind = { lake: "lake", river: "river", reservoir: "reservoir", pond: "pond", canal: "canal", stream: "stream" }[r.type] || (r.category === "waterway" ? "river" : "water");
      w = { id, name: r.name || r.display_name.split(",")[0], kind, lat: +r.lat, lng: +r.lon, osmType: r.osm_type, osmId: r.osm_id, region: r.display_name.split(",").slice(1, 3).join(",").trim(), created: Date.now() };
      const cat = CATALOG.find((c) => norm(c.osm || c.name) === norm(w.name) || norm(c.name) === norm(w.name));
      if (cat) { w.catalogKey = cat.key; w.cantons = cat.cantons; w.kind = cat.kind; }
      await DB.put("waters", w);
      state.waters.push(w);
    }
    await setActive(w.id);
    ensureOutline(w);
    return w;
  }

  // Umriss (Polygon/Linie) über Nominatim laden – einmalig, dann gespeichert
  async function ensureOutline(w) {
    if (w.geojson !== undefined || !navigator.onLine) return;
    try {
      let res;
      if (w.osmId) {
        res = await fetchJSON(`https://nominatim.openstreetmap.org/lookup?osm_ids=${w.osmType[0].toUpperCase()}${w.osmId}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0004`);
      } else {
        const c = catalogOf(w);
        const q = encodeURIComponent(c?.osm || w.name);
        const list = await fetchJSON(`https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&countrycodes=ch,li,de,fr,it,at&polygon_geojson=1&polygon_threshold=0.0004&limit=6`);
        const maxKm = w.kind === "river" ? 200 : 40;
        res = list.filter((r) => ["natural", "water", "waterway"].includes(r.category) && km({ lat: +r.lat, lng: +r.lon }, w) < maxKm);
      }
      const r = res && res[0];
      if (!r) { w.geojson = null; } else {
        const gj = JSON.stringify(r.geojson);
        w.geojson = gj.length < 600000 && r.geojson && r.geojson.type !== "Point" ? r.geojson : null;
        const b = r.boundingbox.map(Number);
        w.bbox = [b[0], b[2], b[1], b[3]]; // s, w, n, e
      }
      await DB.put("waters", w);
      if (w.geojson) await autoAssign(w);
      if (w.id === state.activeId) { drawWaterOutline(true); renderAll(); }
    } catch { /* offline / Rate-Limit – später erneut */ }
  }

  function pointInRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > pt.lat) !== (yj > pt.lat)) && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inWater(pt, w) {
    const g = w.geojson;
    if (!g || pt.lat == null) return false;
    if (w.bbox && (pt.lat < w.bbox[0] || pt.lat > w.bbox[2] || pt.lng < w.bbox[1] || pt.lng > w.bbox[3])) return false;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    return polys.some((p) => pointInRing(pt, p[0]));
  }
  // Bestehende Einträge ohne Gewässer automatisch zuordnen
  async function autoAssign(w) {
    let n = 0;
    for (const c of state.catches) if (!c.waterId && inWater(c, w)) { c.waterId = w.id; await DB.put("catches", c); n++; }
    for (const s of state.spots) if (!s.waterId && inWater(s, w)) { s.waterId = w.id; await DB.put("spots", s); n++; }
    if (n) toast(`${n} Einträge ${w.name} zugeordnet`);
  }
  function guessWater(pt) {
    return state.waters.find((w) => inWater(pt, w)) || null;
  }

  // ───────────────────────── Live-Daten ─────────────────────────
  // Seetemperatur (Eawag / Alplakes, aufbereitet durch GitHub Action)
  function lakeData(w) {
    const c = catalogOf(w);
    return c && state.lakes?.lakes?.[c.key] ? state.lakes.lakes[c.key] : null;
  }
  function surfaceAt(ld, t = Date.now()) {
    if (!ld?.surface?.length) return null;
    const s = ld.surface.map(([x, v]) => [Date.parse(x), v]);
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) if (t <= s[i][0]) {
      const [t0, v0] = s[i - 1], [t1, v1] = s[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
    return Math.abs(t - s[s.length - 1][0]) < 6 * 3600e3 ? s[s.length - 1][1] : null;
  }
  function thermocline(profile) {
    if (!profile || profile.length < 4) return null;
    let best = { g: 0, d: null };
    for (let i = 1; i < profile.length; i++) {
      const [d0, t0] = profile[i - 1], [d1, t1] = profile[i];
      if (d1 > 60) break;
      const g = (t0 - t1) / (d1 - d0);
      if (g > best.g) best = { g, d: (d0 + d1) / 2 };
    }
    const top = profile[0][1];
    const at = (depth) => profile.reduce((a, b) => (Math.abs(b[0] - depth) < Math.abs(a[0] - depth) ? b : a))[1];
    return { stratified: best.g >= 0.4, depth: best.d, gradient: best.g, top, at20: at(20), at10: at(10), bottom: profile[profile.length - 1] };
  }

  // BAFU Hydrodaten via existenz.ch
  function hydroStations(w, ref) {
    const names = (catalogOf(w)?.hydro || [w.name]).map(norm);
    const list = (state.stations?.hydro || []).filter((s) => names.includes(norm(s.water)));
    const r = ref || refPoint(w);
    return list.map((s) => ({ ...s, dist: km(r, s) })).sort((a, b) => a.dist - b.dist);
  }
  async function hydroLatest(ids) {
    if (!ids.length) return {};
    const key = "hy:" + ids.join(",");
    return cached(key, 10 * 60e3, async () => {
      const d = await fetchJSON(`https://api.existenz.ch/apiv1/hydro/latest?locations=${ids.join(",")}&parameters=height,flow,temperature&app=fishtracker`);
      const out = {};
      for (const x of d.payload) (out[x.loc] ||= {})[x.par] = { val: x.val, t: x.timestamp * 1000 };
      return out;
    });
  }
  async function hydroFor(w, ref) {
    const st = hydroStations(w, ref);
    if (!st.length) return null;
    const pick = (p) => st.find((s) => s.pars.includes(p) && s.dist < 60);
    const sel = { height: pick("height"), flow: pick("flow"), temperature: pick("temperature") };
    const ids = [...new Set(Object.values(sel).filter(Boolean).map((s) => s.id))];
    const data = await hydroLatest(ids);
    const res = {};
    for (const [p, s] of Object.entries(sel)) if (s && data[s.id]?.[p]) res[p] = { ...data[s.id][p], station: s };
    return res;
  }

  // MeteoSwiss Messwerte (SwissMetNet, 10-Minuten-Werte)
  async function meteoNow() {
    return cached("vqha", 10 * 60e3, async () => {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 12000);
      const r = await fetch("https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv", { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const lines = (await r.text()).trim().split(/\r?\n/);
      const head = lines.shift().split(";");
      const out = {};
      for (const l of lines) {
        const c = l.split(";");
        const o = {};
        head.forEach((h, i) => (o[h] = c[i] === "-" || c[i] === "" ? null : c[i]));
        const n = (k) => (o[k] == null ? null : +o[k]);
        const d = o.Date;
        out[o["Station/Location"]] = {
          t: d ? Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12)) : null,
          temp: n("tre200s0"), rain: n("rre150z0"), sun: n("sre000z0"), hum: n("ure200s0"),
          dir: n("dkl010z0"), wind: n("fu3010z0"), gust: n("fu3010z1"), qff: n("pp0qffs0"),
        };
      }
      return out;
    });
  }
  async function nearestMeteo(ref, alt) {
    const now = await meteoNow();
    const list = (state.stations?.meteo || [])
      .filter((s) => now[s.id] && now[s.id].temp != null && now[s.id].wind != null)
      .map((s) => ({ ...s, dist: km(ref, s), score: km(ref, s) + (alt && s.alt ? Math.abs(s.alt - alt) / 40 : 0) }))
      .sort((a, b) => a.score - b.score);
    const s = list[0];
    if (!s) return null;
    const p = list.find((x) => now[x.id].qff != null);
    return { station: s, ...now[s.id], qff: now[s.id].qff ?? (p ? now[p.id].qff : null) };
  }

  // Prognose: MeteoSwiss ICON-CH (via Open-Meteo), Fallback Standardmodell
  async function forecast(ref) {
    const key = `fc:${ref.lat.toFixed(2)},${ref.lng.toFixed(2)}`;
    return cached(key, 20 * 60e3, async () => {
      const base = `https://api.open-meteo.com/v1/forecast?latitude=${ref.lat.toFixed(4)}&longitude=${ref.lng.toFixed(4)}` +
        "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,surface_pressure,precipitation" +
        "&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,surface_pressure,weather_code" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunshine_duration" +
        "&past_days=1&forecast_days=7&timezone=Europe%2FZurich";
      let d = await fetchJSON(base + "&models=meteoswiss_icon_seamless").catch(() => null);
      let model = "MeteoSwiss ICON-CH";
      if (!d || d.error || d.current?.temperature_2m == null) { d = await fetchJSON(base); model = "Open-Meteo"; }
      if (d.error) throw new Error(d.reason);
      d.model = model;
      // Nach dem Horizont von ICON-CH (ca. 5 Tage) mit dem Standardmodell auffüllen
      const gaps = (o) => Object.values(o).some((a) => Array.isArray(a) && a.some((v) => v == null));
      if (model !== "Open-Meteo" && (gaps(d.daily) || gaps(d.hourly))) {
        const g = await fetchJSON(base).catch(() => null);
        if (g) {
          const fill = (a, b) => { for (const k of Object.keys(a)) if (Array.isArray(a[k]) && Array.isArray(b?.[k])) a[k] = a[k].map((v, i) => v ?? b[k][i] ?? null); };
          const late = d.daily.temperature_2m_max.some((v) => v == null);
          fill(d.daily, g.daily); fill(d.hourly, g.hourly);
          if (late) d.model += " + Open-Meteo";
        }
      }
      return d;
    });
  }
  function pressureTrend(fc) {
    const h = fc.hourly, idx = h.time.findIndex((t) => t.slice(0, 13) === fc.current.time.slice(0, 13));
    if (idx < 3) return null;
    const p = h.surface_pressure;
    return { past: p[idx] - p[idx - 3], next: idx + 3 < p.length && p[idx + 3] != null ? p[idx + 3] - p[idx] : null };
  }

  const WMO = (c) => c == null ? ["cloud", "–"] : c <= 1 ? ["sun", c ? "Meist sonnig" : "Sonnig"] : c === 2 ? ["cloud-sun", "Teilweise bewölkt"] : c === 3 ? ["cloud", "Bedeckt"]
    : c <= 48 ? ["fog", "Nebel"] : c <= 57 ? ["rain", "Nieselregen"] : c <= 67 ? ["rain", "Regen"] : c <= 77 ? ["snow", "Schnee"]
    : c <= 82 ? ["rain", "Regenschauer"] : c <= 86 ? ["snow", "Schneeschauer"] : ["storm", "Gewitter"];
  const dirName = (deg) => (deg == null ? "" : ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8]);

  // ───────────────────────── Solunar / Beisszeiten ─────────────────────────
  const PHASES = ["Neumond", "Zunehmende Sichel", "Erstes Viertel", "Zunehmender Mond", "Vollmond", "Abnehmender Mond", "Letztes Viertel", "Abnehmende Sichel"];
  const phaseName = (p) => PHASES[Math.round(p * 8) % 8];

  function solunar(date, lat, lng) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = +day + 864e5, step = 6 * 60e3, samples = [];
    for (let t = +day - 3600e3; t <= end + 3600e3; t += step) samples.push([t, SunCalc.getMoonPosition(new Date(t), lat, lng).altitude]);
    const periods = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const [t, a] = samples[i];
      if (t < +day || t >= end) continue;
      if (a > samples[i - 1][1] && a >= samples[i + 1][1]) periods.push({ t: new Date(t), label: "Mond im Zenit", kind: "major" });
      if (a < samples[i - 1][1] && a <= samples[i + 1][1]) periods.push({ t: new Date(t), label: "Mond im Nadir", kind: "major" });
    }
    const mt = SunCalc.getMoonTimes(day, lat, lng);
    if (mt.rise) periods.push({ t: mt.rise, label: "Mondaufgang", kind: "minor" });
    if (mt.set) periods.push({ t: mt.set, label: "Monduntergang", kind: "minor" });
    const noon = new Date(+day + 12 * 3600e3);
    const sun = SunCalc.getTimes(noon, lat, lng);
    const ill = SunCalc.getMoonIllumination(noon);
    periods.forEach((p) => { const w = p.kind === "major" ? 3600e3 : 1800e3; p.from = new Date(+p.t - w); p.to = new Date(+p.t + w); });
    periods.sort((a, b) => a.t - b.t);
    const dist = Math.min(ill.phase, Math.abs(ill.phase - 0.5), 1 - ill.phase);
    let bonus = 0;
    const tw = [sun.sunrise, sun.sunset].filter((d) => d && !isNaN(d));
    periods.forEach((p) => { if (tw.some((s) => Math.abs(p.t - s) < 90 * 60e3)) { p.twilight = true; bonus += p.kind === "major" ? 14 : 8; } });
    const score = Math.max(5, Math.min(100, Math.round(30 + 45 * (1 - dist / 0.25) + Math.min(bonus, 25))));
    return { day, periods, sun, ill, score };
  }
  const scoreLabel = (s) => (s >= 80 ? "Hervorragend" : s >= 65 ? "Sehr gut" : s >= 50 ? "Gut" : s >= 35 ? "Mittel" : "Mässig");
  const scoreColor = (s) => (s >= 65 ? "var(--good)" : s >= 45 ? "var(--warn)" : "var(--bad)");

  // ───────────────────────── Diagramme ─────────────────────────
  function niceTicks(min, max, n = 4) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
    return out;
  }
  // Interaktion für Diagramme: Maus = Hover, Finger = Tippen/Wischen; der Wert bleibt nach dem Loslassen stehen
  let chartTipTimer;
  function chartInteract(svg, show, hide) {
    svg.style.touchAction = "pan-y"; // waagrecht wischen bewegt den Punkt, senkrecht scrollt die Seite
    let raf = 0, last = null, active = false;
    const frame = () => { raf = 0; if (last) show(last); };
    const queue = (e) => { last = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType }; if (!raf) raf = requestAnimationFrame(frame); };
    svg.addEventListener("pointerdown", (e) => {
      active = true; clearTimeout(chartTipTimer);
      try { svg.setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
      queue(e);
    });
    svg.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || active) { clearTimeout(chartTipTimer); queue(e); }
    });
    // Beim Loslassen den Punkt und die Anzeige sofort entfernen
    const end = (e) => {
      active = false;
      try { svg.releasePointerCapture(e.pointerId); } catch { /* egal */ }
      if (e.pointerType !== "mouse") {
        clearTimeout(chartTipTimer);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        last = null;
        hide();
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    svg._hideTip = hide;
  }
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest(".chart")) return;
    $$(".chart svg").forEach((sv) => sv._hideTip && sv._hideTip());
  });
  function placeTip(tip, text, px, py, wrapW) {
    tip.textContent = text;
    tip.hidden = false;
    const tw = tip.offsetWidth || 120;
    tip.style.left = `${Math.max(tw / 2 + 2, Math.min(wrapW - tw / 2 - 2, px))}px`;
    tip.style.top = `${py}px`;
  }

  // Zeitreihe (Linie oder Balken), eine Serie, eine Achse
  function timeChart(el, { data, unit = "", digits = 0, type = "line", height = 130, zeroBase = false, invert = false, maxY = null, minSpan = 0 }) {
    const pts = data.filter((p) => p[1] != null);
    if (pts.length < 2) { el.innerHTML = `<p class="faint small">Keine Daten</p>`; return; }
    const W = Math.max(280, el.clientWidth || 320), H = height, m = { l: minSpan && minSpan < 1 ? 46 : 34, r: 8, t: 18, b: 22 };
    const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    let ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
    if (zeroBase || type === "bar") lo = 0;
    if (type === "bar" && hi < 1) hi = 1;
    if (maxY != null) hi = maxY;
    if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
    const ticks = niceTicks(lo, hi, 3);
    lo = ticks[0]; hi = ticks[ticks.length - 1];
    const X = (t) => m.l + ((t - x0) / (x1 - x0)) * (W - m.l - m.r);
    const Y = (v) => m.t + (invert ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    const td = Math.max(0, Math.min(3, -Math.floor(Math.log10(ticks[1] - ticks[0] || 1))));
    ticks.forEach((v) => { s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis-t" x="${m.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${nf(v, td)}</text>`; });
    // Zeitachse: Tagesmarken, bei kurzen Zeiträumen zusätzlich Uhrzeiten
    const short = x1 - x0 <= 50 * 3600e3;
    const d = new Date(x0); d.setMinutes(0, 0, 0); d.setHours(Math.ceil(d.getHours() / 6) * 6);
    for (let t = +d; t <= x1; t += 6 * 3600e3) {
      const dt = new Date(t), midnight = dt.getHours() === 0;
      if (!midnight && !short) continue;
      if (midnight) s += `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${H - m.b}" stroke-dasharray="2 3"/>`;
      const label = midnight ? dt.toLocaleDateString("de-CH", { weekday: "short" }) : `${pad(dt.getHours())}:00`;
      if (X(t) > m.l + 4 && X(t) < W - 30) s += `<text class="axis-t" x="${X(t)}" y="${H - 6}" text-anchor="middle">${label}</text>`;
    }
    if (type === "bar") {
      const bw = Math.max(2, ((W - m.l - m.r) / pts.length) - 2);
      pts.forEach(([t, v]) => { if (v > 0) { const h = Math.max(1, Y(lo) - Y(v)); const fill = el.dataset.scoreBars ? ` style="fill:${v >= 60 ? "var(--good)" : v >= 40 ? "var(--warn)" : "var(--line-strong)"}"` : ""; s += `<rect class="bar" x="${Math.min(Math.max(X(t) - bw / 2, m.l), W - m.r - bw)}" y="${Y(lo) - h}" width="${bw}" height="${h}" rx="${Math.min(2, bw / 2)}"${fill}/>`; } });
    } else {
      const path = pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      s += `<path class="area" d="${path}L${X(x1)},${Y(lo)}L${X(x0)},${Y(lo)}Z"/><path class="series" d="${path}"/>`;
    }
    const now = Date.now();
    if (now > x0 && now < x1) s += `<line class="now-l" x1="${X(now)}" x2="${X(now)}" y1="${m.t}" y2="${H - m.b}"/><text class="axis-t" x="${X(now)}" y="${m.t - 6}" text-anchor="middle">jetzt</text>`;
    s += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><circle class="dot" r="5.5" visibility="hidden"/>`;
    s += `<rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
    el.innerHTML = s;
    const svg = $("svg", el), tip = $(".tip", el), cross = $(".cross", el), dot = $(".dot", el);
    const move = (e) => {
      const r = svg.getBoundingClientRect(), px = Math.max(m.l, Math.min(W - m.r, ((e.clientX - r.left) / r.width) * W));
      const t = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
      let tt, v;
      if (type === "bar") {
        // Balken: auf den nächsten Balken einrasten
        const p = pts.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a));
        tt = p[0]; v = p[1];
      } else {
        // Linie: zwischen den Messpunkten interpolieren, damit der Punkt dem Finger flüssig folgt
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= t) lo = mid; else hi = mid; }
        const [ta, va] = pts[lo], [tb, vb] = pts[hi];
        const f = tb > ta ? Math.max(0, Math.min(1, (t - ta) / (tb - ta))) : 0;
        tt = t; v = va + (vb - va) * f;
      }
      const cx = X(tt), cy = Y(v);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("visibility", type === "bar" ? "hidden" : "visible");
      const shown = type === "bar" ? new Date(tt) : new Date(Math.round(tt / 600e3) * 600e3); // auf 10 Minuten runden
      const label = unit ? `${nf(v, digits)} ${unit}` : `Index ${nf(v, digits)}`;
      // Anzeige fest über dem Diagramm – nicht unter dem Finger und ohne Auf-und-ab-Springen
      placeTip(tip, `${shown.toLocaleString("de-CH", { weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${label}`, (cx / W) * r.width, (m.t / H) * r.height, r.width);
    };
    const leave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); };
    chartInteract(svg, move, leave);
  }
  // Temperaturprofil: x = Temperatur, y = Tiefe (nach unten)
  function profileChart(el, { profile, thermo, maxDepth }) {
    const pts = profile.filter((p) => p[0] <= maxDepth);
    const W = Math.max(280, el.clientWidth || 320), H = 230, m = { l: 36, r: 12, t: 18, b: 10 };
    const temps = pts.map((p) => p[1]);
    const tt = niceTicks(Math.floor(Math.min(...temps)), Math.ceil(Math.max(...temps)), 4);
    const lo = tt[0], hi = tt[tt.length - 1];
    const dt = niceTicks(0, maxDepth, 4).filter((d) => d <= maxDepth);
    const X = (v) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
    const Y = (d) => m.t + (d / maxDepth) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
    dt.forEach((d) => { s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(d)}" y2="${Y(d)}"/><text class="axis-t" x="${m.l - 6}" y="${Y(d) + 3.5}" text-anchor="end">${d} m</text>`; });
    tt.forEach((v) => { s += `<text class="axis-t" x="${X(v)}" y="${m.t - 6}" text-anchor="middle">${v}°</text>`; });
    if (thermo?.stratified && thermo.depth <= maxDepth) {
      s += `<line class="thermo-l" x1="${m.l}" x2="${W - m.r}" y1="${Y(thermo.depth)}" y2="${Y(thermo.depth)}"/><text class="thermo-t" x="${m.l + 4}" y="${Y(thermo.depth) - 5}">Sprungschicht ~${nf(thermo.depth, 0)} m</text>`;
    }
    const path = pts.map(([d, v], i) => `${i ? "L" : "M"}${X(v).toFixed(1)},${Y(d).toFixed(1)}`).join("");
    s += `<path class="series" d="${path}"/>`;
    s += `<line class="cross" x1="${m.l}" x2="${W - m.r}" y1="0" y2="0" visibility="hidden"/><circle class="dot" r="4" visibility="hidden"/><rect x="0" y="${m.t}" width="${W}" height="${H - m.t}" fill="transparent"/></svg><div class="tip" hidden></div>`;
    el.innerHTML = s;
    const svg = $("svg", el), tip = $(".tip", el), cross = $(".cross", el), dot = $(".dot", el);
    const move = (e) => {
      const r = svg.getBoundingClientRect(), py = ((e.clientY - r.top) / r.height) * H;
      const d = Math.max(pts[0][0], Math.min(pts[pts.length - 1][0], ((py - m.t) / (H - m.t - m.b)) * maxDepth));
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= d) lo = mid; else hi = mid; }
      const f = pts[hi][0] > pts[lo][0] ? (d - pts[lo][0]) / (pts[hi][0] - pts[lo][0]) : 0;
      const p = [d, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
      cross.setAttribute("y1", Y(p[0])); cross.setAttribute("y2", Y(p[0])); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", X(p[1])); dot.setAttribute("cy", Y(p[0])); dot.setAttribute("visibility", "visible");
      placeTip(tip, `${nf(p[0], p[0] < 10 ? 1 : 0)} m · ${nf(p[1], 1)} °C`, (X(p[1]) / W) * r.width, Math.max(28, (Y(p[0]) / H) * r.height - 18), r.width);
    };
    chartInteract(svg, move, () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
  }
  const barsList = (entries, fmt = (k) => k) => {
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return entries.length ? entries.map(([k, n]) => `<div class="row small" style="margin:7px 0"><span style="width:120px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(fmt(k))}</span>
      <span class="grow" style="height:8px;background:var(--surface-2);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${(n / max) * 100}%;background:var(--accent);border-radius:99px"></i></span><b style="width:28px;text-align:right">${n}</b></div>`).join("")
      : `<p class="faint small">Noch keine Daten</p>`;
  };

  // ───────────────────────── Navigation ─────────────────────────
  let currentView = "home";
  function showView(name) {
    currentView = name;
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    store.set("view", name);
    if (name === "map") setTimeout(() => { map.invalidateSize(); if (pendingFit) fitWater(); }, 30);
    renderView(name);
  }
  $$(".tabbar button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  function renderView(name) {
    if (name === "home") renderHome();
    if (name === "catches") renderCatches();
    if (name === "forecast") renderForecast();
    if (name === "guide") renderGuide();
  }
  function renderAll() { renderMarkers(); renderView(currentView); }

  // ───────────────────────── Karte ─────────────────────────
  const map = L.map("map", { zoomControl: false, attributionControl: true }).setView(store.get("mapCenter", [46.9, 8.2]), store.get("mapZoom", 8));
  const swiss = (layer, ext = "jpeg") => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${ext}`;
  const BASES = {
    lk: { name: "Landeskarte (swisstopo)", layer: L.tileLayer(swiss("ch.swisstopo.pixelkarte-farbe"), { maxNativeZoom: 18, maxZoom: 19, detectRetina: true, attribution: "© swisstopo" }) },
    lkg: { name: "Landeskarte grau", layer: L.tileLayer(swiss("ch.swisstopo.pixelkarte-grau"), { maxNativeZoom: 18, maxZoom: 19, detectRetina: true, attribution: "© swisstopo" }) },
    img: { name: "Luftbild (SWISSIMAGE)", layer: L.tileLayer(swiss("ch.swisstopo.swissimage"), { maxNativeZoom: 19, maxZoom: 20, attribution: "© swisstopo" }) },
    osm: { name: "OpenStreetMap", layer: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }) },
  };
  const OVERLAYS = {
    bathy: { name: "Seegrund-Relief (swissBATHY3D)", layer: L.tileLayer(swiss("ch.swisstopo.swissbathy3d-reliefschattierung", "png"), { maxNativeZoom: 18, maxZoom: 20, opacity: 0.75, attribution: "© swisstopo" }) },
    seamarks: { name: "Seezeichen (OpenSeaMap)", layer: L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenSeaMap" }) },
  };
  let baseKey = store.get("base", "lk");
  if (!BASES[baseKey]) baseKey = "lk";
  BASES[baseKey].layer.addTo(map);
  store.get("overlays", []).forEach((k) => OVERLAYS[k]?.layer.addTo(map));
  map.on("moveend", () => { const c = map.getCenter(); store.set("mapCenter", [c.lat, c.lng]); store.set("mapZoom", map.getZoom()); });

  const catchLayer = L.layerGroup().addTo(map);
  const spotLayer = L.layerGroup().addTo(map);
  const publicLayer = L.layerGroup();
  let outlineLayer = null;
  const mapLayers = { catches: true, spots: true, public: false, hotspots: true };
  const hotspotLayer = L.layerGroup().addTo(map);

  const mkIcon = (kind, iconId) => L.divIcon({
    className: "", iconSize: kind === "public" ? [24, 24] : [30, 30], iconAnchor: kind === "public" ? [12, 12] : [15, 15], popupAnchor: [0, -14],
    html: `<div class="mk mk-${kind}"><svg viewBox="0 0 24 24"><use href="#i-${iconId}"/></svg></div>`,
  });

  function drawWaterOutline(fit) {
    if (outlineLayer) { map.removeLayer(outlineLayer); outlineLayer = null; }
    const w = activeWater();
    if (!w) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0b6e8f";
    if (w.geojson) {
      const line = /Line/.test(w.geojson.type);
      outlineLayer = L.geoJSON(w.geojson, { interactive: false, style: { color: accent, weight: line ? 5 : 2, opacity: line ? 0.45 : 0.9, fillColor: accent, fillOpacity: 0.06 } }).addTo(map);
    }
    if (fit) fitWater();
  }
  let pendingFit = false;
  function fitWater() {
    const w = activeWater();
    if (!w) return;
    if (!$("#view-map").classList.contains("active")) { pendingFit = true; return; }
    pendingFit = false;
    if (w.bbox) map.fitBounds([[w.bbox[0], w.bbox[1]], [w.bbox[2], w.bbox[3]]], { padding: [24, 24], maxZoom: 15 });
    else map.setView([w.lat, w.lng], w.kind === "river" ? 12 : 13);
  }
  $("#btnFitWater").addEventListener("click", () => (activeWater() ? fitWater() : openWaterPicker()));

  let meMarker;
  function locate(fly = true) {
    if (!navigator.geolocation) { if (fly) toast("Standort wird nicht unterstützt"); return Promise.resolve(null); }
    return new Promise((res) => {
      navigator.geolocation.getCurrentPosition((p) => {
        state.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        store.set("lastPos", state.pos);
        const ll = [state.pos.lat, state.pos.lng];
        if (!meMarker) meMarker = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16] }), zIndexOffset: 1000, interactive: false }).addTo(map);
        else meMarker.setLatLng(ll);
        if (fly) map.flyTo(ll, Math.max(map.getZoom(), 14));
        res(state.pos);
      }, () => { if (fly) toast("Standort nicht verfügbar – Berechtigung prüfen"); res(null); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
  }
  $("#btnLocate").addEventListener("click", () => locate(true));

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (state.pickCallback) { const cb = state.pickCallback; state.pickCallback = null; cb({ lat, lng }); return; }
    const el = document.createElement("div");
    const w = guessWater({ lat, lng });
    el.innerHTML = `<div class="pt">${w ? esc(w.name) : "Position"}</div><div class="ps coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
      <div class="row"><button class="btn btn-primary btn-sm" data-a="c">${ic("fish", "xs")}Fang hier</button><button class="btn btn-sm" data-a="s">${ic("pin", "xs")}Spot hier</button></div>`;
    const pop = L.popup().setLatLng(e.latlng).setContent(el).openOn(map);
    el.querySelector('[data-a="c"]').onclick = () => { map.closePopup(pop); openCatchForm({ lat, lng, waterId: w?.id }); };
    el.querySelector('[data-a="s"]').onclick = () => { map.closePopup(pop); openSpotForm({ lat, lng, waterId: w?.id }); };
  });

  function renderMarkers() {
    catchLayer.clearLayers(); spotLayer.clearLayers(); hotspotLayer.clearLayers();
    const chip = $('#mapChips [data-layer="hotspots"]');
    if (chip) chip.hidden = !hotspotsOn();
    if (hotspotsOn() && mapLayers.hotspots) {
      const w = activeWater();
      const list = findHotspots(scopedCatches());
      const ranked = rankHotspots(list, nowConditions(w), null);
      ranked.forEach((h) => {
        const i = list.findIndex((x) => x.lat === h.lat && x.lng === h.lng);
        const el = document.createElement("div");
        el.innerHTML = `<div class="pt">${esc(hotspotName(h, i))}</div><div class="ps">${h.n} Fänge · ${esc(h.species.slice(0, 3).join(", "))} · heute ${h.score}/100</div>
          ${h.reasons.length ? `<p class="small">Passt heute: ${esc(h.reasons.join(", "))}</p>` : ""}
          ${h.tip.technique || h.tip.bait ? `<p class="small">Tipp: ${esc([h.tip.technique, h.tip.bait].filter(Boolean).join(" mit "))}${h.tip.depth != null ? `, ca. ${nf(h.tip.depth, 0)} m` : ""}</p>` : ""}
          <div class="row">${h.spot ? "" : `<button class="btn btn-primary btn-sm" data-a="s">Als Spot speichern</button>`}<button class="btn btn-sm" data-a="c">Fang hier</button></div>`;
        el.querySelector('[data-a="s"]')?.addEventListener("click", () => openSpotForm({ lat: h.lat, lng: h.lng, name: "Hotspot " + h.species[0], waterId: h.waterId || state.activeId, notes: "Aus deinen Fängen erkannter Hotspot." }));
        el.querySelector('[data-a="c"]').addEventListener("click", () => openCatchForm({ lat: h.lat, lng: h.lng, waterId: h.waterId || state.activeId, spotId: h.spot?.id }));
        const col = h.score >= 60 ? "#3df5b0" : h.score >= 40 ? "#f2a93b" : "#18d4e6";
        L.circle([h.lat, h.lng], { radius: Math.min(220, 70 + h.n * 25), color: col, weight: 2, opacity: .9, fillColor: col, fillOpacity: .16, dashArray: "4 4" }).bindPopup(el).addTo(hotspotLayer);
      });
    }
    if (mapLayers.catches) scopedCatches().filter((c) => c.lat != null).forEach((c) => {
      const el = document.createElement("div");
      el.innerHTML = `<div class="pt">${esc(c.species)}${c.length ? ` · ${nf(c.length)} cm` : ""}</div><div class="ps">${esc(fmtDateTime(c.date))}${c.waterTemp != null ? ` · Wasser ${nf(c.waterTemp)} °C` : ""}</div>
        ${c.photo ? `<img src="${c.photo}" style="width:100%;max-width:220px;border-radius:10px;display:block;margin-bottom:6px">` : ""}
        ${[c.technique, c.bait].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
        <div class="row"><button class="btn btn-sm">Bearbeiten</button></div>`;
      el.querySelector("button").onclick = () => openCatchForm(c);
      L.marker([c.lat, c.lng], { icon: mkIcon("catch", "fish") }).bindPopup(el).addTo(catchLayer);
    });
    if (mapLayers.spots) scopedSpots().forEach((s) => {
      const n = state.catches.filter((c) => c.spotId === s.id).length;
      const el = document.createElement("div");
      el.innerHTML = `<div class="pt">${esc(s.name)}</div><div class="ps">${n} Fänge${s.depth ? ` · ${nf(s.depth)} m tief` : ""}</div>${s.notes ? `<p class="small muted">${esc(s.notes)}</p>` : ""}
        <div class="row"><button class="btn btn-primary btn-sm" data-a="c">Fang hier</button><button class="btn btn-sm" data-a="e">Bearbeiten</button></div>`;
      el.querySelector('[data-a="c"]').onclick = () => openCatchForm({ lat: s.lat, lng: s.lng, spotId: s.id, waterId: s.waterId });
      el.querySelector('[data-a="e"]').onclick = () => openSpotForm(s);
      L.marker([s.lat, s.lng], { icon: mkIcon("spot", "pin") }).bindPopup(el).addTo(spotLayer);
    });
  }

  $("#mapChips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const k = b.dataset.layer;
    mapLayers[k] = !mapLayers[k];
    b.classList.toggle("on", mapLayers[k]);
    if (k === "public") { if (mapLayers.public) { publicLayer.addTo(map); findPublicSpots(); } else map.removeLayer(publicLayer); }
    else renderMarkers();
  });
  map.on("moveend", debounce(() => { if (mapLayers.public) findPublicSpots(true); }, 800));

  async function findPublicSpots(quiet) {
    if (map.getZoom() < 11) { if (!quiet) toast("Zum Suchen weiter hineinzoomen"); return; }
    if (!navigator.onLine) { if (!quiet) toast("Dafür wird Internet benötigt"); return; }
    const b = map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",");
    const q = `[out:json][timeout:25];(nwr["leisure"="fishing"](${bbox});nwr["fishing"="yes"](${bbox});nwr["leisure"="slipway"](${bbox});nwr["leisure"="marina"](${bbox}););out center 300;`;
    try {
      const data = await fetchJSON("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 30000);
      publicLayer.clearLayers();
      data.elements.forEach((el) => {
        const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
        if (lat == null) return;
        const t = el.tags || {};
        const kind = t.leisure === "slipway" ? "Slipanlage" : t.leisure === "marina" ? "Hafen" : "Fischerplatz";
        const div = document.createElement("div");
        div.innerHTML = `<div class="pt">${esc(t.name || kind)}</div><div class="ps">${kind} · OpenStreetMap</div><div class="row"><button class="btn btn-primary btn-sm">Als Spot speichern</button></div>`;
        div.querySelector("button").onclick = () => openSpotForm({ lat, lng, name: t.name || kind, notes: `${kind} (OpenStreetMap). Patent/Berechtigung prüfen.`, waterId: guessWater({ lat, lng })?.id || state.activeId });
        L.marker([lat, lng], { icon: mkIcon("public", t.leisure === "slipway" ? "level" : "target") }).bindPopup(div).addTo(publicLayer);
      });
      if (!quiet) toast(data.elements.length ? `${data.elements.length} Orte gefunden` : "Keine Fischerplätze in diesem Ausschnitt eingetragen");
    } catch { if (!quiet) toast("Suche fehlgeschlagen – später erneut versuchen"); }
  }

  $("#btnLayers").addEventListener("click", () => {
    const active = store.get("overlays", []);
    openSheet({
      title: "Kartenebenen", plain: true, noFooter: true,
      body: `<h3>Grundkarte</h3><div class="list" style="margin-bottom:18px">${Object.entries(BASES).map(([k, b]) => `<label class="li"><input type="radio" name="base" value="${k}" ${k === baseKey ? "checked" : ""} style="width:auto"><span class="body"><span class="t">${b.name}</span></span></label>`).join("")}</div>
        <h3>Zusätzliche Ebenen</h3><div class="list">${Object.entries(OVERLAYS).map(([k, o]) => `<label class="li"><input type="checkbox" name="ov" value="${k}" ${active.includes(k) ? "checked" : ""} style="width:auto"><span class="body"><span class="t">${o.name}</span>${k === "bathy" ? `<span class="s">Seegrund-Schummerung, wo swisstopo-Daten vorliegen</span>` : ""}</span></label>`).join("")}</div>
        <p class="source">Tipp: Die Landeskarte zeigt in vielen Seen Tiefenlinien.</p>`,
    });
    $$('#sheetBody [name="base"]').forEach((r) => r.addEventListener("change", () => {
      map.removeLayer(BASES[baseKey].layer); baseKey = r.value; BASES[baseKey].layer.addTo(map); store.set("base", baseKey);
    }));
    $$('#sheetBody [name="ov"]').forEach((c) => c.addEventListener("change", () => {
      const sel = $$('#sheetBody [name="ov"]:checked').map((x) => x.value);
      Object.entries(OVERLAYS).forEach(([k, o]) => (sel.includes(k) ? o.layer.addTo(map) : map.removeLayer(o.layer)));
      store.set("overlays", sel);
    }));
  });

  // ───────────────────────── Sheet (Dialog) ─────────────────────────
  const sheet = $("#sheet");
  let sheetSubmit = null, sheetDelete = null;
  $$("[data-close]", sheet).forEach((b) => b.addEventListener("click", () => sheet.close()));
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  $("#sheetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sheetSubmit) return;
    const btn = $("#sheetSubmit");
    btn.disabled = true;
    try { if ((await sheetSubmit()) !== false) sheet.close(); } finally { btn.disabled = false; }
  });
  $("#sheetDelete").addEventListener("click", async () => {
    if (sheetDelete && confirm("Wirklich löschen?")) { await sheetDelete(); sheet.close(); }
  });
  function openSheet({ title, body, onSubmit = null, onDelete = null, plain = false, noFooter = false, submitLabel = "Speichern" }) {
    $("#sheetTitle").textContent = title;
    const b = $("#sheetBody");
    b.className = "sheet-body" + (plain ? " plain" : "");
    b.innerHTML = body;
    sheetSubmit = onSubmit; sheetDelete = onDelete;
    $("#sheetDelete").hidden = !onDelete;
    $("#sheetFoot").hidden = noFooter;
    $("#sheetSubmit").textContent = submitLabel;
    if (!sheet.open) sheet.showModal();
    b.scrollTop = 0;
  }
  const field = (label, inner, full) => `<label class="field${full ? " full" : ""}"><span>${label}</span>${inner}</label>`;
  const formVals = () => Object.fromEntries(new FormData($("#sheetForm")).entries());
  const waterOptions = (sel) => `<option value="">– kein Gewässer –</option>` + state.waters.map((w) => `<option value="${w.id}" ${w.id === sel ? "selected" : ""}>${esc(w.name)}</option>`).join("");

  function locationField(o) {
    return `<div class="field full"><span>Position</span><div class="pos-box">
      <span class="coord grow" id="fCoord">${o.lat != null ? `${(+o.lat).toFixed(5)}, ${(+o.lng).toFixed(5)}` : "keine"}</span>
      <button type="button" class="btn btn-sm" id="fGps">${ic("locate", "xs")}GPS</button>
      <button type="button" class="btn btn-sm" id="fPick">${ic("map", "xs")}Karte</button></div>
      <input type="hidden" name="lat" value="${o.lat ?? ""}"><input type="hidden" name="lng" value="${o.lng ?? ""}"></div>`;
  }
  function wireLocation(reopen) {
    const setPos = (p) => { $('[name="lat"]').value = p.lat; $('[name="lng"]').value = p.lng; $("#fCoord").textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`; };
    $("#fGps").onclick = async () => { const p = await locate(false); if (p) setPos(p); else toast("Kein GPS-Signal"); };
    $("#fPick").onclick = () => {
      const draft = formVals();
      sheet.close(); showView("map");
      toast("Tippe auf die Karte, um die Position zu setzen", 5000);
      state.pickCallback = (p) => reopen({ ...draft, lat: p.lat, lng: p.lng });
    };
  }

  // ───────────────────────── Gewässer-Auswahl ─────────────────────────
  function openWaterPicker() {
    openSheet({
      title: "Gewässer wählen", plain: true, noFooter: true,
      body: `<label class="search">${ic("search", "sm")}<input id="wpSearch" type="search" placeholder="See, Fluss oder Weiher suchen" autocomplete="off"></label><div id="wpResults"></div>`,
    });
    const input = $("#wpSearch");
    const render = async () => {
      const q = norm(input.value);
      const ref = state.pos || refPoint();
      const row = (attrs, title, sub, end = "") => `<button type="button" class="li" ${attrs}><span class="thumb sm">${ic("water", "sm")}</span><span class="body"><span class="t">${title}</span><span class="s">${sub}</span></span><span class="end">${end}</span></button>`;
      let html = "";
      if (!q) {
        if (state.waters.length) {
          html += `<h3>Meine Gewässer</h3><div class="list" style="margin-bottom:18px">` +
            state.waters.map((w) => row(`data-id="${w.id}"`, esc(w.name), `${KIND[w.kind] || "Gewässer"}${w.cantons ? " · " + esc(w.cantons) : w.region ? " · " + esc(w.region) : ""} · ${state.catches.filter((c) => c.waterId === w.id).length} Fänge`, w.id === state.activeId ? `<span class="pill pill-accent">Aktiv</span>` : "")).join("") +
            row(`data-all="1"`, "Alle Gewässer", "Alle Fänge und Spots zusammen", !state.activeId ? `<span class="pill pill-accent">Aktiv</span>` : "") + `</div>`;
        }
        const near = CATALOG.map((c) => ({ c, d: km(ref, c) })).sort((a, b) => a.d - b.d).slice(0, 10);
        html += `<h3>${state.pos ? "In deiner Nähe" : "Beliebte Gewässer"}</h3><div class="list">` +
          near.map(({ c, d }) => row(`data-cat="${c.key}"`, esc(c.name), `${KIND[c.kind]} · ${esc(c.cantons)}${c.alplakes ? " · Seetemperatur" : ""}`, state.pos ? `${nf(d, 0)} km` : "")).join("") + `</div>`;
        $("#wpResults").innerHTML = html;
        return;
      }
      const cats = CATALOG.filter((c) => norm(c.name).includes(q) || norm(c.osm).includes(q) || norm(c.key).includes(q));
      html += cats.length ? `<h3>Schweizer Gewässer</h3><div class="list" style="margin-bottom:18px">${cats.map((c) => row(`data-cat="${c.key}"`, esc(c.name), `${KIND[c.kind]} · ${esc(c.cantons)}`)).join("")}</div>` : "";
      html += `<h3>Weitere (OpenStreetMap)</h3><div class="list" id="wpOsm"><div class="li"><span class="s faint">Suche …</span></div></div>`;
      $("#wpResults").innerHTML = html;
      osmSearch(input.value);
    };
    const osmSearch = debounce(async (q) => {
      if (q.trim().length < 3 || !navigator.onLine) { const el = $("#wpOsm"); if (el) el.innerHTML = `<div class="li"><span class="s faint">${navigator.onLine ? "Mindestens 3 Zeichen" : "Offline"}</span></div>`; return; }
      try {
        const res = await fetchJSON(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=ch,li,de,at,fr,it&limit=10`);
        const hits = [];
        res.filter((r) => ["natural", "water", "waterway"].includes(r.category) || ["lake", "river", "reservoir", "pond", "stream", "canal"].includes(r.type))
          .sort((a, b) => (a.osm_type === "relation" ? -1 : 0) - (b.osm_type === "relation" ? -1 : 0))
          .forEach((r) => { if (!hits.some((h) => h.name === r.name && h.type === r.type && km({ lat: +h.lat, lng: +h.lon }, { lat: +r.lat, lng: +r.lon }) < 40)) hits.push(r); });
        const el = $("#wpOsm");
        if (!el) return;
        el.innerHTML = hits.length ? hits.map((r, i) => `<button type="button" class="li" data-osm="${i}"><span class="thumb sm">${ic("water", "sm")}</span><span class="body"><span class="t">${esc(r.name || r.display_name.split(",")[0])}</span><span class="s">${esc(KIND[r.type] || r.type)} · ${esc(r.display_name.split(",").slice(1, 4).join(","))}</span></span></button>`).join("")
          : `<div class="li"><span class="s faint">Keine Gewässer gefunden</span></div>`;
        el._hits = hits;
      } catch { const el = $("#wpOsm"); if (el) el.innerHTML = `<div class="li"><span class="s faint">Suche nicht möglich</span></div>`; }
    }, 650);
    input.addEventListener("input", render);
    $("#wpResults").addEventListener("click", async (e) => {
      const b = e.target.closest(".li");
      if (!b || b.tagName !== "BUTTON") return;
      if (b.dataset.id) await setActive(b.dataset.id);
      else if (b.dataset.all) await setActive(null);
      else if (b.dataset.cat) await addCatalogWater(CATALOG.find((c) => c.key === b.dataset.cat));
      else if (b.dataset.osm) await addOsmWater($("#wpOsm")._hits[+b.dataset.osm]);
      sheet.close();
    });
    render();
  }
  $("#waterSwitch").addEventListener("click", openWaterPicker);

  function openWaterEdit(w) {
    openSheet({
      title: "Gewässer bearbeiten",
      body: `${field("Name", `<input name="name" required value="${esc(w.name)}">`, true)}
        ${field("Typ", `<select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === w.kind ? "selected" : ""}>${v}</option>`).join("")}</select>`)}
        ${field("Kanton(e)", `<input name="cantons" value="${esc(w.cantons)}" placeholder="z. B. ZH">`)}
        ${field("Patent / Berechtigung", `<input name="permit" value="${esc(w.permit)}" placeholder="z. B. Jahrespatent ZG">`, true)}
        ${field("Notizen", `<textarea name="notes" placeholder="Regeln, Schonmasse, Zufahrt …">${esc(w.notes)}</textarea>`, true)}`,
      onSubmit: async () => {
        const v = formVals();
        Object.assign(w, { name: v.name.trim() || w.name, kind: v.kind, cantons: v.cantons.trim(), permit: v.permit.trim(), notes: v.notes.trim() });
        await DB.put("waters", w);
        await setActive(w.id);
        toast("Gewässer gespeichert");
      },
      onDelete: async () => {
        await DB.del("waters", w.id);
        state.waters = state.waters.filter((x) => x.id !== w.id);
        for (const c of state.catches.filter((c) => c.waterId === w.id)) { c.waterId = null; await DB.put("catches", c); }
        for (const s of state.spots.filter((s) => s.waterId === w.id)) { s.waterId = null; await DB.put("spots", s); }
        await setActive(null);
        toast("Gewässer entfernt – Fänge bleiben erhalten");
      },
    });
  }

  // ───────────────────────── Fänge ─────────────────────────
  function speciesOptions(w) {
    const first = speciesOfWater(w);
    const all = new Set([...first, ...window.FISH_GUIDE.map((f) => f.name), "Regenbogenforelle", "Rapfen", "Rotfeder", "Laube", "Karausche", "Graskarpfen"]);
    state.catches.forEach((c) => c.species && all.add(c.species));
    return [...all].map((s) => `<option value="${esc(s)}">`).join("");
  }
  const techniqueOptions = () => [...new Set([...window.TECHNIQUES.map((t) => t.name), ...state.catches.map((c) => c.technique).filter(Boolean)])].map((s) => `<option value="${esc(s)}">`).join("");

  function openCatchForm(c = {}) {
    const existing = c.id ? state.catches.find((x) => x.id === c.id) : null;
    const o = { date: toLocalInput(new Date()), waterId: state.activeId, ...c };
    if (o.lat == null && !existing) { const p = state.pos; if (p) Object.assign(o, p); else { const m = map.getCenter(); o.lat = m.lat; o.lng = m.lng; } }
    if (!c.waterId && !existing && o.lat != null) o.waterId = guessWater(o)?.id || o.waterId;
    let photo = o.photo || null;
    const spotOpts = (wid) => `<option value="">– kein Spot –</option>` + state.spots.filter((s) => !wid || s.waterId === wid).map((s) => `<option value="${s.id}" ${o.spotId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    openSheet({
      title: existing ? "Fang bearbeiten" : "Neuer Fang",
      body: `
        ${field("Fischart", `<input name="species" list="dlSpecies" required value="${esc(o.species)}" placeholder="z. B. Egli" autocomplete="off"><datalist id="dlSpecies">${speciesOptions(waterById(o.waterId))}</datalist>`)}
        ${field("Datum & Zeit", `<input type="datetime-local" name="date" value="${esc(o.date)}">`)}
        ${field("Länge (cm)", `<input type="number" name="length" step="0.5" min="0" inputmode="decimal" value="${esc(o.length)}">`)}
        ${field("Gewicht (kg)", `<input type="number" name="weight" step="0.01" min="0" inputmode="decimal" value="${esc(o.weight)}">`)}
        ${field("Gewässer", `<select name="waterId" id="fWater">${waterOptions(o.waterId)}</select>`)}
        ${field("Spot", `<select name="spotId" id="fSpot">${spotOpts(o.waterId)}</select>`)}
        ${field("Technik", `<input name="technique" list="dlTech" value="${esc(o.technique)}" placeholder="z. B. Hegene" autocomplete="off"><datalist id="dlTech">${techniqueOptions()}</datalist>`)}
        ${field("Köder", `<input name="bait" value="${esc(o.bait)}" placeholder="z. B. Nymphe braun">`)}
        ${field("Fangtiefe (m)", `<input type="number" name="depth" step="0.5" min="0" inputmode="decimal" value="${esc(o.depth)}">`)}
        ${field("Verbleib", `<select name="released"><option value="">–</option><option value="nein" ${o.released === "nein" ? "selected" : ""}>Entnommen</option><option value="ja" ${o.released === "ja" ? "selected" : ""}>Zurückgesetzt</option></select>`)}
        ${locationField(o)}
        ${field("Foto", `<input type="file" accept="image/*" id="fPhoto"><img id="fPhotoPrev" class="photo-prev" ${photo ? `src="${photo}"` : "hidden"} alt="">`, true)}
        ${field("Notizen", `<textarea name="notes" placeholder="Wetter, Wasser, Besonderheiten …">${esc(o.notes)}</textarea>`, true)}
        ${existing && (existing.weather || existing.waterTemp != null) ? `<p class="small muted field full">Bedingungen: ${[existing.waterTemp != null ? `Wasser ${nf(existing.waterTemp)} °C` : "", existing.weather ? `Luft ${nf(existing.weather.temp)} °C, Wind ${nf(existing.weather.wind, 0)} km/h ${dirName(existing.weather.dir)}, ${nf(existing.weather.pressure, 0)} hPa` : ""].filter(Boolean).join(" · ")}</p>` : ""}`,
      onSubmit: async () => {
        const v = formVals();
        if (!v.species.trim()) return false;
        const rec = {
          ...(existing || { id: uid(), created: Date.now() }),
          species: v.species.trim(), date: v.date || toLocalInput(new Date()),
          length: num(v.length), weight: num(v.weight), depth: num(v.depth),
          technique: v.technique.trim(), bait: v.bait.trim(), waterId: v.waterId || null, spotId: v.spotId || null,
          released: v.released, notes: v.notes.trim(), lat: num(v.lat), lng: num(v.lng), photo,
        };
        if (!existing) await captureConditions(rec);
        await DB.put("catches", rec);
        await reload();
        toast(existing ? "Fang aktualisiert" : "Petri Heil! Fang gespeichert");
      },
      onDelete: existing ? async () => { await DB.del("catches", existing.id); await reload(); toast("Fang gelöscht"); } : null,
    });
    $("#fWater").addEventListener("change", (e) => { o.spotId = null; $("#fSpot").innerHTML = spotOpts(e.target.value); $("#dlSpecies").innerHTML = speciesOptions(waterById(e.target.value)); });
    wireLocation((d) => openCatchForm({ ...(existing || {}), ...d, photo, id: existing?.id }));
    $("#fPhoto").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      photo = await resizeImage(f, 1280, 0.78);
      const img = $("#fPhotoPrev"); img.src = photo; img.hidden = false;
    });
  }

  // Wetter und Wassertemperatur zum Fangzeitpunkt speichern
  async function captureConditions(rec) {
    const t = Date.parse(rec.date);
    const w = waterById(rec.waterId);
    const ld = w && lakeData(w);
    if (ld) { const v = surfaceAt(ld, t); if (v != null) rec.waterTemp = Math.round(v * 10) / 10; }
    if (!navigator.onLine || Math.abs(t - Date.now()) > 3 * 3600e3 || rec.lat == null) return;
    try {
      const fc = await Promise.race([forecast({ lat: rec.lat, lng: rec.lng }), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 5000))]);
      const c = fc.current;
      rec.weather = { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m, dir: c.wind_direction_10m, clouds: c.cloud_cover, pressure: c.surface_pressure };
      const tr = pressureTrend(fc);
      if (tr) rec.weather.pressureTrend = Math.round(tr.past * 10) / 10;
    } catch { /* ohne Wetter speichern */ }
    if (rec.waterTemp == null && w) {
      try { const h = await hydroFor(w, rec); if (h?.temperature) rec.waterTemp = h.temperature.val; } catch { /* egal */ }
    }
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

  // ───────────────────────── Hotspots & Empfehlungen (Beta) ─────────────────────────
  // Abschaltbar in den Einstellungen. Fasst Fänge im Umkreis von ~150 m zusammen und
  // vergleicht die heutigen Bedingungen mit denen deiner bisherigen Fänge.
  const hotspotsOn = () => store.get("hotspots", true);
  state.live = { temp: {}, dp: {}, wx: {} };
  // Wetterlage grob einteilen (WMO-Code)
  const wxType = (c) => (c == null ? null : c >= 95 ? "Gewitter" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "Schnee" : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? "Regen" : "trocken");
  const cloudName = (v) => (v == null ? "" : v >= 75 ? "bedeckt" : v >= 35 ? "teils bewölkt" : "sonnig");
  const circ = (a, b, period) => { const d = Math.abs(a - b) % period; return Math.min(d, period - d); };

  function findHotspots(catches) {
    const clusters = [];
    for (const c of catches.filter((x) => x.lat != null && x.lng != null)) {
      let best = null, bd = Infinity;
      for (const cl of clusters) { const d = km(cl, c); if (d < bd) { bd = d; best = cl; } }
      if (best && bd <= 0.15) {
        best.items.push(c);
        const n = best.items.length;
        best.lat += (c.lat - best.lat) / n; best.lng += (c.lng - best.lng) / n;
      } else clusters.push({ lat: c.lat, lng: c.lng, items: [c] });
    }
    return clusters.filter((cl) => cl.items.length >= 2).map((cl) => {
      const spot = state.spots.map((sp) => ({ sp, d: km(sp, cl) })).filter((x) => x.d <= 0.2).sort((a, b) => a.d - b.d)[0]?.sp || null;
      const depths = cl.items.map((c) => c.depth).filter((v) => v != null);
      const temps = cl.items.map((c) => c.waterTemp).filter((v) => v != null);
      const wid = topBy(cl.items, "waterId")[0]?.[0] || null;
      return {
        ...cl, spot, waterId: wid,
        species: topBy(cl.items, "species").map((e) => e[0]),
        bait: topBy(cl.items, "bait")[0]?.[0] || "",
        technique: topBy(cl.items, "technique")[0]?.[0] || "",
        depth: depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : null,
        tempMin: temps.length ? Math.min(...temps) : null, tempMax: temps.length ? Math.max(...temps) : null,
      };
    });
  }

  function nowConditions(w) {
    const now = new Date(), ld = w && lakeData(w);
    return {
      temp: ld ? surfaceAt(ld) : (w ? state.live.temp[w.id] ?? null : null),
      hour: now.getHours() + now.getMinutes() / 60,
      month: now.getMonth(),
      phase: SunCalc.getMoonIllumination(now).phase,
      dp: w ? state.live.dp[w.id] ?? null : null,
      wx: w ? state.live.wx[w.id] ?? null : null, // aktuelles Wetter (Open-Meteo / MeteoSwiss ICON)
    };
  }

  // Ähnlichkeit eines Fangs mit den heutigen Bedingungen (0–1) inkl. Einzelwerten für die Begründung
  function similarity(c, cond) {
    const d = new Date(c.date), parts = {};
    if (cond.temp != null && c.waterTemp != null) parts.temp = [3, Math.exp(-(((c.waterTemp - cond.temp) / 2.5) ** 2))];
    if (!isNaN(d)) {
      parts.hour = [2, Math.exp(-((circ(d.getHours() + d.getMinutes() / 60, cond.hour, 24) / 2.5) ** 2))];
      parts.month = [2, Math.exp(-((circ(d.getMonth(), cond.month, 12) / 1.5) ** 2))];
      parts.moon = [1, Math.exp(-((circ(SunCalc.getMoonIllumination(d).phase, cond.phase, 1) / 0.15) ** 2))];
    }
    if (cond.dp != null && c.weather?.pressureTrend != null) parts.press = [1, Math.sign(Math.round(cond.dp)) === Math.sign(Math.round(c.weather.pressureTrend)) ? 1 : 0.3];
    // Wetter beim Fang vs. Wetter jetzt
    const cw = c.weather, nw = cond.wx;
    if (cw && nw) {
      if (cw.temp != null && nw.temperature_2m != null) parts.air = [1, Math.exp(-(((cw.temp - nw.temperature_2m) / 4) ** 2))];
      if (cw.wind != null && nw.wind_speed_10m != null) parts.wind = [1, Math.exp(-(((cw.wind - nw.wind_speed_10m) / 8) ** 2))];
      if (cw.dir != null && nw.wind_direction_10m != null && cw.wind >= 5 && nw.wind_speed_10m >= 5) parts.dir = [1.5, Math.exp(-((circ(cw.dir, nw.wind_direction_10m, 360) / 45) ** 2))];
      if (cw.clouds != null && nw.cloud_cover != null) parts.clouds = [1, Math.exp(-(((cw.clouds - nw.cloud_cover) / 30) ** 2))];
      const a = wxType(cw.code), b = wxType(nw.weather_code);
      if (a && b) parts.type = [1, a === b ? 1 : 0.3];
    }
    const w = Object.values(parts).reduce((a, [g]) => a + g, 0);
    return { v: w ? Object.values(parts).reduce((a, [g, x]) => a + g * x, 0) / w : 0, parts };
  }

  function rankHotspots(list, cond, species) {
    return list.map((h) => {
      const items = species ? h.items.filter((c) => c.species === species) : h.items;
      if (!items.length) return null;
      const sims = items.map((c) => ({ c, ...similarity(c, cond) })).sort((a, b) => b.v - a.v);
      const total = sims.reduce((a, x) => a + x.v, 0);
      const score = Math.round(100 * (1 - Math.exp(-total / 1.6)));
      const good = sims.filter((x) => x.v >= 0.5);
      const avgPart = (k) => { const a = good.filter((x) => x.parts[k]).map((x) => x.parts[k][1]); return a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0; };
      const reasons = [];
      if (avgPart("temp") >= 0.6) reasons.push(`ähnliche Wassertemperatur (${Math.round(h.tempMin) === Math.round(h.tempMax) ? `ca. ${nf(h.tempMin, 0)}` : `${nf(h.tempMin, 0)}–${nf(h.tempMax, 0)}`} °C)`);
      if (avgPart("hour") >= 0.6) { const hrs = good.map((x) => new Date(x.c.date).getHours()); reasons.push(`gleiche Tageszeit (${pad(Math.min(...hrs))}–${pad(Math.max(...hrs) + 1)} Uhr)`); }
      if (avgPart("month") >= 0.6) reasons.push("gleiche Jahreszeit");
      if (avgPart("moon") >= 0.6) reasons.push("ähnliche Mondphase");
      if (avgPart("press") >= 0.9) reasons.push("gleicher Luftdrucktrend");
      const nw = cond.wx;
      if (nw) {
        if (avgPart("dir") >= 0.6) reasons.push(`Wind aus ${dirName(nw.wind_direction_10m)} wie bei deinen Fängen`);
        else if (avgPart("wind") >= 0.7) reasons.push(nw.wind_speed_10m < 8 ? "ähnlich wenig Wind" : "ähnlich starker Wind");
        if (avgPart("clouds") >= 0.7) reasons.push(`ähnliche Bewölkung (${cloudName(nw.cloud_cover)})`);
        if (avgPart("type") >= 0.9 && wxType(nw.weather_code) !== "trocken") reasons.push(`gleiche Wetterlage (${wxType(nw.weather_code)})`);
        if (avgPart("air") >= 0.7) reasons.push("ähnliche Lufttemperatur");
      }
      const bestC = sims[0].c;
      return { ...h, n: items.length, score, reasons, tip: { technique: bestC.technique || h.technique, bait: bestC.bait || h.bait, depth: bestC.depth ?? h.depth } };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  }

  const hotspotName = (h, i) => h.spot ? h.spot.name : `Hotspot ${i + 1}`;

  function hotspotCardHtml(w) {
    const cs = state.catches.filter((c) => c.waterId === w.id);
    const withPos = cs.filter((c) => c.lat != null);
    const hs = findHotspots(cs);
    const head = `<div class="card-head"><h3>Hotspots · Empfehlung heute</h3><span class="pill pill-accent">Beta</span></div>`;
    if (!hs.length) {
      return head + `<p class="small muted">${withPos.length < 2
        ? `Trage Fänge mit GPS-Position ein (bisher ${withPos.length} hier). Sobald du an einer Stelle mehrmals fängst, erkennt die App deinen Hotspot und empfiehlt ihn bei passenden Bedingungen.`
        : "Deine Fänge liegen noch verstreut. Sobald du an einer Stelle (im Umkreis von ca. 150 m) mehrmals fängst, erscheint hier ein Hotspot."}</p>`;
    }
    const cond = nowConditions(w);
    const speciesAll = [...new Set(hs.flatMap((h) => h.species))];
    const sel = speciesAll.includes(state.hsSpecies) ? state.hsSpecies : null;
    const ranked = rankHotspots(hs, cond, sel).slice(0, 3);
    const order = hs.map((h) => h.lat + "," + h.lng);
    return head + `
      ${speciesAll.length > 1 ? `<div class="chips" style="margin-bottom:10px">${[null, ...speciesAll].map((n) => `<button type="button" class="chip ${n === sel ? "on" : ""}" data-hs-species="${esc(n || "")}">${esc(n || "Alle Arten")}</button>`).join("")}</div>` : ""}
      ${ranked.map((h) => { const i = order.indexOf(h.lat + "," + h.lng); return `
        <div class="pdetail">
          <div class="row" style="justify-content:space-between"><span class="when">${esc(hotspotName(h, i))}</span>
            <span class="pidx" style="background:${h.score >= 60 ? "var(--good)" : h.score >= 40 ? "var(--warn)" : "var(--surface-2)"};color:${h.score >= 40 ? "#fff" : "var(--ink-2)"}">${h.score}</span></div>
          <div class="small muted">${h.n} Fänge · ${esc(h.species.slice(0, 3).join(", "))}${h.depth != null ? ` · Ø ${nf(h.depth, 0)} m tief` : ""}</div>
          ${h.reasons.length ? `<div class="small">Passt heute: ${esc(h.reasons.join(", "))}</div>` : `<div class="small muted">Heute weichen die Bedingungen von deinen Fängen hier ab.</div>`}
          ${h.tip.technique || h.tip.bait ? `<div class="small">Tipp: ${esc([h.tip.technique, h.tip.bait].filter(Boolean).join(" mit "))}${h.tip.depth != null ? `, ca. ${nf(h.tip.depth, 0)} m` : ""}</div>` : ""}
          <div class="row" style="margin-top:6px"><button type="button" class="btn btn-sm" data-hs-map="${h.lat},${h.lng}">${ic("map", "xs")}Auf Karte</button>
            ${h.spot ? "" : `<button type="button" class="btn btn-sm" data-hs-save="${h.lat},${h.lng}" data-hs-name="${esc("Hotspot " + h.species[0])}">${ic("pin", "xs")}Als Spot speichern</button>`}</div>
        </div>`; }).join("")}
      <p class="source">Berechnet aus deinen Fängen im Vergleich zu jetzt: Wassertemperatur, Tageszeit, Jahreszeit, Mondphase, Luftdrucktrend, Wind (Stärke und Richtung), Bewölkung, Wetterlage und Lufttemperatur.${cond.wx ? "" : " Wetter wird geladen …"}</p>`;
  }

  function renderHotspotCard(w) {
    const el = $("#hsCard");
    if (!el) return;
    if (!hotspotsOn() || !w) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = hotspotCardHtml(w);
  }

  document.addEventListener("click", (e) => {
    const sp = e.target.closest("[data-hs-species]");
    if (sp) { state.hsSpecies = sp.dataset.hsSpecies || null; renderHotspotCard(activeWater()); return; }
    const mp = e.target.closest("[data-hs-map]");
    if (mp) { const [la, lo] = mp.dataset.hsMap.split(",").map(Number); showView("map"); setTimeout(() => map.flyTo([la, lo], 16), 80); return; }
    const sv = e.target.closest("[data-hs-save]");
    if (sv) { const [la, lo] = sv.dataset.hsSave.split(",").map(Number); openSpotForm({ lat: la, lng: lo, name: sv.dataset.hsName, waterId: state.activeId, notes: "Aus deinen Fängen erkannter Hotspot." }); }
  });

  const catchRow = (c) => `<button type="button" class="li" data-catch="${c.id}">
      ${c.photo ? `<img class="thumb" src="${c.photo}" alt="">` : `<span class="thumb">${ic("fish")}</span>`}
      <span class="body"><span class="t">${esc(c.species)}${c.length ? ` · ${nf(c.length)} cm` : ""}${c.weight ? ` · ${nf(c.weight, 2)} kg` : ""}</span>
      <span class="s">${esc(fmtDateTime(c.date))}${!state.activeId && c.waterId ? ` · ${esc(waterName(c.waterId))}` : ""}${c.spotId ? ` · ${esc(spotName(c.spotId))}` : ""}</span>
      <span class="s">${[c.technique, c.bait].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</span></span>
      <span class="end">${c.waterTemp != null ? `${nf(c.waterTemp)}°` : ""}</span></button>`;

  function renderCatches() {
    $$("#catchSeg button").forEach((b) => b.classList.toggle("on", b.dataset.seg === state.catchSeg));
    $("#catchListWrap").hidden = state.catchSeg !== "list";
    $("#stats").hidden = state.catchSeg !== "stats";
    if (state.catchSeg === "stats") return renderStats();
    const q = norm($("#catchSearch").value);
    const list = scopedCatches()
      .filter((c) => !q || norm([c.species, c.bait, c.technique, c.notes, spotName(c.spotId), waterName(c.waterId)].join(" ")).includes(q))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const w = activeWater();
    $("#catchList").innerHTML = list.map(catchRow).join("");
    $("#catchEmpty").innerHTML = list.length ? "" : `<div class="empty">${ic("fish")}<p>${q ? "Keine Treffer." : w ? `Noch keine Fänge hier (${esc(w.name)}).` : "Noch keine Fänge eingetragen."}</p>${q ? "" : `<button class="btn btn-primary" data-action="new-catch">${ic("plus", "sm")}Ersten Fang eintragen</button>`}</div>`;
  }
  $("#catchSearch").addEventListener("input", renderCatches);
  $("#catchSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.catchSeg = b.dataset.seg; renderCatches(); } });
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-catch]");
    if (c) return openCatchForm(state.catches.find((x) => x.id === c.dataset.catch));
    const s = e.target.closest("[data-spot]");
    if (s) return openSpotForm(state.spots.find((x) => x.id === s.dataset.spot));
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const act = a.dataset.action;
    if (act === "new-catch") openCatchForm();
    if (act === "new-spot") openSpotForm(state.pos ? { ...state.pos } : {});
    if (act === "pick-water") openWaterPicker();
    if (act === "edit-water") openWaterEdit(activeWater());
    if (act === "goto") showView(a.dataset.view);
    if (act === "guide-fish") { state.guideSeg = "fish"; $("#guideSearch").value = a.dataset.name; showView("guide"); }
  });

  function topBy(arr, key) {
    const m = new Map();
    arr.forEach((x) => { const v = typeof x[key] === "string" ? x[key].trim() : x[key]; if (v) m.set(v, (m.get(v) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderStats() {
    const cs = scopedCatches();
    if (!cs.length) { $("#stats").innerHTML = `<div class="empty">${ic("fish")}<p>Sobald du Fänge einträgst, siehst du hier deine Auswertungen.</p></div>`; return; }
    const species = topBy(cs, "species");
    const biggest = {};
    cs.forEach((c) => { if (c.length && (!biggest[c.species] || c.length > biggest[c.species].length)) biggest[c.species] = c; });
    const perMonth = Array(12).fill(0), perHour = Array(12).fill(0);
    cs.forEach((c) => { const d = new Date(c.date); if (!isNaN(d)) { perMonth[d.getMonth()]++; perHour[Math.floor(d.getHours() / 2)]++; } });
    const phases = new Map();
    cs.forEach((c) => { const d = new Date(c.date); if (!isNaN(d)) { const k = phaseName(SunCalc.getMoonIllumination(d).phase); phases.set(k, (phases.get(k) || 0) + 1); } });
    const temps = new Map();
    cs.filter((c) => c.waterTemp != null).forEach((c) => { const b = Math.floor(c.waterTemp / 2) * 2; const k = `${b}–${b + 2} °C`; temps.set(k, (temps.get(k) || 0) + 1); });
    const depths = new Map();
    cs.filter((c) => c.depth != null).forEach((c) => { const b = c.depth < 5 ? "0–5 m" : c.depth < 10 ? "5–10 m" : c.depth < 20 ? "10–20 m" : c.depth < 40 ? "20–40 m" : "> 40 m"; depths.set(b, (depths.get(b) || 0) + 1); });
    $("#stats").innerHTML = `
      <div class="tiles">
        <div class="tile"><span class="k">Fänge</span><span class="v">${cs.length}</span></div>
        <div class="tile"><span class="k">Arten</span><span class="v">${species.length}</span></div>
        <div class="tile"><span class="k">Gewicht</span><span class="v">${nf(cs.reduce((s, c) => s + (c.weight || 0), 0), 1)}<small>kg</small></span></div>
        <div class="tile"><span class="k">Zurückgesetzt</span><span class="v">${cs.filter((c) => c.released === "ja").length}</span></div>
      </div>
      <div class="card"><h3>Rekorde</h3>${Object.values(biggest).sort((a, b) => b.length - a.length).map((c) => `<div class="period"><span><span class="when">${esc(c.species)}</span> · ${nf(c.length)} cm${c.weight ? ` · ${nf(c.weight, 2)} kg` : ""}</span><span class="faint small">${esc(fmtDate(c.date))}</span></div>`).join("") || `<p class="faint small">Trage Längen ein, um Rekorde zu sehen.</p>`}</div>
      <div class="card"><h3>Fischarten</h3>${barsList(species.slice(0, 10))}</div>
      <div class="card"><h3>Beste Köder</h3>${barsList(topBy(cs, "bait").slice(0, 8))}</div>
      <div class="card"><h3>Beste Techniken</h3>${barsList(topBy(cs, "technique").slice(0, 8))}</div>
      <div class="card"><h3>Beste Spots</h3>${barsList(topBy(cs.filter((c) => c.spotId), "spotId").slice(0, 8), spotName)}</div>
      <div class="card"><h3>Nach Uhrzeit</h3>${barsList(perHour.map((n, i) => [`${pad(i * 2)}–${pad(i * 2 + 2)} Uhr`, n]).filter((e) => e[1]))}</div>
      <div class="card"><h3>Nach Wassertemperatur</h3>${barsList([...temps.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])))}</div>
      <div class="card"><h3>Nach Fangtiefe</h3>${barsList(["0–5 m", "5–10 m", "10–20 m", "20–40 m", "> 40 m"].filter((k) => depths.has(k)).map((k) => [k, depths.get(k)]))}</div>
      <div class="card"><h3>Nach Monat</h3>${barsList(perMonth.map((n, i) => [MONTHS[i], n]).filter((e) => e[1]))}</div>
      <div class="card"><h3>Nach Mondphase</h3>${barsList([...phases.entries()].sort((a, b) => b[1] - a[1]))}</div>`;
  }

  // ───────────────────────── Spots ─────────────────────────
  const spotName = (id) => state.spots.find((s) => s.id === id)?.name || "";
  function openSpotForm(s = {}) {
    const existing = s.id ? state.spots.find((x) => x.id === s.id) : null;
    const o = { waterId: state.activeId, ...s };
    if (o.lat == null) { const m = map.getCenter(); o.lat = m.lat; o.lng = m.lng; }
    if (!s.waterId && !existing) o.waterId = guessWater(o)?.id || o.waterId;
    openSheet({
      title: existing ? "Spot bearbeiten" : "Neuer Spot",
      body: `${field("Name", `<input name="name" required value="${esc(o.name)}" placeholder="z. B. Halde beim Steg">`, true)}
        ${field("Gewässer", `<select name="waterId">${waterOptions(o.waterId)}</select>`)}
        ${field("Wassertiefe (m)", `<input type="number" name="depth" step="0.5" min="0" inputmode="decimal" value="${esc(o.depth)}">`)}
        ${field("Zielfische", `<input name="species" value="${esc(o.species)}" placeholder="z. B. Egli, Hecht">`)}
        ${field("Bewertung", `<select name="rating">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${+o.rating === n ? "selected" : ""}>${n ? "★".repeat(n) : "–"}</option>`).join("")}</select>`)}
        ${locationField(o)}
        ${field("Notizen", `<textarea name="notes" placeholder="Struktur, Hänger, Zufahrt, Parkieren …">${esc(o.notes)}</textarea>`, true)}`,
      onSubmit: async () => {
        const v = formVals();
        if (!v.name.trim()) return false;
        await DB.put("spots", { ...(existing || { id: uid(), created: Date.now() }), name: v.name.trim(), waterId: v.waterId || null, depth: num(v.depth), species: v.species.trim(), rating: +v.rating || 0, notes: v.notes.trim(), lat: num(v.lat), lng: num(v.lng) });
        await reload();
        toast("Spot gespeichert");
      },
      onDelete: existing ? async () => {
        await DB.del("spots", existing.id);
        for (const c of state.catches.filter((c) => c.spotId === existing.id)) await DB.put("catches", { ...c, spotId: null });
        await reload(); toast("Spot gelöscht");
      } : null,
    });
    wireLocation((d) => openSpotForm({ ...(existing || {}), ...d, id: existing?.id }));
  }

  // ───────────────────────── Gewässer-Übersicht ─────────────────────────
  function renderHome() {
    const w = activeWater();
    const el = $("#home");
    if (!w) return renderHomeEmpty(el);
    const c = catalogOf(w);
    const ld = lakeData(w);
    const th = ld ? thermocline(ld.profile) : null;
    const isLake = w.kind === "lake" || w.kind === "reservoir" || w.kind === "pond";
    const sol = solunar(new Date(), w.lat, w.lng);
    const cs = state.catches.filter((x) => x.waterId === w.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const sp = state.spots.filter((x) => x.waterId === w.id);
    const month = new Date().getMonth();
    const species = speciesOfWater(w).map((n) => window.FISH_GUIDE.find((f) => f.name === n)).filter(Boolean)
      .map((f) => ({ f, lvl: f.months[month], spawn: f.spawn.includes(month) }))
      .sort((a, b) => (b.lvl - (b.spawn ? 2 : 0)) - (a.lvl - (a.spawn ? 2 : 0)));
    const surf = ld ? surfaceAt(ld) : null;

    el.innerHTML = `
      <div class="card hero">
        <div class="hero-top">
          <p class="sub" style="margin:0">${w.permit ? esc(w.permit) : `${KIND[w.kind] || "Gewässer"}${w.cantons ? ` · Kanton ${esc(w.cantons)}` : w.region ? ` · ${esc(w.region)}` : ""}`}</p>
          <button class="btn btn-sm" data-action="edit-water">Bearbeiten</button>
        </div>
        ${c && (c.area || c.depth || c.alt) ? `<div class="facts">
          <div><div class="k">Fläche</div><div class="v">${c.area ? `${nf(c.area, 1)} <small>km²</small>` : "–"}</div></div>
          <div><div class="k">Max. Tiefe</div><div class="v">${c.depth ? `${c.depth} <small>m</small>` : "–"}</div></div>
          <div><div class="k">Höhe</div><div class="v">${c.alt ? `${c.alt} <small>m ü. M.</small>` : "–"}</div></div></div>` : ""}
        <div class="insight">${ic("info", "sm")}<div id="homeInsight">${homeInsight(w, sol, th, surf)}</div></div>
      </div>

      <div class="tiles" id="homeTiles">
        ${tile("thermo", "Wasser", surf != null ? `${nf(surf)}<small>°C</small>` : null, surf != null ? "Oberfläche · Seemodell Eawag" : "", "tWater")}
        ${isLake ? tile("depth", "Sprungschicht", th ? (th.stratified ? `${nf(th.depth, 0)}<small>m</small>` : `<span style="font-size:1.05rem">durchmischt</span>`) : null, th ? (th.stratified ? `oben ${nf(th.top)}° · 20 m ${nf(th.at20)}°` : `ca. ${nf(th.top)}° bis in die Tiefe`) : "", "tThermo")
                 : tile("flow", "Abfluss", null, "", "tFlow")}
        ${tile("level", "Pegel", null, "", "tLevel")}
        ${tile("thermo", "Luft", null, "", "tAir")}
        ${tile("wind", "Wind", null, "", "tWind")}
        ${tile("gauge", "Luftdruck", null, "", "tPress")}
      </div>

      <button type="button" class="btn toggle-btn ${state.wxOpen ? "open" : ""}" id="btnWxDays"><span class="row">${ic("cloud-sun", "sm")}Wetter der nächsten Tage</span>${ic("chev", "sm")}</button>
      <div class="card toggle-panel" id="wxDays" ${state.wxOpen ? "" : "hidden"}><p class="faint small">Wird geladen …</p></div>

      ${ld ? `<div class="card">
        <div class="card-head"><h3>Wassertemperatur nach Tiefe</h3><span class="xsmall faint">${esc(new Date(ld.time).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span></div>
        <div class="chart" id="chProfile"></div>
        <p class="small muted" style="margin-top:10px">${profileText(th)}</p>
        <div class="chart-title" style="margin-top:18px"><b>Oberflächentemperatur</b><span>°C · Verlauf & Prognose</span></div>
        <div class="chart" id="chSurface"></div>
        <p class="source">Seemodell Simstrat · Eawag / <a href="https://www.alplakes.eawag.ch" target="_blank" rel="noopener">Alplakes</a> · aktualisiert ${esc(new Date(state.lakes.generated).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</p>
      </div>` : isLake && c?.alplakes ? `<div class="card"><h3>Wassertemperatur nach Tiefe</h3><p class="small muted">Die Seemodell-Daten werden mit der nächsten automatischen Aktualisierung geladen.</p></div>` : ""}

      <div class="card">
        <div class="card-head"><h3>Fischarten · ${MONTHS[month]}</h3><button class="link-btn" data-action="goto" data-view="guide">Alle</button></div>
        ${species.length ? `<div class="list" style="border:0;border-radius:0;margin:0 -16px -16px">${species.map(({ f, lvl, spawn }) => `
          <button type="button" class="li" data-action="guide-fish" data-name="${esc(f.name)}">
            ${photoOf(f.name) ? `<img class="thumb sm" src="${photoOf(f.name).file}" alt="" loading="lazy">` : ""}
            <span class="body"><span class="t">${esc(f.name)}</span><span class="s">${esc(f.techniques.slice(0, 2).join(" · "))}</span></span>
            <span class="end">${spawn ? `<span class="pill pill-warn">Laichzeit</span>` : `<span class="pill ${lvl >= 3 ? "pill-good" : lvl === 2 ? "pill-accent" : "pill-neutral"}">${["Kaum", "Mässig", "Gut", "Sehr gut"][lvl]}</span>`}</span>
          </button>`).join("")}</div>`
          : `<p class="small muted">Für dieses Gewässer sind keine Fischarten hinterlegt. Unter „Wissen“ findest du alle Arten.</p>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Beisszeiten heute</h3><button class="link-btn" data-action="goto" data-view="forecast">Prognose</button></div>
        <div class="score-row">
          <div class="score-ring" style="--p:${sol.score};--sc:${scoreColor(sol.score)}"><span>${sol.score}</span></div>
          <div class="score-meta"><div class="t">${scoreLabel(sol.score)}</div>
          <div class="s">${ic("moon", "xs")}${phaseName(sol.ill.phase)} · ${Math.round(sol.ill.fraction * 100)} %</div>
          <div class="s">${ic("sun", "xs")}${hm(sol.sun.sunrise)} – ${hm(sol.sun.sunset)}</div></div>
        </div>
        ${sol.periods.filter((p) => p.kind === "major").map((p) => `<div class="period"><span class="when">${hm(p.from)} – ${hm(p.to)}</span><span class="muted small">Hauptbeisszeit${p.twilight ? " · Dämmerung" : ""}</span></div>`).join("")}
      </div>

      <div class="card" id="hsCard" hidden></div>

      <div class="card">
        <div class="card-head"><h3>Spots</h3><button class="link-btn" data-action="new-spot">+ Spot</button></div>
        ${sp.length ? `<div class="list" style="border:0;border-radius:0;margin:0 -16px -16px">${sp.map((s) => { const n = state.catches.filter((c) => c.spotId === s.id).length; return `
          <button type="button" class="li" data-spot="${s.id}"><span class="thumb sm">${ic("pin", "sm")}</span><span class="body"><span class="t">${esc(s.name)}</span><span class="s">${n} Fänge${s.depth ? ` · ${nf(s.depth)} m` : ""}${s.species ? ` · ${esc(s.species)}` : ""}</span></span><span class="end">${s.rating ? "★".repeat(s.rating) : ""}</span></button>`; }).join("")}</div>`
          : `<p class="small muted">Noch keine Spots. Tippe auf der Karte auf eine Stelle, um sie zu speichern.</p>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Deine Fänge hier</h3>${cs.length ? `<button class="link-btn" data-action="goto" data-view="catches">Alle ${cs.length}</button>` : ""}</div>
        ${cs.length ? `${homeCatchSummary(cs)}<div class="list" style="border:0;border-radius:0;margin:12px -16px -16px">${cs.slice(0, 3).map(catchRow).join("")}</div>`
          : `<p class="small muted">Noch keine Fänge an diesem Gewässer.</p><button class="btn btn-primary" style="margin-top:12px" data-action="new-catch">${ic("plus", "sm")}Fang eintragen</button>`}
      </div>

      <div class="card">
        <h3>Regeln & Patent</h3>
        <p class="small">${w.permit ? `<b>${esc(w.permit)}</b><br>` : ""}${w.cantons ? `Zuständig: Fischereiverwaltung Kanton ${esc(w.cantons)}. ` : ""}Schonzeiten, Schonmasse und Fangzahlen sind kantonal geregelt – vor dem Fischen die aktuellen Vorschriften prüfen.</p>
        ${w.notes ? `<p class="small muted" style="margin-top:8px">${esc(w.notes)}</p>` : ""}
      </div>`;

    if (ld) {
      const maxD = Math.min(c.depth || 60, 50, ld.profile[ld.profile.length - 1][0]);
      requestAnimationFrame(() => {
        profileChart($("#chProfile"), { profile: ld.profile, thermo: th, maxDepth: maxD });
        timeChart($("#chSurface"), { data: ld.surface.map(([t, v]) => [Date.parse(t), v]), unit: "°C", digits: 1, height: 120 });
      });
    }
    fillHomeLive(w);
  }

  const tile = (icon, k, v, d, id) => `<div class="tile ${v == null ? "skeleton" : ""}" id="${id}"><span class="k">${ic(icon, "xs")}${k}</span><span class="v">${v ?? ""}</span><span class="d">${d || "&nbsp;"}</span></div>`;
  function setTile(id, v, d) {
    const el = $("#" + id);
    if (!el) return;
    el.classList.remove("skeleton");
    $(".v", el).innerHTML = v ?? `<span class="faint" style="font-size:1rem">–</span>`;
    $(".d", el).innerHTML = d || "&nbsp;";
  }
  function homeInsight(w, sol, th, surf) {
    const parts = [`Beissindex heute <b>${sol.score}</b> (${scoreLabel(sol.score).toLowerCase()})`];
    if (surf != null) parts.push(`Wasser <b>${nf(surf)} °C</b>`);
    if (th?.stratified) parts.push(`Sprungschicht bei <b>~${nf(th.depth, 0)} m</b>`);
    const next = sol.periods.find((p) => p.kind === "major" && p.to > new Date());
    if (next) parts.push(`nächste Hauptbeisszeit <b>${hm(next.from)}–${hm(next.to)}</b>`);
    return parts.join(" · ");
  }
  function profileText(th) {
    if (!th) return "";
    if (th.stratified) return `Der See ist geschichtet: Oben ist das Wasser ${nf(th.top)} °C warm, unterhalb von ca. ${nf(th.depth, 0)} m wird es deutlich kälter (in 20 m ${nf(th.at20)} °C). Felchen und Egli stehen oft im Bereich der Sprungschicht, Seeforellen und Saiblinge darunter im kühlen Wasser.`;
    return `Der See ist durchmischt: Von der Oberfläche bis in die Tiefe ist das Wasser etwa ${nf(th.top)} °C warm. Die Fische können in allen Tiefen stehen – im Winter oft tiefer und träger.`;
  }
  function homeCatchSummary(cs) {
    const sp = topBy(cs, "species")[0], bait = topBy(cs, "bait")[0], tech = topBy(cs, "technique")[0];
    const hours = Array(12).fill(0);
    cs.forEach((c) => { const h = new Date(c.date).getHours(); if (!isNaN(h)) hours[Math.floor(h / 2)]++; });
    const bh = hours.indexOf(Math.max(...hours));
    return `<div class="row wrap">${sp ? `<span class="tag accent">Häufigste Art: ${esc(sp[0])}</span>` : ""}${bait ? `<span class="tag">Köder: ${esc(bait[0])}</span>` : ""}${tech ? `<span class="tag">Technik: ${esc(tech[0])}</span>` : ""}${cs.length >= 3 ? `<span class="tag">Beste Zeit: ${pad(bh * 2)}–${pad(bh * 2 + 2)} Uhr</span>` : ""}</div>`;
  }

  function fillWxDays(w) {
    const el = $("#wxDays");
    if (!el || el.hidden) return;
    if (!navigator.onLine) { el.innerHTML = `<p class="muted small">Offline – Wetterdaten nicht verfügbar.</p>`; return; }
    forecast({ lat: w.lat, lng: w.lng }).then((fc) => {
      if (activeWater() !== w || !$("#wxDays")) return;
      $("#wxDays").innerHTML = weatherDaysHtml(fc) + `<div class="row" style="justify-content:space-between;margin-top:10px"><span class="source" style="margin:0">${esc(fc.model)}</span><button type="button" class="link-btn" data-action="goto" data-view="forecast">Stündlich</button></div>`;
    }).catch(() => { if ($("#wxDays")) $("#wxDays").innerHTML = `<p class="muted small">Wetter konnte nicht geladen werden.</p>`; });
  }

  async function fillHomeLive(w) {
    renderHotspotCard(w);
    if (hotspotsOn() && navigator.onLine) forecast({ lat: w.lat, lng: w.lng }).then((fc) => {
      state.live.wx[w.id] = fc.current;
      const tr = pressureTrend(fc);
      if (tr) state.live.dp[w.id] = tr.past;
      if (activeWater() === w) renderHotspotCard(w);
    }).catch(() => {});
    $("#btnWxDays")?.addEventListener("click", () => {
      state.wxOpen = !state.wxOpen;
      store.set("wxOpen", state.wxOpen);
      $("#btnWxDays").classList.toggle("open", state.wxOpen);
      $("#wxDays").hidden = !state.wxOpen;
      fillWxDays(w);
    });
    fillWxDays(w);
    const c = catalogOf(w);
    const ld = lakeData(w);
    // Hydrodaten
    hydroFor(w).then((h) => {
      if (activeWater() !== w) return;
      const st = (x) => `${esc(x.station.name)} · ${new Date(x.t).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`;
      if (h?.height) setTile("tLevel", `${nf(h.height.val, 2)}<small>m ü. M.</small>`, `BAFU · ${st(h.height)}`); else setTile("tLevel", null, "Keine Station");
      if ($("#tFlow")) { if (h?.flow) setTile("tFlow", `${nf(h.flow.val, 0)}<small>m³/s</small>`, `BAFU · ${st(h.flow)}`); else setTile("tFlow", null, "Keine Station"); }
      if (h?.temperature) { state.live.temp[w.id] = h.temperature.val; if (!ld) renderHotspotCard(w); }
      if (!ld) { if (h?.temperature) setTile("tWater", `${nf(h.temperature.val)}<small>°C</small>`, `BAFU · ${st(h.temperature)}`); else setTile("tWater", null, "Keine Messung"); }
    }).catch(() => { setTile("tLevel", null, "Nicht erreichbar"); if (!ld) setTile("tWater", null, "Nicht erreichbar"); if ($("#tFlow")) setTile("tFlow", null, "Nicht erreichbar"); });
    if (!ld && !hydroStations(w).length) setTile("tWater", null, "Keine Messung");
    // MeteoSwiss Messwerte
    nearestMeteo({ lat: w.lat, lng: w.lng }, c?.alt).then((m) => {
      if (activeWater() !== w || !m) return;
      const src = `MeteoSwiss · ${esc(m.station.name)}`;
      setTile("tAir", `${nf(m.temp)}<small>°C</small>`, src);
      setTile("tWind", `${nf(m.wind, 0)}<small>km/h ${dirName(m.dir)}</small>`, m.gust != null ? `Böen ${nf(m.gust, 0)} km/h · ${esc(m.station.id)}` : src);
      setTile("tPress", m.qff != null ? `${nf(m.qff, 0)}<small>hPa</small>` : null, "Meeresniveau (QFF)");
      forecast({ lat: w.lat, lng: w.lng }).then((fc) => {
        const tr = pressureTrend(fc);
        if (tr) { state.live.dp[w.id] = tr.past; renderHotspotCard(w); }
        if (tr && m.qff != null && activeWater() === w) setTile("tPress", `${nf(m.qff, 0)}<small>hPa</small>`, tr.past <= -1 ? "↘ fallend (3 h)" : tr.past >= 1 ? "↗ steigend (3 h)" : "→ stabil (3 h)");
      }).catch(() => {});
    }).catch(() => ["tAir", "tWind", "tPress"].forEach((id) => setTile(id, null, navigator.onLine ? "Nicht erreichbar" : "Offline")));
  }

  function renderHomeEmpty(el) {
    const ref = state.pos || { lat: 47.05, lng: 8.3 };
    const near = CATALOG.map((c) => ({ c, d: km(ref, c) })).sort((a, b) => a.d - b.d).slice(0, 6);
    el.innerHTML = `
      <div class="card hero">
        <span class="badge-ic" style="margin-bottom:12px">${ic("water")}</span>
        <h1>Wähle dein Gewässer</h1>
        <p class="sub">Die App zeigt dir dann Wassertemperatur, Sprungschicht, Pegel, MeteoSwiss-Wetter, Beisszeiten, passende Fischarten und deine Fänge – alles für genau dieses Gewässer.</p>
        <button class="btn btn-primary" style="margin-top:16px" data-action="pick-water">${ic("search", "sm")}Gewässer suchen</button>
      </div>
      <h3 class="section-label">${state.pos ? "In deiner Nähe" : "Beliebte Gewässer"}</h3>
      <div class="list">${near.map(({ c, d }) => `<button type="button" class="li" data-cat="${c.key}"><span class="thumb sm">${ic("water", "sm")}</span><span class="body"><span class="t">${esc(c.name)}</span><span class="s">${KIND[c.kind]} · ${esc(c.cantons)}</span></span><span class="end">${state.pos ? nf(d, 0) + " km" : ""}</span></button>`).join("")}</div>
      ${state.catches.length ? `<h3 class="section-label">Alle Fänge</h3><div class="list">${[...state.catches].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map(catchRow).join("")}</div>` : ""}`;
    $$("[data-cat]", el).forEach((b) => b.addEventListener("click", () => addCatalogWater(CATALOG.find((c) => c.key === b.dataset.cat))));
  }

  // ───────────────────────── Prognose ─────────────────────────
  function forecastPlace() {
    const w = activeWater();
    if (state.place.startsWith("spot:")) { const s = state.spots.find((x) => x.id === state.place.slice(5)); if (s) return { lat: s.lat, lng: s.lng, label: s.name, alt: catalogOf(w)?.alt }; }
    if (state.place === "me" && state.pos) return { ...state.pos, label: "Mein Standort" };
    if (w) return { lat: w.lat, lng: w.lng, label: w.name, alt: catalogOf(w)?.alt };
    if (state.pos) return { ...state.pos, label: "Mein Standort" };
    const m = map.getCenter();
    return { lat: m.lat, lng: m.lng, label: "Kartenmitte" };
  }

  function renderForecast() {
    const w = activeWater();
    const place = forecastPlace();
    const d = state.day;
    const sol = solunar(d, place.lat, place.lng);
    const spots = w ? state.spots.filter((s) => s.waterId === w.id) : [];
    const isToday = toDateKey(d) === toDateKey(new Date());
    const t0 = +sol.day, span = 864e5, pct = (t) => Math.max(0, Math.min(100, ((t - t0) / span) * 100));
    let tl = "";
    if (sol.sun.sunrise && !isNaN(sol.sun.sunrise)) tl += `<div class="night" style="left:0;width:${pct(+sol.sun.sunrise)}%"></div>`;
    if (sol.sun.sunset && !isNaN(sol.sun.sunset)) tl += `<div class="night" style="left:${pct(+sol.sun.sunset)}%;right:0"></div>`;
    sol.periods.forEach((p) => { const l = pct(+p.from), r = pct(+p.to); if (r > l) tl += `<div class="seg ${p.kind}" style="left:${l}%;width:${r - l}%"></div>`; });
    if (isToday) tl += `<div class="now" style="left:${pct(Date.now())}%"></div>`;

    $("#forecast").innerHTML = `
      <div class="page-head"><div><h1>Prognose</h1><p class="muted small" style="margin-top:2px">${esc(place.label)}</p></div></div>
      <div class="chips" style="margin-bottom:14px" id="placeChips">
        ${w ? `<button class="chip ${state.place === "water" ? "on" : ""}" data-place="water">${ic("water", "xs")}${esc(w.name)}</button>` : ""}
        ${spots.map((s) => `<button class="chip ${state.place === "spot:" + s.id ? "on" : ""}" data-place="spot:${s.id}">${ic("pin", "xs")}${esc(s.name)}</button>`).join("")}
        <button class="chip ${state.place === "me" || (!w && state.place !== "map") ? "on" : ""}" data-place="me">${ic("locate", "xs")}Mein Standort</button>
      </div>

      <div class="card">
        <div class="card-head"><h3>Beisszeiten · ${esc(d.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" }))}</h3></div>
        <div class="score-row">
          <div class="score-ring" style="--p:${sol.score};--sc:${scoreColor(sol.score)}"><span>${sol.score}</span></div>
          <div class="score-meta"><div class="t">${scoreLabel(sol.score)}</div>
            <div class="s">${ic("moon", "xs")}${phaseName(sol.ill.phase)} · ${Math.round(sol.ill.fraction * 100)} %</div>
            <div class="s">${ic("sun", "xs")}${hm(sol.sun.sunrise)} – ${hm(sol.sun.sunset)}</div></div>
        </div>
        <div class="timeline">${tl}</div>
        <div class="tl-scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24 Uhr</span></div>
        <div class="legend"><span><i style="background:var(--good)"></i>Hauptbeisszeit</span><span><i style="background:var(--warn)"></i>Nebenbeisszeit</span><span><i style="background:color-mix(in srgb,var(--ink) 15%,transparent)"></i>Nacht</span></div>
        <div class="chart-title" style="margin-top:18px"><b>Beissindex im Tagesverlauf</b><span id="biteSrc">Mond & Dämmerung</span></div>
        <div class="chart" id="chBite" data-score-bars="1"></div>
        <div id="bestWin"></div>
        <h3 style="margin-top:18px">Beisszeiten im Detail</h3>
        <div id="periodsDetail">${periodsHtml(sol, null, w)}</div>
        <details class="explain"><summary>${ic("info", "xs")}Wie wird das berechnet?</summary>
          <p>Nach der <b>Solunar-Theorie</b> sind Fische aktiver, wenn der Mond im Zenit oder Nadir steht (Hauptbeisszeiten, ±1 h) und bei Mondauf- und -untergang (Nebenbeisszeiten, ±30 min). Bei Neu- und Vollmond ist der Effekt am stärksten. Fallen diese Zeiten in die <b>Morgen- oder Abenddämmerung</b>, steigt die Aktivität zusätzlich.</p>
          <p>Der stündliche Index berücksichtigt ausserdem das <b>Wetter</b>: Fallender Luftdruck und leichter Regen erhöhen ihn, starke Böen, Gewitter und stark steigender Druck senken ihn. Die Werte sind ein Anhaltspunkt, kein Versprechen.</p>
        </details>
      </div>

      <div class="card"><div class="card-head"><h3>7 Tage</h3><span class="xsmall faint" id="fcModel"></span></div><div class="days" id="days"></div>
        <button type="button" class="btn btn-block" id="btnWxDetail" style="margin-top:12px">${ic("cloud-sun", "sm")}${state.wxDetail ? "Wetterdetails ausblenden" : "Wetterdetails für alle Tage"}</button>
        <div id="wxDetail" ${state.wxDetail ? "" : "hidden"} style="margin-top:8px"></div></div>

      <div class="card">
        <div class="card-head"><h3>Gemessen · MeteoSwiss</h3><span class="xsmall faint" id="mStation"></span></div>
        <div class="tiles" style="margin:0" id="mTiles">${tile("thermo", "Luft", null, "", "mAir")}${tile("wind", "Wind", null, "", "mWind")}${tile("gauge", "Luftdruck", null, "", "mPress")}${tile("rain", "Niederschlag", null, "", "mRain")}</div>
      </div>

      <div class="card" id="fcCharts">
        <h3>${isToday ? "Nächste 48 Stunden" : "Verlauf · " + esc(d.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" }))}</h3>
        <div class="chart-title"><b>Temperatur</b><span>°C</span></div><div class="chart" id="chTemp"></div>
        <div class="chart-title"><b>Niederschlag</b><span>mm pro Stunde</span></div><div class="chart" id="chRain"></div>
        <div class="chart-title"><b>Wind</b><span>km/h, Mittelwind</span></div><div class="chart" id="chWind"></div>
        <div class="chart-title"><b>Luftdruck</b><span>hPa am Boden</span></div><div class="chart" id="chPress"></div>
        <p class="source" id="fcSource"></p>
        <div id="waterCharts"></div>
      </div>

      <div class="card" id="fcTips" hidden><h3>Einschätzung</h3><div id="tipsBody"></div></div>`;

    $("#btnWxDetail").addEventListener("click", () => {
      state.wxDetail = !state.wxDetail;
      store.set("wxDetail", state.wxDetail);
      $("#wxDetail").hidden = !state.wxDetail;
      $("#btnWxDetail").innerHTML = `${ic("cloud-sun", "sm")}${state.wxDetail ? "Wetterdetails ausblenden" : "Wetterdetails für alle Tage"}`;
    });
    $("#placeChips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; state.place = b.dataset.place; if (state.place === "me" && !state.pos) locate(false).then(renderForecast); else renderForecast(); });

    // 7 Tage: Solunar sofort, Wetter danach
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const daysEl = $("#days");
    const renderDays = (fc) => {
      daysEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(+today + i * 864e5), sc = solunar(dd, place.lat, place.lng);
        const k = toDateKey(dd), j = fc ? fc.daily.time.indexOf(k) : -1;
        const has = j >= 0 && fc.daily.temperature_2m_max[j] != null;
        const [wi, wt] = has ? WMO(fc.daily.weather_code[j]) : ["moon", ""];
        return `<div class="day-row ${k === toDateKey(d) ? "sel" : ""}" data-date="${k}">
          <div><div class="dname">${i === 0 ? "Heute" : dd.toLocaleDateString("de-CH", { weekday: "short" })}</div><div class="day-sub">${dd.getDate()}. ${MONTHS[dd.getMonth()]}</div></div>
          <span title="${esc(wt)}">${ic(wi)}</span>
          <div><div class="bar"><i style="width:${sc.score}%;background:${scoreColor(sc.score)}"></i></div><div class="day-sub">Beissindex ${sc.score}${has && fc.daily.precipitation_sum[j] >= 0.5 ? ` · ${nf(fc.daily.precipitation_sum[j], 1)} mm` : ""}${has && fc.daily.wind_gusts_10m_max[j] >= 40 ? ` · Böen ${nf(fc.daily.wind_gusts_10m_max[j], 0)}` : ""}</div></div>
          <div class="temps">${has ? `<b>${nf(fc.daily.temperature_2m_max[j], 0)}°</b> ${nf(fc.daily.temperature_2m_min[j], 0)}°` : ""}</div></div>`;
      }).join("");
    };
    renderDays(null);
    const drawBite = (fc) => {
      requestAnimationFrame(() => timeChart($("#chBite"), { data: biteSeries(sol, fc), unit: "", type: "bar", height: 100, maxY: 100 }));
      const best = bestWindow(sol, fc);
      $("#bestWin").innerHTML = best?.none ? `<div class="insight">${ic("moon", "sm")}<div>Für den Rest des Tages ist keine starke Beissphase mehr zu erwarten. Tippe unten auf einen anderen Tag.</div></div>` : best ? `<div class="insight">${ic("target", "sm")}<div>Beste Zeit ${isToday ? "heute" : "an diesem Tag"}: <b>${hm(best.from)} – ${hm(best.to)}</b> (Index ${best.v})${best.note ? ` · ${best.note}` : ""}</div></div>` : "";
    };
    drawBite(null);
    renderWaterCharts(w, place, sol, isToday);
    daysEl.addEventListener("click", (e) => { const r = e.target.closest(".day-row"); if (r) { state.day = new Date(r.dataset.date + "T12:00"); renderForecast(); } });

    if (!navigator.onLine) { $("#fcCharts").innerHTML = `<h3>Nächste 48 Stunden</h3><p class="muted small">Offline – Wetterdaten nicht verfügbar.</p>`; ["mAir", "mWind", "mPress", "mRain"].forEach((id) => setTile(id, null, "Offline")); return; }

    forecast(place).then((fc) => {
      if (currentView !== "forecast") return;
      renderDays(fc);
      $("#fcModel").textContent = fc.model;
      const wd = $("#wxDetail");
      if (wd) wd.innerHTML = weatherDaysHtml(fc, toDateKey(d));
      const h = fc.hourly, now = Date.now();
      const from = isToday ? now - 3 * 3600e3 : +sol.day, to = isToday ? now + 48 * 3600e3 : +sol.day + 24 * 3600e3;
      const idx = h.time.map((t, i) => [Date.parse(t), i]).filter(([t]) => t >= from && t <= to);
      const ser = (k) => idx.map(([t, i]) => [t, h[k][i]]);
      timeChart($("#chTemp"), { data: ser("temperature_2m"), unit: "°C", digits: 1 });
      timeChart($("#chRain"), { data: ser("precipitation"), unit: "mm", digits: 1, type: "bar", height: 90 });
      timeChart($("#chWind"), { data: ser("wind_speed_10m"), unit: "km/h", zeroBase: true, height: 110 });
      timeChart($("#chPress"), { data: ser("surface_pressure"), unit: "hPa", height: 110 });
      drawBite(fc);
      $("#biteSrc").textContent = "Mond, Dämmerung & Wetter";
      $("#periodsDetail").innerHTML = periodsHtml(sol, fc, w);
      $("#fcSource").innerHTML = `Prognose: ${esc(fc.model)} via <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Messwerte: MeteoSchweiz`;
      const tips = weatherTips(fc, activeWater());
      if (tips.length) { $("#fcTips").hidden = false; $("#tipsBody").innerHTML = tips.map((t) => `<div class="period" style="justify-content:flex-start"><span>${t}</span></div>`).join(""); }
    }).catch(() => { $("#fcCharts").innerHTML = `<h3>Nächste 48 Stunden</h3><p class="muted small">Prognose konnte nicht geladen werden.</p>`; });

    nearestMeteo(place, place.alt).then((m) => {
      if (!m || currentView !== "forecast") return;
      $("#mStation").textContent = `${m.station.name} · ${nf(m.station.dist, 0)} km · ${m.t ? new Date(m.t).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : ""}`;
      setTile("mAir", `${nf(m.temp)}<small>°C</small>`, m.hum != null ? `Feuchte ${nf(m.hum, 0)} %` : "");
      setTile("mWind", `${nf(m.wind, 0)}<small>km/h ${dirName(m.dir)}</small>`, m.gust != null ? `Böen ${nf(m.gust, 0)} km/h` : "");
      setTile("mPress", m.qff != null ? `${nf(m.qff, 0)}<small>hPa</small>` : null, "Meeresniveau (QFF)");
      setTile("mRain", m.rain != null ? `${nf(m.rain, 1)}<small>mm</small>` : null, m.rain != null ? "letzte 10 Minuten" : "keine Messung an dieser Station");
    }).catch(() => ["mAir", "mWind", "mPress", "mRain"].forEach((id) => setTile(id, null, "Nicht erreichbar")));
  }

  // ── Beissindex pro Stunde ──
  function hourAt(fc, t) {
    if (!fc) return -1;
    const h = fc.hourly.time, k = toLocalInput(new Date(t)).slice(0, 13);
    return h.findIndex((x) => x.slice(0, 13) === k);
  }
  function biteAt(t, sol, fc) {
    const dist = Math.min(sol.ill.phase, Math.abs(sol.ill.phase - 0.5), 1 - sol.ill.phase);
    const phase = 1 - dist / 0.25; // 1 = Neu-/Vollmond
    let v = 18;
    sol.periods.forEach((p) => {
      const dm = (t - p.t) / 60e3;
      v += p.kind === "major" ? 46 * Math.exp(-((dm / 70) ** 2)) : 28 * Math.exp(-((dm / 40) ** 2));
    });
    [sol.sun.sunrise, sol.sun.sunset].forEach((s) => { if (s && !isNaN(s)) v += 22 * Math.exp(-((((t - s) / 60e3) / 55) ** 2)); });
    v *= 0.72 + 0.28 * phase;
    const i = hourAt(fc, t);
    if (i >= 0) {
      const H = fc.hourly, p = H.surface_pressure;
      const dp = i >= 3 && p[i] != null && p[i - 3] != null ? p[i] - p[i - 3] : 0;
      if (dp <= -1) v += 10; else if (dp >= 1.5) v -= 8;
      const g = H.wind_gusts_10m?.[i] ?? 0, r = H.precipitation?.[i] ?? 0, c = H.weather_code?.[i] ?? 0;
      if (g >= 55) v -= 25; else if (g >= 40) v -= 10;
      if (c >= 95) v -= 40;
      else if (r > 0.1 && r <= 2) v += 5; else if (r > 4) v -= 6;
    }
    return Math.max(2, Math.min(100, Math.round(v)));
  }
  const biteSeries = (sol, fc) => Array.from({ length: 48 }, (_, k) => { const t = +sol.day + (k + 0.5) * 1800e3; return [t, biteAt(t, sol, fc)]; });
  function bestWindow(sol, fc) {
    const all = biteSeries(sol, fc), now = Date.now();
    const s = toDateKey(sol.day) === toDateKey(new Date()) ? all.filter(([t]) => t > now - 900e3) : all;
    if (!s.length) return null;
    const top = s.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (top[1] < 35) return { none: true };
    let a = s.indexOf(top), b = a;
    while (a > 0 && s[a - 1][1] >= top[1] - 8) a--;
    while (b < s.length - 1 && s[b + 1][1] >= top[1] - 8) b++;
    const twilight = [sol.sun.sunrise, sol.sun.sunset].some((x) => x && Math.abs(top[0] - x) < 90 * 60e3);
    return { from: new Date(s[a][0] - 900e3), to: new Date(s[b][0] + 900e3), v: top[1], note: twilight ? "fällt in die Dämmerung" : "" };
  }
  // Passende Fischarten je Tageszeit (nur Arten des Gewässers, in Saison, nicht in Laichzeit)
  const DAYPART_FISH = {
    twilight: ["Hecht", "Zander", "Egli", "Seeforelle", "Bachforelle", "Alet", "Barbe", "Schleie"],
    night: ["Zander", "Wels", "Trüsche", "Karpfen", "Barbe", "Brachsmen & Rotauge"],
    day: ["Egli", "Felchen", "Seesaibling", "Hecht", "Alet", "Äsche", "Brachsmen & Rotauge"],
  };
  function dayPart(t, sol) {
    const r = sol.sun.sunrise, s = sol.sun.sunset;
    if ((r && Math.abs(t - r) < 90 * 60e3) || (s && Math.abs(t - s) < 90 * 60e3)) return "twilight";
    if (r && s && (t < r || t > s)) return "night";
    return "day";
  }
  function fishFor(t, sol, w) {
    const m = new Date(t).getMonth(), inWater = speciesOfWater(w);
    return DAYPART_FISH[dayPart(t, sol)].filter((n) => {
      const f = window.FISH_GUIDE.find((x) => x.name === n);
      return f && f.months[m] >= 2 && !f.spawn.includes(m) && (!inWater.length || inWater.includes(n));
    }).slice(0, 3);
  }
  function periodsHtml(sol, fc, w) {
    if (!sol.periods.length) return `<p class="faint small">Keine Perioden an diesem Tag.</p>`;
    const partName = { twilight: "Dämmerung", night: "Nacht", day: "Tag" };
    return sol.periods.map((p) => {
      const v = biteAt(+p.t, sol, fc), i = hourAt(fc, +p.t), H = fc?.hourly;
      const [wi, wt] = i >= 0 ? WMO(H.weather_code[i]) : [null, ""];
      const fish = fishFor(+p.t, sol, w);
      const wx = i >= 0 ? `<span class="row small muted" style="gap:4px;flex-wrap:wrap">${ic(wi, "xs")}${esc(wt)} · ${nf(H.temperature_2m[i], 0)} °C · ${ic("wind", "xs")}${nf(H.wind_speed_10m[i], 0)} km/h${H.wind_gusts_10m[i] >= 35 ? ` (Böen ${nf(H.wind_gusts_10m[i], 0)})` : ""}${H.precipitation_probability?.[i] != null ? ` · ${ic("rain", "xs")}${nf(H.precipitation_probability[i], 0)} %` : ""}</span>` : "";
      return `<div class="pdetail">
        <div class="row" style="justify-content:space-between"><span class="when">${hm(p.from)} – ${hm(p.to)}</span>
          <span class="row" style="gap:6px"><span class="pill ${p.kind === "major" ? "pill-good" : "pill-warn"}">${p.kind === "major" ? "Hauptbeisszeit" : "Nebenbeisszeit"}</span><span class="pidx" style="background:${v >= 60 ? "var(--good)" : v >= 40 ? "var(--warn)" : "var(--surface-2)"};color:${v >= 40 ? "#fff" : "var(--ink-2)"}">${v}</span></span></div>
        <div class="small muted">${p.label} um ${hm(p.t)} · ${partName[dayPart(+p.t, sol)]}${p.twilight ? " – fällt in die Dämmerung, besonders gut" : ""}</div>
        ${wx}
        ${fish.length ? `<div class="small" style="margin-top:4px">Gute Chancen auf: ${fish.map((n) => `<span class="tag accent">${esc(n)}</span>`).join("")}</div>` : ""}
      </div>`;
    }).join("");
  }

  // ── Wasser im Prognose-Zeitraum: Temperatur, Sprungschicht, Pegel ──
  async function hydroRange(id, par, days = 3) {
    return cached(`hr:${id}:${par}`, 15 * 60e3, async () => {
      const start = toDateKey(new Date(Date.now() - days * 864e5)), end = toDateKey(new Date(Date.now() + 864e5));
      const d = await fetchJSON(`https://api.existenz.ch/apiv1/hydro/daterange?locations=${id}&parameters=${par}&startdate=${start}&enddate=${end}&app=fishtracker`);
      return d.payload.filter((x) => x.par === par && x.val != null).map((x) => [x.timestamp * 1000, x.val]);
    });
  }
  function renderWaterCharts(w, place, sol, isToday) {
    const el = $("#waterCharts");
    if (!el || !w) return;
    const ld = lakeData(w);
    const from = isToday ? Date.now() - 3 * 3600e3 : +sol.day, to = isToday ? Date.now() + 48 * 3600e3 : +sol.day + 864e5;
    const win = (arr) => { const pts = arr.map(([t, v]) => [typeof t === "string" ? Date.parse(t) : t, v]); const inside = pts.filter(([t]) => t >= from - 3 * 3600e3 && t <= to + 3 * 3600e3); return inside; };
    let html = `<h3 style="margin-top:22px">Wasser · ${esc(w.name)}</h3>`;
    const parts = [];
    if (ld) {
      const sf = win(ld.surface);
      if (sf.length >= 2) { html += `<div class="chart-title"><b>Wassertemperatur</b><span>°C an der Oberfläche</span></div><div class="chart" id="chWaterT"></div>`; parts.push(["chWaterT", sf, { unit: "°C", digits: 1, height: 110 }]); }
      const th = win(ld.thermo || []).filter(([, v]) => v != null);
      if (th.length >= 2) { html += `<div class="chart-title"><b>Sprungschicht</b><span>Tiefe in m (unten = tiefer)</span></div><div class="chart" id="chThermo"></div>`; parts.push(["chThermo", th, { unit: "m", digits: 1, height: 110, invert: true, zeroBase: true }]); }
      else if (ld.thermo?.length) html += `<p class="small muted" style="margin:8px 0">Im Prognosezeitraum ist keine ausgeprägte Sprungschicht berechnet – der See ist weitgehend durchmischt.</p>`;
      if (!sf.length) html += `<p class="small muted">Für diesen Tag liegen keine Seemodell-Daten vor (Prognose reicht ca. 4 Tage).</p>`;
    }
    html += `<div id="levelBox"></div><p class="source">${ld ? "Wasser: Seemodell Eawag / Alplakes · " : ""}Pegel & Flusstemperatur: BAFU (gemessen)</p>`;
    el.innerHTML = html;
    requestAnimationFrame(() => parts.forEach(([id, data, o]) => timeChart($("#" + id), { data, ...o })));
    const st = hydroStations(w, place);
    const lv = st.find((s) => s.pars.includes("height") && s.dist < 60);
    const tp = !ld && st.find((s) => s.pars.includes("temperature") && s.dist < 60);
    if (!lv && !tp) return;
    Promise.all([lv ? hydroRange(lv.id, "height") : null, tp ? hydroRange(tp.id, "temperature") : null]).then(([lvData, tpData]) => {
      const box = $("#levelBox");
      if (!box) return;
      const last48 = (a) => a.filter(([t], i) => t >= Date.now() - 48 * 3600e3 && i % 3 === 0);
      let h = "";
      if (tpData?.length) h += `<div class="chart-title"><b>Wassertemperatur</b><span>°C · ${esc(tp.name)}, letzte 48 h</span></div><div class="chart" id="chRiverT"></div>`;
      if (lvData?.length) {
        const a = last48(lvData), d = a.length > 1 ? a[a.length - 1][1] - a[0][1] : 0;
        h += `<div class="chart-title"><b>Pegel</b><span>m ü. M. · ${esc(lv.name)}, letzte 48 h</span></div><div class="chart" id="chLevel"></div>
          <p class="small muted" style="margin-top:6px">Aktuell ${nf(a[a.length - 1]?.[1], 2)} m ü. M. · ${Math.abs(d) < 0.02 ? "stabil" : d > 0 ? `steigend (+${nf(d * 100, 0)} cm in 48 h)` : `fallend (${nf(d * 100, 0)} cm in 48 h)`}${d > 0.05 ? " – steigendes, trübes Wasser bringt oft Zander, Barbe und Alet in Fahrt." : ""}</p>`;
      }
      box.innerHTML = h;
      requestAnimationFrame(() => {
        if (tpData?.length) timeChart($("#chRiverT"), { data: last48(tpData), unit: "°C", digits: 1, height: 110 });
        if (lvData?.length) timeChart($("#chLevel"), { data: last48(lvData), unit: "m", digits: 2, height: 110, minSpan: 0.1 });
      });
    }).catch(() => { const box = $("#levelBox"); if (box) box.innerHTML = `<p class="small muted">Pegeldaten konnten nicht geladen werden.</p>`; });
  }

  // Tageswetter-Liste (Heute + folgende Tage)
  function weatherDaysHtml(fc, selKey) {
    const D = fc.daily, today = toDateKey(new Date());
    return D.time.map((k, j) => {
      if (k < today || D.temperature_2m_max[j] == null) return "";
      const dd = new Date(k + "T12:00");
      const [wi, wt] = WMO(D.weather_code[j]);
      const rain = D.precipitation_sum[j], prob = D.precipitation_probability_max?.[j];
      const sun = D.sunshine_duration?.[j];
      return `<div class="wx-row" ${k === selKey ? 'style="background:var(--accent-soft);margin:0 -10px;padding-left:10px;padding-right:10px;border-radius:10px"' : ""}>
        <div><div class="dname">${k === today ? "Heute" : dd.toLocaleDateString("de-CH", { weekday: "short" })}</div><div class="day-sub">${dd.getDate()}. ${MONTHS[dd.getMonth()]}</div></div>
        ${ic(wi)}
        <div class="desc"><b>${esc(wt)}</b>
          <div class="day-sub">${ic("rain", "xs")} ${nf(rain, 1)} mm${prob != null ? ` · ${nf(prob, 0)} %` : ""}${sun != null ? ` · ${ic("sun", "xs")} ${nf(sun / 3600, 1)} h` : ""}</div>
          <div class="day-sub">${ic("wind", "xs")} ${nf(D.wind_speed_10m_max?.[j], 0)} km/h ${dirName(D.wind_direction_10m_dominant?.[j])} · Böen ${nf(D.wind_gusts_10m_max[j], 0)}</div></div>
        <div class="temps"><b>${nf(D.temperature_2m_max[j], 0)}°</b> ${nf(D.temperature_2m_min[j], 0)}°</div></div>`;
    }).join("");
  }

  function weatherTips(fc, w) {
    const c = fc.current, tr = pressureTrend(fc), tips = [];
    if (tr && tr.past <= -1) tips.push("<b>Luftdruck fällt</b>: Vor Wetterumschwüngen beissen besonders Raubfische (Hecht, Egli, Zander) oft sehr gut.");
    if (tr && tr.past >= 1.5) tips.push("<b>Luftdruck steigt stark</b>: Die Fische sind oft vorsichtig – fein fischen und tiefer suchen.");
    if (c.cloud_cover >= 70 && c.temperature_2m > 4) tips.push("<b>Bewölkt</b>: Raubfische jagen häufig auch tagsüber im Flachwasser.");
    if (c.cloud_cover < 25 && c.temperature_2m > 22) tips.push("<b>Sonnig und warm</b>: Früh morgens oder abends fischen, tagsüber Schatten und Tiefe suchen.");
    if (c.wind_speed_10m >= 10 && c.wind_speed_10m <= 30) tips.push(`<b>Wind aus ${dirName(c.wind_direction_10m)}</b>: Am windzugewandten Ufer sammelt sich Nahrung – oft auch die Fische.`);
    if (c.wind_gusts_10m >= 50) tips.push(`<b>Sturmböen bis ${nf(c.wind_gusts_10m, 0)} km/h</b>: Auf dem See auf die Sturmwarnleuchten achten (blinkend = Sturmwarnung). Mit dem Boot nicht hinausfahren!`);
    else if (c.wind_gusts_10m >= 30 && w?.kind === "lake") tips.push(`<b>Böen bis ${nf(c.wind_gusts_10m, 0)} km/h</b>: Auf grösseren Seen auf Vorsichts- und Sturmwarnung achten.`);
    if (c.weather_code >= 95) tips.push("<b>Gewitter</b>: Kohlefaserruten leiten Strom – sofort das Wasser verlassen!");
    if (c.temperature_2m < 4) tips.push("<b>Kalt</b>: Langsam und tief fischen, kleine Köder – Trüsche und Felchen sind jetzt typische Zielfische.");
    return tips;
  }

  // ───────────────────────── Wissen ─────────────────────────
  const photoOf = (name) => window.FISH_PHOTOS?.[name] || null;
  const fishThumb = (name) => { const p = photoOf(name); return p ? `<img class="fish-thumb" src="${p.file}" alt="${esc(name)}" loading="lazy">` : `<span class="badge-ic">${ic("fish")}</span>`; };
  const fishPhoto = (name) => { const p = photoOf(name); return p ? `<figure class="fish-photo"><img src="${p.file}" alt="${esc(name)}" loading="lazy"><figcaption>Foto: ${esc(p.credit)} · <a href="${p.source}" target="_blank" rel="noopener">${esc(p.license)}</a> · iNaturalist</figcaption></figure>` : ""; };

  function renderGuide() {
    $$("#guideSeg button").forEach((b) => b.classList.toggle("on", b.dataset.seg === state.guideSeg));
    $("#guideSearchWrap").hidden = state.guideSeg === "rules";
    const q = norm($("#guideSearch").value);
    const w = activeWater();
    const month = new Date().getMonth();
    let html = "";
    if (state.guideSeg === "fish") {
      const inWaterNames = speciesOfWater(w);
      const match = (f) => !q || norm([f.name, ...f.alias, f.type, f.techniques.join(" ")].join(" ")).includes(q);
      const card = (f) => {
        const mine = state.catches.filter((c) => c.species && (norm(c.species) === norm(f.name) || f.alias.some((a) => norm(a) === norm(c.species))));
        const myBait = topBy(mine, "bait")[0], myTech = topBy(mine, "technique")[0];
        const big = mine.reduce((m, c) => (c.length > (m?.length || 0) ? c : m), null);
        const temps = mine.filter((c) => c.waterTemp != null).map((c) => c.waterTemp);
        return `<details class="acc" ${q && norm(f.name).includes(q) ? "open" : ""}>
          <summary>${fishThumb(f.name)}<span><span class="t">${esc(f.name)}</span><br><span class="s">${esc(f.type)}${f.alias.length ? " · " + esc(f.alias.slice(0, 2).join(", ")) : ""}${mine.length ? ` · ${mine.length} eigene Fänge` : ""}</span></span>${ic("chev", "sm")}</summary>
          <div class="acc-body">
            ${fishPhoto(f.name)}
            <div class="months">${MONTHS.map((m, i) => `<span class="l${f.months[i]}${f.spawn.includes(i) ? " spawn" : ""}${i === month ? " cur" : ""}">${m}</span>`).join("")}</div>
            <div class="legend" style="margin:-6px 0 12px"><span><i style="background:var(--good)"></i>gute Fangzeit</span><span><i style="background:var(--bad);height:3px;vertical-align:2px"></i>Laichzeit (meist Schonzeit)</span></div>
            <dl>
              <dt>Tageszeit</dt><dd>${esc(f.daytime)}</dd>
              <dt>Wo suchen</dt><dd>${esc(f.spots)}</dd>
              <dt>Temperatur</dt><dd>${esc(f.temp)}</dd>
              <dt>Techniken</dt><dd>${f.techniques.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</dd>
              <dt>Köder</dt><dd>${esc(f.baits)}</dd>
              <dt>Tipp</dt><dd>${esc(f.tips)}</dd>
              ${mine.length ? `<dt>Deine Daten</dt><dd>${[big?.length ? `Grösster ${nf(big.length)} cm` : "", myTech ? `Technik: ${esc(myTech[0])}` : "", myBait ? `Köder: ${esc(myBait[0])}` : "", temps.length ? `Wasser Ø ${nf(temps.reduce((a, b) => a + b, 0) / temps.length)} °C` : ""].filter(Boolean).join(" · ")}</dd>` : ""}
            </dl>
          </div></details>`;
      };
      const inW = window.FISH_GUIDE.filter((f) => inWaterNames.includes(f.name) && match(f));
      const rest = window.FISH_GUIDE.filter((f) => !inWaterNames.includes(f.name) && match(f));
      if (inW.length) html += `<h3 class="section-label">Vorkommen · ${esc(w.name)}</h3>` + inW.map(card).join("");
      if (rest.length) html += `<h3 class="section-label">${inW.length ? "Weitere Arten" : "Fischarten"}</h3>` + rest.map(card).join("");
      if (!inW.length && !rest.length) html = `<div class="empty">${ic("search")}<p>Nichts gefunden.</p></div>`;
    } else if (state.guideSeg === "tech") {
      const list = window.TECHNIQUES.filter((t) => !q || norm(JSON.stringify(t)).includes(q));
      html = list.map((t) => `<details class="acc"><summary><span class="badge-ic">${ic("target")}</span><span><span class="t">${esc(t.name)}</span><br><span class="s">${esc(t.desc)}</span></span>${ic("chev", "sm")}</summary>
        <div class="acc-body"><dl><dt>Ausrüstung</dt><dd>${esc(t.gear)}</dd><dt>So geht's</dt><dd>${esc(t.how)}</dd></dl></div></details>`).join("") || `<div class="empty">${ic("search")}<p>Nichts gefunden.</p></div>`;
    } else {
      html = `<div class="card"><h3>Fischen in der Schweiz</h3><ul class="rules small" style="padding-left:18px;margin:0">${window.RULES_CH.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
        ${w ? `<div class="card"><h3>${esc(w.name)}</h3><p class="small">${w.cantons ? `Zuständig: Kanton ${esc(w.cantons)}. ` : ""}${w.permit ? `Dein Patent: <b>${esc(w.permit)}</b>. ` : ""}Die aktuellen Schonzeiten und Schonmasse findest du im Patent-Merkblatt bzw. auf der Website der kantonalen Fischereiverwaltung.</p>${w.notes ? `<p class="small muted" style="margin-top:8px">${esc(w.notes)}</p>` : ""}<button class="btn btn-sm" style="margin-top:12px" data-action="edit-water">Eigene Notizen zu Regeln ergänzen</button></div>` : ""}
        <p class="source">Die Angaben in dieser App sind allgemeine Hinweise und ersetzen nicht die offiziellen Vorschriften.</p>`;
    }
    $("#guide").innerHTML = html;
  }
  $("#guideSearch").addEventListener("input", renderGuide);
  $("#guideSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.guideSeg = b.dataset.seg; renderGuide(); } });

  // ───────────────────────── Einstellungen ─────────────────────────
  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
  $("#btnSettings").addEventListener("click", () => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    openSheet({
      title: "Einstellungen", plain: true, noFooter: true,
      body: `
        <h3>Daten</h3>
        <p class="small muted" style="margin-bottom:10px">Deine Fänge, Spots und Gewässer sind nur auf diesem Gerät gespeichert (${state.catches.length} Fänge, ${state.spots.length} Spots). Erstelle regelmässig ein Backup.</p>
        <div class="row wrap" style="margin-bottom:22px">
          <button type="button" class="btn" id="btnExport">${ic("download", "sm")}Backup exportieren</button>
          <label class="btn">${ic("upload", "sm")}Backup importieren<input type="file" id="importFile" accept="application/json" hidden></label>
        </div>
        ${!standalone ? `<h3>Als App installieren</h3><p class="small muted" style="margin-bottom:10px">${isIOS ? "In Safari unten auf «Teilen» tippen und «Zum Home-Bildschirm» wählen." : "Installiere Fischerglück auf dem Startbildschirm – die App funktioniert dann auch offline."}</p>
          ${deferredPrompt ? `<button type="button" class="btn btn-primary" id="btnInstall" style="margin-bottom:22px">Installieren</button>` : `<div style="margin-bottom:22px"></div>`}` : ""}
        <h3>Beta-Funktionen</h3>
        <div class="list" style="margin-bottom:22px"><label class="li"><input type="checkbox" id="optHotspots" ${hotspotsOn() ? "checked" : ""} style="width:auto">
          <span class="body"><span class="t">Hotspots & Empfehlungen</span><span class="s" style="white-space:normal">Erkennt aus deinen Fängen Stellen, an denen du mehrmals gefangen hast, und empfiehlt sie bei ähnlichen Bedingungen.</span></span></label></div>
        <h3>Datenquellen</h3>
        <ul class="small muted" style="padding-left:18px;margin:0 0 10px">
          <li>Wetterprognose: MeteoSwiss ICON-CH über <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></li>
          <li>Messwerte: <a href="https://www.meteoschweiz.admin.ch" target="_blank" rel="noopener">MeteoSchweiz</a> SwissMetNet (Open Data)</li>
          <li>Seetemperaturen: Eawag <a href="https://www.alplakes.eawag.ch" target="_blank" rel="noopener">Alplakes</a> (Simstrat)</li>
          <li>Pegel, Abfluss, Flusstemperatur: <a href="https://www.hydrodaten.admin.ch" target="_blank" rel="noopener">BAFU Hydrodaten</a> via existenz.ch</li>
          <li>Karten: swisstopo, OpenStreetMap, OpenSeaMap · Gewässersuche: Nominatim</li>
        </ul>
        <p class="source">Fischerglück · Beisszeiten nach Solunar-Theorie (SunCalc). Alle Angaben ohne Gewähr.</p>`,
    });
    $("#btnExport").onclick = exportBackup;
    $("#optHotspots").onchange = (e) => { store.set("hotspots", e.target.checked); renderAll(); toast(e.target.checked ? "Hotspots eingeschaltet" : "Hotspots ausgeschaltet"); };
    $("#importFile").onchange = importBackup;
    if ($("#btnInstall")) $("#btnInstall").onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; sheet.close(); };
  });

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "fish-tracker", version: 2, exported: new Date().toISOString(), catches: state.catches, spots: state.spots, waters: state.waters })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fischerglueck-backup-${toDateKey(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importBackup(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.catches) || !Array.isArray(data.spots)) throw new Error("Format");
      for (const w of data.waters || []) if (w.id) await DB.put("waters", w);
      for (const s of data.spots) if (s.id) await DB.put("spots", s);
      for (const c of data.catches) if (c.id) await DB.put("catches", c);
      await reload();
      sheet.close();
      toast(`Importiert: ${data.catches.length} Fänge, ${data.spots.length} Spots`);
    } catch { toast("Ungültige Backup-Datei"); }
  }

  // ───────────────────────── Start ─────────────────────────
  // iOS-Web-App: iOS 26.0 meldet im App-Modus eine zu kleine Höhe – dann fehlt unten ein Streifen.
  // Liegt die App unter der Statusleiste (Inset oben > 0), entspricht die echte Höhe der Bildschirmhöhe.
  const insetProbe = document.createElement("div");
  insetProbe.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top)";
  document.body.appendChild(insetProbe);
  function fitStandalone() {
    const root = document.documentElement;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    root.classList.toggle("standalone", standalone);
    root.style.removeProperty("--app-h");
    if (!standalone) return;
    const portrait = window.innerHeight >= window.innerWidth;
    const full = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
    const underStatusBar = insetProbe.offsetHeight > 0;
    const h = underStatusBar ? full : window.innerHeight;
    if (h > window.innerHeight + 1) root.style.setProperty("--app-h", h + "px");
  }
  fitStandalone();
  window.addEventListener("resize", fitStandalone);
  window.addEventListener("orientationchange", () => setTimeout(fitStandalone, 300));

  const updateNet = () => ($("#netStatus").hidden = navigator.onLine);
  window.addEventListener("online", () => { updateNet(); renderView(currentView); });
  window.addEventListener("offline", updateNet);
  updateNet();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

  async function reload() {
    [state.catches, state.spots, state.waters] = await Promise.all([DB.all("catches"), DB.all("spots"), DB.all("waters")]);
    state.waters.sort((a, b) => (a.created || 0) - (b.created || 0));
    renderAll();
  }

  (async () => {
    await DB.open();
    await loadStatic();
    [state.catches, state.spots, state.waters] = await Promise.all([DB.all("catches"), DB.all("spots"), DB.all("waters")]);
    if (state.activeId && !waterById(state.activeId)) state.activeId = null;
    await setActive(state.activeId);
    showView(store.get("view", "home"));
    const w = activeWater();
    if (w) { ensureOutline(w); if (!store.get("mapCenter", null)) fitWater(); }
    locate(false).then(() => { if (!activeWater() && currentView === "home") renderHome(); });
  })();
})();
