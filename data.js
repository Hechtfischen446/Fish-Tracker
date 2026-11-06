/* Wissensbasis für Schweizer Gewässer.
 *
 * FISH_GUIDE.months: Fangaussichten Jan–Dez (0 = kaum, 1 = mässig, 2 = gut, 3 = sehr gut)
 * FISH_GUIDE.spawn:  typische Laichmonate (Index 0–11). In dieser Zeit gilt meist eine
 *                    Schonzeit – die genauen Daten legt der Kanton bzw. das Konkordat fest.
 *
 * SWISS_WATERS: Gewässer-Steckbriefe (Werte gerundet, "ca.").
 *   alplakes: Schlüssel des Seemodells von Eawag/Alplakes (Wassertemperatur nach Tiefe)
 *   hydro:    Gewässername in den BAFU-Hydrodaten (Pegel, Abfluss, Wassertemperatur)
 */
window.FISH_GUIDE = [
  {
    name: "Egli", alias: ["Flussbarsch", "Barsch", "Kretzer", "Perche"], type: "Raubfisch",
    months: [1, 1, 1, 1, 1, 2, 3, 3, 3, 3, 2, 1], spawn: [3, 4],
    daytime: "Tagsüber aktiv, besonders vormittags und am späten Nachmittag. Im Winter in der Tiefe.",
    spots: "Halden und Kanten, Stege, Hafenmauern, Krautränder, Unterwasserberge. Meist im Schwarm.",
    techniques: ["Dropshot", "Spinnfischen", "Finesse-Rigs", "Zapfen mit Wurm"],
    baits: "Kleine Gummifische (5–8 cm), Spinner Gr. 1–3, Wurm, Maden, Fischfetzen.",
    tips: "Wo ein Egli beisst, sind meist mehr: Stelle intensiv befischen. Im Hochsommer stehen Egli oft knapp über der Sprungschicht.",
    temp: "Aktiv ab ca. 8 °C, ideal 15–22 °C",
  },
  {
    name: "Felchen", alias: ["Renke", "Balchen", "Albeli", "Brienzlig", "Coregone", "Palée", "Bondelle"], type: "Schwebfisch",
    months: [1, 1, 1, 2, 3, 3, 3, 3, 3, 2, 0, 0], spawn: [10, 11],
    daytime: "Ganztägig; oft beste Phasen am Morgen und gegen Abend.",
    spots: "Freiwasser über tiefem Grund, Halden. Im Sommer im Bereich der Sprungschicht (oft 10–25 m).",
    techniques: ["Hegene / Nymphen-Paternoster", "Bodenhegene", "Schwebhegene"],
    baits: "Hegene mit 3–5 Nymphen in braun, grün, schwarz oder rot. Grösse und Farbe nach Gewässer.",
    tips: "Das Echolot oder die Temperatur-Schichtung zeigt, wo die Felchen stehen. Fein zupfen und sehr langsam heben. Bisse sind oft nur ein leichtes Zittern der Spitze.",
    temp: "Bevorzugt kühles Wasser 6–14 °C",
  },
  {
    name: "Hecht", alias: ["Brochet", "Luccio"], type: "Raubfisch",
    months: [1, 1, 0, 0, 1, 2, 1, 1, 2, 3, 3, 2], spawn: [1, 2, 3],
    daytime: "Morgens und abends. An trüben, windigen Tagen auch ganztägig.",
    spots: "Schilfgürtel, Seerosenfelder, Krautbänke, Buchten, Weissfischschwärme, versunkenes Holz.",
    techniques: ["Spinnfischen", "Jerkbait", "Köderfisch (tot)", "Schleppen"],
    baits: "Gummifisch (10–20 cm), Spinner, Löffel, Wobbler, Jerkbait, toter Köderfisch.",
    tips: "Stahl-, Titan- oder dickes Fluorocarbon-Vorfach verwenden. Im Herbst grosse Köder langsam führen.",
    temp: "Aktiv in weitem Bereich, ideal 10–20 °C",
  },
  {
    name: "Zander", alias: ["Sandre", "Lucioperca"], type: "Raubfisch",
    months: [1, 1, 1, 0, 0, 1, 2, 2, 3, 3, 3, 2], spawn: [3, 4, 5],
    daytime: "Dämmerung und Nacht; bei trübem Wasser auch tagsüber.",
    spots: "Harter Grund, Steinpackungen, Kanten, Hafeneinfahrten, Brückenpfeiler, tiefe Rinnen.",
    techniques: ["Jiggen / Faulenzen", "Dropshot", "Köderfisch auf Grund", "Vertikalangeln"],
    baits: "Schlanke Gummifische (8–14 cm), Köderfischfetzen, Wobbler nachts im Flachen.",
    tips: "Bisse sind oft nur ein leichtes «Tock»: sofort anschlagen und Grundkontakt halten.",
    temp: "Ideal 12–22 °C, mag trübes Wasser",
  },
  {
    name: "Seeforelle", alias: ["Truite lacustre", "Trota lacustre"], type: "Salmonide",
    months: [1, 2, 3, 3, 3, 2, 1, 1, 1, 0, 0, 0], spawn: [9, 10, 11],
    daytime: "Früh morgens und abends; im Frühling bei kühlem Wasser auch tagsüber nahe der Oberfläche.",
    spots: "Freiwasser, Mündungen von Zuflüssen, steile Halden. Im Sommer tief unter der Sprungschicht.",
    techniques: ["Schleppen (Trolling)", "Spinnfischen vom Ufer", "Downrigger"],
    baits: "Löffel, schlanke Wobbler, Fischimitationen, Lauben- oder Felchenimitate.",
    tips: "Im Frühling (Feb–Mai) steht die Seeforelle oft in den oberen Metern. Viele Seen haben eine eigene Schonzeit und ein hohes Schonmass.",
    temp: "Bevorzugt 6–14 °C",
  },
  {
    name: "Seesaibling", alias: ["Saibling", "Rötel", "Omble chevalier", "Salmerino"], type: "Salmonide",
    months: [1, 1, 2, 2, 3, 3, 2, 2, 2, 1, 0, 1], spawn: [10, 11],
    daytime: "Ganztägig in der Tiefe.",
    spots: "Tiefe, kalte Bereiche (oft 30–80 m), steile Halden in Voralpen- und Bergseen.",
    techniques: ["Tiefseehegene", "Vertikalangeln", "Schleppen (tief)"],
    baits: "Hegene, kleine Löffel, Fischfetzen, Maden.",
    tips: "Mit dem Echolot die Schwärme suchen. Der Zuger Rötel ist eine regionale Spezialität.",
    temp: "Kaltwasserfisch, 4–10 °C",
  },
  {
    name: "Bachforelle", alias: ["Forelle", "Regenbogenforelle", "Truite", "Trota"], type: "Salmonide",
    months: [0, 0, 2, 3, 3, 3, 2, 2, 2, 0, 0, 0], spawn: [9, 10, 11, 0],
    daytime: "Morgens und abends, bei bedecktem Himmel ganztägig.",
    spots: "Strömungskanten, Gumpen, Rauschen, unterspülte Ufer, hinter Steinen.",
    techniques: ["Fliegenfischen", "Spinnfischen (UL)", "Naturköder (Wurm)"],
    baits: "Nymphen, Trockenfliegen, Spinner Gr. 0–2, kleine Wobbler, Wurm.",
    tips: "Gegen die Strömung anschleichen und dünne Schnur wählen. Die Saison in Fliessgewässern beginnt meist im März.",
    temp: "Ideal 8–16 °C, über 20 °C Stress",
  },
  {
    name: "Äsche", alias: ["Ombre", "Temolo"], type: "Salmonide",
    months: [1, 1, 0, 0, 0, 2, 3, 3, 3, 3, 2, 1], spawn: [2, 3, 4],
    daytime: "Tagsüber, beste Phasen bei Insektenschlupf.",
    spots: "Mittlere Strömung über Kies, Rinnen in grösseren Flüssen (z. B. Rhein, Aare, Reuss, Thur).",
    techniques: ["Fliegenfischen (Nymphe, Trocken)"],
    baits: "Kleine Nymphen und Trockenfliegen (Gr. 16–20).",
    tips: "Die Äsche ist vielerorts gefährdet und streng geschützt. Bei warmem Wasser (über ca. 18 °C) gar nicht befischen!",
    temp: "Sehr temperaturempfindlich, ideal 8–15 °C",
  },
  {
    name: "Trüsche", alias: ["Quappe", "Lotte", "Bottatrice"], type: "Raubfisch",
    months: [3, 3, 2, 1, 1, 1, 1, 1, 1, 2, 2, 3], spawn: [11, 0, 1],
    daytime: "Nachts und in der Dämmerung.",
    spots: "Steiniger Grund, Halden, Hafenmauern, Steinschüttungen.",
    techniques: ["Grundangeln nachts", "Zapfen nachts"],
    baits: "Wurmbündel, Fischfetzen, kleiner toter Köderfisch.",
    tips: "Der einzige Dorschartige im Süsswasser. Ein klassischer Winterfisch, besonders aktiv in kalten Nächten.",
    temp: "Kaltwasserfisch, aktiv unter 10 °C",
  },
  {
    name: "Barbe", alias: ["Barbeau", "Barbo"], type: "Friedfisch",
    months: [0, 0, 1, 1, 1, 2, 3, 3, 3, 2, 1, 0], spawn: [4, 5],
    daytime: "Dämmerung und nachts; bei Trübung auch tagsüber.",
    spots: "Kiesige Strömungsrinnen in Flüssen (Rhein, Aare, Reuss, Doubs).",
    techniques: ["Feederangeln", "Grundangeln in der Strömung"],
    baits: "Käse, Wurm, Maden, Frühstücksfleisch, Pellets.",
    tips: "Kräftiges Gerät für die Strömung verwenden. Ein gleichmässiger Futterstrom hält die Barben am Platz.",
    temp: "Ideal 14–22 °C",
  },
  {
    name: "Alet", alias: ["Döbel", "Chevaine", "Cavedano"], type: "Friedfisch",
    months: [1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 1, 1], spawn: [3, 4, 5],
    daytime: "Ganztägig, im Sommer mittags an der Oberfläche.",
    spots: "Unter überhängenden Bäumen, Brücken, Strömungskanten, Mündungen.",
    techniques: ["Spinnfischen", "Oberflächenköder", "Trotting mit Zapfen", "Fliegenfischen"],
    baits: "Brot, Kirschen, Käse, Insekten, kleine Wobbler und Spinner.",
    tips: "Sehr scheu: Schatten und Erschütterungen vermeiden.",
    temp: "Weiter Bereich, ideal 12–22 °C",
  },
  {
    name: "Karpfen", alias: ["Carpe", "Carpa"], type: "Friedfisch",
    months: [0, 0, 1, 2, 2, 3, 3, 3, 3, 2, 1, 0], spawn: [4, 5, 6],
    daytime: "Nachts und frühmorgens; an warmen Tagen auch mittags an der Oberfläche.",
    spots: "Krautfelder, Seerosen, Flachwasserzonen, überhängende Bäume, windzugewandtes Ufer.",
    techniques: ["Karpfenansitz (Selbsthakmontage)", "Feederangeln", "Zapfen", "Oberfläche mit Brot"],
    baits: "Boilies (Haarmontage), Mais, Tigernüsse, Pellets, Brotflocke.",
    tips: "Gezielt anfüttern und Abhakmatte verwenden. Ob Nachtangeln erlaubt ist, regelt der Kanton.",
    temp: "Aktiv ab ca. 12 °C, ideal 18–26 °C",
  },
  {
    name: "Schleie", alias: ["Tanche", "Tinca"], type: "Friedfisch",
    months: [0, 0, 0, 1, 3, 3, 3, 2, 1, 0, 0, 0], spawn: [5, 6],
    daytime: "Früh morgens bis zum Vormittag, abends.",
    spots: "Flache, krautige Buchten, Seerosen, schlammiger Grund. Aufsteigende Bläschen verraten sie.",
    techniques: ["Zapfen (Liftmethode)", "Feederangeln"],
    baits: "Wurm, Mais, Maden, Caster.",
    tips: "Den Platz am Vorabend anfüttern. Feiner Zapfen, Köder auf Grund.",
    temp: "Ideal 16–24 °C",
  },
  {
    name: "Brachsmen", alias: ["Brachse", "Brasse", "Blei", "Brème"], type: "Friedfisch",
    months: [1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 2, 1], spawn: [4, 5],
    daytime: "Abends und nachts, bei trübem Wetter auch tagsüber.",
    spots: "Tieferes Freiwasser über schlammigem Grund, Häfen, Kanäle, ruhige Flussabschnitte.",
    techniques: ["Feederangeln", "Method-Feeder", "Grundangeln"],
    baits: "Maden, Caster, Mais, Wurm, Teig, Futter mit Lockstoffen.",
    tips: "Brachsmen ziehen in grossen Schwärmen – konstant füttern hält sie am Platz.",
    temp: "Weiter Bereich, ideal 15–24 °C",
  },
  {
    name: "Rotauge", alias: ["Plötze", "Weissfisch", "Gardon"], type: "Friedfisch",
    months: [1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 2, 1], spawn: [3, 4],
    daytime: "Ganztägig, besonders morgens und abends.",
    spots: "Ufernahe Krautkanten, Schilf, Stege, Häfen und ruhige Buchten.",
    techniques: ["Zapfen (Match)", "Feederangeln", "Stippen"],
    baits: "Maden, Caster, Brot, Teig, kleine Würmer, Hanf.",
    tips: "Feine Montage mit kleinem Haken (Gr. 14–18). Ideal für Einsteiger und Kinder.",
    temp: "Weiter Bereich, ideal 12–22 °C",
  },
  {
    name: "Wels", alias: ["Waller", "Silure", "Siluro"], type: "Raubfisch",
    months: [0, 0, 0, 1, 2, 2, 3, 3, 2, 1, 0, 0], spawn: [5, 6],
    daytime: "Nachts; an heissen Sommertagen auch in der Dämmerung.",
    spots: "Tiefe Löcher, Totholz, Kanten, Hafenbecken, Seeausflüsse.",
    techniques: ["U-Pose", "Grundangeln", "Vertikalangeln", "Spinnfischen (gross)"],
    baits: "Wurmbündel, toter Köderfisch, grosse Gummifische, Calamari.",
    tips: "Sehr kräftiges Gerät verwenden (geflochtene Schnur ab 0,40 mm) und die Bremse vorher prüfen.",
    temp: "Aktiv ab ca. 15 °C, ideal 20–26 °C",
  },
];

