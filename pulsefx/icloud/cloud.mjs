import { createReader, readOnlyFetch, deadline, errorCode, isAuthError } from './reader.mjs';

// MARK: - Veilige DOM-weergave
const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const element = document.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; };
const status = message => { $('status').textContent = message; };
const money = (value, currency) => value === null ? 'Unknown amount' : currency
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) : `${value} · currency unknown`;
const utc = value => value ? `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC` : 'Unknown date';
const card = (label, value, detail) => { const element = node('article', null, 'fx-card'); element.append(node('span', label), node('strong', value), node('small', detail)); return element; };
const option = (label, value) => { const item = node('option', label); item.value = value; return item; };
const state = { config: null, container: null, reader: null, identity: null, generation: 0, zones: [], snapshot: null, stale: false, started: false, busy: false, networkActive: false };
const messages = {
  AUTHENTICATION_REQUIRED: 'Your Apple session expired. Disconnect and start again.',
  AUTHENTICATION_FAILED: 'Apple authentication failed. Disconnect and start again.',
  ACCESS_DENIED: 'Apple denied access. Check the container, environment and account access.',
  MANAGED_ACCOUNT_RESTRICTED: 'Apple has restricted this account. Data has been cleared.',
  BAD_REQUEST: 'The query was rejected. Check the schema and CD_entityName index; nothing was changed.',
  INVALID_ARGUMENTS: 'The query was rejected. Check the schema and configured environment.',
  TIMEOUT: 'The request timed out. Retry when the connection is stable.',
  READ_LIMIT: 'The read limit was reached. These results are incomplete.',
  CURSOR_LOOP: 'Apple returned a repeated pagination marker. These results are incomplete.',
  INVALID_RESPONSE: 'An unexpected response needs investigation. No data was changed.',
  OPERATION_BLOCKED: 'An operation outside the read-only allowlist was blocked.',
};
const describe = code => messages[code] || `The read could not be completed (${code}). Check your configuration or try again.`;

// MARK: - Sessie-isolatie
function clearView() {
  state.reader?.cancel(); state.reader = null; state.generation++; state.busy = false;
  state.zones = []; state.snapshot = null; state.stale = false;
  $('zone').replaceChildren(); $('zone-panel').hidden = true; $('results').hidden = true;
  for (const id of ['accounts', 'trades', 'balances', 'coverage', 'issues']) $(id).replaceChildren();
  $('account-filter').replaceChildren(option('All accounts', 'all'));
  $('trade-status').value = 'all'; $('trade-model').value = 'all'; $('archive').value = 'all';
  $('fetched').textContent = ''; $('quality').textContent = ''; $('trade-count').textContent = '';
}
function makeReader() {
  state.reader?.cancel();
  state.reader = createReader({ database: state.container.privateCloudDatabase,
    context: { container: state.config.containerIdentifier, environment: state.config.environment, database: 'private', sessionId: state.identity } });
  return state.reader;
}
function busy(value) {
  state.busy = value;
  $('read').disabled = value || !state.identity || $('zone').value === '';
  $('refresh').disabled = value; $('zones-refresh').disabled = value;
}
function endSession(message = 'Disconnected. Data has been cleared from this page.') {
  clearView(); state.identity = null; state.networkActive = false;
  try { state.container?.signOut(); } catch { /* Comment NL: Lokale data wordt ook bij SDK-fouten gewist. */ }
  $('disconnect').hidden = true;
  $('apple-sign-in-button').hidden = true; $('apple-sign-out-button').hidden = true;
  $('start').hidden = false; $('start').disabled = false; $('start').textContent = 'Reload to reconnect';
  status(message);
}
async function listZones() {
  clearView();
  const generation = state.generation;
  const reader = makeReader();
  busy(true); status('Reading private zones…');
  try {
    const zones = await reader.zones();
    if (generation !== state.generation) return;
    state.zones = zones;
    $('zone').replaceChildren(option('Choose a zone', ''), ...zones.map((item, index) => option(item.zone.zoneName, String(index))));
    $('zone-panel').hidden = false;
    status(zones.length ? 'Signed in through Apple. Select a zone, then read its records.' : 'Signed in. No private zones were returned in this environment. No records were created.');
  } catch (error) {
    if (generation !== state.generation) return;
    const code = errorCode(error);
    if (isAuthError(code)) endSession(describe(code));
    else { $('zone-panel').hidden = false; status(describe(code)); }
  } finally { if (generation === state.generation) busy(false); }
}
function acceptIdentity(identity) {
  const id = identity?.userRecordName;
  if (typeof id !== 'string' || !id) { endSession('Apple returned no valid user identity. Data has been cleared.'); return; }
  if (state.identity === id) return;
  clearView(); state.identity = id; $('disconnect').hidden = false;
  void listZones();
}

