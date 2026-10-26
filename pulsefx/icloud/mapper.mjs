// MARK: - Contract
// Comment NL: Deze pure mapper verwerkt aangeleverde records; hij opent geen opslag of netwerk.
export const RECORD_TYPES = Object.freeze(['CD_Account', 'CD_Trade', 'CD_OpenTrade', 'CD_TradeNote']);
const CURRENCIES = new Set('USD EUR GBP JPY AUD CAD CHF NZD CNY INR RUB ZAR BRL MXN TRY PLN CZK HUF SEK NOK DKK KRW TWD THB MYR IDR PHP VND HKD SGD AED SAR ILS'.split(' '));
const KINDS = ['phase', 'funded', 'own', 'demo', 'ownCapital', 'externalCapital'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (object, key) => Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const issue = (issues, code, key = null, field = null) => issues.push({ code, key, field });

// MARK: - Veldvalidatie
function reader(record, key, issues) {
  const fields = record.fields;
  function read(name, type, { optional = false, asset = false } = {}) {
    const wrapper = own(fields, name) ? fields[name] : undefined;
    const value = wrapper?.value;
    if (asset && (value == null || value === '') && fields[`${name}_ckAsset`]?.value != null) {
      issue(issues, 'unsupported-field-storage', key, name);
      return null;
    }
    if (value == null) {
      if (!optional) issue(issues, 'missing-field', key, name);
      return null;
    }
    if (!object(wrapper) || (wrapper.type != null && wrapper.type !== type)) {
      issue(issues, 'invalid-field-type', key, name);
      return null;
    }
    const valid = type === 'STRING' ? text(value)
      : type === 'INT64' ? value === 0 || value === 1 || value === true || value === false
      : typeof value === 'number' && Number.isFinite(value);
    if (!valid) {
      issue(issues, 'invalid-field-value', key, name);
      return null;
    }
    return type === 'INT64' ? Boolean(value) : value;
  }
  function string(name, options = {}) { return read(name, 'STRING', options); }
  function number(name, options = {}) { return read(name, 'DOUBLE', options); }
  function uuid(name, options = {}) {
    const value = string(name, options);
    if (value === null) return null;
    if (!UUID.test(value)) { issue(issues, 'invalid-uuid', key, name); return null; }
    return value.toLowerCase();
  }
  function date(name, options = {}) {
    const value = read(name, 'TIMESTAMP', options);
    if (value === null) return null;
    const date = new Date(value);
    if (!Number.isSafeInteger(value) || !Number.isFinite(date.getTime())) {
      issue(issues, 'invalid-date', key, name);
      return null;
    }
    return date.toISOString();
  }
  function enumeration(name, allowed) {
    const raw = string(name, { asset: true });
    if (raw === null) return { raw, value: null };
    if (!allowed.includes(raw)) {
      issue(issues, 'unknown-enum', key, name);
      return { raw, value: null };
    }
    return { raw, value: raw };
  }
  return { string, number, uuid, date, enumeration, boolean: name => read(name, 'INT64') };
}

// MARK: - Identiteit
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return `${typeof value}:${String(JSON.stringify(value))}:${typeof value === 'number' ? String(value) : ''}`;
}

function prepare(records, context, issues) {
  const groups = new Map();
  let repeatedRecords = 0;
  for (const record of records) {
    if (!object(record) || !RECORD_TYPES.includes(record.recordType)) {
      issue(issues, 'unsupported-record-type');
      continue;
    }
    if (!text(record.recordName) || !object(record.zoneID) || !text(record.zoneID.zoneName)
      || !text(record.zoneID.ownerRecordName) || !object(record.fields)) {
      issue(issues, 'invalid-record-envelope');
      continue;
    }
    const zone = { zoneName: record.zoneID.zoneName, ownerRecordName: record.zoneID.ownerRecordName };
    const key = JSON.stringify([context.container, context.environment, context.database, context.sessionId,
      zone.ownerRecordName, zone.zoneName, record.recordName]);
    const fingerprint = stable({ recordType: record.recordType, fields: record.fields, recordChangeTag: record.recordChangeTag });
    const previous = groups.get(key);
    if (!previous) groups.set(key, { record, key, zone, fingerprint, conflict: false });
    else if (previous.fingerprint === fingerprint) repeatedRecords++;
    else if (!previous.conflict) {
      previous.conflict = true;
      issue(issues, 'conflicting-record-versions', key);
    }
  }
  return { entries: [...groups.values()].filter(entry => !entry.conflict), repeatedRecords };
}

