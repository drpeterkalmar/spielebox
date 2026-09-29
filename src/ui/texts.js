// Hilfetexte: Regeln, Datenschutz, Credits (Deutsch, kurz)
import { h } from './dom.js';

const ul = (...items) => h('ul', {}, ...items.map((t) => h('li', {}, t)));

export function rulesMuehle() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Mühle' }),
    ul(
      'Jeder hat 9 Steine, Weiß beginnt. Zuerst setzt ihr abwechselnd je einen Stein auf einen freien Punkt.',
      'Danach zieht ihr: einen eigenen Stein entlang einer Linie auf den freien Nachbarpunkt.',
      'Drei eigene Steine in einer Reihe sind eine Mühle. Wer eine Mühle schließt, nimmt dem Gegner einen Stein – nicht aus einer geschlossenen Mühle, außer alle seine Steine stehen in Mühlen. Auch bei einer Doppelmühle nur einen.',
      'Wer nur noch 3 Steine hat, darf springen: auf jeden freien Punkt.',
      'Verloren hat, wer weniger als 3 Steine hat oder nicht mehr ziehen kann.',
      'Remis bei dreifacher Stellungswiederholung. Hausregel gegen endlose Partien: 50 Züge je Spieler ohne Mühle sind ebenfalls Remis.'
    ));
}

export function rulesDame() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Dame' }),
    h('p', { text: 'Gespielt wird nur auf den dunklen Feldern. Weiß beginnt.' }),
    h('h4', { text: 'Deutsch (8×8, 12 Steine)' }),
    ul(
      'Ein Stein zieht ein Feld schräg vorwärts und schlägt nur vorwärts: über einen gegnerischen Stein auf das freie Feld dahinter.',
      'Schlagzwang, bei mehreren Möglichkeiten freie Wahl. Mehrfachsprünge müssen zu Ende geschlagen werden; geschlagene Steine verschwinden erst nach dem Zug und dürfen nicht zweimal übersprungen werden.',
      'Wer die gegnerische Grundlinie erreicht, wird Dame – das beendet den Zug.',
      'Die Dame zieht beliebig weit schräg vor und zurück, schlägt einzeln stehende Steine auf Distanz und landet direkt dahinter.'
    ),
    h('h4', { text: 'International (10×10, 20 Steine)' }),
    ul(
      'Steine schlagen auch rückwärts.',
      'Fliegende Dame: Sie darf beliebig weit hinter dem geschlagenen Stein landen.',
      'Mehrheits-Schlagzwang: Es muss die Folge mit den meisten geschlagenen Steinen gewählt werden (Dame und Stein zählen gleich).',
      'Dame wird ein Stein nur, wenn sein Zug auf der Grundlinie endet.'
    ),
    h('h4', { text: 'Hausregeln (Schalter)' }),
    ul(
      'Kurze Dame: Die Dame zieht und schlägt nur ein Feld weit (so beschreibt es strategy-games.de für die deutsche Regel; die Quellen widersprechen sich).',
      'Pusten statt Schlagzwang: Schlagen ist freiwillig. Wer aber nicht schlägt, obwohl er könnte, dem darf der Gegner vor seinem Zug einen der Steine wegpusten, die hätten schlagen können.'
    ),
    h('h4', { text: 'Ende' }),
    ul(
      'Wer keine Steine oder keinen Zug mehr hat, verliert.',
      'Remis bei dreifacher Wiederholung oder wenn 25 Züge je Seite nur Damen ziehen, ohne zu schlagen.'
    ));
}

export function rulesSchach() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Schach' }),
    ul(
      'Die üblichen Schachregeln (FIDE). Weiß beginnt. Tippe eine Figur an, die erlaubten Felder werden markiert.',
      'Rochade: König zwei Felder Richtung Turm ziehen (oder nach dem König den eigenen Turm antippen). En passant und Umwandlung gehen ebenfalls per Tipp; bei der Umwandlung wählst du die Figur direkt auf dem Brett.',
      'Die Partie endet mit Schachmatt, Aufgeben oder Remis: Patt, zu wenig Material, 50 Züge ohne Bauernzug und ohne Schlag, dreifache Stellungswiederholung (diese Remis werden automatisch erkannt) oder Remis nach Angebot.',
      'Im Menü kannst du die Partie als PGN teilen – das lesen alle Schachprogramme (z. B. Lichess-Analyse).',
      'Der Computer (3 Stufen) ist ein Übungsgegner ohne Eröffnungsbuch.'
    ));
}

