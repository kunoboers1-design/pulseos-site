// MARK: - Fictieve fixtures
// Comment NL: Handmatig gemaakte voorbeelden; geen exports of waarden uit gebruikersopslag.
export const context = Object.freeze({ container: 'iCloud.PulseOS.FX', environment: 'development', database: 'private', sessionId: 'offline-fixture-session' });
export const zone = Object.freeze({ zoneName: 'SyntheticZone', ownerRecordName: 'SyntheticOwner' });
export const uuid = n => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = Date.parse('2026-01-12T10:00:00Z');
export const field = value => ({ value });
export const fields = values => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, field(v)]));
export function account(name, id, currency = 'EUR', balance = 1200) {
  return { recordType: 'CD_Account', recordName: name, zoneID: { ...zone }, fields: fields({
    CD_id: id, CD_name: `Synthetic ${name}`, CD_currencyRaw: currency, CD_kindRaw: 'phase',
    CD_balance: balance, CD_startBalance: 1000, CD_isArchived: 0, CD_isFavorite: 1,
    CD_createdAt: date - 86400000,
  }) };
}
export function legacy(name, id, parent = 'account-record-a', outcome = 'tp', pnl = 40) {
  return { recordType: 'CD_Trade', recordName: name, zoneID: { ...zone }, fields: fields({
    CD_id: id, CD_pair: 'EURUSD', CD_account: parent, CD_outcomeRaw: outcome,
    CD_lotSize: 0.1, CD_riskPercent: 1, CD_profitLoss: pnl, CD_createdAt: date,
    CD_closedAt: outcome === 'open' ? null : date + 3600000,
  }) };
}
export function modern(name, id, parent = uuid(2)) {
  return { recordType: 'CD_OpenTrade', recordName: name, zoneID: { ...zone }, fields: fields({
    CD_id: id, CD_symbol: 'EURUSD', CD_linkedAccountId: parent, CD_statusRaw: 'closed',
    CD_resultRaw: 'win', CD_directionRaw: 'long', CD_lotSize: 0.1, CD_riskPercent: 1,
    CD_profitLoss: 20, CD_openedAt: date, CD_closedAt: date + 3600000,
  }) };
}
export function sample() {
  return { context: { ...context }, collectionStatus: 'complete', records: [
    account('account-record-a', uuid(1)), account('account-record-b', uuid(2), 'USD', 2300),
    legacy('legacy-a1', uuid(11)), legacy('legacy-a2', uuid(12), 'account-record-a', 'sl', -15),
    legacy('legacy-a3', uuid(13), 'account-record-a', 'be', -2),
    legacy('legacy-b1', uuid(14), 'account-record-b', 'tp', 30), modern('modern-b1', uuid(15)),
  ] };
}
