import { openAccountDetail } from './account-detail.mjs';
import { planNote, commitNote, demoNote } from './note-write.mjs';
import { planEdit, commitEdit, applyDemoEdit } from './edit-trade.mjs';
import { mountAutoRefresh } from './auto-refresh.mjs';
import { mountPremium } from './premium.mjs';
const premium = mountPremium(document.getElementById('premium-statistics'), { friends: true });
import { mountWorkspace, workspaceDemo } from './workspace.mjs';
import { closeDemo, commitClose, closeTransport } from './close-trade.mjs';
import { summarize } from './mapper.mjs';

import { createReader, deadline, errorCode, isAuthError } from './reader.mjs';

// MARK: - Veilige DOM-weergave
const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const element = document.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; };
const status = message => {
  $('status').textContent = message;
  if (document.documentElement.dataset.icloudRestoring && $('restore-progress')) $('restore-progress').textContent = message;
};
function finishRestore(needsConnection = false) {
  if (!document.documentElement.hasAttribute('data-icloud-restoring')) return;
  document.documentElement.removeAttribute('data-icloud-restoring');
  if (needsConnection) workspace.show('connection');
  window.dispatchEvent(new Event('resize'));
}
const money = (value, currency) => value === null ? 'Unknown amount' : currency
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) : `${value} · currency unknown`;
const utc = value => value ? `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC` : 'Unknown date';
const card = (label, value, detail) => { const element = node('article', null, 'fx-card'); element.append(node('span', label), node('strong', value), node('small', detail)); return element; };
const option = (label, value) => { const item = node('option', label); item.value = value; return item; };
const state = { config: null, container: null, reader: null, identity: null, generation: 0, zones: [], snapshot: null, stale: false, started: false, busy: false, networkActive: false };
const demoMode = !document.body.hasAttribute('data-login-entry') && new URLSearchParams(location.search).get('workspace') === 'demo';
let transport = null;
const workspace = mountWorkspace({ getSnapshot: () => state.snapshot, isDemo: demoMode,
  canClose: trade => demoMode || Boolean((state.config?.tradeClosingEnabled === true || (state.config?.closeTradePilotId && trade.id === state.config.closeTradePilotId.toLowerCase())) && !state.stale && !state.busy),
  canEdit: () => !state.busy && !state.stale && (demoMode || state.config?.tradeEditingEnabled === true),
  onEdit: async (key, changes) => {
    if (state.busy || state.stale) throw new Error('Refresh before editing this trade.');
    const plan = planEdit(state.snapshot, key, changes);
    if (demoMode) {
      state.snapshot = applyDemoEdit(state.snapshot, plan); state.snapshot.summary = summarize(state.snapshot.accounts, state.snapshot.trades); render();
      return { trade: state.snapshot.trades.find(t => t.key === key), snapshot: state.snapshot };
    }
    const generation = state.generation, selected = state.zones[Number($('zone').value)];
    busy(true);
    try {
      const identity = await deadline(state.container.setUpAuth());
      if (generation !== state.generation || identity?.userRecordName !== state.identity) throw new Error('Apple session changed. Reconnect before saving.');
      await commitEdit({ plan, config: state.config, database: state.container.privateCloudDatabase, selected, transport });
      if (generation !== state.generation) throw new Error('Session changed during save. Reconnect and check the native app.');
      state.stale = true;
    } catch (error) {
      state.stale = true; status(error.message); throw error;
    } finally { if (generation === state.generation) busy(false); }
    await readSelected();
    if (state.stale || state.snapshot?.collectionStatus !== 'complete') throw new Error('Save was acknowledged, but refresh failed. Close this window and refresh before editing again.');
    const saved = state.snapshot.trades.find(t => t.key === key);
    if (!saved) throw new Error('The trade was not returned after saving. Refresh and check the native app.');
    if (Object.entries(plan.patch).some(([field, value]) => saved[field] !== value)) { state.stale = true; throw new Error('The refreshed trade differs from your changes. Close this window and review the latest data before editing again.'); }
    return { trade: saved, snapshot: state.snapshot };
  },
  canEditNotes: () => !state.busy && !state.stale && state.snapshot?.notesStatus === 'complete' && (demoMode || state.config?.noteEditingEnabled === true),
  onSaveNote: async (key, input, identity) => {
    if (state.busy || state.stale) throw new Error('Refresh before saving notes.');
    const selected = state.zones[Number($('zone').value)];
    const zone = demoMode ? { zoneName: 'DemoZone', ownerRecordName: 'demo' } : selected?.zone;
    const plan = planNote(state.snapshot, key, input, zone, identity);
    if (demoMode) { state.snapshot = demoNote(state.snapshot, plan); render(); return state.snapshot.notes.find(n => n.id === plan.id); }
    const generation = state.generation; busy(true);
    try {
      const user = await deadline(state.container.setUpAuth());
      if (generation !== state.generation || user?.userRecordName !== state.identity) throw new Error('Apple session changed. Reconnect before saving.');
      await commitNote({ plan, config: state.config, database: state.container.privateCloudDatabase, selected, transport });
      if (generation !== state.generation) throw new Error('Session changed during save. Refresh and check whether the note exists.');
      state.stale = true;
    } catch (error) { state.stale = true; status(error.message); throw error; }
    finally { if (generation === state.generation) busy(false); }
    await readSelected();
    const matches = state.snapshot?.notes.filter(n => n.id === plan.id) || [];
    if (state.stale || state.snapshot?.notesStatus !== 'complete' || matches.length !== 1 || matches[0].title !== plan.title || matches[0].body !== plan.body || plan.records[0].fields.CD_richBodyData && matches[0].hasRichText) {
      state.stale = true; throw new Error('The save could not be verified after refresh. Close the editor and check the latest notes before retrying.');
    }
    return matches[0];
  },
  onDemoReset: () => { state.snapshot = workspaceDemo(); state.snapshot.summary = summarize(state.snapshot.accounts, state.snapshot.trades); render(true); },
  onClose: async plan => {
    if (demoMode) { state.snapshot = closeDemo(state.snapshot, plan); state.snapshot.summary = summarize(state.snapshot.accounts, state.snapshot.trades); render(); return; }
    if (state.busy || state.stale || state.snapshot?.collectionStatus !== 'complete') throw new Error('Refresh the workspace before closing a trade.');
    const generation = state.generation, selected = state.zones[Number($('zone').value)];
    busy(true);
    try {
      const identity = await deadline(state.container.setUpAuth());
      if (generation !== state.generation || identity?.userRecordName !== state.identity) throw new Error('Your Apple session changed. Reconnect before continuing.');
      await commitClose({ plan, config: state.config, database: state.container.privateCloudDatabase, selected, transport });
      if (generation !== state.generation) throw new Error('Session changed during save. Reconnect and check the result.');
      state.stale = true; render(); status('Close saved to iCloud. Refreshing the workspace; check your native app after sync.');
    } catch (error) {
      state.stale = true; render(); status(error.message); throw error;
    } finally { if (generation === state.generation) busy(false); }
    await readSelected();
  },
});
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
  premium.clear();
  transport?.disarm();
  state.reader?.cancel(); state.reader = null; state.generation++; state.busy = false;
  state.zones = []; state.snapshot = null; state.stale = false; workspace.clear();
  $('zone').replaceChildren(); $('zone-panel').hidden = true; $('results').hidden = true;
  for (const id of ['accounts', 'trades', 'balances', 'coverage', 'issues']) $(id).replaceChildren();
  $('account-filter').replaceChildren(option('All accounts', 'all'));
  $('trade-status').value = 'all'; $('trade-model').value = 'all'; $('archive').value = 'all';
  $('fetched').textContent = ''; $('quality').textContent = ''; $('trade-count').textContent = '';
}
function makeReader() {
  state.reader?.cancel();
  state.reader = createReader({ includeNotes: true, database: state.container.privateCloudDatabase,
    context: { container: state.config.containerIdentifier, environment: state.config.environment, database: 'private', sessionId: state.identity } });
  return state.reader;
}
function busy(value) {
  state.busy = value;
  $('read').disabled = value || !state.identity || $('zone').value === '';
  $('zone').disabled = value;
  $('refresh').disabled = value; $('zones-refresh').disabled = value;
}
function endSession(message = 'Disconnected. Data and the remembered Apple session have been cleared.') {
  forgetRememberedSession();
  clearView(); workspace.show('connection'); state.identity = null; state.networkActive = false;
  try { state.container?.signOut(); } catch { /* Comment NL: Lokale data wordt ook bij SDK-fouten gewist. */ }
  $('disconnect').hidden = true;
  $('apple-sign-in-button').hidden = true; $('apple-sign-out-button').hidden = true;
  $('start').hidden = false; $('start').disabled = false; $('start').textContent = 'Reload to reconnect';
  status(message); finishRestore(true);
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
  // Comment NL: De bekende native zone openen vanuit de welkomstpagina of een herstelde sessie.
  if (generation === state.generation && (document.body.hasAttribute('data-login-entry') || restoreSession)) {
    const matches = state.zones.map((item, index) => ({ item, index })).filter(({ item }) => item.zone.zoneName === 'com.apple.coredata.cloudkit.zone');
    if (matches.length === 1) { $('zone').value = String(matches[0].index); await readSelected(); }
    else finishRestore(true);
  }
}
function acceptIdentity(identity) {
  const id = identity?.userRecordName;
  if (typeof id !== 'string' || !id) { endSession('Apple returned no valid user identity. Data has been cleared.'); return; }
  if (state.identity === id) return;
  clearView(); state.identity = id; $('disconnect').hidden = false;
  const url = new URL(location.href);
  if (url.searchParams.has('restore')) { url.searchParams.delete('restore'); history.replaceState(null, '', url); }
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
// MARK: - Optionele Apple-sessie; nooit zelf een token of wachtwoord opslaan
const rememberKey = 'pulsefx-remember-icloud';
let rememberSession = true, restoreSession = false;
try {
  const saved = localStorage.getItem(rememberKey);
  rememberSession = saved !== 'false';
  restoreSession = saved === 'true' && new URLSearchParams(location.search).get('restore') !== 'manual';
} catch { rememberSession = false; }
$('remember-icloud').checked = rememberSession;
function forgetRememberedSession() {
  rememberSession = false; $('remember-icloud').checked = false;
  try { localStorage.setItem(rememberKey, 'false'); } catch {}
}
$('remember-icloud').addEventListener('change', () => {
  rememberSession = $('remember-icloud').checked;
  try {
    if (rememberSession) localStorage.setItem(rememberKey, 'true');
    else localStorage.setItem(rememberKey, 'false');
  } catch {
    rememberSession = false; $('remember-icloud').checked = false;
    $('remember-status').textContent = 'Browser storage is unavailable. This connection will last for this page only.';
  }
});
async function start() {
  if (state.started) { location.reload(); return; }
  try { localStorage.setItem(rememberKey, String(rememberSession)); } catch { rememberSession = false; $('remember-icloud').checked = false; }
  state.started = true; $('remember-icloud').disabled = true; $('start').disabled = true; status('Loading Apple’s sign-in service…');
  const initialGeneration = state.generation;
  try {
    const sdk = await loadSDK();
    if (initialGeneration !== state.generation) return;
    state.networkActive = true;
    const quiet = () => {};
    transport = closeTransport(state.config, globalThis.fetch.bind(globalThis));
    const guardedFetch = transport.fetch;
    sdk.configure({ containers: [{ containerIdentifier: state.config.containerIdentifier, environment: state.config.environment,
      apiTokenAuth: { apiToken: state.config.apiToken, persist: rememberSession, signInButton: { id: 'apple-sign-in-button', theme: 'white-with-outline' }, signOutButton: { id: 'apple-sign-out-button', theme: 'white-with-outline' } } }],
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
      else { status('Continue in Apple’s sign-in window using the button above. No data has been read.'); finishRestore(true); }
    }
  } catch (error) { endSession(`Could not start the iCloud test. ${describe(errorCode(error))}`); }
}

// MARK: - Begrensde leesrun
async function readSelected({ automatic = false } = {}) {
  const selected = state.zones[Number($('zone').value)];
  if (!state.identity || !selected || $('zone').value === '' || state.busy) return;
  const generation = ++state.generation;
  const reader = makeReader();
  if (!automatic) premium.setSnapshot(null);
  busy(true); status('Reading accounts, trades and notes…');
  try {
    // Comment NL: Sessieverval en een ander Apple-account eerst detecteren; geen oude gegevens vermengen.
    const identity = await deadline(state.container.setUpAuth());
    if (generation !== state.generation) return;
    if (!identity || identity.userRecordName !== state.identity) { endSession('The Apple account changed or signed out. Reconnect to read its data.'); return; }
    const snapshot = await reader.read(selected, progress => {
      if (generation === state.generation) status(`Reading ${progress.type} · ${progress.pages} pages · ${progress.records} records received…`);
    });
    if (generation !== state.generation) return;
    // Comment NL: Een tijdens de aanvraag geopend sluitformulier nooit overschrijven.
    if (automatic && ($('close-dialog').open || Boolean(document.getElementById('trade-detail-dialog')?.open || document.getElementById('account-detail-dialog')?.open || document.getElementById('note-editor-dialog')?.open))) return;
    if (snapshot.collectionStatus === 'partial' && state.snapshot?.collectionStatus === 'complete') {
      state.stale = true; render();
      status(`Refresh incomplete. Showing the previous fetch, now marked stale. ${snapshot.failures.map(f => `${f.type}: ${describe(f.code)}`).join(' ')}`);
    } else {
      state.snapshot = snapshot; state.stale = false;
      // Comment NL: De leesactie is klaar; render opslagknoppen met de actuele beschikbaarheid.
      busy(false); render(!automatic);
      if (snapshot.collectionStatus === 'complete') document.dispatchEvent(new Event('pulsefx:workspace-ready'));
      status(snapshot.collectionStatus === 'complete' ? 'Selected queries finished. Compare these records with your native app; this does not confirm full device synchronization.' : `Partial results. ${snapshot.failures.map(f => `${f.type}: ${describe(f.code)}`).join(' ')}`);
    }
  } catch (error) {
    if (generation !== state.generation) return;
    const code = errorCode(error);
    if (isAuthError(code)) endSession(describe(code));
    else { state.stale = true; if (state.snapshot && !(automatic && ($('close-dialog').open || Boolean(document.getElementById('trade-detail-dialog')?.open || document.getElementById('account-detail-dialog')?.open || document.getElementById('note-editor-dialog')?.open)))) render(); status(describe(code)); }
  } finally { if (generation === state.generation) { busy(false); finishRestore(!state.snapshot); } }
}

// MARK: - Accounts, journal en datakwaliteit
function render(resetFilters = false) {
  const data = state.snapshot;
  premium.setSnapshot(data, state.stale);
  if (!data) return;
  $('results').hidden = false;
  $('auto-refresh-info').hidden = data.source === 'demo';
  $('fetched').textContent = data.source === 'demo' ? 'Demo mode · fictional accounts, trades and notes. Changes last until this page is reloaded.' : `Last fetched from iCloud: ${utc(data.fetchedAt)} · ${data.environment} · ${data.zone.zoneName}`;
  const incomplete = data.collectionStatus !== 'complete';
  document.body.classList.toggle('workspace-demo', data.source === 'demo');
  $('quality').classList.toggle('warning', incomplete || state.stale || data.issues.length > 0);
  $('quality').textContent = data.source === 'demo' ? 'Fictional workspace. No iCloud records have been read or changed.' : `${state.stale ? 'Stale results. The latest refresh did not complete. ' : ''}${incomplete ? 'Partial results: some queries failed. Balances are withheld. ' : 'Selected queries finished. '}${data.issues.length} data check(s) need review. This covers one zone and the requested record types. Photos and attachments are not loaded.`;
  $('coverage').replaceChildren(...data.coverage.map(c => card(c.type, String(c.received), c.complete ? 'All query pages received' : 'Incomplete query')));
  $('balances').replaceChildren(...(incomplete ? [node('p', 'Totals are unavailable while the read is incomplete.')] : data.summary.balances.map(b => card(b.currency, money(b.balance, b.currency), `${b.accounts} accounts · ${b.archivedAccounts} archived · ${data.summary.excludedAccounts} accounts excluded overall${data.issues.length ? ' · review data checks before relying on totals' : ''}`))));
  if (!incomplete && !data.summary.balances.length) $('balances').append(node('p', 'No known balances returned. This does not prove that your native data is empty.'));
  if (resetFilters) {
    $('account-filter').replaceChildren(option('All accounts', 'all'), option('Unlinked or ambiguous', 'unlinked'), ...data.accounts.map(a => option(a.name || 'Unknown account', a.key)));
    $('trade-status').value = 'all'; $('trade-model').value = 'all'; $('archive').value = 'all';
  }
  const archive = $('archive').value;
  const query = $('account-search').value.trim().toLocaleLowerCase();
  const accounts = data.accounts.filter(a => (archive === 'all' || (archive === 'archived' ? a.archived === true : a.archived === false)) && (a.name || '').toLocaleLowerCase().includes(query));
  const accountCards = accounts.map(a => {
    const trades = data.trades.filter(t => t.accountKey === a.key);
    const element = card(a.name || 'Unknown account', money(a.balance, a.currency), `${({phase: 'Phase', funded: 'Funded', ownCapital: 'Own capital'})[a.kind] || a.kind || 'Unknown type'} · ${a.archived === true ? 'Archived' : a.archived === false ? 'Active' : 'Unknown archive status'}`);
    element.classList.add('workspace-account-card');
    const details = node('details'); details.append(node('summary', 'Account details'));
    for (const line of [`Starting balance: ${money(a.startBalance, a.currency)}`, `Created: ${utc(a.createdAt)}`, `${trades.filter(t => t.status === 'open').length} open · ${trades.filter(t => t.status === 'closed').length} closed · ${trades.filter(t => !t.status).length} unknown`]) details.append(node('p', line));
    const button = node('button', 'View account', 'text-button'); button.type = 'button';
    button.onclick = () => openAccountDetail(a, state.snapshot, { onTrade: t => workspace.openTrade(t), onNote: n => workspace.openNote(n), onJournal: () => { $('account-filter').value = a.key; $('trade-status').value = 'all'; $('trade-model').value = 'all'; renderTrades(); workspace.show('journal'); } });
    const counts = node('div', null, 'account-counts');
    counts.append(node('span', `${trades.filter(t => t.status === 'open').length} open`), node('span', `${trades.filter(t => t.status === 'closed').length} closed`));
    element.append(counts, details, button); return { kind: a.kind, element };
  });
  $('accounts').replaceChildren();
  for (const [kind, label] of [['phase', 'Phase'], ['funded', 'Funded'], ['ownCapital', 'Own capital'], ['other', 'Other accounts']]) {
    const cards = accountCards.filter(c => kind === 'other' ? !['phase','funded','ownCapital'].includes(c.kind) : c.kind === kind);
    if (!cards.length) continue;
    const group = node('section', null, 'account-group'), grid = node('div', null, 'cloud-grid');
    grid.append(...cards.map(c => c.element)); group.append(node('h3', label), grid); $('accounts').append(group);
  }
  if (!accounts.length) $('accounts').append(node('p', 'No accounts in this view. Check the selected zone, environment and data checks.'));
  const counts = new Map();
  for (const item of data.issues) { const label = `${item.code}${item.field ? ` · ${item.field}` : ''}`; counts.set(label, (counts.get(label) || 0) + 1); }
  $('issues').replaceChildren(...[...counts].map(([label, count]) => node('li', `${label}: ${count}`)), ...data.failures.map(f => node('li', `${f.type}: ${describe(f.code)}`)));
  if (!data.issues.length && !data.failures.length) $('issues').append(node('li', 'No mapping issues detected in the returned records. Completeness still requires comparison with the native app.'));
  renderTrades();
  workspace.update(state.stale, resetFilters);
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
  premium.clear();
  state.reader?.cancel(); state.generation++; state.busy = false; state.snapshot = null; state.stale = false; workspace.clear(); transport?.disarm();
  $('results').hidden = true;
  for (const id of ['accounts', 'trades', 'balances', 'coverage', 'issues']) $(id).replaceChildren();
  busy(false); status('Zone selection changed. Read it to load its records.');
});
$('archive').addEventListener('change', () => render());
$('account-search').addEventListener('input', () => render());
for (const id of ['account-filter', 'trade-status', 'trade-model']) $(id).addEventListener('change', renderTrades);
addEventListener('pagehide', () => {
  if (!state.started) { clearView(); premium.dispose(); return; }
  // Comment NL: Bij navigatie de records wissen, maar een bewust onthouden Apple-sessie behouden.
  if (rememberSession) { clearView(); state.identity = null; state.networkActive = false; }
  else endSession();
  premium.dispose();
});
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

if (demoMode) {
  state.snapshot = workspaceDemo(); state.snapshot.summary = summarize(state.snapshot.accounts, state.snapshot.trades);
  $('workspace-demo-banner').hidden = false; $('environment').textContent = 'Demo mode'; $('access-capability').textContent = 'Fictional data only';
  $('configuration').textContent = 'Demo workspace. Apple connections are disabled here.';
  $('start').disabled = true; $('remember-icloud').disabled = true; $('refresh').hidden = true; render(true);
} else try {
  const response = await fetch('/api/pulsefx-config', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Config unavailable');
  const config = await response.json();
  if (!config.enabled) {
    $('configuration').textContent = 'Not configured. The site owner must enable this test and set the CloudKit token, environment and exact HTTPS origin in the deployment settings.';
    finishRestore(true);
  } else if (config.containerIdentifier !== 'iCloud.PulseOS.FX' || !['development', 'production'].includes(config.environment)
    || config.origin !== location.origin || location.protocol !== 'https:' || typeof config.apiToken !== 'string' || !config.apiToken) {
    throw new Error('Invalid config');
  } else {
    state.config = config; $('environment').textContent = `${config.environment === 'production' ? 'Production' : 'Development'} · private`;
    $('configuration').textContent = `${config.environment === 'production' ? 'Production: reads the selected account’s live cloud records.' : 'Development: a separate dataset from the released apps.'} Nothing is loaded until you start and sign in through Apple.`;
    const capabilities = [];
    if (config.tradeEditingEnabled) capabilities.push('Edit trades');
    if (config.noteEditingEnabled) capabilities.push('Edit notes');
    if (config.tradeClosingEnabled) capabilities.push('Close trades');
    else if (config.closeTradePilotId) capabilities.push('Close one test trade');
    $('access-capability').textContent = capabilities.length ? capabilities.join(' · ') : 'Read-only iCloud';
    $('start').disabled = false;
    if (restoreSession && !document.body.hasAttribute('data-login-entry')) await start();
  }
} catch {
  $('configuration').textContent = 'Configuration unavailable. This page needs the Cloudflare Pages Function and a matching HTTPS deployment. The demo remains available.';
  finishRestore(true);
}


// MARK: - Automatisch verversen na de eerste handmatige verbinding
mountAutoRefresh({
  document, window,
  eligible: () => !demoMode && Boolean(state.identity && state.snapshot && state.networkActive)
    && !state.busy && !($('close-dialog').open || Boolean(document.getElementById('trade-detail-dialog')?.open || document.getElementById('account-detail-dialog')?.open || document.getElementById('note-editor-dialog')?.open)) && navigator.onLine !== false,
  refresh: () => readSelected({ automatic: true }),
});
