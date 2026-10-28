import { openNoteEditor } from './note-editor.mjs';
import { noteRows, mountNotesView } from './notes-view.mjs';
import { openTradeDetail } from './trade-detail.mjs';
import { mountAppearance } from './appearance.mjs';
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
export function mountWorkspace({ getSnapshot, onClose, onDemoReset, isDemo, canClose, canEdit, onEdit, canEditNotes, onSaveNote }) {
  mountAppearance();
  const panels = { open: 'open-panel', accounts: 'accounts-panel', stats: 'premium-statistics', notes: 'notes-panel', connection: 'connection-panel' };
  const requestedView = new URLSearchParams(location.search).get('view');
  const initialView = Object.hasOwn(panels, requestedView) ? requestedView : (new URLSearchParams(location.search).get('statistics') === 'demo' || location.hash === '#premium-statistics') ? 'stats' : 'connection';
  let active = initialView, stale = false, pending = false, dialogKey = null;
  // Comment NL: Sluitinvoer blijft alleen in geheugen zolang hetzelfde tradevenster openstaat.
  const closeDrafts = new Map();
  const openFilter = select([['all', 'All accounts']]), noteFilter = select([['all', 'All accounts']]);
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search notes';
  const noteKind = select([['note', 'Notes'], ['all', 'All notes'], ['pre', 'Pre-trade'], ['post', 'Post-trade']]);
  const openList = el('div', null, 'open-trade-list'), notesList = el('div', null, 'notes-list');
  const openStatus = el('p'), notesStatus = el('p'); openStatus.setAttribute('role', 'status'); notesStatus.setAttribute('role', 'status');
  const openControls = el('div', null, 'cloud-controls'); openControls.append(field('Open trade account', openFilter));
  const notesControls = el('div', null, 'cloud-controls'); notesControls.append(field('Note account', noteFilter), field('Note type', noteKind), field('Search notes', search));
  $('open-panel').append(el('p', 'POSITIONS IN PROGRESS', 'fx-eyebrow'), el('h2', 'Open trades'), el('p', 'Your recorded positions, not live broker orders. Closing a journal trade does not place or close an order at your broker.'), openControls, openStatus, openList);
  const notesLayout = el('div', null, 'notes-split'), notesSidebar = el('aside', null, 'notes-sidebar'), notesDetail = el('article', null, 'note-detail');
  notesDetail.id = 'selected-note'; notesDetail.setAttribute('aria-label', 'Selected note');
  notesSidebar.setAttribute('aria-label', 'Notes list'); notesSidebar.append(notesControls, notesList); notesLayout.append(notesSidebar, notesDetail);
  const notesActions = el('div', null, 'notes-actions');
  const newNote = button('New note', () => editNote(null), 'hero-button primary-button'); notesActions.append(notesStatus, newNote);
  $('notes-panel').append(notesActions, notesLayout);
  function editNote(note) {
    openNoteEditor({ note, snapshot: getSnapshot(), canSave: canEditNotes, onSave: async (key, input, identity) => {
      const saved = await onSaveNote(key, input, identity);
      // Comment NL: Behoud de context bij bewerken; maak de opgeslagen notitie zichtbaar als zij buiten het filter valt.
      const row = noteRows(getSnapshot()).find(n => n.key === saved.key);
      if (row && !matchesNote(row)) { noteFilter.value = 'all'; noteKind.value = 'note'; search.value = ''; }
      notesView.select(saved.key); renderNotes();
      notesStatus.textContent = isDemo ? 'Demo note saved for this page.' : 'Note saved to iCloud and refreshed. Native sync may take a moment.';
    } });
  }
  const notesView = mountNotesView({ list: notesList, detail: notesDetail, onEdit: editNote, canEdit: canEditNotes, onTrade: t => openTradeDetail(t, getSnapshot(), () => openClose(t.key), { startEditing: true, canEdit: () => canEdit(t), onSave: changes => onEdit(t.key, changes) }) });
  const demoReset = button('Reset demo data', onDemoReset); demoReset.hidden = !isDemo; $('workspace-demo-banner').append(demoReset);
  const sectionBar = $('stats-sections');
  const requestedSection = new URLSearchParams(location.search).get('section');
  let statsSection = ['overview','performance','timing','journal','trades','records'].includes(requestedSection) ? requestedSection : 'overview';
  for (const [key, label] of [['overview', 'Overview'], ['performance', 'Performance'], ['timing', 'Timing'], ['journal', 'Journal'], ['trades', 'Trades']]) {
    const control = button(label, () => { statsSection = key; show('stats', false, true); });
    control.dataset.section = key; sectionBar.append(control);
  }
  function updateStatsSections() {
    sectionBar.hidden = active !== 'stats';
    document.body.classList.toggle('workspace-stats',active === 'stats');
    const panel=$('premium-statistics');
    if(panel.dataset.activeSection!==statsSection){panel.dataset.activeSection=statsSection;panel.dispatchEvent(new CustomEvent('stats-section-change',{detail:statsSection}));}
    requestAnimationFrame(()=>sectionBar.style.setProperty('--stats-nav-top',`${$('tab-stats').getBoundingClientRect().bottom+8}px`));
    for (const control of sectionBar.children) control.setAttribute('aria-pressed', String(control.dataset.section === statsSection));
    for (const group of document.querySelectorAll('[data-stats-section]')) group.hidden = group.dataset.statsSection !== statsSection;
    $('premium-statistics').hidden = active !== 'stats' || statsSection === 'records';
    $('journal-panel').hidden = active !== 'stats' || statsSection !== 'records';
    $('results').hidden = !getSnapshot() || !(active === 'accounts' || active === 'stats' && statsSection === 'records');
  }
  window.addEventListener('resize',updateStatsSections);
  new MutationObserver(updateStatsSections).observe($('premium-statistics'), { childList: true, subtree: true });
  function show(name, focus = false, navigate = false) {
    if (name === 'journal') { statsSection = 'records'; name = 'stats'; }

    if (!panels[name]) return;
    active = name;
    // Comment NL: Alleen de navigatie bewaren, nooit accountgegevens of Apple-tokens.
    if (!document.body.hasAttribute('data-login-entry')) {
      const url = new URL(location.href); url.searchParams.set('view', active);
      if (active === 'stats') url.searchParams.set('section', statsSection);
      if (url.href !== location.href) history[navigate ? 'pushState' : 'replaceState'](null, '', url);
    }
    for (const [key, id] of Object.entries(panels)) {
      $(id).hidden = key !== active;
      const b = $(`tab-${key}`); b.setAttribute('aria-selected', String(key === active)); b.tabIndex = key === active ? 0 : -1;
    }
    $('results').hidden = !getSnapshot() || !['accounts', 'journal'].includes(active);
    $('workspace-empty').hidden = Boolean(getSnapshot()) || active === 'connection';
    $('workspace-toolbar').hidden = !getSnapshot();
    $('diagnostics').hidden = !getSnapshot();
    const titles = { open: ['Open trades', 'Your positions, at a glance.'], accounts: ['Accounts', 'A clear view of every trading account.'], stats: ['Stats', 'Understand your performance and trading patterns.'], notes: ['Notes', 'Your ideas and reflections, together.'], connection: ['Settings', 'Appearance, iCloud and website access.'] };
    $('workspace-title').textContent = titles[name][0];
    $('workspace-description').textContent = titles[name][1];
    updateStatsSections();
    if (focus) $(`tab-${name}`).focus();
  }
  for (const key of Object.keys(panels)) {
    const tab = $(`tab-${key}`); tab.onclick = () => show(key, false, true);
    tab.onkeydown = event => {
      const keys = Object.keys(panels), index = keys.indexOf(key);
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); show(keys[event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length], true, true);
    };
  }
  // Comment NL: Browsernavigatie herstelt het scherm zonder de iCloud-sessie opnieuw te starten.
  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (!Object.hasOwn(panels, view)) return;
    const section = params.get('section');
    if (['overview', 'performance', 'timing', 'journal', 'trades', 'records'].includes(section)) statsSection = section;
    show(view);
  });
  function populate(control, accounts) {
    const current = control.value; control.replaceChildren();
    for (const [value, name] of [['all', 'All accounts'], ['unlinked', 'Unlinked / standalone'], ...accounts.map(a => [a.key, a.name || 'Unnamed account'])]) {
      const option = el('option', name); option.value = value; control.append(option);
    }
    if ([...control.options].some(o => o.value === current)) control.value = current;
  }
  function renderOpen() {
    const data = getSnapshot(); openList.replaceChildren();
    const all = data?.trades.filter(t => t.status === 'open').sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0)) || [];
    $('open-badge').textContent = data ? String(all.length) : '—';
    const trades = all.filter(t => openFilter.value === 'all' || (openFilter.value === 'unlinked' ? !t.accountKey : t.accountKey === openFilter.value));
    openStatus.textContent = !data ? 'Connect iCloud and load your workspace to see open trades.' : `${stale ? 'Stale snapshot — refresh before taking action. ' : ''}${trades.length} open trades shown. ${data.collectionStatus !== 'complete' ? 'Incomplete read: other trades may be missing.' : 'No live market prices or unrealized P&L.'}`;
    for (const t of trades) {
      const account = data.accounts.find(a => a.key === t.accountKey), card = el('article', null, 'fx-card open-trade');
      const direction = ['long', 'short'].includes(t.direction) ? t.direction : 'unknown';
      const top = el('div', null, 'trade-heading'); top.append(el('h3', t.instrument || 'Unknown instrument'), el('span', direction === 'unknown' ? 'Direction unknown' : direction === 'long' ? 'Long' : 'Short', `tag trade-direction trade-direction--${direction}`)); card.append(top, el('p', account?.name || 'Unlinked account'), el('strong', `${t.lotSize ?? '—'} lots`, 'trade-lots'));
      card.append(el('small', `${date(t.startedAt)} · Risk ${t.riskPercent == null ? 'unknown' : `${t.riskPercent}%`}`));
      card.append(button('Close trade', () => openTradeDetail(t, getSnapshot(), () => openClose(t.key), { startEditing: true, canEdit: () => canEdit(t), onSave: changes => onEdit(t.key, changes) })));
      openList.append(card);
    }
    if (data && !trades.length) openList.append(el('div', 'No open trades match this view. Refresh after adding a trade in the native app.', 'workspace-empty'));
  }
  function matchesNote(n) {
    return (noteFilter.value === 'all' || (noteFilter.value === 'unlinked' ? !n.accountKey : n.accountKey === noteFilter.value)) && (noteKind.value === 'all' || n.kind === noteKind.value) && `${n.title} ${n.body || ''}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
  }
  function renderNotes() {
    const data = getSnapshot(); notesList.replaceChildren();
    newNote.hidden = !canEditNotes();
    const rows = noteRows(data);
    const shown = rows.filter(matchesNote);
    notesStatus.textContent = !data ? 'Connect iCloud and load your workspace to see notes.' : `${stale ? 'Stale snapshot. ' : ''}${shown.length} notes shown. ${data.notesStatus === 'complete' ? 'Plain-text notes loaded.' : 'Standalone notes are incomplete or unavailable. Check Settings / Data checks; this does not mean your notes are empty.'}`;
    notesView.render(shown, data);
  }
  function openClose(key) {
    const data = getSnapshot(), trade = data?.trades.find(t => t.key === key); if (!trade) return;
    dialogKey = key; const account = data.accounts.find(a => a.key === trade.accountKey), dialog = $('close-dialog'); dialog.replaceChildren();
    const form = el('form'), title = el('h2', isDemo ? 'Close demo trade' : 'Close journal trade'); title.id = 'close-title';
    const draft = closeDrafts.get(key);
    const outcome = select([['win', 'Win'], ['loss', 'Loss'], ['breakEven', 'Break-even']]);
    const pnl = el('input'); pnl.type = 'number'; pnl.step = 'any'; pnl.required = true;
    const rr = el('input'); rr.type = 'number'; rr.step = 'any';
    const when = el('input'); when.type = 'datetime-local'; when.required = true; when.value = new Date().toISOString().slice(0, 16);
    if (draft) { outcome.value = draft.result; pnl.value = draft.pnl; rr.value = draft.rr; when.value = draft.when; }
    else if (Number.isFinite(trade.finalRR)) rr.value = String(trade.finalRR);
    const message = el('p', null, 'cloud-notice'); message.setAttribute('role', 'status');
    const review = el('div', null, 'close-review'); review.hidden = true;
    const confirm = el('input'); confirm.type = 'checkbox'; confirm.id = 'close-confirm'; const confirmLabel = el('label', 'I checked the result and balance change.'); confirmLabel.htmlFor = confirm.id;
    const submit = el('button', 'Review balance change', 'hero-button primary-button'); submit.type = 'submit';
    const cancel = button('Back to trade', () => dialog.close());
    const allowed = canClose(trade) && !stale;
    const notice = isDemo ? 'Demo mode. This changes fictional data in this page only.' : allowed ? 'This updates your journal and account balance in iCloud. It does not close a broker order. Let your native apps finish syncing first.' : 'Saving a close is not enabled on this website yet. You can preview the balance change below; your trade will stay open.';
    form.append(title, el('p', `${trade.instrument || 'Trade'} · ${trade.lotSize ?? '—'} lots · ${account?.name || 'Unlinked'}`), el('p', notice), field('Result', outcome), field(`Realized P&L · ${account?.currency || 'unknown currency'}`, pnl), field('Final R (optional)', rr), field('Closed at · UTC', when), message, review, submit, cancel);
    const invalidate = () => { closeDrafts.set(key, { result: outcome.value, pnl: pnl.value, rr: rr.value, when: when.value }); review.hidden = true; review.replaceChildren(); confirm.checked = false; submit.textContent = 'Review balance change'; };
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
        if (!allowed) { message.textContent = 'Preview only — your trade is still open. Web closing must be enabled before you can save.'; return; }
        if (!confirm.checked) { message.textContent = 'Confirm that you checked the result and balance change.'; confirm.focus(); return; }
        pending = true; submit.disabled = true; cancel.disabled = true; message.textContent = isDemo ? 'Updating demo…' : 'Saving once to iCloud…';
        await onClose(plan); closeDrafts.delete(key); dialog.close(); document.getElementById('trade-detail-dialog')?.close();
      } catch (error) { message.textContent = error.message; }
      finally { pending = false; submit.disabled = false; cancel.disabled = false; }
    };
    dialog.append(form); dialog.oncancel = event => { if (pending) event.preventDefault(); }; dialog.onclose = () => { dialogKey = null; dialog.replaceChildren(); };
    document.getElementById('trade-detail-dialog')?.addEventListener('close', () => closeDrafts.delete(key), { once: true });
    dialog.showModal(); pnl.focus();
  }
  openFilter.onchange = renderOpen; for (const c of [noteFilter, noteKind, search]) c.oninput = renderNotes;
  show(initialView); renderOpen(); renderNotes();
  return {
    show,
    openTrade(t) { openTradeDetail(t, getSnapshot(), () => openClose(t.key), { startEditing: true, canEdit: () => canEdit(t), onSave: changes => onEdit(t.key, changes) }); },
    openNote(n) { noteFilter.value = n.accountKey || 'all'; noteKind.value = n.kind; search.value = ''; notesView.select(n.key); renderNotes(); show('notes'); },
    update(isStale = false, first = false) {
      stale = isStale; const data = getSnapshot(); populate(openFilter, data?.accounts || []); populate(noteFilter, data?.accounts || []);
      renderOpen(); renderNotes(); show(first && active === 'connection' ? 'open' : active);
      if (dialogKey && !pending) $('close-dialog').close();
    },
    clear() { document.getElementById('account-detail-dialog')?.close(); closeDrafts.clear(); document.getElementById('note-editor-dialog')?.close(); document.getElementById('trade-detail-dialog')?.close(); if ($('close-dialog').open) $('close-dialog').close(); openFilter.value = 'all'; noteFilter.value = 'all'; noteKind.value = 'note'; search.value = ''; this.update(); show(active); },
  };
}

// MARK: - Eén fictieve dataset voor alle workspace-tabs
export function workspaceDemo() {
  const base = statisticsDemo();
  const accounts = base.accounts.map((a, i) => ({ ...a, zone: { zoneName: 'DemoZone', ownerRecordName: 'demo' }, archived: false, id: `demo-account-${i}`, recordName: `demo-account-${i}`, balance: i ? 10420 : 25196, startBalance: i ? 10000 : 25000, kind: i ? 'phase' : 'funded', createdAt: '2026-10-01T08:00:00Z' }));
  const openedAt = new Date(Date.now() - 3600000).toISOString();
  const open = accounts.map((a, i) => ({ key: `open-${i}`, id: `demo-trade-${i}`, recordName: `demo-trade-${i}`, recordType: 'CD_OpenTrade', accountKey: a.key, currency: a.currency,
    zone: a.zone, accountReference: a.id, directionRaw: i ? 'short' : 'long', linkStatus: 'linked', instrument: i ? 'GBPUSD' : 'EURUSD', lotSize: i ? .35 : 1.24, status: 'open', result: 'open', outcomeConsistent: true, direction: i ? 'short' : 'long', riskPercent: 1,
    entryPrice: i ? 1.31 : 1.08, stopLossPlacement: i ? 1.315 : 1.075, startedAt: openedAt, profitLoss: null, finalRR: null,
    preTradeNotes: 'Wait for a confirmed setup. Keep risk within the account plan.', postTradeNotes: '' }));
  return { ...base, source: 'demo', accounts, trades: [...open, ...base.trades], notesStatus: 'complete', notes: [{ key: 'note-demo', id: 'demo-note', zone: accounts[0].zone, recordType: 'CD_TradeNote', hasRichText: false, tradeId: open[0].id, title: 'Weekly review', body: 'Focus on execution and record the reason for each trade.\nReview the journal at the end of the week.', accountKey: accounts[0].key, createdAt: openedAt }],
    issues: [], failures: [], coverage: [], fetchedAt: new Date().toISOString(), environment: 'demo', zone: { zoneName: 'Fictional workspace' } };
}
