// Kleiner, reproduzierbarer Zufallsgenerator (mulberry32) für Bots und Tests.
// rng() liefert Zahlen in [0, 1); mit gleichem Seed immer dieselbe Folge.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ganzzahl in [0, n)
export const randInt = (rng, n) => Math.floor(rng() * n);

// zufälliges Element einer Liste
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
