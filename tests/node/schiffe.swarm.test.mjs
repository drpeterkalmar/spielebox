// Schwarm-Test Schiffe versenken: 10 000 ganze Partien (alle 8 Kombinationen aus Flotte klein/groß, Berühren,
// nochmal) mit Zufallsflotten und gemischten Schützen (Zufall, Bot-Stufen 1–3), Invarianten nach JEDEM Zug:
// Flotten gültig und unverändert, Treffer genau dann, wenn Schiffsfeld, Trefferzahl je Schiff stimmt, versenkt genau
// dann, wenn alle Felder getroffen, kein Feld doppelt beschossen, Ende genau bei voller Versenkung, Sicht verrät nie
// ein unversenktes fremdes Schiff (Zwilling mit verschobenen Schiffen ergibt dieselbe Sicht-JSON), Engine auf der
// Sicht wie auf dem vollen Zustand, grid-Schlüsse stimmen mit der echten Flotte, publicMove ohne Koordinaten,
// isLegal lehnt Müll/verfälschte Züge ab, positionKey/JSON-Rundreise stabil.
// 10 000 Partien sind billig (≈ 130 Züge je Partie, reine Arrays): verteilt auf 2 Worker (8-GB-Mac, mehrere Agenten).
// Aufruf: node tests/node/schiffe.swarm.test.mjs [seed] [--games=10000] [--workers=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import * as S from '../../src/games/schiffe/engine.js';
import { chooseMove } from '../../src/games/schiffe/bot.js';
import { mulberry32 } from '../../src/rng.js';

const OPTS = [];
for (const flotte of ['klein', 'gross']) for (const beruehren of [false, true]) for (const nochmal of [false, true]) {
  OPTS.push({ flotte, beruehren, nochmal });
}
const SHOOTERS = ['zufall', 'zufall', 1, 2, 3];

