// URL-Regler für A/B-Vergleiche (Technik n9): ?atlas=1 (Karten aus dem Atlas statt Einzeldateien), ?sprites=0 (Steine als Vektor),
// ?material=0|1 (vorgebackene Licht-Ebene auf Holz/Filz). '0' = aus, '1' = an, sonst gilt der Standard.
// Material (n9 E2): vorgebackene Licht-Ebene über Holz/Filz + Fase. Standard an seit der Abnahme am Bild (09.10.,
// tests/shots/technik/mat_*). Hier statt in material.js, damit svg.js es ohne Import-Kreis fragen kann.
export const MATERIAL_DEFAULT = true;
export const useMaterial = () => urlFlag('material', MATERIAL_DEFAULT);

export function urlFlag(name, dflt = true) {
  try {
    const v = new URLSearchParams(globalThis.location?.search || '').get(name);
    return v === '0' ? false : v === '1' ? true : dflt;
  } catch { return dflt; }
}
