import { mapSnapshot, RECORD_TYPES } from './mapper.mjs';

// MARK: - Minimale veldselectie
const companions = names => names.flatMap(name => [name, `${name}_ckAsset`]);
export const DESIRED_KEYS = Object.freeze({
  CD_Account: ['CD_id', 'CD_entityName', ...companions(['CD_name', 'CD_currencyRaw', 'CD_kindRaw']), 'CD_balance', 'CD_startBalance', 'CD_isArchived', 'CD_isFavorite', 'CD_createdAt', 'CD_archivedAt'],
  CD_Trade: ['CD_id', 'CD_entityName', 'CD_account', ...companions(['CD_pair', 'CD_outcomeRaw']), 'CD_lotSize', 'CD_riskPercent', 'CD_profitLoss', 'CD_stopLossPips', 'CD_pipValue', 'CD_createdAt', 'CD_closedAt'],
  CD_OpenTrade: ['CD_id', 'CD_entityName', 'CD_linkedAccountId', ...companions(['CD_symbol', 'CD_statusRaw', 'CD_resultRaw', 'CD_directionRaw']), 'CD_lotSize', 'CD_riskPercent', 'CD_profitLoss', 'CD_finalRR', 'CD_entryPrice', 'CD_stopLossPlacement', 'CD_actualExitPrice', 'CD_openedAt', 'CD_closedAt', ...companions(['CD_preTradeNotes', 'CD_postTradeNotes', 'CD_sessionRaw', 'CD_sessionCustom', 'CD_emotionCustom', 'CD_emotionalStateRaw', 'CD_tradeTypeRaw', 'CD_setupTag', 'CD_mistakeTag', 'CD_setupsSelectedRaw', 'CD_mistakesSelectedRaw', 'CD_breakEvenHitRaw', 'CD_weekendHoldRaw']), 'CD_targetRR', 'CD_confluences', 'CD_slMoved'],
  CD_TradeNote: ['CD_id', 'CD_entityName', 'CD_createdAt', 'CD_accountID', 'CD_tradeID', 'CD_richBodyData', 'CD_richBodyData_ckAsset', ...companions(['CD_title', 'CD_body'])],
});
const allowedErrors = new Set(['AUTHENTICATION_REQUIRED', 'AUTHENTICATION_FAILED', 'ACCESS_DENIED', 'ZONE_NOT_FOUND', 'UNKNOWN_ITEM', 'BAD_REQUEST', 'INVALID_ARGUMENTS', 'QUOTA_EXCEEDED', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'REQUEST_RATE_LIMITED', 'CONFIGURATION_ERROR', 'MANAGED_ACCOUNT_RESTRICTED']);

// MARK: - Veilige fouten
// Comment NL: Geen SDK-reason of ruwe response tonen; die kan tokens of privévelden bevatten.
export class ReadError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function errorCode(error) {
  if (error instanceof ReadError) return error.code;
  return allowedErrors.has(error?.ckErrorCode) ? error.ckErrorCode
    : allowedErrors.has(error?.serverErrorCode) ? error.serverErrorCode : 'READ_FAILED';
}
export const isAuthError = code => ['AUTHENTICATION_REQUIRED', 'AUTHENTICATION_FAILED', 'ACCESS_DENIED', 'MANAGED_ACCOUNT_RESTRICTED'].includes(code);
function checkResponse(response) {
  if (!response || response.hasErrors || response.errors?.length) throw new ReadError(errorCode(response?.errors?.[0]));
  return response;
}
export async function deadline(promise, ms = 15000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new ReadError('TIMEOUT')), ms); })]); }
  finally { clearTimeout(timer); }
}

// MARK: - Uitsluitend toegestane netwerkoperaties
export function readOnlyFetch(config, fetcher = globalThis.fetch) {
  const prefix = `/database/1/${config.containerIdentifier}/${config.environment}/`;
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const operation = url.pathname.slice(prefix.length);
    const method = (init.method || input?.method || 'GET').toUpperCase();
    if (url.origin !== 'https://api.apple-cloudkit.com' || !url.pathname.startsWith(prefix)
      || !['GET', 'POST'].includes(method)
      || !['public/users/caller', 'public/users/current', 'private/users/current', 'private/zones/list', 'private/records/query'].includes(operation)) {
      throw new ReadError('OPERATION_BLOCKED');
    }
    if (operation === 'private/records/query') {
      let body;
      try { body = JSON.parse(init.body); } catch { throw new ReadError('OPERATION_BLOCKED'); }
      const type = body.query?.recordType;
      if (!RECORD_TYPES.includes(type) || !body.zoneID?.zoneName || body.zoneWide
        || !Array.isArray(body.desiredKeys) || !body.desiredKeys.length
        || body.desiredKeys.some(key => !DESIRED_KEYS[type].includes(key))) throw new ReadError('OPERATION_BLOCKED');
    }
    return fetcher(input, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
  };
}

