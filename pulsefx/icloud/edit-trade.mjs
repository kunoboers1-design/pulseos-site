import { deadline } from './reader.mjs';

// MARK: - Expliciete bewerkvelden uit het native OpenTrade-model
// Comment NL: Resultaat, saldo, identiteit en systeemmetadata vallen buiten deze conceptbewerking.
export const EDIT_FIELDS = [
  ['directionRaw', 'Direction', 'Details', ['none', 'long', 'short']],
  ['accountReference', 'Account', 'Details', 'account', 'linkedAccountId'],
  ['lotSize', 'Lot size', 'Details', 'positive'],
  ['riskPercent', 'Risk percentage', 'Details', 'risk'],
  ['entryPrice', 'Entry', 'Details', 'price'],
  ['stopLossPlacement', 'Stop loss', 'Details', 'price'],
  ['actualExitPrice', 'Close price', 'Details', 'price'],
  ['targetRR', 'Target R:R', 'Details', 'positiveOptional'],
  ['finalRR', 'Final R:R', 'Details', 'number'],
  ['setupsSelectedRaw', 'Setup', 'Strategy', 'text'],
  ['timeframesSelectedRaw', 'Timeframe', 'Strategy', 'text'],
  ['confluences', 'Confluences', 'Strategy', 'integer'],
  ['mistakesSelectedRaw', 'Mistake', 'Strategy', 'text'],
  ['slMoved', 'SL moved?', 'Strategy', 'boolean'],
  ['tradeTypeRaw', 'Trade type', 'Strategy', ['none', 'reversal', 'trend', 'range']],
  ['sessionRaw', 'Session', 'Strategy', ['none', 'newYork', 'london', 'tokyo', 'sydney']],
  ['sessionCustom', 'Custom session', 'Strategy', 'text'],
  ['setupTag', 'Setup tag', 'Strategy', 'text'],
  ['breakEvenHitRaw', 'Break-even hit', 'Strategy', ['none', 'tpAfterBE', 'slAfterBE']],
  ['weekendHoldRaw', 'Weekend hold', 'Strategy', ['none', 'heldToTP', 'heldToSL']],
  ['emotionCustom', 'Emotion', 'Psychology', 'text'],
  ['confidenceRating', 'Confidence', 'Psychology', 'rating'],
  ['tradeRating', 'Execution', 'Psychology', 'rating'],
  ['emotionalStateRaw', 'Emotional state', 'Psychology', ['none', 'calm', 'confident', 'anxious', 'frustrated', 'fomo', 'revenge']],
  ['mistakeTag', 'Mistake tag', 'Psychology', 'text'],
  ['preTradeNotes', 'Pre-trade', 'Notes', 'note'],
  ['postTradeNotes', 'Post-trade', 'Notes', 'note'],
];
export const EDIT_CLOUD_FIELDS = new Set(EDIT_FIELDS.map(([key,,,, cloud]) => `CD_${cloud || key}`));
export function planEdit(snapshot, tradeKey, changes) {
  if (!snapshot || snapshot.collectionStatus !== 'complete' || snapshot.stale) throw new Error('Refresh a complete workspace before editing.');
  const matches = snapshot.trades.filter(t => t.key === tradeKey), trade = matches[0];
  if (matches.length !== 1 || !trade.id || snapshot.trades.filter(t => t.id === trade.id).length !== 1) throw new Error('Trade identity is missing or ambiguous. Refresh first.');
  if (trade.recordType !== 'CD_OpenTrade' || trade.status !== 'open' || trade.result !== 'open' || !trade.outcomeConsistent) throw new Error('Only open modern trades can be edited here. Use the native app for other trades.');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid changes.');
  const fields = {}, patch = {};
  for (const [key, raw] of Object.entries(changes)) {
    const spec = EDIT_FIELDS.find(f => f[0] === key);
    if (!spec) throw new Error('This field cannot be changed here.');
    const [, label,, type, cloud] = spec;
    if (trade.blockedEditFields?.includes(`CD_${cloud || key}`)) throw new Error(`${label} uses unsupported storage or contains an invalid value. Edit it in the native app.`);
    let v;
    if (type === 'boolean') { if (typeof raw !== 'boolean') throw new Error(`Choose ${label}.`); v = raw; }
    else {
      if (typeof raw !== 'string') throw new Error(`Enter ${label}.`);
      if (Array.isArray(type)) { if (!type.includes(raw)) throw new Error(`Choose a valid ${label}.`); v = raw; }
      else if (type === 'text' || type === 'note') {
        if (raw.length > (type === 'note' ? 10000 : 1000)) throw new Error(`${label} is too long.`);
        v = raw;
      } else if (type === 'account') {
        v = raw || null;
        if (v) {
          const accounts = snapshot.accounts.filter(a => a.id === v && a.archived === false && a.currency);
          if (accounts.length !== 1 || accounts[0].zone.zoneName !== trade.zone.zoneName || accounts[0].zone.ownerRecordName !== trade.zone.ownerRecordName) throw new Error('Choose one active account in this trade’s zone.');
        }
      } else {
        const input = raw.trim(); v = input === '' ? null : Number(input);
        if (v !== null && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input) || !Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) throw new Error(`Enter a valid ${label}.`);
        if (type === 'positive' && !(v > 0) || ['price', 'positiveOptional'].includes(type) && v !== null && !(v > 0)
          || type === 'risk' && v !== null && (!(v > 0) || v > 100)
          || type === 'rating' && (v === null || !Number.isInteger(v) || v < 0 || v > 5)
          || type === 'integer' && (v === null || !Number.isSafeInteger(v) || v < 0)) throw new Error(`${label} is outside the allowed range.`);
      }
    }
    if (v === trade[key] || v === null && trade[key] == null) continue;
    patch[key] = v; fields[`CD_${cloud || key}`] = { value: typeof v === 'boolean' ? Number(v) : v };
  }
  if (!Object.keys(fields).length) throw new Error('No changes to save.');
  const result = { ...trade, ...patch };
  if (result.entryPrice != null && result.stopLossPlacement != null && result.entryPrice === result.stopLossPlacement) throw new Error('Entry and stop loss must differ.');
  return { trade, patch, records: [{ recordName: trade.recordName, recordType: 'CD_OpenTrade', recordChangeTag: trade.recordChangeTag, fields }] };
}

