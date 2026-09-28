// Schwarmtest Dame: 10 000 Zufallspartien je Regelvariante (alle 8 Kombinationen deutsch/international ×
// kurz × pusten), Invarianten nach JEDEM Halbzug, unabhängiger Referenz-Zuggenerator als Gegenprobe,
// Fuzz mit illegalen Zügen, dazu Bot-Prüfung je Preset. Läuft auf max. 4 Worker-Threads (diese Datei
// startet sich selbst als Worker).
// Aufruf: node tests/node/dame.swarm.test.mjs [seed] [--games=10000] [--replay=<variante>:<spielseed>]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import * as D from '../../src/games/dame/engine.js';
import { chooseMove } from '../../src/games/dame/bot.js';
import { mulberry32 } from '../../src/rng.js';

const VARIANTS = [];
for (const rules of ['deutsch', 'international']) {
  for (const kurz of [false, true]) for (const pusten of [false, true]) VARIANTS.push({ rules, kurz, pusten });
}
const vname = (o) => o.rules + (o.kurz ? ' + kurz' : '') + (o.pusten ? ' + pusten' : '');
const MAX_PLIES = 3000;
const REASONS = ['keine Steine', 'keine Züge', 'dreifache Wiederholung', '25-Züge-Regel'];

// Seeds mischen (reproduzierbar je Variante und Partie)
function mix(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function fail(msg) {
  throw new Error(msg);
}

// ---------- unabhängige Referenz (bewusst anders gebaut: Koordinaten, Rekursion mit Listen) ----------

const rk = (from, path, cap) => (cap.length ? `${from}x${path.join('x')}/${cap.join(',')}` : `${from}-${path[0]}`);
const DIR4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function refMoves(board, n, turn, o) {
  const s = turn === 0 ? 1 : -1, intl = o.rules === 'international', fwd = s > 0 ? -1 : 1, promo = s > 0 ? 0 : n - 1;
  const inside = (r, c) => r >= 0 && r < n && c >= 0 && c < n;
  const b = board.slice(), caps = [], norms = [];
  let own = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const from = r * n + c, v = b[from];
      if (v * s <= 0) continue;
      own++;
      const king = Math.abs(v) === 2, far = king && !o.kurz;
      for (const [dr, dc] of DIR4) {
        if (!king && dr !== fwd) continue;
        for (let k = 1; inside(r + dr * k, c + dc * k) && b[(r + dr * k) * n + c + dc * k] === 0; k++) {
          norms.push(rk(from, [(r + dr * k) * n + c + dc * k], []));
          if (!far) break;
        }
      }
      b[from] = 0;                                   // Startfeld ist während des Schlagens leer
      const walk = (r0, c0, path, taken) => {
        let any = false;
        for (const [dr, dc] of DIR4) {
          if (!king && !intl && dr !== fwd) continue;
          let k = 1;
          if (far) while (inside(r0 + dr * k, c0 + dc * k) && b[(r0 + dr * k) * n + c0 + dc * k] === 0) k++;
          const er = r0 + dr * k, ec = c0 + dc * k;
          if (!inside(er, ec)) continue;
          const e = er * n + ec;
          if (b[e] * s >= 0 || taken.includes(e)) continue;   // eigene, leere oder schon geschlagene
          for (let j = 1; inside(er + dr * j, ec + dc * j) && b[(er + dr * j) * n + ec + dc * j] === 0; j++) {
            const lr = er + dr * j, l = lr * n + ec + dc * j, p2 = [...path, l], t2 = [...taken, e];
            any = true;
            if ((!king && !intl && lr === promo) || !walk(lr, ec + dc * j, p2, t2)) caps.push({ key: rk(from, p2, t2), len: t2.length });
            if (!(far && intl)) break;               // nur die fliegende internationale Dame landet weiter hinten
          }
        }
        return any;
      };
      walk(r, c, [], []);
      b[from] = v;
    }
  }
  const max = caps.reduce((a, x) => Math.max(a, x.len), 0);
  const keys = (intl ? caps.filter((x) => x.len === max) : caps).map((x) => x.key);
  if (!keys.length || o.pusten) keys.push(...norms);
  return { keys, max, own };
}

// ---------- Prüfungen ----------

