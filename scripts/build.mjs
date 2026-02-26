import path from 'node:path';
import { rm } from 'node:fs/promises';

import { build } from 'esbuild';

const root = process.cwd();

await rm(path.join(root, 'dist'), { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, 'src/entrypoint.ts')],
  outfile: path.join(root, 'dist/bundle.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  minify: true,
  target: 'node20',
  sourcemap: false,
  tsconfig: path.join(root, 'tsconfig.json'),
  alias: {
    '@': path.join(root, 'src'),
  },
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
