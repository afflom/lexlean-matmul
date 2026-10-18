// Source-only negative fixtures call unchanged production functions that cannot
// receive inconsistent prepared values through the public dispatcher. They are
// separate generated applications, never release artifacts or client mutants.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical, confined, evidenceRoot, root, sdk, sha, sourceDigest, sourceModules, writeJson } from './evidence.mjs';

const moduleName = 'ResearchDefensiveFixture';
const string = value => ({ kind: 'string', value });
const natural = value => ({ kind: 'nat', value: String(value) });
const variable = name => ({ kind: 'var', name });
const named = (module, name) => ({ kind: 'named', member: { module, name }, arguments: [] });
const call = (module, name, ...args) => ({ kind: 'call', function: { module, name }, arguments: args });
const project = (value, field) => ({ kind: 'project', value, field });
const primitive = (operation, result, ...args) => ({ kind: 'primitive', operation, result, arguments: args });
const record = (module, name, fields) => ({ kind: 'record', type: { module, name },
  fields: Object.entries(fields).map(([field, value]) => ({ field, value })) });
const bytesType = { kind: 'bytes' }, stringType = { kind: 'string' };
const encode = value => primitive('utf8_encode', bytesType, value);
const equal = (left, right) => primitive('equal', { kind: 'bool' }, left, right);
const ifThen = (condition, then_value, else_value) => ({ kind: 'if', condition, then_value, else_value });
const bytes = value => ({ kind: 'bytes', hex: Buffer.from(value).toString('hex') });
const matchResult = (value, ok, error = variable('error')) => ({ kind: 'match', scrutinee: value, branches: [
  { constructor: { name: 'Result.error' }, binders: ['error'], body: error },
  { constructor: { name: 'Result.ok' }, binders: ['prepared'], body: ok },
] });
const fixtureCall = (name, ...args) => ({ kind: 'call', function: { name }, arguments: args });

export function researchDefensiveFixtureSource(modules) {
  const semantic = new Map(modules.map(module => [module.module, module.semantic]));
  const declarations = [];
  const define = (name, parameters, result, body) => {
    const dependencies = new Set();
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.kind === 'call') {
        const { name: member } = value.function, module = value.function.module || moduleName;
        const declaration = module === moduleName ? declarations.find(item => item.name === member)
          : semantic.get(module)?.declarations.find(item => item.name === member);
        assert(declaration, `defensive-source: missing ${module}.${member}`);
        for (const axiom of declaration.axioms || []) dependencies.add(axiom);
      }
      for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(visit); else visit(child);
    };
    visit(body);
    declarations.push({ kind: 'definition', name, parameters, result, body, axioms: [...dependencies].sort() });
  };
  const input = semantic.get('ResearchModel').declarations.find(item => item.name === 'ResearchInput');
  assert(input?.fields.length);
  const inconsistent = record('ResearchModel', 'ResearchInput', Object.fromEntries(input.fields.map(field => [field.name,
    field.name === 'response' ? string('1\tok\t1\t1\tdefensive-invalid-cell') : project(variable('prepared'), field.name)])));
  const requestParameter = [{ name: 'request', type: stringType }];
  define('fixtureTraceFailure', requestParameter, stringType,
    matchResult(call('ResearchModel', 'researchPrepare', variable('request')),
      project(call('ResearchTrace', 'researchTracePrepared', inconsistent, natural(0), natural(0)), 'error')));
  define('fixtureResponseFailure', requestParameter, stringType,
    matchResult(call('ResearchModel', 'researchPrepareResponse', variable('request'), string('malformed source response')),
      string('unexpected-success')));
  const envelope = { version: 1, operation: 'raw', request: '1\tmatmul\t1\t1\t1\t2\t3', values: [],
    row: 0, column: 0, controls: [], model_id: '0'.repeat(64), case_text: '' };
  define('fixtureComputedReply', [], named('ResearchWorkspace', 'WorkspaceReply'),
    call('ResearchWorkspace', 'workspaceInvoke', string('compute'),
      call('ResearchWorkspace', 'workspaceEnvelope', string(JSON.stringify(envelope)))));
  // Compact doubling constructs the exact modeled response bound in source.
  define('fixtureBytes0', [], bytesType, bytes('x'.repeat(1024)));
  for (let index = 1; index <= 12; index++) define(`fixtureBytes${index}`, [], bytesType,
    primitive('append', bytesType, fixtureCall(`fixtureBytes${index - 1}`), fixtureCall(`fixtureBytes${index - 1}`)));
  const normalReply = fixtureCall('fixtureComputedReply');
  let dispatch = call('ResearchWorkspace', 'workspaceDispatch', variable('request'));
  const commands = [
    ['prepared-trace', encode(fixtureCall('fixtureTraceFailure', string(envelope.request)))],
    ['prepared-response', encode(fixtureCall('fixtureResponseFailure', string(envelope.request)))],
    ['computed-reply', call('ResearchWorkspace', 'workspaceSerialize', normalReply)],
    ['response-at-bound', call('ResearchWorkspace', 'workspaceBound', normalReply, fixtureCall('fixtureBytes12'))],
    ['response-over-bound', call('ResearchWorkspace', 'workspaceBound', normalReply,
      primitive('append', bytesType, fixtureCall('fixtureBytes12'), bytes('x')))],
  ];
  for (const [command, result] of commands) dispatch = ifThen(equal(variable('request'), bytes(`\u001fdefensive-source-v1\u001f${command}`)), result, dispatch);
  define('fixtureDispatch', [{ name: 'request', type: bytesType }], bytesType, dispatch);
  return '\\begin{lexlean}{ResearchDefensiveFixture}\n\\useglossary{lexlean.std.bool@1.1.0}\n'
    + '\\useglossary{lexlean.std.nat@1.1.0}\n'
    + ['ResearchModel', 'ResearchTrace', 'ResearchWorkspace'].map(module => `\\importmodule{${module}}\n`).join('')
    + '\\title{Boolean}\n\\begin{semanticmodule}\n\\semanticdata{'
    + canonical({ spec: 'lexlean/semantic-module/1', declarations }) + '}\n\\end{semanticmodule}\n\\end{lexlean}\n';
}

