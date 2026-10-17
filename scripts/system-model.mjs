import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function moduleSource(root, name) {
  assert(/^[A-Za-z][A-Za-z0-9]*$/.test(name), 'deployment module name is invalid');
  const source = readFileSync(resolve(root, 'src', `${name}.lex.tex`), 'utf8');
  assert(source.startsWith(`\\begin{lexlean}{${name}}`), `${name}: module identity differs from its source path`);
  const prefix = '\\semanticdata{';
  const start = source.indexOf(prefix);
  const finish = source.indexOf('\n\\end{semanticmodule}', start);
  assert(start >= 0 && finish > start, `${name}: missing semantic module`);
  const payload = source.slice(start + prefix.length, finish);
  assert(payload.endsWith('}'), `${name}: unclosed semantic data`);
  const module = JSON.parse(payload.slice(0, -1));
  assert.equal(module.spec, 'lexlean/semantic-module/1');
  const declarations = new Map();
  for (const declaration of module.declarations) {
    assert(!declarations.has(declaration.name), `${name}: duplicate declaration`);
    declarations.set(declaration.name, declaration);
  }
  return declarations;
}

// This reads closed deployment data. The SDK remains the authority for typing,
// kernel proof replay, generation, and application acceptance.
function sourceReader(root) {
  const modules = new Map();
  const active = new Set();
  let byteNodes = 65536;
  const declaration = (module, name) => {
    if (!modules.has(module)) modules.set(module, moduleSource(root, module));
    const value = modules.get(module).get(name);
    assert(value, `${module}.${name}: missing modeled declaration`);
    return value;
  };
  const evaluateBytes = (value, owner, depth = 0) => {
    assert(depth <= 128 && byteNodes-- > 0, 'closed byte metadata exceeds its finite evaluation budget');
    if (value.kind === 'bytes') {
      assert.equal(typeof value.hex, 'string');
      assert(value.hex.length <= 2 * 16777216 && /^(?:[0-9a-f]{2})*$/.test(value.hex), 'closed byte literal is invalid or oversized');
      return Buffer.from(value.hex, 'hex');
    }
    if (value.kind === 'call') {
      assert.equal(value.arguments.length, 0, 'closed byte metadata only admits zero-argument aliases');
      const module = value.function.module ?? owner, key = `${module}.${value.function.name}`;
      assert(!active.has(key), 'cyclic closed byte metadata');
      const target = declaration(module, value.function.name);
      assert.equal(target.kind, 'definition'); assert.equal(target.parameters.length, 0);
      assert.equal(target.result.kind, 'bytes');
      active.add(key);
      const result = evaluateBytes(target.body, module, depth + 1);
      active.delete(key); return result;
    }
    assert.equal(value.kind, 'primitive', 'unsupported closed byte metadata expression');
    assert.equal(value.operation, 'append'); assert.deepEqual(value.result, { kind: 'bytes' });
    assert.equal(value.arguments.length, 2);
    const left = evaluateBytes(value.arguments[0], owner, depth + 1), right = evaluateBytes(value.arguments[1], owner, depth + 1);
    assert(left.length + right.length <= 16777216, 'closed byte metadata exceeds its byte bound');
    return Buffer.concat([left, right]);
  };
  const evaluate = (value, owner) => {
    switch (value.kind) {
      case 'string': return value.value;
      case 'bool': return value.value;
      case 'nat':
      case 'integer': {
        assert(/^(0|[1-9][0-9]*)$/.test(value.value), 'deployment integer must be canonical and nonnegative');
        const number = Number(value.value);
        assert(Number.isSafeInteger(number), 'deployment integer exceeds exact host boundary');
        return number;
      }
      case 'nil': return [];
      case 'cons': return [evaluate(value.head, owner), ...evaluate(value.tail, owner)];
      case 'bytes': return evaluateBytes(value, owner);
      case 'primitive': return evaluateBytes(value, owner);
      case 'constructor':
        assert.equal(value.arguments.length, 0, 'deployment metadata only admits closed enumeration values');
        return value.constructor.name;
      case 'record': {
        const record = Object.create(null);
        for (const field of value.fields) {
          assert(!Object.hasOwn(record, field.field), 'duplicate modeled field');
          record[field.field] = evaluate(field.value, owner);
        }
        return record;
      }
      case 'call': {
        assert.equal(value.arguments.length, 0, 'deployment metadata may only call closed constants');
        const module = value.function.module ?? owner;
        const name = value.function.name;
        const key = `${module}.${name}`;
        assert(!active.has(key), 'cyclic deployment metadata');
        const target = declaration(module, name);
        assert.equal(target.kind, 'definition');
        assert.equal(target.parameters.length, 0);
        active.add(key);
        const result = evaluate(target.body, module);
        active.delete(key);
        return result;
      }
      default: throw new Error(`unsupported deployment metadata expression ${value.kind}`);
    }
  };
  return { evaluate, declaration };
}

