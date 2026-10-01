// Spielregeln Ludo als reine Daten (ohne DOM) für die Regel-Anzeige.
export const RULES = {
  title: 'Ludo',
  source: 'Offizielle Spielanleitung von Schmidt Spiele (Standardausgabe): ' +
    'https://www.schmidtspiele.de/files/Produkte/4/49020%20-%20Standardausgabe/49020_49021_Mensch_aergere_Dich_nicht_DE.pdf ' +
    '· ergänzend https://de.wikipedia.org/wiki/Mensch_%C3%A4rgere_Dich_nicht',
  items: [
    'Jeder hat vier Figuren einer Farbe. Eine steht schon auf dem Startfeld, drei warten im Haus.',
    'Wer dran ist, würfelt einmal und zieht eine Figur so viele Felder weiter, wie der Würfel zeigt.',
    'Aus dem Haus kommt eine Figur nur mit einer 6. Sie kommt dann auf das Startfeld deiner Farbe.',
    'Mit einer 6 musst du eine Figur aus dem Haus holen, solange noch eine drin ist und dein Startfeld frei ist.',
    'Solange noch Figuren im Haus warten, muss die Figur auf deinem Startfeld weiterziehen, sobald sie kann.',
    'Nach einer 6 darfst du noch einmal würfeln.',
    'Andere Figuren darfst du überspringen. Die Felder werden aber mitgezählt.',
    'Landest du genau auf einer fremden Figur, schlägst du sie: Sie muss zurück ins Haus.',
    'Auf einem Feld darf immer nur eine Figur stehen. Auf eine eigene Figur darfst du nicht ziehen.',
    'Nach einer ganzen Runde geht es in die vier Zielfelder deiner Farbe. Auch sie werden einzeln gezählt.',
    'Ins Ziel kommst du nur mit der passenden Zahl. Über das letzte Zielfeld hinaus geht es nicht.',
    'Kannst du mit deinem Wurf nicht ziehen, ist der Nächste dran.',
    'Wer zuerst alle vier Figuren im Ziel hat, gewinnt.'
  ],
  options: {
    players: 'Zwei, drei oder vier Spieler. Zu zweit spielt ihr mit zwei Farben, die sich gegenüber sitzen.',
    dreimal: 'Hausregel aus der Anleitung (bei uns an): Hast du keine Figur auf der Bahn, darfst du dreimal würfeln, ' +
      'um eine 6 zu bekommen. Das gilt nur, wenn deine Figuren im Ziel nicht mehr weiterrücken können.',
    schlagpflicht: 'Hausregel: Kannst du eine fremde Figur schlagen, musst du das tun.',
    startfigur: 'Wie in der Anleitung steht am Anfang eine Figur auf dem Startfeld. Aus: Alle vier Figuren beginnen im Haus.',
    zielspringen: 'Wie in der Anleitung darfst du im Ziel über eigene Figuren springen. ' +
      'Aus (Hausregel): Im Ziel darf keine Figur übersprungen werden.'
  }
};
