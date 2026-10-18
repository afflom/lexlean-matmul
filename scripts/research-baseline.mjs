// Historical R3 diagnostic. It exercises the accepted application, then refuses
// to attribute any later deployment to this baseline revision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { capabilityIds, sdk, sha, writeJson } from './evidence.mjs';

const accepted = '7c74c4f8d178388c740bd967cc89ea191cf24ad0';
const expectedSdk = 'ghcr.io/afflom/lexlean-matmul-sdk@sha256:929cad7c4e917e48fc7648c93d42380dff46ba2a99f2c07e97e6421f38ddb50c';
const url = 'https://afflom.github.io/lexlean-matmul/';
const modelId = 'c402a2d4983759af3ecc81b2f473624392f655d41cf53d9061e30aa9c41a8272';
const baselineAssets = {
  'app.css': 'd15030c6d348f2bc8906816414ec8d30feb72c89e3825c169f52fa97a1e5a548',
  'app.js': 'a84f4aeb4c481d83d62cabe63e0fd45fd17bb164e8e1bc49aec5ff76718227c1',
  'index.html': '8755fcb164d3730a16137b6269a8e6236e96db67a257ef5625ec9b03135255a7',
  'lexlean_matmul.js': '6f94a6a0ef755f67ad4b0ecbf81927617f7e68225503698f63ff266815befe16',
  'lexlean_matmul_bg.wasm': 'e253c9092833f99e0153455be2caa49df530dd2500afe9955de29ab7124e559d',
  'provenance.json': '70acc8e4b38d3d1f666dd1b821edc6bfe9a51e2a26805168cd90f06fb0739964',
};
const families = ['matmul', 'gemm', 'coded', 'table', 'partitioned', 'complex', 'dyadic', 'tropical', 'recenter',
  'ieee', 'ieee-gemm', 'ieee-table', 'encode', 'encode-dyadic', 'bias', 'bias-gemm', 'complex-gemm',
  'complex-bias', 'complex-bias-gemm', 'tropical-gemm', 'complex-encode', 'tropical-encode', 'codec', 'arena'];
