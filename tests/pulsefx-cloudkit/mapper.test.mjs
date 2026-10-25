import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSnapshot } from '../../pulsefx/icloud/mapper.mjs';
import { sample, account, legacy, modern, uuid, field } from './fixtures.mjs';

// MARK: - Testhulpen
const has = (result, code) => result.issues.some(issue => issue.code === code);
const put = (record, key, value) => { record.fields[key] = field(value); };
function mapChanged(change) { const input = sample(); change(input); return mapSnapshot(input); }

// MARK: - Kernmapping
test('Different native and record identities produce 3 legacy trades on A and 2 mixed trades on B', () => {
  const input = sample();
  const original = structuredClone(input);
  const result = mapSnapshot(input);
  assert.deepEqual(input, original);
  assert.equal(result.quality, 'validated-input');
  assert.equal(result.source, 'mapped-records');
  assert.equal(Object.hasOwn(result, 'cloudVerified'), false);
  assert.deepEqual(result.accounts.map(a => result.trades.filter(t => t.accountKey === a.key).length), [3, 2]);
  assert.equal(result.summary.trades, 5);
  assert.equal(result.summary.closedTrades, 5);
});

test('Stored balance and currencies survive without trade recalculation or conversion', () => {
  const result = mapSnapshot(sample());
  assert.deepEqual(result.summary.balances.map(b => [b.currency, b.balance]), [['EUR', 1200], ['USD', 2300]]);
  assert.equal(result.accounts[0].startBalance, 1000);
  assert.equal(result.accounts[0].balance, 1200);
  assert.equal(result.trades[0].currency, 'EUR');
  assert.equal(result.trades[4].currency, 'USD');
});

test('Negative P&L does not turn break-even into loss; legacy direction stays unknown', () => {
  const result = mapSnapshot(sample());
  assert.equal(result.trades[2].result, 'breakEven');
  assert.equal(result.trades[2].profitLoss, -2);
  assert.equal(result.trades[2].direction, null);
  assert.equal(result.trades[2].startedAtMeaning, 'created');
  assert.equal(result.trades[4].startedAtMeaning, 'opened');
});

test('Native UUID case normalizes, while recordName matching remains exact', () => {
  const result = mapChanged(input => {
    put(input.records[1], 'CD_id', uuid(2).toUpperCase());
    put(input.records[2], 'CD_account', 'ACCOUNT-RECORD-A');
  });
  assert.equal(result.trades[4].linkStatus, 'linked');
  assert.equal(result.trades[0].linkStatus, 'unlinked');
});

test('UUID collisions never select an arbitrary modern parent; legacy record references remain usable', () => {
  const result = mapChanged(input => input.records.push(account('duplicate-uuid', uuid(2))));
  assert.equal(result.trades[4].linkStatus, 'ambiguous');
  assert.equal(result.trades[4].accountKey, null);
  assert.equal(result.trades[4].currency, null);
  assert.equal(result.trades[3].linkStatus, 'linked');
  assert.ok(has(result, 'duplicate-account-uuid'));
  assert.equal(result.quality, 'needs-review');
});

test('Missing, removed and invalid account references retain trades as unlinked', () => {
  for (const value of [null, 'not-a-uuid', uuid(999)]) {
    const result = mapChanged(input => put(input.records[6], 'CD_linkedAccountId', value));
    assert.equal(result.trades.length, 5);
    assert.equal(result.trades[4].accountKey, null);
    assert.equal(result.trades[4].currency, null);
    assert.equal(result.summary.unlinkedTrades, 1);
  }
});

test('Legacy links require the same zone and owner, not just recordName', () => {
  for (const field of ['zoneName', 'ownerRecordName']) {
    const result = mapChanged(input => { input.records[2].zoneID[field] = 'Different'; });
    assert.equal(result.trades[0].linkStatus, 'unlinked');
  }
});

test('Archived accounts and their trades stay available, and totals explicitly include archives', () => {
  const result = mapChanged(input => put(input.records[0], 'CD_isArchived', 1));
  assert.equal(result.accounts[0].archived, true);
  assert.equal(result.trades[0].linkStatus, 'linked');
  assert.equal(result.summary.balances[0].archivedAccounts, 1);
  assert.equal(result.summary.balanceScope, 'all-accounts-including-archived');
});

// MARK: - Identiteit en onvolledigheid
test('Equal UUID, instrument and dates across trade generations do not deduplicate trades', () => {
  const result = mapChanged(input => input.records.push(modern('other-generation', uuid(11), uuid(1))));
  assert.equal(result.summary.trades, 6);
  assert.equal(result.summary.legacyTrades, 4);
  assert.equal(result.summary.modernTrades, 2);
});

