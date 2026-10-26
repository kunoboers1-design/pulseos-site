import test from 'node:test';
import assert from 'node:assert/strict';
import { noteRows } from '../../pulsefx/icloud/notes-view.mjs';
const zone = { zoneName: 'native', ownerRecordName: 'user' };
const trade = { key: 't', id: 'id', zone, instrument: 'EURUSD', accountKey: 'a', recordType: 'CD_OpenTrade', preTradeNotes: 'Before', postTradeNotes: '', startedAt: '2026-01-01' };
const note = { key: 'n', tradeId: 'id', zone, title: 'Review', body: 'Text', createdAt: '2026-01-02' };
test('notes resolve a unique same-zone trade and preserve pre-trade text', () => {
  const rows = noteRows({ trades: [trade], notes: [note] });
  assert.equal(rows[0].trade, trade); assert.equal(rows[0].accountKey, 'a');
  assert.equal(rows[1].trade, trade); assert.equal(rows[1].body, 'Before');
});
test('missing, cross-zone and duplicate links never invent a trade', () => {
  for (const trades of [[], [{ ...trade, zone: { ...zone, ownerRecordName: 'other' } }], [trade, { ...trade, key: 'duplicate' }]]) {
    const row = noteRows({ trades, notes: [note] }).find(r => r.key === 'n');
    assert.equal(row.trade, null); assert.match(row.linkLabel, /unavailable or ambiguous/);
  }
});
test('unavailable text stays unavailable and standalone notes stay standalone', () => {
  const row = noteRows({ trades: [], notes: [{ ...note, tradeId: null, body: null }] })[0];
  assert.equal(row.body, null); assert.equal(row.linkLabel, 'Standalone note');
  assert.deepEqual(noteRows(null), []);
});
