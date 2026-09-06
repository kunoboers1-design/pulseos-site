// MARK: - E-mailadres kopiëren
// Comment NL: De mailto-link blijft beschikbaar als het klembord niet wordt ondersteund.
(() => {
  const button = document.getElementById('copy-email');
  const status = document.getElementById('copy-status');
  if (button && status && navigator.clipboard?.writeText) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('support@pulseos.eu');
        status.textContent = 'Email address copied.';
      } catch {
        status.textContent = 'Could not copy. Use the email link above.';
      }
    });
  }

  // MARK: - Leespositie in de inhoudsopgave
  // Comment NL: De actieve sectie volgt de leespositie zonder de URL of toetsenbordfocus te wijzigen.
  const links = [...document.querySelectorAll('.policy-sidebar a[href^="#"]')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  if (links.length) {
    let scheduled = false;
    const updateSection = () => {
      scheduled = false;
      let active = 0;
      sections.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= 150) active = index;
      });
      links.forEach((link, index) => {
        if (index === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const scheduleUpdate = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(updateSection);
    };
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('load', scheduleUpdate);
    updateSection();
  }

  // MARK: - Terug naar boven
  // Comment NL: Respecteert de ingestelde voorkeur voor minder beweging.
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    const updateButton = () => backToTop.classList.toggle('visible', window.scrollY > 400);
    window.addEventListener('scroll', updateButton, { passive: true });
    updateButton();
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }
})();