// MARK: - Accountmapping
function mapAccount(entry, issues) {
  const { record, key, zone } = entry;
  const r = reader(record, key, issues);
  const kind = r.enumeration('CD_kindRaw', KINDS);
  const currencyRaw = r.string('CD_currencyRaw', { asset: true });
  const currency = CURRENCIES.has(currencyRaw) ? currencyRaw : null;
  if (currencyRaw !== null && currency === null) issue(issues, 'unsupported-currency', key, 'CD_currencyRaw');
  return {
    blockedEditFields: [...new Set([...Object.keys(record.fields).filter(k => k.endsWith('_ckAsset') && record.fields[k]?.value != null).map(k => k.slice(0, -8)), ...issues.filter(i => i.key === key && i.field).map(i => i.field)])],
    key, recordType: record.recordType, recordName: record.recordName, zone, recordChangeTag: record.recordChangeTag ?? null,
    id: r.uuid('CD_id'), name: r.string('CD_name', { asset: true }),
    kind: kind.value, kindRaw: kind.raw, currency, currencyRaw,
    balance: r.number('CD_balance'), startBalance: r.number('CD_startBalance'),
    archived: r.boolean('CD_isArchived'), favorite: r.boolean('CD_isFavorite'),
    createdAt: r.date('CD_createdAt'), archivedAt: r.date('CD_archivedAt', { optional: true }),
  };
}

// MARK: - Trademapping
function mapTrade(entry, issues) {
  const { record, key, zone } = entry;
  const r = reader(record, key, issues);
  const legacy = record.recordType === 'CD_Trade';
  let status, result, rawStatus, rawResult, direction = null, directionRaw = null;
  if (legacy) {
    const outcome = r.enumeration('CD_outcomeRaw', ['open', 'tp', 'sl', 'be']);
    rawStatus = rawResult = outcome.raw;
    status = outcome.value === null ? null : outcome.value === 'open' ? 'open' : 'closed';
    result = { open: 'open', tp: 'win', sl: 'loss', be: 'breakEven' }[outcome.value] ?? null;
  } else {
    const s = r.enumeration('CD_statusRaw', ['open', 'closed']);
    const o = r.enumeration('CD_resultRaw', ['open', 'win', 'stopLoss', 'breakEven']);
    const d = r.enumeration('CD_directionRaw', ['none', 'long', 'short']);
    status = s.value; rawStatus = s.raw; rawResult = o.raw;
    result = { open: 'open', win: 'win', stopLoss: 'loss', breakEven: 'breakEven' }[o.value] ?? null;
    directionRaw = d.raw; direction = d.value === 'none' ? null : d.value;
  }
  const outcomeConsistent = status !== null && result !== null && ((status === 'open') === (result === 'open'));
  if (status !== null && result !== null && !outcomeConsistent) issue(issues, 'status-result-conflict', key);
  const closedAt = r.date('CD_closedAt', { optional: status !== 'closed' });
  const startedAt = r.date(legacy ? 'CD_createdAt' : 'CD_openedAt');
  if (startedAt && closedAt && Date.parse(closedAt) < Date.parse(startedAt)) issue(issues, 'date-order-conflict', key);
  return {
    blockedEditFields: [...new Set([...Object.keys(record.fields).filter(k => k.endsWith('_ckAsset') && record.fields[k]?.value != null).map(k => k.slice(0, -8)), ...issues.filter(i => i.key === key && i.field).map(i => i.field)])],
    key, recordType: record.recordType, recordName: record.recordName, zone, recordChangeTag: record.recordChangeTag ?? null,
    id: r.uuid('CD_id'), instrument: r.string(legacy ? 'CD_pair' : 'CD_symbol', { asset: true }),
    accountReference: legacy ? r.string('CD_account', { optional: true }) : r.uuid('CD_linkedAccountId', { optional: true }),
    status, result, rawStatus, rawResult, direction, directionRaw, outcomeConsistent,
    lotSize: r.number('CD_lotSize'), riskPercent: r.number('CD_riskPercent'),
    stopLossPips: legacy ? r.number('CD_stopLossPips', { optional: true }) : null, pipValue: legacy ? r.number('CD_pipValue', { optional: true }) : null,
    finalRR: legacy ? null : r.number('CD_finalRR', { optional: true }), entryPrice: legacy ? null : r.number('CD_entryPrice', { optional: true }),
    stopLossPlacement: legacy ? null : r.number('CD_stopLossPlacement', { optional: true }), actualExitPrice: legacy ? null : r.number('CD_actualExitPrice', { optional: true }),
    profitLoss: r.number('CD_profitLoss', { optional: status !== 'closed' }),
    preTradeNotes: legacy ? null : noteText(record, 'CD_preTradeNotes', key, issues),
    postTradeNotes: legacy ? null : noteText(record, 'CD_postTradeNotes', key, issues),
    ...(!legacy ? journalFields(record, key, issues) : {}),
    startedAt, startedAtMeaning: legacy ? 'created' : 'opened', closedAt,
    accountKey: null, linkStatus: 'unlinked', currency: null,
  };
}

