import assert from 'node:assert/strict';
import test from 'node:test';
import { realizedR, summarizeStatistics, calculateStatistics } from '../../pulsefx/app/statistics.mjs';

// MARK: - Pariteit met native StatsCalculatorTests
// Comment NL: Uitsluitend fictieve records, inclusief native nul-fallback voor ontbrekende R.
const trade = (overrides = {}) => ({ key: 'trade', recordType: 'CD_OpenTrade', status: 'closed', result: 'win',
  direction: 'long', directionRaw: 'long', finalRR: 2, profitLoss: 200, lotSize: .1, currency: 'EUR',
  startedAt: '2026-09-01T00:00:00Z', accountKey: 'a', linkStatus: 'linked', outcomeConsistent: true, ...overrides });
const snapshot = trades => ({ collectionStatus: 'complete', accounts: [{ key: 'a', archived: false }, { key: 'b', archived: true }], trades });

test('native kerncijfers: break-even in de noemer, ontbrekende R als nul, valuta gescheiden', () => {
  const result = summarizeStatistics([
    trade(), trade({ result: 'loss', finalRR: -1, profitLoss: -100, lotSize: .2 }),
    trade({ result: 'breakEven', finalRR: 0, profitLoss: 0, lotSize: .3, currency: 'USD' }),
    trade({ finalRR: null, profitLoss: 50, lotSize: .4, currency: 'USD' }),
  ]);
  assert.equal(result.count, 4); assert.equal(result.winRate, .5);
  assert.equal(result.totalR, 1); assert.equal(result.averageR, .25);
  assert.equal(result.profitFactor, 2); assert.equal(result.averageLot, .25);
  assert.equal(result.missingR, 1);
  assert.deepEqual(result.plByCurrency, [{ currency: 'EUR', value: 100, count: 2 }, { currency: 'USD', value: 50, count: 2 }]);
});

test('legacy R gebruikt stop loss maal pip value maal lots, niet huidige accountbalans', () => {
  const legacy = trade({ recordType: 'CD_Trade', finalRR: 999, stopLossPips: 20, pipValue: 10, lotSize: .5, profitLoss: 250 });
  assert.equal(realizedR(legacy), 2.5);
  assert.equal(realizedR({ ...legacy, pipValue: null }), null);
  assert.equal(realizedR({ ...legacy, stopLossPips: 0 }), null);
});

test('moderne R gebruikt eerst finalRR en anders daadwerkelijke exit, nooit gepland target', () => {
  const priced = trade({ entryPrice: 100, stopLossPlacement: 90, actualExitPrice: 120 });
  assert.equal(realizedR({ ...priced, finalRR: 3 }), 3);
  assert.equal(realizedR({ ...priced, finalRR: 0 }), 0);
  assert.equal(realizedR({ ...priced, finalRR: null }), 2);
  assert.equal(realizedR({ ...priced, finalRR: null, actualExitPrice: null, profitPrice: 120 }), null);
  assert.equal(realizedR({ ...priced, finalRR: null, direction: 'short' }), -2);
});

test('onbekende richting en negatieve break-even volgen de native berekening', () => {
  assert.equal(realizedR(trade({ direction: null, directionRaw: 'none', finalRR: null, entryPrice: 100, stopLossPlacement: 90, actualExitPrice: 95, result: 'loss' })), -.5);
  assert.equal(realizedR(trade({ result: 'breakEven', finalRR: -.1 })), -.1);
  assert.equal(realizedR(trade({ status: 'open' })), null);
});

test('alleen gekoppelde gesloten trades van actieve accounts met consistente uitkomst', () => {
  const result = calculateStatistics(snapshot([
    trade(), trade({ key: 'open', status: 'open' }), trade({ key: 'unlinked', accountKey: null, linkStatus: 'unlinked' }),
    trade({ key: 'archived', accountKey: 'b' }), trade({ key: 'conflict', outcomeConsistent: false }),
    trade({ key: 'bad-date', startedAt: null }),
  ]));
  assert.equal(result.summary.count, 1);
  assert.deepEqual(result.excluded, { unlinked: 1, inactiveAccount: 1, invalidOutcome: 1, invalidDate: 1 });
});

test('periode gebruikt openingsdatum en exclusieve eindgrens', () => {
  const result = calculateStatistics(snapshot([
    trade({ key: 'august', startedAt: '2026-08-31T23:59:59Z', closedAt: '2026-09-02T12:00:00Z' }),
    trade({ key: 'september', startedAt: '2026-09-01T00:00:00Z' }),
    trade({ key: 'october', startedAt: '2026-10-01T00:00:00Z' }),
  ]), { start: '2026-09-01', end: '2026-10-01' });
  assert.deepEqual(result.records.map(t => t.key), ['september']);
  assert.throws(() => calculateStatistics(snapshot([]), { start: 'invalid' }), RangeError);
});

test('groepering en cumulatieve R bevatten geen optelling van valuta', () => {
  const result = calculateStatistics(snapshot([trade({ key: 'first', instrument: 'EURUSD' }), trade({ key: 'second', finalRR: -1, result: 'loss', instrument: 'USDJPY', startedAt: '2026-09-02T00:00:00Z' })]));
  assert.deepEqual(result.timeline.map(t => t.cumulativeR), [2, 1]);
  assert.equal(result.byInstrument.length, 2);
  assert.equal(calculateStatistics(snapshot([trade({ instrument: 'EURUSD' })]), { instrument: 'USDJPY' }).summary.count, 0);
});

test('onvolledige snapshot geeft geen statistieken; lege selectie geeft geen verzonnen winst', () => {
  assert.deepEqual(calculateStatistics({ collectionStatus: 'partial' }), { available: false, reason: 'incomplete-snapshot' });
  assert.equal(summarizeStatistics([]).winRate, null);
  assert.equal(summarizeStatistics([trade()]).profitFactor, Infinity);
  assert.equal(summarizeStatistics([trade({ finalRR: 0 })]).profitFactor, 0);
});

test('numerieke overflow wordt geen nulwinst of oneindig geldbedrag', () => {
  const result = summarizeStatistics([trade({ finalRR: Number.MAX_VALUE, profitLoss: Number.MAX_VALUE }), trade({ finalRR: Number.MAX_VALUE, profitLoss: Number.MAX_VALUE })]);
  assert.equal(result.totalR, null); assert.equal(result.averageR, null);
  assert.equal(result.profitFactor, null); assert.equal(result.plByCurrency[0].value, null);
});

test('drawdown and timing use UTC opening order, with a zero starting peak', () => {
  const result = calculateStatistics(snapshot([
    trade({ key: 'a', startedAt: '2026-09-01T23:30:00Z', finalRR: -2, result: 'loss' }),
    trade({ key: 'b', startedAt: '2026-09-02T00:30:00Z', finalRR: 3 }),
    trade({ key: 'c', startedAt: '2026-10-01T09:30:00Z', finalRR: -4, result: 'loss' }),
  ]));
  assert.equal(result.maximumDrawdownR, 4);
  assert.deepEqual(result.byMonth.map(v => [v.key, v.totalR]), [['2026-09', 1], ['2026-10', -4]]);
  assert.deepEqual(result.byHour.map(v => v.key), ['00:00', '09:00', '23:00']);
  assert.deepEqual(result.byWeekday.map(v => v.key), ['Tuesday', 'Wednesday', 'Thursday']);
});
