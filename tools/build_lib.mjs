// Baut lib/trystero.js (Trystero + @noble/secp256k1 als ein ES-Modul) und kopiert die Lizenzen.
// Aufruf: node tools/build_lib.mjs
import * as esbuild from 'esbuild';
import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const pkg = (name) => JSON.parse(readFileSync(join(nm, name, 'package.json'), 'utf8'));

const trystero = pkg('trystero');
const noble = pkg('@noble/secp256k1');
const esb = pkg('esbuild');
const datum = new Date().toISOString().slice(0, 10);

const banner = `/*! Trystero ${trystero.version} (MIT, Dan Motzenbecker) + @noble/secp256k1 ${noble.version}` +
  ` (MIT, Paul Miller), gebündelt mit esbuild ${esb.version} am ${datum}, siehe LICENSES.md */`;

const outfile = join(root, 'lib', 'trystero.js');
await esbuild.build({
  entryPoints: [join(root, 'tools', 'trystero_entry.js')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
  banner: { js: banner },
  logLevel: 'warning'
});

// Lizenzen der gebündelten Pakete kopieren
const licDir = join(root, 'lib', 'licenses');
mkdirSync(licDir, { recursive: true });
const lizenzen = [
  ['trystero', 'LICENSE-trystero.txt'],
  ['@trystero-p2p/core', 'LICENSE-trystero-p2p-core.txt'],
  ['@trystero-p2p/nostr', 'LICENSE-trystero-p2p-nostr.txt'],
  ['@noble/secp256k1', 'LICENSE-noble-secp256k1.txt']
];
const kopiert = [];
for (const [name, ziel] of lizenzen) {
  const quelle = join(nm, name, 'LICENSE');
  if (!existsSync(quelle)) continue;
  copyFileSync(quelle, join(licDir, ziel));
  kopiert.push(`${name}@${pkg(name).version} → lib/licenses/${ziel}`);
}

const code = readFileSync(outfile);
console.log(banner);
console.log(`lib/trystero.js: ${statSync(outfile).size} Bytes (gzip ${gzipSync(code).length} Bytes)`);
for (const k of kopiert) console.log('Lizenz: ' + k);