// MARK: - Leessessie
export function createReader({ database, context, requestTimeout = 15000, maxPages = 100, maxRecords = 10000, maxDuration = 60000, includeNotes = false }) {
  let active = true;
  const current = () => { if (!active) throw new ReadError('SESSION_CHANGED'); };
  async function call(promise, timeout = requestTimeout) {
    const response = await deadline(promise, timeout);
    current();
    return checkResponse(response);
  }
  function normalizeZone(zone) {
    if (!zone || typeof zone.zoneName !== 'string' || !zone.zoneName) throw new ReadError('INVALID_RESPONSE');
    if (zone.ownerRecordName != null && (typeof zone.ownerRecordName !== 'string' || !zone.ownerRecordName)) throw new ReadError('INVALID_RESPONSE');
    return { zoneName: zone.zoneName, ownerRecordName: zone.ownerRecordName || context.sessionId };
  }
  return Object.freeze({
    cancel() { active = false; },
    async zones() {
      current();
      const response = await call(database.fetchAllRecordZones());
      if (!Array.isArray(response.zones) || response.zones.length > 200) throw new ReadError('INVALID_RESPONSE');
      return response.zones.map(item => ({ requestZone: { ...item.zoneID }, zone: normalizeZone(item.zoneID) }));
    },
    async read(selected, onProgress = () => {}) {
      current();
      if (!selected?.requestZone?.zoneName) throw new ReadError('INVALID_ZONE');
      const zone = normalizeZone(selected.zone);
      const records = [], failures = [], coverage = [];
      let pages = 0;
      const started = Date.now();
      for (const type of RECORD_TYPES.filter(type => includeNotes || type !== 'CD_TradeNote')) {
        const query = { recordType: type, filterBy: [{ fieldName: 'CD_entityName', comparator: 'EQUALS', fieldValue: { value: type.slice(3) } }] };
        const options = { zoneID: selected.requestZone, desiredKeys: DESIRED_KEYS[type], resultsLimit: 200, numbersAsStrings: false };
        let next = query, complete = false, count = 0;
        const markers = new Set();
        try {
          do {
            current();
            const remaining = maxDuration - (Date.now() - started);
            if (++pages > maxPages || remaining <= 0) throw new ReadError('READ_LIMIT');
            const response = await call(database.performQuery(next, options), Math.min(requestTimeout, remaining));
            if (!Array.isArray(response.records) || typeof response.moreComing !== 'boolean') throw new ReadError('INVALID_RESPONSE');
            if (records.length + response.records.length > maxRecords) throw new ReadError('READ_LIMIT');
            for (const record of response.records) {
              if (!record || record.recordType !== type || typeof record.recordName !== 'string'
                || !record.fields || record.deleted) throw new ReadError('INVALID_RESPONSE');
              // Comment NL: Zonecontext komt uit de expliciete aanvraag, niet uit een veronderstelde SDK-recordproperty.
              records.push({ recordType: type, recordName: record.recordName, recordChangeTag: record.recordChangeTag, fields: record.fields, zoneID: zone });
              count++;
            }
            onProgress({ type, pages, records: records.length });
            if (!response.moreComing) { complete = true; break; }
            if (typeof response.continuationMarker !== 'string' || !response.continuationMarker || markers.has(response.continuationMarker)) throw new ReadError('CURSOR_LOOP');
            markers.add(response.continuationMarker);
            next = response;
          } while (true);
        } catch (error) {
          current();
          const code = errorCode(error);
          if (isAuthError(code)) { active = false; throw new ReadError(code); }
          failures.push({ type, code });
        }
        coverage.push({ type, received: count, complete });
      }
      current();
      return { ...mapSnapshot({ context, records, collectionStatus: failures.some(f => f.type !== 'CD_TradeNote') ? 'partial' : 'complete' }),
        notesStatus: !includeNotes ? 'not-requested' : failures.some(f => f.type === 'CD_TradeNote') ? 'partial' : 'complete', fetchedAt: new Date().toISOString(), environment: context.environment, zone, failures, coverage, pages };
    },
  });
}
