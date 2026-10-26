import test from 'node:test';
import assert from 'node:assert/strict';
import { planNote, demoNote, commitNote } from '../../pulsefx/icloud/note-write.mjs';
import { closeTransport } from '../../pulsefx/icloud/close-trade.mjs';
const zone = { zoneName: 'com.apple.coredata.cloudkit.zone', ownerRecordName: 'user' };
const id = '12345678-1234-4234-8234-123456789abc';
const note = { key: 'note', id: 'existing', recordName: 'original-record', recordChangeTag: 'original-version', zone, title: 'Original', body: 'Text', hasRichText: false };
const fixture = () => ({ collectionStatus: 'complete', notesStatus: 'complete', notes: [{ ...note }], accounts: [], trades: [] });
const input = { title: 'Review', body: 'New text' };
const config = { containerIdentifier: 'iCloud.PulseOS.FX', environment: 'production', noteEditingEnabled: true };
test('new notes get stable native-compatible identity and no unrelated records', () => {
  const plan = planNote(fixture(), null, input, zone, id, 1700000000000);
  assert.equal(plan.operation, 'create'); assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0].recordName, `CD_TradeNote_${id.toUpperCase()}`);
  assert.equal(plan.records[0].fields.CD_entityName.value, 'TradeNote');
  assert.equal(plan.records[0].fields.CD_createdAt.value, 1700000000000);
  assert.equal(plan.records[0].recordChangeTag, undefined);
  const result = demoNote(fixture(), plan); assert.equal(result.notes.length, 2); assert.equal(result.notes[0].body, input.body);
});
test('updates preserve identity, links, dates and photos; only changed text is sent', () => {
  const s = fixture(); const plan = planNote(s, 'note', { title: 'Changed', body: 'Text' }, zone);
  assert.equal(plan.operation, 'update'); assert.equal(plan.records[0].recordChangeTag, 'original-version');
  assert.deepEqual(Object.keys(plan.records[0].fields), ['CD_title']);
  assert.equal(demoNote(s, plan).notes[0].title, 'Changed'); assert.equal(s.notes[0].title, 'Original');
});
test('rich text is preserved on title changes and requires explicit conversion for body changes', () => {
  const s = fixture(); s.notes[0].hasRichText = true;
  const titleOnly = planNote(s, 'note', { title: 'Changed', body: 'Text' }, zone);
  assert.deepEqual(Object.keys(titleOnly.records[0].fields), ['CD_title']);
  assert.throws(() => planNote(s, 'note', input, zone), /Confirm/);
  const converted = planNote(s, 'note', { ...input, replaceFormatting: true }, zone);
  assert.equal(converted.records[0].fields.CD_richBodyData.value, null);
  assert.equal(converted.records[0].fields.CD_richBodyData_ckAsset.value, null);
});
test('rejects incomplete reads, invalid text, duplicate identities and unsupported text storage', () => {
  const s = fixture();
  for (const patch of [{ stale: true }, { notesStatus: 'partial' }, { collectionStatus: 'partial' }]) assert.throws(() => planNote({ ...s, ...patch }, null, input, zone, id));
  for (const body of [null, 'a'.repeat(10001)]) assert.throws(() => planNote(s, null, { ...input, body }, zone, id));
  assert.throws(() => planNote(s, null, { ...input, title: ' ' }, zone, id));
  assert.throws(() => planNote(s, null, input, { ...zone, zoneName: '_defaultZone' }, id));
  s.notes[0].blockedEditFields = ['CD_body']; assert.throws(() => planNote(s, 'note', input, zone), /unavailable/);
  s.notes.push({ ...note, key: 'duplicate' }); assert.throws(() => planNote(s, 'note', input, zone), /ambiguous/);
});
test('new note link must match its trade account and zone', () => {
  const s = fixture(); s.accounts = [{ key: 'a', id, name: 'Account', currency: 'USD', zone }];
  s.trades = [{ key: 't', id: 'trade-id', accountKey: 'a', zone, instrument: 'EURUSD', result: 'open', lotSize: 1 }];
  const plan = planNote(s, null, { ...input, tradeKey: 't' }, zone, id);
  assert.equal(plan.records[0].fields.CD_accountID.value, id.toUpperCase());
  assert.equal(plan.records[0].fields.CD_outcomeRaw.value, 'OPEN');
  assert.throws(() => planNote(s, null, { ...input, tradeKey: 't', accountKey: 'wrong' }, zone, id));
});
test('one-shot guard accepts exact create/update only, blocks deletion and field injection', async () => {
  let calls = 0; const transport = closeTransport(config, async () => { calls++; return {}; });
  for (const key of [null, 'note']) {
    const plan = planNote(fixture(), key, input, zone, id);
    const body = { atomic: true, zoneID: zone, operations: plan.records.map(record => ({ operationType: plan.operation, record })) };
    const send = b => transport.fetch('https://api.apple-cloudkit.com/database/1/iCloud.PulseOS.FX/production/private/records/modify', { method: 'POST', body: JSON.stringify(b) });
    transport.armNote(plan, zone); await send(body); await assert.rejects(send(body));
    for (const mutate of [b => b.operations[0].operationType = 'delete', b => b.operations[0].record.fields.CD_photos = { value: null }, b => b.operations[0].record.recordName = 'other']) {
      const changed = structuredClone(body); mutate(changed); transport.armNote(plan, zone); await assert.rejects(send(changed));
    }
  }
  assert.equal(calls, 2);
});
test('writer checks enablement and versions; unknown save is not retried', async () => {
  const plan = planNote(fixture(), 'note', input, zone); let calls = 0;
  const database = { newRecordsBatch(opts) { assert.equal(opts.atomic, true); return { update() { return this; }, async commit() { calls++; throw new Error('conflict'); } }; } };
  const args = { plan, config, database, selected: { requestZone: zone }, transport: { armNote() {}, disarm() {} } };
  await assert.rejects(commitNote({ ...args, config: {} })); assert.equal(calls, 0);
  await assert.rejects(commitNote(args), /Save not confirmed/); assert.equal(calls, 1);
  plan.records[0].recordChangeTag = null; await assert.rejects(commitNote(args)); assert.equal(calls, 1);
});
