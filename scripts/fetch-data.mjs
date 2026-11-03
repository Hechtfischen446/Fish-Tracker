// Holt Daten, die der Browser nicht direkt abrufen kann oder die selten ändern,
// und legt sie als JSON neben die App (läuft in der GitHub Action vor dem Deploy).
//
//   data/lakes.json     – Wassertemperatur nach Tiefe + Oberflächenverlauf (Eawag / Alplakes)
//   data/stations.json  – MeteoSwiss-Wetterstationen und BAFU-Hydrostationen
//
// Aufruf: node scripts/fetch-data.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const out = (p) => new URL(p, root);

async function getJSON(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "FishTracker-DataBot/1.0 (github.com/Hechtfischen446/Fish-Tracker)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1500 * i));
    }
  }
}

const stamp = (d) => d.toISOString().slice(0, 16).replace(/[-T:]/g, "");
const round = (v, n = 2) => (v == null ? null : Math.round(v * 10 ** n) / 10 ** n);

async function loadCatalog() {
  const src = await readFile(out("data.js"), "utf8");
  const win = {};
  new Function("window", src)(win);
  return win.SWISS_WATERS;
}

async function lakes(catalog) {
  const meta = await getJSON("https://alplakes-api.eawag.ch/simulations/1d/metadata");
  const sim = meta.find((m) => m.model === "simstrat");
  const avail = new Map(sim.lakes.map((l) => [l.name, l]));
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const result = {};
  for (const w of catalog.filter((w) => w.alplakes)) {
    const m = avail.get(w.alplakes);
    if (!m) { console.warn(`! ${w.alplakes} nicht in Alplakes`); continue; }
    try {
      const end = new Date(Math.min(now.getTime() + 4 * 864e5, Date.parse(m.end_date + "T21:00:00Z")));
      const t = new Date(Math.min(now.getTime(), end.getTime()));
      const prof = await getJSON(`https://alplakes-api.eawag.ch/simulations/1d/profile/simstrat/${w.alplakes}/${stamp(t)}?variables=T`);
      const depths = prof.depth.data, temps = prof.variables.T.data;
      const profile = depths.map((d, i) => [round(d, 1), round(temps[i])]).filter(([d, v]) => v != null && d <= 80).sort((a, b) => a[0] - b[0]);
      const start = new Date(now.getTime() - 3 * 864e5);
      const ts = await getJSON(`https://alplakes-api.eawag.ch/simulations/1d/point/simstrat/${w.alplakes}/${stamp(start)}/${stamp(end)}/1?variables=T`);
      const surface = ts.time.map((x, i) => [x.slice(0, 16) + "Z", round(ts.variables.T.data[i])]).filter((p) => p[1] != null);
      // Sprungschicht-Verlauf: Tiefe mit dem stärksten Temperaturabfall (≥ 0.4 °C/m) pro Zeitschritt
      let thermo = [];
      try {
        const dt = await getJSON(`https://alplakes-api.eawag.ch/simulations/1d/depthtime/simstrat/${w.alplakes}/${stamp(start)}/${stamp(end)}?variables=T`);
        const dep = dt.depth.data, T = dt.variables.T.data; // T[depth][time]
        const order = dep.map((d, i) => [d, i]).filter(([d]) => d <= 60).sort((x, y) => x[0] - y[0]);
        thermo = dt.time.map((x, ti) => {
          let best = { g: 0, d: null };
          for (let k = 1; k < order.length; k++) {
            const [d0, i0] = order[k - 1], [d1, i1] = order[k];
            const t0 = T[i0]?.[ti], t1 = T[i1]?.[ti];
            if (t0 == null || t1 == null) continue;
            const g = (t0 - t1) / (d1 - d0);
            if (g > best.g) best = { g, d: (d0 + d1) / 2 };
          }
          return [x.slice(0, 16) + "Z", best.g >= 0.4 ? round(best.d, 1) : null];
        });
      } catch (e) { console.warn(`  (Sprungschicht-Verlauf ${w.name}: ${e.message})`); }
      result[w.key] = { time: prof.time, profile, surface, thermo };
      console.log(`✓ ${w.name}: ${profile.length} Tiefen, ${surface.length} Zeitpunkte`);
    } catch (e) {
      console.warn(`! ${w.name}: ${e.message}`);
    }
  }
  return result;
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "").trim()));
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function stations() {
  // MeteoSwiss: automatisches Messnetz (Latin-1-CSV)
  const r = await fetch("https://data.geo.admin.ch/ch.meteoschweiz.messnetz-automatisch/ch.meteoschweiz.messnetz-automatisch_de.csv");
  if (!r.ok) throw new Error(`MeteoSwiss Stationen: HTTP ${r.status}`);
  const csv = new TextDecoder("latin1").decode(await r.arrayBuffer());
  const meteo = parseCsv(csv)
    .filter((s) => s.Stationstyp === "Wetterstation" && s.Breitengrad)
    .map((s) => ({ id: s["Abk."], name: s.Station, lat: +s.Breitengrad, lng: +s["Längengrad"], alt: +s["Stationshöhe m ü. M."] || null, canton: s.Kanton }));

  // BAFU Hydrodaten (via existenz.ch)
  const loc = await getJSON("https://api.existenz.ch/apiv1/hydro/locations?app=fishtracker");
  const latest = await getJSON("https://api.existenz.ch/apiv1/hydro/latest?app=fishtracker");
  const pars = {};
  for (const x of latest.payload) (pars[x.loc] ||= new Set()).add(x.par);
  const hydro = Object.values(loc.payload).map(({ details: d }) => ({
    id: d.id, name: d.name, water: d["water-body-name"], type: d["water-body-type"], lat: d.lat, lng: d.lon,
    pars: [...(pars[d.id] || [])].filter((p) => ["height", "flow", "temperature"].includes(p)),
  })).filter((s) => s.pars.length);
  console.log(`✓ ${meteo.length} MeteoSwiss-Stationen, ${hydro.length} BAFU-Stationen`);
  return { meteo, hydro };
}

await mkdir(out("data/"), { recursive: true });
const catalog = await loadCatalog();
const generated = new Date().toISOString();

try {
  await writeFile(out("data/stations.json"), JSON.stringify({ generated, ...(await stations()) }));
} catch (e) { console.warn("! Stationen:", e.message); }

try {
  const l = await lakes(catalog);
  if (Object.keys(l).length) await writeFile(out("data/lakes.json"), JSON.stringify({ generated, source: "Eawag / Alplakes (Simstrat)", lakes: l }));
} catch (e) { console.warn("! Seen:", e.message); }