window.TECHNIQUES = [
  { name: "Hegene / Nymphen-Paternoster", desc: "Die Schweizer Felchen-Methode: mehrere Nymphen an kurzen Seitenarmen über einem Blei, vertikal vom Boot oder Steg.", gear: "Feine Hegene-Rute 2,4–3 m, Rolle mit 0,16–0,20 mm Mono, Hegene mit 3–5 Nymphen, Blei 10–30 g.", how: "Tiefe der Fische suchen (Sprungschicht, Echolot). Blei absenken, leicht zupfen und langsam heben. Beim kleinsten Zittern sanft anschlagen." },
  { name: "Schleppen (Trolling)", desc: "Köder werden hinter dem fahrenden Boot geschleppt. Klassiker auf Seeforelle, Hecht und Seesaibling.", gear: "Schlepprute, Downrigger oder Sideplaner, Löffel und Wobbler.", how: "Die Tiefe wählst du nach der Wassertemperatur: im Frühling flach, im Sommer unter der Sprungschicht. Typisch sind 2–4 km/h. Schleppen ist bewilligungspflichtig – Patent prüfen!" },
  { name: "Spinnfischen", desc: "Aktives Angeln mit Kunstködern, die geworfen und eingeholt werden.", gear: "Spinnrute 2,1–2,7 m, 2500er-Rolle, geflochtene Schnur und Vorfach.", how: "Werfen, absinken lassen, mit wechselndem Tempo einholen. Spinnstopps und Zupfer provozieren Bisse." },
  { name: "Jiggen / Faulenzen", desc: "Gummifisch am Jigkopf springt über den Grund. Ideal auf Zander und Egli.", gear: "Straffe Spinnrute, geflochtene Schnur, Jigköpfe 7–28 g.", how: "Köder zum Grund sinken lassen, mit 2–3 Kurbelumdrehungen anheben. Der Biss kommt meist in der Absinkphase." },
  { name: "Dropshot", desc: "Köder schwebt über dem Blei und wird nahezu auf der Stelle angeboten.", gear: "Leichte Rute, Dropshot-Haken, Blei 5–15 g, 30–50 cm Abstand.", how: "Blei am Grund lassen und den Köder mit leichten Rutenbewegungen zittern lassen. Pausen einlegen." },
  { name: "Zapfenfischen", desc: "Der Zapfen (Pose) zeigt den Biss und hält den Köder in der gewünschten Tiefe.", gear: "Zapfenrute, feine Mono, Zapfen passend zur Strömung, Schrotbleie.", how: "Tiefe ausloten und den Köder knapp über oder auf Grund anbieten. Taucht der Zapfen ab, anschlagen." },
  { name: "Feeder- / Grundangeln", desc: "Futterkorb bringt Futter und Köder an den Grund, sehr effektiv auf Friedfische.", gear: "Feederrute, Futterkorb 20–80 g, Vorfach 50–100 cm.", how: "Immer dieselbe Stelle anwerfen (Schnurclip) und regelmässig nachfüttern. Die Spitze zeigt den Biss." },
  { name: "Fliegenfischen", desc: "Leichte Imitationen von Insekten, geworfen mit der schweren Fliegenschnur.", gear: "Fliegenrute Klasse 4–6, Fliegenschnur, Vorfach, Nymphen und Trockenfliegen.", how: "Schlupf beobachten und die passende Fliege wählen. Nymphe mit der Strömung treiben lassen, Trockenfliege ohne Zug driften lassen." },
  { name: "Karpfenansitz", desc: "Selbsthakmontage mit festem Blei.", gear: "Karpfenruten, Freilaufrolle, Bissanzeiger, Haarmontage, Abhakmatte.", how: "Platz anfüttern, Montage präzise ablegen und auf den Bissanzeiger warten." },
];