// MARK: - SDK alleen na bewuste gebruikersactie
async function loadSDK() {
  if (globalThis.CloudKit) return globalThis.CloudKit;
  await deadline(new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://cdn.apple-cloudkit.com/ck/2/cloudkit.js'; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error('SDK unavailable')); document.head.append(script);
  }));
  if (!globalThis.CloudKit) throw new Error('SDK unavailable');
  return globalThis.CloudKit;
}
async function start() {
  if (state.started) { location.reload(); return; }
  state.started = true; $('start').disabled = true; status('Loading Apple’s sign-in service…');
  const initialGeneration = state.generation;
  try {
    const sdk = await loadSDK();
    if (initialGeneration !== state.generation) return;
    state.networkActive = true;
    const quiet = () => {};
    const guardedFetch = readOnlyFetch(state.config, globalThis.fetch.bind(globalThis));
    sdk.configure({ containers: [{ containerIdentifier: state.config.containerIdentifier, environment: state.config.environment,
      apiTokenAuth: { apiToken: state.config.apiToken, persist: false, signInButton: { id: 'apple-sign-in-button', theme: 'white-with-outline' }, signOutButton: { id: 'apple-sign-out-button', theme: 'white-with-outline' } } }],
      services: { fetch: (...args) => state.networkActive ? guardedFetch(...args) : Promise.reject(new Error('Session closed')), logger: { info: quiet, log: quiet, warn: quiet, error: quiet } } });
    state.container = sdk.getDefaultContainer();
    // Comment NL: Eén aanmelding per paginalevensduur. Na afmelden volgt een schone herlaadactie.
    state.container.whenUserSignsOut().then(() => {
      if (state.identity) endSession();
    }).catch(() => endSession('The Apple session ended. Data has been cleared.'));
    state.container.whenUserSignsIn().then(identity => {
      if (initialGeneration === state.generation) acceptIdentity(identity);
    }).catch(() => endSession('Apple sign-in was not completed. Reload to try again.'));
    const identity = await deadline(state.container.setUpAuth());
    $('start').hidden = true;
    if (initialGeneration === state.generation) {
      if (identity) acceptIdentity(identity);
      else status('Continue in Apple’s sign-in window using the button above. No data has been read.');
    }
  } catch (error) { endSession(`Could not start the iCloud test. ${describe(errorCode(error))}`); }
}

// MARK: - Begrensde leesrun
async function readSelected() {
  const selected = state.zones[Number($('zone').value)];
  if (!state.identity || !selected || $('zone').value === '' || state.busy) return;
  const generation = ++state.generation;
  const reader = makeReader();
  busy(true); status('Reading accounts and trades…');
  try {
    // Comment NL: Sessieverval en een ander Apple-account eerst detecteren; geen oude gegevens vermengen.
    const identity = await deadline(state.container.setUpAuth());
    if (generation !== state.generation) return;
    if (!identity || identity.userRecordName !== state.identity) { endSession('The Apple account changed or signed out. Reconnect to read its data.'); return; }
    const snapshot = await reader.read(selected, progress => {
      if (generation === state.generation) status(`Reading ${progress.type} · ${progress.pages} pages · ${progress.records} records received…`);
    });
    if (generation !== state.generation) return;
    if (snapshot.collectionStatus === 'partial' && state.snapshot?.collectionStatus === 'complete') {
      state.stale = true; render();
      status(`Refresh incomplete. Showing the previous fetch, now marked stale. ${snapshot.failures.map(f => `${f.type}: ${describe(f.code)}`).join(' ')}`);
    } else {
      state.snapshot = snapshot; state.stale = false; render(true);
      status(snapshot.collectionStatus === 'complete' ? 'Selected queries finished. Compare these records with your native app; this does not confirm full device synchronization.' : `Partial results. ${snapshot.failures.map(f => `${f.type}: ${describe(f.code)}`).join(' ')}`);
    }
  } catch (error) {
    if (generation !== state.generation) return;
    const code = errorCode(error);
    if (isAuthError(code)) endSession(describe(code));
    else { state.stale = true; if (state.snapshot) render(); status(describe(code)); }
  } finally { if (generation === state.generation) busy(false); }
}

