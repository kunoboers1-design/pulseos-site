// MARK: - Gedeelde statistiekregels
// Comment NL: Volgt StatsCalculator.swift en OpenTrade.effectiveRR van de native app.
// Comment NL: Alleen waardes uit een snapshot; geen netwerk, opslag of Premium-toekenning.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const total = values => {
  const value = values.reduce((sum, item) => sum + item, 0);
  return Number.isFinite(value) ? value : null;
};
const average = values => {
  const sum = total(values);
  return values.length && sum !== null ? sum / values.length : null;
};

export function realizedR(trade) {
  if (trade.status !== 'closed') return null;
  if (trade.recordType === 'CD_Trade') {
    if (![trade.stopLossPips, trade.pipValue, trade.lotSize, trade.profitLoss].every(finite)) return null;
    const risk = Math.max(0, trade.stopLossPips * trade.pipValue * trade.lotSize);
    const result = risk > 0 ? trade.profitLoss / risk : null;
    return finite(result) ? result : null;
  }
  if (finite(trade.finalRR)) return trade.finalRR;
  if (![trade.entryPrice, trade.stopLossPlacement, trade.actualExitPrice].every(finite)) return null;
  const risk = Math.abs(trade.entryPrice - trade.stopLossPlacement);
  if (!(risk > 0)) return null;
  let result;
  if (trade.direction === 'long') result = (trade.actualExitPrice - trade.entryPrice) / risk;
  else if (trade.direction === 'short') result = (trade.entryPrice - trade.actualExitPrice) / risk;
  else if (trade.directionRaw === 'none') {
    const magnitude = Math.abs(trade.actualExitPrice - trade.entryPrice) / risk;
    if (trade.result === 'win') result = magnitude;
    else if (trade.result === 'loss') result = -magnitude;
  }
  return finite(result) ? result : null;
}

// MARK: - Kerncijfers
export function summarizeStatistics(records) {
  if (!records.length) return { count: 0, wins: 0, losses: 0, breakEvens: 0, winRate: null,
    totalR: null, averageR: null, profitFactor: null, bestR: null, worstR: null,
    averageLot: null, missingR: 0, missingPL: 0, plByCurrency: [] };
  const rValues = records.map(trade => realizedR(trade));
  // Comment NL: De native calculator telt ontbrekende R als nul. Het aantal blijft expliciet zichtbaar.
  const nativeR = rValues.map(value => value ?? 0);
  const gains = total(nativeR.filter(value => value > 0));
  const negative = total(nativeR.filter(value => value < 0));
  const losses = negative === null ? null : Math.abs(negative);
  const currencies = new Map();
  for (const record of records) {
    if (!finite(record.profitLoss) || !record.currency) continue;
    const values = currencies.get(record.currency) || [];
    values.push(record.profitLoss); currencies.set(record.currency, values);
  }
  const wins = records.filter(trade => trade.result === 'win').length;
  return {
    count: records.length, wins,
    losses: records.filter(trade => trade.result === 'loss').length,
    breakEvens: records.filter(trade => trade.result === 'breakEven').length,
    winRate: wins / records.length,
    totalR: total(nativeR), averageR: average(nativeR),
    profitFactor: gains === null || !finite(losses) ? null : losses > 0 ? (finite(gains / losses) ? gains / losses : null) : gains > 0 ? Infinity : 0,
    bestR: Math.max(...nativeR), worstR: Math.min(...nativeR),
    averageLot: average(records.map(trade => trade.lotSize).filter(value => finite(value) && value >= 0)),
    missingR: rValues.filter(value => value === null).length,
    missingPL: records.filter(record => !finite(record.profitLoss) || !record.currency).length,
    plByCurrency: [...currencies].sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, values]) => ({ currency, value: total(values), count: values.length })),
  };
}

// MARK: - Snapshotselectie en groepering
export function calculateStatistics(snapshot, { accountKey = 'all', instrument = 'all', outcome = 'all', start = null, end = null } = {}) {
  if (snapshot.collectionStatus !== 'complete') return { available: false, reason: 'incomplete-snapshot' };
  const startTime = start === null ? -Infinity : Date.parse(start);
  const endTime = end === null ? Infinity : Date.parse(end);
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || startTime >= endTime) throw new RangeError('Invalid statistics period');
  const accounts = new Map(snapshot.accounts.filter(account => account.archived === false).map(account => [account.key, account]));
  const excluded = { unlinked: 0, inactiveAccount: 0, invalidOutcome: 0, invalidDate: 0 };
  const eligible = snapshot.trades.filter(trade => {
    if (trade.status !== 'closed') return false;
    if (trade.linkStatus !== 'linked' || !trade.accountKey) { excluded.unlinked++; return false; }
    if (!accounts.has(trade.accountKey)) { excluded.inactiveAccount++; return false; }
    if (!trade.outcomeConsistent || !['win', 'loss', 'breakEven'].includes(trade.result)) { excluded.invalidOutcome++; return false; }
    if (!trade.startedAt || !finite(Date.parse(trade.startedAt))) { excluded.invalidDate++; return false; }
    return true;
  });
  const records = eligible.filter(trade => {
    const date = Date.parse(trade.startedAt);
    return date >= startTime && date < endTime && (accountKey === 'all' || trade.accountKey === accountKey)
      && (instrument === 'all' || trade.instrument === instrument) && (outcome === 'all' || trade.result === outcome);
  }).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.key.localeCompare(b.key));
  const group = key => {
    const groups = new Map();
    for (const trade of records) { const value = key(trade); if (!groups.has(value)) groups.set(value, []); groups.get(value).push(trade); }
    return [...groups].map(([key, values]) => ({ key, ...summarizeStatistics(values) }));
  };
  let cumulative = 0;
  const timeline = group(trade => trade.startedAt.slice(0, 10)).map(day => {
    cumulative = cumulative === null || day.totalR === null ? null : total([cumulative, day.totalR]);
    return { ...day, cumulativeR: cumulative };
  });
  let peak = 0, drawdown = 0, running = 0;
  for (const trade of records) {
    running = running === null ? null : total([running, realizedR(trade) ?? 0]);
    if (running === null) { drawdown = null; break; }
    peak = Math.max(peak, running);
    const distance = peak - running;
    if (!finite(distance)) { drawdown = null; break; }
    drawdown = Math.max(drawdown, distance);
  }
  return { available: true, records, maximumDrawdownR: drawdown, summary: summarizeStatistics(records), excluded,
    byMonth: group(trade => trade.startedAt.slice(0, 7)),
    byWeekday: group(trade => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(trade.startedAt).getUTCDay()]),
    byHour: group(trade => `${String(new Date(trade.startedAt).getUTCHours()).padStart(2, '0')}:00`).sort((a, b) => a.key.localeCompare(b.key)),
    byAccount: group(trade => trade.accountKey), byInstrument: group(trade => trade.instrument || 'Unknown instrument'), timeline,
    basis: 'opened-date-utc', activeAccounts: accounts.size };
}
