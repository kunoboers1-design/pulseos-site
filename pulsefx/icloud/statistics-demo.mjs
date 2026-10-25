// MARK: - Fictieve statistiekgegevens
// Comment NL: Dit is een afzonderlijke previewdataset en wordt nooit als iCloud-data weergegeven.
export function statisticsDemo() {
  const accounts = [{ key: 'a0', name: 'Atlas Funded', currency: 'USD', startBalance: 25000, archived: false }, { key: 'a1', name: 'Orion Evaluation', currency: 'EUR', startBalance: 10000, archived: false }];
  const outcomes = [1.8, -1, 2.4, 0, -1, 1.2, 3, -.5, 1.5, -1, 2.1, .8];
  const trades = Array.from({ length: 48 }, (_, index) => {
    const r = outcomes[index % outcomes.length], account = accounts[index % 2];
    return { key: `t${index}`, recordType: 'CD_OpenTrade', accountKey: account.key, linkStatus: 'linked',
      instrument: ['EURUSD', 'GBPUSD', 'USDJPY'][index % 3], status: 'closed', result: r > 0 ? 'win' : r < 0 ? 'loss' : 'breakEven',
      outcomeConsistent: true, direction: 'long', directionRaw: 'long', finalRR: r,
      lotSize: .2 + (index % 3) * .1, profitLoss: r * 100, currency: account.currency,
      startedAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(index / 2), 9 + index % 2)).toISOString(),
      sessionRaw: ['london', 'newYork', 'tokyo'][index % 3], sessionCustom: '', targetRR: 2,
      setupsSelectedRaw: ['Breakout,Retest','Trend continuation','Reversal'][index % 3], setupTag: '',
      mistakesSelectedRaw: r < 0 ? 'Early entry' : 'None', mistakeTag: '', emotionalStateRaw: index % 4 ? 'calm' : 'fomo', emotionCustom: '',
      tradeTypeRaw: ['trend','range','reversal'][index % 3], confluences: 1 + index % 4, slMoved: index % 4 === 0,
      breakEvenHitRaw: index % 6 === 0 ? 'tpAfterBE' : index % 7 === 0 ? 'slAfterBE' : 'none', weekendHoldRaw: 'none',
      preTradeNotes: index % 2 ? 'Wait for confirmation.' : '', postTradeNotes: '',
      stopLossPips: null, pipValue: null, entryPrice: null, stopLossPlacement: null, actualExitPrice: null };
  });
  return { collectionStatus: 'complete', accounts, trades };
}
