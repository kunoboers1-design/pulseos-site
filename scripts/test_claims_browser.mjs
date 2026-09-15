import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// MARK: - Claimweergave en lokale navigatie
// Comment NL: Controleert de bestaande vormgeving en uitklapbare functies na de tekstcorrecties.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.PRICE_TEST_URL || 'http://127.0.0.1:8765';
const apps = ['pulsefx', 'pulsevinyl', 'pulserecipes', 'pulsereflect', 'pulsewiish', 'pulsesidequest', 'pulselift', 'pulsehabits'];
const screenshots = join(tmpdir(), 'pulseos-claims-checks');
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.route(/^https:\/\//, route => route.abort());
  await context.route('**/api/**', route => route.fulfill({ json: {} }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const app of apps) {
      await page.goto(`${base}/${app}/#features`);
      const rows = page.locator('#features .feature-row');
      assert.ok(await rows.count() >= 4, app);
      for (const row of await rows.all()) {
        if (await row.getAttribute('open') === null) await row.locator('summary').press('Enter');
        assert.ok(await row.locator('.feature-row-body').isVisible());
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${app}: overflow at ${width}`);
      for (const link of await page.locator('.product-sidebar a[href^="#"]').all()) {
        const id = (await link.getAttribute('href')).slice(1);
        assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `${app}: missing target ${id}`);
      }
      if (app === 'pulselift') assert.ok(await page.locator('.product-unreleased').getByText('Paused', { exact: true }).isVisible());
      if (app === 'pulsehabits') assert.ok(await page.locator('.product-unreleased').getByText('In development', { exact: true }).isVisible());
      await page.evaluate(() => document.activeElement?.blur());
      // Comment NL: Bij een lange sectie-opname verbergen we alleen de vaste header in de opname.
      await page.locator('#features').screenshot({ path: join(screenshots, `${app}-${width}.png`), animations: 'disabled', style: '.site-header { visibility: hidden; }' });
      if (app === 'pulsefx') {
        await page.locator('#features').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.screenshot({ path: join(screenshots, `viewport-${width}.png`), animations: 'disabled' });
      }
      await page.locator('.product-sidebar a[href="#product-details"]').click();
      if (app !== 'pulsesidequest') {
        await page.goto(`${base}/${app}/#how-it-works`);
        assert.ok(await page.locator('#how-it-works').isVisible(), `${app}: hidden deep link`);
      }
    }
    for (const path of ['/#apps', '/about/#work-title']) {
      await page.goto(base + path);
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (path === '/#apps' && width === 390) {
        // Comment NL: Voor en na de wijziging meet de bestaande homepage 400px op een 390px-scherm.
        assert.ok(pageWidth <= 400, `${path}: overflow exceeds the verified pre-existing 10px`);
        if (pageWidth > width) console.log('EXISTING ISSUE: homepage has 10px mobile overflow, also reproduced with the pre-edit HTML.');
      } else assert.ok(pageWidth <= width, `${path}: overflow at ${width}`);
    }
  }
  const known = errors.filter(error => error.message.includes("Failed to execute 'insertBefore'") && error.stack?.includes('/also-by.js:'));
  assert.deepEqual(errors.filter(error => !known.includes(error)).map(error => error.stack), []);
  if (known.length) console.log(`EXISTING ISSUE: ${known.length} related-app insertions failed in unchanged also-by.js insertion logic.`);
  console.log(`PASS: eight app pages at 1440px and 390px; keyboard disclosures, navigation anchors, deep links, development status and overflow. Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
