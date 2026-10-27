import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// MARK: - Volledige browserroute met lokale, tijdelijke toegang
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = 'http://127.0.0.1:8767';
const screenshots = join(tmpdir(), 'pulsefx-access-checks'); mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(); const errors = []; const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/pulsefx/icloud/?statistics=demo');
  assert.match(page.url(), /\/pulsefx\/access\//);
  assert.equal((await context.request.get(origin + '/api/pulsefx-config')).status(), 401);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const mode of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== mode) await page.locator('#themeToggle').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${mode} overflow`);
      assert.ok(await page.locator('input[name=password]').isVisible());
      await page.screenshot({ path: join(screenshots, `access-${mode}-${width}.png`), fullPage: true });
    }
  }
  await page.getByLabel('Access password').fill('wrong');
  await page.getByRole('button', { name: 'Continue to PulseFX' }).click();
  await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /not correct/);
  await page.getByLabel('Access password').fill('pulsefx-friends-preview');
  await page.getByRole('button', { name: 'Continue to PulseFX' }).click();
  await page.waitForURL(url => url.pathname === '/pulsefx/icloud/' && url.searchParams.get('statistics') === 'demo');
  await page.locator('#premium-statistics').waitFor();
  await page.waitForFunction(() => document.querySelector('#premium-statistics')?.textContent.includes('Atlas'));
  assert.equal((await context.request.get(origin + '/api/pulsefx-config')).status(), 200);
  assert.equal((await (await context.request.get(origin + '/api/pulsefx-config')).json()).enabled, false);
  const cookie = (await context.cookies()).find(c => c.name === 'pulsefx-friends-local-preview');
  assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Strict');
  await page.reload(); await page.locator('#premium-statistics').waitFor();
  await page.getByRole('link', { name: 'Lock website' }).click();
  await page.getByRole('button', { name: 'Lock this browser' }).click();
  await page.waitForURL('**/pulsefx/access/');
  assert.equal((await context.request.get(origin + '/api/pulsefx-config')).status(), 401);
  await page.goto(origin + '/pulsefx/dashboard/'); assert.match(page.url(), /\/pulsefx\/access\//);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: gated pages/API, wrong/correct password, demo navigation, refresh, cookie, logout, 320–1440px dark/light; no external connections.');
  console.log('Screenshots: ' + screenshots);
} finally { await browser.close(); }
