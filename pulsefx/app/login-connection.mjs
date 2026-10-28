// MARK: - Aanmelden in de bestaande welkomstkaart
// Comment NL: De bestaande workspace en SDK blijven in hetzelfde document, ook zonder sessieopslag.
export async function openLoginConnection(root) {
  const response = await fetch('/pulsefx/icloud/', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const destination = new URL(response.url);
  if (destination.origin !== location.origin) throw new Error('Unexpected origin');
  if (destination.pathname.startsWith('/pulsefx/access/')) {
    location.assign('/pulsefx/access/?next=' + encodeURIComponent(location.pathname));
    return;
  }
  if (!response.ok) throw new Error('Workspace unavailable');
  const documentSource = new DOMParser().parseFromString(await response.text(), 'text/html');
  const layout = documentSource.querySelector('.cloud-layout');
  const connection = layout?.querySelector('.cloud-connection');
  const zone = layout?.querySelector('#zone-panel');
  if (!layout || !connection || !zone) throw new Error('Workspace unavailable');
  // Comment NL: Geen scripts uit opgehaalde HTML uitvoeren; alleen de vaste lokale module laden.
  layout.querySelectorAll('script').forEach(element => element.remove());
  layout.querySelector('#main').id = 'cloud-main';
  layout.hidden = true;
  document.body.append(layout);
  document.body.dataset.loginEntry = 'true';
  // Comment NL: De welkomstpagina behoudt de merkkleuren terwijl de workspace zijn eigen accent laadt.
  for (const key of ['--accent', '--accent-bright', '--accent-dim', '--page-accent']) root.style.setProperty(key, getComputedStyle(document.body).getPropertyValue(key));
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/pulsefx/icloud/cloud.css'; document.head.append(css);
  const slot = document.getElementById('login-connection');
  const connectionMarker = document.createComment('connection'); connection.before(connectionMarker);
  const zoneMarker = document.createComment('zone'); zone.before(zoneMarker);
  connection.querySelector('#remember-icloud').disabled = true;
  connection.querySelector('#remember-icloud').checked = true;
  slot.replaceChildren(connection, zone);
  connection.querySelector('#connect-title').textContent = 'Sign in with iCloud';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'About this connection'; details.append(summary);
  for (const paragraph of connection.querySelectorAll(':scope > p:not([id])')) details.append(paragraph);
  connection.querySelector('.remember-icloud').before(details);
  const start = connection.querySelector('#start'); start.textContent = 'Continue with Apple';
  document.addEventListener('pulsefx:workspace-ready', () => {
    connectionMarker.replaceWith(connection); zoneMarker.replaceWith(zone);
    root.remove(); layout.querySelector('#cloud-main').id = 'main';
    document.body.removeAttribute('data-login-entry');
    document.body.classList.remove('site-refresh'); document.body.classList.add('cloud-test');
    layout.hidden = false;
    history.replaceState(null, '', '/pulsefx/icloud/');
    document.title = 'PulseFX — Trading workspace';
    document.getElementById('tab-open').click();
    document.getElementById('workspace-title').setAttribute('tabindex', '-1');
    document.getElementById('workspace-title').focus(); window.scrollTo(0, 0);
    window.dispatchEvent(new Event('resize'));
  }, { once: true });
  await import('../icloud/cloud.mjs');
  if (!start.disabled) connection.querySelector('#remember-icloud').disabled = false;
  const theme = document.createElement('script'); theme.src = '/theme.js'; document.head.append(theme);
  start.focus();
}