function mix(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const fail = msg => { throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

if (isMainThread) await main();
else parentPort.on('message', task => parentPort.postMessage(runTask(task, workerData.seed)));

// ---------- Worker ----------

function runTask(task, seed) {
  const st = { games: 0, moves: 0, shots: 0, hits: 0, sinks: 0, views: 0, twins: 0, fuzz: 0, gridCells: 0, maxMoves: 0,
    winsBy: [0, 0], byOpt: {} };
  let g = task.from;
  try {
    for (; g < task.to; g++) playGame(g, seed, st);
    return st;
  } catch (e) {
    return { error: `Partie ${g}: ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n')}` };
  }
}

const strip = f => f.map(({ r, c, len, dir }) => ({ r, c, len, dir }));

function placement(opts, rng, s) {
  const k = rng();
  if (k < 0.15) return S.legalMoves(s)[0];
  if (k < 0.3) return chooseMove(S.viewFor(s, s.turn), { level: 3, rng });
  // Zufallsflotte, Schiffe in zufälliger Reihenfolge
  const ships = S.randomFleet(opts, rng);
  for (let i = ships.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ships[i], ships[j]] = [ships[j], ships[i]]; }
  return { type: 'place', ships };
}

function shooter(kind, rng, view) {
  if (kind === 'zufall') return pick(rng, S.legalMoves(view));
  return chooseMove(view, { level: kind, rng });
}

function playGame(g, seed, st) {
  const rng = mulberry32(mix(seed, g));
  const opts = OPTS[g % OPTS.length];
  const kinds = [pick(rng, SHOOTERS), pick(rng, SHOOTERS)];
  const fleetLen = S.FLEETS[opts.flotte].length, total = S.fleetCells(opts);
  let s = S.initialState(opts);
  let placed = [null, null];
  let n = 0;
  check(s, opts, placed, rng, st);
  while (!S.result(s)) {
    if (++n > 205) fail('Partie endet nicht');
    const p = S.currentPlayer(s), view = S.viewFor(s, p);
    const m = s.phase === 'place' ? placement(opts, rng, s) : shooter(kinds[p], rng, view);
    if (!S.isLegal(s, m) || !S.isLegal(view, m)) fail(`illegaler Zug ${JSON.stringify(m)}`);
    fuzz(s, view, m, rng, st);
    if (m.type === 'place') {
      const pm = JSON.stringify(S.publicMove(m));
      if (pm !== '{"type":"place"}') fail(`publicMove verrät: ${pm}`);
      if (S.describeMove(s, m) !== 'Flotte gesetzt') fail('describeMove place');
    } else {
      eq(S.publicMove(m), m, 'publicMove Schuss');
    }
    const before = s;
    const desc = S.describeMove(s, m);
    s = S.applyMove(s, m);
    st.moves++;
    if (m.type === 'place') {
      if (!S.validFleet(opts, strip(s.fleets[p]))) fail('gesetzte Flotte ungültig');
      placed[p] = JSON.stringify(strip(s.fleets[p]));
      if (s.fleets[p].length !== fleetLen) fail('Flottenlänge');
    } else {
      st.shots++;
      const rec = s.shots[p].at(-1);
      if (rec.i !== m.i) fail('Schuss nicht protokolliert');
      const isShip = before.fleets[1 - p].some(x => S.cells(x).includes(m.i));
      if (rec.hit !== isShip) fail('Treffer ≠ Schiffsfeld');
      if (rec.hit) st.hits++;
      if (rec.sunk !== null) st.sinks++;
      // Text passt zum Ergebnis
      const want = !rec.hit ? ': Wasser' : rec.sunk !== null ? `: Treffer, versenkt (${S.shipName(opts, rec.sunk)})` : ': Treffer';
      if (desc !== S.cellName(m.i) + want) fail(`describeMove ${desc}`);
      // Schussfolge
      const over = s.phase === 'over';
      const next = over ? null : rec.hit && opts.nochmal ? p : 1 - p;
      if (S.currentPlayer(s) !== next) fail('falscher Schütze danach');
      if (over && remainingTrue(s, 1 - p) !== 0) fail('Ende ohne volle Versenkung');
    }
    check(s, opts, placed, rng, st);
  }
  const w = S.result(s).winner;
  if (s.sunk[w].length !== fleetLen || S.remaining(s, 1 - w) !== 0) fail('Sieger falsch');
  if (S.evaluate(s, w) !== S.remaining(s, w) || S.remaining(s, w) > total) fail('evaluate am Ende');
  st.games++;
  st.winsBy[w]++;
  st.maxMoves = Math.max(st.maxMoves, n);
  const key = `${opts.flotte}${opts.beruehren ? '+b' : ''}${opts.nochmal ? '+n' : ''}`;
  st.byOpt[key] = (st.byOpt[key] || 0) + 1;
}

// echte ungetroffene Schiffsfelder (aus der Flotte, nicht aus der öffentlichen Rechnung)
const remainingTrue = (s, q) => s.fleets[q].reduce((a, x) => a + x.len - x.hits, 0);

function check(s, opts, placed, rng, st) {
  const js = JSON.stringify(s), back = JSON.parse(js);
  if (JSON.stringify(back) !== js) fail('JSON-Rundreise');
  if (S.positionKey(back) !== S.positionKey(s)) fail('positionKey instabil');
  const ev0 = S.evaluate(s, 0), ev1 = S.evaluate(s, 1);
  if (!Number.isFinite(ev0) || ev0 + ev1 !== 0) fail('evaluate nicht symmetrisch');
  for (const q of [0, 1]) {
    const p = 1 - q;            // p schießt auf q
    const fleet = s.fleets[q];
    const shots = s.shots[p];
    if (new Set(shots.map(x => x.i)).size !== shots.length) fail('Feld doppelt beschossen');
    if (!fleet) { if (shots.length) fail('Schuss ohne Flotte'); continue; }
    if (JSON.stringify(strip(fleet)) !== placed[q]) fail('Flotte verändert');
    const owner = new Array(100).fill(-1);
    fleet.forEach((x, k) => S.cells(x).forEach(i => { owner[i] = k; }));
    const hits = fleet.map(() => 0), sunkOrder = [];
    for (const x of shots) {
      if (x.hit !== (owner[x.i] >= 0)) fail('Treffer-Eintrag falsch');
      if (x.hit) hits[owner[x.i]]++;
      if (x.sunk !== null) {
        if (x.sunk !== owner[x.i] || hits[x.sunk] !== fleet[x.sunk].len) fail('versenkt zu früh/falsch');
        sunkOrder.push(x.sunk);
      } else if (x.hit && hits[owner[x.i]] === fleet[owner[x.i]].len) fail('versenkt nicht gemeldet');
    }
    fleet.forEach((x, k) => { if (x.hits !== hits[k]) fail(`hits Schiff ${k}`); });
    eq(s.sunk[p], sunkOrder, 'sunk-Liste');
    if (S.remaining(s, q) !== remainingTrue(s, q)) fail('remaining ≠ echte Restfelder');
    const all = s.sunk[p].length === fleet.length;
    if (all !== (s.phase === 'over' && s.winner === p)) fail('Ende ⇔ volle Versenkung verletzt');
  }
  if (s.phase === 'over' && s.sunk[s.winner].length !== s.fleets[1 - s.winner].length) fail('Ende ohne Versenkung');
  checkViews(s, rng, st);
}

function checkViews(s, rng, st) {
  const over = s.phase === 'over';
  const p = S.currentPlayer(s);
  // schnelle Prüfungen für alle drei Sichten, gründliche (revealed, Zwilling, grid) für eine zufällige je Zug
  const deep = pick(rng, [0, 1, null]);
  for (const seat of [0, 1, null]) {
    const v = S.viewFor(s, seat);
    st.views++;
    for (const q of [0, 1]) {
      const visible = over || q === seat;
      if (!visible && v.fleets[q] !== null) fail(`Sicht ${seat} zeigt Flotte ${q}`);
      if (visible && (v.fleets[q] === null) !== (s.fleets[q] === null)) fail('eigene Flotte fehlt in der Sicht');
      if (v.revealed[q].length !== s.sunk[1 - q].length) fail('revealed-Länge');
    }
    for (const k of [0, 1]) if (S.evaluate(v, k) !== S.evaluate(s, k)) fail('evaluate Sicht ≠ voll');
    if (seat !== deep) continue;
    for (const q of [0, 1]) {
      if (over || q === seat) eq(v.fleets[q], s.fleets[q], 'offene Flotte in der Sicht');
      const fleet = s.fleets[q];
      eq(v.revealed[q], (s.sunk[1 - q] || []).map(k => ({ k, r: fleet[k].r, c: fleet[k].c, len: fleet[k].len, dir: fleet[k].dir })), 'revealed');
    }
    eq(v.shots, s.shots, 'Schüsse öffentlich');
    eq(S.result(v), S.result(s), 'result auf Sicht');
    // Zwilling: unversenkte fremde Schiffe woandershin – die Sicht darf sich nicht ändern
    if (!over) {
      const twin = { ...s, fleets: s.fleets.map((f, q) => {
        if (!f || q === seat) return f;
        const sunk = new Set(s.sunk[1 - q]);
        return f.map((x, k) => (sunk.has(k) ? x : { ...x, r: (x.r + 3) % 10, c: (x.c + 7) % 10, dir: x.dir === 'h' ? 'v' : 'h' }));
      }) };
      if (JSON.stringify(S.viewFor(twin, seat)) !== JSON.stringify(v)) fail(`Sicht ${seat} hängt von verdeckten Schiffen ab`);
      st.twins++;
    }
    // grid-Schlüsse (bekanntes Schiff/Wasser) stimmen mit der echten Flotte
    for (const owner of [0, 1]) {
      if (!s.fleets[owner]) continue;
      const real = new Array(100).fill(false);
      for (const x of s.fleets[owner]) for (const i of S.cells(x)) real[i] = true;
      const gr = S.grid(v, owner, seat);
      for (let i = 0; i < 100; i++) {
        const x = gr[i];
        if (x.ship === true && !real[i]) fail(`grid: Schiff ${i}, das keins ist`);
        if (x.ship === false && real[i]) fail(`grid: Wasser ${i}, das Schiff ist`);
        if (owner !== seat && !over && x.ship === true && x.shot !== 'hit') fail('grid verrät ungetroffenes Schiff');
      }
      st.gridCells += 100;
    }
  }
  // Engine auf der Sicht des Sitzes am Zug
  if (p !== null) {
    const v = S.viewFor(s, p);
    if (S.currentPlayer(v) !== p) fail('currentPlayer auf Sicht');
    const a = S.legalMoves(v), b = S.legalMoves(s);
    if (a.length !== b.length || (s.phase === 'shoot' && a.some((m, j) => m.i !== b[j].i))) fail('legalMoves auf Sicht');
    if (s.phase === 'place') eq(a, b, 'Beispiel-Flotte auf Sicht');
  } else if (S.legalMoves(s).length) fail('Züge nach dem Ende');
}

function fuzz(s, view, m, rng, st) {
  const bad = [null, 7, 'shot', [], {}, { type: 'shot' }, { type: 'shot', i: 100 }, { type: 'shot', i: -1 },
    { type: 'shot', i: 2.5 }, { type: 'shot', i: '4' }, { type: 'boom', i: 3 }, { ...m, extra: 1 }];
  if (s.phase === 'shoot') {
    const done = s.shots[s.turn];
    if (done.length) bad.push({ type: 'shot', i: pick(rng, done).i });
    bad.push({ type: 'place', ships: strip(s.fleets[s.turn]) });
  } else {
    const ships = m.ships.map(x => ({ ...x }));
    const k = Math.floor(rng() * ships.length);
    const kind = Math.floor(rng() * 5);
    if (kind === 0) ships.pop();
    else if (kind === 1) ships[k].len += 1;
    else if (kind === 2) ships[k] = { ...ships[(k + 1) % ships.length] };       // Überlappung
    else if (kind === 3) ships[k].dir = 'd';
    else ships[k].x = 1;
    bad.push({ type: 'place', ships }, { type: 'shot', i: 0 }, { type: 'place' });
  }
  for (const b of bad) {
    if (S.isLegal(s, b) || S.isLegal(view, b)) fail(`Müll akzeptiert: ${JSON.stringify(b)}`);
    st.fuzz++;
  }
}

// ---------- Hauptprozess ----------

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
  const seed = Number(args.find(x => /^\d+$/.test(x)) ?? 20261001);
  const GAMES = opt('games', 10000);
  const W = Math.max(1, Math.min(opt('workers', 2), 2, os.availableParallelism?.() ?? 2));
  const t0 = performance.now();
  const tasks = [];
  const CH = 250;
  for (let i = 0; i < GAMES; i += CH) tasks.push({ from: i, to: Math.min(GAMES, i + CH) });
  const results = [];
  await new Promise((resolve, reject) => {
    let next = 0, busy = 0;
    const workers = Array.from({ length: W }, () => new Worker(new URL(import.meta.url), { workerData: { seed } }));
    const feed = w => {
      if (next < tasks.length) { const t = tasks[next++]; busy++; w.once('message', res => { busy--; results.push(res); feed(w); }); w.postMessage(t); }
      else { w.terminate(); if (!busy && results.length === tasks.length) resolve(); }
    };
    for (const w of workers) { w.on('error', reject); feed(w); }
  });
  let passed = 0, failed = 0;
  const ok = (name, fn) => {
    try { const info = fn(); passed++; console.log(`✅ ${name}${info ? ` (${info})` : ''}`); }
    catch (e) { failed++; console.log(`❌ ${name}\n   ${String((e && e.message) || e).split('\n').slice(0, 8).join('\n   ')}`); }
  };
  const errs = results.filter(r => r.error);
  const sw = results.filter(r => !r.error);
  const sum = k => sw.reduce((a, r) => a + r[k], 0);
  const byOpt = {};
  for (const r of sw) for (const [k, v] of Object.entries(r.byOpt)) byOpt[k] = (byOpt[k] || 0) + v;
  ok(`Schwarm ${GAMES} Partien: Flotten gültig, Treffer ⇔ Schiffsfeld, versenkt ⇔ alle Felder, Ende ⇔ volle Versenkung`, () => {
    if (errs.length) throw new Error(errs.map(r => r.error).join('\n'));
    if (sum('games') !== GAMES) throw new Error(`${sum('games')} von ${GAMES}`);
    if (Object.keys(byOpt).length !== 8) throw new Error('nicht alle Optionen gespielt');
    return `${sum('moves')} Züge, ${sum('shots')} Schüsse, ${sum('hits')} Treffer, ${sum('sinks')} versenkt, ` +
      `längste Partie ${Math.max(...sw.map(r => r.maxMoves))} Züge, Siege Sitz 0 : Sitz 1 = ${sw.reduce((a, r) => [a[0] + r.winsBy[0], a[1] + r.winsBy[1]], [0, 0]).join(' : ')}`;
  });
  ok('Sicht verrät nie unversenkte fremde Schiffe (Zwillings-Vergleich), Engine auf der Sicht wie voll, grid-Schlüsse richtig', () => {
    if (errs.length) throw new Error('siehe oben');
    if (!(sum('twins') > 0 && sum('views') > 0)) throw new Error('nichts geprüft');
    return `${sum('views')} Sichten, ${sum('twins')} Zwillinge, ${sum('gridCells')} grid-Felder`;
  });
  ok('isLegal lehnt Müll und verfälschte Züge ab (Sicht und voller Zustand), publicMove ohne Koordinaten', () => {
    if (errs.length) throw new Error('siehe oben');
    if (!(sum('fuzz') > 0)) throw new Error('kein Fuzz');
    return `${sum('fuzz')} illegale Züge abgelehnt`;
  });
  console.log(`\n${passed} ✅, ${failed} ❌ (Seed ${seed}, ${W} Worker, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failed ? 1 : 0);
}
