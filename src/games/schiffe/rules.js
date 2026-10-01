// Spielregeln Schiffe versenken (reine Daten, ohne DOM)
export const RULES = {
  title: 'Schiffe versenken',
  source: 'Wikipedia: Schiffe versenken – https://de.wikipedia.org/wiki/Schiffe_versenken (abgerufen 01.10.2026)',
  items: [
    'Jeder hat ein Meer mit 10 × 10 Feldern: Zeilen A bis J, Spalten 1 bis 10.',
    'Zuerst versteckt jeder seine Flotte. Der andere darf nicht hinschauen.',
    'Schiffe liegen gerade: waagrecht oder senkrecht, nie schräg und nie um die Ecke.',
    'Schiffe dürfen sich nicht berühren – auch nicht an den Ecken. Am Rand dürfen sie liegen.',
    'Dann schießt ihr abwechselnd: Du nennst ein Feld, zum Beispiel „B7“.',
    'Die Antwort ist „Wasser“, „Treffer“ oder „Treffer, versenkt“.',
    'Ein Schiff ist versenkt, wenn alle seine Felder getroffen sind. Dann sieht man, wo es lag.',
    'Rund um ein versenktes Schiff ist nur Wasser – dort musst du nicht mehr hinschießen.',
    'Wer zuerst alle Schiffe des anderen versenkt, gewinnt.',
    'Kleine Flotte: Flugzeugträger (5), Schlachtschiff (4), Zerstörer (3), U-Boot (3), Schnellboot (2).',
    'Große Flotte: 1 Schlachtschiff (5), 2 Kreuzer (4), 3 Zerstörer (3), 4 U-Boote (2).'
  ],
  options: {
    flotte: 'Kleine Flotte mit 5 Schiffen (17 Felder, kürzere Partie) oder große Flotte mit 10 Schiffen (30 Felder, wie in der Quelle).',
    beruehren: 'Hausregel: Schiffe dürfen sich berühren. Dann ist das Feld neben einem versenkten Schiff nicht mehr sicher Wasser.',
    nochmal: 'Wer trifft, darf gleich noch einmal schießen – so lange, bis er ins Wasser trifft (Variante aus der Quelle).'
  }
};
