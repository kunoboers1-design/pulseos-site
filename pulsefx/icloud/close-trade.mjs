import { EDIT_CLOUD_FIELDS } from './edit-trade.mjs';
import { readOnlyFetch, deadline, ReadError } from './reader.mjs';

// MARK: - Gecontroleerde sluitopdracht
// Comment NL: Alleen bestaande, eenduidig gekoppelde moderne trades; geen accountwissel of heropening.
export function planClose(snapshot, tradeKey, input, now = Date.now()) {
  if (!snapshot || snapshot.collectionStatus !== 'complete' || snapshot.stale) throw new Error('Refresh a complete workspace before closing a trade.');
  const matches = snapshot.trades.filter(t => t.key === tradeKey);
  if (matches.length !== 1) throw new Error('This trade is unavailable. Refresh the workspace.');
  const trade = matches[0], accounts = snapshot.accounts.filter(a => a.key === trade.accountKey);
  if (!trade.id || snapshot.trades.filter(t => t.id === trade.id).length !== 1) throw new Error('This trade has a missing or duplicate identity. Resolve it in the native app first.');
  if (trade.recordType !== 'CD_OpenTrade') throw new Error('Close legacy trades in the native app for now.');
  if (trade.status !== 'open' || trade.result !== 'open' || !trade.outcomeConsistent) throw new Error('This trade is no longer open. Refresh the workspace.');
  if (trade.linkStatus !== 'linked' || accounts.length !== 1) throw new Error('This trade needs an unambiguous account in the native app first.');
  const account = accounts[0];
  if (account.archived !== false || !account.currency || !Number.isFinite(account.balance)) throw new Error('An active account with a known balance and currency is required.');
  if (typeof input.profitLoss !== 'string' || !input.profitLoss.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input.profitLoss.trim())) throw new Error('Enter a valid realized P&L in the account currency.');
  const profitLoss = Number(input.profitLoss), balance = account.balance + profitLoss;
  if (!Number.isFinite(profitLoss) || !Number.isFinite(balance) || Math.abs(balance) > Number.MAX_SAFE_INTEGER) throw new Error('The amount is outside the supported range.');
  if (!['win', 'loss', 'breakEven'].includes(input.result)) throw new Error('Choose a result.');
  // Comment NL: De native app staat kosten bij break-even toe; P&L wordt nooit uit resultaat of prijzen verzonnen.
  const timestamp = Date.parse(input.closedAt);
  if (!Number.isFinite(timestamp) || !trade.startedAt || timestamp < Date.parse(trade.startedAt) || timestamp > now + 60000) throw new Error('The close time must be between the opening time and now.');
  let finalRR = null;
  if (input.finalRR?.trim()) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input.finalRR.trim()) || !Number.isFinite(Number(input.finalRR))) throw new Error('Enter a valid final R or leave it empty.');
    finalRR = Number(input.finalRR);
  }
  const fields = { CD_statusRaw: { value: 'closed' }, CD_resultRaw: { value: { win: 'win', loss: 'stopLoss', breakEven: 'breakEven' }[input.result] },
    CD_profitLoss: { value: profitLoss }, CD_closedAt: { value: timestamp } };
  if (finalRR !== null) fields.CD_finalRR = { value: finalRR };
  return { trade, account, profitLoss, balance, result: input.result, closedAt: new Date(timestamp).toISOString(), finalRR,
    records: [{ recordName: trade.recordName, recordChangeTag: trade.recordChangeTag, recordType: 'CD_OpenTrade', fields },
      { recordName: account.recordName, recordChangeTag: account.recordChangeTag, recordType: 'CD_Account', fields: { CD_balance: { value: balance } } }] };
}

