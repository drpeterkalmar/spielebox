// Computer-Tempo und Zug-Animationen – alle Zeiten an einer Stelle (ms). Ohne DOM → läuft in Node-Tests.
// Peter 29.09. abends: „Computer langsamere Zuggeschwindigkeit, Meldungen länger anzeigen“ – die Kinder sollen sehen,
// was der Computer macht, und in Ruhe nachdenken. Stufen: gemütlich (Standard), normal, flott (≈ Stand bis 29.09.).
// Die Denkzeit bestimmt das Gerät, auf dem der Computer rechnet (Gastgeber); das Ausspielen jedes Gerät selbst.
//
// Alte Werte (bis 29.09.): Denkzeit 450 (29.09. 22:00: 1500, TIMING.botDelay), Gleiten 220–260, Dame-Sprung 260 je
// Sprung ohne Pause, Ausblenden 150–320, Würfel 650, Bank-Karten alle auf einmal (280), Stich blieb bis zum
// nächsten Ausspielen liegen (Denkzeit), Meldungen 2600 (29.09. 22:00: 5000).
//   think     Mindest-Denkzeit je Computer-Zug      jitter  + 0 … jitter zufällig (leicht unregelmäßig)
//   slide     Stein/Figur/Karte gleitet ans Ziel   hop     ein Sprung einer Sprungkette (Dame, Halma)
//   pause     Pause zwischen Teilen eines Zugs     fade    geschlagener Stein blendet aus
//   dice      Würfeln (Backgammon)                 bankGap Abstand der Bank-Karten (Blackjack)
//   trickHold ein fertiger Stich bleibt mindestens so lange liegen, bevor der Computer neu ausspielt
//   banner    Mindestdauer eines Ereignis-Banners am Brett
export const TEMPO = {
  gemuetlich: { think: 1500, jitter: 500, slide: 600, hop: 450, pause: 600, fade: 450, dice: 1000, bankGap: 1000, trickHold: 2000, banner: 4000 },
  normal: { think: 900, jitter: 150, slide: 420, hop: 330, pause: 350, fade: 350, dice: 800, bankGap: 650, trickHold: 1200, banner: 3000 },
  flott: { think: 450, jitter: 0, slide: 260, hop: 260, pause: 0, fade: 320, dice: 650, bankGap: 250, trickHold: 0, banner: 2500 },
  // Tests (?tempo=test): keine Wartezeit, keine Animation
  test: { think: 0, jitter: 0, slide: 0, hop: 0, pause: 0, fade: 0, dice: 0, bankGap: 0, trickHold: 0, banner: 2500 }
};
// eigene Züge (auf diesem Gerät getippt): kurz wie bisher, man hat sie ja selbst gemacht
export const OWN = { slide: 230, hop: 230, pause: 0, fade: 300, dice: 650, bankGap: 250, own: true };
// Banner bleibt bis zum nächsten eigenen Zug, aber höchstens so lange (ms)
export const BANNER_MAX = 15000;
export const LEVELS = ['gemuetlich', 'normal', 'flott'];
export const LEVEL_NAMES = { gemuetlich: 'gemütlich', normal: 'normal', flott: 'flott', test: 'Test' };
export const LEVEL_SUBS = { gemuetlich: 'ca. 1,5–2 s', normal: 'ca. 0,9 s', flott: '0,45 s' };
export const DEFAULT_LEVEL = 'gemuetlich';

// URL-Regler: ?tempo=test|flott|normal|gemuetlich (vor der Einstellung), ?botms=450 (nur die Denkzeit, A/B)
function urlParam(name) {
  try { return new URLSearchParams(globalThis.location?.search || '').get(name); } catch { return null; }
}

export function levelFrom(setting) {
  const u = urlParam('tempo');
  if (u && TEMPO[u]) return u;
  return TEMPO[setting] ? setting : DEFAULT_LEVEL;
}

// Zeiten einer Stufe; own = Zug wurde auf diesem Gerät getippt
export function params(level, own = false) {
  const p = TEMPO[level] || TEMPO[DEFAULT_LEVEL];
  if (!own || level === 'test') return p;
  return { ...p, ...OWN, own: true };
}

export function thinkMs(level, rand = Math.random) {
  const b = parseInt(urlParam('botms'), 10);
  if (b >= 0) return b;
  const p = TEMPO[level] || TEMPO[DEFAULT_LEVEL];
  return Math.round(p.think + (p.jitter ? rand() * p.jitter : 0));
}

// Dauer von Kettenzügen: k Sprünge mit Pausen dazwischen
const chain = (k, a) => (k > 1 ? k * a.hop + (k - 1) * a.pause : a.slide);

// Blackjack: wie viele Bank-Karten deckt dieser Zug auf (Loch-Karte + gezogene)? 0 = Runde läuft weiter
// (ohne prevGs: Runde endet, wenn nach einem Spielzug wieder gesetzt wird bzw. die Partie aus ist)
export function bankReveal(prevGs, gs, move = null) {
  const lr = gs && gs.lastRound;
  if (!lr) return 0;
  if (prevGs ? prevGs.lastRound && prevGs.lastRound.round === lr.round : !(move && move.type !== 'bet' && (gs.phase === 'bet' || gs.phase === 'over'))) return 0;
  return Math.max(1, lr.bankCards.length - 1);
}

