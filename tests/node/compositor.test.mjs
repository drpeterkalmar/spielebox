// Nur-Compositor-Regeln (n9 E3): will-change nur während einer Animation, CSS-Animationen nur auf transform/opacity.
// Aufruf: node --test tests/node/compositor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackWillChange } from '../../src/ui/svg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

class FakeAnim extends EventTarget {
  constructor() { super(); this.playState = 'running'; }
  end(kind = 'finish') { this.playState = kind === 'finish' ? 'finished' : 'idle'; this.dispatchEvent(new Event(kind)); }
}
const fakeEl = () => { const el = { style: { willChange: '' }, anims: [] }; el.getAnimations = () => el.anims; return el; };

test('trackWillChange: an während der Animation, danach frei', () => {
  const el = fakeEl(), a = new FakeAnim();
  el.anims.push(a);
  assert.equal(trackWillChange(el, a), a);
  assert.equal(el.style.willChange, 'transform');
  a.end();
  assert.equal(el.style.willChange, '');
});

test('trackWillChange: zwei Animationen – frei erst nach der letzten; Abbruch zählt als Ende', () => {
  const el = fakeEl(), a = new FakeAnim(), b = new FakeAnim();
  el.anims.push(a, b);
  trackWillChange(el, a, 'transform, opacity');
  trackWillChange(el, b);
  a.end();
  assert.notEqual(el.style.willChange, '', 'b läuft noch');
  b.end('cancel');
  assert.equal(el.style.willChange, '');
});

test('trackWillChange: ohne Animation (reduzierte Bewegung) nichts tun', () => {
  const el = fakeEl();
  assert.equal(trackWillChange(el, null), null);
  assert.equal(el.style.willChange, '');
});

// CSS: @keyframes dürfen nur transform/opacity (und deren Hilfswerte) ändern; kein dauerhaftes will-change auf Steinen/Karten
test('style.css: Keyframes nur transform/opacity, will-change nicht dauerhaft auf .pc/.card', () => {
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
  const bad = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    for (const d of m[2].matchAll(/\{([^{}]*)\}/g)) {
      for (const decl of d[1].split(';')) {
        const prop = decl.split(':')[0].trim();
        if (prop && !['transform', 'opacity', 'offset', 'animation-timing-function'].includes(prop)) bad.push(`${m[1]}: ${prop}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'Keyframes mit Layout/Paint-Eigenschaften');
  assert.doesNotMatch(css, /\.board \.pc \{ will-change/);
  assert.doesNotMatch(css, /\.board-cards \.card \{ will-change/);
});

// JS: keine Web-Animation auf Layout-Eigenschaften (r, width, height, left, top, stroke-width …)
test('src: element.animate() nur mit transform/opacity', () => {
  const files = ['src/ui/svg.js', 'src/ui/sieg.js', 'src/ui/fxsvg.js', ...['backgammon', 'dame', 'halma', 'holdem', 'ludo', 'maumau', 'muehle', 'paare', 'reversi', 'schach', 'schiffe', 'schnapsen', 'vier', 'wuerfel', 'blackjack'].map((g) => `src/games/${g}/view.js`)];
  const bad = [];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/\.animate\(\s*\[([^\]]*)\]/g)) {
      for (const k of m[1].matchAll(/[{,]\s*([a-zA-Z-]+)\s*:/g)) {
        if (!['transform', 'opacity', 'offset', 'easing', 'composite'].includes(k[1])) bad.push(`${f}: ${k[1]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
