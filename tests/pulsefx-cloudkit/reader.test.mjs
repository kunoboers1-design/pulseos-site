import test from 'node:test';
import assert from 'node:assert/strict';
import { createReader, readOnlyFetch, errorCode, DESIRED_KEYS } from '../../pulsefx/icloud/reader.mjs';
import { onRequest } from '../../functions/api/pulsefx-config.js';
import { sample, zone, context } from './fixtures.mjs';

// MARK: - SDK-testdouble met expliciet verboden schrijffuncties
const selected = { requestZone: zone, zone };
const data = sample();
const page = (records, marker = null) => ({ records, hasErrors: false, errors: [], moreComing: marker !== null, continuationMarker: marker, isQueryResponse: true });
function database(queryHandler) {
  const api = {
    fetchAllRecordZones: async () => ({ zones: [{ zoneID: zone }], hasErrors: false }),
    performQuery: queryHandler || (async query => page(data.records.filter(r => r.recordType === query.recordType))),
  };
  return new Proxy(api, { get(target, property) { if (!(property in target)) throw new Error(`Forbidden SDK method: ${String(property)}`); return target[property]; } });
}

test('Read API performs all three type queries with selected zone and minimal desired keys', async () => {
  const calls = [];
  const reader = createReader({ database: database(async (query, options) => {
    calls.push(query.recordType); assert.deepEqual(options.zoneID, zone);
    assert.deepEqual(options.desiredKeys, DESIRED_KEYS[query.recordType]);
    assert.deepEqual(query.filterBy, [{ fieldName: 'CD_entityName', comparator: 'EQUALS', fieldValue: { value: query.recordType.slice(3) } }]);
    return page(data.records.filter(r => r.recordType === query.recordType).map(({ zoneID, ...record }) => record));
  }), context });
  assert.equal((await reader.zones()).length, 1);
  const result = await reader.read(selected);
  assert.deepEqual(calls, ['CD_Account', 'CD_Trade', 'CD_OpenTrade']);
  assert.equal(result.summary.trades, 5); assert.equal(result.collectionStatus, 'complete');
  assert.equal(result.issues.length, 0);
});

test('Pagination passes the whole SDK response and deduplicates repeated records', async () => {
  let previous;
  const reader = createReader({ context, database: database(async query => {
    if (query === previous) return page([data.records[0], data.records[1]]);
    if (query.recordType === 'CD_Account') { previous = page([data.records[0]], 'next'); return previous; }
    return page(data.records.filter(r => r.recordType === query.recordType));
  }) });
  const result = await reader.read(selected);
  assert.equal(result.summary.accounts, 2); assert.equal(result.repeatedRecords, 1); assert.equal(result.pages, 4);
});

test('Repeated cursors, absent markers and page limits never report complete results', async () => {
  for (const marker of ['loop', undefined]) {
    const reader = createReader({ context, maxPages: 4, database: database(async () => ({ ...page([], 'loop'), continuationMarker: marker })) });
    const result = await reader.read(selected);
    assert.equal(result.collectionStatus, 'partial');
    assert.ok(result.failures.some(f => f.code === 'CURSOR_LOOP'));
  }
  const result = await createReader({ context, maxPages: 1, database: database() }).read(selected);
  assert.equal(result.collectionStatus, 'partial'); assert.ok(result.failures.some(f => f.code === 'READ_LIMIT'));
});

test('A last-page error retains received records as partial, with sanitized error codes', async () => {
  const reader = createReader({ context, database: database(async query => {
    if (query.isQueryResponse) throw { serverErrorCode: 'BAD_REQUEST', reason: 'secret-token-private-record' };
    if (query.recordType === 'CD_Account') return page([data.records[0]], 'second');
    return page([]);
  }) });
  const result = await reader.read(selected);
  assert.equal(result.summary.accounts, 1); assert.equal(result.collectionStatus, 'partial');
  assert.equal(result.failures[0].code, 'BAD_REQUEST'); assert.equal(JSON.stringify(result).includes('secret-token'), false);
});

test('Response-level errors and promise rejections are both checked', async () => {
  const result = await createReader({ context, database: database(async () => ({ hasErrors: true, errors: [{ ckErrorCode: 'SERVICE_UNAVAILABLE' }] })) }).read(selected);
  assert.equal(result.coverage.every(item => !item.complete), true);
  assert.equal(result.failures.length, 3);
  assert.equal(errorCode(new Error('token=private')), 'READ_FAILED');
});

test('Authentication failures invalidate the reader and return no partial snapshot', async () => {
  const reader = createReader({ context, database: database(async () => { throw { ckErrorCode: 'AUTHENTICATION_REQUIRED' }; }) });
  await assert.rejects(reader.read(selected), { code: 'AUTHENTICATION_REQUIRED' });
  await assert.rejects(reader.zones(), { code: 'SESSION_CHANGED' });
});

test('Cancelled sessions discard late responses', async () => {
  let resolve;
  const reader = createReader({ context, database: database(() => new Promise(r => { resolve = r; })) });
  const pending = reader.read(selected); reader.cancel(); resolve(page(data.records));
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
});

test('Hanging calls time out and record caps stop oversized reads', async () => {
  const timeout = await createReader({ context, requestTimeout: 5, database: database(() => new Promise(() => {})) }).read(selected);
  assert.ok(timeout.failures.every(f => f.code === 'TIMEOUT'));
  const limited = await createReader({ context, maxRecords: 1, database: database() }).read(selected);
  assert.ok(limited.failures.some(f => f.code === 'READ_LIMIT')); assert.equal(limited.collectionStatus, 'partial');
});

