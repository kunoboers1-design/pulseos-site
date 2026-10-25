import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createStore } from '../../services/pulsefx-premium/store.mjs';
import { createApplication, validateSnapshot, cookieName } from '../../services/pulsefx-premium/application.mjs';
import { createApplePurchases, bundleID } from '../../services/pulsefx-premium/apple.mjs';
import { statisticsPayload } from '../../pulsefx/icloud/premium.mjs';
import { statisticsDemo } from '../../pulsefx/icloud/statistics-demo.mjs';
import { SignedDataVerifier, Environment } from '../../services/pulsefx-premium/node_modules/@apple/app-store-server-library/dist/index.js';

// MARK: - Uitsluitend synthetische aankoopbewijzen
const origin = 'https://pulsefx-test.invalid';
const now = Date.parse('2026-10-25T12:00:00Z');
const transaction = overrides => ({ transactionId: '123', originalTransactionId: '100', bundleId: bundleID, environment: 'Production',
  productId: 'com.templateos.fxlotsize.pro.monthly.v1', type: 'Auto-Renewable Subscription', expiresDate: now + 3600000, ...overrides });
const apple = ({ proof = transaction(), current = transaction(), latest = transaction(), status = 1, fail = false } = {}) => createApplePurchases({
  environment: 'Production', now: () => now,
  verifier: { async verifyAndDecodeTransaction(value) { if (value === 'invalid') throw new Error('bad signature'); return value; } },
  client: { async getTransactionInfo() { if (fail) throw new Error('Apple offline'); return { signedTransactionInfo: current }; },
    async getAllSubscriptionStatuses() { return { data: [{ lastTransactions: [{ status, signedTransactionInfo: latest }] }] }; } },
});

