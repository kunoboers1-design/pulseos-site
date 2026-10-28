import { realizedR } from '../app/statistics.mjs';
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
  header.append(title, el('span', account.archived ? 'Archived' : 'Active', 'tag'), button('← Back to accounts', () => dialog.close()));
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
  const stats = calculateMacStatistics(snapshot, { accountKey: account.key });
  const r = v => Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) + 'R' : '—';
  function metricsCard(title, subtitle, entries) {
    const section = el('section', null, 'trade-detail-card account-overview-card'); section.append(el('h3', title), el('p', subtitle));
    const grid = el('div', null, 'account-overview-metrics');
    for (const [label, value] of entries) { const metric = el('div'); metric.append(el('small', label), el('strong', value)); grid.append(metric); }
    section.append(grid); return section;
  }
  if (stats.available && !account.archived) {
    const s = stats.summary;
    const pnl = stats.records.filter(t => Number.isFinite(t.profitLoss)).reduce((sum,t) => sum + t.profitLoss, 0);
    const performance = metricsCard('Performance', "A quick view of this account’s trading health.", [['Win rate', s.winRate == null ? '—' : (s.winRate * 100).toFixed(1) + '%'], ['Total R', r(s.totalR)], ['Total P/L', s.missingPL ? 'Unavailable' : money(pnl)], ['Trades', String(s.count)]]);
    const detail = el('div', null, 'account-overview-details');
    for (const [label,value] of [['Wins / losses / BE', s.wins + ' / ' + s.losses + ' / ' + s.breakEvens], ['Average R', r(s.averageR)], ['Average lot', number(s.averageLot)], ['Status', s.totalR > 0 ? 'Profitable' : s.totalR < 0 ? 'Loss' : 'Break-even']]) { const item = el('div'); item.append(el('small', label),el('strong',value)); detail.append(item); }
    performance.append(detail); panels[0].append(performance);
  } else panels[0].append(el('p', 'Performance is unavailable for archived accounts or incomplete data.'));
  const growth = metricsCard('Account growth', 'Current balance compared with the starting balance.', [['Current balance',money(account.balance)], ['Net growth', account.startBalance > 0 && Number.isFinite(account.balance) ? number((account.balance / account.startBalance - 1) * 100) + '%' : '—'], ['Starting balance',money(account.startBalance)], ['Balance change', Number.isFinite(account.balance) && Number.isFinite(account.startBalance) ? money(account.balance-account.startBalance) : '—']]);
  growth.append(el('p', 'Balance change includes deposits and withdrawals. Historical capital movements are not loaded, so this is not an equity chart.', 'trade-summary-caption'));
  panels[0].append(growth);
  if (stats.available && stats.curve.length) {
    const chart = el('section',null,'trade-detail-card account-overview-card'); chart.append(el('h3','Trading performance · R'),el('p','Cumulative closed-trade results · all time'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 900 220'); svg.setAttribute('role','img'); svg.setAttribute('aria-label','Cumulative trading results in R');
    const values = [0,...stats.curve.map(p=>p.value)], min=Math.min(...values), max=Math.max(...values), y=v=>195-(v-min)/(max-min||1)*175;
    const points=values.map((v,i)=>[20+i*860/(values.length-1),y(v)]);
    const line=document.createElementNS(svg.namespaceURI,'polyline'); line.setAttribute('points',points.map(p=>p.join(',')).join(' ')); line.setAttribute('fill','none'); line.setAttribute('stroke','var(--accent)');line.setAttribute('stroke-width','3');svg.append(line);
    points.forEach(([x,cy],i)=>{const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',cy);dot.setAttribute('r','4');dot.setAttribute('fill','var(--accent)');const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=(i ? new Date(stats.curve[i-1].date).toLocaleDateString('en-GB') : 'Start')+' · '+r(values[i]);dot.append(title);svg.append(dot);});
    chart.append(svg);panels[0].append(chart);
  }
  const filter = el('select'); filter.setAttribute('aria-label', 'Account trade status'); for (const [value,label] of [['all','All trades'],['open','Open'],['closed','Closed']]) { const o = el('option', label); o.value = value; filter.append(o); }
  const history = el('section', null, 'trade-detail-card account-history');
  history.append(el('h3', 'Trade history'));
  const count = el('p');
  const list = el('div', null, 'account-history-scroll');
  history.append(count, filter, list, button('Open trade journal', () => { dialog.close(); onJournal(); })); panels[1].append(history);
  function renderTrades() {
    const shown = trades.filter(t => filter.value === 'all' || t.status === filter.value);
    count.textContent = shown.length + ' trades · ' + shown.filter(t => t.status === 'open').length + ' open · ' + shown.filter(t => t.status === 'closed').length + ' closed';
    list.replaceChildren();
    const table = el('table', null, 'account-history-table'); table.setAttribute('aria-label', 'Account trade history');
    const head = el('thead'), headings = el('tr');
    for (const title of ['Trade', 'Opened · local time', 'Direction', 'Result', 'Lot size', 'R', 'P/L']) { const cell = el('th', title); cell.scope = 'col'; headings.append(cell); }
    head.append(headings); table.append(head); const tbody = el('tbody');
    for (const t of shown) {
      const row = el('tr');
      const instrument = el('td'), open = button(t.instrument || 'Unknown instrument', () => { dialog.close(); onTrade(t); });
      open.setAttribute('aria-label', 'View ' + (t.instrument || 'trade') + ' details');
      instrument.append(open, el('small', t.recordType === 'CD_OpenTrade' ? 'Journal trade' : 'Legacy trade'));
      const opened = el('td');
      const validDate = t.startedAt && Number.isFinite(Date.parse(t.startedAt));
      opened.append(el('span', validDate ? new Date(t.startedAt).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : 'Unknown'));
      if (validDate) opened.append(el('small',new Date(t.startedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})));
      const direction = ['long','short'].includes(t.direction) ? t.direction : 'unknown';
      const directionCell = el('td'); directionCell.append(el('span',direction === 'unknown' ? 'Unknown' : direction === 'long' ? 'Long' : 'Short', 'tag trade-direction trade-direction--' + direction));
      const resultCell = el('td'), result = t.status === 'open' ? 'Open' : ({win:'Win',loss:'Stop-loss',breakEven:'Break-even'})[t.result] || 'Unknown';
      resultCell.append(el('span',result,'tag history-result ' + (t.status === 'open' ? '' : t.result === 'win' ? 'positive' : t.result === 'loss' ? 'negative' : '')));
      const rr = realizedR(t), rCell = el('td',r(rr),rr < 0 ? 'negative' : rr > 0 ? 'positive' : '');
      const pl = t.status === 'closed' && Number.isFinite(t.profitLoss) ? t.profitLoss : null;
      const plCell = el('td',pl === null ? '—' : (pl > 0 ? '+' : '') + money(pl),pl < 0 ? 'negative' : pl > 0 ? 'positive' : '');
      row.append(instrument,opened,directionCell,resultCell,el('td',number(t.lotSize)),rCell,plCell); tbody.append(row);
    }
    table.append(tbody); list.append(table);
    if (!shown.length) list.append(el('p','No trades match this filter.'));
  }
  filter.onchange = renderTrades; renderTrades();
  const notes = noteRows(snapshot).filter(n => n.accountKey === account.key);
  const accountNotes = notes.filter(n => n.kind === 'note');
  const notesCard = el('section', null, 'trade-detail-card account-notes-card');
  notesCard.append(el('h3', 'Account notes'), el('p', accountNotes.length + ' notes linked to ' + (account.name || 'this account') + '.'));
  function noteGrid(items) {
    const grid = el('div', null, 'account-notes-grid');
    for (const note of items) {
      const tile = button('', () => { dialog.close(); onNote(note); }); tile.className = 'account-note-tile';
      const heading = el('span', null, 'account-note-heading');
      const icon = el('span', '≡', 'account-note-icon'); icon.setAttribute('aria-hidden','true');
      const text = el('span');
      const date = note.createdAt && Number.isFinite(Date.parse(note.createdAt)) ? new Date(note.createdAt).toLocaleString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Unknown date';
      text.append(el('strong', note.title), el('small', date));
      const arrow = el('span','›','account-note-arrow'); arrow.setAttribute('aria-hidden','true');
      heading.append(icon,text,arrow);
      const preview = el('span', note.body === null ? 'Text unavailable here. View in the native app.' : note.body || 'No text yet.', 'account-note-excerpt');
      const trade = note.trade;
      const link = el('span', trade ? (trade.instrument || 'Trade') + ' · Lot ' + number(trade.lotSize) : note.linkLabel || 'Account note', 'account-note-link');
      tile.append(heading,preview,link); grid.append(tile);
    }
    return grid;
  }
  notesCard.append(noteGrid(accountNotes));
  if (!accountNotes.length) notesCard.append(el('p','No account notes yet.'));
  panels[2].append(notesCard);
  const tradeNotes = notes.filter(n => n.kind !== 'note');
  if (tradeNotes.length) {
    const extra = el('details',null,'account-trade-notes'); extra.append(el('summary','Trade journal notes · ' + tradeNotes.length), noteGrid(tradeNotes)); panels[2].append(extra);
  }
  if (snapshot.notesStatus !== 'complete') panels[2].append(el('p', 'Some notes may be unavailable. Check Settings → Data checks.'));
  dialog.append(header,nav,body); document.body.append(dialog); select(0); dialog.addEventListener('close', () => dialog.remove(), {once:true}); dialog.showModal();
}
