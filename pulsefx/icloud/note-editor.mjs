// MARK: - Notitieconcept uitsluitend in het huidige geheugen
// Comment NL: Geen autosave of lokale kopie van privénotities; onbekende saves nooit herhalen.
export function openNoteEditor({ note = null, snapshot, canSave, onSave }) {
  const make = (tag, text) => { const el = document.createElement(tag); if (text != null) el.textContent = text; return el; };
  const dialog = make('dialog'); dialog.id = 'note-editor-dialog'; dialog.className = 'trade-detail-dialog'; dialog.setAttribute('aria-labelledby', 'note-editor-title');
  const identity = crypto.randomUUID(); let dirty = false, pending = false;
  const close = () => { if (!pending && (!dirty || confirm('Discard unsaved note changes?'))) dialog.close(); };
  dialog.oncancel = e => { e.preventDefault(); close(); };
  const header = make('header'); header.className = 'trade-detail-header'; const title = make('h2', note ? 'Edit note' : 'New note'); title.id = 'note-editor-title';
  const cancel = make('button', 'Cancel'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.onclick = close; header.append(title, cancel);
  const form = make('form'); form.className = 'trade-detail-body note-edit-form';
  const field = (label, input, id) => { const wrapper = make('div'), caption = make('label', label); wrapper.className = 'cloud-field'; input.id = id; caption.htmlFor = id; wrapper.append(caption, input); form.append(wrapper); return input; };
  const name = field('Title', make('input'), 'note-edit-title'); name.value = note?.title || ''; name.maxLength = 200; name.required = true;
  const body = field('Note text', make('textarea'), 'note-edit-body'); body.value = note?.body || ''; body.maxLength = 10000; body.rows = 12;
  const count = make('small'); const updateCount = () => { count.textContent = `${body.value.trim().split(/\s+/).filter(Boolean).length} words · ${body.value.length} / 10,000 characters`; }; updateCount(); form.append(count); body.oninput = updateCount;
  let account, trade;
  if (!note) {
    account = field('Account (optional)', make('select'), 'note-edit-account'); trade = field('Trade (optional)', make('select'), 'note-edit-trade');
    for (const [value, text] of [['', 'No account'], ...snapshot.accounts.map(a => [a.key, a.name])]) {
      const option = make('option', text); option.value = value; account.append(option);
    }
    const renderTrades = () => {
      const previous = trade.value; trade.replaceChildren();
      const empty = make('option', 'No trade'); empty.value = ''; trade.append(empty);
      for (const t of snapshot.trades.filter(t => t.id && (!account.value || t.accountKey === account.value))) {
        const accountName = snapshot.accounts.find(a => a.key === t.accountKey)?.name || 'No account';
        const option = make('option', `${t.instrument || 'Trade'} · ${t.lotSize ?? '—'} lots · ${accountName} · ${t.startedAt?.slice(0, 10) || 'Unknown date'}`);
        option.value = t.key; trade.append(option);
      }
      if ([...trade.options].some(o => o.value === previous)) trade.value = previous;
    };
    renderTrades(); account.onchange = renderTrades;
    trade.onchange = () => { const linked = snapshot.trades.find(t => t.key === trade.value); if (linked) account.value = linked.accountKey || ''; account.disabled = Boolean(linked); };

  }
  const replace = make('input'); replace.type = 'checkbox'; replace.id = 'note-replace-formatting';
  if (note?.hasRichText) { const warning = make('div'); warning.className = 'cloud-notice'; const label = make('label', 'Replace the existing formatting with plain text when changing the note text. Photos are kept.'); label.htmlFor = replace.id; warning.append(replace, label); form.append(warning); }
  else form.append(make('p', 'Plain-text note. Photos and rich-text formatting are edited in the native app.'));

  const footer = make('footer'); footer.className = 'trade-detail-footer'; const status = make('small', 'Not saved yet.'); status.setAttribute('role', 'status');
  const save = make('button', snapshot.source === 'demo' ? 'Save demo note' : 'Save note to iCloud'); save.type = 'submit'; save.className = 'hero-button primary-button'; save.setAttribute('form', 'note-edit-form'); form.id = 'note-edit-form';
  footer.append(status, save);
  // Comment NL: Vergelijk met de beginwaarden zodat teruggedraaide wijzigingen geen waarschuwing geven.
  const values = () => JSON.stringify([name.value, body.value, replace.checked, account?.value || '', trade?.value || '']);
  const baseline = values();
  const updateDirty = () => {
    dirty = values() !== baseline;
    save.disabled = Boolean(note) && !dirty;
    status.textContent = dirty ? 'Unsaved changes' : note ? 'No changes to save' : 'Not saved yet.';
  };
  form.oninput = updateDirty; form.onchange = updateDirty; updateDirty();
  form.onkeydown = event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault(); if (!pending && !save.disabled) form.requestSubmit();
    }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (pending || (note && !dirty)) return;
    if (!canSave()) { status.textContent = 'Saving is unavailable. Close this editor and refresh the workspace.'; return; }
    const input = { title: name.value, body: body.value, replaceFormatting: replace.checked, accountKey: account?.value || '', tradeKey: trade?.value || '' };
    pending = true; const controls = [...dialog.querySelectorAll('input, textarea, select, button')].map(c => [c, c.disabled]); controls.forEach(([c]) => c.disabled = true); status.textContent = 'Saving note…';
    try { await onSave(note?.key || null, input, identity); dirty = false; dialog.close(); }
    catch (error) { status.textContent = error.message; }
    finally { pending = false; controls.forEach(([c, disabled]) => c.disabled = disabled); }
  };
  const unload = e => { if (dirty || pending) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  dialog.addEventListener('close', () => { window.removeEventListener('beforeunload', unload); dialog.remove(); }, { once: true });
  dialog.append(header, form, footer); document.body.append(dialog); dialog.showModal(); name.focus();
}