window.RULES_CH = [
  "Zum Fischen brauchst du in der Schweiz ein kantonales Patent oder eine Tages-/Wochenkarte. Für die meisten Patente ist der Sachkunde-Nachweis (SaNa) Pflicht.",
  "Schonzeiten, Schonmasse (Mindestmasse) und Fangzahlen legen die Kantone fest. Für Grenz- und grosse Seen gelten oft Konkordate (z. B. Bodensee, Vierwaldstättersee, Zürichsee–Linth–Walensee).",
  "Lebende Köderfische sind grundsätzlich verboten. Ob Widerhaken erlaubt sind, regeln die Kantone unterschiedlich.",
  "Gefangene Fische, die du behältst, musst du sofort fachgerecht betäuben und töten. In der Regel musst du jeden behaltenen Fisch in die Fangstatistik eintragen.",
  "Schwimmer- und Naturschutzzonen, Uferbetretungsrechte und Bootsvorschriften beachten.",
];

// Gewässer-Steckbriefe
window.SWISS_WATERS = [
  // Seen
  { key: "zurich", name: "Zürichsee", kind: "lake", lat: 47.255, lng: 8.66, area: 88, depth: 136, alt: 406, cantons: "ZH, SZ, SG", alplakes: "lowerzurich", hydro: ["Zürichsee"], species: ["Egli", "Felchen", "Hecht", "Zander", "Seeforelle", "Seesaibling", "Trüsche", "Wels", "Brachsmen", "Rotauge"] },
  { key: "zug", name: "Zugersee", kind: "lake", lat: 47.12, lng: 8.485, area: 38, depth: 198, alt: 413, cantons: "ZG, LU, SZ", alplakes: "zug", hydro: ["Zugersee"], species: ["Egli", "Felchen", "Hecht", "Seesaibling", "Seeforelle", "Trüsche", "Brachsmen", "Rotauge"] },
  { key: "vierwaldstaettersee", name: "Vierwaldstättersee", kind: "lake", lat: 46.99, lng: 8.47, area: 114, depth: 214, alt: 434, cantons: "LU, NW, OW, SZ, UR", alplakes: "lucernekreuztrichterandvitznauerbecken", hydro: ["Vierwaldstättersee"], species: ["Felchen", "Egli", "Hecht", "Seeforelle", "Seesaibling", "Trüsche"] },
  { key: "geneva", name: "Genfersee", osm: "Lac Léman", kind: "lake", lat: 46.45, lng: 6.55, area: 580, depth: 310, alt: 372, cantons: "VD, VS, GE (+F)", alplakes: "geneva", hydro: ["Lac Léman"], species: ["Egli", "Felchen", "Seeforelle", "Seesaibling", "Hecht", "Trüsche"] },
  { key: "bodensee", name: "Bodensee (Obersee)", osm: "Bodensee", kind: "lake", lat: 47.6, lng: 9.4, area: 473, depth: 251, alt: 395, cantons: "TG, SG (+D, A)", alplakes: "upperconstance", hydro: ["Bodensee, Obersee"], species: ["Felchen", "Egli", "Seeforelle", "Hecht", "Zander", "Seesaibling", "Trüsche", "Wels"] },
  { key: "untersee", name: "Bodensee (Untersee)", osm: "Untersee", kind: "lake", lat: 47.68, lng: 9.05, area: 63, depth: 46, alt: 395, cantons: "TG, SH (+D)", alplakes: "lowerconstance", hydro: ["Bodensee, Untersee"], species: ["Egli", "Hecht", "Zander", "Felchen", "Wels", "Karpfen", "Schleie"] },
  { key: "neuchatel", name: "Neuenburgersee", osm: "Lac de Neuchâtel", kind: "lake", lat: 46.9, lng: 6.85, area: 218, depth: 152, alt: 429, cantons: "NE, VD, FR, BE", alplakes: "neuchatel", hydro: ["Lac de Neuchâtel"], species: ["Egli", "Felchen", "Hecht", "Zander", "Seeforelle", "Wels"] },
  { key: "maggiore", name: "Lago Maggiore", kind: "lake", lat: 46.12, lng: 8.75, area: 212, depth: 372, alt: 193, cantons: "TI (+I)", alplakes: "maggiore", hydro: ["Lago Maggiore"], species: ["Egli", "Hecht", "Felchen", "Seeforelle", "Alet", "Karpfen"] },
  { key: "lugano", name: "Luganersee", osm: "Lago di Lugano", kind: "lake", lat: 45.99, lng: 8.98, area: 49, depth: 288, alt: 271, cantons: "TI (+I)", alplakes: "upperlugano", hydro: ["Lago di Lugano"], species: ["Egli", "Hecht", "Seeforelle", "Felchen", "Karpfen", "Alet"] },
  { key: "thun", name: "Thunersee", kind: "lake", lat: 46.69, lng: 7.71, area: 48, depth: 217, alt: 558, cantons: "BE", alplakes: "thun", hydro: ["Thunersee"], species: ["Felchen", "Seeforelle", "Seesaibling", "Egli", "Hecht", "Trüsche"] },
  { key: "brienz", name: "Brienzersee", kind: "lake", lat: 46.73, lng: 7.96, area: 30, depth: 259, alt: 564, cantons: "BE", alplakes: "brienz", hydro: ["Brienzersee"], species: ["Felchen", "Seeforelle", "Seesaibling", "Hecht", "Egli"] },
  { key: "biel", name: "Bielersee", kind: "lake", lat: 47.09, lng: 7.17, area: 39, depth: 74, alt: 429, cantons: "BE", alplakes: "biel", hydro: ["Bielersee"], species: ["Egli", "Felchen", "Hecht", "Zander", "Wels", "Brachsmen", "Rotauge"] },
  { key: "murten", name: "Murtensee", kind: "lake", lat: 46.93, lng: 7.08, area: 23, depth: 46, alt: 429, cantons: "FR, VD", alplakes: "murten", hydro: ["Murtensee"], species: ["Egli", "Hecht", "Zander", "Wels", "Felchen", "Brachsmen", "Rotauge"] },
  { key: "walensee", name: "Walensee", kind: "lake", lat: 47.125, lng: 9.2, area: 24, depth: 151, alt: 419, cantons: "SG, GL", alplakes: "walensee", hydro: ["Walensee"], species: ["Felchen", "Seeforelle", "Seesaibling", "Egli", "Hecht", "Trüsche"] },
  { key: "sempach", name: "Sempachersee", kind: "lake", lat: 47.14, lng: 8.155, area: 14, depth: 87, alt: 504, cantons: "LU", alplakes: "sempach", hydro: ["Sempachersee"], species: ["Felchen", "Egli", "Hecht", "Karpfen", "Schleie"] },
  { key: "hallwil", name: "Hallwilersee", kind: "lake", lat: 47.28, lng: 8.22, area: 10, depth: 47, alt: 449, cantons: "AG, LU", alplakes: "hallwil", hydro: ["Hallwilersee"], species: ["Felchen", "Egli", "Hecht", "Zander", "Karpfen", "Schleie"] },
  { key: "baldegg", name: "Baldeggersee", kind: "lake", lat: 47.2, lng: 8.26, area: 5.2, depth: 66, alt: 463, cantons: "LU", alplakes: "baldegg", hydro: ["Baldeggersee"], species: ["Egli", "Hecht", "Felchen", "Karpfen"] },
  { key: "greifensee", name: "Greifensee", kind: "lake", lat: 47.35, lng: 8.68, area: 8.5, depth: 32, alt: 435, cantons: "ZH", alplakes: "greifensee", hydro: ["Greifensee"], species: ["Egli", "Hecht", "Zander", "Karpfen", "Schleie", "Wels", "Felchen"] },
  { key: "pfaeffikersee", name: "Pfäffikersee", kind: "lake", lat: 47.35, lng: 8.78, area: 3.3, depth: 35, alt: 537, cantons: "ZH", alplakes: "pfaffikon", hydro: ["Pfäffikersee"], species: ["Egli", "Hecht", "Karpfen", "Schleie", "Brachsmen", "Rotauge"] },
  { key: "aegerisee", name: "Ägerisee", kind: "lake", lat: 47.12, lng: 8.62, area: 7.3, depth: 82, alt: 724, cantons: "ZG", alplakes: "aegeri", hydro: ["Aegerisee"], species: ["Felchen", "Egli", "Hecht", "Seesaibling", "Seeforelle"] },
  { key: "sarnersee", name: "Sarnersee", kind: "lake", lat: 46.87, lng: 8.21, area: 7.4, depth: 52, alt: 469, cantons: "OW", alplakes: "sarnen", hydro: ["Sarnersee"], species: ["Felchen", "Egli", "Hecht", "Seeforelle"] },
  { key: "sihlsee", name: "Sihlsee", kind: "lake", lat: 47.13, lng: 8.78, area: 11, depth: 23, alt: 889, cantons: "SZ", alplakes: "sihlsee", hydro: [], species: ["Hecht", "Egli", "Felchen", "Seeforelle"] },
  { key: "joux", name: "Lac de Joux", kind: "lake", lat: 46.64, lng: 6.29, area: 8.8, depth: 34, alt: 1004, cantons: "VD", alplakes: "joux", hydro: ["Lac de Joux"], species: ["Hecht", "Egli", "Felchen", "Seeforelle"] },
  { key: "gruyere", name: "Lac de la Gruyère", kind: "lake", lat: 46.67, lng: 7.08, area: 9.6, depth: 75, alt: 677, cantons: "FR", alplakes: "gruyere", hydro: [], species: ["Hecht", "Egli", "Seeforelle", "Alet"] },
  { key: "sils", name: "Silsersee", osm: "Lej da Segl", kind: "lake", lat: 46.42, lng: 9.74, area: 4.1, depth: 71, alt: 1797, cantons: "GR", alplakes: "sils", hydro: ["Silsersee"], species: ["Seesaibling", "Seeforelle", "Bachforelle"] },
  { key: "silvaplana", name: "Silvaplanersee", osm: "Lej da Silvaplauna", kind: "lake", lat: 46.45, lng: 9.79, area: 2.7, depth: 77, alt: 1791, cantons: "GR", alplakes: "silvaplana", hydro: ["Silvaplanersee"], species: ["Seesaibling", "Seeforelle"] },
  { key: "lungern", name: "Lungerersee", kind: "lake", lat: 46.79, lng: 8.16, area: 2, depth: 68, alt: 689, cantons: "OW", alplakes: "lungern", hydro: [], species: ["Seeforelle", "Seesaibling", "Egli"] },
  { key: "kloental", name: "Klöntalersee", kind: "lake", lat: 47.03, lng: 9.0, area: 3.3, depth: 47, alt: 848, cantons: "GL", alplakes: "klontalersee", hydro: [], species: ["Seeforelle", "Seesaibling"] },
  { key: "poschiavo", name: "Lago di Poschiavo", kind: "lake", lat: 46.28, lng: 10.08, area: 2, depth: 85, alt: 962, cantons: "GR", alplakes: "poschiavo", hydro: [], species: ["Seeforelle", "Seesaibling"] },
  // Fliessgewässer
  { key: "rhein", name: "Rhein", osm: "Rhein", kind: "river", lat: 47.57, lng: 8.52, cantons: "GR, SG, TG, SH, ZH, AG, BL, BS", hydro: ["Rhein", "Rhein (Oberwasser)"], species: ["Äsche", "Barbe", "Alet", "Bachforelle", "Seeforelle", "Hecht", "Egli", "Wels"] },
  { key: "aare", name: "Aare", kind: "river", lat: 46.95, lng: 7.45, cantons: "BE, SO, AG", hydro: ["Aare"], species: ["Äsche", "Barbe", "Bachforelle", "Alet", "Hecht", "Egli"] },
  { key: "reuss", name: "Reuss", kind: "river", lat: 47.25, lng: 8.32, cantons: "UR, LU, ZG, ZH, AG", hydro: ["Reuss"], species: ["Äsche", "Bachforelle", "Barbe", "Alet", "Hecht", "Egli"] },
  { key: "limmat", name: "Limmat", kind: "river", lat: 47.42, lng: 8.4, cantons: "ZH, AG", hydro: ["Limmat"], species: ["Äsche", "Bachforelle", "Barbe", "Alet", "Hecht", "Egli"] },
  { key: "rhone", name: "Rhone", osm: "Rhône", kind: "river", lat: 46.2, lng: 6.12, cantons: "VS, VD, GE", hydro: ["Rhône"], species: ["Bachforelle", "Äsche", "Barbe", "Hecht", "Egli"] },
  { key: "ticino", name: "Ticino", kind: "river", lat: 46.2, lng: 8.95, cantons: "TI", hydro: ["Ticino"], species: ["Bachforelle", "Seeforelle", "Äsche", "Alet"] },
  { key: "doubs", name: "Doubs", kind: "river", lat: 47.3, lng: 7.0, cantons: "NE, JU", hydro: ["Doubs"], species: ["Bachforelle", "Äsche", "Barbe", "Alet"] },
  { key: "emme", name: "Emme", kind: "river", lat: 47.05, lng: 7.62, cantons: "BE, SO", hydro: ["Emme"], species: ["Bachforelle", "Äsche", "Barbe"] },
  { key: "kleineemme", name: "Kleine Emme", kind: "river", lat: 47.03, lng: 8.2, cantons: "LU", hydro: ["Kleine Emme"], species: ["Bachforelle", "Äsche", "Barbe"] },
  { key: "thur", name: "Thur", kind: "river", lat: 47.55, lng: 8.9, cantons: "SG, TG, ZH", hydro: ["Thur"], species: ["Äsche", "Bachforelle", "Barbe", "Alet"] },
  { key: "saane", name: "Saane", osm: "Saane", kind: "river", lat: 46.8, lng: 7.15, cantons: "VD, FR, BE", hydro: ["Saane", "Sarine"], species: ["Bachforelle", "Äsche", "Barbe"] },
  { key: "linth", name: "Linth", kind: "river", lat: 47.13, lng: 9.05, cantons: "GL, SG, SZ", hydro: ["Linth"], species: ["Bachforelle", "Seeforelle", "Äsche"] },
  { key: "inn", name: "Inn", osm: "En", kind: "river", lat: 46.6, lng: 10.0, cantons: "GR", hydro: ["Inn"], species: ["Bachforelle", "Äsche", "Seeforelle"] },
  { key: "sihl", name: "Sihl", kind: "river", lat: 47.3, lng: 8.55, cantons: "SZ, ZG, ZH", hydro: ["Sihl"], species: ["Bachforelle", "Äsche", "Barbe"] },
  { key: "toess", name: "Töss", kind: "river", lat: 47.45, lng: 8.75, cantons: "ZH", hydro: ["Töss"], species: ["Bachforelle", "Äsche"] },
  { key: "birs", name: "Birs", kind: "river", lat: 47.45, lng: 7.6, cantons: "JU, BE, BL, BS", hydro: ["Birs", "Birse"], species: ["Bachforelle", "Äsche", "Barbe"] },
];