// MARK: - Notities als platte tekst
// Comment NL: Rich text en assets worden nooit als HTML of externe URL geladen.
function noteText(record, name, key, issues) {
  const field = record.fields[name], value = field?.value;
  if ((value == null || value === '') && record.fields[`${name}_ckAsset`]?.value != null) {
    issue(issues, 'unsupported-field-storage', key, name); return null;
  }
  if (value == null) return '';
  if (typeof value !== 'string' || (field.type != null && field.type !== 'STRING') || value.length > 100000) {
    issue(issues, 'invalid-note-text', key, name); return null;
  }
  return value;
}
function mapNote(entry, issues) {
  const { record, key, zone } = entry, r = reader(record, key, issues);
  return { key, recordType: record.recordType, recordName: record.recordName, zone,
    id: r.uuid('CD_id'), title: noteText(record, 'CD_title', key, issues), body: noteText(record, 'CD_body', key, issues),
    accountId: r.uuid('CD_accountID', { optional: true }), tradeId: r.uuid('CD_tradeID', { optional: true }),
    createdAt: r.date('CD_createdAt'), accountKey: null, linkStatus: 'unlinked' };
}

// MARK: - Koppelingen en totalen
function linkTrades(accounts, trades, issues) {
  const byUUID = new Map(), byRecord = new Map();
  const add = (map, key, account) => map.set(key, [...(map.get(key) ?? []), account]);
  const zoneKey = (zone, name) => JSON.stringify([zone.ownerRecordName, zone.zoneName, name]);
  for (const account of accounts) {
    if (account.id) add(byUUID, account.id, account);
    add(byRecord, zoneKey(account.zone, account.recordName), account);
  }
  for (const candidates of byUUID.values()) {
    if (candidates.length > 1) for (const account of candidates) issue(issues, 'duplicate-account-uuid', account.key, 'CD_id');
  }
  for (const trade of trades) {
    const candidates = trade.accountReference === null ? [] : trade.recordType === 'CD_Trade'
      ? byRecord.get(zoneKey(trade.zone, trade.accountReference)) ?? []
      : byUUID.get(trade.accountReference) ?? [];
    if (candidates.length !== 1) {
      trade.linkStatus = candidates.length ? 'ambiguous' : 'unlinked';
      issue(issues, `${trade.linkStatus}-account`, trade.key);
      continue;
    }
    trade.accountKey = candidates[0].key;
    trade.currency = candidates[0].currency;
    trade.linkStatus = 'linked';
  }
}

