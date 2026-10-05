// Web Worker: Übungs-Bots rechnen hier, damit die Oberfläche flüssig bleibt.
import { BOTS, TIME } from './games/bots.js';
import { evalPosition } from './evalpos.js';

self.onmessage = (e) => {
  const { id, game, gs, level, evalSeat } = e.data;
  try {
    if (evalSeat !== undefined) { self.postMessage({ id, move: evalPosition(game, gs, evalSeat) }); return; }
    const move = BOTS[game](gs, { level, timeMs: TIME[level] || 400 });
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