export function systemModel(root = repositoryRoot) {
  const { evaluate, declaration } = sourceReader(root);
  const result = evaluate({ kind: 'call', function: { module: 'MatmulSystem', name: 'browserSystem' }, arguments: [] }, 'MatmulSystem');
  const application = evaluate({ kind: 'call', function: { module: 'Application', name: 'application' }, arguments: [] }, 'Application');
  for (const [field, applicationField] of [
    ['applicationName', 'name'], ['applicationEntryRoot', 'entryRoot'],
    ['applicationProfile', 'profile'], ['requestMaximum', 'requestMaximum'],
    ['responseMaximum', 'responseMaximum'], ['guestAllocationMaximum', 'guestAllocationMaximum'],
  ]) assert.equal(result[field], application[applicationField], `${field}: system/application binding differs`);
  const proof = declaration('MatmulSystem', 'browserSystemBindingsValid');
  assert.equal(proof.kind, 'theorem');
  assert.deepEqual(proof.axioms, []);
  assert.equal(proof.proof.kind, 'decide');
  assert.equal(proof.statement.left.function.name, 'validateSystem');
  assert.equal(proof.statement.left.arguments[0].function.name, 'browserSystem');
  assert.deepEqual(proof.statement.right, { kind: 'bool', value: true });
  assert.equal(new URL(result.target.basePath, result.target.origin).href, application.cargoHomepage);
  assert.equal(application.cargoRepository, `https://github.com/${result.target.repository}`);
  return result;
}