function command(directory, stage, executable, args) {
  const result = spawnSync(executable, args, { cwd: directory, encoding: 'utf8', timeout: 60 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(directory, `${stage}.stdout`), result.stdout || '');
  fs.writeFileSync(path.join(directory, `${stage}.stderr`), result.stderr || '');
  assert.ifError(result.error);
  assert.equal(result.status, 0, `defensive-${stage}: ${executable} failed\n${result.stdout}\n${result.stderr}`);
  return { stage, status: result.status, stdout_sha256: sha(result.stdout), stderr_sha256: sha(result.stderr) };
}

function prepareFixture(directory, modules, fixture) {
  fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
  for (const module of modules) fs.copyFileSync(path.join(root, 'src', module.path), path.join(directory, 'src', module.path));
  for (const name of ['prismpm.toml', 'prismpm.lock', 'lexlean.toml', 'lexlean.lock', 'standards.lock',
    'lean-toolchain', 'lakefile.toml', 'lake-manifest.json']) fs.copyFileSync(path.join(root, name), path.join(directory, name));
  fs.cpSync(path.join(root, '.prism/sdk'), path.join(directory, '.prism/sdk'), { recursive: true });
  // The containing native System is intentionally outside this negative fixture.
  const projectPath = path.join(directory, 'lexlean.toml');
  const projectText = fs.readFileSync(projectPath, 'utf8').replace(/^entrypoints = .*$/m, 'entrypoints = ["src/Application.lex.tex"]');
  fs.writeFileSync(projectPath, projectText);
  fs.writeFileSync(path.join(directory, 'src', `${moduleName}.lex.tex`), fixture);
  const applicationPath = path.join(directory, 'src/Application.lex.tex');
  let text = fs.readFileSync(applicationPath, 'utf8');
  const data = JSON.parse(/^\\semanticdata\{([^\n]*)\}$/m.exec(text)[1]);
  const application = data.declarations.find(item => item.name === 'application');
  const fields = application.body.fields;
  const entry = fields.find(field => field.field === 'entryRoot');
  assert(entry, 'defensive-source: Application entryRoot is missing');
  entry.value = string(`LexLeanMatmul.${moduleName}.fixtureDispatch`);
  const roots = fields.find(field => field.field === 'libraryRoots');
  const names = [`LexLeanMatmul.${moduleName}.fixtureDispatch`];
  let cursor = roots.value;
  while (cursor.kind === 'cons') { names.push(cursor.head.value); cursor = cursor.tail; }
  assert.equal(cursor.kind, 'nil');
  roots.value = [...new Set(names)].sort().reverse().reduce((tail, name) => ({ kind: 'cons', head: string(name), tail }), { kind: 'nil', element: stringType });
  text = text.replace('\\title{', `\\importmodule{${moduleName}}\n\\title{`)
    .replace(/^\\semanticdata\{[^\n]*\}$/m, () => `\\semanticdata{${canonical(data)}}`);
  fs.writeFileSync(applicationPath, text);
  return modules.map(module => ({ path: `src/${module.path}`, original_sha256: module.sha256,
    fixture_sha256: sha(fs.readFileSync(path.join(directory, 'src', module.path))),
    transformation: module.module === 'Application' ? 'entry-root-and-library-root-only' : 'unchanged' }));
}

async function invokeFixture(directory, fixtureBuild, originalBuild) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, fixtureBuild.manifest_path)));
  const model = JSON.parse(fs.readFileSync(path.join(directory, fixtureBuild.model_path)));
  const originalModel = JSON.parse(fs.readFileSync(confined(originalBuild.model_path)));
  assert.deepEqual(model.application.acceptance_vectors, originalModel.application.acceptance_vectors,
    'defensive-source: normal production vectors must remain byte-for-byte unchanged');
  const wasm = manifest.files.filter(file => /^core-wasm\/[^/]+\.wasm$/.test(file.path));
  assert.equal(wasm.length, 1);
  const artifact = wasm[0], wasmBytes = fs.readFileSync(path.join(directory, path.dirname(fixtureBuild.manifest_path), artifact.path));
  assert.equal(wasmBytes.length, artifact.byte_length); assert.equal(sha(wasmBytes), artifact.sha256.replace(/^sha256:/, ''));
  const compiled = await WebAssembly.compile(wasmBytes);
  assert.deepEqual(WebAssembly.Module.imports(compiled), []);
  const invoke = async request => {
    const input = Buffer.from(request), instance = await WebAssembly.instantiate(compiled, {});
    const { memory, holo_alloc: allocate, holo_run: run } = instance.exports;
    const pointer = allocate(input.length) >>> 0;
    assert(pointer + input.length <= memory.buffer.byteLength);
    new Uint8Array(memory.buffer, pointer, input.length).set(input);
    const result = BigInt.asUintN(64, run(pointer, input.length));
    const at = Number(result >> 32n), length = Number(result & 0xffffffffn);
    assert(at + length <= memory.buffer.byteLength);
    assert(length <= model.application.response_maximum);
    return Buffer.from(new Uint8Array(memory.buffer, at, length));
  };
  const normal = [];
  for (const [index, vector] of model.application.acceptance_vectors.entries()) {
    const request = Buffer.from(vector.request), expected = Buffer.from(vector.response), response = await invoke(request);
    assert(response.equals(expected), `defensive-delegation: vector ${index} changed`);
    normal.push({ index, request_sha256: sha(request), response_sha256: sha(response) });
  }
  assert(normal.length >= 217, 'defensive-delegation: complete production corpus is required');
  const invokeCommand = name => invoke(`\u001fdefensive-source-v1\u001f${name}`);
  const outcomes = [];
  for (const [name, expected] of [['prepared-trace', 'research-trace-disagreement'], ['prepared-response', 'research-invalid-response']]) {
    const response = await invokeCommand(name); assert.equal(response.toString('utf8'), expected);
    outcomes.push({ name, error: expected, bytes: response.length, sha256: sha(response) });
  }
  const computed = JSON.parse((await invokeCommand('computed-reply')).toString('utf8'));
  assert.equal(computed.status, 'ok'); assert.equal(computed.response, '1\tok\t1\t1\t6');
  const boundary = await invokeCommand('response-at-bound');
  assert.equal(boundary.length, model.application.response_maximum); assert(boundary.every(byte => byte === 120));
  outcomes.push({ name: 'response-at-bound', bytes: boundary.length, sha256: sha(boundary) });
  const over = await invokeCommand('response-over-bound'), refusal = JSON.parse(over.toString('utf8'));
  assert.equal(refusal.status, 'error'); assert.equal(refusal.error, 'research-response-too-large');
  assert.equal(refusal.action, computed.action); assert.equal(refusal.operation, computed.operation);
  assert.deepEqual(refusal.cells, []); assert.deepEqual(refusal.tables, []); assert.deepEqual(refusal.panels, []);
  outcomes.push({ name: 'response-over-bound', error: refusal.error, bytes: over.length, sha256: sha(over) });
  return { build_id: fixtureBuild.build_id, manifest_sha256: sha(fs.readFileSync(path.join(directory, fixtureBuild.manifest_path))),
    core_wasm_sha256: sha(wasmBytes), normal_vectors: normal, defensive_outcomes: outcomes };
}

