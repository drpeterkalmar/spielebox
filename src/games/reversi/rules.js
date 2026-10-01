// Reversi – Spielregeln als reine Daten (ohne DOM) für die Regel-Ansicht.
export const RULES = {
  title: 'Reversi',
  source: 'World Othello Federation, Official Rules (https://www.worldothello.org/about/about-othello/othello-rules/official-rules/english); ' +
    'de.wikipedia „Othello (Spiel)“ (https://de.wikipedia.org/wiki/Othello_(Spiel))',
  items: [
    'Gespielt wird zu zweit auf einem Brett mit 8 × 8 Feldern. Jeder Stein ist auf einer Seite schwarz und auf der anderen weiß.',
    'Am Anfang liegen vier Steine in der Mitte: Weiß auf d4 und e5, Schwarz auf d5 und e4.',
    'Schwarz beginnt, danach wird abwechselnd gesetzt.',
    'Du setzt einen Stein so, dass gegnerische Steine in einer geraden Linie zwischen deinem neuen Stein und einem anderen deiner Steine eingeschlossen sind – waagerecht, senkrecht oder schräg.',
    'Alle eingeschlossenen gegnerischen Steine werden auf deine Farbe umgedreht, auch in mehreren Richtungen gleichzeitig.',
    'Ein Stein darf nur dort hin, wo er mindestens einen gegnerischen Stein umdreht.',
    'Kannst du nirgends setzen, musst du passen. Passen darfst du nur, wenn du wirklich keinen Zug hast.',
    'Kann keiner von beiden mehr setzen (zum Beispiel weil das Brett voll ist), ist die Partie zu Ende.',
    'Wer dann mehr Steine seiner Farbe auf dem Brett hat, gewinnt. Gleich viele Steine sind ein Unentschieden.',
    'Tipp: Ecken können nie mehr umgedreht werden. Die Felder direkt neben einer leeren Ecke sind gefährlich.',
  ],
  options: {},
};
