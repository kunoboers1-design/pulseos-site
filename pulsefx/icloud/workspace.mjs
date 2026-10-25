import { planClose } from './close-trade.mjs';
import { statisticsDemo } from './statistics-demo.mjs';

// MARK: - Kleine DOM-bouwstenen
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; };
const money = (value, currency) => Number.isFinite(value) && currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) : 'Unknown';
const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC' : 'Unknown';
const button = (text, action, style = 'text-button') => { const b = el('button', text, style); b.type = 'button'; b.onclick = action; return b; };
const field = (label, control) => { const wrap = el('div', null, 'cloud-field'), text = el('label', label); control.id ||= `workspace-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`; text.htmlFor = control.id; wrap.append(text, control); return wrap; };
const select = options => { const s = el('select'); for (const [value, name] of options) { const o = el('option', name); o.value = value; s.append(o); } return s; };

// MARK: - Tabs en inhoud behouden dezelfde ingelogde sessie
export function mountWorkspace({ getSnapshot, onClose, onDemoReset, isDemo, canClose }) {
  const panels = { accounts: 'accounts-panel', stats: 'premium-statistics', notes: 'notes-panel', open: 'open-panel', journal: 'journal-panel', connection: 'connection-panel' };
  let active = 'connection', stale = false, pending = false, dialogKey = null;
  const openFilter = select([['all', 'All accounts']]), noteFilter = select([['all', 'All accounts']]);
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search notes';
  const noteKind = select([['all', 'All notes'], ['note', 'Notes'], ['pre', 'Pre-trade'], ['post', 'Post-trade']]);
  const openList = el('div', null, 'cloud-grid'), notesList = el('div', null, 'notes-grid');
  const openStatus = el('p'), notesStatus = el('p'); openStatus.setAttribute('role', 'status'); notesStatus.setAttribute('role', 'status');
  const openControls = el('div', null, 'cloud-controls'); openControls.append(field('Open trade account', openFilter));
  const notesControls = el('div', null, 'cloud-controls'); notesControls.append(field('Note account', noteFilter), field('Note type', noteKind), field('Search notes', search));
  $('open-panel').append(el('p', 'POSITIONS IN PROGRESS', 'fx-eyebrow'), el('h2', 'Open trades'), el('p', 'Your recorded positions, not live broker orders. Closing a journal trade does not place or close an order at your broker.'), openControls, openStatus, openList);
  $('notes-panel').append(el('p', 'YOUR TRADING JOURNAL', 'fx-eyebrow'), el('h2', 'Notes'), el('p', 'Plain-text notes from PulseFX. Photos and rich-text formatting remain in the native app.'), notesControls, notesStatus, notesList);
  const demoReset = button('Reset demo data', onDemoReset); demoReset.hidden = !isDemo; $('workspace-demo-banner').append(demoReset);
  function show(name, focus = false) {
    if (!panels[name]) return;
    active = name;
    for (const [key, id] of Object.entries(panels)) {
      $(id).hidden = key !== active;
      const b = $(`tab-${key}`); b.setAttribute('aria-selected', String(key === active)); b.tabIndex = key === active ? 0 : -1;
    }
    $('results').hidden = !getSnapshot() || !['accounts', 'journal'].includes(active);
    $('workspace-empty').hidden = Boolean(getSnapshot()) || !['accounts', 'journal'].includes(active);
    $('workspace-toolbar').hidden = !getSnapshot();
    $('diagnostics').hidden = !getSnapshot();
    if (focus) $(`tab-${name}`).focus();
  }
  for (const key of Object.keys(panels)) {
    const tab = $(`tab-${key}`); tab.onclick = () => show(key);
    tab.onkeydown = event => {
      const keys = Object.keys(panels), index = keys.indexOf(key);
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); show(keys[event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length], true);
    };
  }
  function populate(control, accounts) {
    const current = control.value; control.replaceChildren();
    for (const [value, name] of [['all', 'All accounts'], ['unlinked', 'Unlinked / standalone'], ...accounts.map(a => [a.key, a.name || 'Unnamed account'])]) {
      const option = el('option', name); option.value = value; control.append(option);
    }
    if ([...control.options].some(o => o.value === current)) control.value = current;
  }
  function renderOpen() {
    const data = getSnapshot(); openList.replaceChildren();
    const all = data?.trades.filter(t => t.status === 'open') || [];
    $('open-badge').textContent = data ? String(all.length) : '—';
    const trades = all.filter(t => openFilter.value === 'all' || (openFilter.value === 'unlinked' ? !t.accountKey : t.accountKey === openFilter.value));
    openStatus.textContent = !data ? 'Connect iCloud and load your workspace to see open trades.' : `${stale ? 'Stale snapshot — refresh before taking action. ' : ''}${trades.length} open trades shown. ${data.collectionStatus !== 'complete' ? 'Incomplete read: other trades may be missing.' : 'No live market prices or unrealized P&L.'}`;
    for (const t of trades) {
      const account = data.accounts.find(a => a.key === t.accountKey), card = el('article', null, 'fx-card open-trade');
      const top = el('div', null, 'trade-heading'); top.append(el('h3', t.instrument || 'Unknown instrument'), el('span', t.direction || 'Direction unknown', 'tag')); card.append(top, el('p', account?.name || 'Unlinked account'), el('strong', `${t.lotSize ?? '—'} lots`, 'trade-lots'));
      const dl = el('dl', null, 'trade-facts');
      for (const [label, value] of [['Opened', date(t.startedAt)], ['Entry', t.entryPrice ?? '—'], ['Stop loss', t.stopLossPlacement ?? '—'], ['Risk', t.riskPercent == null ? '—' : `${t.riskPercent}%`]]) dl.append(el('dt', label), el('dd', String(value)));
      card.append(dl);
      const details = el('details'); details.append(el('summary', 'Trade notes'), el('h4', 'Before the trade'), el('p', t.preTradeNotes ?? 'Text stored as an attachment; view it in the native app.', 'note-body'), el('h4', 'After the trade'), el('p', t.postTradeNotes ?? 'Text stored as an attachment; view it in the native app.', 'note-body')); card.append(details);
      const enabled = t.recordType === 'CD_OpenTrade' && t.linkStatus === 'linked' && !stale;
      card.append(button(enabled ? (canClose(t) ? 'Close trade' : 'Review close') : 'View closing requirements', () => openClose(t.key)));
      openList.append(card);
    }
    if (data && !trades.length) openList.append(el('div', 'No open trades match this view. Refresh after adding a trade in the native app.', 'workspace-empty'));
  }
  function renderNotes() {
    const data = getSnapshot(); notesList.replaceChildren();
    const rows = (data?.notes || []).map(n => ({ ...n, kind: 'note', label: 'Note', body: n.body, title: n.title || 'Untitled note' }));
    for (const t of data?.trades || []) for (const [kind, label, key] of [['pre', 'Before trade', 'preTradeNotes'], ['post', 'After trade', 'postTradeNotes']]) {
      if (t[key] || t[key] === null && t.recordType === 'CD_OpenTrade') rows.push({ key: `${t.key}:${kind}`, kind, label, title: t.instrument || 'Trade note', body: t[key], accountKey: t.accountKey, createdAt: t.startedAt });
    }
    const query = search.value.trim().toLocaleLowerCase();
    const shown = rows.filter(n => (noteFilter.value === 'all' || (noteFilter.value === 'unlinked' ? !n.accountKey : n.accountKey === noteFilter.value)) && (noteKind.value === 'all' || n.kind === noteKind.value) && `${n.title} ${n.body || ''}`.toLocaleLowerCase().includes(query));
    notesStatus.textContent = !data ? 'Connect iCloud and load your workspace to see notes.' : `${stale ? 'Stale snapshot. ' : ''}${shown.length} notes shown. ${data.notesStatus === 'complete' ? 'Plain-text notes loaded.' : 'Standalone notes are incomplete or unavailable. Check Connection / Data checks; this does not mean your notes are empty.'}`;
    for (const n of shown.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))) {
      const card = el('article', null, 'fx-card note-card'); card.append(el('span', n.label, 'tag'), el('h3', n.title), el('small', `${data.accounts.find(a => a.key === n.accountKey)?.name || 'Standalone / unlinked'} · ${date(n.createdAt)}`), el('p', n.body === null ? 'Text is stored as an attachment or is unsupported. Open this note in the native app.' : n.body || 'This note has no plain-text body. It may contain photos or formatted content in the native app.', 'note-body')); notesList.append(card);
    }
    if (data && !shown.length) notesList.append(el('div', 'No notes match this view. Try another account or search term.', 'workspace-empty'));
  }
  function openClose(key) {
    const data = getSnapshot(), trade = data?.trades.find(t => t.key === key); if (!trade) return;
    dialogKey = key; const account = data.accounts.find(a => a.key === trade.accountKey), dialog = $('close-dialog'); dialog.replaceChildren();
    const form = el('form'), title = el('h2', isDemo ? 'Close demo trade' : 'Close journal trade'); title.id = 'close-title';
    const outcome = select([['win', 'Win'], ['loss', 'Loss'], ['breakEven', 'Break-even']]);
    const pnl = el('input'); pnl.type = 'number'; pnl.step = 'any'; pnl.required = true;
    const rr = el('input'); rr.type = 'number'; rr.step = 'any';
    const when = el('input'); when.type = 'datetime-local'; when.required = true; when.value = new Date().toISOString().slice(0, 16);
    const message = el('p', null, 'cloud-notice'); message.setAttribute('role', 'status');
    const review = el('div', null, 'close-review'); review.hidden = true;
    const confirm = el('input'); confirm.type = 'checkbox'; confirm.id = 'close-confirm'; const confirmLabel = el('label', 'I checked the result and balance change.'); confirmLabel.htmlFor = confirm.id;
    const submit = el('button', 'Review balance change', 'hero-button primary-button'); submit.type = 'submit';
    const cancel = button('Cancel', () => dialog.close());
    const allowed = canClose(trade) && !stale;
    const notice = isDemo ? 'Demo mode. This changes fictional data in this page only.' : allowed ? 'This updates your journal and account balance in iCloud. It does not close a broker order. Let your native apps finish syncing first.' : 'Closing from the web is not enabled for this trade yet. You can review the calculation; save the close in the native app until the sync test is complete.';
    form.append(title, el('p', `${trade.instrument || 'Trade'} · ${trade.lotSize ?? '—'} lots · ${account?.name || 'Unlinked'}`), el('p', notice), field('Result', outcome), field(`Realized P&L · ${account?.currency || 'unknown currency'}`, pnl), field('Final R (optional)', rr), field('Closed at · UTC', when), message, review, submit, cancel);
    const invalidate = () => { review.hidden = true; review.replaceChildren(); confirm.checked = false; submit.textContent = 'Review balance change'; };
    for (const c of [outcome, pnl, rr, when]) c.oninput = invalidate;
    let reviewed = null;
    form.onsubmit = async event => {
      event.preventDefault(); if (pending) return;
      try {
        const plan = planClose({ ...getSnapshot(), stale }, key, { result: outcome.value, profitLoss: pnl.value, finalRR: rr.value, closedAt: when.value + ':00Z' });
        const signature = JSON.stringify(plan.records);
        if (review.hidden || reviewed !== signature) {
          reviewed = signature; review.hidden = false; review.replaceChildren(el('strong', `${money(plan.account.balance, plan.account.currency)} → ${money(plan.balance, plan.account.currency)}`), el('p', `Realized P&L: ${money(plan.profitLoss, plan.account.currency)}. Closed at ${date(plan.closedAt)}.`));
          message.textContent = allowed ? 'Review these values before confirming.' : 'Calculation only. No iCloud data has changed.';
          if (allowed) { review.append(confirm, confirmLabel); submit.textContent = isDemo ? 'Confirm demo close' : 'Confirm close in iCloud'; }
          return;
        }
        if (!allowed) { message.textContent = 'Close this trade in the native app until web closing is enabled.'; return; }
        if (!confirm.checked) { message.textContent = 'Confirm that you checked the result and balance change.'; confirm.focus(); return; }
        pending = true; submit.disabled = true; cancel.disabled = true; message.textContent = isDemo ? 'Updating demo…' : 'Saving once to iCloud…';
        await onClose(plan); dialog.close();
      } catch (error) { message.textContent = error.message; }
      finally { pending = false; submit.disabled = false; cancel.disabled = false; }
    };
    dialog.append(form); dialog.oncancel = event => { if (pending) event.preventDefault(); }; dialog.onclose = () => { dialogKey = null; dialog.replaceChildren(); };
    dialog.showModal(); pnl.focus();
  }
  openFilter.onchange = renderOpen; for (const c of [noteFilter, noteKind, search]) c.oninput = renderNotes;
  show('connection'); renderOpen(); renderNotes();
  return {
    show,
    update(isStale = false, first = false) {
      stale = isStale; const data = getSnapshot(); populate(openFilter, data?.accounts || []); populate(noteFilter, data?.accounts || []);
      renderOpen(); renderNotes(); show(first && active === 'connection' ? 'accounts' : active);
      if (dialogKey && !pending) $('close-dialog').close();
    },
    clear() { if ($('close-dialog').open) $('close-dialog').close(); openFilter.value = 'all'; noteFilter.value = 'all'; noteKind.value = 'all'; search.value = ''; this.update(); show('connection'); },
  };
}

