// MARK: - Screenshotkeuze
// Comment NL: De gebruiker kiest zelf het scherm; er is geen automatische carrousel.
(() => {
  const screen = document.getElementById('product-screen');
  const caption = document.getElementById('preview-caption');
  const choices = [...document.querySelectorAll('.screen-choice')];
  const enhancedMotion = document.body.classList.contains('page-motion');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selectionVersion = 0;
  let previewAnimation;
  motionPreference.addEventListener('change', () => previewAnimation?.cancel());
  for (const button of choices) {
    button.addEventListener('click', async () => {
      if (!screen || !caption) return;
      const version = ++selectionVersion;
      if (enhancedMotion) {
        // Comment NL: Eerst laden voorkomt knipperen; bij snel klikken wint alleen de laatste keuze.
        const image = new Image();
        image.src = button.dataset.screenSrc;
        try { await image.decode(); } catch {
          if (version === selectionVersion) caption.textContent = 'Preview unavailable. Please try another screen.';
          return;
        }
        if (version !== selectionVersion) return;
      }
      const changed = screen.getAttribute('src') !== button.dataset.screenSrc;
      screen.src = button.dataset.screenSrc;
      screen.alt = button.dataset.screenLabel;
      caption.textContent = button.dataset.screenLabel;
      for (const choice of choices) choice.setAttribute('aria-pressed', String(choice === button));
      if (enhancedMotion && changed && !motionPreference.matches && screen.animate) {
        previewAnimation?.cancel();
        previewAnimation = screen.animate([
          { opacity: 0.4, transform: 'translateX(7px)' },
          { opacity: 1, transform: 'translateX(0)' }
        ], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    });
  }

  // MARK: - Rechtstreekse sectielinks
  // Comment NL: Een link naar uitklapbare informatie opent eerst de bovenliggende details.
  function revealHash() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    let parent = target.parentElement;
    let opened = false;
    while (parent) {
      if (parent.tagName === 'DETAILS' && !parent.open) { parent.open = true; opened = true; }
      parent = parent.parentElement;
    }
    document.querySelectorAll('.product-sidebar nav a').forEach(link => {
      if (link.hash === window.location.hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (opened) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }
  window.addEventListener('hashchange', revealHash);
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      if (link.hash === window.location.hash) revealHash();
    });
  });
  revealHash();
})();
