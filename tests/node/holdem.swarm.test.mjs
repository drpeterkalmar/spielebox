// Schwarmtest Hold'em: 10 000 ganze Turniere (2–8 Plätze, alle Blind-Tempi, Start-Chips 500–5000) mit Zufalls- und
// Computer-Zügen (mulberry32). Invarianten nach JEDEM Schritt: Chip-Summe exakt erhalten, nie negativ, 52 Karten
// genau einmal (Stapel + Hole Cards + Board + verbrannt), Einsätze passen zueinander, am Zug ist nur, wer handeln
// kann, Zufall ⇒ niemand am Zug, Ausgeschiedene bekommen keine Karten, die Sicht verrät weder Stapel noch fremde
// Hole Cards noch weggelegte Karten; alle legalMoves sind legal, Müll wird abgelehnt; jedes Turnier endet mit genau
// einem Sieger und eindeutigen Plätzen. Dazu je 300 Turniere nur mit Computern (leicht/mittel/stark gemischt).
// Aufruf: node tests/node/holdem.swarm.test.mjs [seed] [--games=10000]
import * as E from '../../src/games/holdem/engine.js';
import { chooseMove } from '../../src/games/holdem/bot.js';
import { mulberry32 } from '../../src/rng.js';

const args = process.argv.slice(2);
const SEED = Number(args.find((a) => /^\d+$/.test(a)) || 20261004);
const GAMES = Number((args.find((a) => a.startsWith('--games=')) || '--games=10000').split('=')[1]);
const BOTGAMES = 300;

