import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendsAccess, needsAccess } from '../../server/pulsefx-access/gate.mjs';
import { memoryD1 } from './d1.mjs';
// MARK: - Servertoegang, sessies en misbruikgrenzen
function fixture(t) {
  const db = memoryD1(); t.after(() => db.close()); let clock = 1800000000;
  const env = { PULSEFX_ACCESS_DB: db, PULSEFX_FRIENDS_ORIGIN: 'https://pulsefx.test', PULSEFX_FRIENDS_PASSWORD: 'a-long-test-password', PULSEFX_FRIENDS_SESSION_SECRET: 'a-private-session-secret-of-32-characters' };
  const call = (path, init = {}) => friendsAccess({ request: new Request('https://pulsefx.test' + path, init), env,
    next: async () => new Response('original website body', { status: 201, headers: { 'Content-Type': 'text/plain' } }) }, { now: () => clock });
  const login = (password = env.PULSEFX_FRIENDS_PASSWORD, next = '/pulsefx/icloud/', extra = {}) => call('/pulsefx/access/', {
    method: 'POST', headers: { origin: env.PULSEFX_FRIENDS_ORIGIN, 'cf-connecting-ip': '192.0.2.1', ...extra }, body: new URLSearchParams({ password, next }) });
  return { env, call, login, advance: seconds => { clock += seconds; } };
}
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];
test('protects web pages, assets and API including encoded paths; marketing and native proof route stay separate', () => {
  for (const p of ['/pulsefx/app', '/pulsefx/app/a.mjs', '/pulsefx/login/', '/pulsefx/dashboard/index.html', '/pulsefx/icloud/', '/pulsefx/%69cloud/cloud.mjs', '/pulsefx%2ficloud/', '/api/pulsefx-config', '/api/pulsefx-premium/session', '/broken%']) assert.equal(needsAccess(p), true, p);
  for (const p of ['/pulsefx/', '/privacy/', '/styles.css', '/pulsefx/access/access.css', '/api/pulsefx-premium/confirm']) assert.equal(needsAccess(p), false, p);
});
test('anonymous access cannot obtain pages, config or data; public marketing is unchanged', async t => {
  const f = fixture(t);
  assert.equal((await f.call('/pulsefx/access/')).headers.get('referrer-policy'), 'same-origin');
  assert.equal((await f.call('/pulsefx/')).status, 201);
  assert.equal((await f.call('/pulsefx/icloud/')).status, 303);
  assert.equal((await f.call('/api/pulsefx-config')).status, 401);
  assert.equal((await f.call('/api/pulsefx-premium/statistics', { method: 'POST' })).status, 401);
  f.env.PULSEFX_FRIENDS_PASSWORD = '';
  assert.equal((await f.call('/pulsefx/icloud/')).status, 503);
  assert.equal((await f.call('/api/pulsefx-config')).status, 503);
});
test('correct login produces opaque secure cookie and forwards original response intact', async t => {
  const f = fixture(t); const r = await f.login(undefined, '/pulsefx/icloud/?statistics=demo');
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/pulsefx/icloud/?statistics=demo');
  assert.match(r.headers.get('set-cookie'), /^__Host-pulsefx-friends=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/);
  const page = await f.call('/pulsefx/icloud/', { headers: { cookie: cookieOf(r) } });
  assert.equal(page.status, 201); assert.equal(await page.text(), 'original website body');
  assert.equal(page.headers.get('cache-control'), 'private, no-store');
  assert.equal(page.headers.get('content-type'), 'text/plain');
  const stored = await f.env.PULSEFX_ACCESS_DB.prepare('SELECT id FROM friends_sessions').first();
  assert.notEqual(stored.id, cookieOf(r).split('=')[1]);
});
test('wrong and forged passwords/cookies fail; HTML never includes submitted password', async t => {
  const f = fixture(t); const r = await f.login('wrong-sensitive-password'); assert.equal(r.status, 401);
  assert.doesNotMatch(await r.text(), /wrong-sensitive-password|a-long-test-password|a-private-session-secret/);
  assert.equal((await f.call('/pulsefx/icloud/', { headers: { cookie: '__Host-pulsefx-friends=' + 'a'.repeat(64) } })).status, 303);
});
test('expiry, password rotation and secret rotation invalidate sessions', async t => {
  const f = fixture(t); let cookie = cookieOf(await f.login());
  f.advance(43200); assert.equal((await f.call('/pulsefx/icloud/', { headers: { cookie } })).status, 303);
  cookie = cookieOf(await f.login()); f.env.PULSEFX_FRIENDS_PASSWORD += '-changed';
  assert.equal((await f.call('/pulsefx/icloud/', { headers: { cookie } })).status, 303);
  cookie = cookieOf(await f.login()); f.env.PULSEFX_FRIENDS_SESSION_SECRET += '-changed';
  assert.equal((await f.call('/pulsefx/icloud/', { headers: { cookie } })).status, 303);
});
test('logout revokes the server session and requires same origin', async t => {
  const f = fixture(t); const cookie = cookieOf(await f.login());
  assert.equal((await f.call('/pulsefx/access/logout', { method: 'POST', headers: { cookie, origin: 'https://evil.test' } })).status, 403);
  const r = await f.call('/pulsefx/access/logout', { method: 'POST', headers: { cookie, origin: f.env.PULSEFX_FRIENDS_ORIGIN } });
  assert.equal(r.status, 303); assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.call('/pulsefx/icloud/', { headers: { cookie } })).status, 303);
});
test('CSRF, external redirect and HTML injection are rejected or escaped', async t => {
  const f = fixture(t);
  assert.equal((await f.login(undefined, '/', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await f.login(undefined, '/', { 'sec-fetch-site': 'cross-site' })).status, 403);
  for (const next of ['https://evil.test', '//evil.test', '/\\evil.test', '/privacy/']) assert.equal((await f.login(undefined, next)).headers.get('location'), '/pulsefx/icloud/');
  const html = await (await f.call('/pulsefx/access/?next=' + encodeURIComponent('/pulsefx/icloud/?x=" autofocus onfocus="alert(1)'))).text();
  assert.doesNotMatch(html, /value="[^"]*" autofocus/);
});
test('limits attempts atomically and permits a new window', async t => {
  const f = fixture(t); for (let i = 0; i < 10; i++) assert.equal((await f.login('wrong')).status, 401);
  const r = await f.login(); assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
  f.advance(900); assert.equal((await f.login()).status, 303);
});
test('database failures and invalid request bodies fail closed', async t => {
  const f = fixture(t);
  assert.equal((await f.call('/pulsefx/access/', { method: 'POST', headers: { origin: f.env.PULSEFX_FRIENDS_ORIGIN }, body: 'invalid' })).status, 400);
  assert.equal((await f.login('a'.repeat(5000))).status, 400);
  f.env.PULSEFX_ACCESS_DB.batch = async () => { throw new Error('offline'); };
  assert.equal((await f.login()).status, 503);
});
test('local HTTP exception requires explicit localhost preview configuration', async t => {
  const f = fixture(t); f.env.PULSEFX_FRIENDS_ORIGIN = 'http://127.0.0.1:8767';
  const context = { env: f.env, request: new Request(f.env.PULSEFX_FRIENDS_ORIGIN + '/pulsefx/access/'), next: () => new Response('') };
  assert.equal((await friendsAccess(context)).status, 503);
  f.env.PULSEFX_FRIENDS_LOCAL_PREVIEW = 'true'; assert.equal((await friendsAccess(context)).status, 200);
  f.env.PULSEFX_FRIENDS_ORIGIN = 'http://public.test'; context.request = new Request('http://public.test/pulsefx/access/');
  assert.equal((await friendsAccess(context)).status, 503);
});
