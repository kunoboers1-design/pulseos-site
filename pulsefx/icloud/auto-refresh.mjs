// MARK: - Automatische leescontrole
// Comment NL: Alleen zichtbare, verbonden workspaces verversen; geen overlappende leesruns.
export function mountAutoRefresh({ refresh, eligible, document, window, interval = 30000 }) {
  let stopped = false, pending = false;
  async function check() {
    if (stopped || pending || document.visibilityState !== 'visible' || !eligible()) return;
    pending = true;
    try { await refresh(); } catch { /* Comment NL: De leeslaag toont fouten en bewaart de vorige snapshot. */ }
    finally { pending = false; }
  }
  const timer = window.setInterval(check, interval);
  document.addEventListener('visibilitychange', check);
  function stop() {
    stopped = true; window.clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('pagehide', stop);
  }
  window.addEventListener('pagehide', stop);
  return { stop };
}
