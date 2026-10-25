import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { sample, zone } from '../tests/pulsefx-cloudkit/fixtures.mjs';

// MARK: - Browserproef met uitsluitend fictieve SDK-responses
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = 'https://pulsefx-test.invalid';
const output = resolve('dist');
const screenshots = join(tmpdir(), 'pulsefx-icloud-checks'); mkdirSync(screenshots, { recursive: true });
const csp = readFileSync('_headers', 'utf8').split('\n').find(line => line.trim().startsWith('Content-Security-Policy:')).trim().slice('Content-Security-Policy: '.length);
const config = { enabled: true, containerIdentifier: 'iCloud.PulseOS.FX', environment: 'production', origin, apiToken: 'fake-browser-test-token' };
const records = sample().records;
records[0].fields.CD_name.value = '<img src=x onerror="window.injected=true"> Synthetic A';
const fakeSDK = `
const records = ${JSON.stringify(records)};
let signedIn = false, signOutResolve, signInResolve;
const signInPromise = new Promise(r => signInResolve = r);
const signOutPromise = new Promise(r => signOutResolve = r);
window.testControl = { fail: false, authLost: false, delay: 0, empty: false, calls: 0 };
const user = () => signedIn && !testControl.authLost ? { userRecordName: 'synthetic-user' } : null;
const authUI = () => {
  const target = document.getElementById('apple-sign-in-button'); target.replaceChildren();
  if (!signedIn) { const b = document.createElement('button'); b.textContent = 'Test Apple sign in'; b.onclick = () => { signedIn = true; target.replaceChildren(); signInResolve(user()); }; target.append(b); }
};
const container = {
  setUpAuth: async () => { authUI(); return user(); },
  whenUserSignsIn: () => signInPromise, whenUserSignsOut: () => signOutPromise,
  signOut: () => { signedIn = false; signOutResolve(); },
  privateCloudDatabase: new Proxy({
    fetchAllRecordZones: async () => ({ hasErrors: false, zones: [{ zoneID: ${JSON.stringify(zone)} }] }),
    performQuery: async (query, options) => {
      testControl.calls++;
      await new Promise(r => setTimeout(r, testControl.delay));
      if (testControl.authLost) throw { ckErrorCode: 'AUTHENTICATION_REQUIRED' };
      if (testControl.fail && query.recordType === 'CD_OpenTrade') throw { ckErrorCode: 'SERVICE_UNAVAILABLE', reason: 'secret-user-value' };
      return { hasErrors: false, moreComing: false, records: testControl.empty ? [] : records.filter(r => r.recordType === query.recordType) };
    }
  }, { get(object,key) { if (!(key in object)) throw new Error('Write API used: '+String(key)); return object[key]; } })
};
window.CloudKit = { configure: settings => { if (settings.containers[0].apiTokenAuth.persist !== false) throw Error('Persistent tokens'); }, getDefaultContainer: () => container };
`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [], external = [];
let enabled = false, useVendor = false;
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === 'https://cdn.apple-cloudkit.com' && url.pathname === '/ck/2/cloudkit.js') {
    return route.fulfill({ contentType: 'text/javascript', body: useVendor ? readFileSync(process.env.PULSEFX_VENDOR_SDK_PATH, 'utf8') : fakeSDK });
  }
  if (useVendor && url.origin === 'https://api.apple-cloudkit.com' && url.pathname.endsWith('/public/users/caller')) {
    return route.fulfill({ status: 401, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ serverErrorCode: 'AUTHENTICATION_REQUIRED', reason: 'Offline authentication fixture', redirectURL: 'https://idmsa.apple.com/offline-test' }) });
  }
  if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
  if (url.pathname === '/api/pulsefx-config') return route.fulfill({ json: enabled ? config : { enabled: false }, headers: { 'Cache-Control': 'no-store' } });
  let path = resolve(output, '.' + decodeURIComponent(url.pathname));
  if (!path.startsWith(output + '/')) return route.abort();
  if (url.pathname.endsWith('/')) path = join(path, 'index.html');
  try {
    const contentType = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : /\.m?js$/.test(path) ? 'text/javascript' : 'application/octet-stream';
    return route.fulfill({ body: readFileSync(path), contentType, headers: { 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' } });
  } catch { return route.fulfill({ status: 404, body: 'Not found' }); }
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const visit = () => page.goto(origin + '/pulsefx/icloud/');
const connect = async () => {
  enabled = true; await visit();
  await page.getByRole('button', { name: 'Start iCloud test' }).click();
  await page.getByRole('button', { name: 'Test Apple sign in' }).click();
  await page.getByLabel('Private zone', { exact: true }).selectOption('0');
};
const read = async () => {
  await page.getByRole('button', { name: 'Read selected zone', exact: true }).click();
  await page.locator('#results').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('read').disabled);
};
try {
  await visit(); await page.getByText(/Not configured\. The site owner/).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Start iCloud test' }).isDisabled());
  assert.equal(await page.locator('script[src*="cloudkit.com"]').count(), 0);
  await page.screenshot({ path: join(screenshots, 'disabled-desktop.png'), fullPage: true });
  await connect(); await read();
  assert.equal(await page.locator('#trades tr').count(), 5);
  assert.equal(await page.locator('#accounts img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.ok(await page.locator('#trades td').evaluateAll(cells => cells.every(cell => cell.scrollWidth <= cell.clientWidth + 1)), 'Long user text must not overlap adjacent table cells');
  assert.match(await page.locator('#balances').textContent(), /€1,200.00/);
  assert.match(await page.locator('#balances').textContent(), /\$2,300.00/);
  assert.match(await page.locator('#trades').textContent(), /breakEven/);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.screenshot({ path: join(screenshots, 'connected-desktop.png'), fullPage: true });
  await page.locator('#accounts button').first().click(); assert.equal(await page.locator('#trades tr').count(), 3);
  await page.getByLabel('Record type', { exact: true }).selectOption('CD_OpenTrade');
  await page.getByText('No trades match these filters.').waitFor();
  await page.getByLabel('Account', { exact: true }).selectOption('all'); assert.equal(await page.locator('#trades tr').count(), 1);
  await page.getByLabel('Trade status', { exact: true }).selectOption('open'); await page.getByText('No trades match these filters.').waitFor();
  await page.getByLabel('Record type', { exact: true }).selectOption('all'); await page.getByLabel('Trade status', { exact: true }).selectOption('all');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    assert.ok(await page.getByText('Read-only test', { exact: true }).isVisible());
    if (width === 390) await page.screenshot({ path: join(screenshots, 'connected-mobile.png'), fullPage: true });
  }
  await page.evaluate(() => { testControl.fail = true; });
  await page.getByRole('button', { name: 'Refresh selected zone' }).click();
  await page.getByText(/Stale results\. The latest refresh/).waitFor();
  assert.equal(await page.locator('#trades tr').count(), 5);
  assert.equal((await page.locator('body').textContent()).includes('secret-user-value'), false);
  await page.evaluate(() => { testControl.fail = false; testControl.empty = true; });
  await page.getByRole('button', { name: 'Refresh selected zone' }).click();
  await page.getByText('No known balances returned. This does not prove that your native data is empty.').waitFor();
  await page.getByRole('button', { name: 'Disconnect and clear data' }).click();
  assert.ok(await page.locator('#results').isHidden()); assert.equal(await page.locator('#accounts').textContent(), '');

  await connect(); await page.evaluate(() => { testControl.fail = true; }); await read();
  assert.match(await page.locator('#quality').textContent(), /Partial results/);
  assert.match(await page.locator('#balances').textContent(), /Totals are unavailable/);
  await page.evaluate(() => { testControl.authLost = true; });
  await page.getByRole('button', { name: 'Refresh selected zone' }).click();
  await page.getByText(/The Apple account changed or signed out/).waitFor();
  assert.equal(await page.locator('#trades').textContent(), '');

  await connect(); await page.evaluate(() => { testControl.delay = 150; });
  await page.getByRole('button', { name: 'Read selected zone', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect and clear data' }).click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#results').isHidden()); assert.equal(await page.locator('#accounts').textContent(), '');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  if (process.env.PULSEFX_VENDOR_SDK_PATH) {
    useVendor = true; await page.setViewportSize({ width: 1000, height: 900 }); await visit();
    await page.getByRole('button', { name: 'Start iCloud test' }).click();
    await page.getByText('Continue in Apple’s sign-in window using the button above. No data has been read.').waitFor();
    await page.locator('#apple-sign-in-button .apple-auth-button').waitFor({ state: 'visible' });
    await page.screenshot({ path: join(screenshots, 'vendor-sdk-offline-signin.png'), fullPage: true });
    assert.deepEqual(errors, []);
  }
  console.log(`PASS: disabled deployment, opt-in auth, filtering, currencies, XSS, partial/stale/empty data, session expiry, late responses and responsive layouts. Screenshots: ${screenshots}`);
} catch (error) {
  await page.screenshot({ path: join(screenshots, 'failure.png'), fullPage: true });
  console.error('Fixture page status:', await page.locator('#status').textContent());
  console.error('Fixture page errors:', errors);
  console.error('Fixture zone panel:', await page.locator('#zone-panel').innerText());
  throw error;
} finally { await browser.close(); }
