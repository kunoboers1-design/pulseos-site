import { calculateMacStatistics } from './mac-statistics.mjs';
import { noteRows } from './notes-view.mjs';

// MARK: - Accountinspectie
// Comment NL: Eén ingelezen snapshot, bestaande statistiekregels en expliciete links naar trades en notities.
export function openAccountDetail(account, snapshot, { onTrade, onNote, onJournal }) {
  document.getElementById('account-detail-dialog')?.remove();
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (text, fn) => { const b = el('button', text, 'text-button'); b.type = 'button'; b.onclick = fn; return b; };
  const money = value => Number.isFinite(value) && account.currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(value) : 'Unavailable';
  const number = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) : '—';
  const dialog = el('dialog', null, 'trade-detail-dialog'); dialog.id = 'account-detail-dialog'; dialog.setAttribute('aria-labelledby', 'account-detail-title');
  const header = el('header', null, 'trade-detail-header'), title = el('h2', account.name || 'Account'); title.id = 'account-detail-title';
  header.append(title, el('span', account.archived ? 'Archived' : 'Active', 'tag'), button('Done', () => dialog.close()));
  const nav = el('div', null, 'trade-detail-tabs'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Account sections');
  const body = el('div', null, 'trade-detail-body'), panels = [];
  ['Overview', 'Trades', 'Notes'].forEach((name, i) => {
    const panel = el('section'); panel.id = `account-panel-${i}`; panel.setAttribute('role', 'tabpanel');
    const tab = button(name, () => select(i)); tab.id = `account-section-${i}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', tab.id);
    tab.onkeydown = event => { if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : 2)) % 3; select(next); nav.children[next].focus(); };
    panels.push(panel); nav.append(tab); body.append(panel);
  });
  function select(index) { panels.forEach((panel, i) => { panel.hidden = i !== index; nav.children[i].setAttribute('aria-selected', String(i === index)); nav.children[i].tabIndex = i === index ? 0 : -1; }); }
  function card(title, rows) { const section = el('section', null, 'trade-detail-card'); section.append(el('h3', title)); const list = el('dl'); for (const [label, value] of rows) { const row = el('div'); row.append(el('dt', label), el('dd', value)); list.append(row); } section.append(list); return section; }
  const trades = snapshot.trades.filter(t => t.accountKey === account.key).sort((a,b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0));
  panels[0].append(card('Balance', [['Current balance', money(account.balance)], ['Starting balance', money(account.startBalance)], ['Net growth', account.startBalance > 0 && Number.isFinite(account.balance) ? `${number((account.balance / account.startBalance - 1) * 100)}%` : '—'], ['Open trades', String(trades.filter(t => t.status === 'open').length)], ['Closed trades', String(trades.filter(t => t.status === 'closed').length)]]));
  const stats = calculateMacStatistics(snapshot, { accountKey: account.key });
  if (stats.available && !account.archived) { const s = stats.summary; panels[0].append(card('Performance · all time', [['Eligible closed trades', String(s.count)], ['Win rate', s.winRate == null ? '—' : `${number(s.winRate * 100)}%`], ['Total R', `${number(s.totalR)}R`], ['Average R', `${number(s.averageR)}R`], ['Wins / losses / break-even', `${s.wins} / ${s.losses} / ${s.breakEvens}`], ['Average lot', number(s.averageLot)]])); }
  else panels[0].append(el('p', 'Performance is unavailable for archived accounts or incomplete data.'));
  panels[0].append(el('p', 'Net growth includes all balance changes; it is not a trading-only return. Performance uses the same eligibility rules as Stats.', 'trade-detail-guide'));
  const filter = el('select'); filter.setAttribute('aria-label', 'Account trade status'); for (const [value,label] of [['all','All trades'],['open','Open'],['closed','Closed']]) { const o = el('option', label); o.value = value; filter.append(o); }
  const list = el('div', null, 'account-detail-list'); panels[1].append(filter,list,button('Open trade journal', () => { dialog.close(); onJournal(); }));
  function renderTrades() { const shown = trades.filter(t => filter.value === 'all' || t.status === filter.value); list.replaceChildren(); for (const t of shown) { const row = button('', () => { dialog.close(); onTrade(t); }); row.append(el('strong', t.instrument || 'Unknown instrument'), el('span', `${t.status || 'Unknown'} · ${number(t.lotSize)} lots`), el('small', t.startedAt ? new Date(t.startedAt).toLocaleString('en-GB') : 'Unknown date')); list.append(row); } if (!shown.length) list.append(el('p', 'No trades match this filter.')); }
  filter.onchange = renderTrades; renderTrades();
  const notes = noteRows(snapshot).filter(n => n.accountKey === account.key);
  const notesList = el('div', null, 'account-detail-list');
  for (const note of notes) { const row = button('', () => { dialog.close(); onNote(note); }); row.append(el('strong', note.title), el('small', note.label)); notesList.append(row); }
  panels[2].append(notesList); if (!notes.length) panels[2].append(el('p', 'No notes linked to this account.'));
  if (snapshot.notesStatus !== 'complete') panels[2].append(el('p', 'Some notes may be unavailable. Check Settings → Data checks.'));
  dialog.append(header,nav,body); document.body.append(dialog); select(0); dialog.addEventListener('close', () => dialog.remove(), {once:true}); dialog.showModal();
}
