// Acceptance driver only. This never implements domain parsing or arithmetic.
import assert from 'node:assert/strict';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const separator = '\u001f';
export function prepareUiVector(application, vector) {
  const input = Buffer.from(vector.request), output = Buffer.from(vector.response);
  let request;
  try { request = decoder.decode(input); } catch { return { exception: 'invalid-utf8' }; }
  if (input.length > application.request_maximum) return { exception: 'input-byte-limit' };
  const research = application.profile === 'prismpm/text-application/4';
  const workbench = research || application.profile === 'prismpm/text-application/3';
  if (!workbench) return { kind: 'raw', input: request, wire: decoder.decode(output), framed: false };
  const view = application.view;
  const operation = view.operations.find(row => request.startsWith(row.request_prefix + separator));
  const raw = request.startsWith(view.raw.request_prefix + separator);
  let prepared;
  if (research && (operation || raw)) {
    let envelope;
    try { envelope = JSON.parse(request.slice((operation?.request_prefix ?? view.raw.request_prefix).length + 1)); }
    catch { return { exception: 'unrepresentable-frame' }; }
    if (!envelope || envelope.version !== 1 || envelope.operation !== (operation?.id ?? 'raw')
      || !Array.isArray(envelope.values) || envelope.values.some(value => typeof value !== 'string')
      || envelope.values.length !== (operation?.fields.length ?? 0) || typeof envelope.request !== 'string'
      || !Array.isArray(envelope.controls) || envelope.controls.length !== 0 || envelope.row !== 0 || envelope.column !== 0
      || envelope.case_text !== '' || envelope.model_id !== '') return { exception: 'unrepresentable-frame' };
    const result = JSON.parse(decoder.decode(output));
    assert.equal(result.version, 2);
    prepared = operation ? { kind: 'guided', operation, values: envelope.values, result, wire: result.response, framed: true }
      : { kind: 'raw', input: envelope.request, result, wire: result.response, framed: true };
    if (operation) {
      if (operation.fields.some((field, index) => field.kind === 'choice'
        && !field.choices.some(choice => choice.value === prepared.values[index]))) return { ...prepared, exception: 'unrepresentable-choice' };
      if (operation.fields.some((field, index) => field.required && !prepared.values[index].trim())) return { ...prepared, exception: 'required-input' };
      if (prepared.values.some((value, index) => operation.fields[index].kind === 'multiline' ? value.includes('\r') : /[\r\n]/.test(value)))
        return { ...prepared, exception: 'html-normalization' };
    }
  } else if (research && request.startsWith('research-')) {
    // Invalid source envelopes and file/action requests have no editable raw
    // arithmetic counterpart. Their genuine action journeys run in MM-27/31;
    // every original byte pair still executes through the generated binding.
    return { exception: 'research-action-frame' };
  } else if (research && request.startsWith('ui-')) {
    // Original presentation frames remain exact ABI vectors. The V4 forms
    // emit the new checked envelope; ordinary v1 protocol bytes still use raw.
    return { exception: 'legacy-presentation-frame' };
  } else if (operation) {
    const values = request.slice(operation.request_prefix.length + 1).split(separator);
    if (values.length !== operation.fields.length) return { exception: 'unrepresentable-frame' };
    const result = JSON.parse(decoder.decode(output));
    prepared = { kind: 'guided', operation, values, result, wire: result.response, framed: true };
    if (operation.fields.some((field, index) => field.kind === 'choice'
      && !field.choices.some(choice => choice.value === values[index]))) return { ...prepared, exception: 'unrepresentable-choice' };
    if (operation.fields.some((field, index) => field.required && !values[index].trim())) return { ...prepared, exception: 'required-input' };
    if (values.some((value, index) => operation.fields[index].kind === 'multiline' ? value.includes('\r') : /[\r\n]/.test(value)))
      return { ...prepared, exception: 'html-normalization' };
  } else if (raw) {
    const result = JSON.parse(decoder.decode(output));
    prepared = { kind: 'raw', input: request.slice(view.raw.request_prefix.length + 1), result, wire: result.response, framed: true };
  } else prepared = { kind: 'raw', input: request, wire: decoder.decode(output), framed: false };
  if (prepared.kind === 'raw') {
    if (!research && prepared.input.includes(separator)) return { ...prepared, exception: 'reserved-separator' };
    const framed = research ? view.raw.request_prefix + separator + JSON.stringify({ version: 1, operation: 'raw',
      request: prepared.input, values: [], row: 0, column: 0, controls: [], model_id: '0'.repeat(64), case_text: '' })
      : view.raw.request_prefix + separator + prepared.input;
    if (Buffer.byteLength(framed) > application.request_maximum)
      return { ...prepared, exception: 'framed-byte-limit' };
    if (prepared.input.includes('\r')) return { ...prepared, exception: 'html-normalization' };
  }
  return prepared;
}

