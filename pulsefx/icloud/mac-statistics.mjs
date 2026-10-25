import { calculateStatistics, realizedR, summarizeStatistics } from '../app/statistics.mjs';

// MARK: - Lokale kalender en Mac-rekenregels
// Comment NL: Alleen pure berekeningen op een ingelezen snapshot, zonder opslag of netwerk.
const sum = values => values.reduce((a, b) => a + b, 0);
const mean = values => values.length ? sum(values) / values.length : 0;
const finite = Number.isFinite;
const pad = n => String(n).padStart(2, '0');
export const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function periodBounds(period = 'all', from = '', through = '', now = new Date()) {
  const end = new Date(now), start = new Date(now);
  if (period === 'all') return { start: null, end: null };
  if (period === 'week') start.setDate(start.getDate() - 7);
  if (period === 'month') { const day = start.getDate(); start.setDate(1); start.setMonth(start.getMonth() - 1); start.setDate(Math.min(day, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate())); }
  if (period === 'ytd') start.setFullYear(start.getFullYear(), 0, 1), start.setHours(0, 0, 0, 0);
  if (period === 'custom') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) throw new RangeError('Choose both custom dates.');
    start.setTime(new Date(`${from < through ? from : through}T00:00:00`).getTime());
    end.setTime(new Date(`${from < through ? through : from}T00:00:00`).getTime()); end.setDate(end.getDate() + 1);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}
export function metricValue(trade, accounts, metric = 'r') {
  if (metric === 'pl') return finite(trade.profitLoss) ? trade.profitLoss : null;
  if (metric === 'percent') { const base = accounts.get(trade.accountKey)?.startBalance; return base > 0 && finite(trade.profitLoss) ? trade.profitLoss / base * 100 : null; }
  return realizedR(trade) ?? 0;
}
export const profitFactor = values => { const gain = sum(values.filter(v => v > 0)), loss = -sum(values.filter(v => v < 0)); return loss ? gain / loss : gain > 0 ? Infinity : 0; };
export function sequence(records, getValue) {
  let running = 0, peak = 0;
  return records.flatMap(trade => { const value = getValue(trade); if (!finite(value)) return []; running += value; peak = Math.max(peak, running); return [{ key: trade.key, date: trade.startedAt, value: running, drawdown: running - peak }]; });
}
export function drawdownControl(values) {
  values = values.filter(finite); if (!values.length) return 0;
  let running = 0, peak = 0, dd = 0;
  for (const v of values) { running += v; peak = Math.max(peak, running); dd = Math.max(dd, peak - running); }
  const losses = values.filter(v => v < 0).map(Math.abs), worst = Math.max(0, ...losses), breaches = losses.filter(v => v > 1.1);
  const norm = Math.min(1, Math.max(0, (dd - 3) / 15));
  const bands = [[1.1, 1.25, 1, .85], [1.25, 1.5, .85, .6], [1.5, 2, .6, .2]];
  const band = bands.find(([a, b]) => worst > a && worst <= b);
  const risk = worst <= 1.1 ? 1 : band ? band[2] + (band[3] - band[2]) * (worst - band[0]) / (band[1] - band[0]) : .2 * Math.exp(-1.6 * (worst - 2));
  const frequency = losses.length ? 1 - Math.min(1, breaches.length / losses.length * 2 + sum(breaches.map(v => v - 1.1)) / losses.length) : 1;
  return Math.min(worst >= 3 ? .1 : worst >= 2 ? .4 : worst >= 1.5 ? .65 : 1, (1 - norm) * .45 + risk * .35 + frequency * .2);
}
const normalized = (v, low, high) => v === Infinity ? 1 : Math.max(0, Math.min(1, (v - low) / (high - low)));
export function labels(trade, type) {
  return [...new Set([...(trade[`${type}sSelectedRaw`] || '').split(','), trade[`${type}Tag`] || ''].map(v => v.trim()).filter(v => v && v.toLowerCase() !== 'unspecified' && v !== '—'))];
}
const title = raw => raw && raw !== 'none' ? raw.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) : null;
export const sessionLabel = t => t.sessionCustom || title(t.sessionRaw) || 'Unspecified';
export const psychologyLabel = t => t.emotionCustom?.trim() || title(t.emotionalStateRaw);
export const hasNotes = t => Boolean(t.preTradeNotes?.trim() || t.postTradeNotes?.trim());
export const incompleteJournal = t => t.recordType === 'CD_OpenTrade' && (!labels(t, 'setup').length || !labels(t, 'mistake').length || !psychologyLabel(t));
export function percentile(values, fraction) { const v = [...values].sort((a,b) => a-b); if (!v.length) return null; const p = (v.length - 1) * fraction, lo = Math.floor(p), hi = Math.ceil(p); return v[lo] * (1 - (p - lo)) + v[hi] * (p - lo); }

