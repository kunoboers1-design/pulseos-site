// MARK: - Screenshotbronnen
// Comment NL: Alleen rasterdata en ondertekende Apple-assetbronnen toestaan.
export function screenshotSource(fields) {
  const asset = fields.CD_data_ckAsset?.value ?? fields.CD_data?.value;
  if (asset && typeof asset === 'object') {
    try {
      const url = new URL(asset.downloadURL);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname.endsWith('.icloud.com') || url.hostname.endsWith('.icloud-content.com'))) return url.href;
    } catch {}
  }
  if (typeof asset === 'string' && asset.length < 14000000 && /^[A-Za-z0-9+/=]+$/.test(asset)) {
    const mime = asset.startsWith('/9j/') ? 'image/jpeg' : asset.startsWith('iVBORw0KGgo') ? 'image/png' : null;
    if (mime) return 'data:' + mime + ';base64,' + asset;
  }
  return null;
}

// MARK: - Screenshotgalerij
// Comment NL: PencilKit-annotaties blijven behouden en worden niet als zichtbare pixels voorgesteld.
export function appendScreenshots(parent, trade, snapshot) {
  const make = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  const card = make('section'); card.className = 'trade-detail-card trade-screenshots';
  card.append(make('h3', 'Screenshots'), make('p', 'Charts and visual evidence from your native app.'));
  const items = (snapshot.screenshots || []).filter(s => s.tradeKey === trade.key);
  if (!items.length) card.append(make('p', snapshot.screenshotsStatus === 'complete' ? 'No screenshots attached to this trade.' : 'Screenshots are not available in this snapshot. Refresh iCloud to try again.'));
  const grid = make('div'); grid.className = 'trade-screenshot-grid';
  for (const item of items) {
    const figure = make('figure');
    if (item.src) {
      const img = make('img'); img.src = item.src; img.alt = item.label || 'Trade screenshot'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.replaceWith(make('p', 'Image unavailable. Refresh iCloud to renew access.'));
      const button = make('button'); button.type = 'button'; button.className = 'screenshot-preview'; button.setAttribute('aria-label', 'Enlarge screenshot'); button.append(img);
      button.onclick = () => {
        const viewer = make('dialog'); viewer.className = 'screenshot-viewer';
        const close = make('button', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close screenshot'); close.onclick = () => viewer.close();
        const full = img.cloneNode(); full.loading = 'eager'; viewer.append(close, full);
        if (item.annotated) viewer.append(make('p', 'Original image. iPhone handwriting is stored separately and is not displayed here yet.'));
        viewer.onclose = () => viewer.remove(); document.body.append(viewer); viewer.showModal();
      };
      figure.append(button);
    } else figure.append(make('p', 'This image format is not available in the browser.'));
    figure.append(make('figcaption', item.label || 'Screenshot'));
    if (item.annotated) figure.append(make('p', 'Contains iPhone annotations — view handwriting in the native app.'));
    grid.append(figure);
  }
  card.append(grid); parent.append(card);
}
