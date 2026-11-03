# 🎣 Fish Tracker – Schweizer Gewässer

Installierbare Web-App (PWA) fürs Fischen in der Schweiz. Du wählst ein Gewässer, und die ganze App zeigt Daten genau für dieses Gewässer: Wassertemperatur nach Tiefe, Sprungschicht, Pegel und Abfluss, MeteoSwiss-Wetter, Beisszeiten, passende Fischarten sowie deine Fänge und Spots.

**Live:** https://hechtfischen446.github.io/Fish-Tracker/

## Funktionen

- **Gewässer wählen**: 29 Schweizer Seen und 16 Flüsse mit Steckbrief (Fläche, Tiefe, Höhe, Kantone, Fischarten). Weitere Gewässer findest du über die Suche (OpenStreetMap). Der Umriss wird automatisch geladen, und bestehende Fänge werden zugeordnet.
- **Übersicht pro Gewässer**:
  - Wassertemperatur und Sprungschicht mit Tiefenprofil und Oberflächen-Prognose (Eawag/Alplakes)
  - Pegel, Abfluss und Flusstemperatur (BAFU)
  - Luft, Wind und Luftdruck von der nächsten MeteoSwiss-Station
  - Fischarten mit Saison- und Laichzeit-Hinweis
  - Beisszeiten, Spots, eigene Fänge, Regeln und Patent
- **Karte**: swisstopo-Landeskarte (mit Tiefenlinien), SWISSIMAGE-Luftbild, swissBATHY3D-Seegrundrelief, OpenStreetMap und OpenSeaMap. Öffentliche Fischerplätze, Slipanlagen und Häfen aus OSM lassen sich einblenden.
- **Fänge**: Fischart, Grösse, Gewicht, Technik, Köder, Fangtiefe, Spot, Foto und GPS. Wassertemperatur und Wetter werden automatisch mitgespeichert. Die Statistik wertet nach Köder, Uhrzeit, Wassertemperatur, Fangtiefe, Monat und Mondphase aus.
- **Prognose**: Solunar-Beisszeiten mit Tageswertung und 7-Tage-Übersicht, MeteoSwiss-Messwerte, 48-Stunden-Diagramme (MeteoSwiss ICON-CH) und eine Einschätzung fürs Fischen.
- **Wissen**: 15 Fischarten mit Schweizer Namen (Egli, Felchen, Alet, Trüsche …), Fangkalender und Laichzeiten, Techniken (z. B. Hegene, Schleppen) und Regeln in der Schweiz.
- **Offline & privat**: Alle persönlichen Daten bleiben auf dem Gerät (IndexedDB). Backup ist per Export/Import möglich.

## Datenquellen

| Daten | Quelle | Abruf |
|---|---|---|
| Wetterprognose | MeteoSwiss ICON-CH über [Open-Meteo](https://open-meteo.com) | live im Browser |
| Wetter-Messwerte | [MeteoSchweiz](https://www.meteoschweiz.admin.ch) SwissMetNet (Open Data) | live im Browser |
| Seetemperatur & Sprungschicht | Eawag [Alplakes](https://www.alplakes.eawag.ch) (Simstrat) | alle 3 h durch GitHub Action → `data/lakes.json` |
| Pegel, Abfluss, Flusstemperatur | [BAFU Hydrodaten](https://www.hydrodaten.admin.ch) via existenz.ch | live im Browser |
| Karten | swisstopo, OpenStreetMap, OpenSeaMap | live, angesehene Kacheln offline |

Alplakes erlaubt keine direkten Browser-Abfragen von fremden Websites. Deshalb holt der Workflow `.github/workflows/pages.yml` die Daten alle 3 Stunden mit `scripts/fetch-data.mjs` und veröffentlicht sie zusammen mit der App.

> Hinweis: GitHub pausiert geplante Workflows, wenn im Repository 60 Tage lang nichts passiert. Dann im Tab *Actions* den Workflow wieder aktivieren.

## Lokal starten

```bash
node scripts/fetch-data.mjs   # optional: Daten aktualisieren
python3 -m http.server 8000   # dann http://localhost:8000 öffnen
```

> ⚠️ Schonzeiten, Schonmasse und Fangbestimmungen sind kantonal geregelt. Es gelten immer die offiziellen Vorschriften des Gewässers.
