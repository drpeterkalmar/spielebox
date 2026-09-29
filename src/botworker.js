// Web Worker: Übungs-Bots rechnen hier, damit die Oberfläche flüssig bleibt.
import { chooseMove as muehle } from './games/muehle/bot.js';
import { chooseMove as dame } from './games/dame/bot.js';
import { chooseMove as schach } from './games/schach/bot.js';

const BOTS = { muehle, dame, schach };
const TIME = { 1: 150, 2: 400, 3: 1200 };

self.onmessage = (e) => {
  const { id, game, gs, level } = e.data;
  try {
    const move = BOTS[game](gs, { level, timeMs: TIME[level] || 400 });
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
