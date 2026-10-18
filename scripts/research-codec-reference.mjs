import assert from 'node:assert/strict';
import { codecOracle } from './codec-oracle.mjs';
import { researchCase } from './research-cases.mjs';
import { reportTable } from './research-assertions.mjs';

// Deliberately independent of ResearchInspect: follow each wrapper's actual
// input code and coordinate, rather than decoding every prefix at the root code.
export function codecPath(plan, stored, coordinate) {
  const stages = codecOracle.parsePlan(plan), rows = [];
  let code = BigInt(stored), position = coordinate;
  for (let index = stages.length - 1; index >= 0; index--) {
    const stage = stages[index], innerBlock = index ? codecOracle.maximumBlock(stages, index - 1) : 0;
    let childCode = code, childPosition = position;
    if (stage.kind === 'grid' || stage.kind === 'book') { childCode %= BigInt(stage.words.length); childPosition = stage.kind === 'grid' ? 0 : position % stage.block; }
    if (stage.kind === 'sign') { childCode = (code >> BigInt(position % stage.block)) & 1n; childPosition = position % stage.block; }
    if (stage.kind === 'ternary') { childCode = (code >> BigInt(2 * (position % stage.block))) & 3n; childPosition = position % stage.block; }
    if (stage.kind === 'e8') { childCode %= 256n; childPosition = position % 8; }
    if (stage.kind === 'packed') {
      const bits = 8 / stage.fields;
      childCode = (code >> BigInt(bits * Math.floor(position / innerBlock))) & ((1n << BigInt(bits)) - 1n);
      childPosition = position % innerBlock;
    }
    if (stage.kind === 'transcode') childCode = stage.mapping[Number(code % BigInt(stage.mapping.length))];
    if (stage.kind === 'runs') {
      const entry=stage.entries[Number(code)];
      if(!entry){rows.push([String(index),stage.kind,String(code),String(position),'none','none','0']);break;}
      childCode=entry.code;childPosition=position%innerBlock;
    }
    rows.push([String(index), stage.kind, String(code), String(position), String(childCode), String(childPosition),
      String(codecOracle.element(stages, code, position, index))]);
    code = childCode; position = childPosition;
  }
  return rows;
}
export function assertCodecInspection(report, plan, stored, coordinate) {
  assert.equal(report.status, 'ok', 'research-status: codec inspection did not succeed');
  assert.deepEqual(reportTable(report, 'codec-path'), codecPath(plan, stored, coordinate),
    'research-codec: stage path did not follow actual nested code/coordinate');
}
export function codecInspectionCases({ exhaustiveE8 = true } = {}) {
  const plans = [
    ['grid:8:-7,0,11', 255n], ['book:16:3:1,-2,7/3,4,-9', 65535n], ['sign:8:8', 165n], ['ternary:8:4', 228n],
    ['e8:8', 37n], ['grid:8:-3,0,7;packed:4', 228n], ['book:8:2:1,7/9,-3;offset:-5', 1n],
    ['ternary:8:4;transcode:16:228,57,165', 65535n], ['book:8:2:1,-2/3,4;runs:8:3,0,5,1', 1n],
    ['grid:8:0,1;packed:2;offset:7;transcode:16:0,1,2;runs:8:8,0;offset:3;transcode:8:0;packed:1', 0n],
    ['e8:8;packed:2;offset:-13;transcode:8:15,255,17;runs:8:8,1', 0n],
    ['grid:8:-1,1;runs:4:2,0,3,1;packed:2', 17n],
    ['grid:8:-1,1;runs:4:2,0,3,1;transcode:8:1,0,99',2n],
    ['grid:8:-1,1;runs:4:2,0,3,1;transcode:8:1,0,99;offset:7',2n],
  ];
  const cases = plans.flatMap(([plan, code]) => {
    const decoded = codecOracle.decode(codecOracle.parsePlan(plan), code);
    return decoded.map((_value, coordinate) => ({ plan, code, coordinate }));
  });
  cases.push({ plan: 'book:8:8:1,2,3,4,5,6,7,8' + ';packed:8'.repeat(7), code: 0n, coordinate: 16777215 });
  if (exhaustiveE8) for (let code = 0; code < 256; code++) for (let coordinate = 0; coordinate < 8; coordinate++) {
    cases.push({ plan: 'e8:8', code: BigInt(code), coordinate });
  }
  assert.equal(new Set(cases.flatMap(test => codecOracle.parsePlan(test.plan).map(stage => stage.kind))).size, 9);
  assert(cases.some(test => codecOracle.parsePlan(test.plan).length === 8));
  return cases;
}
export const invalidCodecInspections = Object.freeze([
  { controls: ['grid:8:' + '1,'.repeat(8192) + '1', '0', '0'], code: 'request-too-large' },
  { controls: ['grid:8:1,2;runs:8:0,0', '0', '0'], code: 'research-invalid-tool-input' },
  { controls: ['grid:8:1,2;runs:8:9,0', '0', '0'], code: 'research-invalid-tool-input' },
  { controls: ['grid:8:1,2;packed:3', '0', '0'], code: 'research-invalid-tool-input' },
  { controls: ['grid:8:1,2;transcode:8:256', '0', '0'], code: 'research-invalid-tool-input' },
  { controls: ['grid:8:1,2;runs:8:2,0', '99', '0'], code: 'research-invalid-inspection' },
  { controls: ['e8:8', '0', '8'], code: 'research-invalid-inspection' },
  { controls: ['e8:8', '256', '0'], code: 'research-invalid-inspection' },
  { controls: ['e8:8' + ';offset:1'.repeat(8), '0', '0'], code: 'research-invalid-tool-input' },
]);

export function codecMatrixCase(plan, storedCodes, activations, rows=1, route='table') {
  const stages=codecOracle.parsePlan(plan), decoded=storedCodes.map(row=>row.flatMap(code=>codecOracle.decode(stages,BigInt(code))));
  const inner=storedCodes.length, columns=decoded[0]?.length??0;
  assert(decoded.every(row=>row.length===columns)&&columns<=8);
  const fixture=researchCase('codec',{rows,inner,columns,left:activations});
  fixture.codecPlan=plan;fixture.storedCodes=storedCodes;fixture.right=decoded.flat();
  fixture.codecDecodedMass=[...new Set(storedCodes.flat().map(String))].reduce((sum,code)=>sum+codecOracle.decode(stages,BigInt(code)).length,0);
  fixture.storedMapping=storedCodes.map(row=>row.flatMap(code=>codecOracle.decode(stages,BigInt(code)).map((_value,coordinate)=>({code:BigInt(code),coordinate}))));
  fixture.reduced=Array.from({length:rows*columns},(_,i)=>{
    let total=0n;for(let k=0;k<inner;k++)total+=activations[Math.floor(i/columns)*inner+k]*fixture.right[k*columns+i%columns];return total;
  });
  fixture.linear=fixture.reduced;fixture.beforeEncoding=fixture.reduced;fixture.output=fixture.reduced;
  fixture.fields=[route,plan,String(rows),String(inner),String(columns),activations.map(String).join(','),storedCodes.map(row=>row.map(String).join(',')).join('/')];
  fixture.request=['1','codec',...fixture.fields].join('\t');fixture.expectedResponse=['1','ok',String(rows),String(columns),fixture.output.map(String).join(',')].join('\t');
  return fixture;
}