// Wie lange spielt die Anzeige einen Zug aus (ms)? Danach darf der nächste Stand kommen.
// move = Zug, prevGs/gs = Stand davor/danach (prevGs darf fehlen), a = params(…)
export function animMs(game, move, prevGs, gs, a) {
  if (!move || !a) return 0;
  switch (game) {
    case 'muehle':
      return a.slide + (move.remove !== undefined ? a.pause + a.fade : 0);
    case 'dame':
      if (move.puste !== undefined) return a.fade;
      return chain(move.path ? move.path.length : 1, a) + (move.cap && move.cap.length ? a.fade / 2 : 0);
    case 'halma':
      return move.path ? chain(move.path.length, a) : 0;
    case 'schach':
      return a.slide;
    case 'schnapsen':
      return move.type === 'play' ? a.slide : 0;
    case 'backgammon':
      if (move.type === 'roll') return a.dice;
      // eigene Teilzüge sind beim Tippen schon geglitten → nicht noch einmal
      if (move.type === 'play' && move.steps && move.steps.length && !a.own) return move.steps.length * a.slide + (move.steps.length - 1) * a.pause;
      return 0;
    case 'wuerfel':
      return move.type === 'roll' ? a.dice : move.type === 'score' ? a.slide : 0;
    case 'maumau':
      if (move.type === 'play') return a.slide;
      if (move.type === 'draw' && gs && gs.last && gs.last.n) return a.slide + (Math.min(4, gs.last.n) - 1) * Math.min(160, a.slide / 2);
      return 0;
    case 'schiffe':
      return move.type === 'shot' && a.slide > 0 ? a.slide + 700 : 0;
    case 'paare':
      return Number.isInteger(move.flip) && a.slide > 0 ? Math.max(160, a.slide * 0.6) + (gs && gs.last && gs.last.match ? a.pause : 0) : 0;
    case 'reversi':
      return Number.isInteger(move.i) ? reversiMs(a, gs, move) : 0;
    case 'vier': {
      const col = gs && gs.cols && Number.isInteger(move.col) ? gs.cols[move.col] : null;
      return vierFall(a, col ? 6 - (col.length - 1) : 6);
    }
    case 'ludo': {
      if (move.type === 'roll') return a.dice + (gs && gs.phase === 'roll' && gs.lastRoll && !gs.lastRoll.moved ? a.pause : 0);
      if (move.type !== 'move') return 0;
      const n = ludoSteps(prevGs, gs, move);
      return n * ludoStep(a, n) + (gs && gs.last && gs.last.capture && a.slide > 0 ? Math.max(200, a.slide) : 0);
    }
    case 'blackjack': {
      const n = bankReveal(prevGs, gs, move);
      return a.slide + (n ? n * a.bankGap + a.pause : 0);
    }
  }
  return 0;
}

// Vier in einer Reihe: Stein fällt dist Reihen tief (immer sichtbar, auch eigene Züge; Test: 0)
export const vierFall = (a, dist) => (a.slide <= 0 ? 0 : Math.round(Math.max(a.slide, 420) * Math.sqrt(Math.max(1, dist) / 6) + 140));

// Reversi: Stein setzen, dann kippen die Steine ringweise nach außen (stagger je Ring)
export const reversiTimes = (a) => ({ place: Math.round(a.slide * 0.5), flip: a.slide, stagger: a.slide > 0 ? Math.round(a.slide * 0.3) : 0 });
function reversiMs(a, gs, move) {
  if (a.slide <= 0 || !gs || !gs.last || gs.last.i !== move.i) return 0;
  const t = reversiTimes(a), i = move.i;
  let ring = 1;
  for (const f of gs.last.flipped || []) ring = Math.max(ring, Math.abs((f % 8) - (i % 8)), Math.abs(Math.floor(f / 8) - Math.floor(i / 8)));
  return t.place + (ring - 1) * t.stagger + t.flip;
}

// Ludo: Dauer je Feld, wenn eine Figur n Felder läuft (lange Wege etwas schneller je Feld)
export const ludoStep = (a, n) => (a.slide <= 0 ? 0 : n <= 1 ? a.slide : Math.max(140, Math.min(a.hop, (a.slide * 2.4) / n)));
const ludoSteps = (prevGs, gs, move) => {
  const l = gs && gs.last;
  if (l && l.piece === move.piece) return l.from < 0 ? 1 : l.to - l.from;
  return 6;
};

// Hat dieser Zug einen Stich vollendet (Schnapsen)? Dann bleibt er trickHold lang liegen.
export function trickDone(game, move, gs) {
  return game === 'schnapsen' && !!move && move.type === 'play' && !!gs && gs.trick && gs.trick.length === 0 && !!gs.lastTrick;
}

// Denkzeit des Computers am Gastgeber-Gerät: erst den vorigen Zug zu Ende ausspielen lassen, dann „denken“.
// table.last = der Zug davor (by = Sitz); isLocal(by) = wurde auf diesem Gerät getippt.
export function botDelay(table, level, { isLocal = () => false, rand = Math.random } = {}) {
  let think = thinkMs(level, rand);
  const last = table && table.last;
  if (!last) return think;
  const a = params(level, isLocal(last.by));
  if (trickDone(table.game, last.m, table.gs)) think = Math.max(think, TEMPO[level] ? TEMPO[level].trickHold : 0);
  return animMs(table.game, last.m, null, table.gs, a) + think;
}
