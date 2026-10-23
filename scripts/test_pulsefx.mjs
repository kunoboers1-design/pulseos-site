import assert from 'node:assert/strict';
import { calculatePosition } from '../pulsefx/app/calculator.mjs';
import { createDemoRepository, demoSeed, summarize, STORAGE_KEY } from '../pulsefx/app/demo-data.mjs';

// MARK: - Berekeningen en rekenkundige grenzen
const valid = { balance: 10000, risk: 1, stop: 20, pip: 10 };
assert.deepEqual(calculatePosition(valid), { errors: {}, riskAmount: 100, lots: 0.5, roundedLots: 0.5, plannedRisk: 100 });
assert.equal(calculatePosition({ ...valid, balance: 25840, stop: 25 }).roundedLots, 1.03);
assert.equal(calculatePosition({ ...valid, balance: 10, stop: 100 }).roundedLots, 0);
for (const key of Object.keys(valid)) {
  for (const value of ['', ' ', 0, -1, 'abc', NaN, Infinity]) {
    assert.ok(calculatePosition({ ...valid, [key]: value }).errors[key], `${key}: ${value}`);
  }
}
assert.ok(calculatePosition({ ...valid, risk: 101 }).errors.risk);
assert.deepEqual(calculatePosition({ ...valid, risk: 100 }).errors, {});
assert.ok(Object.keys(calculatePosition({ ...valid, balance: 1e308, stop: 1e-300 }).errors).length);
for (const balance of [0.1, 1, 57.9, 10000, 25840, 1e7]) {
  const result = calculatePosition({ ...valid, balance });
  assert.ok(result.plannedRisk <= result.riskAmount);
}

// MARK: - Datasetconsistentie en veilige opslag
assert.equal(summarize(demoSeed).balance, 40930);
assert.equal(summarize(demoSeed).pnl, 930);
assert.equal(summarize(demoSeed).winRate, 50);
assert.equal(summarize(demoSeed, 'atlas').balance, 25840);
assert.equal(summarize(demoSeed, 'personal').balance, 10140);
assert.equal(summarize(demoSeed, 'practice').balance, 4950);
const saved = new Map([['unrelated-setting', 'keep']]);
const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
const repo = createDemoRepository(storage);
const sampleNote = demoSeed.trades[0].note;
await repo.saveNote('t1', '<script>example</script>');
assert.equal((await createDemoRepository(storage).load()).trades[0].note, '<script>example</script>');
assert.equal(demoSeed.trades[0].note, sampleNote);
await repo.reset();
assert.equal((await createDemoRepository(storage).load()).trades[0].note, sampleNote);
assert.equal(saved.get('unrelated-setting'), 'keep');
for (const value of ['bad JSON', '{}', '{"version":1,"notes":[]}', '{"version":1,"notes":{"t1":23}}']) {
  saved.set(STORAGE_KEY, value);
  const data = await createDemoRepository(storage).load();
  assert.equal(data.trades[0].note, sampleNote);
  assert.equal(data.recovered, true);
}
const unavailable = createDemoRepository({ getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Full'); } });
const result = await unavailable.saveNote('t1', 'In memory');
assert.equal(result.persistent, false);
assert.equal(result.trades[0].note, 'In memory');
await assert.rejects(repo.saveNote('missing', 'Invalid'));
await assert.rejects(repo.saveNote('t1', 'a'.repeat(2001)));
console.log('PASS: calculator, input validation, account totals, persistence, corruption recovery and reset.');