export async function runResearchDefensiveChecks(build) {
  const lock = sdk(), digest = sourceDigest(), modules = sourceModules(), fixture = researchDefensiveFixtureSource(modules);
  const key = sha(canonical({ source_digest: digest, product_build_id: build.build_id, fixture_sha256: sha(fixture),
    driver_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) }));
  const directory = path.join(evidenceRoot, 'research-defensive', key), receiptPath = path.join(directory, 'receipt.json');
  // A cached fixture still executes every ordinary and defensive request again.
  let transformed, stages, fixtureBuild;
  if (fs.existsSync(receiptPath)) {
    const previous = JSON.parse(fs.readFileSync(receiptPath));
    assert.equal(previous.key, key); transformed = previous.source_inputs; stages = previous.compiler_stages;
    fixtureBuild = JSON.parse(fs.readFileSync(path.join(directory, 'build.stdout')));
    for (const input of transformed) assert.equal(sha(fs.readFileSync(path.join(directory, input.path))), input.fixture_sha256);
    for (const stage of stages) {
      assert.equal(stage.status, 0);
      assert.equal(sha(fs.readFileSync(path.join(directory, `${stage.stage}.stdout`))), stage.stdout_sha256);
      assert.equal(sha(fs.readFileSync(path.join(directory, `${stage.stage}.stderr`))), stage.stderr_sha256);
    }
  } else {
    transformed = prepareFixture(directory, modules, fixture);
    stages = [command(directory, 'lock', 'lexlean', ['lock']),
      command(directory, 'kernel-verify', 'lexlean', ['--diagnostic-format', 'json', 'verify']),
      command(directory, 'build', 'prismpm', ['--json', 'build'])];
    fixtureBuild = JSON.parse(fs.readFileSync(path.join(directory, 'build.stdout')));
  }
  const execution = await invokeFixture(directory, fixtureBuild, build);
  assert.equal(sha(fs.readFileSync(path.join(directory, 'src', `${moduleName}.lex.tex`))), sha(fixture));
  assert.equal(sourceDigest(), digest, 'defensive-source: production source changed during the fixture run');
  const receipt = { schema: 'lexlean-matmul/research-defensive/1', qualification: false,
    scope: 'Isolated source-negative app-only fixture; no native System, release or Pages qualification.', key,
    product_build_id: build.build_id, product_source_digest: digest, sdk_image: lock.sdk_image,
    fixture_module_sha256: sha(fixture), source_inputs: transformed,
    fixture_project_sha256: sha(fs.readFileSync(path.join(directory, 'lexlean.toml'))), compiler_stages: stages, execution };
  writeJson(receiptPath, receipt);
  return { schema: receipt.schema, qualification: false, receipt_path: path.relative(root, receiptPath), receipt_sha256: sha(fs.readFileSync(receiptPath)),
    fixture_build_id: fixtureBuild.build_id, normal_vectors: execution.normal_vectors.length, defensive_checks: execution.defensive_outcomes.length };
}