// MARK: - Accounts, journal en datakwaliteit
function render(resetFilters = false) {
  const data = state.snapshot;
  if (!data) return;
  $('results').hidden = false;
  $('fetched').textContent = `Last fetched from iCloud: ${utc(data.fetchedAt)} · ${data.environment} · ${data.zone.zoneName}`;
  const incomplete = data.collectionStatus !== 'complete';
  $('quality').classList.toggle('warning', incomplete || state.stale || data.issues.length > 0);
  $('quality').textContent = `${state.stale ? 'Stale results. The latest refresh did not complete. ' : ''}${incomplete ? 'Partial results: some queries failed. Balances are withheld. ' : 'Selected queries finished. '}${data.issues.length} data check(s) need review. This covers one zone and three record types, not all PulseFX data.`;
  $('coverage').replaceChildren(...data.coverage.map(c => card(c.type, String(c.received), c.complete ? 'All query pages received' : 'Incomplete query')));
  $('balances').replaceChildren(...(incomplete ? [node('p', 'Totals are unavailable while the read is incomplete.')] : data.summary.balances.map(b => card(b.currency, money(b.balance, b.currency), `${b.accounts} accounts · ${b.archivedAccounts} archived · ${data.summary.excludedAccounts} accounts excluded overall${data.issues.length ? ' · review data checks before relying on totals' : ''}`))));
  if (!incomplete && !data.summary.balances.length) $('balances').append(node('p', 'No known balances returned. This does not prove that your native data is empty.'));
  if (resetFilters) {
    $('account-filter').replaceChildren(option('All accounts', 'all'), option('Unlinked or ambiguous', 'unlinked'), ...data.accounts.map(a => option(a.name || 'Unknown account', a.key)));
    $('trade-status').value = 'all'; $('trade-model').value = 'all'; $('archive').value = 'all';
  }
  const archive = $('archive').value;
  const accounts = data.accounts.filter(a => archive === 'all' || (archive === 'archived' ? a.archived === true : a.archived === false));
  $('accounts').replaceChildren(...accounts.map(a => {
    const trades = data.trades.filter(t => t.accountKey === a.key);
    const element = card(a.name || 'Unknown account', money(a.balance, a.currency), `${a.kind || 'Unknown type'} · ${a.archived === true ? 'Archived' : a.archived === false ? 'Active' : 'Unknown archive status'}`);
    const details = node('details'); details.append(node('summary', 'Account details'));
    for (const line of [`Starting balance: ${money(a.startBalance, a.currency)}`, `Created: ${utc(a.createdAt)}`, `${trades.filter(t => t.status === 'open').length} open · ${trades.filter(t => t.status === 'closed').length} closed · ${trades.filter(t => !t.status).length} unknown`, `Record: ${a.recordName}`]) details.append(node('p', line));
    const button = node('button', 'View trades', 'text-button'); button.type = 'button';
    button.onclick = () => { $('account-filter').value = a.key; $('trade-status').value = 'all'; $('trade-model').value = 'all'; renderTrades(); $('account-filter').focus(); };
    element.append(details, button); return element;
  }));
  if (!accounts.length) $('accounts').append(node('p', 'No accounts in this view. Check the selected zone, environment and data checks.'));
  const counts = new Map();
  for (const item of data.issues) { const label = `${item.code}${item.field ? ` · ${item.field}` : ''}`; counts.set(label, (counts.get(label) || 0) + 1); }
  $('issues').replaceChildren(...[...counts].map(([label, count]) => node('li', `${label}: ${count}`)), ...data.failures.map(f => node('li', `${f.type}: ${describe(f.code)}`)));
  if (!data.issues.length && !data.failures.length) $('issues').append(node('li', 'No mapping issues detected in the returned records. Completeness still requires comparison with the native app.'));
  renderTrades();
}
function renderTrades() {
  const data = state.snapshot; if (!data) return;
  const account = $('account-filter').value, filterStatus = $('trade-status').value, model = $('trade-model').value;
  const names = new Map(data.accounts.map(a => [a.key, a.name || 'Unknown account']));
  const trades = data.trades.filter(t => (account === 'all' || (account === 'unlinked' ? !t.accountKey : t.accountKey === account))
    && (filterStatus === 'all' || (filterStatus === 'unknown' ? !t.status : t.status === filterStatus)) && (model === 'all' || t.recordType === model));
  $('trade-count').textContent = `${trades.length} of ${data.trades.length} mapped trades · ${data.summary.unlinkedTrades} unlinked · ${data.summary.ambiguousTrades} ambiguous. Dates are UTC.`;
  $('trades').replaceChildren(...trades.map(t => {
    const row = node('tr');
    for (const value of [t.instrument || 'Unknown instrument', names.get(t.accountKey) || (t.linkStatus === 'ambiguous' ? 'Ambiguous account' : 'Unlinked'),
      `${utc(t.closedAt || t.startedAt)}${!t.closedAt && t.startedAtMeaning === 'created' ? ' · created' : ''}`, t.recordType === 'CD_Trade' ? 'Legacy' : 'Modern',
      `${t.status || 'Unknown'} / ${t.result || 'Unknown'}${!t.outcomeConsistent ? ' · check' : ''}`, t.lotSize === null ? 'Unknown' : String(t.lotSize),
      t.status === 'open' ? 'No live P&L' : money(t.profitLoss, t.currency)]) row.append(node('td', value));
    return row;
  }));
  if (!trades.length) { const row = node('tr'), cell = node('td', 'No trades match these filters.'); cell.colSpan = 7; row.append(cell); $('trades').append(row); }
}

