// Spielspezifische Teile der Tisch-Ansicht: je Spiel in src/games/<id>/ui.js (Symbol je Sitz, Unterzeile, Hinweise,
// Knöpfe, Menü, Regeln, Mini-Brett, Registry-Eintrag ui). Hier nur der Verteiler, der das Brett (view.js) dazugibt –
// die Ansicht wird erst bei Bedarf geladen (prepareGame); bis dahin ist board null. So bleibt tablescreen.js für alle
// Spiele gleich.
import { gameOf, loadView, viewOf } from '../games/registry.js';
export { SEAT_COLORS, SEAT_SYMBOLS } from './seatcolors.js';

const cache = {};

export function gameUi(id) {
  if (cache[id]) return cache[id];
  const v = viewOf(id);
  const ui = { ...gameOf(id).ui, board: v ? v.createBoard : null };
  if (v) cache[id] = ui;
  return ui;
}

// Ansicht eines Spiels laden (vor dem Öffnen eines Tisches bzw. beim Spielwechsel)
export function prepareGame(id) {
  return loadView(id);
}