const keyOf = (m) => rk(m.from, m.path, m.cap);

const ints = (a) => {
  for (let i = 0; i < a.length; i++) if (!Number.isInteger(a[i])) return false;
  return true;
};

// unabhängige Formprüfung: genau { from, path, cap } oder genau { puste }
function exactShape(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const ks = Object.keys(m);
  if (ks.length === 1) return ks[0] === 'puste' && Number.isInteger(m.puste);
  if (ks.length !== 3 || !Object.hasOwn(m, 'from') || !Object.hasOwn(m, 'path') || !Object.hasOwn(m, 'cap')) return false;
  if (!Number.isInteger(m.from) || !Array.isArray(m.path) || !Array.isArray(m.cap) || !m.path.length) return false;
  if (!ints(m.path) || !ints(m.cap)) return false;
  return m.cap.length === 0 ? m.path.length === 1 : m.cap.length === m.path.length;
}

// Figuren je Wert: c[v + 2]
function counts(b) {
  const c = [0, 0, 0, 0, 0];
  for (let i = 0; i < b.length; i++) c[b[i] + 2]++;
  return c;
}

// Zugliste vor dem Halbzug prüfen
function checkMoves(s, moves, o, ref) {
  const side = s.turn === 0 ? 1 : -1, intl = o.rules === 'international';
  if (!moves.length) fail('Partie läuft, aber keine legalen Züge');
  const seen = new Set();
  let nCap = 0, nNorm = 0, minCap = Infinity, maxCap = 0;
  const puste = [];
  for (const m of moves) {
    if (!exactShape(m)) fail(`Zug mit falscher Form: ${JSON.stringify(m)}`);
    if (m.puste !== undefined) {
      puste.push(m.puste);
      if (s.board[m.puste] * side >= 0) fail('Pusten auf keine gegnerische Figur');
      continue;
    }
    const k = keyOf(m);
    if (seen.has(k)) fail(`doppelter Zug ${k}`);
    seen.add(k);
    if (s.board[m.from] * side <= 0) fail(`Zug mit fremder/leerer Figur ${k}`);
    if (m.cap.length) {
      nCap++;
      minCap = Math.min(minCap, m.cap.length);
      maxCap = Math.max(maxCap, m.cap.length);
    } else nNorm++;
  }
  // Pusten genau für die Felder in pustbar (nur wenn erlaubt und noch nicht gepustet)
  const expPuste = o.pusten && !s.pusted ? s.pustbar : [];
  if (puste.join() !== expPuste.join()) fail(`Pusten-Züge ${puste} ≠ pustbar ${expPuste}`);
  if (!o.pusten && s.pustbar.length) fail('pustbar ohne Pusten-Schalter');
  // Schlagzwang ohne Pusten
  if (!o.pusten && nCap && nNorm) fail('Schlagzwang verletzt: Schlag möglich, aber normale Züge legal');
  // International: jeder legale Schlag hat die Maximalzahl (Referenz rechnet unabhängig)
  if (intl && nCap && (minCap !== maxCap || maxCap !== ref.max)) fail(`Mehrheitsregel verletzt: ${minCap}..${maxCap}, Referenz-Maximum ${ref.max}`);
  if (!intl && nCap && maxCap > ref.max) fail('Schlag länger als Referenz');
  // exakter Abgleich mit der Referenz
  if (seen.size !== ref.keys.length) fail(`Zugzahl ${seen.size} ≠ Referenz ${ref.keys.length}`);
  for (const k of ref.keys) if (!seen.has(k)) fail(`Referenzzug fehlt: ${k}`);
  // jeder Zug aus legalMoves ist isLegal
  for (const m of moves) if (!D.isLegal(s, m)) fail(`isLegal lehnt legalen Zug ab: ${JSON.stringify(m)}`);
}

