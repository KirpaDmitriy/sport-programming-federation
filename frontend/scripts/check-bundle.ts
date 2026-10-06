// Verifies that the production bundle carries no development-only mock controls or fixture data.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const assets = resolve(import.meta.dirname, '..', 'dist', 'assets');
const forbidden = [
  '/__mock__',
  'email-codes',
  'mockSelectSession',
  'Вставить код из демо-ящика',
  'Средства разработчика',
];
// Demo account hints are allowed only in an explicitly configured demonstration-stand build.
if (process.env.VITE_DEMO_STAND !== '1') forbidden.push('alexey@example.com', 'hr@sever-tech.example');

const found: string[] = [];
for (const name of await readdir(assets)) {
  if (!name.endsWith('.js')) continue;
  const source = await readFile(join(assets, name), 'utf8');
  for (const needle of forbidden) if (source.includes(needle)) found.push(`${name}: ${needle}`);
}

if (found.length) {
  console.error(`Bundle check failed:\n${found.map((item) => `  - ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`Bundle check passed: none of ${forbidden.length} development markers found.`);
