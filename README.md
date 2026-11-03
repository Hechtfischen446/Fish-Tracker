# 🎣 Fish Tracker

Eine installierbare Web-App (PWA) fürs Angeln: Fänge eintragen, Spots finden, Beißzeiten, Wetter und Techniken – mit interaktiver Karte. Läuft im Browser und lässt sich auf dem Handy wie eine App auf den Startbildschirm legen. Funktioniert auch offline.

## Funktionen

- **🗺️ Karte**: Straßenkarte, Satellitenbild, Topo-Karte und Seezeichen (OpenSeaMap). Zeigt deine Fänge und Spots. Auf die Karte tippen, um dort einen Fang oder Spot einzutragen. Mit **„Angelplätze hier suchen“** findest du öffentliche Angelplätze, Slipanlagen und Häfen aus OpenStreetMap.
- **🐟 Fänge**: Fischart, Länge, Gewicht, Datum und Uhrzeit, Technik, Köder, Tiefe, Spot, GPS-Position, Foto und Notizen. Das aktuelle Wetter wird automatisch mitgespeichert.
- **📍 Spots**: eigene Angelplätze mit Gewässertyp, Zielfischen, Erlaubnis/Gewässerkarte, Bewertung und Notizen.
- **🌙 Beißzeiten**: Solunar-Berechnung (Mondstand, Mondphase, Sonnenauf- und -untergang) mit Haupt- und Nebenbeißzeiten, Tageswertung und 7-Tage-Vorschau. Dazu kommen Wetter mit Luftdrucktrend und Angeltipps sowie deine persönlich besten Uhrzeiten.
- **🎣 Technik**: Ratgeber für Hecht, Zander, Barsch, Forelle, Karpfen, Aal, Wels, Schleie, Friedfische und Döbel. Er zeigt beste Monate, Tageszeit, Standorte, Köder und typische Schonzeiten. Dazu kommen Erklärungen zu den Angeltechniken und deine eigenen Erfahrungswerte pro Fischart.
- **📊 Statistik**: Rekorde, erfolgreichste Köder, Techniken und Spots sowie Fänge pro Monat und nach Mondphase.
- **💾 Backup**: Export und Import als JSON-Datei. Alle Daten bleiben lokal auf deinem Gerät.

## Benutzen

### Online (empfohlen) – GitHub Pages
1. Den Code in den `main`-Branch mergen.
2. Im Repository unter **Settings → Pages → Source** die Option **„GitHub Actions“** wählen.
3. Die App ist danach unter `https://<benutzername>.github.io/Fish-Tracker/` erreichbar.
4. Auf dem Handy öffnen:
   - **Android (Chrome)**: Menü → „App installieren“.
   - **iPhone (Safari)**: Teilen → „Zum Home-Bildschirm“.

### Lokal
```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Technik
Reines HTML/CSS/JavaScript ohne Build-Schritt. Verwendet werden [Leaflet](https://leafletjs.com) für die Karte, [SunCalc](https://github.com/mourner/suncalc) für Sonne und Mond, [Open-Meteo](https://open-meteo.com) fürs Wetter (kostenlos, ohne API-Key) und die [Overpass API](https://overpass-api.de) für öffentliche Angelplätze. Ein Service Worker speichert die App und bereits angesehene Kartenausschnitte für die Offline-Nutzung.

> ⚠️ Schonzeiten, Mindestmaße und Fangbestimmungen unterscheiden sich je nach Bundesland und Gewässer. Es gelten immer die offiziellen Regeln deines Gewässers.
