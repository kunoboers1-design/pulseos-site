import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// MARK: - Browsercontrole van de lokale preview
// Comment NL: Alleen testgereedschap uit een bestaande installatie; geen website-dependency.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.PULSEFX_TEST_URL || 'http://127.0.0.1:8765';
const screenshots = join(tmpdir(), 'pulsefx-web-checks');
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await context.route(/^https:\/\//, route => route.abort());
await context.route('**/api/**', route => route.fulfill({ json: {} }));
const visit = async path => { const response = await page.goto(`${base}${path}`); assert.equal(response.status(), 200); await page.locator('h1').waitFor(); };
const navigate = async name => { await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('link', { name, exact: true }).click(); await page.locator('h1').waitFor(); };
try {
  await visit('/pulsefx/');
  assert.ok(await page.getByRole('heading', { name: 'Your trading toolkit.' }).isVisible());
  await page.getByRole('link', { name: 'Explore web preview' }).click();
  assert.equal(await page.getByRole('link', { name: 'Connect with iCloud', exact: true }).getAttribute('href'), '/pulsefx/icloud/');
  assert.ok((await page.locator('.login-card').innerText()).includes('shared website password'));
  assert.equal(await page.getByRole('link', { name: 'Lock website' }).getAttribute('href'), '/pulsefx/access/logout');
  await page.screenshot({ path: join(screenshots, 'login-desktop.png'), fullPage: true });
  for (const route of ['/pulsefx/app', '/pulsefx/login', '/pulsefx/dashboard', '/pulsefx/dashboard/index.html']) await visit(route);
  await visit('/pulsefx/login/');
  await page.getByRole('link', { name: 'Explore demo' }).click();
  await page.getByRole('heading', { name: 'Your trading, at a glance.' }).waitFor();
  assert.equal(await page.locator('.metric').first().locator('strong').textContent(), '$40,930.00');
  await page.screenshot({ path: join(screenshots, 'overview-desktop.png'), fullPage: true });

  await navigate('Accounts');
  await page.getByRole('link', { name: 'View account' }).first().click();
  await page.getByRole('heading', { name: 'Atlas Funded' }).waitFor();
  assert.match(await page.locator('.metric').first().textContent(), /25,840/);
  await page.reload();
  await page.getByRole('heading', { name: 'Atlas Funded' }).waitFor();
  await page.getByRole('link', { name: 'Use balance in calculator' }).click();
  await page.getByLabel('Account balance', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Account balance', { exact: true }).inputValue(), '25840');
  await page.getByRole('button', { name: 'Calculate position' }).click();
  assert.match(await page.locator('.lot-result').textContent(), /1.03/);
  await page.getByLabel('Account balance', { exact: true }).fill('10000');
  assert.equal(await page.locator('.lot-result').count(), 0);
  await page.getByLabel('Stop loss', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Calculate position' }).click();
  assert.match(await page.locator('#calculator-result').textContent(), /0.50lots/);
  assert.match(await page.locator('#calculator-result').textContent(), /\$100.00/);
  for (const [field, value] of [['Account balance', ''], ['Risk percentage', '101'], ['Stop loss', '0'], ['Pip value per standard lot', '-1']]) {
    await page.getByLabel(field, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Calculate position' }).click();
    assert.equal(await page.getByLabel(field, { exact: true }).getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('.lot-result').count(), 0);
  }
  await page.reload();
  await page.getByLabel('Sample account', { exact: true }).selectOption('practice');
  await page.getByRole('button', { name: 'Use balance', exact: true }).click();
  assert.equal(await page.getByLabel('Account balance', { exact: true }).inputValue(), '4950');
  await page.getByRole('button', { name: 'Calculate position' }).click();
  await page.screenshot({ path: join(screenshots, 'calculator-desktop.png'), fullPage: true });

  await navigate('Trade Journal');
  assert.equal(await page.locator('tbody tr').count(), 8);
  await page.getByLabel('Account', { exact: true }).selectOption('atlas');
  await page.getByLabel('Trade status', { exact: true }).selectOption('open');
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByLabel('Account', { exact: true }).selectOption('practice');
  assert.ok(await page.getByRole('heading', { name: 'No trades in this view' }).isVisible());
  await page.getByRole('button', { name: 'Clear filters' }).click();
  assert.equal(await page.locator('tbody tr').count(), 8);
  await page.locator('.row-link').first().click();
  const original = await page.getByLabel('Journal note', { exact: true }).inputValue();
  const note = '<img src=x onerror=alert(1)> Demo note & reflection';
  await page.getByLabel('Journal note', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Save demo note' }).click();
  await page.getByText('Demo note saved in this browser.', { exact: true }).waitFor();
  await page.reload();
  assert.equal(await page.getByLabel('Journal note', { exact: true }).inputValue(), note);
  assert.equal(await page.locator('#note-form img').count(), 0);
  const noteUrl = page.url();
  await navigate('Settings');
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(noteUrl);
  assert.equal(await page.getByLabel('Journal note', { exact: true }).inputValue(), note);
  await navigate('Settings');
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByText('Original demo data restored. Saved in this browser.', { exact: true }).waitFor();
  await page.goto(noteUrl);
  assert.equal(await page.getByLabel('Journal note', { exact: true }).inputValue(), original);

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/pulsefx/login/', ...['overview', 'calculator', 'accounts', 'journal', 'settings'].map(view => `/pulsefx/dashboard/?view=${view}`), '/pulsefx/dashboard/?view=journal&trade=t1', '/pulsefx/dashboard/?view=accounts&account=atlas']) {
      await visit(route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow: ${width} ${route}`);
      if (route.includes('dashboard')) assert.ok(await page.locator('.workspace-header .demo-badge').isVisible());
      if (width === 390) await page.screenshot({ path: join(screenshots, `${route.includes('login') ? 'login' : new URL(page.url()).searchParams.get('view')}-mobile.png`), fullPage: true });
    }
  }
  // Comment NL: Ook bij geblokkeerde opslag blijft de demo bruikbaar en is de status eerlijk.
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Unavailable'); } }); });
  await visit('/pulsefx/dashboard/?view=journal&trade=t1');
  await page.getByLabel('Journal note', { exact: true }).fill('Memory only');
  await page.getByRole('button', { name: 'Save demo note' }).click();
  await page.getByText('Note updated for this page only. Local storage is unavailable.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS: routes, calculator, journal filters, persistence/reset, blocked storage, and responsive layouts at 320–1440px. Screenshots: ${screenshots}`);
} finally { await browser.close(); }
