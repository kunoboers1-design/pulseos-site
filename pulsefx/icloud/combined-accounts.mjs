import { realizedR } from '../app/statistics.mjs';

// MARK: - Native gecombineerde R-reeks
// Comment NL: Eerst alle trades cumuleren; daarna de laatste tien punten tonen.
export function combinedAccounts(snapshot) {
  const active = snapshot.accounts.filter(a => a.archived === false);
  const keys = new Set(active.map(a => a.key));
  const trades = snapshot.trades.filter(t => t.status === 'closed' && (keys.has(t.accountKey) || (t.recordType === 'CD_OpenTrade' && t.accountReference == null)))
    .sort((a,b) => Date.parse(a.closedAt || a.startedAt) - Date.parse(b.closedAt || b.startedAt));
  let total = 0, unknown = 0;
  const points = trades.map(t => { const r = realizedR(t); if (r === null) unknown++; total += r ?? 0; return { value: total, date: t.closedAt || t.startedAt, instrument: t.instrument }; });
  return { total, unknown, accounts: active.length, count: trades.length, points: points.slice(-10) };
}

// MARK: - Combined-kaart
export function renderCombinedAccounts(parent, snapshot) {
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  parent.replaceChildren();
  const card = el('section', null, 'fx-card accounts-combined'); card.append(el('h3','Combined'), el('p','Performance across all active accounts'));
  parent.append(card);
  if (snapshot.collectionStatus !== 'complete') { card.append(el('p','Performance is unavailable while the read is incomplete.')); return; }
  const model = combinedAccounts(snapshot), fmt = v => (v >= 0 ? '+' : '') + v.toFixed(1) + 'R';
  const layout = el('div',null,'combined-layout'), stats = el('div',null,'combined-totals');
  stats.append(el('small','TOTAL RESULT'),el('strong',fmt(model.total),model.total < 0 ? 'negative' : 'positive'),el('p',model.accounts + ' accounts · ' + model.count + ' closed trades'));
  const chart = el('div',null,'combined-chart'); chart.append(el('small','Last ' + model.points.length + ' trades · ' + (model.total > 0 ? 'Profitable' : model.total < 0 ? 'Loss' : 'Break-even')));
  if (!model.points.length) chart.append(el('p','No closed trades yet.'));
  else {
    const svgEl = (tag, attrs) => { const n = document.createElementNS('http://www.w3.org/2000/svg',tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); return n; };
    const svg = svgEl('svg',{viewBox:'0 0 640 180',role:'img','aria-label':'Cumulative R across the latest ten closed trades'});
    const min = Math.min(0,...model.points.map(p=>p.value)), max = Math.max(0,...model.points.map(p=>p.value));
    const y = v => 164 - (v-min)/(max-min || 1)*148;
    const points = model.points.map((p,i)=>[16+i*608/Math.max(1,model.points.length-1),y(p.value)]);
    svg.append(svgEl('line',{x1:16,x2:624,y1:y(0),y2:y(0),stroke:'var(--muted)','stroke-dasharray':'4 4'}));
    const color = model.total < 0 ? 'var(--danger)' : 'var(--success)';
    svg.append(svgEl('polygon',{points:[[points[0][0],y(0)],...points,[points.at(-1)[0],y(0)]].map(p=>p.join(',')).join(' '),fill:color,'fill-opacity':'.14'}));
    svg.append(svgEl('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':3}));
    points.forEach(([x,cy],i)=>{const dot=svgEl('circle',{cx:x,cy,r:4,fill:color,tabindex:0}); const title=svgEl('title',{}); title.textContent=model.points[i].instrument+' · '+new Date(model.points[i].date).toLocaleDateString('en-GB')+' · '+fmt(model.points[i].value); dot.append(title); svg.append(dot);});
    chart.append(svg,el('small','● Profit   ·   Loss below zero'));
  }
  layout.append(stats,chart);card.append(layout);
  if (model.unknown) card.append(el('small',model.unknown+' trades have no calculable R and contribute 0R, matching the native chart.'));
}
