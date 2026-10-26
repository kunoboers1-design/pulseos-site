import { calculateMacStatistics, metricValue, sequence, dayKey, hasNotes, incompleteJournal, labels } from './mac-statistics.mjs';
import { statisticsDemo } from './statistics-demo.mjs';

// MARK: - Veilige DOM-presentatie
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, suffix = '') => v === Infinity ? '∞' : Number.isFinite(v) ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}` : '—';
const button = (label, action) => { const b = el('button', label, 'text-button'); b.type = 'button'; b.onclick = action; return b; };
const field = (parent, label, options, initial, action, id) => {
  const wrap = el('label', label, 'cloud-field'), select = el('select'); select.setAttribute('aria-label', label); if (id) select.id = id;
  for (const item of options) { const [text, value] = Array.isArray(item) ? item : [item,item], o = el('option', text); o.value = value; select.append(o); }
  select.value = initial; select.onchange = () => action(select.value); wrap.append(select); parent.append(wrap); return select;
};
const svgEl = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); return e; };
function lineChart(title, series, suffix = '', scatter = false, temporal = false) {
  const box = el('section', null, 'fx-card mac-chart'); box.append(el('h3', title)); const tooltip=el('output',null,'mac-chart-tooltip');tooltip.hidden=true;box.append(tooltip);if(title==='Equity curve')box.append(el('p','Hover or focus a point to inspect','mac-chart-subtitle'));
  const points = series.flatMap(s => s.points).filter(p => Number.isFinite(p.value));
  if (!points.length) { box.append(el('p', 'No measurable results in this selection.')); return box; }
  const svg = svgEl('svg', { viewBox: '0 0 800 260', role: 'img', 'aria-label': title });
  const lo = Math.min(0, ...points.map(p => p.value)), hi = Math.max(0, ...points.map(p => p.value)), span = hi-lo || 1;
  const y = v => 220-(v-lo)/span*180;
  for (const v of [lo, (lo+hi)/2, hi]) { const t = svgEl('text',{x:5,y:y(v)-5}); t.textContent=fmt(v,suffix); svg.append(t,svgEl('line',{x1:65,x2:780,y1:y(v),y2:y(v),class:'stats-zero'})); }
  if (temporal) series=series.map(s=>({...s,points:s.points.map(p=>({...p,x:p.date?Date.parse(p.date):undefined}))}));
  const xs=series.flatMap(s=>s.points).map(p=>p.x).filter(Number.isFinite), xmin=temporal?Math.min(...xs):Math.min(0,...xs), xmax=Math.max(1,...xs);
  series.forEach((s,i) => {
    const coords = s.points.filter(p => Number.isFinite(p.value)).map((p,j,a) => ({ ...p,x:65+(Number.isFinite(p.x)?(p.x-xmin)/(xmax-xmin||1):j/Math.max(1,a.length-1))*715,y:y(p.value) }));
    if(title==='Equity curve' && coords.length){svg.append(svgEl('polygon',{points:`${coords[0].x},${y(0)} `+coords.map(p=>`${p.x},${p.y}`).join(' ')+` ${coords.at(-1).x},${y(0)}`,class:'mac-equity-area'}));}
    if (!scatter) svg.append(svgEl('polyline',{points:coords.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'currentColor','stroke-width':2.5,class:`mac-series series-${i%4}`}));
    for (const p of coords) { const dot=svgEl('circle',{cx:p.x,cy:p.y,r:scatter?4:3,class:`mac-series series-${i%4}`,tabindex:0}); const tip=svgEl('title',{}); tip.textContent=`${s.label} · ${p.date ? new Date(p.date).toLocaleString('en-GB') : p.label || ''}: ${fmt(p.value,suffix)}`; dot.append(tip);dot.setAttribute('aria-label',tip.textContent);const inspect=()=>{tooltip.hidden=false;tooltip.textContent=tip.textContent;};dot.addEventListener('pointerenter',inspect);dot.addEventListener('focus',inspect);dot.addEventListener('pointerleave',()=>tooltip.hidden=true);dot.addEventListener('blur',()=>tooltip.hidden=true);svg.append(dot); }
  });
  if (temporal && xs.length) { for (const [x,timestamp] of [[65,xmin],[780,xmax]]) { const label=svgEl('text',{x,y:248,'text-anchor':x===65?'start':'end'}); label.textContent=new Date(timestamp).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); svg.append(label); } }
  box.append(svg);
  const legend=el('div',null,'stats-chart-labels'); series.forEach((s,i)=>legend.append(el('span',`${s.label}: ${fmt(s.points.at(-1)?.value,suffix)}`,`mac-series series-${i%4}`))); box.append(legend); return box;
}

// MARK: - Mac Stats-controller
// Comment NL: Filters en snapshots bestaan alleen in geheugen; deze controller doet geen CloudKit-schrijfacties.
export function mountMacStats(root) {
  let source=null, stale=false, demo=new URLSearchParams(location.search).get('statistics')==='demo';
  let opts={period:'all',accountKey:'all',instrument:'all',outcome:'all',metric:'r',slotHours:3}, result=null;
  let equity='r', calendar=dayKey(new Date()).slice(0,7), weekStart='Monday', comparisonMode='percent', selectedAccounts=[], notesFilter='all', sort='newest', display='table';
  const heading=el('div',null,'mac-header-title');
  const headingText=el('div'), screenTitle=el('h2','Overview'), subtitle=el('p','Headline performance and equity');
  headingText.append(screenTitle,subtitle); heading.append(headingText);
  const badge=el('span','Friends access','tag');
  const status=el('p'); status.setAttribute('role','status');
  const controls=el('div',null,'cloud-controls mac-main-filters'), output=el('div'), periods=el('div',null,'mac-periods');
  const header=el('header',null,'mac-stats-header');heading.append(periods);header.append(heading,controls);
  const dataControls=el('details',null,'mac-data-controls');dataControls.append(el('summary','Data source & calculation details'),badge,status);
  const actions=el('div',null,'stats-actions');actions.append(button('Explore statistics demo',()=>{demo=true;populate();run();}),button('Use iCloud data',()=>{demo=false;populate();run();}));dataControls.append(actions);
  root.append(header,dataControls,output);
  const sectionNames={overview:['Overview','Headline performance and equity'],performance:['Performance','Your edge, consistency and execution'],timing:['Timing','Find your strongest trading windows'],journal:['Journal','Understand the decisions behind your results'],trades:['Trades','Review every closed trade']};
  root.addEventListener('stats-section-change',event=>{const copy=sectionNames[event.detail]||sectionNames.overview;screenTitle.textContent=copy[0];subtitle.textContent=copy[1];});
  const current=()=>demo?statisticsDemo():source;
  const unit=()=>opts.metric==='percent'?'%':'R';
  function populate() {
    controls.replaceChildren(); periods.replaceChildren(); const snapshot=current();
    const periodSelect=field(controls,'Period',[['All time','all'],['Past week','week'],['Past month','month'],['Year to date','ytd'],['Custom','custom']],opts.period,v=>{opts.period=v;populate();run();},'stats-period');
    periodSelect.parentElement.classList.add('mac-period-select');
    for(const [label,value]of [['Week','week'],['Month','month'],['YTD','ytd'],['All time','all'],['Custom','custom']]){const control=button(label,()=>{opts.period=value;populate();run();});control.setAttribute('aria-pressed',String(opts.period===value));periods.append(control);}
    if(opts.period==='custom') for(const [key,label] of [['from','From'],['through','Through']]) { const wrap=el('label',label,'cloud-field'), input=el('input');input.type='date';input.value=opts[key]||dayKey(new Date());opts[key]=input.value;input.onchange=()=>{opts[key]=input.value;run();};wrap.append(input);controls.append(wrap); }
    field(controls,'Account',[['All active accounts','all'],...(snapshot?.accounts||[]).filter(a=>a.archived===false).map(a=>[a.name||'Unnamed',a.key])],opts.accountKey,v=>{opts.accountKey=v;run();},'stats-account');
    field(controls,'Instrument',[['All instruments','all'],...[...new Set((snapshot?.trades||[]).map(t=>t.instrument).filter(Boolean))].sort()],opts.instrument,v=>{opts.instrument=v;run();},'stats-instrument');
    field(controls,'Outcome',[['All outcomes','all'],['Wins','win'],['Losses','loss'],['Break-even','breakEven']],opts.outcome,v=>{opts.outcome=v;run();},'stats-outcome');
    field(controls,'Result metric',[['R multiple','r'],['Percentage','percent']],opts.metric,v=>{opts.metric=v;run();},'stats-metric');
    controls.append(button('Export PDF',()=>window.print()));
    actions.querySelectorAll('[data-filter-action]').forEach(e=>e.remove());
    const recalculate=button('Calculate statistics',run);recalculate.dataset.filterAction='true';
    const reset=button('Reset filters',()=>{opts={period:'all',accountKey:'all',instrument:'all',outcome:'all',metric:'r',slotHours:3};populate();run();});reset.dataset.filterAction='true';actions.append(recalculate,reset);
  }
  function cards(parent, entries) { const grid=el('div',null,'cloud-grid stats-metrics'); for(const [label,value,note] of entries){const c=el('article',null,'fx-card');const symbol=svgEl('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.7,'aria-hidden':'true'});const paths={'Closed trades':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M8 12l3 3 5-6','Win rate':'M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M12 9v6m-3-3h6','Net result':'M4 3v17h17M7 15l4-6 4 3 6-7','Profit factor':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M8 12h8 M12 7v1m0 8v1'};if(paths[label]){symbol.append(svgEl('path',{d:paths[label]}));const icon=el('span',null,'mac-metric-icon');icon.append(symbol);c.append(icon);c.classList.add('mac-headline');}c.append(el('span',label),el('strong',value));if(note)c.append(el('small',note));grid.append(c);}parent.append(grid); }
  function tradeTable(rows, parent) {
    const wrap=el('div',null,'table-scroll'); wrap.tabIndex=0;
    const table=el('table'),head=el('tr'); for(const h of ['Opened · local time','Instrument','Account','Outcome','Result','P&L','Lots','Notes'])head.append(el('th',h));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
    for(const t of rows){const tr=el('tr');for(const v of [new Date(t.startedAt).toLocaleString('en-GB'),t.instrument,result.accounts.get(t.accountKey)?.name,t.result,fmt(result.value(t),unit()),`${fmt(t.profitLoss)} ${t.currency||''}`,fmt(t.lotSize),[t.preTradeNotes,t.postTradeNotes].filter(Boolean).join('\n')||'—']){const td=el('td');const text=el('span',v);td.append(text);tr.append(td);}body.append(tr);}table.append(body);wrap.append(table);parent.append(wrap);
    if(!rows.length)parent.append(el('p','No trades match this selection.'));
  }
  function drill(label, rows) {
    const dialog=el('dialog',null,'mac-drilldown'),header=el('header',null,'drilldown-header'),heading=el('div');
    const title=el('h2',label);title.id='drilldown-title';dialog.setAttribute('aria-labelledby',title.id);
    heading.append(title,el('p',`${rows.length} trades · Scroll horizontally for all fields`));header.append(heading,button('Close',()=>dialog.close()));dialog.append(header);
    tradeTable(rows,dialog);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
  }
  function breakdown(parent,title,rows,{pf='metricProfitFactor',initial='total',metricSelect=true}={}) {
    const box=el('section',null,'fx-card mac-breakdown');box.append(el('h3',title));const toolbar=el('div',null,'cloud-controls'),body=el('div');box.append(toolbar,body);parent.append(box);
    const draw=key=>{body.replaceChildren();const sorted=[...rows].sort((a,b)=>(b[key]||0)-(a[key]||0));const max=Math.max(1,...sorted.map(r=>Math.abs(r[key]||0)).filter(Number.isFinite));
      for(const row of sorted){const b=button('',()=>drill(`${title} · ${row.label}`,row.records));b.className='mac-bar-row';b.append(el('span',row.label),el('strong',fmt(row[key],key==='winRate'?'':key==='count'||key===pf?'':unit())));if(key==='winRate')b.lastChild.textContent=fmt(row.winRate*100,'%');const bar=el('span',null,'mac-bar');bar.style.width=`${Number.isFinite(row[key])?Math.abs(row[key])/max*100:100}%`;bar.classList.toggle('negative',row[key]<0);b.append(bar,el('small',`${row.count} trades · ${fmt(row.winRate*100,'%')} wins · avg ${fmt(row.average,unit())} · PF ${fmt(row[pf])}`));body.append(b);}
      if(!rows.length)body.append(el('p','No matching journal values or trades.'));};
    if(metricSelect)field(toolbar,'Rank by',[['Net result','total'],['Average result','average'],['Win rate','winRate'],['Profit factor',pf],['Trade count','count']],initial,draw);draw(initial);return box;
  }
  function run() {
    document.querySelectorAll('.mac-drilldown').forEach(d=>d.remove());
    output.replaceChildren(); result=null;
    if(!current()||stale&&!demo){status.textContent='Read a complete, fresh iCloud zone first. Previous statistics have been cleared.';return;}
    try{result=calculateMacStatistics(current(),opts);}catch(error){status.textContent=error.message;return;}
    if(!result.available){status.textContent='A complete iCloud read is required.';return;}
    badge.textContent=demo||source?.source==='demo'?'Demo mode · fictional data':'Friends access';
    status.textContent=`${result.summary.count} closed trades · ${Intl.DateTimeFormat().resolvedOptions().timeZone} · opening dates · ${result.summary.measured} measurable results. ${result.summary.missingR} missing R counted as zero. ${Object.values(result.excluded).reduce((a,b)=>a+b,0)} records excluded before filters. No Premium purchase verified.`;
    const sections={};for(const key of ['overview','performance','timing','journal','trades']){const section=el('section',null,'mac-stats-section');section.dataset.statsSection=key;sections[key]=section;output.append(section);}
    const s=result.summary,u=unit();
    cards(sections.overview,[['Closed trades',s.count,`${s.count} closed trades`],['Win rate',fmt(s.winRate*100,'%')],['Net result',fmt(s.total,u)],['Profit factor',fmt(s.profitFactor),'Based on realized R']]);
    const positiveMonths=result.byMonth.filter(m=>m.total>0),positiveSum=positiveMonths.reduce((n,m)=>n+m.total,0),bestMonth=[...positiveMonths].sort((a,b)=>b.total-a.total)[0];
    if(bestMonth){const insight=button('',()=>drill(bestMonth.label,bestMonth.records));insight.className='mac-insight';insight.append(el('span','Performance insight'),el('strong',`${new Date(`${bestMonth.key}-01T12:00:00`).toLocaleDateString('en-US',{month:'long'})} delivered ${fmt(bestMonth.total/positiveSum*100,'%')} of your positive monthly result, across ${bestMonth.count} trades.`),el('span','↗','mac-insight-arrow'));sections.overview.append(insight);}
    const details=el('section',null,'fx-card mac-overview-details');details.append(el('h3','Details'));
    for(const [label,number]of [['Wins',s.wins],['Losses',s.losses],['Break even',s.breakEvens],['Average per trade',fmt(s.average,u)],['Average lot',fmt(s.averageLot)],['Best trade',fmt(s.best,u)],['Worst trade',fmt(s.worst,u)],['Longest win streak',result.streaks.wins],['Longest loss streak',result.streaks.losses]]) {const row=el('div',null,'stats-chart-labels');const numberLabel=el('strong',number);numberLabel.className=label==='Losses'||String(number).startsWith('-')?'mac-negative':label==='Wins'?'mac-positive':'mac-neutral';row.append(el('span',label),numberLabel);details.append(row);}
    for(const b of s.plByCurrency){const row=el('div',null,'stats-chart-labels');row.append(el('span',`Total P/L · ${b.currency}`),el('strong',fmt(b.value),b.value<0?'mac-negative':'mac-positive'));details.append(row);}
    const ec=el('div',null,'cloud-controls');field(ec,'Equity metric',[['R multiple','r'],['P&L','pl'],['Percentage','percent']],equity,v=>{equity=v;run();});ec.classList.add('mac-equity-controls');
    const currencies=[...new Set(result.records.map(t=>t.currency))];
    if(equity==='pl'&&currencies.length>1)sections.overview.append(ec,el('p','Select one currency/account to view a P&L curve. Different currencies cannot be added.','cloud-notice'),details);
    else{const curve=sequence(result.records,t=>metricValue(t,result.accounts,equity)),suffix=equity==='r'?'R':equity==='percent'?'%':` ${currencies[0]||''}`;const timeline=[...curve];const last=timeline.at(-1);if(last){const today=new Date();today.setHours(0,0,0,0);const until=opts.period==='custom'?new Date(`${[opts.from,opts.through].sort().at(-1)}T00:00:00`):today;const tail=new Date(Math.min(today.getTime(),until.getTime()));if(tail.getTime()>Date.parse(last.date))timeline.push({...last,date:tail.toISOString()});}
      const row=el('div',null,'mac-overview-row');const equityCard=lineChart('Equity curve',[{label:'Result',points:timeline}],suffix,false,true);equityCard.insertBefore(ec,equityCard.querySelector('svg'));row.append(equityCard,details);sections.overview.append(row);const drawdown=lineChart('Drawdown',[{label:'Below peak',points:curve.map(p=>({...p,value:p.drawdown}))}],suffix);drawdown.classList.add('mac-drawdown-detail');sections.overview.append(drawdown);}
    renderMonthlyPerformance(sections.overview);renderOutcomeDonut(sections.overview);comparisons(sections.overview);
    cards(sections.performance,[['Edge score',fmt(result.edgeScore,' / 100'),'Score always uses R'],['Positive weeks',fmt(result.consistency*100,'%')],['Recovery factor',fmt(result.recoveryR),'R gain ÷ maximum R drawdown']]);
    const radar=el('section',null,'fx-card mac-chart');radar.append(el('h3','Performance profile'));const svg=svgEl('svg',{viewBox:'0 0 440 300',role:'img','aria-label':'Performance profile radar'}),names=['Win rate','Profit factor','Expectancy','Consistency','Drawdown control','Recovery'];
    const xy=(i,r)=>[220+Math.sin(i*Math.PI/3)*r,145-Math.cos(i*Math.PI/3)*r];
    for(const r of [30,60,90])svg.append(svgEl('polygon',{points:names.map((_,i)=>xy(i,r).join(',')).join(' '),class:'stats-zero',fill:'none'}));
    svg.append(svgEl('polygon',{points:result.profile.map((v,i)=>xy(i,v*90).join(',')).join(' '),class:'mac-radar'}));names.forEach((n,i)=>{const [x,y]=xy(i,125),t=svgEl('text',{x,y,'text-anchor':'middle'});t.textContent=n;svg.append(t);});radar.append(svg);sections.performance.append(radar);
    breakdown(sections.performance,'Result distribution',result.distribution,{initial:'count',metricSelect:false});
    sections.performance.append(lineChart('Target vs final R',[{label:'Target',points:result.target.map(t=>({value:t.target,x:t.target,date:t.trade.startedAt}))},{label:'Final',points:result.target.map(t=>({value:t.final,x:t.target,date:t.trade.startedAt}))}],'R',true));
    breakdown(sections.performance,'Target execution',['Reached or exceeded','Profitable, below target','Break even','Finished negative'].map((label,index)=>({label,...result.summarize(result.target.filter(t=>(t.trade.result==='win'&&t.final>=t.target?0:t.final>0?1:Math.abs(t.final)<.0001?2:3)===index).map(t=>t.trade))})),{initial:'count'});
    breakdown(sections.performance,'Pair ranking',result.byInstrument,{pf:'profitFactor'});breakdown(sections.performance,'Account ranking',result.byAccount,{pf:'profitFactor'});renderHeatmap(sections.overview);breakdown(sections.overview,'Setup × session',result.crossTab);renderMonthComparison(sections.overview);
    const timingControls=el('div',null,'cloud-controls');field(timingControls,'Time slot hours',[1,2,3,4,6,12].map(n=>[String(n),String(n)]),String(opts.slotHours),v=>{opts.slotHours=Number(v);run();});field(timingControls,'Week starts on',['Monday','Sunday'],weekStart,v=>{weekStart=v;run();});sections.timing.append(timingControls);
    renderCalendar(sections.timing);for(const [title,rows] of [['Weekdays',result.byWeekday],['Sessions',result.bySession],['Time slots',result.byHour],['Trade order',result.byOrder]])breakdown(sections.timing,title,rows,{initial:'average'});
    const modern=result.records.filter(t=>t.recordType==='CD_OpenTrade');cards(sections.journal,[['Journal health · setups',`${modern.filter(t=>labels(t,'setup').length).length} / ${modern.length}`],['Journal health · mistakes',`${modern.filter(t=>labels(t,'mistake').length).length} / ${modern.length}`],['Incomplete journal',modern.filter(incompleteJournal).length]]);sections.journal.append(el('p',`${modern.length} modern trades. Legacy trades do not contain journal classifications. Missing journal fields are not inferred. Tags can overlap; category counts are not additive.`,'cloud-notice'));
    for(const [title,key]of [['Setups','setups'],['Mistakes','mistakes'],['Psychology','psychology'],['Confluences','confluences'],['Trade management','management']])breakdown(sections.journal,title,result.journal[key],{initial:'average'});
    setupCombination(sections.journal);renderBoxPlot(sections.journal);const types=breakdown(sections.journal,'Trade type details',result.journal.types,{initial:'average'});for(const row of result.journal.types){types.append(el('p',`${row.label}: min ${fmt(row.quantiles[0],u)} · Q1 ${fmt(row.quantiles[1],u)} · median ${fmt(row.quantiles[2],u)} · Q3 ${fmt(row.quantiles[3],u)} · max ${fmt(row.quantiles[4],u)}`));}
    renderTrades(sections.trades);
  }

  // MARK: - Maandgrafiek
  // Comment NL: Elke staaf opent dezelfde onderliggende records als de maandfilters.
  function renderMonthlyPerformance(parent) {
    const box=el('section',null,'fx-card mac-chart mac-monthly-chart');
    box.append(el('h3','Monthly performance'),el('p','Net result and trade volume','mac-chart-subtitle'));
    const rows=result.byMonth;
    if(!rows.length){box.append(el('p','No trades in this period.'));parent.append(box);return;}
    const svg=svgEl('svg',{viewBox:'0 0 600 290',role:'img','aria-label':'Monthly results'});
    const min=Math.min(0,...rows.map(r=>r.total)),max=Math.max(0,...rows.map(r=>r.total)),span=max-min||1,y=v=>230-(v-min)/span*190;
    for(const v of [min,(min+max)/2,max]){const label=svgEl('text',{x:6,y:y(v)-5});label.textContent=fmt(v,unit());svg.append(label,svgEl('line',{x1:65,x2:580,y1:y(v),y2:y(v),class:'stats-zero'}));}
    rows.forEach((row,i)=>{const step=500/rows.length,cx=75+step*(i+.5),width=Math.min(56,step*.6),bar=svgEl('rect',{x:cx-width/2,y:Math.min(y(0),y(row.total)),width,height:Math.max(2,Math.abs(y(row.total)-y(0))),rx:4,fill:row.total<0?'var(--danger)':'var(--accent)',role:'button',tabindex:0,'aria-label':`${row.label}: ${fmt(row.total,unit())}, ${row.count} trades`});
      const open=()=>drill(row.label,row.records);bar.addEventListener('click',open);bar.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});const tip=svgEl('title',{});tip.textContent=`${row.label}: ${fmt(row.total,unit())} · ${row.count} trades`;bar.append(tip);svg.append(bar);
      const month=svgEl('text',{x:cx,y:255,'text-anchor':'middle'});month.textContent=new Date(`${row.key}-01T12:00:00`).toLocaleDateString('en-US',{month:'short'});const count=svgEl('text',{x:cx,y:276,'text-anchor':'middle'});count.textContent=String(row.count);svg.append(month,count);
    });box.append(svg);parent.append(box);
  }

  function renderOutcomeDonut(parent){const box=el('section',null,'fx-card mac-chart');box.append(el('h3','Outcome mix'),el('p',`${result.records.length} closed trades`,'mac-chart-subtitle'));box.classList.add('mac-outcome-mix');const rows=[['win','Wins'],['loss','Losses'],['breakEven','Break-even']].map(([key,label])=>({label,records:result.records.filter(t=>t.result===key)}));const svg=svgEl('svg',{viewBox:'0 0 400 230',role:'img','aria-label':'Outcome distribution including break-even'});let offset=0;const circumference=2*Math.PI*75;for(const [i,row]of rows.entries()){const fraction=result.records.length?row.records.length/result.records.length:0,circle=svgEl('circle',{cx:200,cy:110,r:75,fill:'none',stroke:['var(--accent)','#ed5454','#888'][i],'stroke-width':28,'stroke-dasharray':`${fraction*circumference} ${circumference}`,'stroke-dashoffset':-offset*circumference,transform:'rotate(-90 200 110)'});offset+=fraction;const title=svgEl('title',{});title.textContent=`${row.label}: ${row.records.length}`;circle.append(title);svg.append(circle);}const total=svgEl('text',{x:200,y:108,'text-anchor':'middle',class:'mac-donut-total'});total.textContent=String(result.records.length);const caption=svgEl('text',{x:200,y:130,'text-anchor':'middle'});caption.textContent='closed trades';svg.append(total,caption);box.append(svg);for(const row of rows)box.append(button(`${row.label}: ${row.records.length}`,()=>drill(row.label,row.records)));parent.append(box);}

  function renderHeatmap(parent) {
    const box=el('section',null,'fx-card mac-heatmap'),header=el('div',null,'heatmap-header'),heading=el('div');
    heading.append(el('h3','Instrument × setup'),el('p','Compare setups by instrument. Select a cell to explore its trades.','mac-chart-subtitle'));
    const controls=el('div',null,'heatmap-metrics'),out=el('div',null,'table-scroll');
    controls.setAttribute('role','group');controls.setAttribute('aria-label','Heatmap metric');
    out.tabIndex=0;out.setAttribute('role','region');out.setAttribute('aria-label','Instrument and setup results');
    header.append(heading,controls);box.append(header,out);parent.append(box);
    const options=[['Win rate','winRate'],['Average R','averageR'],['Total R','totalR']];
    function draw(key){
      for(const b of controls.children)b.setAttribute('aria-pressed',String(b.dataset.metric===key));
      out.replaceChildren();const rows=result.heatmap,symbols=[...new Set(rows.map(r=>JSON.parse(r.key)[0]))].sort(),setups=[...new Set(rows.map(r=>JSON.parse(r.key)[1]))].sort();
      if(!rows.length){out.append(el('p','No eligible trades.'));return;}
      const table=el('table'),thead=el('thead'),head=el('tr'),corner=el('th','Instrument');corner.scope='col';head.append(corner);
      table.setAttribute('aria-label',`Instrument × setup · ${options.find(o=>o[1]===key)[0]}`);
      setups.forEach(s=>{const th=el('th',s);th.scope='col';head.append(th);});thead.append(head);table.append(thead);
      const body=el('tbody');
      for(const symbol of symbols){const tr=el('tr'),th=el('th',symbol);th.scope='row';tr.append(th);
        for(const setup of setups){const row=rows.find(r=>r.key===JSON.stringify([symbol,setup])),td=el('td');
          if(row){const v=key==='winRate'?row.winRate*100:row[key],value=fmt(v,key==='winRate'?'%':'R'),b=button('',()=>drill(`${symbol} · ${setup}`,row.records));
            b.className='heatmap-cell';b.classList.add(v<0?'is-negative':v>0?'is-positive':'is-neutral');
            b.setAttribute('aria-label',`${symbol}, ${setup}: ${value}, ${row.count} trades. View trades`);
            b.append(el('strong',value),el('small',`${row.count} ${row.count===1?'trade':'trades'}`));td.append(b);
          }else{td.append(el('span','—','heatmap-empty'));td.setAttribute('aria-label','No trades');}tr.append(td);
        }body.append(tr);
      }table.append(body);out.append(table);
    }
    for(const [label,key]of options){const b=button(label,()=>draw(key));b.dataset.metric=key;controls.append(b);}draw('winRate');
  }
  function renderMonthComparison(parent){const box=el('section',null,'fx-card');box.append(el('h3','Month comparison'));const chosen=new Set(result.byMonth.slice(-2).map(r=>r.key)),out=el('div');for(const row of result.byMonth){const label=el('label',row.label,'mac-choice'),input=el('input');input.type='checkbox';input.checked=chosen.has(row.key);input.onchange=()=>{input.checked?chosen.add(row.key):chosen.delete(row.key);draw();};label.prepend(input);box.append(label);}box.append(out);parent.append(box);function draw(){out.replaceChildren();const rows=result.byMonth.filter(r=>chosen.has(r.key));cards(out,rows.map(r=>{const d=new Date(`${r.key}-01T12:00:00`);d.setMonth(d.getMonth()-1);const prev=result.byMonth.find(p=>p.key===dayKey(d).slice(0,7));return[r.label,fmt(r.total,unit()),`${r.count} trades · ${fmt(r.winRate*100,'%')} wins · change ${prev?fmt(r.total-prev.total,unit()):'—'}`];}));}draw();}
  function renderBoxPlot(parent){const box=el('section',null,'fx-card mac-chart');box.append(el('h3','Trade type distribution'));const rows=result.journal.types.filter(r=>r.measured),values=rows.flatMap(r=>r.quantiles).filter(Number.isFinite);if(!values.length){box.append(el('p','No measurable trade types.'));parent.append(box);return;}const low=Math.min(...values),high=Math.max(...values),x=v=>160+(v-low)/(high-low||1)*600;const svg=svgEl('svg',{viewBox:`0 0 800 ${rows.length*70+30}`,role:'img','aria-label':'Trade type box plots: range, quartiles and median'});rows.forEach((r,i)=>{const y=35+i*70,[min,q1,median,q3,max]=r.quantiles,t=svgEl('text',{x:5,y});t.textContent=r.label;svg.append(t,svgEl('line',{x1:x(min),x2:x(max),y1:y,y2:y,class:'stats-line'}),svgEl('rect',{x:x(q1),y:y-15,width:Math.max(1,x(q3)-x(q1)),height:30,class:'mac-radar'}),svgEl('line',{x1:x(median),x2:x(median),y1:y-18,y2:y+18,class:'stats-line'}));});box.append(svg,el('p','Whiskers: min/max. Box: 25th–75th percentile. Line: median.'));parent.append(box);}

  function comparisons(parent){
    const box=el('section',null,'fx-card');box.append(el('h3','Account comparison'));const available=[...result.accounts.values()].filter(a=>a.archived===false);
    selectedAccounts=selectedAccounts.filter(k=>available.some(a=>a.key===k));if(selectedAccounts.length<Math.min(2,available.length))selectedAccounts=available.slice(0,2).map(a=>a.key);
    const filters=el('div',null,'cloud-controls'),plot=el('div');field(filters,'Comparison metric',[['Growth %','percent'],['Balance','pl']],comparisonMode,v=>{comparisonMode=v;draw();});
    for(const a of available){const label=el('label',a.name),input=el('input');input.type='checkbox';input.checked=selectedAccounts.includes(a.key);input.onchange=()=>{if(input.checked&&selectedAccounts.length>=4){input.checked=false;return;}selectedAccounts=input.checked?[...selectedAccounts,a.key]:selectedAccounts.filter(k=>k!==a.key);draw();};label.prepend(input);filters.append(label);}box.append(filters,el('p','Choose up to four accounts. Growth uses starting balance and selected closed trades; deposits and withdrawals are not included.'),plot);parent.append(box);
    function draw(){plot.replaceChildren();const chosen=available.filter(a=>selectedAccounts.includes(a.key));if(comparisonMode==='pl'&&new Set(chosen.map(a=>a.currency)).size>1){plot.append(el('p','Balance comparison requires accounts in one currency. Native cached FX rates are not available in the browser. Growth % remains comparable.','cloud-notice'));return;}
      const series=chosen.filter(a=>comparisonMode!=='percent'||a.startBalance>0).map(a=>{const rows=result.comparisonRecords.filter(t=>t.accountKey===a.key),base=comparisonMode==='pl'?a.startBalance:0;return{label:a.name,points:[{value:base},...sequence(rows,t=>(t.profitLoss??0)/(comparisonMode==='percent'?a.startBalance/100:1)).map(p=>({...p,value:p.value+base}))]};});plot.append(lineChart('Account comparison',series,comparisonMode==='percent'?'%':` ${chosen[0]?.currency||''}`));if(series.length<chosen.length)plot.append(el('p','Accounts without a positive starting balance are excluded from growth comparison.'));}
    draw();
  }
  function setupCombination(parent){const box=el('section',null,'fx-card');box.append(el('h3','Setup combination'));const chosen=new Set(),out=el('div');for(const row of result.journal.setups){const label=el('label',row.label,'mac-choice'),check=el('input');check.type='checkbox';check.onchange=()=>{check.checked?chosen.add(row.key):chosen.delete(row.key);draw();};label.prepend(check);box.append(label);}box.append(out);parent.append(box);function draw(){out.replaceChildren();if(chosen.size<2){out.append(el('p','Select at least two setups to find trades containing every selected setup.'));return;}const rows=result.records.filter(t=>[...chosen].every(k=>labels(t,'setup').some(v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===k))),s=result.summarize(rows);out.append(el('p',`${s.count} trades · ${fmt(s.average,unit())} average · ${fmt(s.winRate*100,'%')} wins`),button('View matching trades',()=>drill('Setup combination',rows)));}draw();}
  function renderCalendar(parent){const box=el('section',null,'fx-card'),nav=el('div',null,'stats-chart-labels');const shift=n=>{const d=new Date(`${calendar}-01T12:00:00`);d.setMonth(d.getMonth()+n);calendar=dayKey(d).slice(0,7);run();};nav.append(button('Previous month',()=>shift(-1)),el('h3',calendar),button('Next month',()=>shift(1)));box.append(nav);const grid=el('div',null,'mac-calendar');const names=weekStart==='Monday'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];for(const n of names)grid.append(el('strong',n));const first=new Date(`${calendar}-01T12:00:00`),offset=(first.getDay()+(weekStart==='Monday'?6:0))%7,days=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();for(let i=0;i<offset;i++)grid.append(el('span'));for(let day=1;day<=days;day++){const key=`${calendar}-${String(day).padStart(2,'0')}`,row=result.byDay.find(r=>r.key===key),b=button('',()=>drill(key,row?.records||[]));b.className=`stats-day ${row?.total>0?'positive':row?.total<0?'negative':''}`;b.append(el('span',day),el('strong',row?fmt(row.total,unit()):'—'),el('small',`${row?.count||0} trades`));grid.append(b);}box.append(grid);const weeks=el('div',null,'stats-chart-labels');const cursor=new Date(first);cursor.setDate(1-offset);while(cursor.getMonth()===first.getMonth()||cursor<first){const start=new Date(cursor),end=new Date(cursor);end.setDate(end.getDate()+7);const rows=result.records.filter(t=>dayKey(t.startedAt)>=dayKey(start)&&dayKey(t.startedAt)<dayKey(end)),summary=result.summarize(rows);weeks.append(button(`${dayKey(start)} · ${fmt(summary.total,unit())} · ${rows.length} trades`,()=>drill(`Week of ${dayKey(start)}`,rows)));cursor.setDate(cursor.getDate()+7);}box.append(weeks);parent.append(box);}
  function renderTrades(parent){const controls=el('div',null,'cloud-controls'),list=el('div');field(controls,'Journal notes',[['All trades','all'],['With notes','with'],['Without notes','without'],['Incomplete journal','incomplete']],notesFilter,v=>{notesFilter=v;draw();});field(controls,'Sort',[['Newest first','newest'],['Oldest first','oldest'],['Highest P&L','highpl'],['Lowest P&L','lowpl'],['Highest result','high'],['Lowest result','low'],['Notes first','notes'],['Pair A–Z','pair']],sort,v=>{sort=v;draw();});field(controls,'Display',[['Table','table'],['Cards','cards']],display,v=>{display=v;draw();});parent.append(controls,el('p','Screenshot gallery remains in the native app: image assets are not loaded by this browser reader.','stats-caption'),list);function draw(){list.replaceChildren();const rows=result.records.filter(t=>notesFilter==='all'||notesFilter==='with'&&hasNotes(t)||notesFilter==='without'&&!hasNotes(t)||notesFilter==='incomplete'&&incompleteJournal(t));const date=(a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt);rows.sort((a,b)=>{if(sort==='oldest')return-date(a,b);if(sort==='pair')return(a.instrument||'').localeCompare(b.instrument||'',undefined,{numeric:true})||date(a,b);if(sort==='notes')return Number(hasNotes(b))-Number(hasNotes(a))||date(a,b);if(sort==='high'||sort==='low')return((result.value(a)??0)-(result.value(b)??0))*(sort==='high'?-1:1)||date(a,b);if(sort==='highpl'||sort==='lowpl'){if(a.profitLoss==null)return b.profitLoss==null?date(a,b):1;if(b.profitLoss==null)return-1;return(a.profitLoss-b.profitLoss)*(sort==='highpl'?-1:1)||date(a,b);}return date(a,b);});list.append(el('p',`${rows.length} trades`),button('Export CSV',()=>exportCSV(rows)));if(display==='table')tradeTable(rows,list);else{const grid=el('div',null,'cloud-grid');for(const t of rows){const c=el('article',null,'fx-card');c.append(el('h3',t.instrument),el('p',`${result.accounts.get(t.accountKey)?.name} · ${t.result}`),el('strong',fmt(result.value(t),unit())),el('p',[t.preTradeNotes,t.postTradeNotes].filter(Boolean).join('\n')),button('Trade details',()=>drill(t.instrument,[t])));grid.append(c);}list.append(grid);}}draw();}
  function exportCSV(rows){const safe=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const lines=[['Opened','Account','Instrument','Outcome','Result','Metric','P&L','Currency','Lots','Pre-trade notes','Post-trade notes'],...rows.map(t=>[t.startedAt,result.accounts.get(t.accountKey)?.name,t.instrument,t.result,result.value(t),unit(),t.profitLoss,t.currency,t.lotSize,t.preTradeNotes,t.postTradeNotes])];const url=URL.createObjectURL(new Blob([lines.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='PulseFX-trades.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  populate();if(demo)run();return{setSnapshot(snapshot,isStale=false){source=snapshot;stale=isStale;populate();run();},clear(){source=null;stale=false;if(!demo){result=null;output.replaceChildren();status.textContent='Connect iCloud to load your statistics.';}document.querySelectorAll('.mac-drilldown').forEach(d=>d.remove());},dispose(){source=null;result=null;output.replaceChildren();document.querySelectorAll('.mac-drilldown').forEach(d=>d.remove());}};
}