export function rulesSchnapsen(o = {}) {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Schnapsen' }),
    h('p', { text: 'Österreichische Standardregel (de.wikipedia „Schnapsen“), 20 Blatt doppeldeutsch.' }),
    ul(
      'Karten und Augen: Daus 11, Zehner 10, König 4, Ober 3, Unter 2 – zusammen 120 Augen. Ziel: als Erster 66 Augen und ausmelden.',
      'Teilen: Die Vorhand bekommt 3 Karten, dann der Teiler 3, die 7. Karte wird aufgeschlagen und ist Atout, dann je 2. Der Rest ist der Talon. Der Teiler wechselt jedes Spiel.',
      'Solange der Talon offen ist, gibt es weder Farb- noch Stichzwang. Nach jedem Stich heben beide eine Karte, der Stichgewinner zuerst und spielt wieder aus.',
      'Ist der Talon aufgebraucht oder zugedreht: Farbzwang vor Stichzwang – Farbe bedienen und wenn möglich überstechen; kann man nicht bedienen, muss man mit Atout stechen.',
      'Ansagen: König + Ober einer Farbe darf ansagen, wer ausspielt – 20 Augen, in Atout 40. Eine der beiden Karten wird sofort ausgespielt. Die Augen zählen erst, wenn man mindestens einen Stich hat.',
      'Austauschen: Wer den Atout-Unter hat und ausspielt, darf ihn gegen die offene Atoutkarte tauschen – auch bei nur noch einer Talonkarte (Schalter „hart“: dann nicht mehr).',
      'Zudrehen: Wer ausspielt, darf den Talon schließen (nicht bei nur einer Talonkarte). Ab dann Farb- und Stichzwang. Schafft der Zudreher die 66 nicht, bekommt der Gegner 2 Punkte, oder 3, wenn er beim Zudrehen noch stichlos war.',
      'Ausmelden ab 66 Augen: 3 Punkte, wenn der Gegner stichlos ist, 2 bei höchstens 32 Augen des Gegners, sonst 1. Wer sich irrtümlich ausmeldet, verliert das Spiel; der Gegner bekommt die Punkte, die man selbst bekommen hätte (so im Wikipedia-Artikel). Der Knopf „Ausmelden“ erscheint deshalb nur ab 66.',
      'Meldet sich niemand aus, gewinnt der letzte Stich (nicht nach Zudrehen) – gewertet nach den Augen des Gegners.',
      'Bummerl: Wer zuerst 7 Punkte hat, gewinnt ein Bummerl. Schalter „Schneider-Bummerl doppelt“: 7:0 zählt zwei Bummerl. Die Partie geht auf 2 oder 3 Bummerl.',
      'Wie am echten Tisch siehst du nur deine eigenen Augen; vom Gegner nur, ob er schon einen Stich hat.'
    ));
}

export function rulesBackgammon() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Backgammon' }),
    ul(
      'Standardregeln. Weiß zieht von Punkt 24 zu Punkt 1, Schwarz umgekehrt. Wer zuerst alle 15 Steine abgetragen hat, gewinnt.',
      'Eröffnung: Jeder würfelt einen Würfel, der Höhere beginnt und zieht mit beiden Zahlen. Pasch = vier Züge.',
      'Pflicht: So viele Würfel wie möglich nutzen. Geht nur einer der beiden, muss es – wenn möglich – der höhere sein.',
      'Ein einzelner Stein (Blot) kann geschlagen werden und muss von der Bar wieder einwürfeln, bevor irgendein anderer Stein zieht.',
      'Abtragen erst, wenn alle eigenen Steine im Heimfeld sind; mit einer höheren Zahl vom höchsten besetzten Punkt, wenn dort, wo die Zahl hinzeigt, und darüber nichts steht.',
      'Verdopplungswürfel (abschaltbar): Vor dem Würfeln darf verdoppeln, wer den Würfel hat (am Anfang beide). Der Gegner nimmt an (er besitzt dann den Würfel) oder gibt auf und verliert den bisherigen Wert.',
      'Wertung: einfacher Sieg ×1, Gammon (Gegner hat nichts abgetragen) ×2, Backgammon (dazu noch Steine auf der Bar oder im Heimfeld des Siegers) ×3 – jeweils mal Würfelwert.',
      'Bedienung: Stein antippen, erlaubte Ziele leuchten, Ziel antippen. „Zurück“ nimmt Teilzüge im eigenen Wurf zurück, „Fertig“ schickt den Zug ab.',
      'Online wird fair gewürfelt: Jeder Würfel entsteht aus geheimen, vorher festgelegten Hash-Ketten beider Spieler – niemand kann Würfe steuern, jeder Wurf wird geprüft.'
    ));
}

export function rulesBlackjack() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Blackjack (Bank reihum)' }),
    ul(
      'Gespielt wird um Bohnen, kein Geld. Jeder beginnt mit 100 Bohnen. Einer ist Bank und spielt automatisch: zieht bis 16, steht ab 17 (auch „weiche“ 17).',
      'Die Bank wechselt alle 5 Runden zum nächsten Platz (Schalter: wer Black Jack hat, wird Bank). Die Partie endet, wenn jeder einmal Bank war; es gewinnt, wer die meisten Bohnen hat.',
      'Schuh aus 2 Kartenspielen, neu gemischt, wenn weniger als ein Viertel übrig ist.',
      'Ass zählt 1 oder 11, Bilder 10. Black Jack (Ass + Zehnerwert mit den ersten 2 Karten) zahlt 3:2, sonst zahlt ein Sieg 1:1, Gleichstand gibt den Einsatz zurück.',
      'Ziehen, Stehen, Verdoppeln (auf die ersten 2 Karten: doppelter Einsatz, genau eine Karte), einmal Teilen (zwei gleiche Karten; geteilte Asse bekommen je eine Karte). Keine Versicherung.',
      'Hat die Bank Black Jack, deckt sie sofort auf: alle verlieren ihren Einsatz, außer wer selbst Black Jack hat.',
      'Die Bank zahlt aus ihren eigenen Bohnen; die Einsätze sind so begrenzt, dass sie immer zahlen kann.'
    ));
}