// Fotos der Fischarten (iNaturalist, freie Lizenzen – Urheber werden in der App angezeigt)
window.FISH_PHOTOS = {
  "Egli": {
    "file": "images/fish/egli.jpg?v=2",
    "cutout": true
  },
  "Felchen": {
    "file": "images/fish/felchen.jpg?v=2",
    "cutout": true
  },
  "Hecht": {
    "file": "images/fish/hecht.jpg?v=2",
    "cutout": true
  },
  "Zander": {
    "file": "images/fish/zander.jpg?v=2",
    "cutout": true
  },
  "Seeforelle": {
    "file": "images/fish/seeforelle.jpg?v=2",
    "cutout": true
  },
  "Bachforelle": {
    "file": "images/fish/bachforelle.jpg?v=3",
    "cutout": true
  },
  "Seesaibling": {
    "file": "images/fish/seesaibling.jpg?v=2",
    "cutout": true
  },
  "Äsche": {
    "file": "images/fish/aesche.jpg?v=3",
    "cutout": true
  },
  "Trüsche": {
    "file": "images/fish/truesche.jpg?v=3",
    "cutout": true
  },
  "Barbe": {
    "file": "images/fish/barbe.jpg?v=2",
    "cutout": true
  },
  "Alet": {
    "file": "images/fish/alet.jpg?v=3",
    "cutout": true
  },
  "Karpfen": {
    "file": "images/fish/karpfen.jpg?v=3",
    "cutout": true
  },
  "Schleie": {
    "file": "images/fish/schleie.jpg?v=2",
    "cutout": true
  },
  "Wels": {
    "file": "images/fish/wels.jpg?v=2",
    "cutout": true
  },
  "Brachsmen": {
    "file": "images/fish/brachsmen.jpg?v=3",
    "cutout": true
  },
  "Rotauge": {
    "file": "images/fish/rotauge.jpg?v=3",
    "cutout": true
  }
};

