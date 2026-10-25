import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSnapshot } from '../../pulsefx/icloud/mapper.mjs';
import { createReader, DESIRED_KEYS } from '../../pulsefx/icloud/reader.mjs';
import { planClose, closeDemo, commitClose, closeTransport } from '../../pulsefx/icloud/close-trade.mjs';
import { sample, modern, uuid, zone, context, fields } from './fixtures.mjs';
const fixture = () => {
  const input = sample(), trade = modern('close-test', uuid(22));
  Object.assign(trade.fields, fields({ CD_statusRaw: 'open', CD_resultRaw: 'open', CD_closedAt: null, CD_profitLoss: null }));
  input.records.push(trade); input.records.forEach((r, i) => r.recordChangeTag = `tag${i}`);
  return mapSnapshot(input);
};
const input = { result: 'win', profitLoss: '100', closedAt: '2026-01-12T11:00:00Z', finalRR: '2' };
const plan = () => { const s = fixture(); return planClose(s, s.trades.at(-1).key, input); };
test('notes map plain text and pre/post notes independently, without retaining rich data or assets', () => {
  const data = sample(); data.records.push({ recordType: 'CD_TradeNote', recordName: 'note', zoneID: zone, fields: fields({ CD_id: uuid(80), CD_title: '<img src=x onerror=alert(1)>', CD_body: 'A\nB', CD_accountID: uuid(2), CD_createdAt: Date.now(), CD_richBodyData: 'private-rtf' }) });
  data.records.at(-2).fields.CD_preTradeNotes = { value: 'Before' };
  const mapped = mapSnapshot(data); assert.equal(mapped.notes.length, 1); assert.equal(mapped.trades.length, 5); assert.equal(mapped.notes[0].body, 'A\nB');
  assert.equal(mapped.notes[0].accountKey, mapped.accounts[1].key); assert.equal(JSON.stringify(mapped).includes('private-rtf'), false); assert.equal(mapped.trades.at(-1).preTradeNotes, 'Before');
  data.records.at(-1).fields.CD_body = { value: '' }; data.records.at(-1).fields.CD_body_ckAsset = { value: { downloadURL: 'private-url' } };
  assert.equal(mapSnapshot(data).notes[0].body, null); assert.equal(JSON.stringify(mapSnapshot(data)).includes('private-url'), false);
});
test('a notes query failure is reported separately without invalidating complete account/trade statistics', async () => {
  const db = { performQuery: async q => { if (q.recordType === 'CD_TradeNote') throw { serverErrorCode: 'BAD_REQUEST' }; return { hasErrors: false, records: sample().records.filter(r => r.recordType === q.recordType), moreComing: false }; } };
  const snapshot = await createReader({ database: db, context, includeNotes: true }).read({ zone, requestZone: zone });
  assert.equal(snapshot.collectionStatus, 'complete'); assert.equal(snapshot.notesStatus, 'partial'); assert.equal(snapshot.failures[0].type, 'CD_TradeNote');
  assert.ok(DESIRED_KEYS.CD_TradeNote.includes('CD_body_ckAsset')); assert.ok(!DESIRED_KEYS.CD_TradeNote.includes('CD_richBodyData'));
});
test('close updates trade and balance together, preserves unrelated fields and applies P&L once', () => {
  const snapshot = fixture(), p = planClose(snapshot, snapshot.trades.at(-1).key, input), updated = closeDemo(snapshot, p);
  assert.equal(p.records.length, 2); assert.equal(p.balance, 2400); assert.equal(updated.accounts[1].balance, 2400); assert.equal(snapshot.accounts[1].balance, 2300);
  assert.equal(updated.trades.at(-1).status, 'closed'); assert.equal(updated.trades.at(-1).lotSize, .1);
  assert.throws(() => planClose(updated, p.trade.key, input), /no longer open/);
  assert.equal(p.records[0].fields.CD_resultRaw.value, 'win'); assert.deepEqual(Object.keys(p.records[1].fields), ['CD_balance']);
});
test('closing refuses stale/partial, missing links, archived accounts, legacy trades and malformed values', () => {
  const s = fixture(), key = s.trades.at(-1).key;
  for (const profitLoss of ['', 'NaN', '1e309', '10 USD', '1,000']) assert.throws(() => planClose(s, key, { ...input, profitLoss }));
  for (const patch of [{ stale: true }, { collectionStatus: 'partial' }]) assert.throws(() => planClose({ ...s, ...patch }, key, input));
  assert.throws(() => planClose(s, s.trades[0].key, input), /legacy/);
  s.accounts[1].archived = true; assert.throws(() => planClose(s, key, input), /active account/);
  s.accounts[1].archived = false; s.trades.at(-1).linkStatus = 'ambiguous'; assert.throws(() => planClose(s, key, input), /unambiguous/);
});
test('break-even can include costs as native app does; date and R are validated', () => {
  const s = fixture(), key = s.trades.at(-1).key;
  assert.equal(planClose(s, key, { ...input, result: 'breakEven', profitLoss: '-2' }).balance, 2298);
  assert.throws(() => planClose(s, key, { ...input, closedAt: '2020-01-01T00:00:00Z' }));
  assert.throws(() => planClose(s, key, { ...input, finalRR: 'invalid' }));
});
test('pilot writer requires the allowlisted trade and both change tags, uses atomic update, never force or replace', async () => {
  const p = plan(); let calls = 0;
  const database = { newRecordsBatch(options) { assert.equal(options.atomic, true); assert.deepEqual(options.zoneID, zone); return { update(records) { assert.deepEqual(records, p.records); return this; }, async commit() { calls++; return { records: p.records }; } }; } };
  const transport = { arm() {}, disarm() {} };
  await assert.rejects(commitClose({ plan: p, config: {}, database, selected: { requestZone: zone }, transport })); assert.equal(calls, 0);
  await commitClose({ plan: p, config: { closeTradePilotId: p.trade.id }, database, selected: { requestZone: zone }, transport }); assert.equal(calls, 1);
  p.records[1].recordChangeTag = null;
  await assert.rejects(commitClose({ plan: p, config: { closeTradePilotId: p.trade.id }, database, selected: { requestZone: zone }, transport })); assert.equal(calls, 1);
});
test('network guard consumes one exact atomic permit and rejects changed fields, zones, force writes and replays', async () => {
  const p = plan(), config = { containerIdentifier: 'iCloud.PulseOS.FX', environment: 'development', closeTradePilotId: p.trade.id }; let requests = 0;
  const t = closeTransport(config, async () => { requests++; return {}; });
  const url = 'https://api.apple-cloudkit.com/database/1/iCloud.PulseOS.FX/development/private/records/modify';
  const body = { zoneID: zone, atomic: true, operations: p.records.map(record => ({ operationType: 'update', record })) };
  const send = b => t.fetch(url, { method: 'POST', body: JSON.stringify(b) });
  await assert.rejects(send(body)); t.arm(p, zone); await send(body); assert.equal(requests, 1); await assert.rejects(send(body));
  for (const mutate of [b => b.atomic = false, b => b.zoneID.zoneName = 'other', b => b.operations[0].operationType = 'forceUpdate', b => b.operations[1].record.fields.CD_balance.value = 0]) {
    const changed = structuredClone(body); mutate(changed); t.arm(p, zone); await assert.rejects(send(changed));
  } assert.equal(requests, 1);
});
test('unknown/failed commit never triggers an automatic retry', async () => {
  const p = plan(); let calls = 0;
  const database = { newRecordsBatch() { return { update() { return this; }, async commit() { calls++; throw new Error('private SDK detail'); } }; } };
  await assert.rejects(commitClose({ plan: p, config: { closeTradePilotId: p.trade.id }, database, selected: { requestZone: zone }, transport: { arm() {}, disarm() {} } }), /Close not confirmed/); assert.equal(calls, 1);
});

test('duplicate trade identity cannot be used to select a write target', () => {
  const s = fixture(), t = s.trades.at(-1); s.trades.push({ ...t, key: 'duplicate-record', recordName: 'duplicate-record' });
  assert.throws(() => planClose(s, t.key, input), /duplicate identity/);
});
