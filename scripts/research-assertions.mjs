// Independent research acceptance. This file is never part of the shipped app.
import assert from 'node:assert/strict';
import { expectedAccumulation, scalarEquivalent, scalarText, traceColumns } from './research-cases.mjs';
import { ieeeOracle } from './extended-oracle.mjs';

const same = (actual, expected, message) => assert.deepEqual(actual, expected, message);
export const inspectColumns = Object.freeze({
  'operand-values': ['Target', 'Index', 'Stored', 'Decoded'],
  'codec-path': ['Stage', 'Kind', 'Input code', 'Position', 'Selected child code', 'Child position', 'Decoded value'],
  'ieee-fields': ['Field', 'Value'],
  'atlas-atoms': ['Digit', 'Position', 'Grade', 'Revolution', 'Scope', 'Context', 'Modality'],
  'comparison-work': ['Unit', 'Count', 'Meaning'],
  'lookup-contributions': ['Index','Activation','Stored symbol','Decoded weight','Gathered product','Before','After'],
});
export function reportTable(report, id, columns = inspectColumns[id]) {
  assert(Array.isArray(report.tables), 'research-shape: tables are absent');
  const matches = report.tables.filter(table => table.id === id);
  same(matches.length, 1, `research-table: expected exactly one ${id}`);
  const table = matches[0];
  assert.equal(typeof table.title, 'string'); assert(table.title.trim());
  same(table.columns, columns, `research-columns: ${id}`);
  assert(Array.isArray(table.rows));
  assert(table.rows.every(row => Array.isArray(row) && row.length === columns.length && row.every(cell => typeof cell === 'string')),
    `research-shape: malformed ${id} rows`);
  return table.rows;
}
function equalScalar(actual, domain, expected, label) {
  assert(scalarEquivalent(actual, domain, expected), `research-scalar: ${label}: ${actual} differs from ${scalarText(domain, expected)}`);
}
function terminalCell(fixture, index) {
  const x = fixture.output[index];
  if (fixture.domain === 'complex') return `(${x.real}) + (${x.imaginary})i`;
  if (fixture.family === 'dyadic') return `${x.coefficient} / 2^${x.scale}`;
  return x === null ? '-inf' : String(x);
}
export function expectedResearchCells(fixture) {
  return fixture.output.map((_value,index)=>terminalCell(fixture,index)+(fixture.family==='tropical'?' [witness '+fixture.expectedResponse.split('\t')[5].split(',')[index]+']':''));
}
export function assertTrace(report, fixture, row, column) {
  assert.equal(report.status, 'ok', 'research-status: trace did not succeed');
  assert.equal(report.request, fixture.request, 'research-input: trace changed canonical operands');
  assert.equal(report.response, fixture.expectedResponse, 'research-wire: trace changed actual computation');
  same(report.selection, { row, column }, 'research-selection: wrong output cell');
  const rows = reportTable(report, fixture.normalize ? 'recenter-trace' : 'calculation-trace', traceColumns);
  if (fixture.rows * fixture.columns === 0) {
    same(rows.length, 1, 'research-empty: empty output must explain its actual shape');
    same(rows[0][0], 'empty output', 'research-empty: a fabricated output cell was traced'); return;
  }
  if (fixture.normalize) {
    same(rows.length, fixture.original.length + 1, 'research-recenter: normalization trace was truncated');
    let maximum = null;
    for (let i = 0; i < fixture.original.length; i++) {
      const current = rows[i], value = fixture.original[i];
      same(current[0], 'global maximum'); same(current[1], String(i));
      equalScalar(current[2], 'tropical', value, 'recenter original value');
      equalScalar(current[5], 'tropical', maximum, 'recenter previous global maximum');
      maximum = fixture.arithmetic.add(maximum, value);
      equalScalar(current[6], 'tropical', maximum, 'recenter accumulated global maximum');
    }
    const last = rows.at(-1); same(last[0], 'remove maximum'); same(last[1], String(column));
    equalScalar(last[2], 'tropical', fixture.original[column], 'recenter selected value');
    equalScalar(last[3], 'tropical', maximum, 'recenter removed maximum');
    equalScalar(last[6], 'tropical', fixture.output[column], 'recenter final selected value'); return;
  }
  const expected = expectedAccumulation(fixture, row, column), index = row * fixture.columns + column;
  const phases = [...Array(fixture.inner).fill('accumulate'), ...(fixture.hasLinear ? ['linear epilogue'] : []),
    ...(fixture.hasBias ? ['column bias'] : []), ...(fixture.family === 'tropical' ? ['least attaining witness'] : []), 'terminal encoding'];
  same(rows.map(r => r[0]), phases, 'research-phases: terms, epilogues or terminal encoding were omitted/repeated');
  for (let k = 0; k < expected.length; k++) {
    const actual = rows[k], step = expected[k]; same(actual[1], String(k), 'research-order: original reduction index changed');
    for (const [field, offset] of [['left', 2], ['right', 3], ['product', 4], ['before', 5], ['after', 6]]) {
      equalScalar(actual[offset], fixture.domain, step[field], `${fixture.family} ${row},${column} term${k} ${field}`);
    }
  }
  if (fixture.hasLinear) {
    const actual = rows.find(r => r[0] === 'linear epilogue'); same(actual[1], 'alpha, beta');
    equalScalar(actual[2], 'integer', fixture.alpha, 'epilogue alpha'); equalScalar(actual[3], 'integer', fixture.beta, 'epilogue beta');
    equalScalar(actual[4], fixture.domain, fixture.prior[index], 'epilogue oldC');
    equalScalar(actual[5], fixture.domain, fixture.reduced[index], 'epilogue reduction');
    equalScalar(actual[6], fixture.domain, fixture.linear[index], 'epilogue actual output');
  }
  if (fixture.hasBias) {
    const actual = rows.find(r => r[0] === 'column bias'); same(actual[1], String(column));
    equalScalar(actual[2], 'integer', fixture.bias[column], 'actual column bias');
    equalScalar(actual[5], fixture.domain, fixture.linear[index], 'before bias');
    equalScalar(actual[6], fixture.domain, fixture.beforeEncoding[index], 'after bias');
  }
  if (fixture.family === 'tropical') {
    const actual = rows.find(r => r[0] === 'least attaining witness');
    same(actual[1], 'original index');
    const expectedWitness = fixture.expectedResponse.split('\t')[5].split(',')[index];
    same(actual[5], expectedWitness, 'research-witness: tie did not retain least original index');
    equalScalar(actual[6], fixture.domain, fixture.reduced[index], 'attaining value');
  }
  assertLookupContributions(report,fixture,row,column);
  const terminal = rows.at(-1); same(terminal[1], 'once', 'research-terminal: encoding must occur exactly once');
  equalScalar(terminal[5], fixture.domain, fixture.beforeEncoding[index], 'exact value before terminal encoding');
  same(terminal[6], terminalCell(fixture, index), 'research-terminal: terminal bits or scalar differ');
}
export function assertLookupContributions(report, fixture, row, column) {
  const required = ['table','ieee-table','arena'].includes(fixture.family) || (fixture.family==='codec' && fixture.request.split('\t')[2]==='table');
  if(!required)return;
  const rows=reportTable(report,'lookup-contributions');
  same(rows.length,fixture.inner,'research-lookup: selected gather rows were omitted');
  for(const step of expectedAccumulation(fixture,row,column)) {
    const actual=rows[step.index]; same(actual[0],String(step.index),'research-lookup: gather order changed');
    equalScalar(actual[1],fixture.domain,step.left,'lookup activation');
    let stored;
    if(fixture.family==='codec') {
      const codes=fixture.storedCodes[step.index];
      const mapping=fixture.storedMapping?.[step.index]?.[column] ?? {code:codes[column],coordinate:0};
      stored=String(mapping.code)+' @ '+mapping.coordinate;
    } else {
      const code=fixture.storedCodes[step.index*fixture.columns+column];
      stored=String(code)+(fixture.domain==='ieee'?' -> '+String(code%BigInt(fixture.book.length)):'');
    }
    same(actual[2],stored,'research-lookup: wrong stored symbol or decoded coordinate');
    equalScalar(actual[3],fixture.domain,step.right,'lookup decoded weight');
    equalScalar(actual[4],fixture.domain,step.product,'actual gathered product');
    equalScalar(actual[5],fixture.domain,step.before,'actual gather prefix');
    equalScalar(actual[6],fixture.domain,step.after,'actual gather accumulated output');
  }
}
export async function assertComparison(report, fixture, invoke) {
  same(report.status, 'ok', 'research-status: comparison did not succeed');
  same(report.request, fixture.request, 'research-input: comparison changed canonical operands');
  same(report.response, fixture.expectedResponse, 'research-wire: primary calculation differs');
  same(report.comparison.status, 'equivalent', 'research-equivalence: actual routes disagree');
  assert(report.comparison.message.trim());
  same(report.panels.map(p => p.id), ['primary', 'alternate'], 'research-panels: both actual routes are required');
  for (const panel of report.panels) {
    same([panel.rows, panel.columns], [fixture.rows, fixture.columns], 'research-panel-shape: changed operands or output shape');
    same(panel.cells,expectedResearchCells(fixture),'research-panel-cells: route cell interpretation differs from independent exact output');
    same(panel.response, fixture.expectedResponse, 'research-panel-wire: alternate output differs');
    assert(panel.request.length > 0, 'research-route: missing independently executable request');
    same(await invoke(panel.request), panel.response, 'research-reexecution: panel response is not actually executable');
  }
  assert.notEqual(report.panels[0].request, report.panels[1].request, 'research-route: alternate is the original request');
  const rows = reportTable(report, 'comparison-work');
  const counts = new Map(rows.map(row => [row[0], row])); same(counts.size, rows.length, 'research-work: duplicate work metric');
  const expectedProducts=fixture.normalize?0:fixture.rows*fixture.inner*fixture.columns;
  const storage=['coded','table','codec','ieee-table','arena'].includes(fixture.family);
  const bookLength=fixture.family==='coded'?3:fixture.family==='codec'?fixture.codecDecodedMass??new Set(fixture.storedCodes.flat().map(String)).size:fixture.book?.length??0;
  const expected=new Map([['direct scalar products',expectedProducts],['table precomputation products',storage?fixture.rows*fixture.inner*bookLength:0],
    ['output reduction steps',fixture.normalize?fixture.original.length:expectedProducts],['table gathers',storage?expectedProducts:0]]);
  if(fixture.normalize)expected.set('recenter normalization entries',fixture.original.length);
  same([...counts.keys()].sort(),[...expected.keys()].sort(),'research-work: unexpected or missing mathematical work unit');
  for(const [key,value]of expected) {
    same(counts.get(key)?.[1],String(value),'research-work: inaccurate '+key);assert(counts.get(key)?.[2].trim(),'research-work: missing unit meaning');
  }

}
export function ieeeCases() {
  return ['f32', 'f64'].flatMap(format => {
    const f = format === 'f32' ? 23n : 52n, e = format === 'f32' ? 8n : 11n, sign = 1n << (f + e), maxExp = ((1n << e) - 1n) << f;
    return [0n, sign, 1n, sign | 1n, (1n << f) - 1n, 1n << f,
      format === 'f32' ? 1065353216n : 4607182418800017408n, sign | (format === 'f32' ? 1065353216n : 4607182418800017408n), maxExp - 1n, sign | (maxExp - 1n), maxExp, sign | maxExp,
      maxExp | 1n, sign | maxExp | 1n, maxExp | (1n << (f - 1n)) | 3n].map(bits => ({ format, bits }));
  });
}
export function assertIeeeInspection(report, format, bits) {
  same(report.status, 'ok', 'research-status: IEEE inspection did not succeed');
  const rows = reportTable(report, 'ieee-fields'), values = new Map(rows);
  same(values.size, rows.length, 'research-ieee: duplicate bitfield');
  const fractionWidth = format === 'f32' ? 23n : 52n, exponentWidth = format === 'f32' ? 8n : 11n;
  const fraction = bits & ((1n << fractionWidth) - 1n), exponent = (bits >> fractionWidth) & ((1n << exponentWidth) - 1n);
  const sign = bits >> (fractionWidth + exponentWidth), allExp = (1n << exponentWidth) - 1n;
  const classification = exponent === allExp ? fraction === 0n ? sign ? 'negative infinity' : 'positive infinity'
    : fraction & (1n << (fractionWidth - 1n)) ? 'quiet NaN' : 'signaling NaN' : exponent === 0n
      ? fraction === 0n ? sign ? 'negative zero' : 'positive zero' : 'subnormal' : 'normal';
  for (const [key, expected] of [['Format', format === 'f32' ? 'binary32' : 'binary64'], ['Unsigned source bits', String(bits)],
    ['Classification', classification], ['Sign bit', String(sign)], ['Exponent field', String(exponent)],
    ['Fraction field', String(fraction)], ['NaN payload field', exponent === allExp && fraction !== 0n ? String(fraction) : '0']]) {
    same(values.get(key), expected, `research-ieee: wrong ${key}`);
  }
  const decoded = ieeeOracle.decode(format, bits);
  equalScalar(values.get('Exact decoded value'), 'ieee', decoded, 'exact IEEE dyadic');
  for (const mode of ['nearest', 'toward-zero', 'saturating', 'wrapping']) {
    same(values.get(`Terminal ${mode} bits`), String(ieeeOracle.encode(format, mode, decoded)), `research-ieee: terminal ${mode}`);
  }
  const atoms = reportTable(report, 'atlas-atoms');
  if (decoded.kind !== 'finite' || decoded.coefficient === 0n) { same(atoms.length, 0, 'research-atoms: nonfinite/zero has invented finite atoms'); return; }
  let coefficient = decoded.coefficient, power = decoded.exponent;
  while (coefficient % 2n === 0n) { coefficient /= 2n; power++; }
  let normalized = 0n, previousPosition = -2;
  const address = (grade, digit) => {
    const revolution = Math.floor(grade / 32), residue = grade - 32 * revolution;
    return [revolution, Math.floor(residue / 8), residue % 8, Number(digit) + 1].map(String);
  };
  for (const row of atoms) {
    const digit = BigInt(row[0]), position = Number(row[1]), grade = Number(row[2]);
    assert(digit === -1n || digit === 1n, 'research-atoms: NAF digit is not signed unit');
    assert(Number.isSafeInteger(position) && position >= 0 && position > previousPosition + 1, 'research-atoms: NAF positions are not nonadjacent ascending');
    same(grade, power + position, 'research-atoms: grade differs from actual Laurent exponent');
    same(row.slice(3), address(grade, digit), 'research-atoms: Atlas address does not contract to actual grade');
    normalized += digit * (1n << BigInt(position)); previousPosition = position;
  }
  same(normalized, coefficient, 'research-atoms: signed atoms do not reconstruct normalized source coefficient');
}
export function plantReportDefect(report, mutate, check, pattern) {
  const changed = structuredClone(report); mutate(changed);
  assert.throws(() => check(changed), pattern, 'research-negative: planted report defect was accepted');
}
