import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeSummary } from '../../pulsefx/icloud/trade-summary.mjs';
test('Open summary keeps balance unchanged and requires closing inputs', () => {
  const s = tradeSummary({status:'open', profitLoss:300}, {balance:1000,currency:'EUR'});
  assert.deepEqual([s.before,s.pnl,s.after], [1000,0,1000]);
  assert.deepEqual(s.missing, ['Result','P/L']);
});
test('Closed summary reverses result rather than adding it twice', () => {
  for (const pnl of [300,-100,0]) {
    const s = tradeSummary({status:'closed',profitLoss:pnl}, {balance:1000,currency:'EUR'});
    assert.equal(s.before,1000-pnl); assert.equal(s.after,1000);
  }
});
test('Unavailable balance or result never becomes a fabricated zero balance', () => {
  assert.equal(tradeSummary({status:'open'},null).before,null);
  assert.equal(tradeSummary({status:'closed'}, {balance:1000,currency:'EUR'}).after,null);
});
