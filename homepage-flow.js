// MARK: - Scrollbeweging
// Comment NL: Kleine verschuivingen verbinden de compositie met natuurlijke scroll, zonder scroll over te nemen.
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 640px)');
  const artwork = [...document.querySelectorAll('.hero-screen')];
  const apps = document.getElementById('apps');
  let pending = false;

  function render() {
    pending = false;
    const height = window.innerHeight;
    const bounds = artwork.map(element => ({ element, rect: element.parentElement.getBoundingClientRect() }));
    for (const { element, rect } of bounds) {
      if (motion.matches || mobile.matches) {
        element.style.removeProperty('--drift');
      } else if (rect.bottom > -100 && rect.top < height + 100) {
        const progress = Math.max(-1, Math.min(1, (height / 2 - rect.top - rect.height / 2) / height));
        element.style.setProperty('--drift', `${progress * 24}px`);
      }
    }
    if (apps) {
      const rect = apps.getBoundingClientRect();
      const { hex, rgb } = getColorAtProgress(-rect.top / Math.max(1, rect.height));
      setAccent(hex, rgb);
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(render);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  motion.addEventListener('change', schedule);
  mobile.addEventListener('change', schedule);
  render();

})();