export function nativeSystemModel(root = repositoryRoot) {
  const { evaluate, declaration } = sourceReader(root);
  const read = name => evaluate({ kind: 'call', function: { module: 'MatmulSystem', name }, arguments: [] }, 'MatmulSystem');
  for (const [name, type] of [['systemModel', 'SystemModel'], ['systemManifest', 'SystemManifest']]) {
    const value = declaration('MatmulSystem', name);
    assert.equal(value.result.member.module, 'Production.BrowserSystem');
    assert.equal(value.result.member.name, type);
    assert.equal(value.body.kind, 'record');
    assert.equal(value.body.type.module, 'Production.BrowserSystem');
  }
  const model = read('systemModel'), manifest = read('systemManifest');
  const project = systemModel(root);
  assert.equal(model.product.id, project.id);
  assert.equal(model.product.owner, project.owner);
  assert.equal(model.product.version, project.version);
  assert.equal(model.product.sourcePolicy, project.sourcePolicy);
  assert.deepEqual(model.product.supportedPlatforms, ['browser']);
  assert.equal(model.applicationProfile.execution, project.execution);
  assert.equal(model.applicationProfile.persistentStorage, project.storage);
  assert.equal(model.applicationProfile.externalServices, project.externalServices);
  assert.deepEqual(model.applicationProfile.resources, project.resources);
  assert.match(model.applicationProfile.applicationModelDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(model.artifacts.length, 1);
  assert.equal(model.artifacts[0].id, project.artifactId);
  assert.equal(model.artifacts[0].licenseExpression, project.artifactLicense);
  assert.equal(model.components.length, 1);
  assert.equal(model.components[0].id, project.nodes.find(node => node.index === 2).id);
  assert.equal(model.components[0].artifact, project.artifactId);
  assert.equal(model.components[0].version, project.version);
  assert.equal(model.targets.length, 1);
  assert.equal(model.targets[0].id, project.target.id);
  assert.equal(manifest.applicationModelDigest, model.applicationProfile.applicationModelDigest);
  assert.equal(manifest.productId, model.product.id);
  assert.equal(manifest.productVersion, model.product.version);
  assert.equal(manifest.componentId, model.components[0].id);
  assert.equal(manifest.artifactId, model.artifacts[0].id);
  assert.equal(manifest.targetId, model.targets[0].id);
  assert.deepEqual(manifest.controls, model.controls);
  const release = declaration('MatmulSystem', 'matmulSystemReleaseReady');
  assert.deepEqual(release.axioms, []);
  assert.equal(release.proof.kind, 'decide');
  assert.equal(release.statement.left.function.module, 'Production.BrowserSystem');
  assert.equal(release.statement.left.function.name, 'validateManifest');
  assert.deepEqual(release.statement.left.arguments.map(value => value.function.name), ['systemModel', 'systemManifest']);
  assert.deepEqual(release.statement.right, { kind: 'bool', value: true });
  const consistency = declaration('MatmulSystem', 'nativeSystemMetadataConsistent');
  assert.deepEqual(consistency.axioms, []);
  assert.equal(consistency.proof.kind, 'decide');
  assert.equal(consistency.statement.left.function.name, 'nativeMetadataValid');
  return { model, manifest };
}

export function deploymentMetadata(root = repositoryRoot) {
  const model = systemModel(root);
  const native = nativeSystemModel(root);
  return {
    ...model.target,
    url: new URL(model.target.basePath, model.target.origin).href,
    path: model.target.directory,
    applicationName: model.applicationName,
    artifactId: model.artifactId,
    controls: model.controls,
    nativeSystem: native.model,
  };
}

export function productionPolicy(root = repositoryRoot) {
  const { evaluate } = sourceReader(root);
  const names = ['evidenceRetentionDays', 'publicationRequiresCurrentMain',
    'browserMainThreadGapMaximumMilliseconds', 'browserCpuSlowdown', 'evidenceMaximumBytes',
    'productionEvidenceFailureCodes'];
  const policy = Object.fromEntries(names.map(name => [name,
    evaluate({ kind: 'call', function: { module: 'Model', name }, arguments: [] }, 'Model')]));
  assert(Number.isInteger(policy.evidenceRetentionDays) && policy.evidenceRetentionDays >= 1 && policy.evidenceRetentionDays <= 90);
  assert.equal(typeof policy.publicationRequiresCurrentMain, 'boolean');
  assert(Number.isInteger(policy.browserMainThreadGapMaximumMilliseconds) && policy.browserMainThreadGapMaximumMilliseconds > 0);
  assert(Number.isInteger(policy.browserCpuSlowdown) && policy.browserCpuSlowdown >= 1 && policy.browserCpuSlowdown <= 20);
  assert(Number.isInteger(policy.evidenceMaximumBytes) && policy.evidenceMaximumBytes > 0 && policy.evidenceMaximumBytes <= 67108864);
  assert(Array.isArray(policy.productionEvidenceFailureCodes) && policy.productionEvidenceFailureCodes.length > 0
    && policy.productionEvidenceFailureCodes.every(code => typeof code === 'string' && code.length > 0));
  return policy;
}

export function validateWorkflow(root = repositoryRoot) {
  const target = deploymentMetadata(root);
  const workflow = readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8');
  for (const action of [target.uploadAction, target.deployAction]) {
    assert.equal(workflow.split(`uses: ${action}`).length - 1, 1, `Pages workflow must bind ${action}`);
  }
  assert.equal(workflow.split(`uses: ${target.bundleUploadAction}`).length - 1, 4,
    'Native, acceptance, deployment and publication evidence must use the modeled pinned upload action');
  const bundleUpload = workflow.split(`uses: ${target.bundleUploadAction}`)[1].split('      - ')[0];
  assert(bundleUpload.includes('include-hidden-files: true'), 'Native OCI/evidence bundle upload must include hidden files');
  assert(workflow.includes(`uses: ${target.bundleDownloadAction}`), 'Native release bundle download action differs');
  assert(workflow.includes(`name: ${target.bundleName}`), 'Native release bundle name differs');
  assert(workflow.includes(`path: ${target.bundleDirectory}`), 'Native release bundle directory differs');
  assert(workflow.includes('scripts/system-release.mjs bundle'), 'Pages workflow must retain accepted native OCI evidence');
  assert(workflow.includes(`scripts/system-release.mjs verify-bundle ${target.bundleDirectory}`),
    'Live publication must replay the accepted native release through the SDK source-free API');
  assert(workflow.includes(`path: ${target.directory}`), 'Pages artifact directory differs from the source model');
  assert(workflow.includes(`refs/heads/${target.branch}`), 'Pages publication branch differs from the source model');
  assert(workflow.includes(`name: ${target.environment}`), 'Pages environment differs from the source model');
  assert(workflow.includes('github.ref_protected'), 'Pages publication must require the protected modeled branch');
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(deploymentMetadata(), null, 2)}\n`);
}