test('Production requires the matching bundle and environment, known product and current purchase', async () => {
  assert.equal((await apple().current('123')).kind, 'subscription');
  for (const patch of [{ bundleId: 'another.app' }, { environment: 'Sandbox' }, { productId: 'unknown' }, { revocationDate: now - 1 }, { isUpgraded: true }, { transactionId: '456' }, { type: 'Consumable' }]) {
    await assert.rejects(apple({ current: transaction(patch), latest: transaction(patch) }).current('123'));
  }
});
test('all legacy plans remain supported, including non-consumable lifetime', async () => {
  for (const period of ['weekly', 'monthly', 'yearly']) {
    const t = transaction({ productId: `com.templateos.fxlotsize.pro.${period}.v1` });
    assert.equal((await apple({ current: t, latest: t }).current('123')).kind, 'subscription');
  }
  const t = transaction({ productId: 'com.templateos.fxlotsize.pro.lifetime.v1', type: 'Non-Consumable', expiresDate: undefined });
  assert.equal((await apple({ current: t }).current('123')).kind, 'lifetime');
  await assert.rejects(apple({ current: { ...t, revocationDate: now } }).current('123'));
});
test('old proof cannot bypass expiry, revocation or non-active renewal status', async () => {
  for (const status of [2, 3, 4, 5]) await assert.rejects(apple({ status }).current('123'));
  for (const patch of [{ expiresDate: now }, { revocationDate: now }, { originalTransactionId: 'other-owner' }, { environment: 'Sandbox' }]) {
    await assert.rejects(apple({ latest: transaction(patch) }).current('123'));
  }
  const renewal = transaction({ transactionId: '124', expiresDate: now + 7200000 });
  assert.equal((await apple({ current: transaction({ expiresDate: now - 1 }), latest: renewal }).current('123')).transactionId, '124');
});
test('Apple outage fails closed', async () => { await assert.rejects(apple({ fail: true }).current('123')); });
test('real Apple verifier rejects a forged JWS, not merely decoded JSON', async () => {
  const verifier = new SignedDataVerifier([], true, Environment.PRODUCTION, bundleID, 123456789);
  const purchases = createApplePurchases({ verifier, environment: 'Production', client: { getTransactionInfo() { throw new Error('Must not reach Apple API'); } } });
  const forged = [ { alg: 'none' }, transaction(), 'signature' ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await assert.rejects(purchases.verifyProof(forged));
  await assert.rejects(purchases.verifyProof('123'));
});

function fixture() {
  let clock = now, revoked = false, unavailable = false;
  const store = createStore(':memory:', randomBytes(32), () => clock);
  const purchases = { async verifyProof(proof) { if (proof !== 'synthetic-signed-proof') throw new Error('PURCHASE_INVALID'); return { transactionId: 'sensitive-transaction' }; },
    async current(id) { assert.equal(id, 'sensitive-transaction'); if (unavailable) throw new Error('Apple offline'); if (revoked) throw new Error('PURCHASE_INACTIVE'); return { kind: 'subscription', expiresAt: clock + 3600000 }; } };
  const handle = createApplication({ store, purchases, origin });
  const request = (path, method = 'GET', body, token, headers = {}) => handle(new Request(`${origin}/v1/${path}`, { method,
    headers: { origin, ...(token ? { cookie: `${cookieName}=${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { store, request, handle, advance: ms => clock += ms, revoke: () => revoked = true, outage: () => unavailable = true };
}
async function pair(f) {
  const response = await f.request('pair', 'POST', {});
  assert.equal(response.status, 201); assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  return { ...(await response.json()), token: response.headers.get('set-cookie').split(';')[0].split('=')[1] };
}
async function authorize(f, session) {
  return f.request('confirm', 'POST', { code: session.code, signedTransaction: 'synthetic-signed-proof' });
}
test('pairing, native proof, protected statistics and logout work end to end with synthetic Apple adapter', async t => {
  const f = fixture(); t.after(() => f.store.close()); const session = await pair(f);
  assert.equal((await f.request('session', 'GET', undefined, session.token)).status, 200);
  assert.equal((await f.request('statistics', 'POST', {}, session.token)).status, 403);
  assert.equal((await authorize(f, session)).status, 200);
  const request = { snapshot: statisticsPayload(statisticsDemo()), filters: {} };
  const response = await f.request('statistics', 'POST', request, session.token);
  assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.statistics.summary.count, 48); assert.equal(data.statistics.records, undefined);
  assert.equal(data.statistics.summary.plByCurrency.length, 2);
  assert.equal((await f.request('session', 'DELETE', undefined, session.token)).status, 200);
  assert.equal((await f.request('statistics', 'POST', request, session.token)).status, 401);
});
test('a code is one-use and expires after five minutes; cookie guessing cannot grant access', async t => {
  const f = fixture(); t.after(() => f.store.close()); const session = await pair(f);
  assert.equal((await authorize(f, session)).status, 200);
  assert.equal((await authorize(f, session)).status, 400);
  assert.equal((await f.request('session', 'GET', undefined, 'guessed')).status, 401);
  const expired = await pair(f); f.advance(300001);
  assert.equal((await authorize(f, expired)).status, 400);
});
test('concurrent confirmation consumes a code atomically', async t => {
  const f = fixture(); t.after(() => f.store.close()); const session = await pair(f);
  const results = await Promise.all([authorize(f, session), authorize(f, session)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});
test('revocation and service outages prevent new computations even with an existing browser cookie', async t => {
  for (const action of ['revoke', 'outage']) {
    const f = fixture(); t.after(() => f.store.close()); const session = await pair(f); await authorize(f, session); f[action]();
    const response = await f.request('statistics', 'POST', { snapshot: statisticsPayload(statisticsDemo()) }, session.token);
    assert.equal(response.status, action === 'revoke' ? 403 : 503);
    assert.equal((await response.json()).statistics, undefined);
  }
});
test('session expires after twelve hours even with lifetime access', async t => {
  const f = fixture(); t.after(() => f.store.close()); const session = await pair(f); await authorize(f, session); f.advance(12 * 3600000 + 1);
  assert.equal((await f.request('session', 'GET', undefined, session.token)).status, 401);
});
test('cross-origin requests and missing browser origin rejected; native confirmation is explicitly separate', async t => {
  const f = fixture(); t.after(() => f.store.close());
  assert.equal((await f.request('pair', 'POST', {}, null, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await f.handle(new Request(`${origin}/v1/pair`, { method: 'POST' }))).status, 403);
  const session = await pair(f);
  const response = await f.handle(new Request(`${origin}/v1/confirm`, { method: 'POST', body: JSON.stringify({ code: session.code, signedTransaction: 'synthetic-signed-proof' }) }));
  assert.equal(response.status, 200);
});
test('purchase proof does not persist and cannot be replaced by a client premium flag', async t => {
  const f = fixture(); t.after(() => f.store.close()); const session = await pair(f);
  const forged = await f.request('confirm', 'POST', { code: session.code, isPro: true, transactionId: '123' });
  assert.equal(forged.status, 403);
  assert.equal((await f.request('statistics', 'POST', { isPro: true }, session.token)).status, 403);
});
test('rate limits apply before expensive verification', async t => {
  const f = fixture(); t.after(() => f.store.close());
  for (let i = 0; i < 8; i++) assert.equal((await f.request('confirm', 'POST', { code: 'invalid' })).status, 400);
  assert.equal((await f.request('confirm', 'POST', {})).status, 429);
  f.advance(60001); assert.equal((await f.request('confirm', 'POST', {})).status, 400);
});
test('normalized payload strips names, CloudKit identities, notes, balances and unknown fields', () => {
  const snapshot = statisticsDemo(); snapshot.accounts[0].key = 'private-user/private-zone/record'; snapshot.trades[0].accountKey = snapshot.accounts[0].key;
  snapshot.accounts[0].balance = 999; snapshot.trades[0].note = 'private-note'; snapshot.token = 'secret-token';
  const serialized = JSON.stringify(statisticsPayload(snapshot));
  for (const secret of ['Atlas', 'Orion', 'private-user', 'private-zone', 'private-note', 'secret-token', 'balance']) assert.ok(!serialized.includes(secret));
  const clean = validateSnapshot(JSON.parse(serialized)); assert.equal(clean.accounts[0].key, 'a0'); assert.equal(clean.trades[0].accountKey, 'a0');
});
test('partial, duplicate-account, oversized and invalid numerical input is rejected', () => {
  const good = statisticsPayload(statisticsDemo());
  for (const bad of [{ ...good, collectionStatus: 'partial' }, { ...good, accounts: [good.accounts[0], good.accounts[0]] },
    { ...good, trades: Array(10001).fill(good.trades[0]) }, { ...good, trades: [{ ...good.trades[0], lotSize: Infinity }] }]) assert.throws(() => validateSnapshot(bad));
});

test('persisted session purchase references are authenticated ciphertext, and expiry is pruned', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = mkdtempSync(join(tmpdir(), 'pulsefx-session-test-'));
  const path = join(folder, 'session.sqlite'); const key = randomBytes(32); let clock = now;
  let store;
  try {
    store = createStore(path, key, () => clock); const session = store.create();
    assert.ok(store.confirm(session.code, { transactionId: 'sensitive-purchase-id' })); store.close(); store = null;
    const bytes = readFileSync(path); assert.ok(!bytes.includes(Buffer.from('sensitive-purchase-id'))); assert.ok(!bytes.includes(Buffer.from(session.token)));
    store = createStore(path, key, () => clock); assert.equal(store.get(session.token).purchase.transactionId, 'sensitive-purchase-id');
    clock += 12 * 3600000 + 1; store.prune(); assert.equal(store.get(session.token), null);
  } finally { store?.close(); rmSync(folder, { recursive: true, force: true }); }
});
