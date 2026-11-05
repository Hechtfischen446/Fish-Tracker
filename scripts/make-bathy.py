#!/usr/bin/env python3
"""Erzeugt farbige Tiefenkarten (PNG, Web-Mercator) aus swissBATHY3D (swisstopo, Open Data).

Einmalig lokal ausführen:  python3 scripts/make-bathy.py [see ...]
Ergebnis: images/bathy/<key>.png und data/bathy.json (Bounds je See).
Die Rohdaten (1-m-Raster, mehrere 100 MB je See) werden nur temporär geladen.
"""
import json, math, os, sys, tempfile, urllib.request, warnings, zipfile
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_IMG = os.path.join(ROOT, "images", "bathy")
OUT_JSON = os.path.join(ROOT, "data", "bathy.json")
BASE = "https://data.geo.admin.ch/ch.swisstopo.swissbathy3d"

# swisstopo-Name → Gewässer-Schlüssel(n) in data.js
LAKES = {
    "zugersee": ["zug"], "zuerichsee": ["zurich"], "vierwaldstaettersee": ["vierwaldstaettersee"],
    "aegerisee": ["aegerisee"], "baldeggersee": ["baldegg"], "bielersee": ["biel"],
    "bodensee": ["bodensee", "untersee"], "brienzersee": ["brienz"], "hallwilersee": ["hallwil"],
    "lacdejoux": ["joux"], "lacleman": ["geneva"], "lacneuchatel": ["neuchatel"],
    "lagomaggiore": ["maggiore"], "lungernsee": ["lungern"], "murtensee": ["murten"],
    "rotsee": ["rotsee"], "sarnersee": ["sarnersee"], "sempachersee": ["sempach"],
    "silsersee": ["sils"], "silvaplanersee": ["silvaplana"], "thunersee": ["thun"], "walensee": ["walensee"],
}
# Mittlerer Seespiegel (m ü. M.) – Tiefe = Seespiegel − Seegrund
LEVEL = {"zugersee": 413.6, "zuerichsee": 405.9, "vierwaldstaettersee": 433.6, "aegerisee": 723.9, "baldeggersee": 463.0,
         "bielersee": 429.3, "bodensee": 395.3, "brienzersee": 563.7, "hallwilersee": 448.7, "lacdejoux": 1004.3,
         "lacleman": 372.0, "lacneuchatel": 429.3, "lagomaggiore": 193.5, "lungernsee": 688.0, "murtensee": 429.3,
         "rotsee": 419.0, "sarnersee": 469.0, "sempachersee": 503.8, "silsersee": 1797.0, "silvaplanersee": 1790.5,
         "thunersee": 557.8, "walensee": 419.0}
