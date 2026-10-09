# Kartenpakete (Technik n9, Audit #1): die doppelt aufgelösten Einzelkarten eines Blatts Byte für Byte hintereinander
# in EINER Datei (assets/cards/paket/<blatt>@2x.bin). Der Service-Worker lädt vorab 2 Pakete statt 84 Einzeldateien
# und beantwortet jede Karten-Anfrage mit dem passenden Ausschnitt – die Seite zeichnet weiter die Einzelkarte, die
# Bilder sind bitgleich, der Bildspeicher bleibt wie vorher (nur gezeigte Karten werden dekodiert).
# Warum kein Atlas als Standard: gemessen 09.10. (TECHNIK_BERICHT.md) – ein dekodierter Atlas kostet am Kartentisch
# bis +100 MB Speicher, und der erste Tisch ohne Cache braucht 2,2 s statt 0,7 s. Der Atlas bleibt als ?atlas=1.
#   python3 tools/cardpack.py          – Pakete neu schreiben (update_sw.py ruft das selbst auf)
#   python3 tools/cardpack.py --check  – nur prüfen: Pakete passen zu den Einzelkarten
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECKS = ['de', 'fr']
PACK_DIR = 'assets/cards/paket'


def pack_path(deck):
    return f'{PACK_DIR}/{deck}@2x.bin'


def members(deck, tracked=None):
    """Einzelkarten eines Blatts (@2x), sortiert – nur eingecheckte, wenn tracked gegeben"""
    d = os.path.join(ROOT, 'assets', 'cards', deck)
    fs = sorted(f'assets/cards/{deck}/{f}' for f in os.listdir(d) if f.endswith('@2x.webp'))
    return [f for f in fs if tracked is None or f in tracked]


def layout(deck, tracked=None):
    """(Paket-Inhalt, {Kartenpfad: [Versatz, Länge]})"""
    data = bytearray()
    index = {}
    for f in members(deck, tracked):
        b = open(os.path.join(ROOT, f), 'rb').read()
        index[f] = [len(data), len(b)]
        data += b
    return bytes(data), index


def build(check=False, tracked=None):
    """Schreibt (bzw. prüft) alle Pakete. Rückgabe: {Kartenpfad: [Paketpfad, Versatz, Länge]}, Liste veralteter Pakete"""
    packed, stale = {}, []
    for deck in DECKS:
        data, index = layout(deck, tracked)
        p = pack_path(deck)
        full = os.path.join(ROOT, p)
        cur = open(full, 'rb').read() if os.path.exists(full) else None
        if cur != data:
            if check: stale.append(p)
            else:
                os.makedirs(os.path.dirname(full), exist_ok=True)
                open(full, 'wb').write(data)
        for f, (off, n) in index.items(): packed[f] = [p, off, n]
    return packed, stale


if __name__ == '__main__':
    check = '--check' in sys.argv
    packed, stale = build(check)
    if stale:
        print('Kartenpakete veraltet:', ', '.join(stale), '– python3 tools/cardpack.py ausführen'); sys.exit(1)
    for deck in DECKS:
        n = sum(1 for v in packed.values() if v[0] == pack_path(deck))
        print(f'{pack_path(deck)}: {n} Karten, {os.path.getsize(os.path.join(ROOT, pack_path(deck))) // 1024} KB' + (' (stimmt)' if check else ''))
