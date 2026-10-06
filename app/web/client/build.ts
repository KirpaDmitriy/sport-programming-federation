// Bundles src/ into app/web/static/app.js, the script FastAPI serves at /assets/app.js.
// `bun build.ts --check` fails when the committed bundle differs from a fresh build.
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../static/app.js', import.meta.url);
const banner = '// Generated from app/web/client/src by `bun run build` in app/web/client. Do not edit.';

// Bun names modules in the bundle relative to the working directory; pin it so the output is reproducible.
process.chdir(Bun.fileURLToPath(new URL('.', import.meta.url)));
const result = await Bun.build({
  entrypoints: ['src/main.ts'],
  target: 'browser',
  format: 'esm',
  banner,
});
const [output] = result.outputs;
if (!result.success || !output) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const bundle = await output.text();

if (process.argv.includes('--check')) {
  const committed = await readFile(target, 'utf8').catch(() => '');
  if (committed !== bundle) {
    console.error('app/web/static/app.js is stale: run `bun run build` in app/web/client.');
    process.exit(1);
  }
  console.log('app/web/static/app.js matches src.');
} else {
  await writeFile(target, bundle);
  console.log('Wrote app/web/static/app.js.');
}
