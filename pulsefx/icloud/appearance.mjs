// MARK: - Native PulseFX-kleuren, lokaal voor deze browser
// Comment NL: De native app gebruikt NSUbiquitousKeyValueStore; deze voorkeur schrijft geen CloudKit-records.
const palette = [
  ['forest_green', 'Forest Green', '#34c759', '#187a32'],
  ['pulse_blue', 'Pulse Blue', '#409cff', '#0062cc'],
  ['pulse_orange', 'Pulse Orange', '#ff7a00', '#aa4900'],
  ['pulse_pink', 'Pulse Pink', '#ff5b95', '#ba1551'],
  ['scarlet_red', 'Scarlet Red', '#ff6961', '#bc241c'],
  ['focus_black', 'Monochrome', '#f5f5f7', '#1c1c1e'],
];
export function mountAppearance() {
  const host = document.getElementById('appearance-settings');
  host.innerHTML = `<h2 id="appearance-title">Appearance</h2><p>Make PulseFX feel like your app. These preferences apply to this browser.</p><h3>Accent color</h3><div class="accent-options" role="group" aria-label="Accent color"></div><p id="appearance-status" role="status"></p><div class="appearance-row"><div><h3>Light &amp; dark</h3><p>Use the appearance button in the header to switch themes.</p></div><button id="settings-theme" class="text-button" type="button">Change theme</button></div><div class="settings-explanation"><strong>iCloud appearance sync</strong><p>Your native app syncs colors through Apple's separate settings storage. This web workspace cannot read that preference yet. Choose the same color here; this will not change your iPhone or Mac settings.</p></div><button id="reset-appearance" class="text-button" type="button">Reset accent color</button>`;
  let selected = 'forest_green';
  try { const saved = localStorage.getItem('pulsefx-accent'); if (palette.some(p => p[0] === saved)) selected = saved; } catch {}
  function apply(save = false) {
    const [, label, dark, light] = palette.find(p => p[0] === selected);
    const color = document.documentElement.dataset.theme === 'light' ? light : dark;
    for (const key of ['--accent', '--accent-bright', '--page-accent']) document.body.style.setProperty(key, color);
    document.body.style.setProperty('--accent-dim', `color-mix(in srgb, ${color} 12%, transparent)`);
    for (const b of host.querySelectorAll('[data-accent]')) b.setAttribute('aria-pressed', String(b.dataset.accent === selected));
    let persisted = true;
    if (save) try { localStorage.setItem('pulsefx-accent', selected); } catch { persisted = false; }
    document.getElementById('appearance-status').textContent = `${label} · ${persisted ? 'Browser preference only. No iCloud sync.' : 'Storage unavailable. Applied for this page only.'}`;
    document.getElementById('settings-theme').textContent = document.documentElement.dataset.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  }
  for (const [key, label, color] of palette) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.accent = key;
    const swatch = document.createElement('span'); swatch.className = 'accent-swatch'; swatch.style.background = color; swatch.setAttribute('aria-hidden', 'true');
    b.append(swatch, document.createTextNode(label)); b.onclick = () => { selected = key; apply(true); }; host.querySelector('.accent-options').append(b);
  }
  document.getElementById('settings-theme').onclick = () => document.getElementById('themeToggle').click();
  document.getElementById('reset-appearance').onclick = () => { selected = 'forest_green'; apply(true); };
  new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  apply();
}
