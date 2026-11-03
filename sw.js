/* Service Worker: macht die App offline nutzbar und speichert angesehene Kartenkacheln. */
const VERSION = "v1";
const APP_CACHE = `ft-app-${VERSION}`;
const TILE_CACHE = "ft-tiles";
const MAX_TILES = 3000;

const APP_FILES = [
  "./", "index.html", "styles.css", "app.js", "data.js", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/suncalc@1.9.0/suncalc.js",
  "https://unpkg.com/leaflet@1.9.4/dist/images/layers.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ft-app-") && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isTile = (url) => /tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org|openseamap\.org/.test(url.hostname);

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Kartenkacheln: aus dem Cache, im Hintergrund aktualisieren
  if (isTile(url)) {
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => {
        if (r.ok || r.type === "opaque") { c.put(req, r.clone()); trimTiles(); }
        return r;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Wetter / Overpass: immer Netzwerk (App zeigt Offline-Hinweis)
  if (/open-meteo\.com|overpass-api\.de/.test(url.hostname)) return;

  // App-Dateien: Netzwerk zuerst (für Updates), Fallback Cache
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
        const copy = r.clone();
        caches.open(APP_CACHE).then((c) => c.put(req, copy));
      }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});
