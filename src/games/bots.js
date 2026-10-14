// Computer-Gegner je Spiel und Rechenzeit je Stufe – gemeinsam für Hauptthread (botclient.js) und Worker (botworker.js).
// Ein Bot wird erst beim ersten Bedarf geladen (import()), nicht beim App-Start.
import { overlook } from './fehler.js';
const IDS = new Set(['muehle', 'dame', 'schach', 'schnapsen', 'backgammon', 'blackjack', 'halma', 'ludo', 'schiffe', 'vier', 'maumau', 'wuerfel', 'reversi', 'paare', 'holdem']);
export const TIME = { 1: 150, 2: 400, 3: 1200 };

const cache = {};

// liefert chooseMove(gs, { level, timeMs, fehler, … }) des Spiels; Stufe 1 übersieht mit fehler einen Schlag (fehler.js)
export function loadBot(id) {
  if (!IDS.has(id)) return Promise.reject(new Error('Unbekanntes Spiel ' + id));
  return (cache[id] ||= Promise.all([import(`./${id}/bot.js`), import(`./${id}/engine.js`)])
    .then(([m, E]) => (gs, opts = {}) => overlook(id, E, gs, m.chooseMove(gs, opts), opts), (e) => { delete cache[id]; throw e; }));
}
