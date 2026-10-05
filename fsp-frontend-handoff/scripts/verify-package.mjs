import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reports = join(root, 'reports');
await mkdir(reports, { recursive: true });
const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.version}`;
const report = { checkedAt: new Date().toISOString(), runtime, platform: process.platform, checks: [] };
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

async function collectFiles(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '__pycache__', '.pnpm-store'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await collectFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

async function staticChecks() {
  const manifest = await readJson('mockups/manifest.json');
  assert.equal(manifest.screens.length, 10, 'Expected exactly ten selected mockups');
  assert.equal(new Set(manifest.screens.map(screen => screen.id)).size, 10);
  assert.equal(new Set(manifest.screens.map(screen => screen.route)).size, 10);
  for (const screen of manifest.screens) {
    const bytes = await readFile(join(root, 'mockups', screen.file));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Invalid PNG: ${screen.file}`);
    assert.equal(digest(bytes), screen.sha256, `Image checksum mismatch: ${screen.file}`);
    assert.ok(bytes.readUInt32BE(16) >= 1400 && bytes.readUInt32BE(20) >= 800, `Unexpected image dimensions: ${screen.file}`);
  }
  const gallery = await readFile(join(root, 'mockups/index.html'), 'utf8');
  assert.equal((gallery.match(/<article>/g) ?? []).length, 10);
  for (const screen of manifest.screens) assert.ok(gallery.includes(`src="${screen.file}"`));

  const contract = await readJson('contracts/openapi.json');
  assert.match(contract.openapi, /^3\.1\./);
  const operationIds = [];
  let references = 0;
  function checkRefs(value) {
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value) {
      assert.match(value.$ref, /^#\//, 'The handoff must not require unresolved external schema files');
      let target = contract;
      for (const segment of value.$ref.slice(2).split('/')) {
        target = target?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
      }
      assert.notEqual(target, undefined, `Unresolved reference: ${value.$ref}`);
      references += 1;
    }
    for (const child of Object.values(value)) checkRefs(child);
  }
  checkRefs(contract);
  for (const [path, item] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      assert.ok(operation.operationId, `Missing operationId: ${method} ${path}`);
      assert.ok(Object.keys(operation.responses ?? {}).some(code => /^2\d\d$/.test(code)), `Missing success response: ${operation.operationId}`);
      operationIds.push(operation.operationId);
    }
  }
  assert.equal(new Set(operationIds).size, operationIds.length, 'Duplicate operation IDs');
  const index = await readFile(join(root, 'docs/API_OPERATIONS.md'), 'utf8');
  for (const id of operationIds) assert.ok(index.includes(`\`${id}\``), `Operation index is stale: ${id}`);

  const requiredFiles = ['README.md', 'START_HERE_RU.md', 'AGENTS.md', 'agent/IMPLEMENTATION_PROMPT.md', 'docs/PRODUCT_RULES.md', 'docs/REQUIREMENTS_TRACEABILITY.md', 'docs/SCREEN_SPECIFICATION.md', 'docs/DESIGN_SYSTEM.md', 'docs/MOCKUP_CORRECTIONS.md', 'docs/FRONTEND_ARCHITECTURE.md', 'docs/STACK_RESEARCH.md', 'docs/API_INTEGRATION.md', 'docs/IMPLEMENTATION_PLAN.md', 'docs/ACCEPTANCE_TESTS.md', 'docs/MOCK_SERVER.md', 'docs/DECISIONS_AND_RISKS.md', 'docs/DEMO_SCRIPT_RU.md', 'sources/organizer-spec.pdf', 'sources/organizer-presentation-template.pptx', 'sources/stack-registry.json', 'mock-server/bun.lock', 'tools/contract-codegen/bun.lock', 'frontend-reference/bun.lock'];
  for (const path of requiredFiles) assert.ok((await stat(join(root, path))).size > 0, `Missing or empty file: ${path}`);

  const files = await collectFiles(root);
  let links = 0;
  for (const path of files.filter(path => path.endsWith('.md'))) {
    const content = await readFile(path, 'utf8');
    for (const match of content.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const file = decodeURIComponent(target.split('#')[0]);
      if (!file) continue;
      const resolved = resolve(dirname(path), file);
      assert.ok(resolved === root || resolved.startsWith(root + sep), `Link leaves handoff: ${relative(root, path)} → ${target}`);
      await stat(resolved);
      links += 1;
    }
  }
  return { images: 10, operations: operationIds.length, resolvedSchemaReferences: references, checkedMarkdownFileLinks: links, scannedFiles: files.length };
}

async function run(name, executable, args, cwd) {
  const started = Date.now();
  const result = await new Promise((resolveResult) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(executable, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => resolveResult({ code: -1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on('close', code => resolveResult({ code: code ?? -1, stdout, stderr }));
  });
  const log = `Command: ${executable} ${args.join(' ')}\nWorking directory: ${relative(root, cwd) || '.'}\nExit code: ${result.code}\n\n${result.stdout}${result.stderr}`;
  await writeFile(join(reports, `${name}.log`), log);
  report.checks.push({ name, passed: result.code === 0, exitCode: result.code, durationMs: Date.now() - started, log: `${name}.log` });
  console.log(`${name}: ${result.code === 0 ? 'PASS' : 'FAIL'}`);
}

try {
  const details = await staticChecks();
  report.checks.push({ name: 'artifact-integrity', passed: true, details });
  console.log('artifact-integrity: PASS');
} catch (error) {
  report.checks.push({ name: 'artifact-integrity', passed: false, error: error.message });
  console.error(`artifact-integrity: FAIL ${error.message}`);
}

const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';
await run('mock-api-tests', bun, ['test', './tests/mock-api.test.mjs'], root);
await run('codegen-drift', bun, ['run', 'check'], join(root, 'tools/contract-codegen'));
await run('reference-typecheck', bun, ['run', 'typecheck'], join(root, 'frontend-reference'));
await run('reference-tests', bun, ['run', 'test'], join(root, 'frontend-reference'));
report.passed = report.checks.every(check => check.passed);
await writeFile(join(reports, 'verification-summary.json'), `${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;