// MARK: - Eén update met versiecontrole, nooit forceUpdate of automatisch opnieuw proberen
export async function commitEdit({ plan, config, database, selected, transport }) {
  if (config.tradeEditingEnabled !== true) throw new Error('iCloud editing is not enabled on this deployment yet.');
  const zone = selected?.requestZone;
  const r = plan.records[0];
  if (!zone || zone.zoneName === '_defaultZone' || plan.trade.zone.zoneName !== zone.zoneName || plan.trade.zone.ownerRecordName !== zone.ownerRecordName
    || plan.records.length !== 1 || typeof r.recordChangeTag !== 'string' || !r.recordChangeTag || r.recordType !== 'CD_OpenTrade'
    || !Object.keys(r.fields).length || Object.keys(r.fields).some(key => !EDIT_CLOUD_FIELDS.has(key))) throw new Error('The record version or zone is unavailable. Refresh before saving.');
  transport.armEdit(plan, zone);
  try {
    const response = await deadline(database.newRecordsBatch({ zoneID: zone, atomic: true, desiredKeys: Object.keys(r.fields) }).update(plan.records).commit(), 20000);
    if (response?.hasErrors || response?.errors?.length || !Array.isArray(response?.records) || response.records.length !== 1
      || response.records[0].recordName !== r.recordName || response.records[0].serverErrorCode) throw new Error('Unconfirmed save');
  } catch { throw new Error('Save not confirmed. Refresh and check the native app before retrying. A newer edit or an interrupted connection may have occurred.'); }
  finally { transport.disarm(); }
}
export function applyDemoEdit(snapshot, plan) {
  return { ...snapshot, trades: snapshot.trades.map(t => {
    if (t.key !== plan.trade.key) return t;
    const result = { ...t, ...plan.patch };
    if ('directionRaw' in plan.patch) result.direction = plan.patch.directionRaw === 'none' ? null : plan.patch.directionRaw;
    if ('accountReference' in plan.patch) {
      const account = snapshot.accounts.find(a => a.id === plan.patch.accountReference);
      result.accountKey = account?.key || null; result.linkStatus = account ? 'linked' : 'unlinked'; result.currency = account?.currency || null;
    }
    return result;
  }) };
}