// MARK: - Eén fictieve dataset voor alle workspace-tabs
export function workspaceDemo() {
  const base = statisticsDemo();
  const accounts = base.accounts.map((a, i) => ({ ...a, id: `demo-account-${i}`, recordName: `demo-account-${i}`, balance: i ? 10420 : 25196, startBalance: i ? 10000 : 25000, kind: i ? 'phase' : 'funded', createdAt: '2026-10-01T08:00:00Z' }));
  const openedAt = new Date(Date.now() - 3600000).toISOString();
  const open = accounts.map((a, i) => ({ key: `open-${i}`, id: `demo-trade-${i}`, recordName: `demo-trade-${i}`, recordType: 'CD_OpenTrade', accountKey: a.key, currency: a.currency,
    linkStatus: 'linked', instrument: i ? 'GBPUSD' : 'EURUSD', lotSize: i ? .35 : 1.24, status: 'open', result: 'open', outcomeConsistent: true, direction: i ? 'short' : 'long', riskPercent: 1,
    entryPrice: i ? 1.31 : 1.08, stopLossPlacement: i ? 1.315 : 1.075, startedAt: openedAt, profitLoss: null, finalRR: null,
    preTradeNotes: 'Wait for a confirmed setup. Keep risk within the account plan.', postTradeNotes: '' }));
  return { ...base, source: 'demo', accounts, trades: [...open, ...base.trades], notesStatus: 'complete', notes: [{ key: 'note-demo', title: 'Weekly review', body: 'Focus on execution and record the reason for each trade.\nReview the journal at the end of the week.', accountKey: accounts[0].key, createdAt: openedAt }],
    issues: [], failures: [], coverage: [], fetchedAt: new Date().toISOString(), environment: 'demo', zone: { zoneName: 'Fictional workspace' } };
}
