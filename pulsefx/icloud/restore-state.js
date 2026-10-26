// MARK: - Herstelstatus vóór de eerste weergave
// Comment NL: Alleen de bestaande voorkeur lezen; geen records of Apple-tokens bewaren.
try {
  const query = new URLSearchParams(location.search);
  if (query.get('workspace') !== 'demo' && query.get('restore') !== 'manual'
    && localStorage.getItem('pulsefx-remember-icloud') === 'true') {
    document.documentElement.dataset.icloudRestoring = 'true';
  }
} catch { /* Comment NL: Zonder opslag blijft handmatig aanmelden beschikbaar. */ }
