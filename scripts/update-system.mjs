import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, sdk, run, sha, writeJson, evidenceRoot, capabilityIds, sourceModules } from './evidence.mjs';
import { systemModel, nativeSystemModel } from './system-model.mjs';

function applicationTypeOwner(modules) {
  const applications = modules.filter(module => module.module === 'Application');
  assert.equal(applications.length, 1, 'The application source module must be unique');
  const declarations = applications[0].semantic.declarations.filter(declaration => declaration.kind === 'definition'
    && declaration.name === 'application' && declaration.parameters.length === 0);
  assert.equal(declarations.length, 1, 'The authored application value must be unique and closed');
  const type = declarations[0].result;
  assert.equal(type.kind, 'named');
  assert.equal(type.member.name, 'TextApplication');
  assert.deepEqual(type.arguments, []);
  assert(['Foundation.View.Text.V1.Model', 'Foundation.View.Text.V2.Model', 'Foundation.View.Text.V3.Model'].includes(type.member.module),
    'Application must use an exact supported source-owned text profile');
  return type.member.module;
}

// Explicit source regeneration only. Acceptance and publication never repair a
// stale application binding or reinterpret it as an accepted release.
sdk();
const sourcePath = path.join(root, 'src/MatmulSystem.lex.tex');
const lockPath = path.join(root, 'lexlean.lock');
const original = fs.readFileSync(sourcePath);
const originalLock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : null;
const text = original.toString('utf8');
const prefix = '\\semanticdata{';
const begin = text.indexOf(prefix) + prefix.length;
const end = text.indexOf('\n\\end{semanticmodule}', begin);
assert(begin >= prefix.length && end > begin);
const document = JSON.parse(text.slice(begin, end - 1));
const textApplicationOwner = applicationTypeOwner(sourceModules());
const metadata = systemModel();
const adapterBytes = fs.readFileSync('/opt/prismpm/share/adapters/github-pages-browser.json');
const adapter = JSON.parse(adapterBytes);
assert.equal(adapter.id, 'github-pages-browser');
assert.equal(adapter.model_api, 'prismpm/system-model/2');
const adapterDigest = `sha256:${sha(adapterBytes)}`;
const nativeModule = 'Production.BrowserSystem';
const controls = ['application-acceptance', 'artifact-closure', 'source-proof', 'spdx'];
const named = (module, name) => ({ kind: 'named', member: { module, name }, arguments: [] });
const string = value => ({ kind: 'string', value });
const bool = value => ({ kind: 'bool', value });
const list = (values, element) => values.reduceRight((tail, head) => ({ kind: 'cons', head, tail }), { kind: 'nil', element });
const strings = values => list(values.map(string), { kind: 'string' });
const record = (module, name, fields) => ({ kind: 'record', type: { module, name },
  fields: Object.entries(fields).map(([field, value]) => ({ field, value })) });
const call = (name, ...args) => ({ kind: 'call', function: { name }, arguments: args });
const field = (value, ...names) => names.reduce((value, field) => ({ kind: 'project', value, field }), value);
const equal = (left, right) => ({ kind: 'primitive', operation: 'equal', arguments: [left, right], result: { kind: 'bool' } });
const and = checks => checks.reduceRight((right, left) => ({ kind: 'and', left, right }), bool(true));
const definition = (name, result, body) => ({ kind: 'definition', name, parameters: [], result, body, axioms: [] });
const theorem = (name, left) => ({ kind: 'theorem', name, parameters: [], axioms: [],
  statement: { kind: 'eq', left, right: bool(true) }, proof: { kind: 'decide' } });
