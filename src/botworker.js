// Web Worker: Übungs-Bots rechnen hier, damit die Oberfläche flüssig bleibt.
import { loadBot, TIME } from './games/bots.js';
import { evalPosition } from './evalpos.js';
import { suggest } from './tipp.js';

// Bot eines Spiels wird erst beim ersten Zug dieses Spiels geladen (import())
self.onmessage = async (e) => {
  const { id, game, gs, level, evalSeat, evalOpts, tipSeat, fehler } = e.data;
  try {
    if (tipSeat !== undefined) { self.postMessage({ id, move: await suggest(game, gs, tipSeat) }); return; }   // n11: Tipp
    if (evalSeat !== undefined) { self.postMessage({ id, move: evalPosition(game, gs, evalSeat, evalOpts || {}) }); return; }
    const move = (await loadBot(game))(gs, { level, timeMs: TIME[level] || 400, fehler });
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
