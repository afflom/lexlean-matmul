import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { freshBuild, root, run, sourceModules, canonical, writeJson, sourceDigest, verificationDigest, evidenceRoot } from './evidence.mjs';
import { copySource } from './clean-copy.mjs';

freshBuild();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lexlean-matmul-falsification-'));
const mutations = [];
function reject(directory, command, args, diagnostic) {
  const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1800000 });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, 'A planted defect passed its acceptance gate');
  assert.match(result.stdout + result.stderr, diagnostic, 'Mutation failed at an unrelated boundary');
  return { command: [command, ...args], exit_code: result.status, stdout: result.stdout, stderr: result.stderr };
}
try {
  const stale = path.join(temporary, 'stale-conformance');
  copySource(stale);
  fs.appendFileSync(path.join(stale, 'CONFORMANCE.md'), '\nUnregistered acceptance assertion.\n');
  mutations.push({ defect: 'stale generated conformance', ...reject(stale, 'cargo', ['run', '--locked', '-q', '-p', 'xtask', '--', 'check-model'], /CONFORMANCE.md is stale/) });

  const falseProof = path.join(temporary, 'false-source-proof');
  copySource(falseProof);
  run('prismpm', ['fetch', '--locked'], falseProof);
  const module = sourceModules().find(module => module.semantic.declarations.some(row => row.kind === 'theorem' && row.parameters.length === 0));
  assert(module, 'A concrete theorem is required to falsify kernel verification');
  const theorem = module.semantic.declarations.find(row => row.kind === 'theorem' && row.parameters.length === 0);
  theorem.statement = { kind: 'eq', left: { kind: 'nat', value: '0' }, right: { kind: 'nat', value: '1' } };
  const source = path.join(falseProof, 'src', module.path);
  const bytes = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(source, bytes.replace(/^\\semanticdata\{[^\n]*\}$/m, () => `\\semanticdata{${canonical(module.semantic)}}`));
  // Regenerate the source lock so the intended failure is proof checking,
  // rather than the independently enforced source-lock freshness check.
  run('lexlean', ['lock'], falseProof);
  mutations.push({ defect: 'false arithmetic theorem', theorem: `${module.module}.${theorem.name}`,
    ...reject(falseProof, 'lexlean', ['verify'], /LLV7002/) });

  const wrongProduct = path.join(temporary, 'wrong-product-implementation');
  copySource(wrongProduct);
  run('prismpm', ['fetch', '--locked'], wrongProduct);
  const core = sourceModules().find(module => module.module === 'Core');
  const multiplication = core.semantic.declarations.find(row => row.kind === 'definition' && row.name === 'integerMultiply');
  assert(multiplication, 'Missing arithmetic implementation to falsify');
  multiplication.body = { kind: 'call', function: { name: 'zero' }, arguments: [] };
  const corePath = path.join(wrongProduct, 'src', core.path);
  fs.writeFileSync(corePath, fs.readFileSync(corePath, 'utf8').replace(/^\\semanticdata\{[^\n]*\}$/m,
    () => `\\semanticdata{${canonical(core.semantic)}}`));
  run('lexlean', ['lock'], wrongProduct);
  mutations.push({ defect: 'integer multiplication replaced with zero',
    ...reject(wrongProduct, 'lexlean', ['verify'], /LLV7002/) });

  const foreign = path.join(temporary, 'handwritten-product-source');
  copySource(foreign);
  fs.writeFileSync(path.join(foreign, 'src', 'Handwritten.lean'), 'def foreignValue : Nat := 1\n');
  mutations.push({ defect: 'handwritten product bypass', ...reject(foreign, 'node', ['scripts/project-policy.mjs'], /Product source must be LexLean/) });

  writeJson(path.join(evidenceRoot, 'falsification.json'), {
    schema: 'lexlean-matmul/falsification/1', source_digest: sourceDigest(), verification_digest: verificationDigest(), mutations,
  });
  console.log(`${mutations.length} representative defects rejected by the intended gates.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
