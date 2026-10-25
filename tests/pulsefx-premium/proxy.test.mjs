import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/pulsefx-premium/[[path]].js';
const origin = 'https://pulsefx-test.invalid';
const env = { PULSEFX_PREMIUM_ENABLED: 'true', PULSEFX_PREMIUM_ORIGIN: origin, PULSEFX_PREMIUM_SERVICE_URL: 'https://premium-service.invalid', PULSEFX_SERVICE_SECRET: 'x'.repeat(64) };
const request = (method = 'POST', headers = {}, body = '{}') => new Request(`${origin}/api/pulsefx-premium/pair`, { method, headers: { origin, 'content-type': 'application/json', ...headers }, body: method === 'GET' ? undefined : body });
const call = (req, options = {}) => onRequest({ request: req, env, params: { path: ['pair'] }, ...options });

test('proxy stays disabled without full explicit configuration and rejects unexpected paths', async () => {
  for (const patch of [{ PULSEFX_PREMIUM_ENABLED: 'false' }, { PULSEFX_SERVICE_SECRET: '' }, { PULSEFX_PREMIUM_SERVICE_URL: 'http://unsafe.invalid' }, { PULSEFX_PREMIUM_ORIGIN: `${origin}/` }]) {
    assert.equal((await call(request(), { env: { ...env, ...patch } })).status, 503);
  }
  assert.equal((await call(request(), { params: { path: ['not-allowed'] } })).status, 404);
});
test('proxy rejects browser CSRF and large input before contacting backend', async () => {
  assert.equal((await call(request('POST', { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await call(request('POST', { 'content-length': '99999999' }))).status, 413);
  assert.equal((await call(request('POST', {}, 'x'.repeat(33000)))).status, 413);
  assert.equal((await call(request('POST', { 'content-type': 'text/plain' }))).status, 415);
});
test('same-origin browser GET is accepted without Origin; credentials only travel to configured service', async t => {
  const previous = globalThis.fetch; t.after(() => globalThis.fetch = previous);
  globalThis.fetch = async (url, init) => {
    assert.equal(url.href, 'https://premium-service.invalid/v1/session'); assert.equal(init.headers.authorization, `Bearer ${env.PULSEFX_SERVICE_SECRET}`);
    assert.equal(init.headers.origin, origin); assert.equal(init.redirect, 'error');
    assert.equal(init.headers['x-pulsefx-client-ip'], 'unknown');
    return new Response('{"state":"pending"}', { headers: { 'set-cookie': '__Host-pulsefx-premium=test; Path=/; Secure; HttpOnly' } });
  };
  const req = new Request(`${origin}/api/pulsefx-premium/session`, { headers: { 'sec-fetch-site': 'same-origin', 'x-pulsefx-client-ip': 'forged' } });
  const result = await call(req, { params: { path: ['session'] } }); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.ok(result.headers.has('set-cookie'));
});
test('native POST forwards neither invented browser Origin nor cookies', async t => {
  const previous = globalThis.fetch; t.after(() => globalThis.fetch = previous);
  globalThis.fetch = async (_, init) => {
    assert.equal(init.headers.origin, undefined); assert.equal(init.headers.cookie, undefined); return new Response('{"state":"confirmed"}');
  };
  const req = new Request(`${origin}/api/pulsefx-premium/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await call(req, { params: { path: ['confirm'] } })).status, 200);
});
