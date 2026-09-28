// Hilfetexte: Regeln, Datenschutz, Credits (Deutsch, kurz)
import { h } from './dom.js';

const ul = (...items) => h('ul', {}, ...items.map((t) => h('li', {}, t)));

export function rulesMuehle() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Mühle' }),
    ul(
      'Jeder hat 9 Steine, Weiß beginnt. Zuerst setzt ihr abwechselnd je einen Stein auf einen freien Punkt.',
      'Danach zieht ihr: einen eigenen Stein entlang einer Linie auf den freien Nachbarpunkt.',
      'Drei eigene Steine in einer Reihe sind eine Mühle. Wer eine Mühle schließt, nimmt dem Gegner einen Stein – nicht aus einer geschlossenen Mühle, außer alle seine Steine stehen in Mühlen. Auch bei einer Doppelmühle nur einen.',
      'Wer nur noch 3 Steine hat, darf springen: auf jeden freien Punkt.',
      'Verloren hat, wer weniger als 3 Steine hat oder nicht mehr ziehen kann.',
      'Remis bei dreifacher Stellungswiederholung. Hausregel gegen endlose Partien: 50 Züge je Spieler ohne Mühle sind ebenfalls Remis.'
    ));
}

export function rulesDame() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Dame' }),
    h('p', { text: 'Gespielt wird nur auf den dunklen Feldern. Weiß beginnt.' }),
    h('h4', { text: 'Deutsch (8×8, 12 Steine)' }),
    ul(
      'Ein Stein zieht ein Feld schräg vorwärts und schlägt nur vorwärts: über einen gegnerischen Stein auf das freie Feld dahinter.',
      'Schlagzwang, bei mehreren Möglichkeiten freie Wahl. Mehrfachsprünge müssen zu Ende geschlagen werden; geschlagene Steine verschwinden erst nach dem Zug und dürfen nicht zweimal übersprungen werden.',
      'Wer die gegnerische Grundlinie erreicht, wird Dame – das beendet den Zug.',
      'Die Dame zieht beliebig weit schräg vor und zurück, schlägt einzeln stehende Steine auf Distanz und landet direkt dahinter.'
    ),
    h('h4', { text: 'International (10×10, 20 Steine)' }),
    ul(
      'Steine schlagen auch rückwärts.',
      'Fliegende Dame: Sie darf beliebig weit hinter dem geschlagenen Stein landen.',
      'Mehrheits-Schlagzwang: Es muss die Folge mit den meisten geschlagenen Steinen gewählt werden (Dame und Stein zählen gleich).',
      'Dame wird ein Stein nur, wenn sein Zug auf der Grundlinie endet.'
    ),
    h('h4', { text: 'Hausregeln (Schalter)' }),
    ul(
      'Kurze Dame: Die Dame zieht und schlägt nur ein Feld weit (so beschreibt es strategy-games.de für die deutsche Regel; die Quellen widersprechen sich).',
      'Pusten statt Schlagzwang: Schlagen ist freiwillig. Wer aber nicht schlägt, obwohl er könnte, dem darf der Gegner vor seinem Zug einen der Steine wegpusten, die hätten schlagen können.'
    ),
    h('h4', { text: 'Ende' }),
    ul(
      'Wer keine Steine oder keinen Zug mehr hat, verliert.',
      'Remis bei dreifacher Wiederholung oder wenn 25 Züge je Seite nur Damen ziehen, ohne zu schlagen.'
    ));
}

export function helpNet() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'So funktioniert der Tisch' }),
    ul(
      'Wer einen Tisch aufmacht, bekommt drei Wörter. Die Reihenfolge ist egal. Der Mitspieler tippt sie unter „Beitreten“ ein – oder öffnet den geteilten Link.',
      'Es gibt keinen Server und kein Konto. Die Geräte verbinden sich direkt (WebRTC). Klappt das nicht, laufen die Züge verschlüsselt über öffentliche Nostr-Relays.',
      'Datenschutz in einem Satz: Die Relays sehen nur einen Hash der Wörter und verschlüsselte Daten, nie die Wörter, Namen oder Züge im Klartext.',
      'Der Gastgeber ist Schiedsrichter: Sein Gerät prüft jeden Zug. Fällt er aus, übernimmt der Mitspieler.',
      'Tab zu, Akku leer, neu geladen? Einfach dieselben drei Wörter eingeben (oder unter „Weiterspielen“ antippen) – die Partie geht weiter.',
      'Wer keinen Platz mehr bekommt, schaut zu.'
    ));
}

export function credits() {
  return h('div', { class: 'rules' },
    h('h3', { text: 'Credits und Lizenzen' }),
    ul(
      'Programm, Bretter, Steine, Icons und Wortliste: eigene Arbeit (MIT-Lizenz).',
      'Holztexturen: Poly Haven, CC0 – „Silver Oak Veneer 01“ und „Walnut Veneer“ (Jenelle van Heerden), „Dark Wood“ (Dario Barresi, Dimitrios Savva, Rico Cilliers).',
      'Netz: Trystero 0.25.4 (MIT, Dan Motzenbecker), @noble/secp256k1 (MIT, Paul Miller).',
      'Regelquellen: de.wikipedia „Mühle (Spiel)“ und „Dame (Spiel)“, strategy-games.de (deutsche Dame), FMJD (internationale Dame).'
    ),
    h('p', {}, 'Alle Details stehen in ', h('a', { href: 'LICENSES.md', target: '_blank', rel: 'noopener', text: 'LICENSES.md' }), '.'));
}