const output = process.argv[2] ?? '.prism/matmul/research-r3-baseline.json';
const selected = process.argv[3] ?? 'all';
const ids = Array.from({ length: 7 }, (_, index) => `MM-${25 + index}`);
assert(selected === 'all' || ids.includes(selected), 'Select a registered research capability');
const execute = selected === 'all' ? ids : [selected];
for (const id of execute) assert(capabilityIds().includes(id), `Baseline requires registered ${id}`);
assert.equal(sdk().sdk_image, expectedSdk, 'BASELINE_SDK_CHANGED: this diagnostic requires the accepted immutable SDK');
const require = createRequire('/opt/prismpm/oracles/package.json');
assert.equal(require('playwright/package.json').version, '1.62.1');
const { chromium } = require('playwright');
const evidence = [];
let provenance;
try {
  for (const [name, expected] of Object.entries(baselineAssets)) {
    const response = await fetch(new URL(name, url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(sha(bytes), expected);
    evidence.push({ path: name, bytes: bytes.length, sha256: sha(bytes), status: response.status });
    if (name === 'provenance.json') provenance = JSON.parse(bytes);
  }
  assert.equal(provenance.model_id, modelId);
} catch (error) {
  throw new Error('BASELINE_REVISION_CHANGED: live bytes/model differ from accepted 7c74; historical research R3 evidence cannot describe another revision', { cause: error });
}
const browserHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lexlean-matmul-research-baseline-'));
const environment = { ...process.env, HOME: browserHome,
  XDG_CACHE_HOME: path.join(browserHome, '.cache'), XDG_CONFIG_HOME: path.join(browserHome, '.config'),
  XDG_DATA_HOME: path.join(browserHome, '.local', 'share') };
for (const name of ['XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']) fs.mkdirSync(environment[name], { recursive: true, mode: 0o700 });
let browser;
const cases = [], requests = [], pageErrors = [], replies = [];
const started = new Date().toISOString();
async function actualRaw(page, input, expected) {
  await page.locator('#raw-editor').evaluate(node => { node.open = true; });
  await page.locator('#request').fill(input); await page.locator('#submit').click();
  await page.waitForFunction(value => document.querySelector('#result')?.textContent === value, expected);
  assert.equal(await page.locator('#result-request').textContent(), input);
  replies.push({ request_sha256: sha(input), response_sha256: sha(expected), response: expected });
}
try {
  browser = await chromium.launch({ headless: true, executablePath: process.arch === 'x64'
    ? '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux64/chrome-headless-shell'
    : '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux-arm64/chrome-headless-shell', env: environment });
  assert.equal(browser.version(), '157.0.8099.0');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#guided-submit')?.disabled);
  await actualRaw(page, '1\tmatmul\t2\t2\t2\t1,2,3,4\t5,6,7,8', '1\tok\t2\t2\t19,22,43,50');
  const checks = {
    'MM-25': async () => {
      assert.equal(await page.getByRole('button', { name: 'Trace selected cell', exact: true }).count(), 1,
        'MM-25: the actual accepted result has no selected-cell trace action');
    },
    'MM-26': async () => {
      assert.equal(await page.getByRole('button', { name: 'Compare exact routes', exact: true }).count(), 1,
        'MM-26: the actual accepted result has no executable same-input route comparison');
    },
    'MM-27': async () => {
      assert.equal(await page.getByRole('button', { name: 'Export case', exact: true }).count(), 1,
        'MM-27: the actual accepted application has no versioned local case export/import journey');
    },
    'MM-28': async () => {
      await actualRaw(page, '1\tcodec\tdirect\tternary:8:1;packed:4\t1\t1\t4\t3\t228', '1\tok\t1\t4\t-3,0,3,0');
      assert.equal(await page.getByRole('button', { name: 'Inspect decoded symbols', exact: true }).count(), 1,
        'MM-28: a real composed-codec result has no stored-symbol stage-mapping inspector');
    },
    'MM-29': async () => {
      await actualRaw(page, '1\tieee\tf64\tnearest\t1\t1\t1\t4607182418800017408\t4611686018427387904', '1\tok\t1\t1\t4611686018427387904');
      assert.equal(await page.getByRole('button', { name: 'Inspect IEEE representation', exact: true }).count(), 1,
        'MM-29: a real IEEE result has no exact bit-class/dyadic/NAF/terminal-rounding inspector');
    },
    'MM-30': async () => {
      const operations = await page.locator('#operation option').evaluateAll(nodes => nodes.map(node => node.value));
      const actual = operations.map(value => value === 'float' ? 'ieee' : value);
      assert.deepEqual([...new Set(actual)].sort(), [...families].sort(),
        'MM-30: the accepted guided selector exposes 10 families rather than all 24 research journeys');
    },
    'MM-31': async () => {
      await actualRaw(page, '1\tmatmul\t2\t2\t2\t1,2,3,4\t5,6,7,8', '1\tok\t2\t2\t19,22,43,50');
      assert.equal(await page.getByRole('region', { name: 'Research result', exact: true }).count(), 1,
        'MM-31: no request-correlated research result surface exists for cancellation, recovery, inspection, and local case ownership');
    },
  };
  for (const id of execute) {
    try { await checks[id](); cases.push({ id, status: 'passed' }); }
    catch (error) { cases.push({ id, status: 'failed', diagnostic: error.message, error_name: error.name }); }
  }
  assert.deepEqual(pageErrors, [], 'The accepted baseline must execute normally before a missing-feature failure is evidence');
  const html = await page.content();
  const screenshot = output.replace(/\.json$/, '') + '.desktop.png';
  fs.mkdirSync(path.dirname(screenshot), { recursive: true }); await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotBytes = fs.readFileSync(screenshot);
  writeJson(output, { schema: 'lexlean-matmul/research-r3-baseline/1', qualification: false, accepted_main: accepted,
    scope: 'Actual missing research user outcomes in the accepted application; no claim that its existing arithmetic, privacy, or lifecycle is defective. Not a later release qualification.',
    url, model_id: modelId, sdk_image: expectedSdk, node: process.version, playwright: '1.62.1', browser: browser.version(),
    assets: evidence, html_sha256: sha(html), actual_replies: replies, requests, page_errors: pageErrors,
    screenshot: { path: screenshot, bytes: screenshotBytes.length, sha256: sha(screenshotBytes) }, cases,
    passed: cases.filter(row => row.status === 'passed').length, failed: cases.filter(row => row.status === 'failed').length,
    skipped: 0, filtered: 0, started_at: started, finished_at: new Date().toISOString() });
  for (const row of cases) console.log(`${row.id} ${row.status}: ${row.diagnostic ?? 'research journey available'}`);
  process.exitCode = cases.some(row => row.status === 'failed') ? 1 : 0;
} finally {
  try { await browser?.close(); } finally { fs.rmSync(browserHome, { recursive: true, force: true }); }
}
