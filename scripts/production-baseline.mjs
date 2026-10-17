// Diagnostic R3 execution against the previously accepted public application.
// This deliberately returns failure until the registered production journeys exist.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { capabilityIds, root, sdk, sha, writeJson } from './evidence.mjs';

sdk();
const require = createRequire('/opt/prismpm/oracles/package.json');
assert.equal(require('playwright/package.json').version, '1.62.1');
const { chromium } = require('playwright');
const url = 'https://afflom.github.io/lexlean-matmul/';
const baselineAssets = {
  'app.css': '93a8e4a6a873f55f56a7adb3a55a49912bdcddd740b1af52f9a27f1403ea0279',
  'app.js': '8aaf0c66deee92a16ba57bd40108691178c04ade4531b91cdce5c8c12a16e0e1',
  'index.html': '335039253de90c927321b383d54d2d6d5f740a98347c25d29c8f3b73bdb0c9ad',
  'lexlean_matmul.js': '6f94a6a0ef755f67ad4b0ecbf81927617f7e68225503698f63ff266815befe16',
  'lexlean_matmul_bg.wasm': '7f353c81da5837ea06f345581222abd9890ffe2b2f84db847909c3123e88b6cc',
  'provenance.json': 'ac8b50eb728f5c75c65f462f9354493b283ddb85f1c3a839206292bbf387f7c4',
};
try {
  for (const [name, expected] of Object.entries(baselineAssets)) {
    const response = await fetch(new URL(name, url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())), expected);
  }
} catch {
  throw new Error('BASELINE_REVISION_CHANGED: live assets differ from accepted 2d4; historical R3 evidence cannot be regenerated against another revision');
}
const browser = await chromium.launch({ headless: true, executablePath: process.arch === 'x64'
  ? '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux64/chrome-headless-shell'
  : '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux-arm64/chrome-headless-shell' });
const cases = [];
async function test(id, name, check) {
  assert(capabilityIds().includes(id), `Baseline requires registered ${id}`);
  try { await check(); cases.push({ id, name, status: 'passed' }); }
  catch (error) { cases.push({ id, name, status: 'failed', diagnostic: error.message }); }
}
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${process.argv[2]}.desktop.png`, fullPage: true });
  const html = await page.content();
  await test('MM-18', 'a visitor can find protocol instructions from the application', async () => {
    assert((await page.locator('a[href*="PROTOCOL"]').count()) > 0, 'MM-18: the accepted application has no protocol/help link');
  });
  await test('MM-19', 'a visitor can select an editable guided operation and example', async () => {
    assert.equal(await page.locator('select#operation').count(), 1, 'MM-19: the accepted application has no guided operation control');
  });
  await test('MM-20', 'a computed result exposes readable matrix cells alongside exact wire bytes', async () => {
    await page.locator('#request').fill('1\tmatmul\t2\t2\t2\t1,2,3,4\t5,6,7,8');
    await page.locator('#submit').click();
    await page.waitForFunction(() => document.querySelector('#result').textContent === '1\tok\t2\t2\t19,22,43,50');
    assert.equal(await page.locator('table#result-table').count(), 1, 'MM-20: correct exact wire output has no readable matrix table');
  });
  await test('MM-21', 'an actual Wasm loading failure offers draft-preserving retry', async () => {
    const failed = await browser.newPage();
    try {
      await failed.route('**/*.wasm', route => route.abort('failed'));
      await failed.goto(url, { waitUntil: 'networkidle' });
      await failed.locator('#request').fill('1\tmatmul\t1\t1\t1\t6\t7');
      await failed.locator('#submit').click();
      await failed.waitForFunction(() => !document.querySelector('form').hasAttribute('aria-busy'));
      assert.equal(await failed.locator('#retry').count(), 1, 'MM-21: actual failed Wasm load has no retry control; reloading loses the draft');
    } finally { await failed.close(); }
  });
  await test('MM-22', 'a keyboard user can reach the guided calculation journey', async () => {
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#guided-form button[type="submit"]').count(), 1,
      'MM-22: keyboard-only guided calculation has no named form or submit control');
  });
  await test('MM-23', 'the application explains browser-local calculation and history behavior', async () => {
    assert.match(await page.locator('main').innerText(), /calculations run in (?:this|your) browser/i,
      'MM-23: browser-local execution and history policy are not disclosed in the application');
  });
  await test('MM-24', 'accepted and final publication evidence is retained for thirty days', async () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
    const days = [...workflow.matchAll(/retention-days: ([0-9]+)/g)].map(match => Number(match[1]));
    assert(days.length >= 3 && days.every(value => value === 30),
      'MM-24: native evidence has one-day retention and final publication receipts are not uploaded');
  });
  writeJson(process.argv[2], { schema: 'lexlean-matmul/production-r3-baseline/1', url,
    accepted_commit: '2d4dc45f1dde9fde7978653aad3ce72b071d542f', browser: browser.version(),
    html_sha256: sha(html), cases, passed: cases.filter(row => row.status === 'passed').length,
    failed: cases.filter(row => row.status === 'failed').length, skipped: 0 });
  for (const row of cases) console.log(`${row.id} ${row.status}: ${row.diagnostic ?? row.name}`);
  process.exitCode = cases.some(row => row.status === 'failed') ? 1 : 0;
} finally { await browser.close(); }
