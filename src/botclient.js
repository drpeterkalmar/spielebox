// Bot-Anbindung: rechnet im Web Worker, sonst (kein Worker möglich) direkt im Hauptthread.
import { chooseMove as muehle } from './games/muehle/bot.js';
import { chooseMove as dame } from './games/dame/bot.js';
import { chooseMove as schach } from './games/schach/bot.js';
import { chooseMove as schnapsen } from './games/schnapsen/bot.js';
import { chooseMove as backgammon } from './games/backgammon/bot.js';
import { chooseMove as blackjack } from './games/blackjack/bot.js';
import { chooseMove as halma } from './games/halma/bot.js';
import { chooseMove as ludo } from './games/ludo/bot.js';

import { evalPosition } from './evalpos.js';

const BOTS = { muehle, dame, schach, schnapsen, backgammon, blackjack, halma, ludo };
const TIME = { 1: 150, 2: 400, 3: 1200 };
let worker = null;
let seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./botworker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error));
      else w.resolve(e.data.move);
    };
    worker.onerror = () => { worker = false; for (const w of waiting.values()) w.fallback(); waiting.clear(); };
  } catch {
    worker = false;
  }
  return worker;
}

export function chooseBotMove(game, gs, level = 2) {
  const direct = () => BOTS[game](gs, { level, timeMs: TIME[level] || 400 });
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(direct()), 0));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject, fallback: () => resolve(direct()) });
    w.postMessage({ id, game, gs, level });
  });
}

// schneller Vorschlag im Hauptthread (Debug/Tests: __box.botMove)
export function quickMove(game, gs, level = 1) {
  return BOTS[game](gs, { level, timeMs: 60 });
}

// Einschätzung „Wer gewinnt?“ (im Worker, sonst direkt)
export function evaluateBoard(game, gs, seat) {
  const w = getWorker();
  if (!w) return Promise.resolve(evalPosition(game, gs, seat));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject, fallback: () => resolve(evalPosition(game, gs, seat)) });
    w.postMessage({ id, game, gs, evalSeat: seat });
  });
}
