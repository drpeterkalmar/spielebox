// Hold'em-Hilfe: kurze Regel-Karte mit Hand-Rangliste (Kartenbilder) und „Wie setze ich?“ in einfacher Sprache.
// Hinweis: nur Spielchips, kein Geld. (DOM, wird von Lobby und Tisch-Menü benutzt.)
import { h } from '../../ui/dom.js';
import { HANDS_PER_LEVEL, fmtChips } from './engine.js';

const RANKING = [
  ['Royal Flush', 'Zehn bis Ass in einer Farbe', ['AH', 'KH', 'QH', 'JH', 'TH']],
  ['Straight Flush', 'Fünf in Folge, alle in einer Farbe', ['9S', '8S', '7S', '6S', '5S']],
  ['Vierling', 'Vier gleiche Werte', ['QC', 'QD', 'QH', 'QS', '4D']],
  ['Full House', 'Drilling und Paar', ['8S', '8H', '8C', 'KD', 'KC']],
  ['Flush', 'Fünf Karten einer Farbe', ['AD', 'JD', '9D', '6D', '3D']],
  ['Straße', 'Fünf Werte in Folge (auch A-2-3-4-5)', ['TC', '9H', '8S', '7D', '6C']],
  ['Drilling', 'Drei gleiche Werte', ['7H', '7S', '7D', 'KC', '2S']],
  ['Zwei Paare', 'Zweimal zwei gleiche', ['JS', 'JC', '4H', '4D', 'AS']],
  ['Paar', 'Zwei gleiche Werte', ['TH', 'TD', 'KS', '6C', '3H']],
  ['Höchste Karte', 'Nichts davon – die höchste Karte zählt', ['AC', 'QD', '8H', '5S', '2C']]
];

const hiDpi = () => typeof devicePixelRatio === 'number' && devicePixelRatio >= 1.5;
const cardImg = (c) => h('img', { class: 'he-rank-card', src: `assets/cards/fr/${c}${hiDpi() ? '@2x' : ''}.webp`, alt: c, width: 34, height: 49 });

export function handRanking() {
  return h('ol', { class: 'he-ranking', data: { ranking: '' } }, ...RANKING.map(([name, sub, cards]) =>
    h('li', {}, h('div', { class: 'he-rank-cards' }, ...cards.map(cardImg)),
      h('div', { class: 'he-rank-t' }, h('strong', { text: name }), h('span', { text: sub })))));
}

const ul = (...items) => h('ul', {}, ...items.map((t) => h('li', {}, t)));

export function rulesHoldem(opts = null) {
  const o = opts || {};
  const per = HANDS_PER_LEVEL[o.blinds || 'normal'];
  return h('div', { class: 'rules' },
    h('h3', { text: "Texas Hold'em" }),
    h('p', { class: 'he-note', text: 'Nur Spielchips – kein Geld, keine Käufe. Wer keine Chips mehr hat, schaut zu.' }),
    ul(
      `Alle beginnen mit gleich vielen Chips${o.start ? ` (${fmtChips(o.start)})` : ''}. Gewonnen hat, wer am Ende alle Chips hat.`,
      'Jeder bekommt zwei Karten, die nur er sieht. In die Mitte kommen nacheinander fünf offene Karten für alle: erst drei (Flop), dann eine (Turn), dann noch eine (River).',
      'Aus deinen zwei Karten und den fünf in der Mitte zählen die besten fünf. Wer am Ende die beste Hand hat, bekommt den Pot (alle Chips in der Mitte).',
      'Vor den Karten setzen die zwei Spieler links vom Dealer-Knopf (D) Pflicht-Einsätze: den kleinen und den großen Blind. Der Knopf wandert jede Hand einen Platz weiter.',
      per === Infinity ? 'Die Blinds bleiben gleich.' : `Alle ${per} Hände steigen die Blinds – so endet das Spiel irgendwann.`
    ),
    h('h4', { text: 'Wie setze ich?' }),
    ul(
      'Checken: nichts setzen und weitergeben – geht nur, wenn noch niemand gesetzt hat.',
      'Mitgehen: so viel nachlegen, wie der Höchste gesetzt hat (der Knopf zeigt den Betrag).',
      'Setzen / Erhöhen: mehr setzen – mindestens so viel wie die letzte Erhöhung (am Anfang ein großer Blind). Mit dem Regler oder ½ Pot, ¾ Pot, Pot wählen.',
      'All-in: alle eigenen Chips setzen. Wer All-in ist, kann nur noch den Teil gewinnen, den er selbst bezahlt hat (Side-Pot).',
      'Aussteigen: die Karten weglegen – dann ist die Hand für dich vorbei und deine gesetzten Chips bleiben im Pot.',
      'Am Schluss werden die Karten aufgedeckt. Wer nicht mehr gewinnen kann, darf seine Karten verdeckt lassen. Gleich gute Hände teilen den Pot.',
      'Tipp: Solange du nicht dran bist, kannst du vorab „Check/Fold“ oder „Call jeden Betrag“ antippen.'
    ),
    h('h4', { text: 'Welche Hand ist besser?' }),
    handRanking(),
    h('p', { class: 'muted small', text: 'Online hat jeder eine Bedenkzeit; wer nicht handelt oder die Verbindung verliert, checkt bzw. steigt automatisch aus, bis er wieder da ist. Gemischt wird fair: Jede Mischung lässt sich nach der Hand prüfen („✓ fair gemischt“).' }),
    h('p', { class: 'muted small', text: 'Regeln: No-Limit Hold\'em nach den üblichen Turnierregeln (TDA). Kleine Vereinfachungen: Der Knopf geht immer zum nächsten Spieler mit Chips; aussteigen geht nur, wenn man etwas zahlen müsste.' }));
}