// Übergang s --m--> t prüfen (Brett unabhängig nachgerechnet); liefert Referenz für t
function checkStep(s, m, moves, t, o) {
  const n = s.n, side = s.turn === 0 ? 1 : -1, b0 = s.board, b1 = t.board;
  const exp = b0.slice();
  let taken = 0, takenKings = 0, promoted = false;
  if (m.puste !== undefined) {
    exp[m.puste] = 0;
    taken = 1;
    takenKings = Math.abs(b0[m.puste]) === 2 ? 1 : 0;
    if (t.turn !== s.turn || !t.pusted || t.pustbar.length) fail('nach dem Pusten: gleicher Spieler, pusted, pustbar leer erwartet');
  } else {
    const v = b0[m.from], to = m.path[m.path.length - 1], r = Math.floor(to / n);
    exp[m.from] = 0;
    for (const c of m.cap) {
      if (b0[c] * side >= 0) fail('geschlagenes Feld ohne gegnerische Figur');
      if (Math.abs(b0[c]) === 2) takenKings++;
      exp[c] = 0;
    }
    taken = m.cap.length;
    promoted = (v === D.WM && r === 0) || (v === D.BM && r === n - 1);
    exp[to] = promoted ? 2 * v : v;
    if (t.turn !== 1 - s.turn || t.pusted) fail('Zugrecht nicht gewechselt');
    // pustbar: wer nicht schlägt, obwohl er konnte → schlagfähige Figuren (gezogene mit neuem Feld)
    let pb = [];
    if (o.pusten && !m.cap.length) {
      pb = [...new Set(moves.filter((x) => x.cap && x.cap.length).map((x) => (x.from === m.from ? m.path[0] : x.from)))].sort((a, c) => a - c);
    }
    if (t.pustbar.join() !== pb.join()) fail(`pustbar ${t.pustbar} ≠ erwartet ${pb}`);
  }
  for (let i = 0; i < exp.length; i++) if (exp[i] !== b1[i]) fail(`Brett weicht ab auf Feld ${i}: ${b1[i]} statt ${exp[i]}`);
  // Steinzahl: Gegner verliert genau die geschlagenen (bzw. 1 beim Pusten), Ziehender nichts
  const c0 = counts(b0), c1 = counts(b1), M = side + 2, MK = 2 * side + 2, O = 2 - side, OK = 2 - 2 * side;
  const mine0 = c0[M] + c0[MK], mine1 = c1[M] + c1[MK];
  const opp0 = c0[O] + c0[OK], opp1 = c1[O] + c1[OK];
  if (mine1 !== mine0) fail('Steinzahl des Ziehenden verändert');
  if (opp1 !== opp0 - taken) fail(`Gegner verlor ${opp0 - opp1} statt ${taken}`);
  // Damen nur durch Umwandlung (höchstens +1), gegnerische Damen nie mehr
  const dk = c1[MK] - c0[MK];
  if (dk !== (promoted ? 1 : 0) || dk > 1) fail(`Damenzahl +${dk} ohne passende Umwandlung`);
  if (c1[OK] !== c0[OK] - takenKings) fail('gegnerische Damenzahl falsch');
  // nur dunkle Felder, Werte -2..2, kein Stein auf der gegnerischen Grundlinie
  for (let i = 0; i < b1.length; i++) {
    const v = b1[i];
    if (!Number.isInteger(v) || v < -2 || v > 2) fail(`ungültiger Wert ${v}`);
    if (!v) continue;
    const r = Math.floor(i / n), c = i % n;
    if (!D.isDark(r, c)) fail(`Figur auf hellem Feld ${i}`);
    if ((v === D.WM && r === 0) || (v === D.BM && r === n - 1)) fail(`Stein am Zugende auf der Grundlinie (Feld ${i})`);
  }
  // Zähler
  const reversible = m.puste === undefined && Math.abs(b0[m.from]) === 2 && !m.cap.length;
  if (t.ply !== s.ply + 1) fail('ply nicht erhöht');
  if (t.quiet !== (reversible ? s.quiet + 1 : 0)) fail(`quiet ${t.quiet} falsch`);
  const key = D.positionKey(t);
  if (reversible ? t.rep[key] !== (s.rep[key] || 0) + 1 : Object.keys(t.rep).length !== 1 || t.rep[key] !== 1) fail('rep falsch');
  // Ergebnis unabhängig nachrechnen
  const ref = refMoves(b1, n, t.turn, o);
  const hasPuste = o.pusten && !t.pusted && t.pustbar.length > 0;
  const other = mine1 + opp1 - ref.own;                // Figuren der Seite, die nicht am Zug ist
  let exp2 = null;
  if (ref.own === 0) exp2 = { winner: 1 - t.turn, reason: 'keine Steine' };
  else if (other === 0) exp2 = { winner: t.turn, reason: 'keine Steine' };   // nach dem Pusten
  else if (!ref.keys.length && !hasPuste) exp2 = { winner: 1 - t.turn, reason: 'keine Züge' };
  else if (t.rep[key] >= 3) exp2 = { winner: null, reason: 'dreifache Wiederholung' };
  else if (t.quiet >= 50) exp2 = { winner: null, reason: '25-Züge-Regel' };
  if (JSON.stringify(t.over) !== JSON.stringify(exp2)) fail(`Ergebnis ${JSON.stringify(t.over)} ≠ erwartet ${JSON.stringify(exp2)}`);
  if (JSON.stringify(D.result(t)) !== JSON.stringify(t.over)) fail('result() ≠ state.over');
  if (t.over && D.legalMoves(t).length) fail('beendete Partie hat Züge');
  return ref;
}

