import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { freshBuild, root, run, sourceModules, canonical, writeJson, sourceDigest, verificationDigest, evidenceRoot, sha } from './evidence.mjs';
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
function rejectGeneratedTheorem(directory, moduleName, theorem, expectedModules) {
  const selection = `src/${moduleName}.lex.tex`;
  const build = JSON.parse(run('lexlean', ['--diagnostic-format', 'json', 'build', selection], directory));
  assert.equal(build.success, true);
  assert.deepEqual(build.modules, expectedModules);
  assert.match(build.build_id, /^[0-9a-f]{64}$/);
  const generatedRoot = path.join(directory, '.lexlean/build', build.build_id);
  const manifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.build_id, build.build_id);
  assert.deepEqual(manifest.modules.map(row => row.module), expectedModules);
  const selected = manifest.modules.filter(row => row.module === moduleName);
  assert.equal(selected.length, 1);
  const module = selected[0];
  assert.equal(module.source_path, selection);
  assert.equal(module.lean_module, `LexLeanMatmul.${moduleName}`);
  const sourceBytes = fs.readFileSync(path.join(directory, selection));
  const sourceInputs = manifest.inputs.filter(row => row.kind === 'source' && row.path === selection);
  assert.equal(sourceInputs.length, 1);
  assert.equal(sourceInputs[0].sha256, sha(sourceBytes));
  assert.equal(sourceInputs[0].byte_length, sourceBytes.length);
  const relative = module.lean_module.replaceAll('.', '/') + '.lean';
  const generatedPath = `modules/${relative}`;
  const generatedOutputs = manifest.outputs.filter(row => row.kind === 'lean' && row.path === generatedPath);
  assert.equal(generatedOutputs.length, 1);
  const generatedBytes = fs.readFileSync(path.join(generatedRoot, generatedPath));
  assert.equal(generatedOutputs[0].sha256, sha(generatedBytes));
  assert.equal(generatedOutputs[0].byte_length, generatedBytes.length);
  const lines = generatedBytes.toString('utf8').split('\n');
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
    selection, modules: expectedModules, build_id: build.build_id,
    source_sha256: sha(sourceBytes), generated_sha256: sha(generatedBytes),
    generated_source: generatedPath, generated_lines: { first: firstLine, last: lastLine }, intended_diagnostic: intended };
}
function reversePackedFields(declarations) {
  const decode = declarations.find(row => row.kind === 'definition' && row.name === 'decodeElement');
  assert(decode, 'Missing codec decoder to falsify');
  const successor = decode.body.branches.find(row => row.constructor.name === 'Nat.succ');
  const packed = successor?.body.branches.find(row => row.constructor.name === 'CodecKind.packed');
  assert(packed, 'Missing packed codec branch');
  let replacements = 0;
  function replace(value) {
    if (!value || typeof value !== 'object') return value;
    if (value.kind === 'primitive' && value.operation === 'quotient'
        && value.arguments[0]?.kind === 'var' && value.arguments[0].name === 'position') {
      assert.equal(value.arguments.length, 3);
      assert.equal(value.arguments[1]?.function?.name, 'maximumBlock');
      replacements += 1;
      return { kind: 'primitive', operation: 'subtract', result: { kind: 'nat' }, arguments: [
        { kind: 'primitive', operation: 'subtract', result: { kind: 'nat' }, arguments: [
          { kind: 'project', value: { kind: 'var', name: 'node' }, field: 'parameter' }, { kind: 'nat', value: '1' }] },
        structuredClone(value)] };
    }
    if (Array.isArray(value)) return value.map(replace);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
  }
  packed.body = replace(packed.body);
  assert.equal(replacements, 1, 'Expected exactly one packed low-first field selector');
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
    ...rejectGeneratedTheorem(falseProof, 'Core', theorem.name, ['Core']) });

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
    ...rejectGeneratedTheorem(wrongProduct, 'Core', 'largeProduct', ['Core']) });

  const wrongRounding = path.join(temporary, 'wrong-ieee-rounding');
  copySource(wrongRounding);
  run('prismpm', ['fetch', '--locked'], wrongRounding);
  const floating = sourceModules().find(module => module.module === 'Float');
  assert(floating, 'Missing IEEE arithmetic authority');
  const rounding = floating.semantic.declarations.find(row => row.kind === 'definition' && row.name === 'isNearest');
  assert(rounding, 'Missing rounding implementation to falsify');
  rounding.body = { kind: 'bool', value: false };
  const floatPath = path.join(wrongRounding, 'src', floating.path);
  fs.writeFileSync(floatPath, fs.readFileSync(floatPath, 'utf8').replace(/^\\semanticdata\{[^\n]*\}$/m,
    () => `\\semanticdata{${canonical(floating.semantic)}}`));
  run('lexlean', ['lock'], wrongRounding);
  mutations.push({ defect: 'nearest IEEE rounding replaced with truncation',
    ...rejectGeneratedTheorem(wrongRounding, 'Float', 'nearestEvenUp32', ['Atlas', 'Core', 'Float']) });

  const wrongAtlasSign = path.join(temporary, 'wrong-atlas-atom-sign');
  copySource(wrongAtlasSign);
  run('prismpm', ['fetch', '--locked'], wrongAtlasSign);
  const atlas = sourceModules().find(module => module.module === 'Atlas');
  assert(atlas, 'Missing canonical Laurent atom authority');
  const atomProduct = atlas.semantic.declarations.find(row => row.kind === 'definition' && row.name === 'digitProduct');
  assert(atomProduct, 'Missing ternary lookup implementation to falsify');
  const negativeRow = atomProduct.body.branches.find(row => row.constructor.name === 'AtlasDigit.negative');
  const positiveColumn = negativeRow?.body.branches.find(row => row.constructor.name === 'AtlasDigit.positive');
  assert(positiveColumn, 'Missing negative-by-positive lookup entry');
  positiveColumn.body = { kind: 'constructor', constructor: { name: 'AtlasDigit.positive' }, arguments: [] };
  const atlasPath = path.join(wrongAtlasSign, 'src', atlas.path);
  fs.writeFileSync(atlasPath, fs.readFileSync(atlasPath, 'utf8').replace(/^\\semanticdata\{[^\n]*\}$/m,
    () => `\\semanticdata{${canonical(atlas.semantic)}}`));
  run('lexlean', ['lock'], wrongAtlasSign);
  mutations.push({ defect: 'negative-by-positive Laurent atom product sign inverted',
    ...rejectGeneratedTheorem(wrongAtlasSign, 'Atlas', 'lookupProductCase0', ['Atlas', 'Core']) });

  const wrongPackedOrder = path.join(temporary, 'wrong-packed-field-order');
  copySource(wrongPackedOrder);
  run('prismpm', ['fetch', '--locked'], wrongPackedOrder);
  const codec = sourceModules().find(module => module.module === 'Codec');
  assert(codec, 'Missing structured codec authority');
  reversePackedFields(codec.semantic.declarations);
  const codecPath = path.join(wrongPackedOrder, 'src', codec.path);
  fs.writeFileSync(codecPath, fs.readFileSync(codecPath, 'utf8').replace(/^\\semanticdata\{[^\n]*\}$/m,
    () => `\\semanticdata{${canonical(codec.semantic)}}`));
  run('lexlean', ['lock'], wrongPackedOrder);
  mutations.push({ defect: 'packed codec low-first fields decoded in reverse order',
    ...rejectGeneratedTheorem(wrongPackedOrder, 'Codec', 'packedLowFirst', ['Atlas', 'Codec', 'Core', 'Float']) });

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
