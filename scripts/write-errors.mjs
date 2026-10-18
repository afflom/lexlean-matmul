import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, sourceModules } from './evidence.mjs';

export function acceptanceVectors(modules = sourceModules()) {
  const matches = modules.filter(module => module.module === 'Application');
  assert.equal(matches.length, 1, 'Exactly one Application module is required.');
  assert.equal(matches[0].semantic.spec, 'lexlean/semantic-module/1');
  const application = matches[0].semantic.declarations;
  assert(Array.isArray(application) && application.length <= 65536, 'Bounded Application declarations are required.');
  const declarations = new Map();
  for (const declaration of application) {
    assert.equal(typeof declaration.name, 'string');
    assert(!declarations.has(declaration.name), 'Duplicate Application declaration.');
    declarations.set(declaration.name, declaration);
  }
  const owner = 'Foundation.View.Text.V1.Model';
  const vectorType = { kind: 'named', member: { module: owner, name: 'AcceptanceVector' }, arguments: [] };
  const listType = { kind: 'list', element: vectorType };
  const bytesType = { kind: 'bytes' };
  const listAliases = new Set(), listNodes = new Set();
  let work = 0, totalBytes = 0;
  // Bound every alias visit, including shared constants; no expansion bypasses
  // the same work and byte limits by acquiring a second reference.
  function step() {
    assert(++work <= 65536, 'Acceptance-vector source traversal budget exceeded.');
  }
  const keys = (value, expected) => {
    assert(value && typeof value === 'object' && !Array.isArray(value));
    assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
  };
  function closedDefinition(declaration, type) {
    assert(declaration && declaration.kind === 'definition', 'Unknown or non-definition Application alias.');
    assert.deepEqual(declaration.parameters, [], 'Open Application aliases are forbidden.');
    if (declaration.type_parameters !== undefined) assert.deepEqual(declaration.type_parameters, []);
    assert.deepEqual(declaration.result, type, 'Application alias has the wrong declared result type.');
  }
  function resolve(term, type, tail = false) {
    const active = new Set();
    while (term?.kind === 'call') {
      step();
      keys(term, ['kind', 'function', 'arguments']);
      assert.deepEqual(term.arguments, [], 'Open Application calls are forbidden.');
      const reference = term.function;
      keys(reference, Object.hasOwn(reference, 'module') ? ['module', 'name'] : ['name']);
      assert(!Object.hasOwn(reference, 'module') || reference.module === 'Application', 'Foreign Application aliases are forbidden.');
      assert.equal(typeof reference.name, 'string');
      assert(!active.has(reference.name), 'Cyclic Application alias.');
      assert(active.size < 4096, 'Application alias depth budget exceeded.');
      active.add(reference.name);
      if (tail) {
        assert(!listAliases.has(reference.name), 'Cyclic or shared acceptance-vector list tail.');
        listAliases.add(reference.name);
      }
      const declaration = declarations.get(reference.name);
      closedDefinition(declaration, type);
      term = declaration.body;
    }
    step();
    assert(term && typeof term === 'object', 'Missing closed Application value.');
    return term;
  }
  function bytes(term, active = new Set(), depth = 0) {
    step();
    assert(depth <= 128, 'Acceptance-vector byte expression depth budget exceeded.');
    if (term?.kind === 'primitive') {
      keys(term, ['kind', 'operation', 'result', 'arguments']);
      assert.equal(term.operation, 'append', 'Only closed byte concatenation is admitted.');
      assert.deepEqual(term.result, bytesType);
      assert(Array.isArray(term.arguments) && term.arguments.length === 2, 'Byte concatenation requires exactly two closed operands.');
      const left = bytes(term.arguments[0], active, depth + 1);
      const right = bytes(term.arguments[1], active, depth + 1);
      return { kind: 'bytes', hex: left.hex + right.hex };
    }
    if (term?.kind === 'call') {
      keys(term, ['kind', 'function', 'arguments']);
      const reference = term.function;
      keys(reference, Object.hasOwn(reference, 'module') ? ['module', 'name'] : ['name']);
      assert(!Object.hasOwn(reference, 'module') || reference.module === 'Application', 'Foreign Application byte aliases are forbidden.');
      assert.deepEqual(term.arguments, [], 'Open Application byte aliases are forbidden.');
      assert(!active.has(reference.name), 'Cyclic Application byte alias.');
      const declaration = declarations.get(reference.name);
      closedDefinition(declaration, bytesType);
      active.add(reference.name);
      const result = bytes(declaration.body, active, depth + 1);
      active.delete(reference.name);
      return result;
    }
    keys(term, ['kind', 'hex']);
    assert.equal(term.kind, 'bytes', 'Acceptance-vector fields must resolve to closed byte constants.');
    assert.equal(typeof term.hex, 'string');
    assert.match(term.hex, /^(?:[0-9a-f]{2})*$/, 'Acceptance-vector bytes must be canonical hexadecimal.');
    totalBytes += term.hex.length / 2;
    assert(totalBytes <= 16777216, 'Acceptance-vector expanded byte budget exceeded.');
    return term;
  }
  const declaration = declarations.get('application');
  assert(declaration?.body?.kind === 'record', 'A closed application record is required.');
  const applicationOwner = declaration.body.type?.module;
  assert([owner, 'Foundation.View.Text.V2.Model', 'Foundation.View.Text.V3.Model', 'Foundation.View.Text.V4.Model'].includes(applicationOwner));
  assert.deepEqual(declaration.body.type, { module: applicationOwner, name: 'TextApplication' });
  closedDefinition(declaration, { kind: 'named', member: declaration.body.type, arguments: [] });
  const fields = declaration.body.fields;
  assert(Array.isArray(fields));
  assert.equal(new Set(fields.map(field => field.field)).size, fields.length, 'Duplicate application record field.');
  const selected = fields.find(field => field.field === 'acceptanceVectors');
  assert(selected, 'The application must select acceptance vectors.');
  let list = resolve(selected.value, listType, true);
  const vectors = [];
  while (list.kind === 'cons') {
    keys(list, ['kind', 'head', 'tail']);
    assert(!listNodes.has(list), 'Cyclic or shared acceptance-vector list node.');
    listNodes.add(list);
    const vector = resolve(list.head, vectorType);
    keys(vector, ['kind', 'type', 'fields']);
    assert.equal(vector.kind, 'record');
    assert.deepEqual(vector.type, vectorType.member, 'AcceptanceVector records must belong to Text.V1.Model.');
    assert(Array.isArray(vector.fields));
    assert.deepEqual(vector.fields.map(field => field.field).sort(), ['request', 'response']);
    vectors.push({ ...vector, fields: vector.fields.map(field => {
      keys(field, ['field', 'value']);
      return { ...field, value: bytes(field.value) };
    }) });
    list = resolve(list.tail, listType, true);
  }
  assert.deepEqual(list, { kind: 'nil', element: vectorType });
  return vectors;
}

