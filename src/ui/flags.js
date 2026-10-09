// URL-Regler für A/B-Vergleiche (Technik n9): ?atlas=0 (Einzelkarten statt Atlas), ?sprites=0 (Steine als Vektor),
// ?material=0|1 (vorgebackene Licht-Ebene auf Holz/Filz). '0' = aus, '1' = an, sonst gilt der Standard.
export function urlFlag(name, dflt = true) {
  try {
    const v = new URLSearchParams(globalThis.location?.search || '').get(name);
    return v === '0' ? false : v === '1' ? true : dflt;
  } catch { return dflt; }
}