const sameStrings = (left, right) => call('stringListsEqual', left, right);
const obligations = document.declarations.find(value => value.name === 'mandatoryControls');
const authoredControls = [];
for (let values = obligations.body; values.kind !== 'nil'; values = values.tail) {
  assert.equal(values.kind, 'cons');
  authoredControls.push(values.head);
}
for (const [id, claim] of [['ieee-encode-once', 'MM-13'], ['integer-output-encoding', 'MM-14'],
  ['epilogue-encode-once', 'MM-15'], ['laurent-atlas', 'MM-16'], ['codec-composition', 'MM-17'],
  ['workbench-guidance', 'MM-18'], ['guided-computation', 'MM-19'], ['readable-exact-results', 'MM-20'],
  ['recoverable-execution', 'MM-21'], ['accessible-workbench', 'MM-22'], ['local-calculation-privacy', 'MM-23'],
  ['durable-publication-evidence', 'MM-24']]) {
  assert(capabilityIds().includes(claim), `Unregistered native-system control ${claim}`);
  if (!authoredControls.some(value => value.fields.some(field => field.field === 'claim' && field.value.value === claim))) {
    authoredControls.push({ kind: 'record', type: { name: 'ControlObligation' }, fields: [
      { field: 'id', value: string(id) }, { field: 'claim', value: string(claim) },
      { field: 'evidence', value: string(`runtime-oracle/${claim}.json`) }, { field: 'mandatory', value: bool(true) },
    ] });
  }
}
obligations.body = list(authoredControls, { kind: 'named', member: { name: 'ControlObligation' }, arguments: [] });
const generatedNames = new Set(['systemModel', 'systemManifest', 'matmulSystemReleaseReady', 'nativeMetadataValid', 'nativeSystemMetadataConsistent']);
const originalNative = document.declarations.find(value => value.name === 'systemModel');
const first = (value, expected) => ({ kind: 'match', scrutinee: value, branches: [
  { constructor: { name: 'List.nil' }, binders: [], body: bool(false) },
  { constructor: { name: 'List.cons' }, binders: ['item', 'rest'], body: { kind: 'match', scrutinee: { kind: 'var', name: 'rest' }, branches: [
    { constructor: { name: 'List.nil' }, binders: [], body: and(expected({ kind: 'var', name: 'item' })) },
    { constructor: { name: 'List.cons' }, binders: ['extra', 'tail'], body: bool(false) },
  ] } },
] });

function render(digest) {
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  const component = metadata.nodes.find(node => node.index === 2).id;
  const model = record(nativeModule, 'SystemModel', {
    product: record('Production.Core', 'Product', { id: string(metadata.id), owner: string(metadata.owner),
      version: string(metadata.version), lifecycle: string('development'), sourcePolicy: string(metadata.sourcePolicy), supportedPlatforms: strings(['browser']) }),
    applicationProfile: record(nativeModule, 'ApplicationProfile', { contract: string('prismpm/browser-resident-application/1'),
      applicationModelDigest: string(digest), execution: string(metadata.execution), persistentStorage: string(metadata.storage),
      externalServices: string(metadata.externalServices), resources: strings(metadata.resources), capabilities: strings(adapter.capabilities) }),
    artifacts: list([record(nativeModule, 'GeneratedArtifact', { id: string(metadata.artifactId), role: string('selected-application'),
      licenseExpression: string(metadata.artifactLicense) })], named(nativeModule, 'GeneratedArtifact')),
    components: list([record(nativeModule, 'Component', { id: string(component), artifact: string(metadata.artifactId),
      kind: string('browser'), version: string(metadata.version) })], named(nativeModule, 'Component')),
    targets: list([record(nativeModule, 'Target', { id: string(metadata.target.id), kind: string(adapter.id), adapterDigest: string(adapterDigest),
      apiVersion: string(adapter.target_api), minimumReleaseStatus: string('development') })], named(nativeModule, 'Target')),
    controls: strings(controls), standards: strings(['SPDX-3.0.1']),
  });
  const manifest = record(nativeModule, 'SystemManifest', { applicationModelDigest: string(digest), productId: string(metadata.id),
    productVersion: string(metadata.version), componentId: string(component), artifactId: string(metadata.artifactId),
    targetId: string(metadata.target.id), controls: strings(controls) });
  const modelValue = call('systemModel'), project = call('browserSystem');
  const checks = ['id', 'owner', 'version', 'sourcePolicy'].map(name => equal(field(modelValue, 'product', name), field(project, name)));
  checks.push(sameStrings(field(modelValue, 'product', 'supportedPlatforms'), strings(['browser'])));
  for (const [native, authored] of [['execution', 'execution'], ['persistentStorage', 'storage'], ['externalServices', 'externalServices']]) {
    checks.push(equal(field(modelValue, 'applicationProfile', native), field(project, authored)));
  }
  checks.push(sameStrings(field(modelValue, 'applicationProfile', 'resources'), field(project, 'resources')));
  checks.push(first(field(modelValue, 'artifacts'), item => [equal(field(item, 'id'), field(project, 'artifactId')),
    equal(field(item, 'licenseExpression'), field(project, 'artifactLicense'))]));
  checks.push(first(field(modelValue, 'components'), item => [equal(field(item, 'id'), string(component)),
    equal(field(item, 'artifact'), field(project, 'artifactId')), equal(field(item, 'version'), field(project, 'version'))]));
  checks.push(first(field(modelValue, 'targets'), item => [equal(field(item, 'id'), field(project, 'target', 'id'))]));
  const declarations = document.declarations.filter(value => !generatedNames.has(value.name));
  declarations.push(definition('systemModel', named(nativeModule, 'SystemModel'), model),
    definition('systemManifest', named(nativeModule, 'SystemManifest'), manifest),
    theorem('matmulSystemReleaseReady', { kind: 'call', function: { module: nativeModule, name: 'validateManifest' }, arguments: [call('systemModel'), call('systemManifest')] }),
    definition('nativeMetadataValid', { kind: 'bool' }, and(checks)), theorem('nativeSystemMetadataConsistent', call('nativeMetadataValid')));
  const imports = ['Application', textApplicationOwner, 'Model', 'Production.BrowserSystem', 'Production.Core'];
  const prologue = '\\begin{lexlean}{MatmulSystem}\n\\useglossary{lexlean.std.bool@1.1.0}\n\\useglossary{lexlean.std.nat@1.1.0}\n'
    + imports.sort().map(name => `\\importmodule{${name}}\n`).join('') + '\\title{Boolean}\n\\begin{semanticmodule}\n\\semanticdata{';
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
  return prologue + canonical({ ...document, declarations }) + '}\n\\end{semanticmodule}\n\\end{lexlean}\n';
}

