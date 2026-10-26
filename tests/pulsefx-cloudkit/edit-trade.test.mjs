import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSnapshot } from '../../pulsefx/icloud/mapper.mjs';
import { planEdit, commitEdit, applyDemoEdit } from '../../pulsefx/icloud/edit-trade.mjs';
import { closeTransport } from '../../pulsefx/icloud/close-trade.mjs';
import { sample, modern, fields, uuid, zone } from './fixtures.mjs';
function fixture() {
  const input = sample(), record = modern('edit-trade', uuid(99));
  Object.assign(record.fields, fields({ CD_statusRaw: 'open', CD_resultRaw: 'open', CD_closedAt: null, CD_profitLoss: null, CD_preTradeNotes: 'Original', CD_entryPrice: 1.1, CD_stopLossPlacement: 1.09 }));
  record.recordChangeTag = 'original-version'; input.records.push(record);
  return mapSnapshot(input);
}
const config = { containerIdentifier: 'iCloud.PulseOS.FX', environment: 'production', tradeEditingEnabled: true };
const url = 'https://api.apple-cloudkit.com/database/1/iCloud.PulseOS.FX/production/private/records/modify';
test('edit writes only changed fields and keeps balances/status intact', () => {
  const s = fixture(), t = s.trades.at(-1);
  const p = planEdit(s, t.key, { preTradeNotes: '<script>text only</script>', entryPrice: '1.12', slMoved: false });
  assert.deepEqual(Object.keys(p.records[0].fields), ['CD_preTradeNotes', 'CD_entryPrice', 'CD_slMoved']);
  assert.equal(p.records[0].recordChangeTag, 'original-version');
  const result = applyDemoEdit(s, p);
  assert.equal(result.trades.at(-1).preTradeNotes, '<script>text only</script>');
  assert.equal(s.trades.at(-1).preTradeNotes, 'Original');
  assert.deepEqual(result.accounts, s.accounts); assert.equal(result.trades.at(-1).status, 'open');
});
test('validates prices, enums, account references, range and immutable fields', () => {
  const s = fixture(), key = s.trades.at(-1).key;
  for (const changes of [{ profitLoss: '10' }, { status: 'closed' }, { entryPrice: 'NaN' }, { entryPrice: '-1' }, { lotSize: '' }, { riskPercent: '101' }, { confluences: '1.5' }, { directionRaw: 'buy' }, { accountReference: 'unknown' }, { preTradeNotes: 'a'.repeat(10001) }, { slMoved: 'false' }, { entryPrice: '1.09' }]) assert.throws(() => planEdit(s, key, changes));
  assert.throws(() => planEdit({ ...s, stale: true }, key, { entryPrice: '2' }));
  assert.throws(() => planEdit({ ...s, collectionStatus: 'partial' }, key, { entryPrice: '2' }));
  assert.throws(() => planEdit(s, key, { entryPrice: '1.1' }), /No changes/);
  assert.throws(() => planEdit(s, key, { finalRR: '' }), /No changes/);
});
test('nullable fields can be cleared, false and zero remain explicit values', () => {
  const s = fixture(), key = s.trades.at(-1).key;
  const p = planEdit(s, key, { entryPrice: '', slMoved: false, confluences: '0' });
  assert.equal(p.records[0].fields.CD_entryPrice.value, null);
  assert.equal(p.records[0].fields.CD_slMoved.value, 0);
  assert.equal(p.records[0].fields.CD_confluences.value, 0);
});
test('unsupported assets and invalid mapped fields are not overwritten', () => {
  const input = sample(), r = modern('asset', uuid(99));
  Object.assign(r.fields, fields({ CD_statusRaw: 'open', CD_resultRaw: 'open', CD_entryPrice: 'invalid', CD_preTradeNotes: '' }));
  r.fields.CD_preTradeNotes_ckAsset = { value: { downloadURL: 'private' } }; input.records.push(r);
  const s = mapSnapshot(input), t = s.trades.at(-1);
  assert.throws(() => planEdit(s, t.key, { preTradeNotes: 'replacement' }), /unsupported/);
  assert.throws(() => planEdit(s, t.key, { entryPrice: '1.2' }), /unsupported/);
  assert.equal(JSON.stringify(s).includes('downloadURL'), false);
});
test('account changes are limited to one active same-zone account; duplicates rejected', () => {
  const s = fixture(), t = s.trades.at(-1);
  const p = planEdit(s, t.key, { accountReference: s.accounts[0].id });
  assert.equal(p.records[0].fields.CD_linkedAccountId.value, s.accounts[0].id);
  assert.equal(applyDemoEdit(s, p).trades.at(-1).accountKey, s.accounts[0].key);
  s.accounts.push({ ...s.accounts[0] }); assert.throws(() => planEdit(s, t.key, { accountReference: s.accounts[0].id }));
  s.trades.push({ ...t, key: 'duplicate' }); assert.throws(() => planEdit(s, t.key, { entryPrice: '2' }));
});
test('writer uses one versioned update and refuses disabled or unversioned writes', async () => {
  const s = fixture(), plan = planEdit(s, s.trades.at(-1).key, { entryPrice: '1.2' }); let calls = 0;
  const database = { newRecordsBatch(opts) { assert.equal(opts.atomic, true); return { update(records) { assert.deepEqual(records, plan.records); return this; }, async commit() { calls++; return { records: plan.records }; } }; } };
  const transport = { armEdit() {}, disarm() {} };
  const args = { plan, config, database, transport, selected: { requestZone: zone } };
  await commitEdit(args); assert.equal(calls, 1);
  await assert.rejects(commitEdit({ ...args, config: {} }));
  plan.records[0].recordChangeTag = null; await assert.rejects(commitEdit(args)); assert.equal(calls, 1);
});
test('transport allows only the exact one-shot edit, rejects forced updates and replays', async () => {
  const s = fixture(), plan = planEdit(s, s.trades.at(-1).key, { entryPrice: '1.2' }); let calls = 0;
  const transport = closeTransport(config, async () => { calls++; return {}; });
  const body = { atomic: true, zoneID: zone, operations: plan.records.map(record => ({ operationType: 'update', record })) };
  const send = b => transport.fetch(url, { method: 'POST', body: JSON.stringify(b) });
  await assert.rejects(send(body)); transport.armEdit(plan, zone); await send(body); await assert.rejects(send(body)); assert.equal(calls, 1);
  for (const mutate of [b => b.operations[0].operationType = 'forceUpdate', b => b.operations[0].record.fields.CD_profitLoss = { value: 123 }, b => b.operations[0].record.recordChangeTag = 'newer', b => b.zoneID.zoneName = 'other']) {
    const changed = structuredClone(body); mutate(changed); transport.armEdit(plan, zone); await assert.rejects(send(changed));
  }
  assert.equal(calls, 1);
});
test('conflicts or unknown responses are never retried automatically', async () => {
  const s = fixture(), plan = planEdit(s, s.trades.at(-1).key, { entryPrice: '1.2' }); let calls = 0;
  const database = { newRecordsBatch() { return { update() { return this; }, async commit() { calls++; return { hasErrors: true, errors: [{ serverErrorCode: 'CONFLICT' }] }; } }; } };
  await assert.rejects(commitEdit({ plan, config, database, selected: { requestZone: zone }, transport: { armEdit() {}, disarm() {} } }), /Save not confirmed/); assert.equal(calls, 1);
});