export function rulesHalma(blockText = '') {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Stern-Halma' }),
    ul(
      'Sternbrett mit 121 Löchern, 2, 3, 4 oder 6 Spieler mit je 10 Steinen. Ziel: alle Steine in die gegenüberliegende Zacke bringen.',
      'Ein Zug ist entweder ein Schritt auf ein freies Nachbarloch oder eine Sprungkette: über einen direkt benachbarten Stein (egal welcher Farbe) auf das freie Loch dahinter, beliebig oft hintereinander, kein Loch zweimal. Geschlagen wird nicht.',
      'Bedienung: Stein antippen – alle erreichbaren Löcher leuchten, auch die Enden langer Sprungketten. Ziel antippen, der Stein springt die Kette Sprung für Sprung ab. Ein Tipp trifft immer den nächsten sinnvollen Stein bzw. das nächste erlaubte Ziel; „Lupe“ vergrößert das Brett.',
      blockText || 'Blockade-Regel: Ist deine Zielzacke vollständig besetzt und steht mindestens einer deiner Steine darin, hast du gewonnen.',
      'Wer zuerst fertig ist, gewinnt. Gegen endlose Partien: Nach 200 Zügen je Spieler gewinnt der kürzeste Restweg.'
    ));
}

export function helpNet() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'So funktioniert der Tisch' }),
    ul(
      'Wer einen Tisch aufmacht, bekommt drei Wörter. Die Reihenfolge ist egal. Der Mitspieler tippt sie unter „Beitreten“ ein – oder öffnet den geteilten Link.',
      'Es gibt keinen Server und kein Konto. Die Geräte verbinden sich direkt (WebRTC). Klappt das nicht, laufen die Züge verschlüsselt über öffentliche Nostr-Relays.',
      'Datenschutz in einem Satz: Die Relays sehen nur einen Hash der Wörter und verschlüsselte Daten, nie die Wörter, Namen oder Züge im Klartext.',
      'Der Gastgeber ist Schiedsrichter: Sein Gerät prüft jeden Zug. Fällt er aus, übernimmt der Mitspieler.',
      'Tab zu, Akku leer, neu geladen? Einfach dieselben drei Wörter eingeben (oder unter „Weiterspielen“ antippen) – die Partie geht weiter.',
      'Wer keinen Platz mehr bekommt, schaut zu. Freie Plätze kann der Gastgeber mit dem Computer füllen.',
      'Kartenspiele: Jeder bekommt nur seine eigenen Karten geschickt, Zuschauer sehen keine Hand. Ehrliche Grenze: Der Browser des Gastgebers kennt alle Karten (wer technisch versiert ist, könnte sie dort auslesen); läuft die Verbindung über ein Relay, sind die Nachrichten mit einem gemeinsamen Schlüssel aus den 3 Wörtern verschlüsselt. Gedacht für Familie und Freunde.',
      'Fair gemischt und gewürfelt: Jeder Spieler legt sich zu Beginn auf eine geheime Zahlenkette fest. Karten und Würfel ergeben sich aus den Beiträgen aller – niemand, auch nicht der Gastgeber, kann sie steuern. Nach jedem Spiel prüft jedes Gerät das nach (Anzeige „✓ fair gemischt“).'
    ));
}

export function credits() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Credits und Lizenzen' }),
    ul(
      'Programm, Bretter, Steine, Icons und Wortliste: eigene Arbeit (MIT-Lizenz).',
      'Schachfiguren: Colin M. L. Burnett (cburnett), Wikimedia Commons, BSD-3-Clause.',
      'Schachregeln: chess.js 1.4.0 (BSD-2-Clause, Jeff Hlywa).',
      'Schnapskarten: Fotos von Zákupák (Wikimedia Commons, gemeinfrei), von uns entzerrt und zugeschnitten.',
      'Französische Karten: Byron Knoll, „Vector Playing Cards“ (gemeinfrei).',
      'Holztexturen: Poly Haven, CC0 – „Silver Oak Veneer 01“ und „Walnut Veneer“ (Jenelle van Heerden), „Dark Wood“ (Dario Barresi, Dimitrios Savva, Rico Cilliers).',
      'Netz: Trystero 0.25.4 (MIT, Dan Motzenbecker), @noble/secp256k1 (MIT, Paul Miller).',
      'Regelquellen: de.wikipedia „Mühle (Spiel)“, „Dame (Spiel)“, „Schnapsen“, „Halma“, en.wikipedia „Chinese checkers“, strategy-games.de (deutsche Dame), FMJD (internationale Dame), FIDE (Schach).'
    ),
    h('p', {}, 'Alle Details stehen in ', h('a', { href: 'LICENSES.md', target: '_blank', rel: 'noopener', text: 'LICENSES.md' }), '.'));
}