// MARK: - Opstarten zonder Apple-verkeer
$('start').addEventListener('click', start);
$('disconnect').addEventListener('click', () => endSession());
$('read').addEventListener('click', readSelected); $('refresh').addEventListener('click', readSelected);
$('zones-refresh').addEventListener('click', () => { if (state.identity && !state.busy) void listZones(); });
$('zone').addEventListener('change', () => {
  state.reader?.cancel(); state.generation++; state.busy = false; state.snapshot = null; state.stale = false;
  $('results').hidden = true;
  for (const id of ['accounts', 'trades', 'balances', 'coverage', 'issues']) $(id).replaceChildren();
  busy(false); status('Zone selection changed. Read it to load its records.');
});
$('archive').addEventListener('change', () => render());
for (const id of ['account-filter', 'trade-status', 'trade-model']) $(id).addEventListener('change', renderTrades);
addEventListener('pagehide', () => { endSession(); });
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

try {
  const response = await fetch('/api/pulsefx-config', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Config unavailable');
  const config = await response.json();
  if (!config.enabled) {
    $('configuration').textContent = 'Not configured. The site owner must enable this test and set the CloudKit token, environment and exact HTTPS origin in the deployment settings.';
  } else if (config.containerIdentifier !== 'iCloud.PulseOS.FX' || !['development', 'production'].includes(config.environment)
    || config.origin !== location.origin || location.protocol !== 'https:' || typeof config.apiToken !== 'string' || !config.apiToken) {
    throw new Error('Invalid config');
  } else {
    state.config = config; $('environment').textContent = `${config.environment === 'production' ? 'Production' : 'Development'} · private`;
    $('configuration').textContent = `${config.environment === 'production' ? 'Production: reads the selected account’s live cloud records.' : 'Development: a separate dataset from the released apps.'} Nothing is loaded until you start and sign in through Apple.`;
    $('start').disabled = false;
  }
} catch {
  $('configuration').textContent = 'Configuration unavailable. This page needs the Cloudflare Pages Function and a matching HTTPS deployment. The demo remains available.';
}
