// MARK: - Browserfavorieten bovenop iCloud
// Comment NL: Identiteit bevat gebruiker, omgeving en zone; accounts worden niet gewijzigd.
const prefix = 'pulsefx.account-favorite.';
export function isFavorite(account, storage = globalThis.localStorage) {
  try { const saved = storage.getItem(prefix + account.key); if (saved === 'true' || saved === 'false') return saved === 'true'; } catch {}
  return account.favorite === true;
}
export function saveFavorite(account, favorite, storage = globalThis.localStorage) {
  try { storage.setItem(prefix + account.key, String(favorite)); return true; } catch { return false; }
}
