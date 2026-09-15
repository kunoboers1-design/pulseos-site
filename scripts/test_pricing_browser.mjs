import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FALLBACK, formatPrice, REGION_KEY } from '../pricing.mjs';

// MARK: - Browsercontroles
// Comment NL: Playwright komt uit een bestaande installatie; de website heeft geen dependencies.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.PRICE_TEST_URL || 'http://127.0.0.1:8765';
const data = JSON.parse(readFileSync(new URL('../data/prices.json', import.meta.url)));
const screenshots = join(tmpdir(), 'pulseos-pricing-checks');
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error));
// Comment NL: Externe fonts en bestaande API's zijn niet nodig om lokale prijzen te controleren.
await context.route(/^https:\/\//, route => route.abort());
await context.route('**/api/**', route => route.fulfill({ json: {} }));
const selector = page.getByLabel('App Store region', { exact: true });
async function choose(input, region) {
  await input.fill(region);
  await input.press('Enter');
}
async function visit(app) {
  await page.goto(`${base}/${app}/#pricing`);
  await selector.waitFor();
}
async function verify(app, region) {
  assert.equal(await selector.inputValue(), region);
  for (const [plan, prices] of Object.entries(data.products[app])) {
    assert.equal(await page.locator(`[data-price-plan="${plan}"]`).textContent(), formatPrice(prices[region]));
  }
}

try {
  for (const app of Object.keys(data.products)) {
    await visit(app);
    await verify(app, 'Netherlands');
    for (const region of ['United States', 'United Kingdom', 'Japan', 'Albania', 'Australia']) {
      await choose(selector, region);
      await verify(app, region);
    }
    await choose(selector, 'Netherlands');
    await page.locator('#pricing').screenshot({ path: join(screenshots, `${app}-desktop.png`) });
  }
  await visit('pulserecipes');
  await choose(selector, 'United States');
  assert.match(await page.locator('[data-price-plan]').textContent(), /USD\s12\.99/);
  await choose(selector, 'Albania');
  assert.match(await page.locator('[data-price-plan]').textContent(), /USD\s14\.99/);
  await page.reload();
  await selector.waitFor();
  await verify('pulserecipes', 'Albania');
  await page.locator('.back-to-apps').click();
  await page.locator('a[href="/pulsefx/"]').first().click();
  await selector.waitFor();
  await verify('pulsefx', 'Albania');
  await page.goBack();
  await page.goBack();
  await selector.waitFor();
  await verify('pulserecipes', 'Albania');

  // Comment NL: Ongeldige en ontbrekende opslag vallen beide terug op Nederland.
  for (const stored of ['Atlantis', '', null]) {
    await page.evaluate(({ key, stored }) => stored === null ? localStorage.removeItem(key) : localStorage.setItem(key, stored), { key: REGION_KEY, stored });
    await page.reload();
    await selector.waitFor();
    await verify('pulserecipes', 'Netherlands');
  }
  const second = await context.newPage();
  await second.goto(`${base}/pulsefx/#pricing`);
  await choose(second.getByLabel('App Store region', { exact: true }), 'Japan');
  await page.waitForFunction(() => document.querySelector('input[role="combobox"]').value === 'Japan');
  await verify('pulserecipes', 'Japan');
  assert.match(await page.locator('[data-price-plan]').textContent(), /JPY\s2,000$/);
  await second.close();

  // Comment NL: Zoektekst filtert de opties zonder prijzen te wijzigen tot de gebruiker bevestigt.
  await selector.focus();
  await page.keyboard.press('a');
  await page.keyboard.press('l');
  await page.keyboard.press('Enter');
  assert.equal(await selector.inputValue(), data.regions[1]);
  assert.ok(await selector.getAttribute('aria-describedby'));
  assert.equal(await page.locator('[data-price-status]').getAttribute('role'), 'status');
  assert.notEqual(await selector.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
  await selector.fill('uNiTeD');
  assert.equal(await page.getByRole('option').count(), 3);
  assert.equal(await page.locator('[data-price-status]').textContent(), 'Prices for Albania.');
  await selector.press('ArrowDown');
  await selector.press('Enter');
  await verify('pulserecipes', 'United Kingdom');
  await selector.fill('jap');
  await selector.press('Enter');
  await verify('pulserecipes', 'Japan');
  await selector.fill('united');
  await page.getByRole('option', { name: 'United States', exact: true }).click();
  await verify('pulserecipes', 'United States');
  assert.equal(await selector.getAttribute('aria-expanded'), 'false');
  await selector.fill('Atlantis');
  assert.equal(await page.getByRole('option').count(), 0);
  assert.ok(await page.getByText('No matching regions. Try another name.').isVisible());
  await selector.press('Escape');
  await verify('pulserecipes', 'United States');
  await selector.fill('not a country');
  await selector.press('Tab');
  await verify('pulserecipes', 'United States');
  await selector.fill('japan');
  await selector.press('Tab');
  await verify('pulserecipes', 'Japan');
  await selector.fill('');
  assert.equal(await page.getByRole('option').count(), data.regions.length);
  await selector.press('Escape');
  await selector.click();
  await page.keyboard.type('jap');
  assert.equal(await selector.inputValue(), 'jap');
  await selector.press('Enter');
  await verify('pulserecipes', 'Japan');

  await page.emulateMedia({ colorScheme: 'dark' });
  for (const app of Object.keys(data.products)) {
    await visit(app);
    await choose(selector, 'United States');
    await page.locator('#pricing').screenshot({ path: join(screenshots, `${app}-dark-desktop.png`) });
  }

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const app of Object.keys(data.products)) {
      await visit(app);
      await choose(selector, 'Vietnam');
      await verify(app, 'Vietnam');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${app} overflow at ${width}`);
      await page.locator('#pricing').screenshot({ path: join(screenshots, `${app}-mobile-${width}.png`) });
      if (app === 'pulsefx') {
        await selector.fill('united');
        assert.equal(await page.getByRole('option').count(), 3);
        await page.locator('#pricing').screenshot({ path: join(screenshots, `region-search-mobile-${width}.png`) });
        await selector.press('Escape');
      }
    }
  }

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }));
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => errors.push(error));
  await blockedPage.goto(`${base}/pulsefx/#pricing`);
  const blockedSelect = blockedPage.getByLabel('App Store region', { exact: true });
  await blockedSelect.waitFor();
  assert.equal(await blockedSelect.inputValue(), 'Netherlands');
  await choose(blockedSelect, 'Japan');
  assert.equal(await blockedPage.locator('[data-price-plan="monthly"]').textContent(), formatPrice(data.products.pulsefx.monthly.Japan));
  await blockedPage.reload();
  await blockedSelect.waitFor();
  assert.equal(await blockedSelect.inputValue(), 'Netherlands');
  await blocked.close();

  // Comment NL: Een mobiele tik moet dezelfde bronregio bevestigen als een muisklik.
  const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  await touch.route(/^https:\/\//, route => route.abort());
  const touchPage = await touch.newPage();
  await touchPage.goto(`${base}/pulsefx/#pricing`);
  const touchInput = touchPage.getByLabel('App Store region', { exact: true });
  await touchInput.fill('jap');
  await touchPage.getByRole('option', { name: 'Japan', exact: true }).tap();
  assert.equal(await touchInput.inputValue(), 'Japan');
  assert.equal(await touchPage.locator('[data-price-plan="monthly"]').textContent(), formatPrice(data.products.pulsefx.monthly.Japan));
  await touch.close();

  // Comment NL: Ontbrekende combinaties, ongeldige bedragen en netwerkfouten tonen geen ander land.
  const partial = structuredClone(data);
  delete partial.products.pulsefx.monthly.Netherlands;
  partial.products.pulsefx.yearly.Netherlands.price = '';
  await page.route('**/data/prices.json', route => route.fulfill({ json: partial }));
  await page.evaluate(key => localStorage.removeItem(key), REGION_KEY);
  await visit('pulsefx');
  assert.equal(await page.locator('[data-price-plan="monthly"]').textContent(), FALLBACK);
  assert.equal(await page.locator('[data-price-plan="yearly"]').textContent(), FALLBACK);
  assert.equal(await page.locator('[data-price-plan="lifetime"]').textContent(), formatPrice(data.products.pulsefx.lifetime.Netherlands));
  await page.locator('#pricing').screenshot({ path: join(screenshots, 'missing-prices-mobile.png') });
  await page.unroute('**/data/prices.json');
  for (const failure of ['http', 'json', 'network']) {
    await page.route('**/data/prices.json', route => failure === 'network' ? route.abort() : route.fulfill(failure === 'http' ? { status: 503, body: '' } : { body: '{invalid' }));
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.deepEqual(await page.locator('[data-price-plan]').allTextContents(), [FALLBACK, FALLBACK, FALLBACK]);
    assert.equal(await selector.count(), 0);
    await page.unroute('**/data/prices.json');
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${base}/pulsefx/#pricing`);
  assert.deepEqual(await staticPage.locator('[data-price-plan]').allTextContents(), [FALLBACK, FALLBACK, FALLBACK]);
  await noJS.close();
  for (const plans of Object.values(data.products)) for (const prices of Object.values(plans)) for (const entry of Object.values(prices)) {
    assert.notEqual(formatPrice(entry), FALLBACK);
  }
  // Comment NL: De bestaande fout in verwante apps staat los van prijzen en wordt expliciet gerapporteerd.
  const known = errors.filter(error => error.message.includes("Failed to execute 'insertBefore'") && error.stack?.includes('/also-by.js:'));
  assert.deepEqual(errors.filter(error => !known.includes(error)).map(error => error.stack), []);
  if (known.length) console.log(`EXISTING ISSUE: also-by.js insertBefore failure on ${known.length} page loads; unrelated to pricing, unchanged.`);
  console.log(`PASS: 5 pages, all source currencies, region persistence, navigation, keyboard, 1440/390/320px, storage/data failures. Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
