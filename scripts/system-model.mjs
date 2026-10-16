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
export function systemModel(root = repositoryRoot) {
  const modules = new Map();
  const active = new Set();
  const declaration = (module, name) => {
    if (!modules.has(module)) modules.set(module, moduleSource(root, module));
    const value = modules.get(module).get(name);
    assert(value, `${module}.${name}: missing modeled declaration`);
    return value;
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
      case 'bytes': return Buffer.from(value.hex, 'hex');
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

export function deploymentMetadata(root = repositoryRoot) {
  const model = systemModel(root);
  return {
    ...model.target,
    url: new URL(model.target.basePath, model.target.origin).href,
    path: model.target.directory,
    applicationName: model.applicationName,
    artifactId: model.artifactId,
    controls: model.controls,
  };
}

export function validateWorkflow(root = repositoryRoot) {
  const target = deploymentMetadata(root);
  const workflow = readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8');
  for (const action of [target.uploadAction, target.deployAction]) {
    assert.equal(workflow.split(`uses: ${action}`).length - 1, 1, `Pages workflow must bind ${action}`);
  }
  assert(workflow.includes(`path: ${target.directory}`), 'Pages artifact directory differs from the source model');
  assert(workflow.includes(`refs/heads/${target.branch}`), 'Pages publication branch differs from the source model');
  assert(workflow.includes(`name: ${target.environment}`), 'Pages environment differs from the source model');
  assert(workflow.includes('github.ref_protected'), 'Pages publication must require the protected modeled branch');
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(deploymentMetadata(), null, 2)}\n`);
}
