import { deadline } from './reader.mjs';

// MARK: - Expliciete velden voor nieuwe en bestaande notities
// Comment NL: Geen verwijderingen, fotowijzigingen, saldo-aanpassingen of geforceerde updates.
export const NOTE_FIELDS = new Set(['CD_id', 'CD_entityName', 'CD_createdAt', 'CD_title', 'CD_body', 'CD_accountID', 'CD_accountName', 'CD_accountCurrency', 'CD_tradeID', 'CD_pair', 'CD_lot', 'CD_amount', 'CD_outcomeRaw', 'CD_richBodyData', 'CD_richBodyData_ckAsset']);
export const NOTE_UPDATE_FIELDS = new Set(['CD_title', 'CD_body', 'CD_richBodyData', 'CD_richBodyData_ckAsset']);
const sameZone = (a, b) => a && b && a.zoneName === b.zoneName && a.ownerRecordName === b.ownerRecordName;
export function planNote(snapshot, key, input, zone, identity, now = Date.now()) {
  if (!snapshot || snapshot.stale || snapshot.collectionStatus !== 'complete' || snapshot.notesStatus !== 'complete') throw new Error('Refresh complete notes before saving.');
  if (!zone?.zoneName || snapshot.source !== 'demo' && zone.zoneName !== 'com.apple.coredata.cloudkit.zone') throw new Error('Select the native PulseFX private zone.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('Enter a title of 1–200 characters.');
  if (typeof input.body !== 'string' || input.body.length > 10000) throw new Error('Use up to 10,000 characters for the note.');
  const title = input.title.trim(), body = input.body;
  if (key) {
    const matches = snapshot.notes.filter(n => n.key === key), note = matches[0];
    if (matches.length !== 1 || !note.id || snapshot.notes.filter(n => n.id === note.id).length !== 1 || !sameZone(note.zone, zone)) throw new Error('Note identity or zone is ambiguous. Refresh first.');
    const fields = {};
    if (title !== note.title) {
      if (note.title == null || note.blockedEditFields?.includes('CD_title')) throw new Error('Edit this title in the native app; its stored text is unavailable.');
      fields.CD_title = { value: title };
    }
    if (body !== note.body) {
      if (note.body == null || note.blockedEditFields?.includes('CD_body')) throw new Error('Edit this note in the native app; its stored text is unavailable.');
      if (note.hasRichText && input.replaceFormatting !== true) throw new Error('Confirm replacing the existing formatting with plain text.');
      fields.CD_body = { value: body };
      if (note.hasRichText) { fields.CD_richBodyData = { value: null }; fields.CD_richBodyData_ckAsset = { value: null }; }
    }
    if (!Object.keys(fields).length) throw new Error('No changes to save.');
    return { operation: 'update', note, id: note.id, title, body, records: [{ recordType: 'CD_TradeNote', recordName: note.recordName, recordChangeTag: note.recordChangeTag, fields }] };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity || '')) throw new Error('A valid note identity is required.');
  if (snapshot.notes.some(n => n.id === identity.toLowerCase())) throw new Error('This note already exists. Refresh before retrying.');
  let trade = null, account = null;
  if (input.tradeKey) {
    const candidates = snapshot.trades.filter(t => t.key === input.tradeKey && t.id && sameZone(t.zone, zone));
    if (candidates.length !== 1 || snapshot.trades.filter(t => t.id === candidates[0].id).length !== 1) throw new Error('Choose a uniquely linked trade.');
    trade = candidates[0];
  }
  const accountKey = trade?.accountKey || input.accountKey;
  if (trade && input.accountKey && trade.accountKey !== input.accountKey) throw new Error('The account must match the selected trade.');
  if (accountKey) {
    const candidates = snapshot.accounts.filter(a => a.key === accountKey && a.id && sameZone(a.zone, zone));
    if (candidates.length !== 1 || snapshot.accounts.filter(a => a.id === candidates[0].id).length !== 1) throw new Error('Choose a unique account.');
    account = candidates[0];
  }
  const values = { CD_entityName: 'TradeNote', CD_id: identity.toUpperCase(), CD_createdAt: now, CD_title: title, CD_body: body };
  if (account) Object.assign(values, { CD_accountID: account.id.toUpperCase(), CD_accountName: account.name, CD_accountCurrency: account.currency });
  if (trade) Object.assign(values, { CD_tradeID: trade.id.toUpperCase(), CD_pair: trade.instrument, CD_lot: trade.lotSize, CD_amount: trade.profitLoss, CD_outcomeRaw: ({ open: 'OPEN', win: 'TP', loss: 'SL', breakEven: 'BE' })[trade.result] || null });
  const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null).map(([k, v]) => [k, { value: v }]));
  return { operation: 'create', id: identity.toLowerCase(), title, body, account, trade, createdAt: new Date(now).toISOString(), zone,
    records: [{ recordType: 'CD_TradeNote', recordName: `CD_TradeNote_${identity.toUpperCase()}`, fields }] };
}
export async function commitNote({ plan, config, database, selected, transport }) {
  if (config.noteEditingEnabled !== true) throw new Error('iCloud note editing is not enabled on this deployment yet.');
  const zone = selected?.requestZone, r = plan.records[0];
  if (!zone || zone.zoneName !== 'com.apple.coredata.cloudkit.zone' || plan.records.length !== 1 || r.recordType !== 'CD_TradeNote'
    || !['create', 'update'].includes(plan.operation) || Object.keys(r.fields).some(k => !(plan.operation === 'update' ? NOTE_UPDATE_FIELDS : NOTE_FIELDS).has(k))
    || !sameZone(plan.note?.zone || plan.zone, zone)
    || plan.operation === 'create' && (r.recordChangeTag != null || r.fields.CD_entityName?.value !== 'TradeNote' || r.recordName !== `CD_TradeNote_${plan.id.toUpperCase()}`)
    || plan.operation === 'update' && (typeof r.recordChangeTag !== 'string' || !r.recordChangeTag)) throw new Error('The note version or private zone is unavailable. Refresh first.');
  transport.armNote(plan, zone);
  try {
    const batch = database.newRecordsBatch({ zoneID: zone, atomic: true, desiredKeys: ['CD_id', 'CD_title', 'CD_body'] });
    const response = await deadline(batch[plan.operation](plan.records).commit(), 20000);
    if (response?.hasErrors || response?.errors?.length || response?.records?.length !== 1 || response.records[0].recordName !== r.recordName || response.records[0].serverErrorCode) throw new Error('Unconfirmed save');
  } catch { throw new Error('Save not confirmed. Close the editor and refresh before retrying; check whether the note already exists. Your draft has not been discarded.'); }
  finally { transport.disarm(); }
}
export function demoNote(snapshot, plan) {
  if (plan.operation === 'update') return { ...snapshot, notes: snapshot.notes.map(n => n.key === plan.note.key ? { ...n, title: plan.title, body: plan.body, hasRichText: plan.records[0].fields.CD_body ? false : n.hasRichText } : n) };
  return { ...snapshot, notes: [{ key: plan.records[0].recordName, id: plan.id, recordName: plan.records[0].recordName, recordType: 'CD_TradeNote', title: plan.title, body: plan.body, zone: plan.zone, createdAt: plan.createdAt, accountKey: plan.account?.key || null, tradeId: plan.trade?.id || null, hasRichText: false }, ...snapshot.notes] };
}
