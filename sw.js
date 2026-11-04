/* Service Worker: App offline nutzbar machen, angesehene Kartenkacheln speichern. */
const VERSION = "v16";
const APP_CACHE = `ft-app-${VERSION}`;
const TILE_CACHE = "ft-tiles";
const MAX_TILES = 4000;

const APP_FILES = [
  "./", "index.html", "styles.css?v=16", "app.js?v=16", "data.js?v=16", "manifest.webmanifest",
  "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
  "data/stations.json", "data/lakes.json",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/suncalc@1.9.0/suncalc.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => Promise.all(APP_FILES.map((f) => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ft-app-") && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isTile = (u) => /wmts\.geo\.admin\.ch|tile\.openstreetmap\.org|tiles\.openseamap\.org/.test(u.hostname);
const isLive = (u) => /open-meteo\.com|existenz\.ch|data\.geo\.admin\.ch|nominatim\.openstreetmap\.org|overpass-api\.de/.test(u.hostname);

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isTile(url)) {
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) { c.put(req, r.clone()); trimTiles(); } return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (isLive(url)) return; // Live-Daten immer direkt vom Netz

  // App-Dateien: Netzwerk zuerst und am Browser-Cache vorbei (Updates sofort sichtbar), Fallback Cache
  const sameOrigin = url.origin === location.origin;
  e.respondWith(
    (sameOrigin ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req)).then((r) => {
      if (r.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
        const copy = r.clone();
        caches.open(APP_CACHE).then((c) => c.put(req, copy));
      }
      return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match(req, { ignoreSearch: true })).then((r) => r || (req.mode === "navigate" ? caches.match("index.html") : undefined))),
  );
});
