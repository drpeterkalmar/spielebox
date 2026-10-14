// Leise Geräusche (Web Audio, ohne Dateien): Steine klacken, Karten wischen, Würfel rattern, Chips klacken, kleiner
// Gewinn-Ton. Mittelton (300–700 Hz), kurz und leise (Spitze ≤ −12 dBFS) – gespielt wird am Handy-Lautsprecher.
// Lautlos-Schalter: iOS audioSession „ambient“. Abschaltbar über die Einstellung „Ton“ (store.settings().sound === false)
// und per Link ?ton=0. Höchstens ein Ton je 120 ms. Fehler (kein Audio, gesperrt) werden still ignoriert.
// n10 E1: alle Klänge über synth(), das in jeden Audio-Kontext zeichnen kann (auch OfflineAudioContext → Messung).
import * as store from '../store.js';
import { urlFlag } from './flags.js';
import { MIN_GAP } from '../movesound.js';

let ctx = null, last = 0, count = 0;
const log = [];   // die letzten gespielten Töne (Tests: __box.sounds())

export const soundOn = () => store.settings().sound !== false && urlFlag('ton', true);

function audio() {
  if (!soundOn()) return null;
  if (typeof document !== 'undefined' && document.hidden) return null;
  try {
    if (!ctx) {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

// Rauschen (1 s) je Kontext einmal
const noiseOf = new WeakMap();
function noise(a) {
  let b = noiseOf.get(a);
  if (!b) {
    b = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = b.getChannelData(0);
    let x = 0x2545f491;
    for (let i = 0; i < d.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 4294967296) * 2 - 1; }
    noiseOf.set(a, b);
  }
  return b;
}

// Hüllkurve: schnell an, exponentiell aus
function env(a, at, peak, attack, len) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  return g;
}

// ein kurzer, gedämpfter Klick um f Hz (Dreieck durch Bandpass)
function click(a, out, at, f, vol, len = 0.07) {
  const o = a.createOscillator(), g = env(a, at, vol, 0.004, len), bp = a.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f, at);
  o.frequency.exponentialRampToValueAtTime(f * 0.7, at + 0.05);
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = 3;
  o.connect(bp).connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.01);
}

// gefiltertes Rauschen (Wisch, Platsch, Anschlag eines Steins)
// (zwei Bandpässe hintereinander: die Energie bleibt im Mittelton, kein Zischen)
function hiss(a, out, at, { f0, f1 = f0, q = 1.2, vol, len, attack = 0.006 }) {
  const n = a.createBufferSource(), g = env(a, at, vol, attack, len);
  n.buffer = noise(a);
  let node = n;
  for (let k = 0; k < 2; k++) {
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, at);
    bp.frequency.exponentialRampToValueAtTime(f1, at + len);
    node = node.connect(bp);
  }
  node.connect(g).connect(out);
  n.start(at, (at * 0.37) % 0.8);
  n.stop(at + len + 0.01);
}

// Holz-Klack: kurzer Ton + Anschlag (Rauschen), um f Hz
function knock(a, out, at, f, vol) {
  click(a, out, at, f, vol, 0.06);
  hiss(a, out, at, { f0: f * 1.1, q: 2.5, vol: vol * 0.7, len: 0.03, attack: 0.002 });
}

// Klang kind ab Zeit at in den Kontext a zeichnen (out = Ziel, sonst a.destination); rnd für Würfel-Streuung.
// Lautstärken so gewählt, dass die Spitze unter −12 dBFS bleibt (tests: OfflineAudioContext + FFT).
export function synth(a, kind, at = a.currentTime, { out = a.destination, rnd = Math.random } = {}) {
  switch (kind) {
    case 'klack': knock(a, out, at, 520, 0.09); return 0.07;
    case 'kipp': click(a, out, at, 620, 0.045, 0.045); return 0.05;
    case 'schlag': knock(a, out, at, 380, 0.1); knock(a, out, at + 0.07, 480, 0.07); return 0.14;
    case 'karte': hiss(a, out, at, { f0: 680, f1: 400, q: 2.2, vol: 0.5, len: 0.085, attack: 0.012 }); return 0.09;
    case 'platsch': hiss(a, out, at, { f0: 560, f1: 330, q: 1.8, vol: 0.45, len: 0.16, attack: 0.008 }); return 0.17;
    case 'tock': knock(a, out, at, 340, 0.1); return 0.07;
    case 'wuerfel': {
      const k = 3 + Math.floor(rnd() * 3);
      let t = at;
      for (let i = 0; i < k; i++) { click(a, out, t, 450 + rnd() * 200, 0.06 - i * 0.006, 0.05); t += 0.045 + rnd() * 0.03; }
      return t - at + 0.05;
    }
    case 'chip': case 'chips': {
      const k = kind === 'chips' ? 4 : 2;
      for (let i = 0; i < k; i++) click(a, out, at + i * 0.045, 520 + ((i * 37) % 120), 0.05);
      return k * 0.045 + 0.07;
    }
    case 'sieg':
      [440, 660].forEach((f, i) => {
        const o = a.createOscillator(), g = env(a, at + i * 0.16, 0.06, 0.02, 0.35);
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(g).connect(out);
        o.start(at + i * 0.16);
        o.stop(at + i * 0.16 + 0.4);
      });
      return 0.52;
  }
  return 0;
}

// einen Ton jetzt spielen (fällt weg, wenn der letzte weniger als MIN_GAP ms her ist – außer dem Sieg-Ton)
export function play(kind) {
  const now = Date.now();
  if (kind !== 'sieg' && now - last < MIN_GAP) return false;
  const a = audio();
  if (!a) return false;
  last = now;
  try { synth(a, kind, a.currentTime + 0.01); } catch { return false; }
  log.push({ k: kind, at: now, n: ++count });
  if (log.length > 60) log.shift();
  return true;
}

export const soundLog = () => log.slice();

// Chips: 2–3 leise Klicks (many = Pot wandert)
export function chipSound(many = false) { play(many ? 'chips' : 'chip'); }

// eigener großer Gewinn / Turniersieg: zwei weiche Töne (440 → 660 Hz)
export function winSound() { play('sieg'); }
