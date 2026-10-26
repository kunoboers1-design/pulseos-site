// MARK: - Notities en betrouwbare tradekoppelingen
// Comment NL: Koppel alleen één unieke trade binnen dezelfde zone; niets afleiden uit titels.
export function noteRows(snapshot) {
  if (!snapshot) return [];
  const sameZone = (a, b) => a && b && a.zoneName === b.zoneName && a.ownerRecordName === b.ownerRecordName;
  const notes = (snapshot.notes || []).map(n => {
    const matches = n.tradeId ? snapshot.trades.filter(t => t.id === n.tradeId && (snapshot.source === 'demo' || sameZone(n.zone, t.zone))) : [];
    const trade = matches.length === 1 ? matches[0] : null;
    return { ...n, kind: 'note', label: 'Note', title: n.title || 'Untitled note', trade,
      accountKey: n.accountKey || trade?.accountKey || null,
      linkLabel: trade ? `Linked to ${trade.instrument || 'trade'}` : n.tradeId ? 'Trade link unavailable or ambiguous' : 'Standalone note' };
  });
  for (const t of snapshot.trades) for (const [kind, label, key] of [['pre', 'Before trade', 'preTradeNotes'], ['post', 'After trade', 'postTradeNotes']]) {
    if (t[key] || t[key] === null && t.recordType === 'CD_OpenTrade') notes.push({ key: `${t.key}:${kind}`, kind, label, title: `${t.instrument || 'Trade'} · ${label}`, body: t[key], accountKey: t.accountKey, createdAt: t.startedAt, trade: t, linkLabel: `Linked to ${t.instrument || 'trade'}` });
  }
  return notes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.key.localeCompare(b.key));
}

// MARK: - Lijst en geselecteerde notitie zoals op de Mac
export function mountNotesView({ list, detail, onTrade, onEdit, canEdit }) {
  let selected = null;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const date = (value, short = false) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(value)) : 'Unknown date';
  const amount = (value, currency) => Number.isFinite(value) && currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) : 'Not available';
  const icon = linked => { const span = el('span', linked ? '↗' : '≡', 'note-symbol'); span.setAttribute('aria-hidden', 'true'); return span; };
  function renderDetail(n, snapshot) {
    detail.replaceChildren();
    if (!n) { detail.append(el('p', 'Choose a note from the list.', 'workspace-empty')); return; }
    const account = snapshot.accounts.find(a => a.key === n.accountKey), trade = n.trade;
    const heading = el('header', null, 'note-detail-heading'), title = el('div');
    const h = el('h2', n.title); h.tabIndex = -1;
    title.append(h, el('p', n.linkLabel)); heading.append(icon(Boolean(trade)), title, el('time', date(n.createdAt))); detail.append(heading);
    if (n.kind === 'note') {
      if (canEdit() && n.body !== null && n.title !== null && !n.blockedEditFields?.length) {
        const edit = el('button', 'Edit note', 'text-button'); edit.type = 'button'; edit.onclick = () => onEdit(n); heading.append(edit);
      } else detail.append(el('p', canEdit() ? 'Edit this note in the native app because its text uses unsupported storage.' : 'Note editing is not enabled here. You can try it in the demo.', 'note-format-hint'));
    }
    const overview = el('div', null, 'note-overview-grid');
    const link = el('section', null, 'fx-card note-detail-card'); link.append(el('h3', 'Trade link'));
    if (trade) {
      const preview = el('div', null, 'note-trade-preview'); preview.append(el('strong', trade.instrument || 'Unknown instrument'), el('p', `${trade.status || 'Unknown'} · ${trade.lotSize ?? '—'} lots`), el('small', date(trade.startedAt)));
      const view = el('button', 'View trade', 'text-link'); view.type = 'button'; view.onclick = () => onTrade(trade);
      preview.append(view); link.append(preview);
    } else link.append(el('p', n.linkLabel), el('small', n.tradeId ? 'Refresh or check the link in the native app.' : 'Link or unlink standalone notes in the native app.'));
    const summary = el('section', null, 'fx-card note-detail-card'); summary.append(el('h3', 'Overview'));
    const dl = el('dl');
    for (const [label, value] of [['Account', account?.name || 'No linked account'], ['Pair', trade?.instrument || '—'], ['Lot', trade?.lotSize ?? '—'], ['Outcome', trade?.result || '—'], ['Amount', trade?.status === 'open' ? 'Not realized' : trade ? amount(trade.profitLoss, trade.currency) : '—'], ['Date · UTC', date(n.createdAt)]]) {
      const row = el('div'); row.append(el('dt', label), el('dd', String(value))); dl.append(row);
    }
    summary.append(dl); overview.append(link, summary); detail.append(overview);
    const note = el('section', null, 'fx-card note-detail-card note-document'), bar = el('div', null, 'note-document-header');
    const words = typeof n.body === 'string' ? n.body.trim().split(/\s+/u).filter(Boolean).length : null;
    bar.append(el('h3', 'Note'), el('small', words === null ? 'Text unavailable' : `${words} ${words === 1 ? 'word' : 'words'}`));
    const body = el('div', n.body === null ? 'This note uses an attachment or unsupported storage. Open the native app to read it.' : n.body || 'No plain-text content. Photos or formatted attachments may be available in the native app.', 'note-body note-document-content');
    note.append(bar, el('p', 'Plain-text preview · formatting and attachments remain in the native app.', 'note-format-hint'), body);
    if (n.kind !== 'note' && trade?.status === 'open') {
      const edit = el('button', 'Open trade editor', 'text-button'); edit.type = 'button'; edit.onclick = () => onTrade(trade); note.append(edit);
    }
    detail.append(note);
  }
  return {
    select(key) { selected = key; },
    render(rows, snapshot) {
      if (!rows.some(n => n.key === selected)) selected = rows[0]?.key || null;
      list.replaceChildren();
      for (const n of rows) {
        const row = el('button', null, 'note-card note-list-row'); row.type = 'button'; row.setAttribute('aria-pressed', String(n.key === selected)); row.setAttribute('aria-controls', detail.id);
        const text = el('span', null, 'note-row-text'); text.append(el('strong', n.title), el('span', n.body || (n.body === null ? 'Attachment or unsupported text' : n.label)));
        row.append(icon(Boolean(n.trade)), text, el('time', date(n.createdAt, true)));
        row.onclick = () => { selected = n.key; this.render(rows, snapshot); if (matchMedia('(max-width: 760px)').matches) { detail.scrollIntoView({ behavior: 'auto', block: 'start' }); detail.querySelector('h2')?.focus({ preventScroll: true }); } else list.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }); };
        list.append(row);
      }
      if (!rows.length) list.append(el('p', 'No notes match these filters.', 'workspace-empty'));
      renderDetail(rows.find(n => n.key === selected), snapshot);
    },
  };
}
