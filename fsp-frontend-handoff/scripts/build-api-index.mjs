import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const api = JSON.parse(await readFile(new URL('contracts/openapi.json', root), 'utf8'));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const rows = [];
for (const [path, item] of Object.entries(api.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!methods.has(method)) continue;
    const scope = path.startsWith('/__mock__/') ? 'Development only' : path === '/health' ? 'Health' : 'Application';
    const success = Object.keys(operation.responses).filter(code => /^2\d\d$/.test(code)).join(', ');
    rows.push(`| \`${operation.operationId}\` | ${method.toUpperCase()} | \`${path}\` | ${success} | ${scope} |`);
  }
}
const body = `# API operation index\n\nGenerated from \`../contracts/openapi.json\` by \`scripts/build-api-index.mjs\`. Do not edit the table independently. Contract version: ${api.info.version}. The exact bodies, error schemas, authorization descriptions and parameters remain in OpenAPI.\n\n| Operation | Method | Path | Success | Scope |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nTotal documented operations: ${rows.length}. Development controls are not production application endpoints.\n`;
await writeFile(new URL('docs/API_OPERATIONS.md', root), body);
console.log(`API index built: ${rows.length} operations.`);
