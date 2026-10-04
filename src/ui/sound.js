// Leise Geräusche (Web Audio, ohne Dateien): Chips klacken, kleiner Gewinn-Ton. Mittelton (300–700 Hz), kurz und
// leise – gespielt wird am Handy-Lautsprecher. Lautlos-Schalter: iOS audioSession „ambient“. Abschaltbar über die
// Einstellung „Ton“ (store.settings().sound === false). Fehler (kein Audio, gesperrt) werden still ignoriert.
import * as store from '../store.js';

let ctx = null, last = 0;

function audio() {
  if (store.settings().sound === false) return null;
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

// ein kurzer, gedämpfter Klick um f Hz
function click(a, at, f, vol) {
  const o = a.createOscillator(), g = a.createGain(), bp = a.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f, at);
  o.frequency.exponentialRampToValueAtTime(f * 0.7, at + 0.05);
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = 3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  o.connect(bp).connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + 0.08);
}

// Chips: 2–3 leise Klicks (many = Pot wandert)
export function chipSound(many = false) {
  const now = Date.now();
  if (now - last < 120) return;
  last = now;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  const k = many ? 4 : 2;
  for (let i = 0; i < k; i++) click(a, t + i * 0.045, 520 + ((i * 37) % 120), 0.05);
}

// eigener großer Gewinn / Turniersieg: zwei weiche Töne (440 → 660 Hz)
export function winSound() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.02;
  [440, 660].forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.16);
    g.gain.exponentialRampToValueAtTime(0.06, t + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.35);
    o.connect(g).connect(a.destination);
    o.start(t + i * 0.16);
    o.stop(t + i * 0.16 + 0.4);
  });
}