export function summarize(accounts, trades, issues = []) {
  const balances = new Map();
  let excludedAccounts = 0;
  for (const account of accounts) {
    if (account.currency === null || account.balance === null) { excludedAccounts++; continue; }
    const bucket = balances.get(account.currency) ?? { currency: account.currency, balance: 0, accounts: 0, archivedAccounts: 0 };
    bucket.balance += account.balance;
    bucket.accounts++;
    if (account.archived === true) bucket.archivedAccounts++;
    balances.set(account.currency, bucket);
  }
  for (const bucket of balances.values()) {
    if (!Number.isFinite(bucket.balance)) { bucket.balance = null; issue(issues, 'balance-total-overflow'); }
  }
  return {
    accounts: accounts.length, trades: trades.length,
    legacyTrades: trades.filter(t => t.recordType === 'CD_Trade').length,
    modernTrades: trades.filter(t => t.recordType === 'CD_OpenTrade').length,
    openTrades: trades.filter(t => t.status === 'open').length,
    closedTrades: trades.filter(t => t.status === 'closed').length,
    unknownStatusTrades: trades.filter(t => t.status === null).length,
    unlinkedTrades: trades.filter(t => t.linkStatus === 'unlinked').length,
    ambiguousTrades: trades.filter(t => t.linkStatus === 'ambiguous').length,
    balances: [...balances.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    excludedAccounts, balanceScope: 'all-accounts-including-archived',
  };
}

// MARK: - Publieke offline-interface
export function mapSnapshot({ context, records, collectionStatus }) {
  if (!object(context) || context.container !== 'iCloud.PulseOS.FX'
    || !['development', 'production'].includes(context.environment) || context.database !== 'private'
    || !text(context.sessionId)) throw new TypeError('Explicit PulseFX private database context is required.');
  if (!Array.isArray(records) || !['complete', 'partial'].includes(collectionStatus)) {
    throw new TypeError('Records and explicit collection status are required.');
  }
  const issues = [];
  if (collectionStatus === 'partial') issue(issues, 'partial-collection');
  const { entries, repeatedRecords } = prepare(records, context, issues);
  const accounts = entries.filter(e => e.record.recordType === 'CD_Account').map(e => mapAccount(e, issues));
  const trades = entries.filter(e => ['CD_Trade', 'CD_OpenTrade'].includes(e.record.recordType)).map(e => mapTrade(e, issues));
  linkTrades(accounts, trades, issues);
  for (const trade of trades) trade.blockedEditFields = [...new Set([...(trade.blockedEditFields || []), ...issues.filter(i => i.key === trade.key && i.field && i.code !== 'missing-field').map(i => i.field)])];
  const notes = entries.filter(e => e.record.recordType === 'CD_TradeNote').map(e => mapNote(e, issues));
  for (const note of notes) {
    const matches = accounts.filter(a => a.id && a.id === note.accountId);
    if (matches.length === 1) { note.accountKey = matches[0].key; note.linkStatus = 'linked'; }
    else if (matches.length > 1) note.linkStatus = 'ambiguous';
  }
  const summary = summarize(accounts, trades, issues);
  return {
    source: 'mapped-records', collectionStatus,
    quality: issues.length ? 'needs-review' : 'validated-input',
    accounts, trades, notes, summary, issues, repeatedRecords,
  };
}

// MARK: - Mac-journalvelden
// Comment NL: Ontbrekende waarden blijven onbekend; INT64-tellers zijn geen booleans.
function journalFields(record, key, issues) {
  const result = {};
  for (const name of ['sessionRaw', 'sessionCustom', 'emotionCustom', 'emotionalStateRaw', 'tradeTypeRaw', 'setupTag', 'mistakeTag', 'setupsSelectedRaw', 'mistakesSelectedRaw', 'breakEvenHitRaw', 'weekendHoldRaw']) {
    result[name] = record.fields[`CD_${name}`] || record.fields[`CD_${name}_ckAsset`] ? noteText(record, `CD_${name}`, key, issues) : null;
  }
  result.targetRR = reader(record, key, issues).number('CD_targetRR', { optional: true });
  for (const name of ['confluences', 'slMoved']) {
    const f = record.fields[`CD_${name}`]; result[name] = null;
    if (f?.value == null) continue;
    const valid = (f.type == null || f.type === 'INT64') && (name === 'slMoved' ? [0,1,true,false].includes(f.value) : Number.isSafeInteger(f.value) && f.value >= 0);
    if (valid) result[name] = name === 'slMoved' ? Boolean(f.value) : f.value;
    else issue(issues, 'invalid-field-value', key, `CD_${name}`);
  }
  return result;
}