// Fischereivorschriften Kanton Zürich, gültig ab 1.1.2026 (Auszug für die Angelfischerei, ALN/FJV)
// sp: Fischart → { min: Mindestmass cm, closed: [[Monat, Tag], [Monat, Tag]] (Monat 1–12), limit: Stück/Tag, protected: true }
window.RULES_ZH = {
  title: "Kanton Zürich – Fischereivorschriften",
  valid: "gültig ab 1.1.2026",
  url: "https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/umwelt-tiere/tiere/fischerei-und-jagd/fischerei/verf%C3%BCgungen/fischereivorschriften_auszug_fuer_die_angelfischerei_202603.pdf",
  all: [
    "Angeln mit der Absicht, die Fische wieder freizulassen, ist verboten (Tierschutzverordnung). Zurücksetzen nur aus ökologischem Grund, z. B. untermassig oder geschont.",
    "Sachkundenachweis (SaNa) nötig für Berechtigungen ab 1 Monat. Patent bzw. Karte und SaNa immer mitführen (physisch oder digital).",
    "Behaltene Fische sofort betäuben und töten. Fische ab 22 cm danach sofort entbluten oder ausnehmen.",
    "Untermassige oder in der Schonzeit gefangene Fische sofort sorgfältig mit nassen Händen zurücksetzen. Hälterung lebender Fische ist verboten.",
    "Nur tote Köderfische, und nur aus dem Gewässer, in dem sie verwendet werden. Köderfischfang für den Eigenbedarf mit Aquarienkescher, Köderfischflasche oder -reuse (täglich kontrollieren, mit Kontaktdaten).",
    "Angelgeräte immer selbst überwachen. 50 m Abstand zu ausgelegten Netzen der Berufsfischer – sie haben Platzvorrecht.",
    "Watschuhe ohne Filzsohlen. Wathosen, Watschuhe und Feumer vor einem Gewässerwechsel vollständig trocknen lassen.",
    "Ganzjährig geschützt: vom Aussterben bedrohte Arten wie Aal, Nase, Bitterling und Bachneunauge sowie Stein- und Dohlenkrebs. Krebsfang nur mit Bewilligung.",
    "Fangstatistik ist Pflicht (verspätet/nicht eingereicht: Fr. 50 Gebühr).",
    "Jugendliche ab dem Jahr, in dem sie 10 werden, mit SaNa. Bis 14 Jahre vom Boot nur mit einer fischereiberechtigten Begleitperson ab 18. Kinder unter 14 dürfen ohne zusätzliche Geräte mithelfen (Fänge in deine Statistik).",
    "Bootsfischerei nur von immatrikulierten Booten. Fischen aus einem Boot, das mit Ruder oder Motor bewegt wird, gilt als Schleppangeln (bei Tag weisser Ball).",
    "Seit 1.4.2025 Schiffsmelde- und Reinigungspflicht: Immatrikulierte Boote brauchen eine gültige Einwasserungsfreigabe für das Gewässer.",
    "Fachanlagen und geschlossene Uferpflanzenbestände (z. B. Schilf) nicht betreten. Fischaufstiegshilfen sind Schongebiet.",
  ],
  sets: {
    zuerichsee: {
      name: "Zürichsee & Obersee",
      scope: "Ausführungsbestimmungen über die Fischerei im Zürichsee und Obersee (gilt auch im SZ- und SG-Teil)",
      sp: {
        Seeforelle: { label: "Forellen", min: 40, closed: [[10, 1], [12, 25]], limit: 4 },
        Bachforelle: { label: "Forellen", min: 40, closed: [[10, 1], [12, 25]], limit: 4 },
        Seesaibling: { min: 25, closed: [[10, 1], [12, 25]], limit: 5 },
        "Äsche": { protected: true, min: 32 },
        Felchen: { label: "Felchenartige", min: 25, closed: [[11, 20], [12, 31]], limit: 10 },
        Hecht: { limit: 5 },
        Egli: { limit: 50 },
      },
      times: "Angeln erlaubt: Sommerzeit 04.00–23.00 Uhr, übrige Zeit 05.00–22.00 Uhr.",
      gear: [
        "Uferfischerei mit Patent: 2 Ruten oder Schnüre (keine zusätzliche Freiangel). Vom stehenden Boot: 3 Ruten. Schleppangeln: 10 Köder.",
        "Bis 5 Köder pro Schnur, höchstens 3 Haken pro Köder. Mehr als ein Köder pro Schnur nur mit Einfachhaken.",
        "Mehrfachhaken (Zwilling, Drilling) nur ohne Widerhaken. Einfachhaken mit Widerhaken nur mit Sachkundenachweis.",
        "Fische dürfen nur in der Mundregion gehakt werden. Lebende Köderfische und Senknetz verboten; Köderfischflasche/-reuse nur mit Patent.",
        "Seitliche Ausleger (Seehunde) höchstens 40 m vom Boot und nur von Sonnenaufgang bis -untergang; unterhalb der Linie Zürichhorn–Wollishofen nur vom 1.11. bis 31.3.",
        "Tiefseeschleike, Downrigger, Unterwasserseehund, Schlüchli: im tiefen Seeteil (zwischen Wädenswil–Männedorf und Tiefenbrunnen–Kilchberg) ausserhalb der 300-m-Uferzone ganzjährig von Sonnenauf- bis -untergang, im übrigen See nur zeitlich eingeschränkt (Anhang III).",
      ],
      free: "Freiangelrecht: Vom Ufer aus ohne Patent mit 1 Rute und 1 Köder an einfachem Haken ohne Widerhaken. Erlaubt sind natürliche Köder, Lebensmittel und Fliegen (bis Hakengrösse 8) mit der Fliegenrute – keine Köderfische.",
      special: [
        "Bachmündungen: Vom 16.11. bis 31.1. ist jede Fischerei im Umkreis von 100 m verboten – Hornbach/Wehrenbach, Dorfbach Küsnacht, Erlenbach und Meilen, Aabach und Meilibach Horgen, Feldbach Hombrechtikon, Linthkanal, Jona, Wagnerbach, Aabach Schmerikon, Spreitenbach, Sarenbach.",
        "Stadt Zürich: Von der Quaibrücke und ihrer Unterführung ist Fischen verboten. Uferfischerei Bürkliplatz (Quaibrücke–Blumenuhr inkl. ZSG-Stege) und Quaibrücke–Badi Utoquai nur 04.00–09.00 Uhr (Sommerzeit) bzw. 05.00–09.00 Uhr. Bootsfischerei bis 100 m oberhalb der Quaibrücke im Sommer nur 04.00–09.30 Uhr.",
        "Schon- und Netzsperrgebiete (Stadt Zürich, Linthkanalmündung) gemäss Anhang der Vorschriften beachten.",
      ],
      permits: [
        ["Seenpatent (Zürich-, Ober-, Greifen-, Pfäffikersee, Ufer)", "Jahr", "160.–", "60.–"],
        ["Patent für einen See (Ufer)", "Jahr", "100.–", "35.–"],
        ["Tagespatent für einen See (Ufer & Boot)", "Tag", "30.–", "12.–"],
        ["Zusatz Boot (zu Jahrespatent)", "Jahr", "160.–", "70.– (ab 14)"],
        ["Zusatz Gast (zu Jahrespatent)", "Jahr", "60.–", "60.–"],
      ],
    },
    kleinseen: {
      name: "Greifensee, Pfäffikersee & Kleinseen",
      scope: "Greifensee, Pfäffikersee sowie Türler-, Katzen-, Hüttner-, Egel-, Lützel-, Bichel-, Mettmenhasli- und Husemersee und Kleingewässer Ossingen",
      sp: {
        Seeforelle: { label: "Bach-/Seeforelle", min: 40, closed: [[10, 1], [12, 25]], limit: 2 },
        Bachforelle: { label: "Bach-/Seeforelle", min: 40, closed: [[10, 1], [12, 25]], limit: 2 },
        Felchen: { min: 25, closed: [[11, 20], [12, 31]], limit: 10 },
        Hecht: { min: 45, closed: [[3, 1], [4, 30]], limit: 5 },
        Zander: { min: 40, closed: [[4, 1], [5, 31]] },
        Egli: { limit: 50 },
        Edelkrebs: { min: 12, closed: [[10, 1], [7, 15]] },
      },
      gear: [
        "Uferfischerei mit Berechtigung: höchstens 2 Ruten oder Handschnüre, nur vom trockenen Ufer (Landen im Wasser stehend erlaubt).",
        "Vom stehenden Boot: 3 Ruten im Greifen-, Pfäffiker-, Türler-, Katzen- und Egelsee, sonst 2.",
        "Schleppangeln: 6 Köder im Greifen-, Pfäffiker- und Türlersee, in den anderen Kleinseen 2.",
        "Bis 5 Köder pro Schnur (mehrere nur mit Einfachhaken), höchstens 3 Haken pro Köder, grundsätzlich ohne Widerhaken. Mit Sachkundeausweis (und Gäste in Begleitung) sind Einzelhaken mit Widerhaken erlaubt.",
        "Erlaubt: Feumer, Echolot, Downrigger, Seehunde u. ä. für die Schleppfischerei.",
      ],
      free: "Freiangelrecht im Greifen-, Pfäffiker- und Türlersee: alle Personen ohne Patent mit 1 Rute vom trockenen Ufer, 1 Köder an einfachem Haken ohne Widerhaken. Natürliche Köder, Lebensmittel und Fliegen (bis Hakengrösse 8) – keine Köderfische.",
      special: ["In den Schutzzonen von Greifen- und Pfäffikersee (auch entlang der Ufer) sind Lagern, Zelten und Campieren verboten."],
      permits: [
        ["Seenpatent (Zürich-, Ober-, Greifen-, Pfäffikersee, Ufer)", "Jahr", "160.–", "60.–"],
        ["Patent für einen See (Ufer)", "Jahr", "100.–", "35.–"],
        ["Tagespatent für einen See (Ufer & Boot)", "Tag", "30.–", "12.–"],
        ["Zusatz Boot (zu Jahrespatent)", "Jahr", "160.–", "70.– (ab 14)"],
      ],
    },
    pacht: {
      name: "Flüsse, Bäche & Pachtgewässer",
      scope: "Alle anderen Pachtgewässer und Gewässer mit Sonderrechten im Kanton Zürich (z. B. Limmat, Rhein, Töss, Sihl, Thur, Reuss – jeweils Zürcher Abschnitt)",
      sp: {
        Bachforelle: { label: "Forellen", min: 28, closed: [[10, 16], [3, 15]] },
        Seeforelle: { label: "Forellen", min: 28, closed: [[10, 16], [3, 15]] },
        "Äsche": { min: 35, closed: [[2, 1], [4, 30]] },
        Felchen: { min: 25, closed: [[11, 20], [12, 31]] },
        Hecht: { min: 45, closed: [[3, 1], [4, 30]] },
        Zander: { min: 40, closed: [[4, 1], [5, 31]] },
        Barbe: { min: 30 },
        Edelkrebs: { min: 12, closed: [[10, 1], [7, 15]] },
      },
      minTable: {
        head: ["", "F-Revier", "G-Revier", "B-Revier", "Rhein"],
        rows: [["Forelle", 28, 25, 25, 35], ["Äsche", 35, 35, "–", 35], ["Felchen", 25, 25, "–", 25], ["Hecht", 45, 45, "–", 45], ["Zander", 40, 40, "–", 40], ["Barbe", 30, 30, "–", 30], ["Edelkrebs", 12, 12, 12, 12]],
        note: "F = Flussrevier, G = Forellengewässer mit gemischtem Bestand/Weiher, B = Bach mit vorwiegend Forellen. Die Kategorie steht im Revierverzeichnis bzw. auf deiner Fischereikarte.",
      },
      gear: [
        "1 Angelrute mit 1 Köder – vom Ufer, watend oder vom Boot (wo Boote erlaubt sind). Mit künstlichen Fliegen oder Nymphen 2 Köder.",
        "Im Rhein und in der Limmat sind 2 Ruten erlaubt.",
        "In Fliessgewässern der Kategorien G und B nur während der Forellensaison fischen. Weiher dürfen ganzjährig befischt werden.",
        "Fischaufstiegshilfen (Fischpässe, Umgehungsgewässer) dürfen nicht befischt werden.",
        "Pächter dürfen mit Zustimmung der FJV strengere Regeln erlassen – Bestimmungen auf der Karte beachten.",
      ],
      special: ["Fischen nur mit gültiger Fischereikarte (Angler-, Gäste-, Jugend- oder Tageskarte des Pachtreviers). Die Tageskarte kostet Fr. 30."],
      permits: [
        ["Flusspatent Rhein 32 (inkl. Boot) & Limmat 358 (Ufer)", "Jahr", "170.–", "60.–"],
        ["Flusspatent Rhein 32 & Limmat 358", "Tag", "30.–", "12.–"],
        ["Tageskarte Pachtrevier", "Tag", "30.–", ""],
      ],
    },
  },
  rhein: { Bachforelle: 35, Seeforelle: 35 },
  kleinseen: ["greifensee", "pfäffikersee", "pfaffikersee", "türlersee", "turlersee", "katzensee", "hüttnersee", "huttnersee", "egelsee", "lützelsee", "lutzelsee", "bichelsee", "mettmenhaslisee", "husemersee"],
};
