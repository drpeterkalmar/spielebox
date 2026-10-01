// Spielregeln Paare finden (reine Daten, ohne DOM)
export const RULES = {
  title: 'Paare finden',
  source: 'de.wikipedia „Memory (Spiel)“: https://de.wikipedia.org/wiki/Memory_(Spiel)',
  items: [
    'Alle Karten liegen verdeckt. Jedes Tierbild gibt es genau zweimal.',
    'Wer dran ist, dreht zwei Karten um – eine nach der anderen.',
    'Zwei gleiche Bilder sind ein Paar: Du bekommst es und darfst gleich noch einmal.',
    'Zwei verschiedene Bilder: Alle schauen gut hin! Dann werden sie wieder umgedreht und der Nächste ist dran.',
    'Die beiden falschen Karten bleiben offen, bis der Nächste seine erste Karte umdreht.',
    'Wenn alle Paare gefunden sind, gewinnt, wer die meisten hat. Allein spielst du gegen die Zahl der Züge.'
  ],
  options: {
    paare: '8 Paare (4 × 4), 12 Paare (4 × 6) oder 18 Paare (6 × 6).',
    players: 'Ein bis vier Spieler.'
  }
};
