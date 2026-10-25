import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
export const normalizeCode = code => typeof code === 'string' ? code.replace(/[-\s]/g, '').toLowerCase() : '';

// MARK: - Tijdelijke browsersessies
// Comment NL: Alleen hashes en versleutelde aankoopverwijzingen op schijf; geen JWS of handelsgegevens.
export function createStore(path, encryptionKey, now = Date.now) {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) throw new Error('Invalid session encryption key');
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, code TEXT UNIQUE, pairExpires INTEGER, expires INTEGER, purchase TEXT);
    CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER, expires INTEGER);`);
  const encrypt = value => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  };
  const decrypt = value => {
    const data = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', encryptionKey, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]));
  };
  const cleanup = () => {
    db.prepare('DELETE FROM sessions WHERE expires <= ? OR (purchase IS NULL AND pairExpires <= ?)').run(now(), now());
    db.prepare('DELETE FROM limits WHERE expires <= ?').run(now());
  };
  return {
    create() {
      cleanup();
      const token = randomBytes(32).toString('hex'), code = randomBytes(16).toString('hex');
      const pairExpires = now() + 5 * 60_000, expires = now() + 12 * 60 * 60_000;
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, NULL)').run(hash(token), hash(code), pairExpires, expires);
      return { token, code: code.match(/.{4}/g).join('-'), pairExpires, expires };
    },
    get(token) {
      cleanup();
      if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
      const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires > ?').get(hash(token), now());
      return row ? { ...row, purchase: row.purchase ? decrypt(row.purchase) : null } : null;
    },
    pending(code) {
      code = normalizeCode(code);
      return /^[a-f0-9]{32}$/.test(code) && !!db.prepare('SELECT id FROM sessions WHERE code = ? AND purchase IS NULL AND pairExpires > ?').get(hash(code), now());
    },
    confirm(code, purchase) {
      const result = db.prepare('UPDATE sessions SET purchase = ?, code = NULL WHERE code = ? AND purchase IS NULL AND pairExpires > ? AND expires > ?')
        .run(encrypt(purchase), hash(normalizeCode(code)), now(), now());
      return result.changes === 1;
    },
    remove(token) { if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(hash(token)); },
    allow(identity, maximum = 30) {
      cleanup();
      const id = hash(identity);
      db.prepare('INSERT INTO limits VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1').run(id, now() + 60_000);
      return db.prepare('SELECT count FROM limits WHERE id = ?').get(id).count <= maximum;
    },
    prune: cleanup,
    close() { db.close(); },
  };
}