export function renderErrors() {
  const modules = sourceModules();
  const protocol = modules.find(module => module.module === 'Protocol').semantic.declarations;
  const errors = protocol.find(row => row.kind === 'inductive' && row.name === 'ProtocolError');
  const response = protocol.find(row => row.name === 'errorResponse');
  const vectors = acceptanceVectors();
  assert(vectors.length >= 12, 'The public error contract needs independent byte-level vectors.');
  const expected = vectors.map(row => row.fields.find(field => field.field === 'response').value.hex);
  let result = '<!-- @generated from the typed LexLean errors, source theorems, and application vectors. -->\n\n';
  result += '# Public errors\n\nThe versioned byte interface returns `1`, `error`, and the wire code, separated by tabs.\n\n';
  result += '| Typed variant | Wire code | Modeled negative vectors |\n| --- | --- | --- |\n';
  assert.equal(errors.constructors.length, response.body.branches.length);
  for (const variant of errors.constructors) {
    const branch = response.body.branches.find(row => row.constructor.name === `ProtocolError.${variant.name}`);
    assert(branch && branch.body.kind === 'bytes');
    const text = Buffer.from(branch.body.hex, 'hex').toString('utf8');
    const parts = text.split('\t');
    assert.deepEqual(parts.slice(0, 2), ['1', 'error']);
    assert.equal(parts.length, 3);
    const count = expected.filter(value => value === branch.body.hex).length;
    assert(count > 0, `No modeled negative vector for ${variant.name}`);
    result += `| \`${variant.name}\` | \`${parts[2]}\` | ${count} |\n`;
  }
  const core = modules.find(module => module.module === 'Core').semantic.declarations;
  const matrix = core.find(row => row.kind === 'inductive' && row.name === 'MatrixError');
  result += '\nChecked native matrix APIs return the modeled `MatrixError` result type.\n\n| Typed variant | Negative source theorems |\n| --- | --- |\n';
  for (const variant of matrix.constructors) {
    const witnesses = core.filter(row => row.kind === 'theorem' && row.parameters.length === 0
      && row.statement.kind === 'eq' && row.statement.left.kind === 'call'
      && /^checked/.test(row.statement.left.function.name)
      && row.statement.right.kind === 'constructor'
      && row.statement.right.constructor.name === 'Result.error'
      && row.statement.right.arguments.length === 1
      && row.statement.right.arguments[0].constructor?.name === `MatrixError.${variant.name}`);
    assert(witnesses.length > 0, `No modeled negative theorem for MatrixError.${variant.name}`);
    result += `| \`${variant.name}\` | ${witnesses.map(row => `\`${row.name}\``).join(', ')} |\n`;
  }
  const codec = modules.find(module => module.module === 'Codec')?.semantic.declarations;
  if (codec) {
    const errors = codec.find(row => row.kind === 'inductive' && row.name === 'CodecError');
    result += '\nChecked codec APIs return the modeled `CodecError` result type. The byte adapter maps `InvalidPlan` and `InvalidCode` to `invalid-code`, and `ShapeMismatch` and `Nonconformant` to `shape-mismatch`.\n\n| Typed variant | Negative source theorems |\n| --- | --- |\n';
    for (const variant of errors.constructors) {
      const witnesses = codec.filter(row => row.kind === 'theorem' && row.parameters.length === 0
        && row.statement.kind === 'eq' && row.statement.left.kind === 'call'
        && /^(?:checked|codecChecked)/.test(row.statement.left.function.name)
        && row.statement.right.kind === 'constructor' && row.statement.right.constructor.name === 'Result.error'
        && row.statement.right.arguments[0]?.constructor?.name === `CodecError.${variant.name}`);
      assert(witnesses.length > 0, `No modeled negative theorem for CodecError.${variant.name}`);
      result += `| \`${variant.name}\` | ${witnesses.map(row => `\`${row.name}\``).join(', ')} |\n`;
    }
  }
  const workbench = modules.find(module => module.module === 'Workbench')?.semantic.declarations;
  const presentation = modules.find(module => module.module === 'Presentation')?.semantic.declarations;
  if (workbench && presentation) {
    const variants = workbench.find(row => row.kind === 'inductive' && row.name === 'WorkbenchError');
    const mapping = workbench.find(row => row.name === 'workbenchErrorCode');
    assert(variants && mapping?.body?.kind === 'match');
    assert.equal(variants.constructors.length, mapping.body.branches.length);
    result += '\nThe guided and advanced browser views use the closed `WorkbenchResult` JSON presentation. '
      + 'Protocol failures retain the original wire code and actual request/response bytes. '
      + 'The following defensive presenter failures have typed LexLean variants; isolated exact-source '
      + 'negative fixtures exercise malformed replies and the declared output bound.\n\n';
    result += '| Typed presenter variant | JSON error code | Negative fixture |\n| --- | --- | --- |\n';
    const defensive = new Set();
    for (const variant of variants.constructors) {
      const branch = mapping.body.branches.find(row => row.constructor.name === `WorkbenchError.${variant.name}`);
      assert.equal(branch?.body?.kind, 'string');
      const code = branch.body.value;
      assert.match(code, /^[a-z]+(?:-[a-z]+)*$/);
      assert(!defensive.has(code));
      defensive.add(code);
      const fixtures = { InvalidResponse: 'Malformed actual presenter reply', ResponseTooLarge: 'Response beyond the modeled byte bound' };
      assert(Object.hasOwn(fixtures, variant.name), `Missing defensive fixture for ${variant.name}`);
      const fixture = fixtures[variant.name];
      result += `| \`${variant.name}\` | \`${code}\` | ${fixture} |\n`;
    }
    const view = presentation.find(row => row.name === 'view');
    assert.equal(view?.body?.kind, 'record');
    let hints = view.body.fields.find(row => row.field === 'errors')?.value;
    const declared = new Set(), ui = expected.flatMap(hex => {
      const text = Buffer.from(hex, 'hex').toString('utf8');
      return text.startsWith('{') ? [JSON.parse(text)] : [];
    });
    result += '\nActionable browser error assistance is generated from `Presentation.view.errors`. '
      + 'The input byte limit also has direct transport coverage in the unchanged protocol corpus.\n\n';
    result += '| Error code | Explanation | Recovery | Modeled UI negative vectors |\n| --- | --- | --- | --- |\n';
    while (hints?.kind === 'cons') {
      assert.equal(hints.head.kind, 'record');
      const fields = Object.fromEntries(hints.head.fields.map(row => [row.field, row.value]));
      for (const key of ['code', 'explanation', 'recovery']) assert.equal(fields[key]?.kind, 'string');
      const code = fields.code.value;
      assert(!declared.has(code));
      declared.add(code);
      const count = ui.filter(row => [1, 2].includes(row.version) && row.status === 'error' && row.error === code).length;
      const safe = value => value.replaceAll('|', '&#124;').replaceAll('\n', ' ');
      result += `| \`${code}\` | ${safe(fields.explanation.value)} | ${safe(fields.recovery.value)} | ${count} |\n`;
      hints = hints.tail;
    }
    assert.equal(hints?.kind, 'nil');
    for (const code of defensive) assert(declared.has(code), `Missing modeled browser help for ${code}`);
    for (const branch of response.body.branches) {
      const code = Buffer.from(branch.body.hex, 'hex').toString('utf8').split('\t')[2];
      assert(declared.has(code), `Missing modeled browser help for ${code}`);
    }
    const researchFailures = [
      ['ResearchModel', 'ResearchError', 'researchErrorCode', {
        InvalidSelection: 'MM-25: absent output cell, empty output and bounded-index failures',
        IncompatibleRoute: 'MM-26: route unavailable for the selected operation',
        TraceDisagreement: 'MM-31: exact-source prepared trace with inconsistent terminal observation',
        InvalidInspection: 'MM-28/MM-29: target, operand index or decoded coordinate outside its representation',
        InvalidToolInput: 'MM-28/MM-29: invalid codec plan, stored code, IEEE format or bit pattern',
        InvalidResponse: 'MM-31: exact-source preparation with a malformed actual response',
      }],
      ['ResearchCases', 'ResearchCaseError', 'researchCaseErrorCode', {
        InvalidJson: 'MM-27: malformed JSON and Unicode escape sequences',
        DuplicateField: 'MM-27: duplicate case key',
        InvalidSchema: 'MM-27: unknown, missing or additional schema fields',
        InvalidVersion: 'MM-27: unsupported case version',
        TooLarge: 'MM-27: case text beyond its declared UTF-8 byte limit',
        InvalidIdentity: 'MM-27: malformed saved model identity',
        InvalidType: 'MM-27: wrong scalar or array field type',
        InvalidDraft: 'MM-27: unknown operation or wrong guided-value arity',
        InvalidSelection: 'MM-27: selection outside the bounded index or freshly computed output shape',
        InvalidControls: 'MM-27: unsupported inspection settings or integer representation overflow',
        InconsistentRequest: 'MM-27: saved guided values disagree with saved request',
        InvalidAction: 'MM-27: case action disagrees with selected operation',
        FileRead: 'MM-31: injected native FileReader error callback',
        FileEncoding: 'MM-31: actual file with invalid UTF-8 bytes',
        FileTooLarge: 'MM-31: actual file beyond the declared byte limit',
      }],
      ['ResearchWorkspace', 'WorkspaceError', 'workspaceErrorCode', {
        InvalidEnvelope: 'MM-31: malformed, duplicate, missing, additional or wrongly typed action fields',
        InvalidDraft: 'MM-31: invalid operation, selection or action-control schema',
        UnknownAction: 'MM-31: unknown framed action prefix',
        RuntimeIdentity: 'MM-31: absent or malformed checked runtime identity for a case action',
        ResponseTooLarge: 'MM-31: exact-source serialization at and beyond the modeled response bound',
      }],
    ];
    result += '\nResearch actions use typed source errors in the version 2 workbench reply. '
      + 'A saved answer is an observation; a different saved model identity requires explicit recomputation. '
      + 'The following rows identify required negative fixtures, not their execution results. '
      + 'Current acceptance receipts record the actual outcomes. Exact-source defensive fixtures are isolated '
      + 'generated applications and never replace the shipped dispatcher.\n\n';
    result += '| Source type | Typed variant | JSON error code | Required negative fixture |\n| --- | --- | --- | --- |\n';
    for (const [moduleName, typeName, functionName, fixtures] of researchFailures) {
      const declarations = modules.find(module => module.module === moduleName)?.semantic.declarations;
      assert(declarations, `Missing typed research module ${moduleName}`);
      const variants = declarations.find(row => row.kind === 'inductive' && row.name === typeName);
      const mapping = declarations.find(row => row.name === functionName);
      assert(variants && mapping?.body?.kind === 'match');
      assert.equal(variants.constructors.length, mapping.body.branches.length);
      assert.deepEqual(variants.constructors.map(variant => variant.name).sort(), Object.keys(fixtures).sort());
      for (const variant of variants.constructors) {
        const branch = mapping.body.branches.find(row => row.constructor.name === `${typeName}.${variant.name}`);
        assert.equal(branch?.body?.kind, 'string');
        const code = branch.body.value;
        assert(declared.has(code), `Missing modeled browser help for ${code}`);
        result += `| \`${moduleName}.${typeName}\` | \`${variant.name}\` | \`${code}\` | ${fixtures[variant.name]} |\n`;
      }
    }
  }
  const model = modules.find(module => module.module === 'Model')?.semantic.declarations;
  let failures = model?.find(row => row.name === 'productionEvidenceFailureCodes')?.body;
  if (failures) {
    result += '\nExternal CI observation failures use the closed code set declared by '
      + '`Model.productionEvidenceFailureCodes`. Bounded structured failure receipts preserve '
      + 'the observation scope and revision identity; these codes do not change the arithmetic protocol.\n\n';
    result += '| Publication/evidence failure code |\n| --- |\n';
    const seen = new Set();
    while (failures.kind === 'cons') {
      assert.equal(failures.head.kind, 'string');
      const code = failures.head.value;
      assert.match(code, /^[a-z]+(?:-[a-z]+)*$/);
      assert(!seen.has(code));
      seen.add(code);
      result += `| \`${code}\` |\n`;
      failures = failures.tail;
    }
    assert.equal(failures.kind, 'nil');
    assert(seen.size > 0);
  }
  return result;
}
export function checkErrors() {
  assert.equal(fs.readFileSync(path.join(root, 'ERRORS.md'), 'utf8'), renderErrors(), 'ERRORS.md is stale; run just model-write.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'ERRORS.md'), renderErrors());
  else checkErrors();
}
