// Bot-Anbindung: rechnet im Web Worker, sonst (kein Worker möglich) direkt im Hauptthread.
import { loadBot, TIME } from './games/bots.js';
import { evalPosition } from './evalpos.js';

// Antwortet der Worker so lange nicht (Endlosschleife, tot ohne onerror), wird er beendet und der Zug im Hauptthread
// gerechnet; der nächste Aufruf legt einen neuen Worker an. Tests: kleiner.
export const BOT_LIMIT = { ms: 10000 };
let makeWorker = () => new Worker(new URL('./botworker.js', import.meta.url), { type: 'module' });
let worker = null;     // null = noch keiner, false = keiner möglich (dann direkt im Hauptthread)
let seq = 0;
const waiting = new Map();

// nur für Tests: Worker-Attrappe einsetzen (null = wieder der echte)
export function setWorkerFactory(fn) {
  makeWorker = fn || (() => new Worker(new URL('./botworker.js', import.meta.url), { type: 'module' }));
  worker = null;
  waiting.clear();
}

function getWorker() {
  if (worker !== null) return worker;
  try {
    const w = makeWorker();
    w.onmessage = (e) => {
      const x = waiting.get(e.data.id);
      if (!x) return;
      if (e.data.error) x.reject(new Error(e.data.error));
      else x.resolve(e.data.move);
    };
    w.onerror = () => { if (worker === w) worker = false; fallbackAll(); };
    worker = w;
  } catch {
    worker = false;
  }
  return worker;
}

// Worker beim App-Start anlegen: so gehört er zur Version der Seite (nicht zu einem später geladenen Update)
export function warmUp() {
  getWorker();
}

function fallbackAll(reason) {
  const open = [...waiting.values()];
  waiting.clear();
  for (const x of open) x.fallback(reason);
}

// Worker hängt: beenden, offene Anfragen im Hauptthread erledigen
function restart(reason) {
  const w = worker;
  worker = null;
  try { if (w) w.terminate(); } catch { /* egal */ }
  fallbackAll(reason);
}

// Anfrage an den Worker mit Zeitlimit; fallback(reason) rechnet im Hauptthread (reason gesetzt = Zeitlimit)
function request(msg, fallback) {
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(fallback()), 0));   // fallback darf ein Promise liefern
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { if (waiting.has(id)) restart(`Zeitlimit ${BOT_LIMIT.ms / 1000} s`); }, BOT_LIMIT.ms);
    const end = () => { clearTimeout(timer); waiting.delete(id); };
    waiting.set(id, {
      resolve: (v) => { end(); resolve(v); },
      reject: (e) => { end(); reject(e); },
      fallback: (reason) => { end(); try { Promise.resolve(fallback(reason)).then(resolve, reject); } catch (e) { reject(e); } }
    });
    w.postMessage({ id, ...msg });
  });
}

// Computer-Zug; ctx.note(text) schreibt ins Tisch-Protokoll (Zeitlimit)
export function chooseBotMove(game, gs, level = 2, ctx = {}) {
  return request({ game, gs, level }, async (reason) => {
    if (!reason) return (await loadBot(game))(gs, { level, timeMs: TIME[level] || 400 });
    if (ctx.note) ctx.note(`Computer-Worker antwortet nicht (${reason}) – Zug im Hauptthread`);
    return quickMove(game, gs, level);
  });
}

// schneller Vorschlag im Hauptthread (Debug/Tests: __box.botMove, Rückfall nach Zeitlimit); Bot wird bei Bedarf geladen
export async function quickMove(game, gs, level = 1) {
  return (await loadBot(game))(gs, { level, timeMs: 60 });
}

// Einschätzung „Wer gewinnt?“ (im Worker, sonst direkt). Höchstens eine Bewertung in Arbeit; kommt währenddessen
// eine neue, wartet nur die neueste – ältere wartende werden verworfen (Promise abgelehnt), damit sich vor dem
// nächsten Computer-Zug keine veralteten Bewertungen stapeln.
let evalBusy = false;
let evalNext = null;
export function evaluateBoard(game, gs, seat) {
  if (!getWorker()) return Promise.resolve(evalPosition(game, gs, seat));
  return new Promise((resolve, reject) => {
    if (evalNext) evalNext.reject(new Error('veraltet'));
    evalNext = { game, gs, seat, resolve, reject };
    pumpEval();
  });
}

function pumpEval() {
  if (evalBusy || !evalNext) return;
  const job = evalNext;
  evalNext = null;
  evalBusy = true;
  request({ game: job.game, gs: job.gs, evalSeat: job.seat }, () => evalPosition(job.game, job.gs, job.seat))
    .then(job.resolve, job.reject)
    .finally(() => { evalBusy = false; pumpEval(); });
}