function checked() {
  const result = spawnSync('prismpm', ['--json', 'check'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1800000 });
  assert.ifError(result.error);
  return { status: result.status, value: JSON.parse(result.stdout), stderr: result.stderr };
}

let completed = false;
try {
  // Updating the native model is an explicit source/lock operation, including
  // migration to the compiler semantics of the selected immutable SDK.
  run('lexlean', ['lock']);
  let digest;
  if (originalNative) {
    const profile = originalNative.body.fields.find(value => value.field === 'applicationProfile').value;
    digest = profile.fields.find(value => value.field === 'applicationModelDigest').value.value;
  } else {
    const before = checked();
    assert.equal(before.status, 0, `Initial application check failed: ${JSON.stringify(before.value)}`);
    digest = `sha256:${before.value.model_id}`;
  }
  fs.writeFileSync(sourcePath, render(digest));
  run('lexlean', ['lock']);
  let result = checked();
  if (result.status !== 0) {
    assert.equal(result.value.diagnostic?.code, 'PP2101', JSON.stringify(result.value));
    const computed = /^system release binds application model (?:"sha256:[0-9a-f]{64}"|sha256:[0-9a-f]{64}), but the imported application model is (sha256:[0-9a-f]{64})$/.exec(result.value.diagnostic.message);
    assert(computed, `SDK did not report an application binding mismatch: ${JSON.stringify(result.value)}`);
    digest = computed[1];
    fs.writeFileSync(sourcePath, render(digest));
    result = checked();
  }
  assert.equal(result.status, 0, `Regenerated system failed SDK check: ${JSON.stringify(result.value)}`);
  assert.equal(digest, `sha256:${result.value.model_id}`);
  nativeSystemModel();
  writeJson(path.join(evidenceRoot, 'native-system-input.json'), { schema: 'lexlean-matmul/native-system-input/1',
    application_model_digest: digest, adapter_digest: adapterDigest, source_sha256: sha(fs.readFileSync(sourcePath)), check: result.value });
  completed = true;
  console.log(`Bound native browser-system /2 to ${digest}`);
} finally {
  if (!completed) {
    fs.writeFileSync(sourcePath, original);
    if (originalLock === null) fs.rmSync(lockPath, { force: true }); else fs.writeFileSync(lockPath, originalLock);
  }
}
