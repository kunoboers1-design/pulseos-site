import { createDemoRepository, summarize } from './demo-data.mjs';
import { calculatePosition } from './calculator.mjs';

// MARK: - Gedeelde presentatie
const root = document.querySelector('#fx-root');
const dashboard = '/pulsefx/dashboard/';
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const signed = value => `${value > 0 ? '+' : ''}${money(value)}`;
const date = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 7h8M8 12h1m6 0h1m-8 5h1m6 0h1"/>',
  accounts: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 5h3M7 5V3h11"/>',
  journal: '<path d="M5 3h13a1 1 0 0 1 1 1v17H6a3 3 0 0 1 0-6h13M6 3v12m4-8h5m-5 4h5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11-1 5.5 5.5 0 0 1 0 11H7Z"/>',
  exit: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h10"/>',
};
const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
const badge = '<span class="demo-badge"><span></span>Demo mode</span>';
const brand = '<a class="fx-brand" href="/pulsefx/app/" aria-label="PulseFX web app home"><span class="fx-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M4 20h6l4-12 5 17 4-11h5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Pulse<span class="accent">FX</span><small>WEB PREVIEW</small></span></a>';
const navItems = [['overview', 'Overview'], ['calculator', 'Lot Calculator'], ['accounts', 'Accounts'], ['journal', 'Trade Journal'], ['settings', 'Settings']];
const link = (view, extras = '') => `${dashboard}?view=${view}${extras}`;
const positiveClass = n => n >= 0 ? 'positive' : 'negative';
let storage;
try { storage = window.localStorage; } catch { /* Comment NL: De demo blijft zonder opslag bruikbaar. */ }
const repository = createDemoRepository(storage);
let data = await repository.load();
const params = new URLSearchParams(location.search);
const view = navItems.some(([id]) => id === params.get('view')) ? params.get('view') : 'overview';
const accountName = id => data.accounts.find(a => a.id === id)?.name || 'Unknown account';
const accountOptions = (selected = 'all', all = true) => `${all ? '<option value="all">All accounts</option>' : ''}${data.accounts.map(a => `<option value="${a.id}" ${selected === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}`;

// MARK: - Welkomstscherm
function renderLogin() {
  document.title = 'PulseFX Web — Explore the demo';
  root.innerHTML = `<div class="login-page"><header class="login-header">${brand}<a class="quiet-link" href="/pulsefx/">Back to PulseFX ${icon('arrow')}</a></header>
    <main id="main" class="login-grid"><section class="login-story"><p class="fx-eyebrow">YOUR TRADING TOOLKIT, ON THE WEB</p><h1>A little clarity.<br>A better <span class="accent">routine.</span></h1><p class="login-lead">A focused space for your accounts, risk calculations and trading journal. Now taking shape in your browser.</p>
    <div class="login-illustration" aria-label="Illustrative demo account: ${data.accounts[0].name}, balance ${money(summarize(data, data.accounts[0].id).balance)} USD"><div class="mini-card"><div class="card-heading"><span>${icon('accounts')} ${data.accounts[0].name}</span><span class="tag">Sample account</span></div><p class="muted">Account balance · USD</p><strong>${money(summarize(data, data.accounts[0].id).balance)}</strong><div class="illustration-chart">${balanceChart(data.accounts[0].id)}</div><div class="mini-footer"><span>Fictional data. Real room to explore.</span><span class="accent">↗</span></div></div></div></section>
    <section class="login-card fx-card" aria-labelledby="welcome-title"><span class="tag">PULSEFX FOR THE WEB</span><h2 id="welcome-title">Your next workspace.</h2><p>In the future, you’ll be able to open your PulseFX data through an Apple iCloud connection. That connection is not available yet.</p><div class="connection-box">${icon('cloud')}<div><strong>iCloud connection</strong><span>No Apple account or app data connected.</span></div><span class="tag">Coming soon</span></div><button class="hero-button cloud-button" disabled>Connect with iCloud <span>Coming soon</span></button><div class="login-divider"><span>Take a look around</span></div><a class="hero-button primary-button" href="${dashboard}">Explore demo ${icon('arrow')}</a><p class="login-footnote">No sign-in needed. Explore fictional accounts and trades. Demo notes stay in this browser when local storage is available.</p><div class="sample-notice">${badge}<span>Sample data only. Nothing is connected.</span></div></section></main>
    <footer class="login-footer"><a class="wordmark" href="/">PULSE<em>OS</em></a><span>A focused space. Part of PulseOS.</span><a href="/privacy/">Privacy</a></footer></div>`;
}

// MARK: - Dashboardstructuur
function renderShell() {
  const title = navItems.find(([id]) => id === view)[1];
  document.title = `${title} — PulseFX Demo`;
  root.innerHTML = `<div class="app-shell"><aside class="app-sidebar">${brand}<p class="nav-label">WORKSPACE</p><nav class="app-nav" aria-label="Workspace">${navItems.map(([id, label]) => `<a href="${link(id)}" ${id === view ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span>${id === view ? '<span class="nav-dot" aria-hidden="true"></span>' : ''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="local-card">${icon('cloud')}<strong>Your data, eventually.</strong><p>iCloud is coming later.<br>For now, make yourself at home in the demo.</p><a href="${link('settings')}">Connection details ${icon('arrow')}</a></div><a class="exit-link" href="/pulsefx/login/">${icon('exit')} Leave demo</a><a class="wordmark sidebar-wordmark" href="/">PULSE<em>OS</em></a></div></aside>
    <div class="workspace"><header class="workspace-header"><div class="breadcrumb">Workspace <span>/</span> <strong>${title}</strong></div><div class="header-status">${badge}<span class="avatar" aria-label="Demo workspace">D</span></div></header><div class="demo-ribbon"><span><span class="ribbon-dot" aria-hidden="true"></span>You’re exploring sample data. No real accounts or live market prices.</span><a href="${link('settings')}">About this demo ${icon('arrow')}</a></div><main id="main" class="workspace-main" tabindex="-1"></main><footer class="workspace-footer"><span>PulseFX Web Preview</span><span>Fictional snapshot · Oct 23, 2026 · All amounts in USD</span></footer></div></div><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  const content = document.querySelector('#main');
  content.innerHTML = ({ overview: overview, calculator, accounts, journal, settings }[view])();
  bindInteractions();
}
function pageHeader(eyebrow, title, description, action = '') {
  return `<div class="page-heading"><div><p class="fx-eyebrow">${eyebrow}</p><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function metric(label, value, detail, className = '') {
  return `<article class="fx-card metric"><span class="metric-label">${label}</span><strong class="${className}">${value}</strong><span class="metric-detail">${detail}</span></article>`;
}
function tradeTable(trades, caption = 'Sample trades') {
  if (!trades.length) return '<div class="empty-state"><h3>No trades in this view</h3><p>Try another account or status to explore the sample journal.</p><button class="text-button" id="clear-filters">Clear filters</button></div>';
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${caption}"><table><caption class="sr-only">${caption}. All amounts in USD.</caption><thead><tr><th scope="col">Instrument</th><th scope="col">Account</th><th scope="col">Date</th><th scope="col">Size</th><th scope="col">Status</th><th scope="col" class="align-right">P&amp;L · USD</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody>${trades.map(t => `<tr><td><a class="instrument" href="${link('journal', `&trade=${t.id}`)}">${t.pair}</a><span class="trade-side">${t.side}</span></td><td>${accountName(t.accountId)}</td><td>${date(t.date)}</td><td>${t.lots.toFixed(2)} <span class="muted">lots</span></td><td><span class="status-tag ${t.status}">${t.status === 'open' ? 'Open' : 'Closed'}</span></td><td class="align-right ${t.pnl === null ? 'muted' : positiveClass(t.pnl)}">${t.pnl === null ? 'Not live' : signed(t.pnl)}</td><td><a class="row-link" href="${link('journal', `&trade=${t.id}`)}" aria-label="View ${t.pair} trade from ${date(t.date)}">${icon('arrow')}</a></td></tr>`).join('')}</tbody></table></div>`;
}

// MARK: - Overzicht
function balanceChart(accountId = 'all') {
  const closed = data.trades.filter(t => t.status === 'closed' && (accountId === 'all' || t.accountId === accountId)).sort((a, b) => a.date.localeCompare(b.date));
  let balance = summarize(data, accountId).startingBalance;
  const values = [balance, ...closed.map(t => (balance += t.pnl))];
  const min = Math.min(...values) - 180, max = Math.max(...values) + 180;
  const points = values.map((v, i) => `${30 + i * 620 / (values.length - 1)},${150 - (v - min) / (max - min) * 120}`);
  return `<svg class="balance-chart" viewBox="0 0 680 190" role="img" aria-label="Fictional balance: started at ${money(values[0])}, ended at ${money(balance)} over ${closed.length} closed trades"><defs><linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".2"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>${[40, 90, 150].map(y => `<line x1="30" x2="650" y1="${y}" y2="${y}" class="chart-grid"/>`).join('')}<path d="M${points.join(' L')} L650,165 L30,165 Z" fill="url(#balance-fill)"/><path d="M${points.join(' L')}" fill="none" stroke="currentColor" stroke-width="2.5"/>${points.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="currentColor"/>`).join('')}<text x="30" y="187">${date(closed[0].date)}</text><text x="315" y="187" text-anchor="middle">Closed trade history</text><text x="650" y="187" text-anchor="end">${date(closed.at(-1).date)}</text></svg>`;
}
function overview() {
  const stats = summarize(data);
  return `${pageHeader('A CLEARER PICTURE', 'Your trading, at a glance.', 'A little perspective on your sample trading workspace.', `<a class="hero-button primary-button" href="${link('calculator')}">${icon('calculator')} Calculate lot size</a>`)}
    <div class="metrics-grid">${metric('Total account balance', money(stats.balance), `Across ${data.accounts.length} sample accounts · USD`)}${metric('Realized P&L', signed(stats.pnl), `All ${stats.closed} closed sample trades`, positiveClass(stats.pnl))}${metric('Open trades', String(stats.open).padStart(2, '0'), 'Sample positions · no live P&L')}${metric('Win rate', `${stats.winRate.toFixed(0)}%`, `${stats.wins} wins out of ${stats.closed} closed trades`)}</div>
    <div class="overview-grid"><section class="fx-card chart-card"><div class="card-heading"><div><h2>Balance journey</h2><p>Combined balance after each closed sample trade</p></div><span class="tag">Oct 2026</span></div><div class="chart-total">${money(stats.balance)} <span class="positive">+${(stats.pnl / stats.startingBalance * 100).toFixed(2)}%</span></div>${balanceChart()}<div class="chart-foot"><span>Starting balance <strong>${money(stats.startingBalance)}</strong></span><span>No deposits or withdrawals in this sample</span></div></section>
    <section class="fx-card accounts-summary"><div class="card-heading"><h2>Your accounts</h2><a class="text-link" href="${link('accounts')}">View all ${icon('arrow')}</a></div>${data.accounts.map((a, i) => `<a class="account-summary-row" href="${link('accounts', `&account=${a.id}`)}"><span class="account-symbol">0${i + 1}</span><span><strong>${a.name}</strong><small>${a.type} · USD</small></span><span class="account-amount">${money(summarize(data, a.id).balance)}${icon('arrow')}</span></a>`).join('')}<p class="card-note">Three different accounts. One clear view.</p></section></div>
    <section class="fx-card trades-card"><div class="card-heading"><div><h2>Open positions</h2><p>Illustrative positions only. Prices are not updated.</p></div><span class="tag">${stats.open} open</span></div>${tradeTable(data.trades.filter(t => t.status === 'open'), 'Open sample trades')}</section>
    <section class="fx-card trades-card"><div class="card-heading"><div><h2>Recent closed trades</h2><p>A few entries from your sample journal.</p></div><a class="text-link" href="${link('journal')}">Open journal ${icon('arrow')}</a></div>${tradeTable(data.trades.filter(t => t.status === 'closed').toReversed().slice(0, 3), 'Recent closed sample trades')}</section>`;
}

// MARK: - Accounts en details
function accounts() {
  const selected = data.accounts.find(a => a.id === params.get('account'));
  if (selected) {
    const stats = summarize(data, selected.id);
    return `<a class="text-link back-link" href="${link('accounts')}">← All accounts</a>${pageHeader('SAMPLE ACCOUNT · USD', selected.name, selected.description)}<div class="metrics-grid">${metric('Account balance', money(stats.balance), 'Starting balance + realized P&L')}${metric('Realized P&L', signed(stats.pnl), `${stats.closed} closed trades`, positiveClass(stats.pnl))}${metric('Starting balance', money(stats.startingBalance), 'No deposits or withdrawals')}${metric('Open trades', stats.open, 'No live market connection')}</div><section class="fx-card trades-card"><div class="card-heading"><h2>Account trades</h2><a class="text-link" href="${link('calculator', `&account=${selected.id}`)}">Use balance in calculator ${icon('arrow')}</a></div>${tradeTable(data.trades.filter(t => t.accountId === selected.id).toReversed())}</section>`;
  }
  return `${pageHeader('YOUR WORKSPACE', 'A place for every account.', 'Explore fictional accounts. All balances and trade results are in USD.')}<div class="account-grid">${data.accounts.map((a, i) => { const stats = summarize(data, a.id); return `<article class="fx-card account-card"><div class="card-heading"><span class="account-symbol">0${i + 1}</span><span class="tag">${a.type}</span></div><h2>${a.name}</h2><p>${a.description}</p><span class="metric-label">Balance · USD</span><strong class="account-balance">${money(stats.balance)}</strong><dl><div><dt>Realized P&amp;L</dt><dd class="${positiveClass(stats.pnl)}">${signed(stats.pnl)}</dd></div><div><dt>Open trades</dt><dd>${stats.open}</dd></div></dl><a class="hero-button secondary" href="${link('accounts', `&account=${a.id}`)}">View account ${icon('arrow')}</a></article>`; }).join('')}</div>`;
}

// MARK: - Journal en lokale notities
function journal() {
  const trade = data.trades.find(t => t.id === params.get('trade'));
  if (trade) return `<a class="text-link back-link" href="${link('journal')}">← Back to journal</a>${pageHeader('SAMPLE TRADE', `${trade.pair} · ${trade.side}`, `${accountName(trade.accountId)} · ${date(trade.date)}, 2026`)}<div class="detail-grid"><section class="fx-card detail-card"><h2>Trade details</h2><dl>${[['Status', trade.status === 'open' ? 'Open' : 'Closed'], ['Position size', `${trade.lots.toFixed(2)} standard lots`], ['Realized P&L · USD', trade.pnl === null ? 'Not available for open trades' : signed(trade.pnl)], ['Data source', 'Fictional demo snapshot']].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><p class="card-note">This is a sample journal entry. No order was placed and no broker is connected.</p></section><section class="fx-card detail-card"><h2>A moment to reflect.</h2><p class="muted">Try editing this demo note. Changes are saved only in this browser when local storage is available.</p><form id="note-form"><label for="trade-note">Journal note</label><textarea id="trade-note" rows="6" maxlength="2000">${escape(trade.note)}</textarea><div class="form-footer"><span class="muted">Up to 2,000 characters</span><button class="hero-button primary-button" type="submit">Save demo note</button></div><p id="save-status" role="status" class="muted"></p></form></section></div>`;
  const selectedAccount = data.accounts.some(a => a.id === params.get('account')) ? params.get('account') : 'all';
  return `${pageHeader('NOTICE THE PATTERNS', 'Your trade journal.', 'Review the sample trades, explore the details and make a note.')}<section class="fx-card trades-card"><div class="journal-filters"><div><label for="account-filter">Account</label><select id="account-filter">${accountOptions(selectedAccount)}</select></div><div><label for="status-filter">Trade status</label><select id="status-filter"><option value="all">All trades</option><option value="open">Open</option><option value="closed">Closed</option></select></div><p id="trade-count" role="status"></p></div><div id="journal-results"></div></section>`;
}

// MARK: - Calculator
function calculator() {
  const selected = data.accounts.find(a => a.id === params.get('account')) || data.accounts[0];
  return `${pageHeader('PLAN YOUR POSITION', 'Small inputs. Clearer risk.', 'Explore a lot-size calculation with your own inputs. No trade will be placed.')}<div class="calculator-grid"><section class="fx-card detail-card"><div class="card-heading"><h2>Lot Calculator</h2><span class="tag">USD account</span></div><form id="calculator-form" novalidate><div class="preset-row"><div><label for="calculator-account">Sample account</label><select id="calculator-account">${accountOptions(selected.id, false)}</select></div><button type="button" class="subtle-button" id="use-balance">Use balance</button></div><div class="input-grid">${[['balance', 'Account balance', summarize(data, selected.id).balance, 'USD'], ['risk', 'Risk percentage', 1, '%'], ['stop', 'Stop loss', 25, 'pips'], ['pip', 'Pip value per standard lot', 10, 'USD / pip']].map(([id, label, value, unit]) => `<div class="field"><label for="${id}">${label}</label><div class="input-wrap"><input id="${id}" name="${id}" type="number" inputmode="decimal" min="0" ${id === 'risk' ? 'max="100"' : ''} step="any" value="${value}" required aria-describedby="${id}-error"><span>${unit}</span></div><p id="${id}-error" class="field-error"></p></div>`).join('')}</div><button class="hero-button primary-button" type="submit">Calculate position ${icon('arrow')}</button></form></section><section class="fx-card result-card" aria-labelledby="result-title"><p class="fx-eyebrow">YOUR CALCULATION</p><h2 id="result-title">A plan before a position.</h2><div id="calculator-result" role="status" aria-live="polite"><p>Enter your inputs and calculate to see the risk amount and position size.</p></div></section></div><section class="fx-card assumptions"><h2>Know the assumptions.</h2><div><p><strong>One currency: USD.</strong> Balance and pip value must both be in US dollars. The demo does not convert currencies or fetch market rates.</p><p><strong>Pip value is an input.</strong> The initial $10 per pip per standard lot is an illustrative EUR/USD value for a USD account. Other instruments and currencies need a different value.</p><p><strong>Simple planned risk.</strong> Risk amount = balance × risk percentage ÷ 100. Lots = risk amount ÷ (stop-loss pips × pip value). Fees, spread, slippage and margin are excluded.</p><p><strong>Check the lot step.</strong> A standard forex lot is assumed to be 100,000 base-currency units. The displayed size rounds down to a 0.01-lot step; actual broker rules may differ.</p></div></section>`;
}

// MARK: - Instellingen
function settings() {
  return `${pageHeader('MAKE YOURSELF AT HOME', 'Workspace settings.', 'A browser demo today. A connected workspace is planned for later.')}<div class="settings-stack"><section class="fx-card detail-card"><div class="card-heading"><h2>${icon('cloud')} iCloud connection</h2><span class="tag">Coming soon</span></div><p>We plan to let you access your PulseFX data through your Apple iCloud account. This web preview is not connected to Apple, iCloud or the native app.</p><button class="hero-button cloud-button" disabled>Connect with iCloud <span>Coming soon</span></button><p class="card-note">No Apple credentials are requested. No accounts, subscriptions or Pro access have been verified.</p></section><section class="fx-card detail-card"><div class="card-heading"><h2>Demo data</h2>${badge}</div><p>Three fictional USD accounts and eight sample trades. Journal notes can be changed locally. No demo data is sent to a server.</p><p id="storage-status" class="card-note">${data.persistent ? 'Local storage is available. Notes are saved in this browser when possible.' : 'Local storage is unavailable. Changes last for this page only.'}${data.recovered ? ' Unreadable saved data was replaced with the original sample.' : ''}</p><button class="subtle-button danger-button" id="reset-demo">Reset demo data</button><p class="card-note">Resets all demo notes to their original sample values.</p></section><section class="fx-card detail-card"><h2>Appearance</h2><p>Dark mode, designed for focus. All sample amounts use USD and dates use the fixed October 2026 demo snapshot.</p><a class="text-link" href="/pulsefx/">Discover the native PulseFX app ${icon('arrow')}</a></section></div><dialog id="reset-dialog"><form method="dialog"><h2>Reset demo data?</h2><p>Your edited demo notes will be replaced by the original sample notes in this browser.</p><div class="dialog-actions"><button class="subtle-button" value="cancel" autofocus>Cancel</button><button class="hero-button primary-button" value="reset">Reset demo data</button></div></form></dialog>`;
}

// MARK: - Interacties
function bindInteractions() {
  const filters = document.querySelector('#account-filter');
  if (filters) {
    const update = () => {
      const status = document.querySelector('#status-filter').value;
      const trades = data.trades.filter(t => (filters.value === 'all' || t.accountId === filters.value) && (status === 'all' || t.status === status)).toReversed();
      document.querySelector('#journal-results').innerHTML = tradeTable(trades, 'Filtered sample trades');
      document.querySelector('#trade-count').textContent = `${trades.length} sample ${trades.length === 1 ? 'trade' : 'trades'}`;
      document.querySelector('#clear-filters')?.addEventListener('click', () => { filters.value = 'all'; document.querySelector('#status-filter').value = 'all'; update(); filters.focus(); });
    };
    filters.addEventListener('change', update);
    document.querySelector('#status-filter').addEventListener('change', update);
    update();
  }
  document.querySelector('#note-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    data = await repository.saveNote(params.get('trade'), document.querySelector('#trade-note').value);
    document.querySelector('#save-status').textContent = data.persistent ? 'Demo note saved in this browser.' : 'Note updated for this page only. Local storage is unavailable.';
  });
  const form = document.querySelector('#calculator-form');
  if (form) {
    const clearResult = () => { document.querySelector('#calculator-result').innerHTML = '<p>Inputs changed. Calculate again to update your result.</p>'; };
    form.addEventListener('input', clearResult);
    document.querySelector('#use-balance').addEventListener('click', () => {
      document.querySelector('#balance').value = summarize(data, document.querySelector('#calculator-account').value).balance;
      clearResult();
      document.querySelector('#balance').focus();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const result = calculatePosition(values);
      for (const key of ['balance', 'risk', 'stop', 'pip']) {
        document.querySelector(`#${key}-error`).textContent = result.errors[key] || '';
        document.querySelector(`#${key}`).setAttribute('aria-invalid', String(Boolean(result.errors[key])));
      }
      if (Object.keys(result.errors).length) {
        document.querySelector('#calculator-result').innerHTML = '<p>Check the highlighted inputs to calculate your position.</p>';
        document.querySelector(`#${Object.keys(result.errors)[0]}`).focus();
        return;
      }
      document.querySelector('#calculator-result').innerHTML = `<span class="metric-label">Position size · standard lots</span><strong class="lot-result">${result.roundedLots.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span>lots</span></strong><p>Rounded down to a 0.01-lot step.</p><dl><div><dt>Risk amount · USD</dt><dd>${money(result.riskAmount)}</dd></div><div><dt>Unrounded lot size</dt><dd>${result.lots < 0.000001 ? result.lots.toExponential(4) : result.lots.toLocaleString('en-US', { maximumFractionDigits: 6 })}</dd></div><div><dt>Risk after rounding · USD</dt><dd>${money(result.plannedRisk)}</dd></div></dl>${result.roundedLots < 0.01 ? '<p class="calculation-warning">Below the assumed 0.01-lot minimum. No position fits this lot step.</p>' : ''}<p class="card-note">An estimate based on your inputs. No market connection or trade execution.</p>`;
    });
  }
  const dialog = document.querySelector('#reset-dialog');
  document.querySelector('#reset-demo')?.addEventListener('click', () => { dialog.returnValue = ''; dialog.showModal(); });
  dialog?.addEventListener('close', async () => {
    if (dialog.returnValue !== 'reset') return;
    data = await repository.reset();
    document.querySelector('#storage-status').textContent = data.persistent ? 'Original demo data restored. Saved in this browser.' : 'Reset for this page only. Local storage is unavailable; previous saved notes could not be overwritten.';
    document.querySelector('#toast').textContent = data.persistent ? 'Demo data reset.' : 'Demo data reset for this page only.';
  });
}

// MARK: - Statische routes
if (/\/pulsefx\/dashboard(?:\/|\/index\.html)?$/.test(location.pathname)) renderShell();
else renderLogin();
