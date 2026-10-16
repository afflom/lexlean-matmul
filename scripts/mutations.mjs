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
function rejectCoreTheorem(directory, theorem) {
  const selection = 'src/Core.lex.tex';
  const build = JSON.parse(run('lexlean', ['--diagnostic-format', 'json', 'build', selection], directory));
  assert.equal(build.success, true);
  assert.deepEqual(build.modules, ['Core']);
  assert.match(build.build_id, /^[0-9a-f]{64}$/);
  const generatedRoot = path.join(directory, '.lexlean/build', build.build_id);
  const manifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.build_id, build.build_id);
  const module = manifest.modules.find(row => row.module === 'Core');
  assert.equal(module?.source_path, selection);
  const relative = module.lean_module.replaceAll('.', '/') + '.lean';
  const generatedPath = `modules/${relative}`;
  assert(manifest.outputs.some(row => row.kind === 'lean' && row.path === generatedPath));
  const lines = fs.readFileSync(path.join(generatedRoot, generatedPath), 'utf8').split('\n');
  const declarations = lines.flatMap((line, index) => line.startsWith(`public theorem ${theorem} `) ? [index] : []);
  assert.equal(declarations.length, 1, `Missing unique generated theorem ${theorem}`);
  const firstLine = declarations[0] + 1;
  const next = lines.findIndex((line, index) => index >= firstLine && /^public (?:theorem|def|structure|inductive|class|instance)\b/.test(line));
  const lastLine = next < 0 ? lines.length : next;
  const rejected = reject(directory, 'lexlean', ['verify', selection], /LLV7002/);
  // A failure in Application, a different theorem, or a compiler resource limit
  // cannot establish that the planted arithmetic defect was detected.
  const intended = (rejected.stdout + rejected.stderr).split(/(?=^error\[)/mu).find(block => {
    const location = /generated location: \$STAGING\/lean-src\/([^:\n]+):([0-9]+):[0-9]+/.exec(block);
    return block.startsWith(`error[LLV7002]: Lean rejected \`${module.lean_module}\` (error):`)
      && block.includes('Tactic `rfl` failed') && location?.[1] === relative
      && Number(location[2]) >= firstLine && Number(location[2]) <= lastLine;
  });
  assert(intended, `No arithmetic proof rejection at ${module.lean_module}.${theorem}`);
  return { ...rejected, theorem: `${module.lean_module}.${theorem}`,
    generated_source: generatedPath, generated_lines: { first: firstLine, last: lastLine }, intended_diagnostic: intended };
}
try {
  const stale = path.join(temporary, 'stale-conformance');
  copySource(stale);
  fs.appendFileSync(path.join(stale, 'CONFORMANCE.md'), '\nUnregistered acceptance assertion.\n');
  mutations.push({ defect: 'stale generated conformance', ...reject(stale, 'cargo', ['run', '--locked', '-q', '-p', 'xtask', '--', 'check-model'], /CONFORMANCE.md is stale/) });

  const falseProof = path.join(temporary, 'false-source-proof');
  copySource(falseProof);
  run('prismpm', ['fetch', '--locked'], falseProof);
  const module = sourceModules().find(module => module.module === 'Core');
  assert(module, 'Missing Core arithmetic authority');
  const theorem = module.semantic.declarations.find(row => row.kind === 'theorem' && row.name === 'largeProduct' && row.parameters.length === 0);
  assert(theorem, 'The large-product theorem is required to falsify arithmetic verification');
  theorem.statement = { kind: 'eq', left: { kind: 'nat', value: '0' }, right: { kind: 'nat', value: '1' } };
  const source = path.join(falseProof, 'src', module.path);
  const bytes = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(source, bytes.replace(/^\\semanticdata\{[^\n]*\}$/m, () => `\\semanticdata{${canonical(module.semantic)}}`));
  // Regenerate the source lock so the intended failure is proof checking,
  // rather than the independently enforced source-lock freshness check.
  run('lexlean', ['lock'], falseProof);
  mutations.push({ defect: 'false arithmetic theorem',
    ...rejectCoreTheorem(falseProof, theorem.name) });

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
    ...rejectCoreTheorem(wrongProduct, 'largeProduct') });

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
