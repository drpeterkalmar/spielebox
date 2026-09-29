// Web Worker: Übungs-Bots rechnen hier, damit die Oberfläche flüssig bleibt.
import { chooseMove as muehle } from './games/muehle/bot.js';
import { chooseMove as dame } from './games/dame/bot.js';
import { chooseMove as schach } from './games/schach/bot.js';
import { chooseMove as schnapsen } from './games/schnapsen/bot.js';
import { chooseMove as backgammon } from './games/backgammon/bot.js';
import { chooseMove as blackjack } from './games/blackjack/bot.js';
import { chooseMove as halma } from './games/halma/bot.js';

const BOTS = { muehle, dame, schach, schnapsen, backgammon, blackjack, halma };
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
