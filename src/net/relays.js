// Nostr-Relays für Spielebox: Trystero-Signalisierung (relayConfig.urls) und Relay-Fallback.
// Gemessen am 2026-09-28 mit tests/relay_live.mjs, 3 Läufe vom Mac mini über ProtonVPN.
// Je Lauf und Relay: 2 Durchgänge à 3 Nachrichten (200/1200/6000 Zeichen, ephemere Kinds)
// plus Belastung mit 20 Nachrichten in 6 s. Angaben: zugestellt über 3 Läufe, Belastung
// (OK + zugestellt, Läufe 2–3), Median der Latenz Senden → Empfang.
// Gesamt-Durchgang genau dieser 6 in einem Kanal: 20/20 zugestellt, Median 43 ms, Max 101 ms.
// Neu prüfen: node tests/relay_live.mjs --nur-gesamt  (bzw. ohne Option: alle Kandidaten)
export const RELAYS = [
  'wss://basspistol.org', //      18/18, Last 40/40,  83 ms
  'wss://nostr-01.uid.ovh', //    18/18, Last 40/40, 120 ms
  'wss://relay.snort.social', //  18/18, Last 40/40, 145 ms
  'wss://relay.primal.net', //    18/18, Last 40/40, 147 ms
  'wss://relay.sigit.io', //      18/18, Last 40/40, 158 ms
  'wss://nostr.mom' //            18/18, Last 40/40, 183 ms
];

// Reserve: ebenso 18/18 und Last 40/40, etwas langsamer
export const RELAYS_EXTRA = [
  'wss://nostr.sathoarder.com', //       157 ms
  'wss://top.testrelay.top', //          168 ms
  'wss://social.amanah.eblessing.co', // 179 ms
  'wss://purplerelay.com' //             212 ms
];

// Gemessen und NICHT geeignet:
// relay.damus.io (rate-limited schon bei 3 Nachrichten), nos.lol (zeitweise überlastet: OK nach 7 s,
// keine Weiterleitung), nostr.oxtr.dev (Rate-Limit nach ~9 Events, Meldung ohne Standard-Präfix),
// offchain.pub + nostr.bitcoiner.social (Web-of-Trust lehnt fremde Schlüssel ab),
// relay.artio.inf.unibe.ch + relay02.lnfi.network (OK, aber keine/unzuverlässige Weiterleitung),
// relay.mostro.network (stumm), nostr.wine (Bezahlung), nostr.einundzwanzig.space (NIP-05 nötig),
// relay.nos.social + relay.coinos.io + relay-rpi.edufeed.org (ephemere Kinds gesperrt).
