// MARK: - Downloadteller
// Comment NL: Toont uitsluitend geldige API-cijfers en houdt fouten uit de teller.
(async () => {
  const counter = document.getElementById('totalDownloads');
  const status = document.getElementById('downloads-status');
  if (!counter || !status) return;
  status.textContent = 'Loading App Store downloads…';
  try {
    const response = await fetch('/api/downloads', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Downloads unavailable');
    const { total, updatedAt } = await response.json();
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid download total');
    counter.textContent = total.toLocaleString('en-US');
    status.textContent = 'First-time downloads · App Store';
    if (typeof updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
      const date = new Date(`${updatedAt}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) {
        status.textContent += ` · Updated ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
      }
    }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && counter.animate) {
      counter.animate([{ opacity: 0.3, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'ease-out' });
    }
  } catch {
    status.textContent = 'App Store download count unavailable. Please check back later.';
  }
})();