let passed = 0, failed = 0;
function test(name, fn) {
  const t = performance.now();
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''} – ${((performance.now() - t) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n   ')}`);
  }
}
const fail = (m) => { throw new Error(m); };
const sum = (a) => a.reduce((x, y) => x + y, 0);
function shuffled(rng) {
  const p = [...Array(52).keys()];
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

function check(s, ctx, total) {
  const n = s.opts.players;
  if (sum(s.stacks) + sum(s.contrib) !== total) fail(`${ctx}: Chips ${sum(s.stacks)} + ${sum(s.contrib)} ≠ ${total}`);
  for (let p = 0; p < n; p++) {
    if (!(s.stacks[p] >= 0) || !Number.isInteger(s.stacks[p])) fail(`${ctx}: Stack ${p} = ${s.stacks[p]}`);
    if (s.contrib[p] < s.bets[p] || s.bets[p] < 0) fail(`${ctx}: Einsatz ${p}`);
    if (s.out[p] !== null && (s.holes[p].length || s.contrib[p])) fail(`${ctx}: Ausgeschiedener ${p} spielt mit`);
    if (s.allin[p] && s.stacks[p] !== 0) fail(`${ctx}: All-in mit Chips ${p}`);
  }
  if (s.phase === 'over') {
    const w = s.over.winner;
    if (w === null || s.places[w] !== 1) fail(`${ctx}: kein Sieger`);
    const places = s.places.filter((x) => x !== null);
    if (places.length !== n) fail(`${ctx}: Plätze fehlen ${s.places}`);
    if (s.stacks[w] !== total && s.hand < E.MAX_HANDS) fail(`${ctx}: Sieger hat nicht alle Chips`);
    return;
  }
  if (s.phase === 'deal') {
    if (E.currentPlayer(s) !== null) fail(`${ctx}: Mischen, aber jemand am Zug`);
    if (sum(s.contrib) !== 0) fail(`${ctx}: Einsätze vor dem Austeilen`);
    return;
  }
  // Karten: Stapel + Hole Cards + Board + verbrannt = 52, alle verschieden
  const cards = [...s.deck, ...s.holes.flat(), ...s.board];
  const burned = s.street;
  if (cards.length + burned !== 52) fail(`${ctx}: ${cards.length} + ${burned} Karten`);
  if (new Set(cards).size !== cards.length) fail(`${ctx}: doppelte Karte`);
  if (s.board.length !== [0, 3, 4, 5][s.street]) fail(`${ctx}: Board ${s.board.length} auf Straße ${s.street}`);
  if (s.betTo < Math.max(...s.bets)) fail(`${ctx}: betTo zu klein`);
  const t = s.turn;
  if (t === null || !E.live(s, t) || s.allin[t]) fail(`${ctx}: falscher Sitz am Zug ${t}`);
  if (E.chance(s)) fail(`${ctx}: Zufall in der Setzrunde`);
}

function checkViews(s, ctx) {
  const n = s.opts.players;
  for (let v = -1; v < n; v++) {
    const view = E.viewFor(s, v < 0 ? null : v);
    if (view.deck.some((c) => c !== null)) fail(`${ctx}: Stapel sichtbar`);
    for (let q = 0; q < n; q++) {
      if (q === v || s.shown[q]) continue;
      if (view.holes[q].some((c) => c !== null)) fail(`${ctx}: Sitz ${v} sieht Karten von ${q}`);
    }
    for (const k of Object.keys(view.lastHoles || {})) if (Number(k) !== v) fail(`${ctx}: weggelegte Karten von ${k} sichtbar`);
    // gezielte Prüfung im JSON: keine verdeckte fremde Karte taucht irgendwo auf
    const secret = [];
    for (let q = 0; q < n; q++) if (q !== v && !s.shown[q]) secret.push(...s.holes[q]);
    for (const [k, h] of Object.entries(s.lastHoles || {})) if (Number(k) !== v && !(s.lastHand && s.lastHand.shown[k])) secret.push(...h);
    const shownNow = new Set([...s.board, ...(s.lastHand ? Object.values(s.lastHand.shown).flat().concat(s.lastHand.board) : []), ...(v >= 0 ? s.holes[v] : []), ...(v >= 0 && s.lastHoles && s.lastHoles[v] ? s.lastHoles[v] : [])]);
    const txt = JSON.stringify(view);
    for (const c of secret) if (!shownNow.has(c) && txt.includes(`"${c}"`)) fail(`${ctx}: Karte ${c} in Sicht ${v}`);
  }
}

const JUNK = [null, {}, { type: 'raise' }, { type: 'raise', to: -1 }, { type: 'raise', to: 1e9 }, { type: 'check', x: 1 }, { type: 'bet', to: 20 }, 'fold'];

function play(rng, { botOnly = false, viewEvery = 0 } = {}) {
  const players = 2 + Math.floor(rng() * 7);
  // „aus“ seltener (läuft bis zur Sicherheitsgrenze von MAX_HANDS Händen)
  const blinds = !botOnly && rng() < 0.05 ? 'aus' : ['schnell', 'normal', 'langsam'][Math.floor(rng() * 3)];
  const start = E.STARTS[Math.floor(rng() * E.STARTS.length)];
  const opts = { players, blinds, start: botOnly ? Math.min(start, 1000) : start };
  let s = E.initialState(opts);
  const total = players * s.opts.start;
  // Art je Sitz: 0 zufällig, 1–3 Computer-Stufe
  // (im großen Schwarm meist zufällig/leicht – mittel/stark sind teurer und laufen ausführlich in den Bot-Turnieren)
  const kind = Array.from({ length: players }, () => { const x = rng(); return botOnly ? 1 + Math.floor(rng() * 3) : x < 0.6 ? 0 : x < 0.9 ? 1 : 2 + Math.floor(rng() * 2); });
  let steps = 0, hands = 0;
  check(s, 'Start', total);
  while (s.phase !== 'over') {
    if (++steps > 200000) fail('Turnier endet nicht');
    const ctx = `Hand ${s.hand}, Schritt ${steps}`;
    if (E.chance(s)) {
      s = E.applyChance(s, shuffled(rng));
      hands++;
    } else {
      const lm = E.legalMoves(s);
      if (!lm.length) fail(`${ctx}: keine Züge`);
      for (const m of lm) if (!E.isLegal(s, m)) fail(`${ctx}: legalMoves nicht legal ${JSON.stringify(m)}`);
      if (rng() < 0.02) for (const j of JUNK) if (E.isLegal(s, j)) fail(`${ctx}: Müll legal ${JSON.stringify(j)}`);
      const k = kind[s.turn];
      let m;
      if (k === 0) {
        m = lm[Math.floor(rng() * lm.length)];
        if (m.type === 'raise' && rng() < 0.7) {
          const r = E.raiseRange(s);
          m = { type: 'raise', to: r.min + Math.floor(rng() * (r.max - r.min + 1)) };
        }
        // Zufallsspieler steigen nicht zu oft aus (sonst endet nie etwas spannend)
        if (m.type === 'fold' && rng() < 0.5) m = lm.find((x) => x.type === 'call');
      } else {
        m = chooseMove(E.viewFor(s, s.turn), { level: k, rng, iters: 120 });
        if (!E.isLegal(s, m)) fail(`${ctx}: Computer ${k} spielt ungültig ${JSON.stringify(m)}`);
      }
      const before = s;
      s = E.applyMove(s, m);
      if (s === before || (s.turn === before.turn && s.hand === before.hand && s.street === before.street && sum(s.contrib) === sum(before.contrib) && s.folded.join() === before.folded.join() && s.log.length === before.log.length)) fail(`${ctx}: Zug ohne Wirkung`);
    }
    check(s, ctx, total);
    if (viewEvery && steps % viewEvery === 0) checkViews(s, ctx);
    if (s.lastHand && s.phase !== 'over' && rng() < 0.01) {
      // „show“ für weggelegte Karten
      for (const k of Object.keys(s.lastHoles || {})) {
        if (!E.isLegalAct(s, Number(k), 'show')) fail(`${ctx}: show nicht erlaubt`);
        s = E.applyAct(s, Number(k), 'show');
        if (!s.lastHand.shown[k]) fail(`${ctx}: show wirkt nicht`);
        break;
      }
    }
  }
  check(s, 'Ende', total);
  return { hands, players };
}

test(`${GAMES} Turniere mit Zufalls- und Computer-Zügen, Invarianten nach jedem Schritt`, () => {
  const rng = mulberry32(SEED);
  let hands = 0, maxHands = 0;
  for (let g = 0; g < GAMES; g++) {
    try {
      const r = play(rng, { viewEvery: g % 40 === 0 ? 3 : 0 });
      hands += r.hands;
      maxHands = Math.max(maxHands, r.hands);
    } catch (e) { throw new Error(`Turnier ${g}: ${e.message}`); }
  }
  return `${hands} Hände, längstes Turnier ${maxHands} Hände`;
});

test(`${BOTGAMES} Turniere nur mit Computern (leicht/mittel/stark gemischt)`, () => {
  const rng = mulberry32(SEED + 1);
  let hands = 0;
  const lens = [];
  for (let g = 0; g < BOTGAMES; g++) {
    try {
      const r = play(rng, { botOnly: true, viewEvery: g % 25 === 0 ? 5 : 0 });
      hands += r.hands;
      lens.push(r.hands);
    } catch (e) { throw new Error(`Bot-Turnier ${g}: ${e.message}`); }
  }
  lens.sort((a, b) => a - b);
  return `${hands} Hände, Median ${lens[lens.length >> 1]} Hände je Turnier`;
});

console.log(`\n${passed} ✅, ${failed} ❌`);
process.exit(failed ? 1 : 0);