// MARK: - Eenmalige netwerktoestemming voor exact deze twee records
// Comment NL: Deze clientguard voorkomt onbedoelde appwrites; Apples sessierechten zijn ruimer dan deze guard.
export function closeTransport(config, fetcher = globalThis.fetch) {
  const read = readOnlyFetch(config, fetcher); let permit = null;
  return {
    arm(plan, zone) { permit = { records: structuredClone(plan.records), zone: { ...zone }, kind: 'close' }; },
    armEdit(plan, zone) {
      if (!config.tradeEditingEnabled || plan.records.length !== 1 || plan.records[0].recordType !== 'CD_OpenTrade'
        || Object.keys(plan.records[0].fields).some(key => !EDIT_CLOUD_FIELDS.has(key))) throw new ReadError('OPERATION_BLOCKED');
      permit = { records: structuredClone(plan.records), zone: { ...zone }, kind: 'edit' };
    },
    disarm() { permit = null; },
    async fetch(input, init = {}) {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (!url.pathname.endsWith('/records/modify')) return read(input, init);
      const allowed = permit; permit = null;
      let body; try { body = JSON.parse(init.body); } catch { throw new ReadError('OPERATION_BLOCKED'); }
      const sameFields = (a, b) => Object.keys(a || {}).length === Object.keys(b).length && Object.entries(b).every(([key, f]) => a[key]?.value === f.value);
      if (!allowed || !(allowed.kind === 'edit' ? config.tradeEditingEnabled === true : config.closeTradePilotId) || (init.method || 'GET').toUpperCase() !== 'POST'
        || url.origin !== 'https://api.apple-cloudkit.com' || url.pathname !== `/database/1/${config.containerIdentifier}/${config.environment}/private/records/modify`
        || body.atomic !== true || body.zoneID?.zoneName !== allowed.zone.zoneName || body.zoneID?.ownerRecordName !== allowed.zone.ownerRecordName
        || !Array.isArray(body.operations) || body.operations.length !== allowed.records.length
        || !body.operations.every((operation, i) => operation.operationType === 'update' && operation.record?.recordName === allowed.records[i].recordName
          && operation.record.recordType === allowed.records[i].recordType && operation.record.recordChangeTag === allowed.records[i].recordChangeTag && sameFields(operation.record.fields, allowed.records[i].fields))) throw new ReadError('OPERATION_BLOCKED');
      return fetcher(input, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    },
  };
}

// MARK: - Pilotwriter met optimistische concurrency
// Comment NL: Atomic + change tags voorkomt gedeeltelijke writes en overschrijven van nieuwere cloudrecords.
// Comment NL: Offline native wijzigingen blijven een integratietestrisico; activering gebeurt alleen voor één expliciete testtrade.
export async function commitClose({ plan, config, database, selected, transport }) {
  if (!config.closeTradePilotId || plan.trade.id !== config.closeTradePilotId.toLowerCase()) throw new Error('Web closing is awaiting the native sync test. Close this trade in the app for now.');
  const zone = selected?.requestZone;
  if (!zone || zone.zoneName === '_defaultZone' || plan.trade.zone.zoneName !== zone.zoneName || plan.account.zone.zoneName !== zone.zoneName
    || plan.trade.zone.ownerRecordName !== plan.account.zone.ownerRecordName || plan.records.some(r => typeof r.recordChangeTag !== 'string' || !r.recordChangeTag)) throw new Error('Record versions or a supported private zone are missing. Refresh before trying again.');
  transport.arm(plan, zone);
  try {
    const response = await deadline(database.newRecordsBatch({ zoneID: zone, atomic: true, desiredKeys: ['CD_statusRaw', 'CD_balance'] }).update(plan.records).commit(), 20000);
    if (response?.hasErrors || response?.errors?.length || response?.records?.some(r => r.serverErrorCode)) throw new Error('CloudKit did not confirm the close. Refresh before trying again; never submit it twice.');
    if (!Array.isArray(response?.records) || response.records.length !== 2 || !plan.records.every(r => response.records.some(saved => saved.recordName === r.recordName))) throw new Error('The save result is unknown. Refresh and check the native app before taking another action.');
  } catch { throw new Error('Close not confirmed. Refresh and check the native app. A conflict or interrupted connection may have occurred; do not submit again until you have checked.'); }
  finally { transport.disarm(); }
}

// MARK: - Fictieve sluitactie zonder netwerk of blijvende opslag
export function closeDemo(snapshot, plan) {
  return { ...snapshot, accounts: snapshot.accounts.map(a => a.key === plan.account.key ? { ...a, balance: plan.balance } : a),
    trades: snapshot.trades.map(t => t.key === plan.trade.key ? { ...t, status: 'closed', result: plan.result, rawResult: plan.records[0].fields.CD_resultRaw.value,
      rawStatus: 'closed', profitLoss: plan.profitLoss, closedAt: plan.closedAt, finalRR: plan.finalRR ?? t.finalRR } : t) };
}
