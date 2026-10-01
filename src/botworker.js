// Web Worker: Übungs-Bots rechnen hier, damit die Oberfläche flüssig bleibt.
import { chooseMove as muehle } from './games/muehle/bot.js';
import { chooseMove as dame } from './games/dame/bot.js';
import { chooseMove as schach } from './games/schach/bot.js';
import { chooseMove as schnapsen } from './games/schnapsen/bot.js';
import { chooseMove as backgammon } from './games/backgammon/bot.js';
import { chooseMove as blackjack } from './games/blackjack/bot.js';
import { chooseMove as halma } from './games/halma/bot.js';
import { chooseMove as ludo } from './games/ludo/bot.js';
import { chooseMove as schiffe } from './games/schiffe/bot.js';
import { chooseMove as vier } from './games/vier/bot.js';
import { chooseMove as maumau } from './games/maumau/bot.js';

import { evalPosition } from './evalpos.js';

const BOTS = { muehle, dame, schach, schnapsen, backgammon, blackjack, halma, ludo, schiffe, vier, maumau };
const TIME = { 1: 150, 2: 400, 3: 1200 };

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
