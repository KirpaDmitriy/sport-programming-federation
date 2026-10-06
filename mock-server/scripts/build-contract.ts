import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/contract.ts';

const target = new URL('../../contracts/', import.meta.url);
await mkdir(target, { recursive: true });
await writeFile(new URL('openapi.json', target), `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`Wrote ${fileURLToPath(new URL('openapi.json', target))}`);