// illegale Züge: isLegal muss ablehnen, applyMove muss werfen
function fuzz(s, moves, o, rng) {
  const N = s.n * s.n, side = s.turn === 0 ? 1 : -1;
  const legal = new Set(moves.map((m) => (m.puste !== undefined ? `p${m.puste}` : keyOf(m))));
  const reallyLegal = (m) => exactShape(m) && legal.has(m.puste !== undefined ? `p${m.puste}` : keyOf(m));
  const rnd = (k) => Math.floor(rng() * k);
  const cands = [];
  const any = moves.filter((m) => m.puste === undefined);
  for (let k = 0; k < 3; k++) {                                    // falsches Feld
    const m = any[rnd(any.length)];
    cands.push({ from: m.from, path: [rnd(N)], cap: [] });
    cands.push({ from: rnd(N), path: [rnd(N)], cap: [] });
  }
  const opp = D.legalMoves({ ...s, turn: 1 - s.turn, pustbar: [], pusted: false, over: null });
  for (let k = 0; k < 3 && opp.length; k++) cands.push(opp[rnd(opp.length)]);   // fremde Figur
  for (const m of any.filter((x) => x.cap.length).slice(0, 4)) {
    if (m.path.length > 1) {                                        // halbe Schlagfolge
      const k = 1 + rnd(m.path.length - 1);
      cands.push({ from: m.from, path: m.path.slice(0, k), cap: m.cap.slice(0, k) });
    }
    cands.push({ from: m.from, path: [...m.path], cap: m.cap.map((c, i) => (i === m.cap.length - 1 ? (c + 1 + rnd(N - 1)) % N : c)) });  // falsches cap
    if (m.cap.length > 1) cands.push({ from: m.from, path: [...m.path], cap: [...m.cap].reverse() });
    cands.push({ from: m.from, path: [...m.path], cap: m.cap.slice(0, -1) });
    cands.push({ from: m.from, path: [m.path[m.path.length - 1]], cap: [] });
  }
  const m0 = any[0];                                                // Müll
  cands.push(null, undefined, 7, NaN, 'e3-f4', [], {}, [m0.from, m0.path[0]], { ...m0, extra: 1 }, { ...m0, puste: m0.from },
    { from: m0.from, path: [NaN], cap: [] }, { from: m0.from + 0.5, path: m0.path, cap: m0.cap }, { from: String(m0.from), path: m0.path, cap: m0.cap },
    { from: m0.from, path: m0.path }, { puste: 1.5 }, { puste: '3' }, { puste: -1 }, { puste: N });
  for (let i = 0; i < N; i++) if (s.board[i] * side < 0 && !legal.has(`p${i}`)) { cands.push({ puste: i }); break; }   // Pusten ohne Recht
  let cnt = 0;
  for (const c of cands) {
    if (reallyLegal(c)) continue;
    if (D.isLegal(s, c)) fail(`Fuzz: illegaler Zug akzeptiert ${JSON.stringify(c)}`);
    let threw = false;
    try {
      D.applyMove(s, c);
    } catch (e) {
      threw = e instanceof Error;
    }
    if (!threw) fail(`Fuzz: applyMove warf nicht bei ${JSON.stringify(c)}`);
    cnt++;
  }
  // an Fuzz-Halbzügen: applyMove für ALLE legalen Züge (darf nicht werfen, Eingabe bleibt gleich)
  const before = JSON.stringify(s);
  for (const m of moves) D.applyMove(s, m);
  if (JSON.stringify(s) !== before) fail('applyMove hat die Eingabe verändert');
  return cnt;
}

