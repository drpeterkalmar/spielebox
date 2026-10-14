// Vibration (n10 E1) – dezent und nur bei großen Momenten: eigener Sieg, „Schach!“, Mühle oder Rauswurf gegen mich.
// Abstand mindestens 1,5 s. Abschaltbar über die Einstellung „Vibration“ (store.settings().vibration === false) und
// per Link ?haptik=0. Geräte ohne navigator.vibrate (iPhone) bleiben still.
import * as store from '../store.js';
import { urlFlag } from './flags.js';
import { HAPTIK } from '../movesound.js';

let last = 0;
const log = [];

export const haptikOn = () => store.settings().vibration !== false && urlFlag('haptik', true);

// p = ms oder Muster [an, aus, an …]
export function buzz(p) {
  const now = Date.now();
  if (!p || !haptikOn() || now - last < HAPTIK.abstand) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  last = now;
  log.push({ p, at: now });
  if (log.length > 20) log.shift();
  try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* egal */ }
  return true;
}

export const haptikLog = () => log.slice();
