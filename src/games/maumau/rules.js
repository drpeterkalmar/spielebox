// Mau-Mau – Spielregeln als reine Daten (ohne DOM) für die Regel-Ansicht.
export const RULES = {
  title: 'Mau-Mau',
  source: 'de.wikipedia „Mau-Mau (Kartenspiel)“ (https://de.wikipedia.org/wiki/Mau-Mau_(Kartenspiel))',
  items: [
    'Gespielt wird mit 32 doppeldeutschen Karten: Herz, Schellen, Laub und Eichel, jeweils Daus (Ass), Zehner, König, Ober, Unter, Neuner, Achter und Siebener.',
    'Jeder bekommt 5 Karten. Eine Karte wird offen hingelegt, der Rest ist der verdeckte Stapel.',
    'Spieler 1 fängt an, dann geht es reihum.',
    'Du legst eine Karte auf die offene Karte, wenn sie die gleiche Farbe oder den gleichen Wert hat.',
    'Kannst oder willst du nicht legen, ziehst du eine Karte. Passt sie, darfst du sie sofort legen – sonst sagst du „passen“ und der Nächste ist dran.',
    'Ist der Stapel leer, werden die abgelegten Karten außer der obersten gemischt und sind der neue Stapel.',
    'Die erste offene Karte am Anfang hat keine Sonderwirkung.',
    'Siebener: Der Nächste muss zwei Karten ziehen. Hat er selbst einen Siebener, darf er ihn drauflegen – dann muss der Übernächste vier ziehen, und so weiter.',
    'Wer die Strafkarten zieht, nimmt alle auf einmal und ist danach fertig.',
    'Unter: Du darfst ihn auf jede Karte legen und wünschst dir eine Farbe. Der Nächste muss diese Farbe legen. Unter auf Unter ist verboten.',
    'Daus: Der Nächste muss aussetzen. Zu zweit bist du also gleich noch einmal dran.',
    'Legst du deine vorletzte Karte, musst du „Mau“ sagen. Vergisst du es, bekommst du zwei Strafkarten.',
    'Wer zuerst keine Karten mehr hat, gewinnt – auch wenn die letzte Karte ein Siebener oder Daus ist.',
  ],
  options: {
    players: 'Zwei bis fünf Spieler.',
    sieben: 'Wie in der Quelle: Siebener heißt zwei Karten ziehen, mit einem Siebener kann man kontern. Aus: Der Siebener ist eine normale Karte.',
    unter: 'Wie in der Quelle: Mit dem Unter wünscht man sich eine Farbe, Unter auf Unter ist verboten. Aus: Der Unter ist eine normale Karte.',
    ass: 'Hausregel (bei uns an): Nach einem Daus muss der Nächste aussetzen. In der Quelle macht das meist die Acht. Aus: Der Daus ist eine normale Karte.',
    mau: 'Wie in der Quelle: Bei der vorletzten Karte muss man „Mau“ sagen, sonst gibt es zwei Strafkarten. Aus: Man muss nichts sagen.',
  },
};
