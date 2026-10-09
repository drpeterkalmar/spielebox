// Service-Worker: offline spielbar (Solo/zu zweit), Cache-Busting über Inhalts-Hash (tools/update_sw.py).
// Zwei Caches (Gutachten P2-7):
// - spielebox-core-<VERSION>: HTML/CSS/JS/Icons, bei jeder Version neu (in Gruppen à 40 mit Wiederholung)
// - spielebox-assets: Karten, Holz, Figuren – versionslos, beim Aktivieren nicht gelöscht. Schlüssel = Pfad + Inhalts-Hash
//   (?h=…), so lädt ein Update nur fehlende oder geänderte Bilder nach; alte Fassungen werden beim Aktivieren entfernt.
// Kartenpakete (n9): die @2x-Einzelkarten liegen bitgleich in 2 Paketen (tools/cardpack.py). Vorab geladen werden nur
// die Pakete; eine Karten-Anfrage beantwortet der Worker mit dem Ausschnitt aus dem Paket (Blob.slice, ohne Kopie).
const VERSION = 'e85f75d76b';
const CORE = 'spielebox-core-' + VERSION;
const ASSETS = 'spielebox-assets';
const CORE_FILES = [
  'css/style.css',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'lib/chess.js',
  'lib/trystero.js',
  'manifest.webmanifest',
  'src/app.js',
  'src/botclient.js',
  'src/botworker.js',
  'src/build.js',
  'src/evalpos.js',
  'src/events.js',
  'src/games/backgammon/bot.js',
  'src/games/backgammon/engine.js',
  'src/games/backgammon/ui.js',
  'src/games/backgammon/view.js',
  'src/games/blackjack/bot.js',
  'src/games/blackjack/engine.js',
  'src/games/blackjack/ui.js',
  'src/games/blackjack/view.js',
  'src/games/bots.js',
  'src/games/dame/bot.js',
  'src/games/dame/engine.js',
  'src/games/dame/ui.js',
  'src/games/dame/view.js',
  'src/games/halma/bot.js',
  'src/games/halma/engine.js',
  'src/games/halma/ui.js',
  'src/games/halma/view.js',
  'src/games/holdem/bot.js',
  'src/games/holdem/engine.js',
  'src/games/holdem/equity.js',
  'src/games/holdem/eval.js',
  'src/games/holdem/help.js',
  'src/games/holdem/preflop.js',
  'src/games/holdem/ui.js',
  'src/games/holdem/view.js',
  'src/games/ludo/bot.js',
  'src/games/ludo/engine.js',
  'src/games/ludo/rules.js',
  'src/games/ludo/ui.js',
  'src/games/ludo/view.js',
  'src/games/maumau/bot.js',
  'src/games/maumau/engine.js',
  'src/games/maumau/rules.js',
  'src/games/maumau/ui.js',
  'src/games/maumau/view.js',
  'src/games/muehle/bot.js',
  'src/games/muehle/engine.js',
  'src/games/muehle/ui.js',
  'src/games/muehle/view.js',
  'src/games/paare/bot.js',
  'src/games/paare/engine.js',
  'src/games/paare/rules.js',
  'src/games/paare/ui.js',
  'src/games/paare/view.js',
  'src/games/registry.js',
  'src/games/reversi/bot.js',
  'src/games/reversi/engine.js',
  'src/games/reversi/rules.js',
  'src/games/reversi/ui.js',
  'src/games/reversi/view.js',
  'src/games/schach/bot.js',
  'src/games/schach/engine.js',
  'src/games/schach/ui.js',
  'src/games/schach/view.js',
  'src/games/schiffe/boats.js',
  'src/games/schiffe/bot.js',
  'src/games/schiffe/engine.js',
  'src/games/schiffe/rules.js',
  'src/games/schiffe/ui.js',
  'src/games/schiffe/view.js',
  'src/games/schnapsen/bot.js',
  'src/games/schnapsen/engine.js',
  'src/games/schnapsen/ui.js',
  'src/games/schnapsen/view.js',
  'src/games/vier/bot.js',
  'src/games/vier/engine.js',
  'src/games/vier/rules.js',
  'src/games/vier/ui.js',
  'src/games/vier/view.js',
  'src/games/wuerfel/bot.js',
  'src/games/wuerfel/engine.js',
  'src/games/wuerfel/rules.js',
  'src/games/wuerfel/ui.js',
  'src/games/wuerfel/view.js',
  'src/net/crypto.js',
  'src/net/fair.js',
  'src/net/fairhost.js',
  'src/net/netlink.js',
  'src/net/relaychannel.js',
  'src/net/relays.js',
  'src/net/table.js',
  'src/net/tablebase.js',
  'src/net/takeover.js',
  'src/rng.js',
  'src/store.js',
  'src/tempo.js',
  'src/trainer/data/openings.js',
  'src/trainer/data/puzzles.js',
  'src/trainer/leitner.js',
  'src/trainer/lessons.js',
  'src/trainer/opening.js',
  'src/trainer/puzzle.js',
  'src/trainer/rating.js',
  'src/trainer/tb.js',
  'src/trainer/ui.js',
  'src/ui/cardatlas.js',
  'src/ui/cards.js',
  'src/ui/cardsprite.js',
  'src/ui/deko.js',
  'src/ui/dom.js',
  'src/ui/flags.js',
  'src/ui/fx.js',
  'src/ui/fxsvg.js',
  'src/ui/gameicons.js',
  'src/ui/gameui.js',
  'src/ui/lobby.js',
  'src/ui/material.js',
  'src/ui/seatcolors.js',
  'src/ui/settings.js',
  'src/ui/sieg.js',
  'src/ui/sound.js',
  'src/ui/sprites.js',
  'src/ui/svg.js',
  'src/ui/tablescreen.js',
  'src/ui/texts.js',
  'src/ui/toastqueue.js',
  'src/words.js'
];
// Pfad → Inhalts-Hash (alle eingecheckten Bilder unter assets/); vorab geladen werden nur die in PRE
const ASSET_HASH = {
  'assets/cards/atlas/de-a.webp': '5193b0da65',
  'assets/cards/atlas/de-a@2x.webp': '270a406f31',
  'assets/cards/atlas/de-b.webp': '1e9876fca4',
  'assets/cards/atlas/de-b@2x.webp': '56307c337c',
  'assets/cards/atlas/fr-a.webp': 'c3e4952ff4',
  'assets/cards/atlas/fr-a@2x.webp': '396a270526',
  'assets/cards/atlas/fr-b.webp': '074216edbb',
  'assets/cards/atlas/fr-b@2x.webp': '66e1c9ce0e',
  'assets/cards/de/E7.webp': '19ce4542af',
  'assets/cards/de/E7@2x.webp': '22501ef84f',
  'assets/cards/de/E8.webp': 'ec880e6bca',
  'assets/cards/de/E8@2x.webp': 'ae2e75c031',
  'assets/cards/de/E9.webp': '982275698e',
  'assets/cards/de/E9@2x.webp': '59fafa47b4',
  'assets/cards/de/EA.webp': '955f35b400',
  'assets/cards/de/EA@2x.webp': 'd07de3c5fc',
  'assets/cards/de/EK.webp': 'e8dfb6958e',
  'assets/cards/de/EK@2x.webp': 'b7f77c2684',
  'assets/cards/de/EO.webp': 'a409359905',
  'assets/cards/de/EO@2x.webp': 'c5ffeb81af',
  'assets/cards/de/EU.webp': '088dc1a303',
  'assets/cards/de/EU@2x.webp': '815721f588',
  'assets/cards/de/EZ.webp': 'cfde60b7c4',
  'assets/cards/de/EZ@2x.webp': '9bdd3e8dbf',
  'assets/cards/de/H7.webp': 'e5cf785249',
  'assets/cards/de/H7@2x.webp': '3b635cf18a',
  'assets/cards/de/H8.webp': '6faa50bde3',
  'assets/cards/de/H8@2x.webp': '467848cdf3',
  'assets/cards/de/H9.webp': 'b47915ceac',
  'assets/cards/de/H9@2x.webp': '289dd8e43c',
  'assets/cards/de/HA.webp': '61343ba921',
  'assets/cards/de/HA@2x.webp': '2966636dc4',
  'assets/cards/de/HK.webp': 'b57336ae80',
  'assets/cards/de/HK@2x.webp': 'dedfe8ccf1',
  'assets/cards/de/HO.webp': 'fe7b9c05cc',
  'assets/cards/de/HO@2x.webp': '9811d47ce1',
  'assets/cards/de/HU.webp': '9b97b96f8a',
  'assets/cards/de/HU@2x.webp': 'cee58fc7d1',
  'assets/cards/de/HZ.webp': 'af8d402179',
  'assets/cards/de/HZ@2x.webp': '9574a71e78',
  'assets/cards/de/L7.webp': '480d1e7f17',
  'assets/cards/de/L7@2x.webp': '7ffe2d32ef',
  'assets/cards/de/L8.webp': '91738015a2',
  'assets/cards/de/L8@2x.webp': '990cc85cb0',
  'assets/cards/de/L9.webp': 'b460e521fc',
  'assets/cards/de/L9@2x.webp': '675b77e64e',
  'assets/cards/de/LA.webp': '59395f56f4',
  'assets/cards/de/LA@2x.webp': 'd0058ffbb6',
  'assets/cards/de/LK.webp': '8b17c026b1',
  'assets/cards/de/LK@2x.webp': 'ce39a333df',
  'assets/cards/de/LO.webp': 'dc00c329e7',
  'assets/cards/de/LO@2x.webp': 'ddb06e1ace',
  'assets/cards/de/LU.webp': 'ba03616bf5',
  'assets/cards/de/LU@2x.webp': '29167686f1',
  'assets/cards/de/LZ.webp': 'c4088443fa',
  'assets/cards/de/LZ@2x.webp': '40bca43671',
  'assets/cards/de/S7.webp': 'ce893a8282',
  'assets/cards/de/S7@2x.webp': '8dbb19a53a',
  'assets/cards/de/S8.webp': '8b8d697c2f',
  'assets/cards/de/S8@2x.webp': '58dbc434f3',
  'assets/cards/de/S9.webp': 'c4999527f1',
  'assets/cards/de/S9@2x.webp': '86cc528b94',
  'assets/cards/de/SA.webp': 'e555af4882',
  'assets/cards/de/SA@2x.webp': 'e2b86b4a3b',
  'assets/cards/de/SK.webp': 'aad9b72d5d',
  'assets/cards/de/SK@2x.webp': '0f5cc85b09',
  'assets/cards/de/SO.webp': 'e0fac2f500',
  'assets/cards/de/SO@2x.webp': '63a404bbc2',
  'assets/cards/de/SU.webp': '314a03cd3f',
  'assets/cards/de/SU@2x.webp': '120c2f86ef',
  'assets/cards/de/SZ.webp': 'bb66d08eea',
  'assets/cards/de/SZ@2x.webp': 'b3d24dbfe7',
  'assets/cards/fr/2C.webp': 'f68c164164',
  'assets/cards/fr/2C@2x.webp': '060d3f88b9',
  'assets/cards/fr/2D.webp': 'e2bb29e567',
  'assets/cards/fr/2D@2x.webp': '06e0143e28',
  'assets/cards/fr/2H.webp': '1639e3ad90',
  'assets/cards/fr/2H@2x.webp': '0cf1d5c783',
  'assets/cards/fr/2S.webp': '59c0087267',
  'assets/cards/fr/2S@2x.webp': 'd16a11cb81',
  'assets/cards/fr/3C.webp': '3deb4ca75b',
  'assets/cards/fr/3C@2x.webp': 'e358e30dd3',
  'assets/cards/fr/3D.webp': 'fb8f3f11ec',
  'assets/cards/fr/3D@2x.webp': 'e12bdaacca',
  'assets/cards/fr/3H.webp': '82a3740449',
  'assets/cards/fr/3H@2x.webp': '5a16a854f5',
  'assets/cards/fr/3S.webp': '7e940c8c9b',
  'assets/cards/fr/3S@2x.webp': '2075605143',
  'assets/cards/fr/4C.webp': '0a9b3961ed',
  'assets/cards/fr/4C@2x.webp': '392d1953ab',
  'assets/cards/fr/4D.webp': '816bf8b753',
  'assets/cards/fr/4D@2x.webp': 'd516b30f18',
  'assets/cards/fr/4H.webp': '469510a09b',
  'assets/cards/fr/4H@2x.webp': '872c47ab25',
  'assets/cards/fr/4S.webp': '67d89a0919',
  'assets/cards/fr/4S@2x.webp': '51a5f12464',
  'assets/cards/fr/5C.webp': '0cdb22d54e',
  'assets/cards/fr/5C@2x.webp': '0c79b4df95',
  'assets/cards/fr/5D.webp': 'dbef616aed',
  'assets/cards/fr/5D@2x.webp': 'efee1ab7c6',
  'assets/cards/fr/5H.webp': '30a15e73a0',
  'assets/cards/fr/5H@2x.webp': 'da3eb8cddf',
  'assets/cards/fr/5S.webp': '5cea295095',
  'assets/cards/fr/5S@2x.webp': '5ee2a1cdd4',
  'assets/cards/fr/6C.webp': '6272460ff1',
  'assets/cards/fr/6C@2x.webp': '119e7d91d4',
  'assets/cards/fr/6D.webp': 'dc5fc4715c',
  'assets/cards/fr/6D@2x.webp': '129b92fa50',
  'assets/cards/fr/6H.webp': 'd2863b6795',
  'assets/cards/fr/6H@2x.webp': '7551ee75dd',
  'assets/cards/fr/6S.webp': 'ca2660c24a',
  'assets/cards/fr/6S@2x.webp': 'eb38c5a01c',
  'assets/cards/fr/7C.webp': '16c2ab6640',
  'assets/cards/fr/7C@2x.webp': 'e7ff0a2f03',
  'assets/cards/fr/7D.webp': '0bf1ddd252',
  'assets/cards/fr/7D@2x.webp': 'fef5920276',
  'assets/cards/fr/7H.webp': '68ff9e94d7',
  'assets/cards/fr/7H@2x.webp': 'f8e0408c6d',
  'assets/cards/fr/7S.webp': '08b934e84e',
  'assets/cards/fr/7S@2x.webp': '7033f857d4',
  'assets/cards/fr/8C.webp': 'b10d317636',
  'assets/cards/fr/8C@2x.webp': '13fb1945cd',
  'assets/cards/fr/8D.webp': '59973373d1',
  'assets/cards/fr/8D@2x.webp': 'bf5b7eac90',
  'assets/cards/fr/8H.webp': 'e05b1e1327',
  'assets/cards/fr/8H@2x.webp': 'd50646c543',
  'assets/cards/fr/8S.webp': '364e67f972',
  'assets/cards/fr/8S@2x.webp': '843a34a5ee',
  'assets/cards/fr/9C.webp': '1af8305fa2',
  'assets/cards/fr/9C@2x.webp': '337b40ad40',
  'assets/cards/fr/9D.webp': '08bc8e0c74',
  'assets/cards/fr/9D@2x.webp': '4df21fb302',
  'assets/cards/fr/9H.webp': '9f2b08dbc0',
  'assets/cards/fr/9H@2x.webp': '03d318cad8',
  'assets/cards/fr/9S.webp': 'fc00ddb558',
  'assets/cards/fr/9S@2x.webp': '9de0744f4d',
  'assets/cards/fr/AC.webp': '739b9968e5',
  'assets/cards/fr/AC@2x.webp': '9914de42bc',
  'assets/cards/fr/AD.webp': '791cce9c9c',
  'assets/cards/fr/AD@2x.webp': '334a209b7f',
  'assets/cards/fr/AH.webp': '66929981b8',
  'assets/cards/fr/AH@2x.webp': 'f4adb8de16',
  'assets/cards/fr/AS.webp': 'b2004efac1',
  'assets/cards/fr/AS@2x.webp': '0df9f3bf80',
  'assets/cards/fr/JC.webp': '722761cf7b',
  'assets/cards/fr/JC@2x.webp': 'b3ed3136c2',
  'assets/cards/fr/JD.webp': 'c13e61e689',
  'assets/cards/fr/JD@2x.webp': 'b1fdc6e59b',
  'assets/cards/fr/JH.webp': '47e287a131',
  'assets/cards/fr/JH@2x.webp': '6302cd2156',
  'assets/cards/fr/JS.webp': '0685ff1562',
  'assets/cards/fr/JS@2x.webp': '3d90580873',
  'assets/cards/fr/KC.webp': 'f45fc9648f',
  'assets/cards/fr/KC@2x.webp': '34bcd1fbdc',
  'assets/cards/fr/KD.webp': 'ae112591ff',
  'assets/cards/fr/KD@2x.webp': '909eb923b9',
  'assets/cards/fr/KH.webp': '3583f16594',
  'assets/cards/fr/KH@2x.webp': 'acc165c90c',
  'assets/cards/fr/KS.webp': 'c71922a277',
  'assets/cards/fr/KS@2x.webp': '1c0aa3dc37',
  'assets/cards/fr/QC.webp': '7d130616b3',
  'assets/cards/fr/QC@2x.webp': '2ccffea49d',
  'assets/cards/fr/QD.webp': '5dbff3c829',
  'assets/cards/fr/QD@2x.webp': '878ec0b228',
  'assets/cards/fr/QH.webp': '1e2ebb3e26',
  'assets/cards/fr/QH@2x.webp': '6c07f65f32',
  'assets/cards/fr/QS.webp': 'ea73ba267e',
  'assets/cards/fr/QS@2x.webp': '4b0f3cad84',
  'assets/cards/fr/TC.webp': '06c1078442',
  'assets/cards/fr/TC@2x.webp': 'c0e2c0ff83',
  'assets/cards/fr/TD.webp': '21b05438a0',
  'assets/cards/fr/TD@2x.webp': 'fd6bb47ff1',
  'assets/cards/fr/TH.webp': 'ca6c46cef7',
  'assets/cards/fr/TH@2x.webp': '3bd72cf6d1',
  'assets/cards/fr/TS.webp': '0f037e5aac',
  'assets/cards/fr/TS@2x.webp': '914d45dc40',
  'assets/cards/paket/de@2x.bin': 'e177b4e72d',
  'assets/cards/paket/fr@2x.bin': '9f46bff45b',
  'assets/pieces/bB.svg': 'ba67da76ce',
  'assets/pieces/bK.svg': '025eea92e0',
  'assets/pieces/bN.svg': '735cc58315',
  'assets/pieces/bP.svg': '4413bf7c18',
  'assets/pieces/bQ.svg': '70191a3fbc',
  'assets/pieces/bR.svg': '6abf617a9e',
  'assets/pieces/wB.svg': '1d7beace24',
  'assets/pieces/wK.svg': '56f55c7848',
  'assets/pieces/wN.svg': '5486791207',
  'assets/pieces/wP.svg': 'cc7de30708',
  'assets/pieces/wQ.svg': 'b72b864e2a',
  'assets/pieces/wR.svg': '4d42ab45af',
  'assets/wood/dark.jpg': '610f46fb46',
  'assets/wood/dark.webp': 'e8d44bb775',
  'assets/wood/frame.jpg': '56dcbc378c',
  'assets/wood/frame.webp': '737426a5c8',
  'assets/wood/light-overlay.webp': 'bc61655046',
  'assets/wood/light.jpg': 'a9a5d250d3',
  'assets/wood/light.webp': 'ddd41ed8ab'
};
const PRE = [
  'assets/cards/paket/de@2x.bin',
  'assets/cards/paket/fr@2x.bin',
  'assets/pieces/bB.svg',
  'assets/pieces/bK.svg',
  'assets/pieces/bN.svg',
  'assets/pieces/bP.svg',
  'assets/pieces/bQ.svg',
  'assets/pieces/bR.svg',
  'assets/pieces/wB.svg',
  'assets/pieces/wK.svg',
  'assets/pieces/wN.svg',
  'assets/pieces/wP.svg',
  'assets/pieces/wQ.svg',
  'assets/pieces/wR.svg',
  'assets/wood/dark.webp',
  'assets/wood/frame.webp',
  'assets/wood/light-overlay.webp',
  'assets/wood/light.webp'
];
// Einzelkarte → [Paket, Versatz, Länge]
const PACKED = {
  'assets/cards/de/E7@2x.webp': ['assets/cards/paket/de@2x.bin', 0, 52146],
  'assets/cards/de/E8@2x.webp': ['assets/cards/paket/de@2x.bin', 52146, 56778],
  'assets/cards/de/E9@2x.webp': ['assets/cards/paket/de@2x.bin', 108924, 46978],
  'assets/cards/de/EA@2x.webp': ['assets/cards/paket/de@2x.bin', 155902, 61756],
  'assets/cards/de/EK@2x.webp': ['assets/cards/paket/de@2x.bin', 217658, 69134],
  'assets/cards/de/EO@2x.webp': ['assets/cards/paket/de@2x.bin', 286792, 59158],
  'assets/cards/de/EU@2x.webp': ['assets/cards/paket/de@2x.bin', 345950, 50704],
  'assets/cards/de/EZ@2x.webp': ['assets/cards/paket/de@2x.bin', 396654, 55498],
  'assets/cards/de/H7@2x.webp': ['assets/cards/paket/de@2x.bin', 452152, 36384],
  'assets/cards/de/H8@2x.webp': ['assets/cards/paket/de@2x.bin', 488536, 42586],
  'assets/cards/de/H9@2x.webp': ['assets/cards/paket/de@2x.bin', 531122, 36898],
  'assets/cards/de/HA@2x.webp': ['assets/cards/paket/de@2x.bin', 568020, 46994],
  'assets/cards/de/HK@2x.webp': ['assets/cards/paket/de@2x.bin', 615014, 49920],
  'assets/cards/de/HO@2x.webp': ['assets/cards/paket/de@2x.bin', 664934, 44336],
  'assets/cards/de/HU@2x.webp': ['assets/cards/paket/de@2x.bin', 709270, 38494],
  'assets/cards/de/HZ@2x.webp': ['assets/cards/paket/de@2x.bin', 747764, 38742],
  'assets/cards/de/L7@2x.webp': ['assets/cards/paket/de@2x.bin', 786506, 51054],
  'assets/cards/de/L8@2x.webp': ['assets/cards/paket/de@2x.bin', 837560, 59382],
  'assets/cards/de/L9@2x.webp': ['assets/cards/paket/de@2x.bin', 896942, 44070],
  'assets/cards/de/LA@2x.webp': ['assets/cards/paket/de@2x.bin', 941012, 50364],
  'assets/cards/de/LK@2x.webp': ['assets/cards/paket/de@2x.bin', 991376, 54482],
  'assets/cards/de/LO@2x.webp': ['assets/cards/paket/de@2x.bin', 1045858, 47352],
  'assets/cards/de/LU@2x.webp': ['assets/cards/paket/de@2x.bin', 1093210, 48006],
  'assets/cards/de/LZ@2x.webp': ['assets/cards/paket/de@2x.bin', 1141216, 50206],
  'assets/cards/de/S7@2x.webp': ['assets/cards/paket/de@2x.bin', 1191422, 49452],
  'assets/cards/de/S8@2x.webp': ['assets/cards/paket/de@2x.bin', 1240874, 63098],
  'assets/cards/de/S9@2x.webp': ['assets/cards/paket/de@2x.bin', 1303972, 53608],
  'assets/cards/de/SA@2x.webp': ['assets/cards/paket/de@2x.bin', 1357580, 51632],
  'assets/cards/de/SK@2x.webp': ['assets/cards/paket/de@2x.bin', 1409212, 52492],
  'assets/cards/de/SO@2x.webp': ['assets/cards/paket/de@2x.bin', 1461704, 53300],
  'assets/cards/de/SU@2x.webp': ['assets/cards/paket/de@2x.bin', 1515004, 52548],
  'assets/cards/de/SZ@2x.webp': ['assets/cards/paket/de@2x.bin', 1567552, 55056],
  'assets/cards/fr/2C@2x.webp': ['assets/cards/paket/fr@2x.bin', 0, 7008],
  'assets/cards/fr/2D@2x.webp': ['assets/cards/paket/fr@2x.bin', 7008, 8632],
  'assets/cards/fr/2H@2x.webp': ['assets/cards/paket/fr@2x.bin', 15640, 8912],
  'assets/cards/fr/2S@2x.webp': ['assets/cards/paket/fr@2x.bin', 24552, 6602],
  'assets/cards/fr/3C@2x.webp': ['assets/cards/paket/fr@2x.bin', 31154, 8476],
  'assets/cards/fr/3D@2x.webp': ['assets/cards/paket/fr@2x.bin', 39630, 10482],
  'assets/cards/fr/3H@2x.webp': ['assets/cards/paket/fr@2x.bin', 50112, 10794],
  'assets/cards/fr/3S@2x.webp': ['assets/cards/paket/fr@2x.bin', 60906, 7808],
  'assets/cards/fr/4C@2x.webp': ['assets/cards/paket/fr@2x.bin', 68714, 9366],
  'assets/cards/fr/4D@2x.webp': ['assets/cards/paket/fr@2x.bin', 78080, 11246],
  'assets/cards/fr/4H@2x.webp': ['assets/cards/paket/fr@2x.bin', 89326, 11394],
  'assets/cards/fr/4S@2x.webp': ['assets/cards/paket/fr@2x.bin', 100720, 8358],
  'assets/cards/fr/5C@2x.webp': ['assets/cards/paket/fr@2x.bin', 109078, 10790],
  'assets/cards/fr/5D@2x.webp': ['assets/cards/paket/fr@2x.bin', 119868, 13342],
  'assets/cards/fr/5H@2x.webp': ['assets/cards/paket/fr@2x.bin', 133210, 13600],
  'assets/cards/fr/5S@2x.webp': ['assets/cards/paket/fr@2x.bin', 146810, 9930],
  'assets/cards/fr/6C@2x.webp': ['assets/cards/paket/fr@2x.bin', 156740, 12296],
  'assets/cards/fr/6D@2x.webp': ['assets/cards/paket/fr@2x.bin', 169036, 15026],
  'assets/cards/fr/6H@2x.webp': ['assets/cards/paket/fr@2x.bin', 184062, 15630],
  'assets/cards/fr/6S@2x.webp': ['assets/cards/paket/fr@2x.bin', 199692, 11422],
  'assets/cards/fr/7C@2x.webp': ['assets/cards/paket/fr@2x.bin', 211114, 12862],
  'assets/cards/fr/7D@2x.webp': ['assets/cards/paket/fr@2x.bin', 223976, 15458],
  'assets/cards/fr/7H@2x.webp': ['assets/cards/paket/fr@2x.bin', 239434, 16104],
  'assets/cards/fr/7S@2x.webp': ['assets/cards/paket/fr@2x.bin', 255538, 11630],
  'assets/cards/fr/8C@2x.webp': ['assets/cards/paket/fr@2x.bin', 267168, 14926],
  'assets/cards/fr/8D@2x.webp': ['assets/cards/paket/fr@2x.bin', 282094, 17992],
  'assets/cards/fr/8H@2x.webp': ['assets/cards/paket/fr@2x.bin', 300086, 18738],
  'assets/cards/fr/8S@2x.webp': ['assets/cards/paket/fr@2x.bin', 318824, 13622],
  'assets/cards/fr/9C@2x.webp': ['assets/cards/paket/fr@2x.bin', 332446, 16354],
  'assets/cards/fr/9D@2x.webp': ['assets/cards/paket/fr@2x.bin', 348800, 19106],
  'assets/cards/fr/9H@2x.webp': ['assets/cards/paket/fr@2x.bin', 367906, 20206],
  'assets/cards/fr/9S@2x.webp': ['assets/cards/paket/fr@2x.bin', 388112, 15014],
  'assets/cards/fr/AC@2x.webp': ['assets/cards/paket/fr@2x.bin', 403126, 8206],
  'assets/cards/fr/AD@2x.webp': ['assets/cards/paket/fr@2x.bin', 411332, 9594],
  'assets/cards/fr/AH@2x.webp': ['assets/cards/paket/fr@2x.bin', 420926, 10448],
  'assets/cards/fr/AS@2x.webp': ['assets/cards/paket/fr@2x.bin', 431374, 21242],
  'assets/cards/fr/JC@2x.webp': ['assets/cards/paket/fr@2x.bin', 452616, 46362],
  'assets/cards/fr/JD@2x.webp': ['assets/cards/paket/fr@2x.bin', 498978, 46242],
  'assets/cards/fr/JH@2x.webp': ['assets/cards/paket/fr@2x.bin', 545220, 46234],
  'assets/cards/fr/JS@2x.webp': ['assets/cards/paket/fr@2x.bin', 591454, 38820],
  'assets/cards/fr/KC@2x.webp': ['assets/cards/paket/fr@2x.bin', 630274, 40210],
  'assets/cards/fr/KD@2x.webp': ['assets/cards/paket/fr@2x.bin', 670484, 40030],
  'assets/cards/fr/KH@2x.webp': ['assets/cards/paket/fr@2x.bin', 710514, 42046],
  'assets/cards/fr/KS@2x.webp': ['assets/cards/paket/fr@2x.bin', 752560, 42806],
  'assets/cards/fr/QC@2x.webp': ['assets/cards/paket/fr@2x.bin', 795366, 39130],
  'assets/cards/fr/QD@2x.webp': ['assets/cards/paket/fr@2x.bin', 834496, 44100],
  'assets/cards/fr/QH@2x.webp': ['assets/cards/paket/fr@2x.bin', 878596, 44406],
  'assets/cards/fr/QS@2x.webp': ['assets/cards/paket/fr@2x.bin', 923002, 44770],
  'assets/cards/fr/TC@2x.webp': ['assets/cards/paket/fr@2x.bin', 967772, 17942],
  'assets/cards/fr/TD@2x.webp': ['assets/cards/paket/fr@2x.bin', 985714, 21162],
  'assets/cards/fr/TH@2x.webp': ['assets/cards/paket/fr@2x.bin', 1006876, 21892],
  'assets/cards/fr/TS@2x.webp': ['assets/cards/paket/fr@2x.bin', 1028768, 16116]
};
const GROUP = 40;
const TRIES = 3;

