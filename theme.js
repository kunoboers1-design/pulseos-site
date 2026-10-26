/* PulseOS theme toggle — apply saved theme immediately to prevent flash */
(function () {
  // Comment NL: Geblokkeerde browseropslag mag de pagina en themaknop niet onderbreken.
  var saved;
  try { saved = localStorage.getItem('pulse-theme'); } catch {}
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

function initializeThemeToggle() {
  var btn = document.getElementById('themeToggle');
  if (!btn || btn.dataset.themeBound) return;
  btn.dataset.themeBound = 'true';

  function getTheme() {
    return (
      document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    );
  }

  var SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function applyIcon(theme) {
    btn.innerHTML = theme === 'dark' ? SUN : MOON;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    // Comment NL: Sommige pagina's tonen naast het pictogram ook een zichtbaar actielabel.
    if (btn.hasAttribute('data-theme-label')) {
      var label = document.createElement('span');
      label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      btn.append(label);
      var themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    }
  }

  applyIcon(getTheme());

  btn.addEventListener('click', function () {
    var next = getTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('pulse-theme', next); } catch {}
    applyIcon(next);

    /* Update homepage canvas colours if present */
    if (typeof window.onThemeChange === 'function') window.onThemeChange(next);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeThemeToggle);
else initializeThemeToggle();
