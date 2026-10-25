import { calculateStatistics } from '../../pulsefx/app/statistics.mjs';
export const cookieName = '__Host-pulsefx-premium';
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data, (_, value) => value === Infinity ? 'infinity' : value), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
});
const cookie = (token = '', age = 0) => `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;

// MARK: - Invoergrenzen
// Comment NL: Het dashboard stuurt alleen gepseudonimiseerde rekenvelden, nooit CloudKit-tokens of notities.
export function validateSnapshot(value) {
  if (!value || value.collectionStatus !== 'complete' || !Array.isArray(value.accounts) || !Array.isArray(value.trades)
    || value.accounts.length > 1000 || value.trades.length > 10000) throw new Error('INVALID_SNAPSHOT');
  const accounts = value.accounts.map(account => {
    if (!/^a\d{1,4}$/.test(account.key) || ![true, false, null].includes(account.archived)) throw new Error('INVALID_SNAPSHOT');
    return { key: account.key, archived: account.archived };
  });
  if (new Set(accounts.map(a => a.key)).size !== accounts.length) throw new Error('INVALID_SNAPSHOT');
  const numbers = ['lotSize', 'profitLoss', 'stopLossPips', 'pipValue', 'finalRR', 'entryPrice', 'stopLossPlacement', 'actualExitPrice'];
  const enums = { recordType: ['CD_Trade', 'CD_OpenTrade'], status: ['open', 'closed', null], result: ['win', 'loss', 'breakEven', 'open', null],
    direction: ['long', 'short', null], directionRaw: ['long', 'short', 'none', null], linkStatus: ['linked', 'unlinked', 'ambiguous', 'missing', 'unknown'] };
  const trades = value.trades.map((trade, index) => {
    const clean = { key: `t${index}`, outcomeConsistent: trade.outcomeConsistent === true };
    for (const [key, allowed] of Object.entries(enums)) {
      if (!allowed.includes(trade[key])) throw new Error('INVALID_SNAPSHOT');
      clean[key] = trade[key];
    }
    for (const key of numbers) {
      if (trade[key] !== null && (!Number.isFinite(trade[key]) || Math.abs(trade[key]) > 1e15)) throw new Error('INVALID_SNAPSHOT');
      clean[key] = trade[key];
    }
    if (trade.accountKey !== null && !/^a\d{1,4}$/.test(trade.accountKey)) throw new Error('INVALID_SNAPSHOT');
    if (trade.currency !== null && !/^[A-Z]{3}$/.test(trade.currency)) throw new Error('INVALID_SNAPSHOT');
    if (trade.instrument !== null && (typeof trade.instrument !== 'string' || trade.instrument.length > 64)) throw new Error('INVALID_SNAPSHOT');
    if (trade.startedAt !== null && (typeof trade.startedAt !== 'string' || trade.startedAt.length > 32 || !Number.isFinite(Date.parse(trade.startedAt)))) throw new Error('INVALID_SNAPSHOT');
    return { ...clean, accountKey: trade.accountKey, currency: trade.currency, instrument: trade.instrument, startedAt: trade.startedAt };
  });
  return { collectionStatus: 'complete', accounts, trades };
}

// MARK: - Premium-endpoints
export function createApplication({ store, purchases, origin }) {
  return async function handle(request) {
    const path = new URL(request.url).pathname.split('/').pop();
    const suppliedOrigin = request.headers.get('origin');
    // Comment NL: Alleen bevestigen vanuit de native app mag zonder browser-Origin.
    if (suppliedOrigin !== origin && !(path === 'confirm' && !suppliedOrigin && !request.headers.has('cookie'))) return json({ error: 'ORIGIN_REJECTED' }, 403);
    const identity = request.headers.get('x-pulsefx-client-ip') || 'unknown';
    if (!store.allow(`${path}:${identity}`, path === 'confirm' ? 8 : 30)) return json({ error: 'RATE_LIMITED' }, 429);
    const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    try {
      if (path === 'pair' && request.method === 'POST') {
        store.remove(token);
        const session = store.create();
        return json({ code: session.code, expiresAt: session.pairExpires }, 201, { 'set-cookie': cookie(session.token, 12 * 3600) });
      }
      if (path === 'session' && request.method === 'DELETE') {
        store.remove(token); return json({ state: 'disconnected' }, 200, { 'set-cookie': cookie() });
      }
      if (path === 'confirm' && request.method === 'POST') {
        const body = await request.json();
        if (!store.pending(body.code)) return json({ error: 'PAIR_EXPIRED' }, 400);
        const access = await purchases.verifyProof(body.signedTransaction);
        if (!store.confirm(body.code, { transactionId: access.transactionId })) return json({ error: 'PAIR_EXPIRED' }, 409);
        return json({ state: 'confirmed' });
      }
      if (!((path === 'session' && request.method === 'GET') || (path === 'statistics' && request.method === 'POST'))) return json({ error: 'NOT_FOUND' }, 404);
      const session = store.get(token);
      if (!session) return json({ state: 'locked' }, 401, { 'set-cookie': cookie() });
      if (!session.purchase) return path === 'session' ? json({ state: 'pending', expiresAt: session.pairExpires }) : json({ error: 'PREMIUM_REQUIRED' }, 403);
      const access = await purchases.current(session.purchase.transactionId);
      const expiresAt = Math.min(session.expires, access.expiresAt ?? session.expires);
      if (path === 'session') return json({ state: 'verified', kind: access.kind, expiresAt });
      const body = await request.json();
      const snapshot = validateSnapshot(body.snapshot);
      const filters = body.filters || {};
      for (const key of Object.keys(filters)) if (!['accountKey', 'instrument', 'outcome', 'start', 'end'].includes(key)) throw new Error('INVALID_SNAPSHOT');
      for (const value of Object.values(filters)) if (value !== null && (typeof value !== 'string' || value.length > 64)) throw new Error('INVALID_SNAPSHOT');
      const result = calculateStatistics(snapshot, filters);
      // Comment NL: Ruwe handelsregels worden niet teruggestuurd of opgeslagen.
      delete result.records;
      return json({ state: 'verified', expiresAt, statistics: result });
    } catch (error) {
      if (['PURCHASE_INACTIVE', 'PURCHASE_INVALID'].includes(error.message)) {
        store.remove(token); return json({ state: 'locked', error: 'PURCHASE_INACTIVE' }, 403, { 'set-cookie': cookie() });
      }
      if (error instanceof SyntaxError || error instanceof RangeError || error.message === 'INVALID_SNAPSHOT') return json({ error: 'INVALID_REQUEST' }, 400);
      // Comment NL: Bij Apple-storing of ongeldige handtekening geen toegang en geen foutdetails/logs met persoonsgegevens.
      return json({ error: 'VERIFICATION_UNAVAILABLE' }, 503);
    }
  };
}
