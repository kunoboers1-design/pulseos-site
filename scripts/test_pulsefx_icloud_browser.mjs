import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { calculateStatistics } from '../pulsefx/app/statistics.mjs';
import { validateSnapshot } from '../services/pulsefx-premium/application.mjs';
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
let signedIn = false, persist = false, signOutResolve, signInResolve;
const signInPromise = new Promise(r => signInResolve = r);
const signOutPromise = new Promise(r => signOutResolve = r);
window.testControl = { fail: false, authLost: false, delay: 0, empty: false, calls: 0 };
const user = () => signedIn && !testControl.authLost ? { userRecordName: 'synthetic-user' } : null;
const authUI = () => {
  const target = document.getElementById('apple-sign-in-button'); target.replaceChildren();
  if (!signedIn) { const b = document.createElement('button'); b.textContent = 'Test Apple sign in'; b.onclick = () => { signedIn = true; if (persist) document.cookie = 'fixtureAppleSession=yes; path=/; Secure; SameSite=Strict'; target.replaceChildren(); signInResolve(user()); }; target.append(b); }
};
const container = {
  setUpAuth: async () => { authUI(); return user(); },
  whenUserSignsIn: () => signInPromise, whenUserSignsOut: () => signOutPromise,
  signOut: () => { signedIn = false; document.cookie = 'fixtureAppleSession=; Max-Age=0; path=/'; signOutResolve(); },
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
window.CloudKit = { configure: settings => { persist = settings.containers[0].apiTokenAuth.persist; testControl.persist = persist; signedIn = persist && document.cookie.includes('fixtureAppleSession=yes'); }, getDefaultContainer: () => container };
`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [], external = [];
let vendorModify = 0, nativeLoginZone = false, configDelay = 0;
let enabled = false, useVendor = false, premiumState = 'disabled', premiumDelay = 0, premiumRequests = 0;
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === 'https://cdn.apple-cloudkit.com' && url.pathname === '/ck/2/cloudkit.js') {
    return route.fulfill({ contentType: 'text/javascript', body: useVendor ? readFileSync(process.env.PULSEFX_VENDOR_SDK_PATH, 'utf8') : (nativeLoginZone ? fakeSDK.replaceAll(JSON.stringify(zone), JSON.stringify({ ...zone, zoneName: 'com.apple.coredata.cloudkit.zone' })) : fakeSDK) });
  }
  if (useVendor && url.origin === 'https://api.apple-cloudkit.com' && url.pathname.endsWith('/public/users/caller')) {
    return route.fulfill({ status: 401, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ serverErrorCode: 'AUTHENTICATION_REQUIRED', reason: 'Offline authentication fixture', redirectURL: 'https://idmsa.apple.com/offline-test' }) });
  }
  if (useVendor && url.origin === 'https://api.apple-cloudkit.com' && url.pathname.endsWith('/private/records/modify')) {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
    vendorModify++;
    const body = route.request().postDataJSON();
    assert.equal(body.atomic, true); assert.deepEqual(body.zoneID, body.operations[0].record.recordType === 'CD_TradeNote' ? { ...zone, zoneName: 'com.apple.coredata.cloudkit.zone' } : zone); assert.ok([1, 2].includes(body.operations.length));
    if (body.operations.length === 1 && body.operations[0].record.recordType === 'CD_OpenTrade') {
      assert.equal(body.operations[0].record.fields.CD_entryPrice.value, null);
      assert.equal(body.operations[0].record.fields.CD_slMoved.value, 0);
      assert.equal(body.operations[0].record.fields.CD_preTradeNotes.value, 'SDK edit fixture');
    }
    assert.ok(body.operations.every(o => ['update', 'create'].includes(o.operationType)));
    if (body.operations[0].record.recordType === 'CD_TradeNote') assert.equal(body.operations[0].record.fields.CD_title.value, 'SDK note');
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' }, json: { records: body.operations.map(o => ({ ...o.record, recordChangeTag: 'saved-tag' })) } });
  }
  if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
  if (url.pathname.startsWith('/api/pulsefx-premium/')) {
    if (premiumState === 'disabled') return route.fulfill({ status: 503, json: { error: 'NOT_CONFIGURED' } });
    const path = url.pathname.split('/').pop();
    if (path === 'pair') { premiumState = 'pending'; return route.fulfill({ json: { code: 'abcd-1234-ffff-2222-3333-4444-5555-6666', expiresAt: Date.now() + 300000 } }); }
    if (route.request().method() === 'DELETE') { premiumState = 'locked'; return route.fulfill({ json: { state: 'disconnected' } }); }
    if (path === 'session') return route.fulfill({ json: { state: premiumState, expiresAt: Date.now() + 3600000 } });
    premiumRequests++;
    if (premiumState !== 'verified') return route.fulfill({ status: 403, json: { error: 'PREMIUM_REQUIRED' } });
    const body = route.request().postDataJSON();
    assert.ok(!route.request().postData().includes('synthetic-user'));
    assert.ok(!route.request().postData().includes('SyntheticOwner'));
    const statistics = calculateStatistics(validateSnapshot(body.snapshot), body.filters);
    delete statistics.records;
    await new Promise(resolve => setTimeout(resolve, premiumDelay));
    return route.fulfill({ json: { state: 'verified', expiresAt: Date.now() + 3600000, statistics } });
  }
  if (url.pathname === '/api/pulsefx-config') { await new Promise(resolve => setTimeout(resolve, configDelay)); return route.fulfill({ json: enabled ? config : { enabled: false }, headers: { 'Cache-Control': 'no-store' } }); }
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
// MARK: - Aanmelden vanaf de welkomstkaart zonder navigatie of verplichte opslag
await page.goto(origin + '/pulsefx/login/');
await page.getByRole('button', { name: 'Connect with iCloud' }).click();
await page.locator('#configuration').filter({ hasText: 'Not configured' }).waitFor();
assert.equal(await page.locator('#start').isDisabled(), true);
enabled = true;
await page.goto(origin + '/pulsefx/login/');
await page.getByRole('button', { name: 'Connect with iCloud' }).click();
await page.getByLabel('Remember iCloud on this browser', { exact: true }).uncheck();
await page.setViewportSize({ width: 375, height: 850 });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
await page.screenshot({ path: join(screenshots, 'login-inline-mobile.png'), fullPage: true });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.getByRole('button', { name: 'Continue with Apple' }).click();
await page.getByRole('button', { name: 'Test Apple sign in' }).waitFor();
assert.equal(await page.locator('.login-card #apple-sign-in-button').isVisible(), true);
assert.equal(await page.locator('.cloud-layout').isVisible(), false);
await page.getByRole('button', { name: 'Test Apple sign in' }).click();
await page.getByLabel('Private zone', { exact: true }).selectOption('0');
await page.getByRole('button', { name: 'Load workspace', exact: true }).click();
await page.waitForURL(url => url.pathname === '/pulsefx/icloud/');
assert.equal(await page.evaluate(() => testControl.persist), false);
assert.equal(await page.locator('#tab-open').getAttribute('aria-selected'), 'true');
assert.equal(await page.locator('.login-page').count(), 0);
await page.getByRole('tab', { name: 'Settings', exact: true }).click();
await page.locator('#disconnect').click();
assert.match(await page.locator('#status').innerText(), /Disconnected/);
nativeLoginZone = true;
await page.goto(origin + '/pulsefx/login/');
await page.getByRole('button', { name: 'Connect with iCloud' }).click();
await page.getByLabel('Remember iCloud on this browser', { exact: true }).check();
await page.getByRole('button', { name: 'Continue with Apple' }).click();
await page.getByRole('button', { name: 'Test Apple sign in' }).click();
await page.waitForURL(url => url.pathname === '/pulsefx/icloud/');
assert.equal(await page.locator('#tab-open').getAttribute('aria-selected'), 'true');
configDelay = 500;
await page.reload();
await page.locator('#icloud-restore').waitFor({ state: 'visible' });
assert.equal(await page.locator('.cloud-layout').isVisible(), false);
await page.screenshot({ path: join(screenshots, 'restoring-workspace.png') });
await page.locator('#icloud-restore').waitFor({ state: 'hidden' });
configDelay = 0;
await page.waitForFunction(() => document.getElementById('workspace-toolbar').hidden === false);
assert.equal(await page.locator('#tab-open').getAttribute('aria-selected'), 'true');
await page.getByRole('tab', { name: 'Notes', exact: true }).click();
await page.reload();
await page.waitForFunction(() => document.getElementById('workspace-toolbar').hidden === false);
assert.equal(await page.locator('#tab-notes').getAttribute('aria-selected'), 'true');
await page.getByRole('tab', { name: 'Settings', exact: true }).click();
await page.locator('#disconnect').click();
nativeLoginZone = false;
// MARK: - Verlopen sessie verbergt de herstelstatus en toont de echte Apple-aanmelding
await page.goto(origin + '/pulsefx/icloud/?view=connection');
await page.getByRole('button', { name: 'Connect iCloud', exact: true }).waitFor();
await page.evaluate(() => localStorage.setItem('pulsefx-remember-icloud', 'true'));
await page.reload();
await page.getByRole('button', { name: 'Test Apple sign in', exact: true }).waitFor();
await page.locator('#icloud-restore').waitFor({ state: 'hidden' });
assert.equal(await page.locator('#tab-connection').getAttribute('aria-selected'), 'true');
await page.goto(origin + '/pulsefx/icloud/?view=connection&restore=manual');
await page.getByRole('button', { name: 'Connect iCloud', exact: true }).waitFor();
assert.equal(await page.locator('script[src*="cloudkit.com"]').count(), 0);
await page.evaluate(() => localStorage.setItem('pulsefx-remember-icloud', 'false'));
enabled = false;
const visit = () => page.goto(origin + '/pulsefx/icloud/');
const connect = async () => {
  enabled = true; await visit();
  await page.getByLabel('Remember iCloud on this browser', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Connect iCloud' }).click();
  await page.getByRole('button', { name: 'Test Apple sign in' }).click();
  await page.getByLabel('Private zone', { exact: true }).selectOption('0');
};
const read = async () => {
  await page.getByRole('button', { name: 'Load workspace', exact: true }).click();
  await page.locator('#workspace-toolbar').waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('read').disabled);
};
try {
  await page.goto(origin + '/pulsefx/icloud/?statistics=demo#premium-statistics');
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  await page.locator('#premium-statistics .stats-metrics').getByText('48 closed trades', { exact: true }).waitFor();
  assert.equal(premiumRequests, 0);
  await visit(); await page.getByText(/Not configured\. The site owner/).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Connect iCloud' }).isDisabled());
  assert.equal(await page.locator('script[src*="cloudkit.com"]').count(), 0);
  await page.screenshot({ path: join(screenshots, 'disabled-desktop.png'), fullPage: true });
  await connect(); await read();
  // MARK: - Automatisch lezen bewaart filters en respecteert het sluitformulier
  await page.locator('#archive').selectOption('active');
  const beforeAuto = await page.evaluate(() => testControl.calls);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(before => testControl.calls > before && !document.getElementById('read').disabled, beforeAuto);
  assert.equal(await page.locator('#archive').inputValue(), 'active');
  const beforePause = await page.evaluate(() => testControl.calls);
  await page.evaluate(() => { document.getElementById('close-dialog').showModal(); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.evaluate(() => testControl.calls), beforePause);
  await page.evaluate(() => document.getElementById('close-dialog').close());
  await page.locator('#archive').selectOption('all');
  assert.equal(await page.locator('#trades tr').count(), 5);
  assert.equal(await page.locator('#accounts img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  await page.getByRole('button', { name: 'Trades', exact: true }).click();
  assert.ok(await page.locator('#trades td').evaluateAll(cells => cells.every(cell => cell.scrollWidth <= cell.clientWidth + 1)), 'Long user text must not overlap adjacent table cells');
  assert.match(await page.locator('#balances').textContent(), /€1,200.00/);
  assert.match(await page.locator('#balances').textContent(), /\$2,300.00/);
  assert.match(await page.locator('#trades').textContent(), /breakEven/);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'pulsefx-remember-icloud').length + sessionStorage.length), 0);
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await page.screenshot({ path: join(screenshots, 'connected-desktop.png'), fullPage: true });
  await page.locator('#accounts button').first().click(); assert.equal(await page.locator('#trades tr').count(), 3);
  await page.getByLabel('Record type', { exact: true }).selectOption('CD_OpenTrade');
  await page.getByText('No trades match these filters.').waitFor();
  await page.locator('#account-filter').selectOption('all'); assert.equal(await page.locator('#trades tr').count(), 1);
  await page.getByLabel('Trade status', { exact: true }).selectOption('open'); await page.getByText('No trades match these filters.').waitFor();
  await page.getByLabel('Record type', { exact: true }).selectOption('all'); await page.getByLabel('Trade status', { exact: true }).selectOption('all');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    assert.ok(await page.getByText('Read-only iCloud', { exact: true }).isVisible());
    if (width === 390) await page.screenshot({ path: join(screenshots, 'connected-mobile.png'), fullPage: true });
  }
  // MARK: - Vriendenstatistieken gebruiken lokaal dezelfde snapshot
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  const premium = page.locator('#premium-statistics');
  await premium.locator('.stats-metrics').getByText('5 closed trades', { exact: true }).waitFor();
  assert.equal(premiumRequests, 0);
  assert.ok(await premium.getByRole('button', { name: 'Connect Premium', exact: true }).isHidden());
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeToggle').click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Statistics overflow at ${width}/${theme}: ${await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>e.tagName+"."+e.className).join(","))}`);
    }
  }
  await premium.getByText('Data source & calculation details', { exact: true }).click();
  await premium.getByRole('button', { name: 'Custom', exact: true }).click();
  await premium.getByLabel('From', { exact: true }).fill('2026-10-20'); await premium.getByLabel('Through', { exact: true }).fill('2026-10-10');
  await premium.getByRole('button', { name: 'Calculate statistics', exact: true }).click();
  await premium.getByText(/closed trades · .*opening dates/).waitFor();
  await premium.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await page.evaluate(() => { testControl.fail = true; });
  await page.getByRole('button', { name: 'Refresh selected zone' }).click();
  await page.getByText(/Stale results\. The latest refresh/).waitFor();
  assert.equal(await page.locator('#trades tr').count(), 5);
  assert.equal((await page.locator('body').textContent()).includes('secret-user-value'), false);
  await page.evaluate(() => { testControl.fail = false; testControl.empty = true; });
  await page.getByRole('button', { name: 'Refresh selected zone' }).click();
  await page.getByText('No known balances returned. This does not prove that your native data is empty.').waitFor();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
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
  await page.getByRole('button', { name: 'Load workspace', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect and clear data' }).click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#results').isHidden()); assert.equal(await page.locator('#accounts').textContent(), '');
  // MARK: - Eén demo voor tabs, open posities, sluiten, notes en saldo
  await page.goto(origin + '/pulsefx/icloud/?workspace=demo');
  await page.getByRole('tab', { name: /Open trades/ }).click();
  assert.equal(await page.locator('.open-trade').count(), 2);
  await page.getByRole('tab', { name: /Open trades/ }).click();
  await page.getByRole('button', { name: 'View trade', exact: true }).first().click();
  const detail = page.locator('#trade-detail-dialog');
  await detail.getByRole('heading', { name: 'Risk & reward', exact: true }).waitFor();
  for (const name of ['Strategy', 'Psychology', 'Notes', 'Summary', 'Details']) {
    await detail.getByRole('tab', { name, exact: true }).click();
    assert.equal(await detail.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true');
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await detail.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: join(screenshots, `trade-details-${width}.png`), fullPage: true });
  }
  await detail.getByRole('button', { name: 'Edit trade', exact: true }).click();
  await detail.getByLabel('Entry', { exact: true }).fill('-1');
  await detail.getByRole('button', { name: 'Save demo changes', exact: true }).click();
  await detail.getByText('Entry is outside the allowed range.', { exact: true }).waitFor();
  await detail.getByLabel('Entry', { exact: true }).fill('1.085');
  await detail.getByRole('tab', { name: 'Strategy', exact: true }).click();
  await detail.getByLabel('Custom session', { exact: true }).fill('London review');
  await detail.getByRole('tab', { name: 'Psychology', exact: true }).click();
  await detail.getByLabel('Custom emotion', { exact: true }).fill('Patient');
  await detail.getByRole('tab', { name: 'Notes', exact: true }).click();
  await detail.getByLabel('Before the trade', { exact: true }).fill('Edited note <script>safe text</script>');
  await page.screenshot({ path: join(screenshots, 'edit-notes-mobile.png'), fullPage: true });
  await detail.getByRole('button', { name: 'Save demo changes', exact: true }).click();
  await detail.getByText('Demo changes saved for this page.', { exact: true }).waitFor();
  await detail.getByText('1.085', { exact: true }).waitFor();
  await detail.getByRole('tab', { name: 'Notes', exact: true }).click();
  await detail.getByText('Edited note <script>safe text</script>', { exact: true }).waitFor();
  assert.equal(await detail.locator('script').count(), 0);
  await detail.getByRole('button', { name: 'Edit trade', exact: true }).click();
  await detail.getByLabel('Entry', { exact: true }).fill('1.2');
  page.once('dialog', d => d.dismiss());
  await detail.getByRole('button', { name: 'Close details', exact: true }).click();
  assert.equal(await detail.isVisible(), true);
  page.once('dialog', d => d.accept());
  await detail.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: join(screenshots, 'compact-open-trades.png'), fullPage: true });
  await page.getByRole('tab', { name: /Open trades/ }).click();

  const first = page.locator('.open-trade').first();
  await first.getByRole('button', { name: 'Close trade', exact: true }).click();
  await page.getByLabel('Realized P&L · USD', { exact: true }).fill('124');
  await page.getByLabel('Final R (optional)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Review balance change', exact: true }).click();
  await page.getByText('$25,196.00 → $25,320.00', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Confirm demo close', exact: true }).click();
  await page.getByText('Confirm that you checked the result and balance change.', { exact: true }).waitFor();
  await page.getByLabel('I checked the result and balance change.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirm demo close', exact: true }).click();
  await page.locator('#close-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.open-trade').count(), 1);
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await page.locator('#accounts').getByText('$25,320.00', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  await page.locator('.stats-metrics').getByText('49 closed trades', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.getByLabel('Search notes', { exact: true }).fill('weekly');
  assert.equal(await page.locator('.note-card').count(), 1);
  await page.locator('.note-list-row').first().click();
  await page.locator('#selected-note').getByRole('heading', { name: 'Weekly review', exact: true }).waitFor();
  await page.locator('#selected-note').getByRole('button', { name: 'View trade', exact: true }).click();
  await page.locator('#trade-detail-dialog').waitFor();
  await page.locator('#trade-detail-dialog').getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByLabel('Search notes', { exact: true }).fill('does not exist');
  assert.equal(await page.locator('.note-card').count(), 0);
  await page.getByLabel('Search notes', { exact: true }).fill('');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const noteEditor = page.locator('#note-editor-dialog');
  await noteEditor.getByLabel('Title', { exact: true }).fill('Browser note');
  await noteEditor.getByLabel('Note text', { exact: true }).fill('A new plain-text note.');
  await noteEditor.getByLabel('Account (optional)', { exact: true }).selectOption({ index: 1 });
  await noteEditor.getByRole('button', { name: 'Save demo note', exact: true }).click();
  await noteEditor.waitFor({ state: 'hidden' });
  await page.locator('#selected-note').getByRole('heading', { name: 'Browser note', exact: true }).waitFor();
  await page.locator('#selected-note').getByRole('button', { name: 'Edit note', exact: true }).click();
  await noteEditor.getByLabel('Note text', { exact: true }).fill('Edited note content <b>literal text</b>.');
  await noteEditor.getByRole('button', { name: 'Save demo note', exact: true }).click();
  await noteEditor.waitFor({ state: 'hidden' });
  await page.locator('#selected-note').getByText('Edited note content <b>literal text</b>.', { exact: true }).waitFor();
  assert.equal(await page.locator('#selected-note .note-document-content b').count(), 0);
  await page.locator('#selected-note').getByRole('button', { name: 'Edit note', exact: true }).click();
  await noteEditor.getByLabel('Title', { exact: true }).fill('Unsaved');
  page.once('dialog', d => d.dismiss()); await noteEditor.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await noteEditor.isVisible(), true);
  await page.setViewportSize({ width: 390, height: 900 });
  assert.ok(await noteEditor.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: join(screenshots, 'note-editor-mobile.png'), fullPage: true });
  page.once('dialog', d => d.accept()); await noteEditor.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeToggle').click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      for (const tab of ['Open trades', 'Accounts', 'Stats', 'Notes', 'Settings']) {
        await page.getByRole('tab', { name: new RegExp('^' + tab) }).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tab} overflows at ${width}/${theme}`);
        if (width === 1440 || width === 390) await page.screenshot({ path: join(screenshots, `workspace-${tab.replace(' ', '-')}-${theme}-${width}.png`), fullPage: true });
      }
    }
  }
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Pulse Pink', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Pulse Pink', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.reload();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Pulse Pink', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Reset accent color', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Forest Green', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  await page.getByRole('heading', { name: 'Account ranking', exact: true }).waitFor();
  assert.ok(await page.locator('[data-stats-section=overview]').isHidden());
  await page.getByRole('button', { name: 'Timing', exact: true }).click();
  await page.locator('.mac-calendar').waitFor();
  for (const section of ['Overview', 'Performance', 'Timing', 'Journal', 'Trades']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    assert.equal(await page.locator('.mac-header-title h2').textContent(), section);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${section} overflows at ${width}`);
      if(section === 'Overview' && width === 1440) await page.screenshot({path:join(screenshots,'mac-stats-overview-preview.png')});
      if (width !== 320) await page.screenshot({ path: join(screenshots, `mac-stats-${section.toLowerCase()}-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.locator('[data-stats-section=journal] .mac-bar-row').first().click();
  await page.locator('dialog.mac-drilldown').waitFor();
  assert.ok(await page.locator('dialog.mac-drilldown tbody tr').count() > 0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Trades', exact: true }).click();
  await page.getByLabel('Journal notes', { exact: true }).selectOption('with');
  await page.getByLabel('Sort', { exact: true }).selectOption('high');
  await page.getByLabel('Display', { exact: true }).selectOption('cards');
  assert.ok(await page.locator('[data-stats-section=trades] article').count() > 0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByLabel('Equity metric', { exact: true }).selectOption('pl');
  await page.getByText('Select one currency/account to view a P&L curve. Different currencies cannot be added.', { exact: true }).waitFor();
  await page.getByLabel('Equity metric', { exact: true }).selectOption('r');
  await page.locator('#stats-metric').selectOption('percent');
  await page.getByRole('heading', { name: 'Equity curve', exact: true }).waitFor();
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('svg[aria-label="Equity curve"] circle').first().focus();
  await page.locator('.mac-chart-tooltip').filter({hasText:'Result'}).waitFor();
  if(await page.locator('html').getAttribute('data-theme')!=='light') await page.locator('#themeToggle').click();
  await page.screenshot({path:join(screenshots,'mac-stats-light-preview.png')});
  for(const section of ['Overview','Performance','Timing','Journal','Trades']) {
    await page.getByRole('button',{name:section,exact:true}).click();
    await page.setViewportSize({width:390,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Light ${section} overflow`);
  }


  await page.getByRole('tab', { name: 'Open trades', exact: false }).click();
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  assert.equal(await page.locator('.open-trade').count(), 2);


  assert.equal(premiumRequests, 0);
  // MARK: - Bewust onthouden, herstellen en vergeten van een fictieve Apple-sessie
  await visit();
  await page.getByRole('button', { name: 'Connect iCloud', exact: true }).waitFor();
  await page.evaluate(() => localStorage.removeItem('pulsefx-remember-icloud'));
  await page.reload();
  assert.ok(await page.getByLabel('Remember iCloud on this browser', { exact: true }).isChecked());
  await page.getByRole('button', { name: 'Connect iCloud', exact: true }).click();
  await page.getByRole('button', { name: 'Test Apple sign in', exact: true }).click();
  await page.locator('#zone-panel').waitFor();
  assert.equal(await page.evaluate(() => testControl.persist), true);
  await page.reload();
  await page.locator('#zone-panel').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Test Apple sign in', exact: true }).count(), 0);
  assert.equal(await page.locator('#accounts').textContent(), '');
  await page.getByRole('button', { name: 'Disconnect and clear data', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('pulsefx-remember-icloud')), 'false');
  assert.equal(await page.evaluate(() => document.cookie.includes('fixtureAppleSession=yes')), false);
  await page.reload();
  assert.equal(await page.locator('script[src*="cloudkit.com"]').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  if (process.env.PULSEFX_VENDOR_SDK_PATH) {
    useVendor = true; await page.setViewportSize({ width: 1000, height: 900 }); await visit();
    await page.getByRole('button', { name: 'Connect iCloud' }).click();
    await page.getByText('Continue in Apple’s sign-in window using the button above. No data has been read.').waitFor();
    await page.locator('#apple-sign-in-button .apple-auth-button').waitFor({ state: 'visible' });
    await page.screenshot({ path: join(screenshots, 'vendor-sdk-offline-signin.png'), fullPage: true });
    // Comment NL: De echte SDK bouwt een request; uitsluitend de fixture-router ontvangt het.
    const result = await page.evaluate(async ({ zone, config }) => {
      const { closeTransport, commitClose, planClose } = await import('/pulsefx/icloud/close-trade.mjs');
      const pilot = 'abcdef00-0000-4000-8000-000000000099';
      const configuration = { ...config, closeTradePilotId: pilot, tradeEditingEnabled: true, noteEditingEnabled: true }, transport = closeTransport(configuration, fetch.bind(window));
      CloudKit.configure({ containers: [{ containerIdentifier: config.containerIdentifier, environment: config.environment, apiTokenAuth: { apiToken: config.apiToken, persist: false } }], services: { fetch: transport.fetch, logger: { info() {}, log() {}, warn() {}, error() {} } } });
      const snapshot = { collectionStatus: 'complete', accounts: [{ key: 'account', balance: 1000, currency: 'USD', archived: false, recordName: 'synthetic-account', recordChangeTag: 'account-tag', zone }], trades: [{ key: 'trade', id: pilot, recordType: 'CD_OpenTrade', recordName: 'synthetic-trade', recordChangeTag: 'trade-tag', zone, accountKey: 'account', linkStatus: 'linked', status: 'open', result: 'open', outcomeConsistent: true, startedAt: '2026-01-01T00:00:00Z' }] };
      const plan = planClose(snapshot, 'trade', { profitLoss: '25', result: 'win', closedAt: '2026-01-02T00:00:00Z' });
      await commitClose({ plan, config: configuration, database: CloudKit.getDefaultContainer().privateCloudDatabase, selected: { requestZone: zone }, transport });
      const { planEdit, commitEdit } = await import('/pulsefx/icloud/edit-trade.mjs');
      snapshot.trades[0].entryPrice = 1.1;
      const edit = planEdit(snapshot, 'trade', { entryPrice: '', slMoved: false, preTradeNotes: 'SDK edit fixture' });
      await commitEdit({ plan: edit, config: configuration, database: CloudKit.getDefaultContainer().privateCloudDatabase, selected: { requestZone: zone }, transport });
      const { planNote, commitNote } = await import('/pulsefx/icloud/note-write.mjs');
      const nativeZone = { ...zone, zoneName: 'com.apple.coredata.cloudkit.zone' };
      const notesSnapshot = { ...snapshot, notesStatus: 'complete', notes: [] };
      const newNote = planNote(notesSnapshot, null, { title: 'SDK note', body: 'SDK body' }, nativeZone, '12345678-1234-4234-8234-123456789abc');
      await commitNote({ plan: newNote, config: configuration, database: CloudKit.getDefaultContainer().privateCloudDatabase, selected: { requestZone: nativeZone }, transport });
      notesSnapshot.notes = [{ key: 'note', id: 'original', recordName: 'original-note', recordChangeTag: 'original-version', zone: nativeZone, title: 'Original', body: 'Original body', hasRichText: true }];
      const updatedNote = planNote(notesSnapshot, 'note', { title: 'SDK note', body: 'SDK body', replaceFormatting: true }, nativeZone);
      await commitNote({ plan: updatedNote, config: configuration, database: CloudKit.getDefaultContainer().privateCloudDatabase, selected: { requestZone: nativeZone }, transport });
      return true;
    }, { zone, config });
    assert.equal(result, true); assert.equal(vendorModify, 4); assert.deepEqual(external, []);
    useVendor = false;
    // MARK: - Bewust onthouden, herstellen en vergeten van een fictieve Apple-sessie
  await visit();
  await page.getByRole('button', { name: 'Connect iCloud', exact: true }).waitFor();
  await page.evaluate(() => localStorage.removeItem('pulsefx-remember-icloud'));
  await page.reload();
  assert.ok(await page.getByLabel('Remember iCloud on this browser', { exact: true }).isChecked());
  await page.getByRole('button', { name: 'Connect iCloud', exact: true }).click();
  await page.getByRole('button', { name: 'Test Apple sign in', exact: true }).click();
  await page.locator('#zone-panel').waitFor();
  assert.equal(await page.evaluate(() => testControl.persist), true);
  await page.reload();
  await page.locator('#zone-panel').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Test Apple sign in', exact: true }).count(), 0);
  assert.equal(await page.locator('#accounts').textContent(), '');
  await page.getByRole('button', { name: 'Disconnect and clear data', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('pulsefx-remember-icloud')), 'false');
  assert.equal(await page.evaluate(() => document.cookie.includes('fixtureAppleSession=yes')), false);
  await page.reload();
  assert.equal(await page.locator('script[src*="cloudkit.com"]').count(), 0);
  assert.deepEqual(errors, []);
  }
  console.log(`PASS: shared demo close/balance/stats, notes/search, SDK atomic-write fixture (when configured), disabled deployment, opt-in auth, filtering, currencies, XSS, partial/stale/empty data, session expiry, late responses, local friends statistics, filters, and responsive dark/light tabs. Screenshots: ${screenshots}`);
} catch (error) {
  await page.screenshot({ path: join(screenshots, 'failure.png'), fullPage: true });
  console.error('Fixture page status:', await page.locator('#status').textContent());
  console.error('Fixture page errors:', errors);
  console.error('Fixture zone panel:', await page.locator('#zone-panel').innerText());
  throw error;
} finally { await browser.close(); }
