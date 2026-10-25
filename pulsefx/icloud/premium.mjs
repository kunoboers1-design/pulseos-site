import { calculateStatistics } from '../app/statistics.mjs';
import { statisticsDemo } from './statistics-demo.mjs';

// MARK: - Statistiekpresentatie
const make = (tag, text, className) => { const element = document.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; };
const value = (number, suffix = '') => number === 'infinity' || number === Infinity ? '∞' : Number.isFinite(number) ? `${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}` : '—';
const api = async (path, method = 'GET', body, signal) => {
  const response = await fetch(`/api/pulsefx-premium/${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = await response.json().catch(() => ({ error: 'NOT_CONFIGURED' }));
  if (!response.ok) throw Object.assign(new Error(data.error || 'PREMIUM_REQUIRED'), { status: response.status });
  return data;
};
const errorText = error => ({ NOT_CONFIGURED: 'Web Premium verification is not configured yet. You can explore the fictional preview below.',
  SERVICE_UNAVAILABLE: 'The verification service is unavailable. Please try again later.', VERIFICATION_UNAVAILABLE: 'Apple purchase verification is unavailable. Live statistics remain locked.',
  RATE_LIMITED: 'Too many attempts. Please wait one minute.', PURCHASE_INACTIVE: 'No active Premium purchase was confirmed. Restore purchases in the native app and reconnect.',
  PREMIUM_REQUIRED: 'Connect Premium from the native app to open your statistics.', INVALID_REQUEST: 'These records could not be analysed. Review the data checks and refresh iCloud.' }[error.message] || 'Could not verify access. Please reconnect Premium.');

// MARK: - Alleen noodzakelijke rekenvelden naar de server
export function statisticsPayload(snapshot) {
  const keys = new Map(snapshot.accounts.map((a, index) => [a.key, `a${index}`]));
  const fields = ['recordType', 'status', 'result', 'direction', 'directionRaw', 'outcomeConsistent', 'lotSize', 'profitLoss', 'stopLossPips', 'pipValue', 'finalRR', 'entryPrice', 'stopLossPlacement', 'actualExitPrice', 'currency', 'instrument', 'startedAt'];
  return { collectionStatus: snapshot.collectionStatus,
    accounts: snapshot.accounts.map(a => ({ key: keys.get(a.key), archived: a.archived })),
    trades: snapshot.trades.map(t => ({ ...Object.fromEntries(fields.map(field => [field, t[field] ?? null])),
      accountKey: keys.get(t.accountKey) || null, linkStatus: ['linked', 'ambiguous'].includes(t.linkStatus) ? t.linkStatus : 'unlinked' })) };
}

export function mountPremium(root, { friends = false } = {}) {
  let source = null, stale = false, demo = false, verified = false, generation = 0, controller = null, expiresTimer = null;
  const heading = make('div', null, 'cloud-results-heading');
  const title = make('div'); title.append(make('p', 'PERFORMANCE, WITH CONTEXT', 'fx-eyebrow'), make('h2', 'Your trading statistics'));
  const badge = make('span', 'Premium locked', 'tag'); heading.append(title, badge);
  const intro = make('p', 'Connect your existing Premium subscription or lifetime purchase through the PulseFX app. iCloud sign-in alone does not unlock Premium.');
  const actions = make('div', null, 'stats-actions');
  const pair = make('button', 'Connect Premium', 'hero-button primary-button');
  const check = make('button', 'Check connection', 'text-button');
  const disconnect = make('button', 'Disconnect Premium', 'text-button'); disconnect.hidden = true;
  const preview = make('button', 'Explore statistics demo', 'text-button');
  const live = make('button', 'Use iCloud data', 'text-button'); live.hidden = true;
  actions.append(pair, check, disconnect, preview, live);
  const status = make('p', 'Premium access has not been verified.'); status.setAttribute('role', 'status');
  const pairing = make('div', null, 'cloud-notice'); pairing.hidden = true;
  const code = make('code'); const instructions = make('p');
  const copy = make('button', 'Copy code', 'text-button');
  pairing.append(make('strong', 'Confirm in your own PulseFX app'), instructions, code, copy,
    make('p', 'In the updated iOS or Mac app: Settings → Connect web Premium. Only authorize a code you generated yourself. This pairs this browser, not an iCloud account.'));
  const privacy = make('p', 'When you choose Calculate statistics, account names and CloudKit tokens stay in this browser. Pseudonymous trade metrics are sent to the PulseFX server to calculate your results, then discarded. Purchase references are kept encrypted for the temporary session.');
  privacy.className = 'stats-caption';
  const filters = make('div', null, 'cloud-controls');
  const select = (label, options) => { const wrap = make('div', null, 'cloud-field'); const control = make('select');
    const id = `stats-${label.toLowerCase().replaceAll(' ', '-')}`; control.id = id;
    const text = make('label', label); text.htmlFor = id;
    for (const [name, v] of options) { const o = make('option', name); o.value = v; control.append(o); }
    wrap.append(text, control); filters.append(wrap); return control; };
  const account = select('Account', [['All active accounts', 'all']]);
  const instrument = select('Instrument', [['All instruments', 'all']]);
  const outcome = select('Outcome', [['All outcomes', 'all'], ['Wins', 'win'], ['Losses', 'loss'], ['Break-even', 'breakEven']]);
  const date = label => { const wrap = make('div', null, 'cloud-field'), input = make('input'); input.type = 'date'; input.id = `stats-${label.toLowerCase()}`;
    const caption = make('label', `${label} · UTC`); caption.htmlFor = input.id; wrap.append(caption, input); filters.append(wrap); return input; };
  const start = date('From'), end = date('Through');
  const calculate = make('button', 'Calculate statistics', 'hero-button primary-button');
  const reset = make('button', 'Reset filters', 'text-button'); filters.append(calculate, reset);
  const output = make('div'); output.setAttribute('aria-live', 'polite');
  const basis = make('p', 'Closed trades from active accounts only. Periods use the opening date in UTC; legacy trades use their creation date. Win rate includes break-even trades. Missing R counts as zero, matching the native calculator. Currencies are never combined.'); basis.className = 'stats-caption';
  root.append(heading, intro, actions, status, pairing, privacy, filters, output, basis);
  const current = () => demo ? statisticsDemo() : source;
  if (friends) {
    badge.textContent = 'Friends access';
    intro.textContent = 'Statistics from your iCloud snapshot, calculated in this browser. Friends access does not verify a Premium purchase.';
    privacy.textContent = 'Your account names, notes and trade metrics stay in this browser. No trade data is sent to a statistics server.';
    for (const control of [pair, check, disconnect]) control.hidden = true;
    status.textContent = 'Connect iCloud and load your records to calculate statistics.';
  }
  const cancel = () => { generation++; controller?.abort(); controller = null; };
  const clear = () => { cancel(); output.replaceChildren(); };
  function lock(message) { clearTimeout(expiresTimer); verified = false; if (!demo) clear(); badge.textContent = demo ? 'Demo mode · fictional data' : 'Premium locked'; status.textContent = message; }
  function expiry(at) {
    clearTimeout(expiresTimer);
    expiresTimer = setTimeout(() => lock('Your Premium browser session expired. Reconnect to continue.'), Math.max(0, at - Date.now()));
  }
  function populate() {
    clear(); account.replaceChildren(); instrument.replaceChildren();
    for (const [control, rows] of [[account, [['All active accounts', 'all'], ...(current()?.accounts || []).map((a, i) => [a.name || 'Unnamed account', demo || friends ? a.key : `a${i}`])]],
      [instrument, [['All instruments', 'all'], ...[...new Set((current()?.trades || []).map(t => t.instrument).filter(Boolean))].sort().map(v => [v, v])]]]) {
      for (const [text, v] of rows) { const o = make('option', text); o.value = v; control.append(o); }
    }
    outcome.value = 'all'; start.value = ''; end.value = '';
  }
  function metric(label, number, note) { const card = make('article', null, 'fx-card'); card.append(make('span', label), make('strong', number)); if (note) card.append(make('small', note)); return card; }
  function render(result) {
    output.replaceChildren();
    if (!result.available) { output.append(make('p', 'A complete, fresh iCloud read is required. Refresh the selected zone.')); return; }
    const s = result.summary;
    const grid = make('div', null, 'cloud-grid stats-metrics');
    grid.append(metric('Total R', value(s.totalR, 'R'), `${s.count} closed trades`), metric('Win rate', value(s.winRate === null ? null : s.winRate * 100, '%'), `${s.wins} wins · ${s.losses} losses · ${s.breakEvens} break-even`),
      metric('Profit factor', value(s.profitFactor), 'Positive R ÷ absolute negative R'), metric('Average R', value(s.averageR, 'R'), 'Per closed trade'),
      metric('Largest drawdown', s.count ? value(result.maximumDrawdownR, 'R') : '—', 'Closed-trade R curve, opening order'), metric('Average position', value(s.averageLot, ' lots')),
      metric('Best trade', value(s.bestR, 'R')), metric('Worst trade', value(s.worstR, 'R')));
    output.append(grid);
    const excluded = Object.entries(result.excluded).filter(([, count]) => count).map(([reason, count]) => `${count} ${ { unlinked: 'unlinked / ambiguous', inactiveAccount: 'archived / unknown account', invalidOutcome: 'inconsistent outcome', invalidDate: 'invalid opening date' }[reason] }`);
    output.append(make('p', `${s.missingR} trades with missing R counted as zero · ${s.missingPL} trades without usable P&L. Excluded before filters: ${excluded.join(', ') || 'none'}.`, 'cloud-notice'));
    if (!s.count) { output.append(make('p', 'No eligible closed trades match these filters. Try a different period or account.')); return; }
    const money = make('div', null, 'cloud-grid');
    for (const bucket of s.plByCurrency) money.append(metric(`Realized P&L · ${bucket.currency}`, value(bucket.value), `${bucket.count} trades · no currency conversion`));
    output.append(make('h3', 'Results by currency'), money, chart(result.timeline));
    const names = new Map((current()?.accounts || []).map((a, index) => [demo || friends ? a.key : `a${index}`, a.name || 'Unnamed account']));
    const table = (title, rows, label) => { const section = make('section'); section.append(make('h3', title)); const scroll = make('div', null, 'table-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', title);
      const table = make('table'); const head = make('thead'), header = make('tr');
      for (const item of [label, 'Trades', 'Win rate', 'Total R', 'Average R', 'Profit factor']) header.append(make('th', item)); head.append(header);
      const body = make('tbody'); for (const row of rows) { const tr = make('tr'); for (const text of [label === 'Account' ? names.get(row.key) || 'Unknown account' : row.key, row.count, value(row.winRate * 100, '%'), value(row.totalR, 'R'), value(row.averageR, 'R'), value(row.profitFactor)]) tr.append(make('td', text)); body.append(tr); }
      table.append(head, body); scroll.append(table); section.append(scroll); return section; };
    output.append(table('Account performance', result.byAccount, 'Account'), table('Instrument performance', result.byInstrument, 'Instrument'));
    const timing = make('details'); timing.append(make('summary', 'Monthly & timing breakdown'), table('Monthly performance · UTC', result.byMonth, 'Month'), table('Weekday performance · UTC', result.byWeekday, 'Weekday'), table('Opening hour performance · UTC', result.byHour, 'Hour')); output.append(timing);
    const calendar = make('div', null, 'stats-days');
    for (const day of result.timeline) { const card = make('article', null, `stats-day ${day.totalR > 0 ? 'positive' : day.totalR < 0 ? 'negative' : ''}`); card.append(make('time', day.key), make('strong', value(day.totalR, 'R')), make('small', `${day.count} closed trades`)); calendar.append(card); }
    output.append(make('h3', 'Daily performance · opening date'), calendar);
  }
  function chart(timeline) {
    const section = make('section', null, 'fx-card stats-chart'); section.append(make('h3', 'Cumulative R'), make('p', 'Closed trades grouped by opening date. This is not account equity or unrealized P&L.'));
    const points = timeline.filter(day => Number.isFinite(day.cumulativeR));
    if (!points.length) { section.append(make('p', 'Not enough valid values to draw this chart.')); return section; }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 900 240'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Cumulative R ends at ${value(points.at(-1).cumulativeR, 'R')}`);
    const min = Math.min(0, ...points.map(p => p.cumulativeR)), max = Math.max(0, ...points.map(p => p.cumulativeR)), span = max - min || 1;
    if (!Number.isFinite(span)) { section.append(make('p', 'Values exceed the chart range. Review the data checks.')); return section; }
    const y = v => 210 - (v - min) / span * 180;
    const line = document.createElementNS(svg.namespaceURI, 'line'); for (const [k, v] of Object.entries({ x1: 25, x2: 875, y1: y(0), y2: y(0), class: 'stats-zero' })) line.setAttribute(k, v);
    const plot = document.createElementNS(svg.namespaceURI, 'polyline'); plot.setAttribute('points', `25,${y(0)} ` + points.map((p, i) => `${25 + (i + 1) / points.length * 850},${y(p.cumulativeR)}`).join(' ')); plot.setAttribute('class', 'stats-line'); svg.append(line, plot);
    const footer = make('div', null, 'stats-chart-labels'); footer.append(make('span', points[0].key), make('strong', value(points.at(-1).cumulativeR, 'R')), make('span', points.at(-1).key));
    section.append(svg, footer); return section;
  }
  async function run() {
    clear(); const revision = generation;
    if (!demo && (!source || stale || source.collectionStatus !== 'complete')) { status.textContent = 'Read a complete, fresh iCloud zone first. Your previous statistics have been cleared.'; return; }
    if (!demo && !friends && !verified) { status.textContent = 'Connect Premium and check the connection first.'; return; }
    if (start.value && end.value && start.value > end.value) { status.textContent = 'The start date must be on or before the end date.'; start.focus(); return; }
    const filters = { accountKey: account.value, instrument: instrument.value, outcome: outcome.value,
      start: start.value ? `${start.value}T00:00:00Z` : null, end: end.value ? new Date(Date.parse(`${end.value}T00:00:00Z`) + 86400000).toISOString() : null };
    calculate.disabled = true;
    try {
      if (demo) { render(calculateStatistics(statisticsDemo(), filters)); status.textContent = 'Demo mode. Fictional accounts and trades only; no Premium access has been granted.'; }
      else if (friends) { render(calculateStatistics(source, filters)); status.textContent = 'Calculated locally from your loaded records. No Premium purchase has been verified.'; }
      else {
        controller = new AbortController();
        const response = await api('statistics', 'POST', { snapshot: statisticsPayload(source), filters }, controller.signal);
        if (revision !== generation) return;
        expiry(response.expiresAt); render(response.statistics); status.textContent = 'Premium verified by the server. Statistics reflect the current iCloud snapshot and selected filters.';
      }
    } catch (error) { if (revision === generation && error.name !== 'AbortError') lock(errorText(error)); }
    finally { calculate.disabled = false; }
  }
  pair.onclick = async () => {
    clear(); lock('Creating a temporary pairing code…'); const revision = generation; pair.disabled = true;
    try { const result = await api('pair', 'POST', {}); if (revision !== generation) return;
      code.textContent = result.code; pairing.hidden = false; disconnect.hidden = false;
      instructions.textContent = `Expires at ${new Date(result.expiresAt).toLocaleTimeString()}. Confirm in the app, then choose Check connection.`;
      status.textContent = 'Waiting for confirmation from your PulseFX app.';
    } catch (error) { if (revision === generation) status.textContent = errorText(error); } finally { pair.disabled = false; }
  };
  copy.onclick = async () => { try { await navigator.clipboard.writeText(code.textContent); status.textContent = 'Code copied. Paste it into Settings → Connect web Premium in your native app.'; } catch { status.textContent = 'Select and copy the code manually.'; } };
  check.onclick = async () => {
    clear(); const revision = generation; check.disabled = true;
    try { const result = await api('session'); if (revision !== generation) return;
      verified = result.state === 'verified';
      if (verified) { expiry(result.expiresAt); pairing.hidden = true; code.textContent = ''; disconnect.hidden = false; badge.textContent = demo ? 'Demo mode · fictional data' : 'Premium verified'; status.textContent = 'Premium verified. Choose Use iCloud data, then Calculate statistics.'; }
      else { lock('Waiting for native confirmation. Codes expire after five minutes.'); }
    } catch (error) { if (revision === generation) lock(errorText(error)); } finally { check.disabled = false; }
  };
  disconnect.onclick = async () => {
    clear(); lock('Ending this Premium session…'); pairing.hidden = true; code.textContent = '';
    try { await api('session', 'DELETE'); disconnect.hidden = true; status.textContent = 'Premium session ended. iCloud access is separate.'; }
    catch { status.textContent = 'Local statistics cleared, but the server could not confirm sign-out. Retry Disconnect Premium; the server session expires within 12 hours.'; }
  };
  preview.onclick = () => { demo = true; badge.textContent = 'Demo mode · fictional data'; live.hidden = false; populate(); void run(); };
  live.onclick = () => { demo = false; badge.textContent = friends ? 'Friends access' : verified ? 'Premium verified' : 'Premium locked'; populate(); status.textContent = 'Using your iCloud snapshot. Choose Calculate statistics when ready.'; };
  calculate.onclick = run;
  reset.onclick = () => { populate(); if (demo) void run(); else status.textContent = 'Filters reset. Calculate statistics to refresh the results.'; };
  for (const control of [account, instrument, outcome, start, end]) control.onchange = () => { clear(); if (demo) void run(); else status.textContent = 'Filters changed. Calculate statistics to refresh the results.'; };
  if (new URLSearchParams(location.search).get('statistics') === 'demo') preview.click();
  return {
    setSnapshot(snapshot, isStale = false) { source = snapshot; stale = isStale; if (!demo) { populate(); if (friends && source && !stale) void run(); } },
    clear() { source = null; stale = false; if (!demo) populate(); },
    dispose() { cancel(); clearTimeout(expiresTimer); output.replaceChildren(); },
  };
}
