// Baut lib/chess.js (chess.js als ein ES-Modul, gepinnt) und kopiert die Lizenz.
// Aufruf: node tools/build_chess.mjs
import * as esbuild from 'esbuild';
import { readFileSync, copyFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'chess.js', 'package.json'), 'utf8'));
const outfile = join(root, 'lib', 'chess.js');
await esbuild.build({
  stdin: { contents: "export { Chess } from 'chess.js';", resolveDir: root },
  outfile, bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true,
  legalComments: 'eof',
  banner: { js: `/*! chess.js ${pkg.version} (BSD-2-Clause, Jeff Hlywa), gebündelt mit esbuild, siehe LICENSES.md */` },
  logLevel: 'warning'
});
copyFileSync(join(root, 'node_modules', 'chess.js', 'LICENSE'), join(root, 'lib', 'licenses', 'LICENSE-chess.js.txt'));
console.log(`lib/chess.js: ${statSync(outfile).size} Bytes`);
