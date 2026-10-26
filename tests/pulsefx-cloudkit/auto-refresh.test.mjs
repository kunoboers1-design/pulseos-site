import test from 'node:test';
import assert from 'node:assert/strict';
import { mountAutoRefresh } from '../../pulsefx/icloud/auto-refresh.mjs';

function fixture() {
  const document = new EventTarget(), window = new EventTarget();
  document.visibilityState = 'visible';
  let tick, cleared = false, allowed = true, calls = 0, release;
  window.setInterval = (fn, ms) => { assert.equal(ms, 30000); tick = fn; return 1; };
  window.clearInterval = id => { assert.equal(id, 1); cleared = true; };
  mountAutoRefresh({ document, window, eligible: () => allowed,
    refresh: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  return { document, window, tick: () => tick(), setAllowed: v => { allowed = v; },
    get calls() { return calls; }, get cleared() { return cleared; }, finish: () => release() };
}
test('polls every 30 seconds without overlapping reads', async () => {
  const f = fixture(); assert.equal(f.calls, 0);
  const pending = f.tick(); await f.tick(); assert.equal(f.calls, 1);
  f.finish(); await pending;
  const next = f.tick(); assert.equal(f.calls, 2); f.finish(); await next;
});
test('pauses for hidden tabs and ineligible states, refreshes on return', async () => {
  const f = fixture(); f.document.visibilityState = 'hidden'; await f.tick(); assert.equal(f.calls, 0);
  f.document.visibilityState = 'visible'; f.setAllowed(false);
  f.document.dispatchEvent(new Event('visibilitychange')); await f.tick(); assert.equal(f.calls, 0);
  f.setAllowed(true); f.document.dispatchEvent(new Event('visibilitychange')); assert.equal(f.calls, 1); f.finish();
});
test('page exit stops timer and visibility listener', async () => {
  const f = fixture(); f.window.dispatchEvent(new Event('pagehide'));
  await f.tick(); f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.cleared, true); assert.equal(f.calls, 0);
});
