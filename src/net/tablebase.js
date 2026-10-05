// Grundbausteine des Tisch-Protokolls, gemeinsam für table.js, fairhost.js und takeover.js (ohne Ring-Import).
export const TIMING = {
  heartbeat: 4000,   // Host meldet sich regelmäßig (Stand seq/epoch, Anwesenheit)
  hostGone: 45000,   // so lange kein Host → sitzender Spieler mit Zustand übernimmt (> 3 Relay-Herzschläge)
  takeoverStep: 5000, // … gestaffelt: je Mensch, der in Sitzfolge nach dem Host vor einem sitzt, so viel später
  moveRetry: 5000,   // unbestätigten Zug erneut senden
  // Mindest-Denkzeit des Computers, wenn kein botDelayFor gesetzt ist (Node-Tests: 0). Peter 29.09. abends:
  // „Computer langsamere Zuggeschwindigkeit“ → 1500 ms (bis 29.09.: 450). A/B: ?botms=450.
  // In der App setzt app.js session.botDelayFor aus der Einstellung „Computer-Tempo“ (src/tempo.js).
  botDelay: (() => { try { const v = parseInt(new URLSearchParams(globalThis.location?.search || '').get('botms'), 10); return v >= 0 ? v : 1500; } catch { return 1500; } })(),
  relayAfter: 12000, // wie NetLink: so lange ohne Direktweg zur wichtigen Gegenstelle → Relay zuschalten
  fairWait: 12000,   // so lange auf Kettenglieder/Commits der Mitspieler warten, dann Host-Zufall (als ungeprüft markiert)
  timerGrace: 1500,  // Zeitlimit: Zuschlag für Netz-Verzögerung (die Uhr beim Spieler startet etwas später)
  awayMove: 10000,   // Spieler nicht erreichbar UND so lange stumm: dann automatischer Zug (bis 05.10.: 3000 – kürzer als
                     // ein Wiederaufbau nach App-Wechsel/Bildschirmsperre am iPhone, Gutachten P2-10)
  awayStart: 15000,  // … aber erst, wenn der Host selbst so lange läuft (sonst kennt er die Verbindungen noch nicht)
  timerUnit: 1000    // ms je Sekunde der Option opts.timer (Tests: kleiner)
};

export const clone = (x) => JSON.parse(JSON.stringify(x));

// (epoch, seq) vergleichen: > 0, wenn a neuer ist
export function newer(a, b) {
  if (!b) return 1;
  if (!a) return -1;
  return (a.epoch - b.epoch) || (a.seq - b.seq);
}

export function seatOf(table, pid) {
  if (!table) return null;
  const i = table.seats.findIndex((s) => s && s.pid === pid);
  return i < 0 ? null : i;
}