// MARK: - Mac-werkruimtes
export function calculateMacStatistics(snapshot, options = {}) {
  const accounts = new Map(snapshot.accounts.map(a => [a.key, a]));
  const bounds = periodBounds(options.period, options.from, options.through, options.now);
  const base = calculateStatistics(snapshot, { ...options, ...bounds });
  if (!base.available) return base;
  const records = base.records, modern = records.filter(t => t.recordType === 'CD_OpenTrade');
  const metric = options.metric || 'r', value = t => metricValue(t, accounts, metric);
  function summarize(rows) {
    const values = rows.map(value).filter(finite), s = summarizeStatistics(rows);
    return { ...s, records: rows, measured: values.length, total: sum(values), average: mean(values), best: values.length ? Math.max(...values) : 0, worst: values.length ? Math.min(...values) : 0, metricProfitFactor: profitFactor(values) };
  }
  function group(rows, key, folded = false) {
    const buckets = new Map();
    for (const t of rows) for (const label of new Set([key(t)].flat().filter(v => v != null))) {
      const id = folded ? String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : String(label);
      if (!buckets.has(id)) buckets.set(id, { key: id, label: String(label), records: [] });
      buckets.get(id).records.push(t);
    }
    return [...buckets.values()].map(b => ({ key: b.key, label: b.label, ...summarize(b.records) }));
  }
  const summary = summarize(records), curve = sequence(records, value), rValues = records.map(t => realizedR(t) ?? 0);
  const rCurve = sequence(records, t => realizedR(t) ?? 0), ddR = Math.max(0, ...rCurve.map(p => -p.drawdown));
  let win = 0, loss = 0, wins = 0, losses = 0;
  for (const t of records) { win = t.result === 'win' ? win + 1 : 0; loss = t.result === 'loss' ? loss + 1 : 0; wins = Math.max(wins, win); losses = Math.max(losses, loss); }
  const weeks = group(records, t => { const d = new Date(t.startedAt); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dayKey(d); });
  const consistency = weeks.length ? weeks.filter(g => g.totalR > 0).length / weeks.length : 0;
  const recoveryR = ddR ? Math.max(sum(rValues), 0) / ddR : sum(rValues) > 0 ? 3 : 0;
  const profile = [normalized(summary.winRate || 0, .35, .65), normalized(profitFactor(rValues), .75, 3), normalized(mean(rValues), -.25, .75), normalized(consistency, .3, .9), drawdownControl(rValues), normalized(recoveryR, .5, 8)];
  const orderBase = calculateStatistics(snapshot, { ...options, ...bounds, instrument: 'all', outcome: 'all' }).records;
  const order = new Map();
  for (const day of group(orderBase, t => dayKey(t.startedAt))) day.records.sort((a,b) => Date.parse(a.startedAt)-Date.parse(b.startedAt) || (a.id || a.key).localeCompare(b.id || b.key)).forEach((t,i) => order.set(t.key, i + 1));
  const distribution = ['≤ -2', '-2 to -1', '-1 to 0', '0 to 1', '1 to 2', '≥ 2'].map((label,i) => ({ label, ...summarize(records.filter(t => { const v = value(t); return finite(v) && (v <= -2 ? 0 : v < -1 ? 1 : v < 0 ? 2 : v < 1 ? 3 : v < 2 ? 4 : 5) === i; })) }));
  const slot = [1,2,3,4,6,12].includes(Number(options.slotHours)) ? Number(options.slotHours) : 3;
  const journal = {
    setups: group(modern, t => labels(t, 'setup'), true), mistakes: group(modern, t => labels(t, 'mistake'), true),
    psychology: group(modern, psychologyLabel, true), types: group(modern, t => title(t.tradeTypeRaw)),
    confluences: group(modern.filter(t => t.confluences > 0), t => t.confluences).sort((a,b) => Number(a.key)-Number(b.key)),
    management: group(modern, t => [t.breakEvenHitRaw === 'tpAfterBE' ? 'BE → target' : null, t.breakEvenHitRaw === 'slAfterBE' ? 'Returned to BE' : null, t.slMoved === true ? 'Stop moved' : null, t.weekendHoldRaw && t.weekendHoldRaw !== 'none' ? 'Weekend hold' : null]),
  };
  journal.types = journal.types.map(g => ({ ...g, quantiles: [0,.25,.5,.75,1].map(p => percentile(g.records.map(value).filter(finite), p)) }));
  const target = modern.filter(t => t.targetRR > 0).map(t => ({ trade: t, target: t.targetRR, final: realizedR(t) ?? 0 }));
  return { ...base, records, accounts, summary, metric, value, summarize, group, curve, streaks: { wins, losses },
    maximumDrawdown: Math.max(0, ...curve.map(p => -p.drawdown)), profile,
    edgeScore: records.length ? Math.round(sum(profile.map((v,i) => v * [.1,.2,.25,.15,.2,.1][i])) * 100) : null,
    consistency, recoveryR, distribution, target, journal,
    byMonth: group(records, t => dayKey(t.startedAt).slice(0,7)).slice(-12), byDay: group(records, t => dayKey(t.startedAt)),
    byWeekday: group(records, t => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(t.startedAt).getDay()]),
    bySession: group(modern, sessionLabel),
    byHour: group(records, t => { const h = Math.floor(new Date(t.startedAt).getHours()/slot)*slot; return `${pad(h)}:00–${pad(Math.min(24,h+slot))}:00`; }).sort((a,b) => a.key.localeCompare(b.key)),
    byOrder: group(records.filter(t => order.get(t.key) <= 5), t => `#${order.get(t.key)}`).sort((a,b) => a.key.localeCompare(b.key)),
    byAccount: group(records, t => accounts.get(t.accountKey)?.name || t.accountKey), byInstrument: group(records, t => t.instrument || 'Unknown'),
    heatmap: group(records, t => (t.recordType === 'CD_OpenTrade' && labels(t,'setup').length ? labels(t,'setup') : ['Unspecified']).map(s => JSON.stringify([t.instrument || 'Unknown', s]))),
    crossTab: group(modern, t => (labels(t,'setup').length ? labels(t,'setup') : ['Unspecified']).map(s => `${s} · ${sessionLabel(t)}`)),
    comparisonRecords: calculateStatistics(snapshot, { ...options, ...bounds, accountKey: 'all' }).records,
  };
}
