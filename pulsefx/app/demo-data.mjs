// MARK: - Voorbeeldgegevens
// Comment NL: Eén vaste, fictieve momentopname. Saldo's worden uit gesloten trades afgeleid.
export const demoSeed = {
  asOf: '2026-10-23',
  accounts: [
    { id: 'atlas', name: 'Atlas Funded', type: 'Funded', currency: 'USD', startingBalance: 25000, description: 'A fictional funded account for practicing a structured trading routine.' },
    { id: 'personal', name: 'Personal Trading', type: 'Personal', currency: 'USD', startingBalance: 10000, description: 'A fictional personal account for exploring your trading journal.' },
    { id: 'practice', name: 'Practice Account', type: 'Practice', currency: 'USD', startingBalance: 5000, description: 'A fictional practice account. No broker or real funds are connected.' },
  ],
  trades: [
    { id: 't1', accountId: 'atlas', pair: 'EUR/USD', side: 'Buy', lots: 0.5, status: 'closed', date: '2026-10-12', pnl: 320, note: 'Waited for the retest before entry. Followed the planned exit.' },
    { id: 't2', accountId: 'personal', pair: 'GBP/USD', side: 'Sell', lots: 0.2, status: 'closed', date: '2026-10-14', pnl: -100, note: 'Stop loss respected. Review the entry timing.' },
    { id: 't3', accountId: 'atlas', pair: 'GBP/USD', side: 'Buy', lots: 0.4, status: 'closed', date: '2026-10-16', pnl: -180, note: 'The setup invalidated; exited at the planned stop.' },
    { id: 't4', accountId: 'personal', pair: 'EUR/USD', side: 'Buy', lots: 0.3, status: 'closed', date: '2026-10-19', pnl: 240, note: 'Patient entry and a clear target.' },
    { id: 't5', accountId: 'atlas', pair: 'USD/JPY', side: 'Sell', lots: 0.5, status: 'closed', date: '2026-10-21', pnl: 700, note: 'Stayed with the original trade plan.' },
    { id: 't6', accountId: 'practice', pair: 'EUR/USD', side: 'Buy', lots: 0.1, status: 'closed', date: '2026-10-22', pnl: -50, note: 'Practice trade: focus on following the process.' },
    { id: 't7', accountId: 'atlas', pair: 'EUR/USD', side: 'Buy', lots: 0.3, status: 'open', date: '2026-10-23', pnl: null, note: 'Example open position. No live prices or unrealized P&L.' },
    { id: 't8', accountId: 'personal', pair: 'GBP/USD', side: 'Sell', lots: 0.2, status: 'open', date: '2026-10-23', pnl: null, note: 'Review the plan at the next session.' },
  ],
};

// MARK: - Afgeleide statistieken
export function summarize(data, accountId = 'all') {
  const accounts = data.accounts.filter(a => accountId === 'all' || a.id === accountId);
  const trades = data.trades.filter(t => accounts.some(a => a.id === t.accountId));
  const closed = trades.filter(t => t.status === 'closed');
  const pnl = closed.reduce((sum, t) => sum + t.pnl, 0);
  const startingBalance = accounts.reduce((sum, a) => sum + a.startingBalance, 0);
  return { balance: startingBalance + pnl, startingBalance, pnl, closed: closed.length, wins: closed.filter(t => t.pnl > 0).length,
    open: trades.length - closed.length, winRate: closed.length ? closed.filter(t => t.pnl > 0).length / closed.length * 100 : null };
}

// MARK: - Verwisselbare datalaag
// Comment NL: De UI gebruikt uitsluitend deze asynchrone repository-methoden.
// Een toekomstige CloudKit-adapter moet hetzelfde contract leveren, na onderzoek van de native opslag.
export const STORAGE_KEY = 'pulsefx.web.demo.v1';
export function createDemoRepository(storage) {
  let notes = {};
  let persistent = true;
  let recovered = false;
  let raw;
  try { raw = storage?.getItem(STORAGE_KEY); } catch { persistent = false; }
  try {
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !saved.notes || typeof saved.notes !== 'object' || Array.isArray(saved.notes)) throw new Error('Invalid demo data');
      for (const trade of demoSeed.trades) {
        if (Object.hasOwn(saved.notes, trade.id)) {
          if (typeof saved.notes[trade.id] !== 'string' || saved.notes[trade.id].length > 2000) throw new Error('Invalid note');
          notes[trade.id] = saved.notes[trade.id];
        }
      }
    }
    if (!storage) persistent = false;
  } catch { notes = {}; recovered = true; }
  const snapshot = () => {
    const data = structuredClone(demoSeed);
    data.trades.forEach(t => { if (Object.hasOwn(notes, t.id)) t.note = notes[t.id]; });
    return { ...data, mode: 'demo', persistent, recovered };
  };
  const persist = () => {
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes }));
      persistent = true;
      recovered = false;
    } catch { persistent = false; }
  };
  return {
    async load() { return snapshot(); },
    async saveNote(tradeId, note) {
      if (!demoSeed.trades.some(t => t.id === tradeId) || typeof note !== 'string' || note.length > 2000) throw new Error('Invalid note');
      notes[tradeId] = note;
      persist();
      return snapshot();
    },
    async reset() {
      notes = {};
      persist();
      return snapshot();
    },
  };
}