const assetKey = (path) => path + '?h=' + ASSET_HASH[path];
const pathOf = (url) => new URL(url).pathname.slice(new URL(self.registration.scope).pathname.length);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) { if (i >= TRIES) throw e; await pause(500 * i); }
  }
}

// Inhalts-Hash wie update_sw.py (SHA-256, erste 10 Hex-Zeichen)
async function hashOf(res) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer()));
  return Array.from(d.slice(0, 5), (b) => b.toString(16).padStart(2, '0')).join('');
}

// fehlende Bilder holen: erst aus einem alten Cache (nur wenn der Inhalt passt), sonst aus dem Netz
async function fillAssets() {
  const c = await caches.open(ASSETS);
  const missing = [];
  for (const p of PRE) if (!(await c.match(assetKey(p)))) missing.push(p);
  for (let i = 0; i < missing.length; i += GROUP) {
    await Promise.all(missing.slice(i, i + GROUP).map((p) => withRetry(async () => {
      const old = await caches.match(p, { ignoreSearch: true });
      if (old && old.ok && (await hashOf(old)) === ASSET_HASH[p]) return c.put(assetKey(p), old);
      const res = await fetch(new Request(p, { cache: 'reload' }));
      if (!res.ok) throw new Error(p + ' ' + res.status);
      return c.put(assetKey(p), res);
    })));
  }
}

