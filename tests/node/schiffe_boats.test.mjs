// Kriegsschiffe der Schiffe-Ansicht (n8): Typ-Tabelle passt zu den Flotten, jeder Typ hat seine Aufbauten, und kein
// Rumpf ragt über die eigenen Felder – auch nicht beim Schaukeln (Drehung ±deg, Versatz ±d) oder als schräges Wrack.
// Aufruf: node tests/node/schiffe_boats.test.mjs
import assert from 'node:assert/strict';
import { FLEETS } from '../../src/games/schiffe/engine.js';
import { TYPES, WRECK, MIN_EDGE, EDGE, typeOf, outline, wake, details, wreckTilt, rhythm } from '../../src/games/schiffe/boats.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { const info = fn(); passed++; console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) {
    failed++; console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 4).join('\n   ')}`);
  }
}

const shipsAll = [];
for (const [fl, list] of Object.entries(FLEETS)) list.forEach((sh, k) => shipsAll.push({ fl, k, name: sh.name, len: sh.len, type: typeOf(sh.name, sh.len) }));

// schlimmster Fall: Punkte um die Schiffsmitte gedreht (±deg) und verschoben (±d in x und y)
function extent(pts, len, deg, d) {
  const cx = len / 2, cy = 0.5;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const a of [-deg, -deg / 2, 0, deg / 2, deg]) {
    const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    for (const [x, y] of pts) {
      const X = cx + (x - cx) * c - (y - cy) * s, Y = cy + (x - cx) * s + (y - cy) * c;
      x0 = Math.min(x0, X - d); x1 = Math.max(x1, X + d); y0 = Math.min(y0, Y - d); y1 = Math.max(y1, Y + d);
    }
  }
  return { x0, x1, y0, y1 };
}

test('jedes Schiff beider Flotten hat einen eigenen Typ aus der Tabelle', () => {
  for (const s of shipsAll) assert.ok(TYPES[s.type] && TYPES[s.type].name === s.name, `${s.fl}/${s.k} ${s.name} → ${s.type}`);
  const types = new Set(shipsAll.map((s) => s.type));
  assert.equal(types.size, 6);
  return [...types].join(', ');
});

test('Rumpf bleibt beim Schaukeln mindestens 13 % vom Feldrand weg (wie bisher ~14 %)', () => {
  let worst = 1;
  for (const s of shipsAll) {
    const o = outline(s.type, s.len), rk = TYPES[s.type].rock;
    const e = extent(o.pts, s.len, rk.deg, rk.d);
    const m = Math.min(e.x0, s.len - e.x1, e.y0, 1 - e.y1);
    worst = Math.min(worst, m);
    assert.ok(m >= MIN_EDGE - 1e-9, `${s.name} (${s.len}): Rand ${m.toFixed(3)}`);
  }
  return `knappster Abstand ${(worst * 100).toFixed(1)} % eines Felds`;
});

test('Wrack: Schräglage + träges Schaukeln bleibt in den Feldern', () => {
  const tilts = [];
  for (const s of shipsAll) {
    const t = wreckTilt(s.type, s.len);
    const e = extent(outline(s.type, s.len).pts, s.len, t + WRECK.deg, WRECK.d);
    const m = Math.min(e.x0, s.len - e.x1, e.y0, 1 - e.y1);
    assert.ok(m >= MIN_EDGE - 1e-9, `${s.name} (${s.len}) Wrack ${t}°: Rand ${m.toFixed(3)}`);
    assert.ok(t >= 0.3, `${s.name}: sichtbar schräg (${t}°)`);
    tilts.push(`${s.name.slice(0, 6)}${s.len} ${t}°`);
  }
  return [...new Set(tilts)].join(', ');
});

test('Bug- und Heckwelle bleiben in den eigenen Feldern', () => {
  for (const s of shipsAll) {
    const w = wake(s.type, s.len), rk = TYPES[s.type].rock;
    const e = extent(w.pts, s.len, rk.deg, rk.d);
    assert.ok(Math.min(e.x0, s.len - e.x1, e.y0, 1 - e.y1) >= EDGE - 0.02, `${s.name}: Welle am Rand`);
  }
});

test('Silhouetten unterscheiden sich: Breite, Türme, Aufbauten je Typ', () => {
  const tu = (type, len, simple = false) => (details(type, len, { simple }).match(/class="tu"/g) || []).length;
  assert.equal(tu('schlacht', 5), 4); assert.equal(tu('schlacht', 4), 3);
  assert.equal(tu('kreuzer', 4), 3); assert.equal(tu('zerstoerer', 3), 2);
  assert.equal(tu('uboot', 3), 1); assert.equal(tu('schnell', 2), 1); assert.equal(tu('traeger', 5), 0);
  assert.equal(tu('schlacht', 5, true), 4, 'Mini-Karte: Türme als Punkte');
  // Rohre: Drilling (Schlachtschiff), Zwilling (Kreuzer), einzeln (Zerstörer)
  const barrels = (type, len) => (details(type, len).match(/stroke-linecap="round"\/>/g) || []).length;
  assert.ok(barrels('schlacht', 5) >= 12 && barrels('kreuzer', 4) >= 6);
  assert.match(details('traeger', 5), /stroke-dasharray/, 'Träger: Mittellinie');
  assert.match(details('traeger', 5), /rotate\(8\)/, 'Träger: Flugzeuge');
  assert.match(details('uboot', 3), /opacity="\.32"/, 'U-Boot: überspült');
  const hw = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.hw]));
  assert.ok(hw.schlacht > hw.kreuzer && hw.kreuzer > hw.zerstoerer && hw.zerstoerer > hw.uboot);
  // Mini-Karte: keine Rohre und Kleinteile
  assert.equal((details('schlacht', 5, { simple: true }).match(/stroke-linecap/g) || []).length, 0);
  // Wrack: verkohlt und überspült
  assert.match(details('kreuzer', 4, { wreck: true }), /clip-path/);
  assert.doesNotMatch(details('kreuzer', 4, { wreck: true }), /#a4adb4/, 'Wrack ohne Stahlfarbe');
});

test('keine Flaggen oder Hoheitszeichen (nur Formen, keine Texte/Bilder)', () => {
  for (const t of Object.keys(TYPES)) for (const len of [2, 3, 4, 5]) for (const wreck of [false, true]) {
    const d = details(t, len, { wreck });
    assert.doesNotMatch(d, /<text|<image|flag|star|cross/i);
  }
});

test('Schaukeln: Nachrollen 1,3–1,7 s, jedes Schiff anders, Richtung gemischt', () => {
  const r = [];
  for (let seat = 0; seat < 2; seat++) for (let k = 0; k < 10; k++) r.push(rhythm(k, seat));
  for (const x of r) assert.ok(x.dur >= 1.3 && x.dur <= 1.7 && x.phase >= 0 && x.phase < 1);
  assert.ok(r.some((x) => x.sign > 0) && r.some((x) => x.sign < 0), 'beide Richtungen');
  assert.ok(new Set(r.map((x) => `${x.dur.toFixed(3)}|${x.phase.toFixed(2)}`)).size >= 18, 'Takt je Schiff verschieden');
  for (const t of Object.values(TYPES)) assert.ok(t.rock.deg <= 2 && t.rock.d <= 0.03, `${t.name}: Amplitude ≤ 2° / 3 %`);
  return `Dauer ${Math.min(...r.map((x) => x.dur)).toFixed(1)}–${Math.max(...r.map((x) => x.dur)).toFixed(1)} s`;
});

console.log(`\n${passed} ✅, ${failed} ❌`);
process.exit(failed ? 1 : 0);
