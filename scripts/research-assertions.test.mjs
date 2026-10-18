import assert from 'node:assert/strict';
import test from 'node:test';
import { researchFamilies, researchCase, completeResearchCases, expectedAccumulation, scalarText, scalarReferences, traceColumns,
  signedEncoding, tropicalEncoding } from './research-cases.mjs';
import { assertTrace, assertComparison, assertIeeeInspection, ieeeCases } from './research-assertions.mjs';
import { codecPath, codecInspectionCases, assertCodecInspection } from './research-codec-reference.mjs';
import { ieeeOracle } from './extended-oracle.mjs';

function traceFixture(fixture, row = 0, column = 0) {
  const index = row * fixture.columns + column;
  const rows = expectedAccumulation(fixture, row, column).map(step => ['accumulate', String(step.index),
    ...['left', 'right', 'product', 'before', 'after'].map(key => scalarText(fixture.domain, step[key]))]);
  if (fixture.hasLinear) rows.push(['linear epilogue', 'alpha, beta', String(fixture.alpha), String(fixture.beta),
    scalarText(fixture.domain, fixture.prior[index]), scalarText(fixture.domain, fixture.reduced[index]), scalarText(fixture.domain, fixture.linear[index])]);
  if (fixture.hasBias) rows.push(['column bias', String(column), String(fixture.bias[column]), '', '',
    scalarText(fixture.domain, fixture.linear[index]), scalarText(fixture.domain, fixture.beforeEncoding[index])]);
  if (fixture.family === 'tropical') rows.push(['least attaining witness', 'original index', '', '', '',
    fixture.expectedResponse.split('\t')[5].split(',')[index], scalarText(fixture.domain, fixture.reduced[index])]);
  const final = fixture.output[index], terminal = fixture.domain === 'complex' ? scalarText('complex', final)
    : fixture.family === 'dyadic' ? scalarText('dyadic', final) : final === null ? '-inf' : String(final);
  rows.push(['terminal encoding', 'once', fixture.domain, fixture.mode, '', scalarText(fixture.domain, fixture.beforeEncoding[index]), terminal]);
  return { status: 'ok', request: fixture.request, response: fixture.expectedResponse, selection: { row, column },
    tables: [{ id: 'calculation-trace', title: 'Actual exact calculation', columns: [...traceColumns], rows },
      ...(['table','ieee-table','arena'].includes(fixture.family)?[{id:'lookup-contributions',title:'Actual table gathers',
        columns:['Index','Activation','Stored symbol','Decoded weight','Gathered product','Before','After'],
        rows:expectedAccumulation(fixture,row,column).map(step=>[String(step.index),scalarText(fixture.domain,step.left),
          String(fixture.storedCodes[step.index*fixture.columns+column])+(fixture.domain==='ieee'?' -> '+String(fixture.storedCodes[step.index*fixture.columns+column]%BigInt(fixture.book.length)):''),
          ...['right','product','before','after'].map(key=>scalarText(fixture.domain,step[key]))])}]:[])] };
}
const mutate = (report, change) => { const result = structuredClone(report); change(result); return result; };
test('all24 fixtures are complete actual protocol requests with independent exact scalar answers', () => {
  const cases = completeResearchCases(); assert.equal(cases.length, 24); assert.deepEqual(cases.map(x => x.family), [...researchFamilies]);
  for (const fixture of cases) { assert(fixture.request.startsWith(`1\t${fixture.family}\t`)); assert(fixture.expectedResponse.startsWith('1\tok\t')); }
  assert.equal(researchCase('matmul').expectedResponse, '1\tok\t2\t2\t-31,34,58,-64');
  assert.equal(researchCase('complex').expectedResponse, '1\tok\t2\t2\t-329,346,419,-442\t63,-74,-27,38');
  assert.equal(researchCase('recenter').expectedResponse, '1\tok\t-4,-inf,0,-9\t7');
});
test('trace validator closes all nonnormalization families and every independently derived selected cell', () => {
  for (const fixture of completeResearchCases().filter(x => !x.normalize)) for (let r = 0; r < fixture.rows; r++) for (let c = 0; c < fixture.columns; c++) {
    assertTrace(traceFixture(fixture, r, c), fixture, r, c);
  }
});
test('trace validator rejects reordered terms despite identical final answer', () => {
  const fixture = researchCase('matmul'), report = traceFixture(fixture);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows.reverse()), fixture, 0, 0), /research-phases/);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows[0][1] = '1'), fixture, 0, 0), /research-order/);
});
test('trace validator rejects operand/product/prefix tampering independently', () => {
  const fixture = researchCase('complex'), report = traceFixture(fixture);
  for (const offset of [2, 3, 4, 5, 6]) assert.throws(() => assertTrace(mutate(report,
    r => r.tables[0].rows[1][offset] = '(0) + (0)i'), fixture, 0, 0), /research-scalar/);
});
test('epilogue, column bias and once-only terminal encoding have independent failure owners', () => {
  const fixture = researchCase('complex-bias-gemm'), report = traceFixture(fixture);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows.splice(fixture.inner, 1)), fixture, 0, 0), /research-phases/);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows.at(-2)[2] = '0'), fixture, 0, 0), /research-scalar/);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows.at(-1)[6] = '(0) + (0)i'), fixture, 0, 0), /research-terminal/);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows.push(r.tables[0].rows.at(-1))), fixture, 0, 0), /research-phases/);
});
test('tropical least original witness cannot become last traversed tie', () => {
  const fixture = researchCase('tropical'), report = traceFixture(fixture);
  assert.throws(() => assertTrace(mutate(report, r => r.tables[0].rows.find(x => x[0] === 'least attaining witness')[5] = '0'), fixture, 0, 0), /research-witness/);
});
test('signed encoding reference includes ties, saturation and two-sided wrapping', () => {
  assert.equal(signedEncoding(8, 'nearest', { coefficient: 5n, scale: 1 }), 2n);
  assert.equal(signedEncoding(8, 'nearest', { coefficient: 7n, scale: 1 }), 4n);
  assert.equal(signedEncoding(8, 'toward-zero', { coefficient: -7n, scale: 1 }), -3n);
  assert.equal(signedEncoding(8, 'saturating', 999n), 127n);
  assert.equal(signedEncoding(8, 'wrapping', 128n), -128n);
  assert.equal(tropicalEncoding(8, 'nearest', null), null);
});
test('codec path performs low-field packing then transformed child traversal', () => {
  const rows = codecPath('grid:8:-3,0,7;packed:4', 228n, 2);
  assert.deepEqual(rows, [['1', 'packed', '228', '2', '2', '0', '7'], ['0', 'grid', '2', '0', '2', '0', '7']]);
  const report = { status: 'ok', tables: [{ id: 'codec-path', title: 'Actual nested mapping',
    columns: ['Stage', 'Kind', 'Input code', 'Position', 'Selected child code', 'Child position', 'Decoded value'], rows }] };
  assertCodecInspection(report, 'grid:8:-3,0,7;packed:4', 228n, 2);
  assert.throws(() => assertCodecInspection(mutate(report, r => r.tables[0].rows[1][2] = '228'),
    'grid:8:-3,0,7;packed:4', 228n, 2), /research-codec/);
});
test('codec independent matrix closes all9 kinds, eight stages and all2048 E8 coordinates', () => {
  const cases = codecInspectionCases(); assert(cases.length >= 2048);
  assert.equal(cases.filter(x => x.plan === 'e8:8').length, 2056);
  for (const fixture of cases) { const rows = codecPath(fixture.plan, fixture.code, fixture.coordinate); assert(rows.length > 0 && rows.length <= 8); }
});
test('IEEE independent inspection covers both formats and every source value class', () => {
  const cases = ieeeCases(); assert.equal(cases.length, 30); assert.equal(new Set(cases.map(x => x.format)).size, 2);
  for (const { format, bits } of cases) { const decoded = ieeeOracle.decode(format, bits); assert(['finite', 'infinity', 'nan'].includes(decoded.kind)); }
});
test('IEEE subnormal atoms reconstruct exact dyadic and signed Euclidean Atlas address', () => {
  const report = {status:'ok',tables:[{id:'ieee-fields',title:'Exact binary64',columns:['Field','Value'],rows:[
    ['Format','binary64'],['Unsigned source bits','9'],['Classification','subnormal'],['Sign bit','0'],['Exponent field','0'],
    ['Fraction field','9'],['NaN payload field (includes quiet bit)','not a NaN'],['Exact decoded value','9 / 2^1074'],
    ['Terminal nearest bits','9'],['Terminal toward-zero bits','9'],['Terminal saturating bits','9'],['Terminal wrapping bits','9'],
  ]},{id:'atlas-atoms',title:'Finite exact atoms',columns:['Digit','Position','Grade','Revolution','Scope','Context','Modality'],rows:[
    ['+1','0','-1074','-34','1','6','2'],['+1','3','-1071','-34','2','1','2'],
  ]}]};
  assertIeeeInspection(report,'f64',9n);
  assert.throws(()=>assertIeeeInspection(mutate(report,r=>r.tables[0].rows[3][1]='1'),'f64',9n),/research-ieee/);
  assert.throws(()=>assertIeeeInspection(mutate(report,r=>r.tables[1].rows[0][3]='-33'),'f64',9n),/research-atoms/);
  assert.throws(()=>assertIeeeInspection(mutate(report,r=>r.tables[1].rows[1][1]='1'),'f64',9n),/research-atoms/);
  assert.throws(()=>assertIeeeInspection(mutate(report,r=>r.tables[1].rows.pop()),'f64',9n),/research-atoms/);
});
test('comparison validator requires independently executable alternate and accurate scalar work', async()=>{
  const fixture=researchCase('matmul');
  const report={status:'ok',request:fixture.request,response:fixture.expectedResponse,comparison:{status:'equivalent',message:'Two executed exact schedules agree.'},
    panels:['primary','alternate'].map(id=>({id,rows:2,columns:2,cells:fixture.output.map(String),request:id==='primary'?fixture.request:'alternate-request',response:fixture.expectedResponse})),
    tables:[{id:'comparison-work',title:'Mathematical operation counts',columns:['Unit','Count','Meaning'],rows:[
      ['direct scalar products','12','Scalar multiplication calls'],['table precomputation products','0','No table used'],
      ['output reduction steps','12','Identity included'],['table gathers','0','No table used'],
    ]}]};
  await assertComparison(report,fixture,()=>fixture.expectedResponse);
  await assert.rejects(()=>assertComparison(report,fixture,request=>request===fixture.request?fixture.expectedResponse:'1\tok\t2\t2\t0,0,0,0'),/research-reexecution/);
  await assert.rejects(()=>assertComparison(mutate(report,r=>r.panels[1].request=fixture.request),fixture,()=>fixture.expectedResponse),/research-route/);
  await assert.rejects(()=>assertComparison(mutate(report,r=>r.tables[0].rows[0][1]='0'),fixture,()=>fixture.expectedResponse),/research-work/);
});

test('valid outer unknown-run inspection stops before nonexistent child execution',()=>{
  assert.deepEqual(codecPath('grid:8:-1,1;runs:4:2,0,3,1;transcode:8:1,0,99;offset:7',2n,3),[
    ['3','offset','2','3','2','3','-7'],['2','transcode','2','3','99','3','0'],['1','runs','99','3','none','none','0'],
  ]);
});