function randomGame(o, gs, st) {
  const rng = mulberry32(gs);
  let s = D.initialState(o), plies = 0;
  let ref = refMoves(s.board, s.n, s.turn, o);
  const fuzzAt = new Set([0, 1 + Math.floor(rng() * 40), 40 + Math.floor(rng() * 120)]);
  while (!s.over) {
    if (plies >= MAX_PLIES) fail(`Sicherheitsgrenze ${MAX_PLIES} Halbzüge erreicht`);
    const moves = D.legalMoves(s);
    checkMoves(s, moves, o, ref);
    if (fuzzAt.has(plies)) st.fuzz += fuzz(s, moves, o, rng);
    const m = moves[Math.floor(rng() * moves.length)];
    const board0 = s.board.slice(), rep0 = Object.keys(s.rep).length, pb0 = s.pustbar.join(), sc0 = `${s.turn}|${s.ply}|${s.quiet}|${s.pusted}`;
    const t = D.applyMove(s, m);
    // Eingabe unverändert (schnelle Prüfung; volle JSON-Prüfung an den Fuzz-Halbzügen)
    for (let i = 0; i < board0.length; i++) if (board0[i] !== s.board[i]) fail('applyMove hat das Brett der Eingabe verändert');
    if (rep0 !== Object.keys(s.rep).length || pb0 !== s.pustbar.join() || sc0 !== `${s.turn}|${s.ply}|${s.quiet}|${s.pusted}`) fail('applyMove hat die Eingabe verändert');
    ref = checkStep(s, m, moves, t, o);
    s = t;
    plies++;
    st.checked++;
  }
  st.games++;
  st.plies += plies;
  st.maxLen = Math.max(st.maxLen, plies);
  const w = s.over.winner;
  st.res[w === null ? 'remis' : w]++;
  st.reasons[s.over.reason] = (st.reasons[s.over.reason] || 0) + 1;
}

function runRandom(job) {
  const o = D.normalizeOptions(VARIANTS[job.vi]);
  const st = { games: 0, plies: 0, maxLen: 0, checked: 0, fuzz: 0, res: { 0: 0, 1: 0, remis: 0 }, reasons: {}, errors: [] };
  for (let g = job.start; g < job.start + job.count; g++) {
    const gs = mix(job.seed, job.vi, g);
    try {
      randomGame(o, gs, st);
    } catch (e) {
      st.errors.push(`${vname(o)}, Partie ${g}: ${e.message} (nachspielen: --replay=${job.vi}:${gs})`);
      if (st.errors.length >= 3) break;
    }
  }
  return st;
}

// Bot-Partien: level 2 gegen Zufall bzw. level 3 (100 ms) gegen level 1, Farben abwechselnd
function runBot(job) {
  const o = D.normalizeOptions({ rules: job.rules, kurz: job.house, pusten: job.house });
  const st = { games: 0, win: 0, draw: 0, loss: 0, plies: 0, moves: 0, sumMs: 0, maxMs: 0, errors: [] };
  const timeMs = job.level === 3 ? 100 : 400;
  for (let g = job.start; g < job.start + job.count; g++) {
    const gs = mix(job.seed, job.level, job.rules === 'deutsch' ? 1 : 2, job.house ? 1 : 0, g);
    const rngBot = mulberry32(gs), rngOpp = mulberry32(gs ^ 0x5bd1e995), botSide = g % 2;
    try {
      let s = D.initialState(o), plies = 0;
      while (!s.over) {
        if (plies >= MAX_PLIES) fail('Bot-Partie endet nicht');
        let m;
        if (s.turn === botSide) {
          const t = performance.now();
          m = chooseMove(s, { level: job.level, rng: rngBot, timeMs });
          const dt = performance.now() - t;
          st.moves++;
          st.sumMs += dt;
          st.maxMs = Math.max(st.maxMs, dt);
        } else if (job.level === 2) {
          const ms = D.legalMoves(s);
          m = ms[Math.floor(rngOpp() * ms.length)];
        } else m = chooseMove(s, { level: 1, rng: rngOpp });
        if (!D.isLegal(s, m)) fail(`Bot wählte illegalen Zug ${JSON.stringify(m)}`);
        s = D.applyMove(s, m);
        plies++;
      }
      st.games++;
      st.plies += plies;
      if (s.over.winner === null) st.draw++;
      else if (s.over.winner === botSide) st.win++;
      else st.loss++;
    } catch (e) {
      st.errors.push(`Bot level ${job.level} ${job.rules}, Partie ${g}: ${e.message}`);
    }
  }
  return st;
}