test('Exact repeated records collapse even when field object order differs', () => {
  const result = mapChanged(input => {
    const copy = structuredClone(input.records[2]);
    copy.fields = Object.fromEntries(Object.entries(copy.fields).reverse());
    input.records.push(copy);
  });
  assert.equal(result.summary.trades, 5);
  assert.equal(result.repeatedRecords, 1);
  assert.equal(result.issues.length, 0);
});

test('Conflicting record versions are quarantined, independent of order', () => {
  const input = sample();
  const copy = structuredClone(input.records[0]);
  put(copy, 'CD_balance', 9999);
  input.records.push(copy);
  for (const records of [input.records, [...input.records].reverse()]) {
    const result = mapSnapshot({ ...input, records });
    assert.equal(result.accounts.length, 1);
    assert.equal(result.summary.unlinkedTrades, 3);
    assert.ok(has(result, 'conflicting-record-versions'));
    assert.equal(result.quality, 'needs-review');
  }
});

test('A different change tag or record type is a conflict, not an extra record', () => {
  for (const change of [record => { record.recordChangeTag = 'changed'; }, record => { record.recordType = 'CD_OpenTrade'; }]) {
    const result = mapChanged(input => {
      const copy = structuredClone(input.records[2]); change(copy); input.records.push(copy);
    });
    assert.equal(result.summary.trades, 4);
    assert.ok(has(result, 'conflicting-record-versions'));
  }
});

test('Session, environment, zone and owner all scope record identity', () => {
  const base = mapSnapshot(sample()).accounts[0].key;
  for (const change of [input => { input.context.sessionId = 'other'; },
    input => { input.context.environment = 'production'; },
    input => { input.records[0].zoneID.zoneName = 'other'; },
    input => { input.records[0].zoneID.ownerRecordName = 'other'; }]) {
    assert.notEqual(mapChanged(change).accounts[0].key, base);
  }
});

test('Partial and empty input cannot imply successful cloud synchronization', () => {
  const input = sample(); input.records = []; input.collectionStatus = 'partial';
  const result = mapSnapshot(input);
  assert.equal(result.source, 'mapped-records');
  assert.equal(result.quality, 'needs-review');
  assert.ok(has(result, 'partial-collection'));
  input.collectionStatus = 'complete';
  assert.equal(Object.hasOwn(mapSnapshot(input), 'cloudVerified'), false);
});

test('Missing context, public database and missing collection status are rejected', () => {
  for (const change of [input => { delete input.context; }, input => { input.context.database = 'public'; },
    input => { input.context.container = 'iCloud.PulseOS.Lifts'; }, input => { input.context.sessionId = ''; },
    input => { delete input.collectionStatus; }, input => { input.context.environment = 'auto'; }]) {
    assert.throws(() => mapChanged(change), TypeError);
  }
});

test('Malformed record envelopes and unknown types are reported without dropping silently', () => {
  const result = mapChanged(input => input.records.push(null, {}, { recordType: 'CD_Account' }));
  assert.equal(result.accounts.length, 2);
  assert.ok(has(result, 'unsupported-record-type'));
  assert.ok(has(result, 'invalid-record-envelope'));
  assert.equal(result.quality, 'needs-review');
});

// MARK: - Waarden en opslagvormen
test('Zero differs from absent, strings, NaN and Infinity; missing balance never becomes zero', () => {
  assert.equal(mapChanged(input => put(input.records[0], 'CD_balance', 0)).accounts[0].balance, 0);
  for (const value of [null, undefined, '1200', NaN, Infinity]) {
    const result = mapChanged(input => put(input.records[0], 'CD_balance', value));
    assert.equal(result.accounts[0].balance, null);
    assert.equal(result.summary.excludedAccounts, 1);
    assert.equal(result.summary.balances.some(b => b.currency === 'EUR'), false);
    assert.equal(result.quality, 'needs-review');
  }
});

test('Unknown currencies and enum values are retained raw, not defaulted', () => {
  const result = mapChanged(input => {
    put(input.records[0], 'CD_currencyRaw', 'XYZ'); put(input.records[0], 'CD_kindRaw', 'future-kind');
    put(input.records[2], 'CD_outcomeRaw', 'future-outcome');
  });
  assert.equal(result.accounts[0].currencyRaw, 'XYZ');
  assert.equal(result.accounts[0].currency, null);
  assert.equal(result.accounts[0].kindRaw, 'future-kind');
  assert.equal(result.accounts[0].kind, null);
  assert.equal(result.trades[0].status, null);
  assert.equal(result.trades[0].rawResult, 'future-outcome');
  assert.equal(result.trades[0].currency, null);
  assert.equal(result.summary.unknownStatusTrades, 1);
});