test('Missing SDK zone owner gets current private-user scope, not an invented global owner', async () => {
  const db = database(); db.fetchAllRecordZones = async () => ({ zones: [{ zoneID: { zoneName: 'Private' } }] });
  const zones = await createReader({ context, database: db }).zones();
  assert.equal(zones[0].zone.ownerRecordName, context.sessionId);
  assert.deepEqual(zones[0].requestZone, { zoneName: 'Private' });
});

test('Fresh reads replace earlier records, and zero results remain an explicit query outcome', async () => {
  let empty = false;
  const reader = createReader({ context, database: database(async q => page(empty ? [] : data.records.filter(r => r.recordType === q.recordType))) });
  assert.equal((await reader.read(selected)).summary.trades, 5); empty = true;
  const result = await reader.read(selected);
  assert.equal(result.summary.trades, 0); assert.equal(result.coverage.length, 3);
  assert.equal(Object.hasOwn(result, 'cloudVerified'), false);
});

// MARK: - Netwerkgrens
const config = { containerIdentifier: 'iCloud.PulseOS.FX', environment: 'development' };
const api = 'https://api.apple-cloudkit.com/database/1/iCloud.PulseOS.FX/development/';
test('Network guard only allows identity checks, zone enumeration and scoped read queries', async () => {
  const calls = [];
  const fetch = readOnlyFetch(config, async (...args) => { calls.push(args); return new Response('{}'); });
  await fetch(`${api}public/users/caller?ckAPIToken=fake`, { method: 'POST' });
  await fetch(`${api}private/zones/list`, { method: 'POST' });
  await fetch(`${api}private/records/query`, { method: 'POST', body: JSON.stringify({ query: { recordType: 'CD_Account' }, zoneID: zone, desiredKeys: DESIRED_KEYS.CD_Account }) });
  assert.equal(calls.length, 3); assert.equal(calls[0][1].cache, 'no-store'); assert.equal(calls[0][1].redirect, 'error');
  for (const operation of ['private/records/modify', 'private/zones/modify', 'private/subscriptions/modify', 'public/records/query', 'private/assets/upload', 'private/users/restrict']) {
    await assert.rejects(fetch(api + operation, { method: 'POST' }), { code: 'OPERATION_BLOCKED' });
  }
  await assert.rejects(fetch(api.replace('/development/', '/production/') + 'private/zones/list'), { code: 'OPERATION_BLOCKED' });
  await assert.rejects(fetch('https://evil.invalid/private/zones/list'), { code: 'OPERATION_BLOCKED' });
  await assert.rejects(fetch(api + 'private/records/query', { method: 'POST', body: '{}' }), { code: 'OPERATION_BLOCKED' });
  assert.equal(calls.length, 3);
});

// MARK: - Deploymentconfiguratie
const env = { PULSEFX_CLOUDKIT_ENABLED: 'true', PULSEFX_CLOUDKIT_ORIGIN: 'https://pulseos.eu', PULSEFX_CLOUDKIT_ENVIRONMENT: 'production', PULSEFX_CLOUDKIT_API_TOKEN: 'fake-token-for-tests-only' };
test('Config is disabled by default and never discloses a token on the wrong origin', async () => {
  for (const environment of [{}, { ...env, PULSEFX_CLOUDKIT_ENABLED: 'false' }, { ...env, PULSEFX_CLOUDKIT_ENVIRONMENT: '' }, { ...env, PULSEFX_CLOUDKIT_ORIGIN: 'https://pulseos.eu/' }, { ...env, PULSEFX_CLOUDKIT_ORIGIN: 'http://pulseos.eu' }]) {
    const response = onRequest({ request: new Request('https://pulseos.eu/api/pulsefx-config'), env: environment });
    const body = await response.json(); assert.equal(body.enabled, false); assert.equal(Object.hasOwn(body, 'apiToken'), false);
  }
  const other = await onRequest({ request: new Request('https://preview.pages.dev/api/pulsefx-config'), env }).json();
  assert.equal(other.enabled, false);
});

test('Only exact HTTPS config enables the browser key; private user data is never proxied', async () => {
  const response = onRequest({ request: new Request('https://pulseos.eu/api/pulsefx-config'), env });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.apiToken, env.PULSEFX_CLOUDKIT_API_TOKEN); assert.equal(body.environment, 'production');
  assert.equal(body.containerIdentifier, 'iCloud.PulseOS.FX');
  assert.equal(onRequest({ request: new Request('https://pulseos.eu/api/pulsefx-config', { method: 'POST' }), env }).status, 405);
});

test('trade editing requires explicit deployment activation', async () => {
  const request = new Request('https://pulseos.eu/api/pulsefx-config');
  for (const value of [undefined, 'false', 'yes']) {
    const body = await onRequest({ request, env: { ...env, PULSEFX_TRADE_EDITING_ENABLED: value } }).json();
    assert.equal(body.tradeEditingEnabled, undefined);
  }
  const body = await onRequest({ request, env: { ...env, PULSEFX_TRADE_EDITING_ENABLED: 'true' } }).json();
  assert.equal(body.tradeEditingEnabled, true);
});