// ---------- Worker ----------

if (!isMainThread) {
  parentPort.on('message', (job) => {
    const t = performance.now();
    const r = job.kind === 'random' ? runRandom(job) : runBot(job);
    parentPort.postMessage({ job, r, ms: performance.now() - t });
  });
} else {
  await main();
}

// ---------- Hauptprogramm ----------

async function main() {
  const t0 = performance.now();
  const args = process.argv.slice(2);
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const seedArg = args.find((a) => /^\d+$/.test(a)) ?? opt('seed');
  const seed = seedArg !== undefined ? Number(seedArg) >>> 0 : 20260928;
  const games = Math.max(1, Number(opt('games') ?? 10000) | 0);

  const replay = opt('replay');
  if (replay) {
    const [vi, gs] = replay.split(':').map(Number);
    const st = { games: 0, plies: 0, maxLen: 0, checked: 0, fuzz: 0, res: { 0: 0, 1: 0, remis: 0 }, reasons: {} };
    randomGame(D.normalizeOptions(VARIANTS[vi]), gs >>> 0, st);
    console.log(`✅ Partie nachgespielt (${vname(VARIANTS[vi])}): ${st.plies} Halbzüge, ${JSON.stringify(st.reasons)}`);
    return;
  }

  const nWorkers = Math.min(4, availableParallelism());
  console.log(`Dame-Schwarm: Seed ${seed} (ändern: node tests/node/dame.swarm.test.mjs <seed>), ${games} Partien je Variante, ${nWorkers} Worker`);

  // Bot-Prüfungen: [Stufe, Hausregeln kurz+pusten, Partien, Mindest-Siegquote]
  const BOTS = [[2, false, 100, 0.9], [3, false, 10, null], [2, true, 20, 0.9]];
  // lange Jobs zuerst (Bot level 3), dann Bot level 2, dann Zufallspartien in Blöcken
  const jobs = [];
  for (const [level, house, total] of [...BOTS].sort((a, b) => b[0] - a[0])) {
    const step = level === 3 ? 1 : 10;
    for (const rules of ['deutsch', 'international']) {
      for (let g = 0; g < total; g += step) jobs.push({ kind: 'bot', level, house, rules, start: g, count: Math.min(step, total - g), seed });
    }
  }
  const CHUNK = 250;
  VARIANTS.forEach((_, vi) => {
    for (let g = 0; g < games; g += CHUNK) jobs.push({ kind: 'random', vi, start: g, count: Math.min(CHUNK, games - g), seed });
  });

  const out = [];
  await new Promise((resolve, reject) => {
    let next = 0, alive = 0;
    for (let k = 0; k < nWorkers; k++) {
      const w = new Worker(new URL(import.meta.url));
      let done = false;
      alive++;
      const feed = () => {
        if (next < jobs.length) return w.postMessage(jobs[next++]);
        done = true;
        w.terminate().then(() => --alive === 0 && resolve());
      };
      w.on('message', (msg) => {
        out.push(msg);
        feed();
      });
      w.on('error', reject);
      w.on('exit', (code) => !done && reject(new Error(`Worker unerwartet beendet (Code ${code})`)));
      feed();
    }
  });

  let bad = 0;
  const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
  console.log('\nZufallspartien (Invarianten nach jedem Halbzug, Referenz-Gegenprobe, Fuzz):');
  VARIANTS.forEach((o, vi) => {
    const parts = out.filter((x) => x.job.kind === 'random' && x.job.vi === vi);
    const sum = { games: 0, plies: 0, maxLen: 0, checked: 0, fuzz: 0, res: { 0: 0, 1: 0, remis: 0 }, reasons: {}, errors: [], ms: 0 };
    for (const { r, ms } of parts) {
      sum.games += r.games;
      sum.plies += r.plies;
      sum.checked += r.checked;
      sum.fuzz += r.fuzz;
      sum.maxLen = Math.max(sum.maxLen, r.maxLen);
      for (const k of ['0', '1', 'remis']) sum.res[k] += r.res[k];
      for (const [k, v] of Object.entries(r.reasons)) sum.reasons[k] = (sum.reasons[k] || 0) + v;
      sum.errors.push(...r.errors);
      sum.ms += ms;
    }
    const good = sum.errors.length === 0 && sum.games === games;
    if (!good) bad++;
    const reasons = REASONS.filter((k) => sum.reasons[k]).map((k) => `${k} ${sum.reasons[k]} (${pct(sum.reasons[k], sum.games)})`).join(', ');
    console.log(`${good ? '✅' : '❌'} ${vname(o).padEnd(33)} ${sum.games} Partien | Weiß ${pct(sum.res[0], sum.games)}, Schwarz ${pct(sum.res[1], sum.games)}, Remis ${pct(sum.res.remis, sum.games)} | ${reasons} | Länge Ø ${(sum.plies / Math.max(1, sum.games)).toFixed(1)}, max ${sum.maxLen} | ${sum.checked} Halbzüge geprüft, ${sum.fuzz} Fuzz-Züge abgelehnt | ${(sum.ms / 1000).toFixed(1)} s Rechenzeit`);
    for (const e of sum.errors.slice(0, 5)) console.log(`   ${e}`);
  });

  console.log('\nBot-Prüfung (Farben abwechselnd):');
  for (const [level, house, total, quota] of BOTS) {
    for (const rules of ['deutsch', 'international']) {
      const parts = out.filter((x) => x.job.kind === 'bot' && x.job.level === level && x.job.house === house && x.job.rules === rules);
      const s = { games: 0, win: 0, draw: 0, loss: 0, plies: 0, moves: 0, sumMs: 0, maxMs: 0, errors: [], ms: 0 };
      for (const { r, ms } of parts) {
        for (const k of ['games', 'win', 'draw', 'loss', 'plies', 'moves', 'sumMs']) s[k] += r[k];
        s.maxMs = Math.max(s.maxMs, r.maxMs);
        s.errors.push(...r.errors);
        s.ms += ms;
      }
      const limit = (level === 3 ? 100 : 400) + 50;
      // Stufe 2: Mindest-Siegquote; Stufe 3 gegen Stufe 1: Bilanz, mehr Siege als Niederlagen
      const good = s.errors.length === 0 && s.maxMs <= limit && s.games === total && (quota ? s.win >= quota * total : s.win > s.loss);
      if (!good) bad++;
      const label = (level === 2 ? 'Stufe 2 gg. Zufall' : 'Stufe 3 (100 ms) gg. Stufe 1') + (house ? ' (kurz+pusten)' : '');
      console.log(`${good ? '✅' : '❌'} ${rules.padEnd(13)} ${label.padEnd(33)}: ${s.win} Siege, ${s.draw} Remis, ${s.loss} Niederlagen von ${s.games} (${pct(s.win, s.games)}) | Bot-Zug Ø ${(s.sumMs / Math.max(1, s.moves)).toFixed(1)} ms, max ${s.maxMs.toFixed(0)} ms (Grenze ${limit}) | Länge Ø ${(s.plies / Math.max(1, s.games)).toFixed(0)} | ${(s.ms / 1000).toFixed(1)} s`);
      for (const e of s.errors.slice(0, 5)) console.log(`   ${e}`);
    }
  }

  console.log(`\n${bad ? `❌ ${bad} Prüfgruppe(n) fehlgeschlagen` : '✅ alles grün'} – Gesamtlaufzeit ${((performance.now() - t0) / 1000).toFixed(1)} s (Seed ${seed})`);
  process.exitCode = bad ? 1 : 0;
}