test('An asset-backed required string remains unsupported, without fetching it or retaining its URL', () => {
  const result = mapChanged(input => {
    put(input.records[0], 'CD_name', '');
    put(input.records[0], 'CD_name_ckAsset', { downloadURL: 'https://example.invalid/private-asset' });
  });
  assert.equal(result.accounts[0].name, null);
  assert.ok(has(result, 'unsupported-field-storage'));
  assert.equal(JSON.stringify(result).includes('private-asset'), false);
});

test('Wrong declared field types and invalid boolean values are not coerced', () => {
  const result = mapChanged(input => {
    input.records[0].fields.CD_balance.type = 'STRING';
    put(input.records[0], 'CD_isFavorite', 'false');
    put(input.records[0], 'CD_isArchived', 2);
  });
  assert.equal(result.accounts[0].balance, null);
  assert.equal(result.accounts[0].favorite, null);
  assert.equal(result.accounts[0].archived, null);
  assert.ok(has(result, 'invalid-field-type'));
});

test('Status-result conflicts preserve source values and flag inconsistency', () => {
  const result = mapChanged(input => put(input.records[6], 'CD_statusRaw', 'open'));
  assert.equal(result.trades[4].status, 'open');
  assert.equal(result.trades[4].result, 'win');
  assert.equal(result.trades[4].outcomeConsistent, false);
  assert.ok(has(result, 'status-result-conflict'));
});

test('A genuine open trade allows absent close date and P&L', () => {
  const input = sample(); input.records.push(legacy('open-record', uuid(99), 'account-record-a', 'open', null));
  const result = mapSnapshot(input);
  assert.equal(result.quality, 'validated-input');
  assert.equal(result.summary.openTrades, 1);
  assert.equal(result.trades.at(-1).closedAt, null);
  assert.equal(result.trades.at(-1).profitLoss, null);
});

test('Millisecond timestamps preserve UTC across DST boundaries; zero is the Unix epoch', () => {
  const result = mapChanged(input => {
    put(input.records[0], 'CD_createdAt', 0);
    put(input.records[2], 'CD_createdAt', Date.parse('2026-10-25T01:30:00Z'));
    put(input.records[2], 'CD_closedAt', Date.parse('2026-10-25T02:30:00Z'));
  });
  assert.equal(result.accounts[0].createdAt, '1970-01-01T00:00:00.000Z');
  assert.equal(result.trades[0].startedAt, '2026-10-25T01:30:00.000Z');
  assert.equal(result.trades[0].closedAt, '2026-10-25T02:30:00.000Z');
});

test('Invalid and reversed dates produce review diagnostics', () => {
  for (const value of [Infinity, 9e15, 0.1, '2026-01-01']) {
    const result = mapChanged(input => put(input.records[0], 'CD_createdAt', value));
    assert.equal(result.accounts[0].createdAt, null);
    assert.equal(result.quality, 'needs-review');
  }
  assert.ok(has(mapChanged(input => put(input.records[2], 'CD_closedAt', 0)), 'date-order-conflict'));
});

test('Untrusted text remains literal data; unknown fields and internal payloads are omitted', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const result = mapChanged(input => {
    put(input.records[0], 'CD_name', payload);
    put(input.records[0], 'CD_moveReceipt', 'internal-payload');
    put(input.records[0], 'CD_secretFutureField', 'sensitive-payload');
  });
  assert.equal(result.accounts[0].name, payload);
  assert.equal(JSON.stringify(result).includes('internal-payload'), false);
  assert.equal(JSON.stringify(result).includes('sensitive-payload'), false);
});

test('Aggregate overflow is explicitly unknown instead of Infinity or zero', () => {
  const result = mapChanged(input => {
    put(input.records[0], 'CD_balance', Number.MAX_VALUE);
    input.records.push(account('huge', uuid(888), 'EUR', Number.MAX_VALUE));
  });
  assert.equal(result.summary.balances[0].balance, null);
  assert.ok(has(result, 'balance-total-overflow'));
});

test('A fresh mapping replaces input rather than retaining records from a prior run', () => {
  const input = sample(); const previous = mapSnapshot(input);
  input.records = input.records.filter(record => record.recordName !== 'legacy-a1');
  const next = mapSnapshot(input);
  assert.equal(previous.trades.length, 5);
  assert.equal(next.trades.length, 4);
  assert.notStrictEqual(previous.accounts[0], next.accounts[0]);
});
