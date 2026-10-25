import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { calculateMacStatistics, drawdownControl } from '../pulsefx/icloud/mac-statistics.mjs';

// MARK: - Onafhankelijke Swift-orakeltest
// Comment NL: Leest de ongewijzigde native calculators en compileert uitsluitend een tijdelijke kopie.
const native = process.argv[2];
if (!native) throw new Error('Pass the native PulseFX source directory.');
const folder=mkdtempSync(join(tmpdir(),'pulsefx-parity-'));
try {
const stats=readFileSync(join(native,'FXLotsizeNotifier/Core/Utilities/StatsCalculator.swift'),'utf8').split('// MARK: - Modeladapters')[0];
const drawdown=readFileSync(join(native,'FXLotsizeNotifier/Core/Utilities/DrawdownControlCalculator.swift'),'utf8');
const harness=`
struct Input: Decodable { let r: [Double?]; let pl: [Double?]; let base: [Double?]; let lots: [Double]; let outcome: [String] }
let data = FileHandle.standardInput.readDataToEndOfFile()
let inputs = try JSONDecoder().decode([Input].self, from: data)
var output: [[String: Double]] = []
for input in inputs {
 let rows = input.r.indices.map { i in StatsTradeRecord(id: UUID(), openedAt: Date(timeIntervalSince1970: Double(i)), accountID: nil, pair: "EURUSD", outcome: input.outcome[i] == "win" ? .win : input.outcome[i] == "loss" ? .loss : .breakEven, realizedR: input.r[i], profitLoss: input.pl[i], lotSize: input.lots[i], startBalance: input.base[i], currencyCode: "USD") }
 for metric in [StatsResultMetric.rMultiple, .percent] {
  let s = StatsCalculator.summary(for: rows, metric: metric)
  output.append(["count":Double(s.closedTrades),"wins":Double(s.wins),"losses":Double(s.losses),"breakEvens":Double(s.breakEvens),"winRate":s.winRate,"totalR":s.totalR,"averageR":s.averageR,"averageLot":s.averageLot,"total":s.totalMetric,"average":s.averageMetric,"best":s.bestMetric,"worst":s.worstMetric,"profitFactor":s.profitFactor.isFinite ? s.profitFactor : -999,"control":DrawdownControlCalculator.assess(realizedR:rows.map(\\.realizedR)).score])
 }
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:output,options:[.sortedKeys]))
`;
writeFileSync(join(folder,'main.swift'),stats+'\n'+drawdown+'\n'+harness);
const built=spawnSync('swiftc',['-module-cache-path',join(folder,'cache'),join(folder,'main.swift'),'-o',join(folder,'oracle')],{encoding:'utf8'});
assert.equal(built.status,0,built.stderr);
let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const fixtures=Array.from({length:80},(_,caseIndex)=>{const n=caseIndex%40+1;return {r:Array.from({length:n},()=>random()<.1?null:Math.round((random()*8-4)*100)/100),pl:Array.from({length:n},()=>random()<.1?null:Math.round((random()*1000-500)*100)/100),base:Array.from({length:n},()=>random()<.2?0:10000),lots:Array.from({length:n},()=>random()*2),outcome:Array.from({length:n},()=>['win','loss','breakEven'][Math.floor(random()*3)])};});
const run=spawnSync(join(folder,'oracle'),[],{input:JSON.stringify(fixtures),encoding:'utf8'});assert.equal(run.status,0,run.stderr);const expected=JSON.parse(run.stdout);
let checks=0;
fixtures.forEach((f,i)=>{const accounts=f.base.map((base,j)=>({key:`a${j}`,archived:false,startBalance:base,currency:'USD'})),trades=f.r.map((r,j)=>({key:`t${j}`,recordType:'CD_OpenTrade',startedAt:new Date(j*1000).toISOString(),accountKey:`a${j}`,status:'closed',result:f.outcome[j],outcomeConsistent:true,linkStatus:'linked',finalRR:r,lotSize:f.lots[j],profitLoss:f.pl[j],currency:'USD'}));
 for(const [m,metric]of ['r','percent'].entries()){const result=calculateMacStatistics({collectionStatus:'complete',accounts,trades},{metric}),s=result.summary,actual={...s,profitFactor:s.profitFactor===Infinity?-999:s.profitFactor,control:drawdownControl(f.r.map(r=>r??0))};for(const [key,value]of Object.entries(expected[i*2+m])){assert.ok(Math.abs(actual[key]-value)<1e-9,`Case ${i}/${metric}/${key}: web ${actual[key]}, Swift ${value}`);checks++;}}
});
console.log(`PASS: ${checks} values across ${fixtures.length*2} R/percentage cases match the original Swift calculators (tolerance 1e-9). No native files or user data changed.`);
} finally { rmSync(folder,{recursive:true,force:true}); }
