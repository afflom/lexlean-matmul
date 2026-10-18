import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, files, sourceModules, sdk, readJson } from './evidence.mjs';
import { validateWorkflow } from './system-model.mjs';
import { checkErrors } from './write-errors.mjs';

sdk();
validateWorkflow();
checkErrors();
const modules = sourceModules();
assert(modules.length >= 3, 'Core, application, and system authorities must exist.');
const modelBudget = modules.find(module => module.module === 'Model')?.semantic.declarations
  .find(declaration => declaration.name === 'applicationModelMaximumBytes');
assert.equal(modelBudget?.kind, 'definition');
assert.deepEqual(modelBudget.parameters, []);
assert.deepEqual(modelBudget.result, { kind: 'uint32' });
assert.equal(modelBudget.body.kind, 'integer');
assert.equal(modelBudget.body.representation, 'uint32');
const configuredBudgets = [...fs.readFileSync(path.join(root, 'prismpm.toml'), 'utf8')
  .matchAll(/^max_holo_bytes = ([0-9]+)$/gm)];
assert.equal(configuredBudgets.length, 1, 'The project needs one explicit application-model byte budget.');
assert.equal(configuredBudgets[0][1], modelBudget.body.value,
  'The PrismPM application-model budget must equal its typed source declaration.');
for (const row of files(path.join(root, 'src'))) {
  assert(row.path.endsWith('.lex.tex'), `Product source must be LexLean: ${row.path}`);
}
let theorems = 0;
for (const module of modules) {
  assert.equal(module.semantic.spec, 'lexlean/semantic-module/1');
  assert(module.semantic.declarations.length, `${module.path} is empty`);
  for (const declaration of module.semantic.declarations) {
    if (declaration.kind === 'theorem') {
      theorems += 1;
      assert(Array.isArray(declaration.axioms), `${module.path}:${declaration.name} needs an explicit axiom policy`);
      assert(declaration.proof && declaration.statement);
    }
  }
}
assert(theorems >= 8, 'Every arithmetic family needs checked evidence.');
const lock = readJson(path.join(root, 'prismpm.lock'));
assert.equal(lock.schema, 'prismpm/sdk-lock/2');
assert.equal(new Set(lock.platforms.map(row => row.platform)).size, 2);
console.log(`Pure LexLean authority: ${modules.length} modules, ${theorems} explicit theorem policies.`);
