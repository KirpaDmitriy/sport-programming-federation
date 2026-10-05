// Enforces Feature-Sliced Design import rules: downward layer imports, no same-layer cross-slice
// imports, slice access through public index files, and no test helpers in production code.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'src');
const layers = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const sliced = new Set(['entities', 'features', 'widgets', 'pages']);

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.gen.ts'))
      result.push(path);
  }
  return result;
}

function locate(path) {
  const parts = relative(root, path).split(sep);
  return { layer: parts[0], slice: sliced.has(parts[0]) ? parts[1] : parts[0] === 'shared' ? parts[1] : null };
}

const violations = [];
for (const file of await files(root)) {
  const source = await readFile(file, 'utf8');
  const from = locate(file);
  // The entry module (src/main.tsx) sits above every layer.
  if (!layers.includes(from.layer)) continue;
  const isTest = /\.test\.tsx?$/.test(file);
  for (const match of source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    const where = `${relative(root, file)} → ${specifier}`;
    if (!isTest && /(^|\/)test\//.test(specifier)) violations.push(`${where}: production code imports test helpers`);
    let target;
    if (specifier.startsWith('@/')) target = join(root, specifier.slice(2));
    else if (specifier.startsWith('.')) target = resolve(file, '..', specifier);
    else continue;
    if (!target.startsWith(root)) continue;
    const to = locate(target);
    const fromIndex = layers.indexOf(from.layer);
    const toIndex = layers.indexOf(to.layer);
    if (toIndex > fromIndex) violations.push(`${where}: ${from.layer} must not import ${to.layer}`);
    if (to.layer === from.layer && sliced.has(to.layer) && to.slice !== from.slice) {
      violations.push(`${where}: cross-slice import inside ${to.layer}`);
    }
    const crossesSlice = to.layer !== from.layer || to.slice !== from.slice;
    if (crossesSlice && specifier.startsWith('@/')) {
      const depth = specifier.slice(2).split('/').length;
      if (depth > 2) violations.push(`${where}: import the slice public API instead of its internals`);
    }
  }
}

if (violations.length) {
  console.error(
    `FSD layer check failed (${violations.length}):\n${violations.map((item) => `  - ${item}`).join('\n')}`,
  );
  process.exit(1);
}
console.log('FSD layer check passed.');
