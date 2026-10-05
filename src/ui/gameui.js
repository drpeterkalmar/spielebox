// Spielspezifische Teile der Tisch-Ansicht: je Spiel in src/games/<id>/ui.js (Symbol je Sitz, Unterzeile, Hinweise,
// Knöpfe, Menü, Regeln, Mini-Brett, Registry-Eintrag ui). Hier nur der Verteiler, der das Brett (view.js) dazugibt.
// So bleibt tablescreen.js für alle Spiele gleich.
import { gameOf } from '../games/registry.js';
import { createBoard as muehle } from '../games/muehle/view.js';
import { createBoard as dame } from '../games/dame/view.js';
import { createBoard as schach } from '../games/schach/view.js';
import { createBoard as schnapsen } from '../games/schnapsen/view.js';
import { createBoard as backgammon } from '../games/backgammon/view.js';
import { createBoard as blackjack } from '../games/blackjack/view.js';
import { createBoard as halma } from '../games/halma/view.js';
import { createBoard as ludo } from '../games/ludo/view.js';
import { createBoard as schiffe } from '../games/schiffe/view.js';
import { createBoard as vier } from '../games/vier/view.js';
import { createBoard as maumau } from '../games/maumau/view.js';
import { createBoard as wuerfel } from '../games/wuerfel/view.js';
import { createBoard as reversi } from '../games/reversi/view.js';
import { createBoard as paare } from '../games/paare/view.js';
import { createBoard as holdem } from '../games/holdem/view.js';
export { SEAT_COLORS, SEAT_SYMBOLS } from './seatcolors.js';

const BOARDS = { muehle, dame, schach, schnapsen, backgammon, blackjack, halma, ludo, schiffe, vier, maumau, wuerfel, reversi, paare, holdem };
const cache = {};

export function gameUi(id) {
  return (cache[id] ||= { ...gameOf(id).ui, board: BOARDS[id] });
}