export async function fillUiVector(page, prepared, { selectOperation = true } = {}) {
  assert(prepared.kind === 'raw' || prepared.kind === 'guided');
  if (prepared.kind === 'raw') {
    await page.locator('#raw-editor').evaluate(node => { node.open = true; });
    await page.locator('#request').fill(prepared.input);
  } else {
    if (selectOperation) await page.locator('#operation').selectOption(prepared.operation.id);
    for (const [index, field] of prepared.operation.fields.entries()) {
      const control = page.locator('#field-' + field.id);
      if (field.kind === 'choice') await control.selectOption(prepared.values[index]);
      else await control.fill(prepared.values[index]);
    }
  }
}

export async function submitUiVector(page, prepared, { fill = true, trigger = null } = {}) {
  if (fill) await fillUiVector(page, prepared);
  const button = prepared.kind === 'guided' ? '#guided-submit' : '#submit';
  await page.locator(trigger ?? button).click();
  await page.waitForFunction(expected => document.querySelector('#result').textContent === expected
    && !document.querySelector('#application-form').hasAttribute('aria-busy')
    && !document.querySelector('#guided-form').hasAttribute('aria-busy'), prepared.wire);
  return prepared;
}

export async function assertResultShape(page, rows, columns, view) {
  assert(await page.locator('#result-shape').isVisible(), 'MM-20: actual result dimensions are not visible');
  assert.equal(await page.locator('#result-rows').textContent(), String(rows), 'MM-20: visible result row count differs');
  assert.equal(await page.locator('#result-columns').textContent(), String(columns), 'MM-20: visible result column count differs');
  assert.equal(await page.locator('#result-rows').evaluate(node => node.previousElementSibling.textContent), view.labels.row);
  assert.equal(await page.locator('#result-columns').evaluate(node => node.previousElementSibling.textContent), view.labels.column);
}

export async function assertRenderedResult(page, expected, view) {
  assert.equal(await page.locator('#result').textContent(), expected.response, 'MM-20: exact wire response differs');
  assert.equal(await page.locator('#result-request').textContent(), expected.request, 'MM-20: actual request bytes differ');
  assert.equal(await page.locator('#result-message').textContent(), expected.message, 'MM-20: source result interpretation differs');
  assert.deepEqual(await page.locator('#result-details li').allTextContents(), expected.details, 'MM-20: source details differ');
  if (expected.status === 'ok') await assertResultShape(page, expected.rows, expected.columns, view);
  else {
    assert.equal(await page.locator('#result-shape').isVisible(), false);
    assert.equal(await page.locator('#result-rows').textContent(), '');
    assert.equal(await page.locator('#result-columns').textContent(), '');
  }
  if (expected.cells.length) {
    assert.equal(await page.locator('#result-table tbody tr').count(), expected.rows);
    assert.deepEqual(await page.locator('#result-table tbody td').allTextContents(), expected.cells,
      'MM-20: matrix cells lost precision, changed order, or used a fixture answer');
    assert.equal(await page.locator('#result-table thead th').count(), expected.columns + 1);
  } else assert.equal(await page.locator('#result-table-region').isVisible(), false);
}