// Pakete als Blob im Speicher des Workers (einmal aus dem Cache gelesen; der Worker darf jederzeit beendet werden)
const packBlobs = new Map();
function packBlob(pack) {
  if (!packBlobs.has(pack)) {
    packBlobs.set(pack, caches.open(ASSETS).then((c) => c.match(assetKey(pack))).then((r) => (r ? r.blob() : null))
      .then((b) => { if (!b) packBlobs.delete(pack); return b; }, () => { packBlobs.delete(pack); return null; }));
  }
  return packBlobs.get(pack);
}
async function fromPack(p) {
  const [pack, off, len] = PACKED[p];
  const b = await packBlob(pack);
  if (!b || b.size < off + len) return null;
  return new Response(b.slice(off, off + len, 'image/webp'), { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(len) } });
}

async function fillCore() {
  const c = await caches.open(CORE);
  for (let i = 0; i < CORE_FILES.length; i += GROUP) {
    const group = CORE_FILES.slice(i, i + GROUP);
    await withRetry(() => c.addAll(group.map((u) => new Request(u, { cache: 'reload' }))));
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(fillAssets().then(fillCore).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k.startsWith('spielebox-') && k !== CORE && k !== ASSETS).map((k) => caches.delete(k)));
    // Bilder-Cache behalten, nur Fassungen entfernen, die zu keiner aktuellen Datei mehr gehören –
    // und Einzelkarten, die jetzt im (geladenen) Paket stecken (sonst lägen sie doppelt im Speicher)
    const c = await caches.open(ASSETS);
    const packsIn = new Set();
    for (const p of new Set(Object.values(PACKED).map((v) => v[0]))) if (await c.match(assetKey(p))) packsIn.add(p);
    for (const req of await c.keys()) {
      const u = new URL(req.url);
      const p = pathOf(req.url);
      if (!(p in ASSET_HASH) || u.searchParams.get('h') !== ASSET_HASH[p] || (p in PACKED && packsIn.has(PACKED[p][0]))) await c.delete(req);
    }
    await self.clients.claim();
  })());
});

// Bild: zuerst aus dem Bilder-Cache, sonst holen und merken (auch nicht vorab geladene, z. B. 1×-Karten)
function assetResponse(req, p) {
  return caches.open(ASSETS).then((c) => c.match(assetKey(p)).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); hashOf(cp).then((x) => { if (x === ASSET_HASH[p]) c.put(assetKey(p), cp); }).catch(() => {}); }
    return res;
  })));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: CORE }).then((r) => r || fetch(req)));
    return;
  }
  const p = pathOf(req.url);
  if (p in PACKED) {
    // Karte aus dem Paket; ist das Paket (noch) nicht im Cache: wie jedes andere Bild (Cache, sonst Netz)
    e.respondWith(fromPack(p).then((r) => r || assetResponse(req, p)));
    return;
  }
  if (p in ASSET_HASH) {
    e.respondWith(assetResponse(req, p));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CORE, ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CORE).then((c) => c.put(req, cp)); }
    return res;
  })));
});