# Tiefenstufen (Obergrenze in m) – muss zu BATHY_BANDS in app.js passen
BANDS = [(3, "#e0352b"), (6, "#f46d43"), (10, "#fdae61"), (15, "#fee08b"), (20, "#d9ef8b"), (30, "#91cf60"),
         (50, "#3fb68b"), (75, "#2b9bc8"), (100, "#2166ac"), (150, "#4a3f9e"), (200, "#3b1e7a"), (9999, "#24104f")]


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def wgs_to_lv95(lat, lng):
    p = (lat * 3600 - 169028.66) / 10000
    l = (lng * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def lv95_to_wgs(e, n):
    y = (e - 2600000) / 1e6
    x = (n - 1200000) / 1e6
    lng = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return lat * 100 / 36, lng * 100 / 36


def merc(lat, lng):
    x = lng * math.pi / 180 * 6378137
    y = math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * 6378137
    return x, y


def process(name, keys):
    url = f"{BASE}/swissbathy3d_{name}/swissbathy3d_{name}_2056_5728.esriasciigrid.zip"
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    print(f"[{name}] lade …", flush=True)
    with urllib.request.urlopen(url) as r:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            tmp.write(b)
    tmp.close()
    try:
        z = zipfile.ZipFile(tmp.name)
        members = [m for m in z.namelist() if m.endswith(".asc")]
        tiles = []
        for m in members:
            parts = os.path.basename(m)[:-4].split("_")
            tiles.append((int(parts[-2]), int(parts[-1]), m))  # km-Kachel (E, N)
        e0, e1 = min(t[0] for t in tiles), max(t[0] for t in tiles) + 1
        n0, n1 = min(t[1] for t in tiles), max(t[1] for t in tiles) + 1
        area = (e1 - e0) * (n1 - n0)
        res = next(r for r in (4, 5, 8, 10, 20, 25) if area * (1000 / r) ** 2 <= 40e6 and max(e1 - e0, n1 - n0) * 1000 / r <= 4200)
        k = 1000 // res
        grid = np.full(((n1 - n0) * k, (e1 - e0) * k), np.nan, dtype=np.float32)
        for (te, tn, m) in tiles:
            with z.open(m) as f:
                head = [f.readline().decode() for _ in range(6)]
                hd = {l.split()[0].lower(): float(l.split()[1]) for l in head}
                a = np.array(f.read().split(), dtype=np.float32)
            nr, nc = int(hd["nrows"]), int(hd["ncols"])
            a = a[: nr * nc].reshape(nr, nc)
            a[a == hd.get("nodata_value", -9999)] = np.nan
            cs = hd["cellsize"]  # meist 1 m, teils 2 m
            nn = int(math.ceil(1000 / cs))
            # Randkacheln sind kleiner: in eine volle 1-km-Kachel einbetten
            full = np.full((nn, nn), np.nan, dtype=np.float32)
            c0 = int(round((hd["xllcorner"] - te * 1000) / cs))
            r0 = int(round(((tn + 1) * 1000 - (hd["yllcorner"] + nr * cs)) / cs))
            r0, c0 = max(r0, 0), max(c0, 0)
            hh, ww = min(nr, nn - r0), min(nc, nn - c0)
            full[r0:r0 + hh, c0:c0 + ww] = a[:hh, :ww]
            if res % cs == 0:
                bl = int(res / cs)
                with np.errstate(all="ignore"), warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    b = np.nanmean(full.reshape(k, bl, k, bl), axis=(1, 3))
            else:  # z. B. 3-m-Raster: Zellmitte abtasten
                ix = np.minimum(((np.arange(k) + 0.5) * res / cs).astype(int), nn - 1)
                b = full[np.ix_(ix, ix)]
            row = (n1 - tn - 1) * k  # Zeile 0 = Norden
            col = (te - e0) * k
            grid[row:row + k, col:col + k] = b
        valid = grid[~np.isnan(grid)]
        level = LEVEL.get(name) or float(np.percentile(valid, 99.7))
        depth = level - grid
        print(f"  Raster {grid.shape[1]}×{grid.shape[0]} @ {res} m · Seespiegel ≈ {level:.1f} m · max. Tiefe {np.nanmax(depth):.0f} m", flush=True)

        # Bounds (WGS84) aus den Rasterecken
        corners = [lv95_to_wgs(e0 * 1000, n0 * 1000), lv95_to_wgs(e1 * 1000, n0 * 1000), lv95_to_wgs(e0 * 1000, n1 * 1000), lv95_to_wgs(e1 * 1000, n1 * 1000)]
        lat0, lat1 = min(c[0] for c in corners), max(c[0] for c in corners)
        lng0, lng1 = min(c[1] for c in corners), max(c[1] for c in corners)
        mx0, my0 = merc(lat0, lng0)
        mx1, my1 = merc(lat1, lng1)
        mpx = res / math.cos(math.radians((lat0 + lat1) / 2))  # Mercator-Meter pro Pixel
        W, H = int(math.ceil((mx1 - mx0) / mpx)), int(math.ceil((my1 - my0) / mpx))
        xs = mx0 + (np.arange(W) + 0.5) * mpx
        ys = my1 - (np.arange(H) + 0.5) * mpx
        lng = xs / 6378137 * 180 / math.pi
        lat = (2 * np.arctan(np.exp(ys / 6378137)) - math.pi / 2) * 180 / math.pi
        LNG, LAT = np.meshgrid(lng, lat)
        E, N = wgs_to_lv95(LAT, LNG)
        ci = np.floor((E - e0 * 1000) / res).astype(np.int64)
        ri = np.floor((n1 * 1000 - N) / res).astype(np.int64)
        ok = (ci >= 0) & (ci < grid.shape[1]) & (ri >= 0) & (ri < grid.shape[0])
        d = np.full((H, W), np.nan, dtype=np.float32)
        d[ok] = depth[ri[ok], ci[ok]]
        idx = np.zeros((H, W), dtype=np.uint8)  # 0 = transparent
        lo = -1e9
        for i, (hi, _) in enumerate(BANDS):
            idx[(d > lo) & (d <= hi)] = i + 1
            lo = hi
        idx[np.isnan(d) | (d < 0.3)] = 0
        img = Image.fromarray(idx, mode="P")
        pal = [0, 0, 0]
        for _, c in BANDS:
            pal += list(hex2rgb(c))
        img.putpalette(pal + [0] * (768 - len(pal)))
        os.makedirs(OUT_IMG, exist_ok=True)
        path = os.path.join(OUT_IMG, f"{name}.png")
        img.save(path, optimize=True, transparency=0)
        print(f"  → {W}×{H} px, {os.path.getsize(path) / 1e6:.2f} MB", flush=True)
        return {"file": f"images/bathy/{name}.png", "keys": keys, "bounds": [[round(lat0, 6), round(lng0, 6)], [round(lat1, 6), round(lng1, 6)]],
                "maxDepth": round(float(np.nanmax(depth))), "res": res}
    finally:
        os.unlink(tmp.name)


def main():
    names = sys.argv[1:] or list(LAKES)
    out = json.load(open(OUT_JSON)) if os.path.exists(OUT_JSON) else {}
    for n in names:
        out[n] = process(n, LAKES[n])
        json.dump(out, open(OUT_JSON, "w"), ensure_ascii=False, indent=1)
    print("fertig:", len(out), "Seen")


if __name__ == "__main__":
    main()
