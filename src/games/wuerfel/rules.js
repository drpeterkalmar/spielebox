// Spielregeln Würfelglück als reine Daten (ohne DOM) für die Regel-Anzeige.
export const RULES = {
  title: 'Würfelglück',
  source: 'Offizielle Spielanleitung von Schmidt Spiele (Ausgabe 49203, Grundregel und Meisterschaftsregel): ' +
    'https://www.schmidtspiele.de/files/Produkte/4/49203%20-%20Kniffel%C2%AE/49203_Kniffel_DE.pdf ' +
    '· ergänzend https://de.wikipedia.org/wiki/Kniffel',
  items: [
    'Ihr spielt mit fünf Würfeln. Jeder hat eine Spalte auf dem Block mit 13 Feldern.',
    'Wer dran ist, darf bis zu dreimal würfeln. Beim ersten Mal würfelst du mit allen fünf Würfeln.',
    'Würfel, die du behalten willst, tippst du an. Dann würfelst du nur mit den anderen weiter.',
    'Vorher behaltene Würfel darfst du beim nächsten Wurf auch wieder mitwürfeln.',
    'Spätestens nach dem dritten Wurf trägst du dein Ergebnis in genau ein freies Feld ein.',
    'Oben (Einser bis Sechser) zählen nur die Würfel mit dieser Zahl. Drei Fünfen bei den Fünfern geben 15 Punkte.',
    'Hast du oben zusammen mindestens 63 Punkte, bekommst du 35 Punkte Bonus.',
    'Dreierpasch: mindestens drei gleiche. Viererpasch: mindestens vier gleiche. Es zählen alle Augen des Wurfs.',
    'Full House: drei gleiche und zwei andere gleiche, zum Beispiel 4-4-4-1-1. Das gibt 25 Punkte.',
    'Kleine Straße: vier Zahlen in Folge, zum Beispiel 1-2-3-4. Das gibt 30 Punkte.',
    'Große Straße: fünf Zahlen in Folge, also 1-2-3-4-5 oder 2-3-4-5-6. Das gibt 40 Punkte.',
    'Fünferpasch: fünf gleiche Würfel. Das gibt 50 Punkte.',
    'Chance: Hier passt jeder Wurf. Es zählen alle Augen.',
    'Passt dein Wurf in kein freies Feld, musst du ein Feld streichen. Dort steht dann eine 0.',
    'Nach 13 Runden sind alle Felder voll. Wer die meisten Punkte hat, gewinnt.'
  ],
  options: {
    players: 'Ein bis sechs Spieler. Allein spielst du auf möglichst viele Punkte.',
    joker: 'Weiterer Fünferpasch (wenn dein Fünferpasch-Feld schon 50 Punkte hat): ' +
      'Grundregel der Anleitung (bei uns Standard): 50 Extrapunkte, und du darfst in ein beliebiges freies Feld ' +
      'die höchste Punktzahl dieses Felds eintragen. ' +
      'Meisterschaftsregel: 50 Extrapunkte, der Wurf kommt normal in ein passendes Feld (oben nur bei seiner Zahl, ' +
      'Dreierpasch, Viererpasch oder Chance); ist keins frei, streichst du ein Feld. ' +
      'Aus: kein Extra, der Wurf zählt ganz normal.',
    freiStreichen: 'Meisterschaftsregel: Du darfst jederzeit ein beliebiges freies Feld streichen, auch wenn dein ' +
      'Wurf woanders Punkte bringen würde. Aus (Grundregel der Anleitung): Streichen geht nur, wenn kein freies Feld passt.'
  }
};
