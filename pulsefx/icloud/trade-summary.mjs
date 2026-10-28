// MARK: - Native saldovoorbeeld
// Comment NL: Gesloten resultaat eerst terugdraaien; dit is geen historisch saldosnapshot.
export function tradeSummary(trade, account) {
  const closed = trade.status === 'closed';
  const pnl = closed ? (Number.isFinite(trade.profitLoss) ? trade.profitLoss : null) : 0;
  const known = Boolean(account?.currency && Number.isFinite(account.balance));
  const before = known && pnl !== null ? account.balance - (closed ? pnl : 0) : null;
  return { closed, pnl, before, after: before === null ? null : before + pnl,
    missing: closed ? [] : [...(!known ? ['Account with balance and currency'] : []), 'Result', 'P/L'] };
}

// MARK: - Samenvattingskaarten
// Comment NL: Veilige tekstnodes, dezelfde kaarten voor lezen en conceptbewerking.
export function renderTradeSummary(parent, trade, account, dirty = false) {
  const model = tradeSummary(trade, account);
  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const money = (value, signed = false) => value === null || !account?.currency ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: account.currency, currencyDisplay: 'code', signDisplay: signed ? 'always' : 'auto' }).format(value);
  parent.replaceChildren();
  const status = make('section', null, 'trade-detail-card'); status.append(make('h3', 'Trade status'));
  const notice = make('div', null, 'trade-summary-status' + (model.closed ? ' is-closed' : ''));
  notice.append(make('strong', model.closed ? 'This trade is closed' : 'This trade is still open'));
  notice.append(make('p', model.closed ? 'The realized result has already been applied to the account.' : 'Complete the remaining fields when you choose Close trade.'));
  for (const field of model.missing) notice.append(make('p', 'Missing: ' + field, 'trade-summary-missing'));
  status.append(notice); parent.append(status);
  const card = make('section', null, 'trade-detail-card'); card.append(make('h3', 'Close summary'));
  const metrics = make('div', null, 'trade-summary-metrics');
  for (const [label, value, cls] of [['Balance before', money(model.before), ''], ['This trade', money(model.pnl, true), model.pnl < 0 ? 'negative' : 'positive'], ['Balance after', money(model.after), 'accent']]) {
    const metric = make('div'); metric.append(make('span', label), make('strong', value, cls)); metrics.append(metric);
  }
  card.append(metrics, make('p', model.closed ? 'Calculated from the current account balance, reversing this trade’s recorded P/L first. Not a historical balance.' : 'Preview only. No P/L has been entered yet; the balance stays unchanged.', 'trade-summary-caption'));
  if (dirty) card.append(make('p', 'Unsaved changes — save your draft before closing the trade.', 'trade-summary-caption'));
  parent.append(card);
}
