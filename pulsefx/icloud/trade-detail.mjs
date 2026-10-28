import { renderTradeSummary } from './trade-summary.mjs';
import { appendScreenshots } from './screenshots.mjs';
import { decorateStrategy } from './strategy-controls.mjs';
import { EDIT_FIELDS } from './edit-trade.mjs';
import { labels, sessionLabel, psychologyLabel } from './mac-statistics.mjs';

// MARK: - Native-geïnspireerde trade-inspectie
// Comment NL: Alleen ingelezen velden tonen; geen ontbrekende waarden of schrijfrechten suggereren.
export function openTradeDetail(trade, snapshot, onCloseTrade, options = {}) {
  document.getElementById('trade-detail-dialog')?.remove();
  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const action = (text, fn, cls = 'text-button') => { const b = make('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
  const value = v => v == null || v === '' ? 'Not recorded or unavailable' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
  const date = v => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('en-GB') : 'Unknown';
  const account = snapshot.accounts.find(a => a.key === trade.accountKey);
  const money = v => Number.isFinite(v) && trade.currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency: trade.currency }).format(v) : value(v);
  const start = Date.parse(trade.startedAt), end = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const minutes = Math.floor((end - start) / 60000);
  const duration = Number.isFinite(minutes) && minutes >= 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : 'Unknown';
  const dialog = make('dialog', null, 'trade-detail-dialog'); dialog.id = 'trade-detail-dialog'; dialog.setAttribute('aria-labelledby', 'trade-detail-title');
  let dirty = false, saving = false, activeTab = 0, beginEditing;
  const changes = {};
  function requestClose() { if (!saving && (!dirty || confirm('Discard unsaved trade changes?'))) dialog.close(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  const header = make('header', null, 'trade-detail-header');
  const heading = make('div'); const title = make('h2', trade.instrument || 'Trade'); title.id = 'trade-detail-title'; heading.append(title, make('small', `${date(trade.startedAt)} · local time`));
  const dismiss = action('×', requestClose, 'text-button trade-dialog-dismiss');
  dismiss.setAttribute('aria-label', 'Close details'); dismiss.title = 'Close details';
  header.append(heading, make('span', (trade.status || 'Unknown').toUpperCase(), 'tag'), make('span', `${account?.name || 'Unlinked account'} · ${duration}`), make('strong', `${value(trade.lotSize)} lots`), dismiss);
  const nav = make('div', null, 'trade-detail-tabs'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Trade detail sections');
  const body = make('div', null, 'trade-detail-body');
  const guide = make('p', 'Review your trade, add your notes, and close it when you’re ready.', 'trade-detail-guide');
  const panels = [];
  const section = (parent, title, pairs) => {
    const card = make('section', null, 'trade-detail-card'); card.append(make('h3', title));
    const dl = make('dl');
    for (const [label, v] of pairs) { const row = make('div'); row.append(make('dt', label), make('dd', value(v))); dl.append(row); }
    card.append(dl); parent.append(card);
  };
  const note = v => v === null ? 'This text is unavailable here. Open the native app to view attachments or rich text.' : v || 'No note recorded.';
  for (const [index, name] of ['Details', 'Strategy', 'Psychology', 'Notes', 'Summary'].entries()) {
    const panel = make('section'); panel.id = `trade-detail-panel-${index}`; panel.setAttribute('role', 'tabpanel');
    const tab = action(name, () => select(index)); tab.id = `trade-detail-tab-${index}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', tab.id);
    tab.onkeydown = e => { const keys = ['ArrowRight','ArrowLeft','Home','End']; if (!keys.includes(e.key)) return; e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 4 : (index + (e.key === 'ArrowRight' ? 1 : 4)) % 5; select(next); nav.children[next].focus(); };
    nav.append(tab); panels.push(panel); body.append(panel);
  }
  function select(index) { activeTab = index; panels.forEach((p, i) => { p.hidden = index !== i; nav.children[i].setAttribute('aria-selected', String(index === i)); nav.children[i].tabIndex = index === i ? 0 : -1; }); }
  section(panels[0], 'Trade details', [['Result', trade.result], ['Direction', trade.direction], ['Account', account?.name || 'Unlinked account'], ['P/L', trade.status === 'open' ? 'Not realized · no live P/L' : money(trade.profitLoss)]]);
  section(panels[0], 'Risk & reward', [['Entry', trade.entryPrice], ['Stop loss', trade.stopLossPlacement], ['Close price', trade.actualExitPrice], ['Target R:R', trade.targetRR], ['Final R:R', trade.finalRR], ['Risk percentage', trade.riskPercent == null ? null : `${trade.riskPercent}%`], ['Stop loss (pips)', trade.stopLossPips], ['Pip value', trade.pipValue]]);
  section(panels[1], 'Strategy & execution', [['Setup', labels(trade, 'setup').join(', ')], ['Timeframe', trade.timeframesSelectedRaw], ['Mistake', labels(trade, 'mistake').join(', ')], ['Trade type', trade.tradeTypeRaw], ['Session', sessionLabel(trade)], ['Confluences', trade.confluences], ['Stop loss moved', trade.slMoved], ['Break-even hit', trade.breakEvenHitRaw], ['Weekend hold', trade.weekendHoldRaw]]);
  section(panels[2], 'Psychology & review', [['Emotion', psychologyLabel(trade)], ['Confidence', trade.confidenceRating], ['Execution', trade.tradeRating]]);
  section(panels[3], 'Journal notes', [['Before the trade', note(trade.preTradeNotes)], ['After the trade', note(trade.postTradeNotes)]]);
  appendScreenshots(panels[3], trade, snapshot);
  renderTradeSummary(panels[4], trade, account);
  const footer = make('footer', null, 'trade-detail-footer');
  const status = make('small', options.message || 'Take your time — nothing changes until you save or confirm.'); status.setAttribute('role', 'status'); footer.append(status);
  const closeAction = action('Close trade', () => { if (dirty) { status.textContent = 'Save your changes first, then choose Close trade to review the result.'; return; } onCloseTrade(); }, 'text-button');
  const editable = trade.recordType === 'CD_OpenTrade' && trade.status === 'open' && trade.outcomeConsistent;
  if (editable && options.canEdit?.()) {
    const edit = action('Edit trade', beginEditing = () => {
      edit.remove();
      const controls = [];
      ['Details', 'Strategy', 'Psychology', 'Notes'].forEach((name, index) => {
        panels[index].replaceChildren();
        let card = make('section', null, 'trade-detail-card trade-edit-fields'); card.append(make('h3', name === 'Details' ? 'Trade details' : name));
        panels[index].append(card);
        if (name === 'Notes') { card.classList.add('native-trade-notes'); card.append(make('p', 'Keep your plan and post-trade lessons together.', 'strategy-intro')); }
        if (name === 'Strategy') { card.classList.add('strategy-fields'); const intro = make('p', 'Capture the setup, timeframe and confluences behind the trade.', 'strategy-intro'); card.append(intro); }
        if (name === 'Psychology') { card.classList.add('strategy-fields'); card.append(make('p', 'Reflect on emotion, confidence and execution quality.', 'strategy-intro')); }
        for (const [key, label, group, type, cloud] of EDIT_FIELDS.filter(f => f[2] === name)) {
          if (key === 'sessionRaw' || key === 'emotionalStateRaw') { const extra = make('details', null, 'strategy-additional'); extra.append(make('summary', 'Additional journal fields')); card = make('section', null, 'trade-detail-card trade-edit-fields'); extra.append(card); panels[index].append(extra); }
          if (key === 'entryPrice') { card = make('section', null, 'trade-detail-card trade-edit-fields'); card.append(make('h3', 'Risk & reward')); panels[index].append(card); }
          const wrap = make('div', null, 'cloud-field'), caption = make('label', label);
          let control;
          if (Array.isArray(type) || type === 'account' || type === 'boolean') {
            control = make('select');
            const values = Array.isArray(type) ? type.map(v => [v, v === 'none' ? 'Not specified' : v.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())])
              : type === 'boolean' ? [['', 'Not recorded'], ['true', 'Yes'], ['false', 'No']]
              : [['', 'No account'], ...snapshot.accounts.filter(a => a.archived === false).map(a => [a.id, a.name])];
            for (const [v, label] of values) { const option = make('option', label); option.value = v; control.append(option); }
            const current = trade[key] == null ? '' : String(trade[key]);
            if (![...control.options].some(o => o.value === current)) { const unknown = make('option', current || 'Not recorded'); unknown.value = current; control.prepend(unknown); }
            control.value = current;
          } else {
            control = make(type === 'note' ? 'textarea' : 'input');
            if (type === 'note') { control.placeholder = key === 'preTradeNotes' ? 'Write your analysis before the trade…' : 'Write your review and lessons learned…'; control.rows = 5; control.maxLength = 10000; }
            else { control.type = ['text'].includes(type) ? 'text' : 'number'; if (control.type === 'number') control.step = type === 'integer' ? '1' : 'any'; else control.maxLength = 1000; }
            control.value = trade[key] == null ? '' : String(trade[key]);
          }
          const baseline = control.value; control.id = `trade-edit-${key}`; caption.htmlFor = control.id;
          control.disabled = Boolean(trade.blockedEditFields?.includes(`CD_${cloud || key}`));
          control.addEventListener('input', () => {
            if (control.value === baseline) delete changes[key];
            else changes[key] = type === 'boolean' ? (control.value === '' ? null : control.value === 'true') : control.value;
            dirty = Object.keys(changes).length > 0; status.textContent = dirty ? 'Unsaved changes' : 'No changes';
          });
          wrap.append(caption, control);
          if (control.disabled) wrap.append(make('small', 'Unsupported or invalid stored value. Edit this field in the native app.'));
          if (name === 'Strategy' || name === 'Psychology') decorateStrategy(key, control, wrap);
          card.append(wrap); controls.push(control);
        }
      });
      appendScreenshots(panels[3], trade, snapshot);
      function updateSummary() {
        const accountId = controls.find(c => c.id === 'trade-edit-accountReference')?.value;
        const selectedAccount = snapshot.accounts.find(a => a.id === accountId);
        renderTradeSummary(panels[4], trade, selectedAccount, dirty);
      }
      controls.forEach(c => c.addEventListener('input', updateSummary)); updateSummary();
      const save = action(snapshot.source === 'demo' ? 'Save demo changes' : 'Save changes to iCloud', async () => {
        if (saving) return;
        if (!dirty) { status.textContent = 'No changes to save.'; return; }
        if (!options.canEdit?.()) { status.textContent = 'Editing is unavailable. Close this window and refresh first.'; return; }
        saving = true; const disabled = [...dialog.querySelectorAll('button, input, select, textarea')].map(c => [c, c.disabled]); disabled.forEach(([c]) => c.disabled = true);
        status.textContent = 'Saving changes…';
        try {
          const result = await options.onSave({ ...changes });
          if (!dialog.isConnected) return;
          dirty = false; dialog.close();
          openTradeDetail(result.trade, result.snapshot, onCloseTrade, { ...options, initialTab: activeTab, message: snapshot.source === 'demo' ? 'Demo changes saved for this page.' : 'Saved to iCloud and refreshed. Native sync may take a moment.' });
        } catch (error) { status.textContent = error.message; }
        finally { saving = false; disabled.forEach(([c, wasDisabled]) => c.disabled = wasDisabled); }
      }, 'hero-button primary-button');
      footer.append(save); status.textContent = options.message || 'Make your changes below. Save first, then close the trade when you’re ready.'; select(activeTab);
    }, 'hero-button primary-button');
    footer.append(edit);
  } else status.textContent = options.message || (editable ? 'iCloud editing is not enabled here yet. You can try editing in the demo.' : 'Edit this trade in the native app.');
  if (trade.status === 'open') footer.append(closeAction);
  dialog.append(header, guide, nav, body, footer); document.body.append(dialog); select(0);
  dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
  if (options.startEditing && beginEditing) beginEditing();
  select(options.initialTab ?? 0);
}
