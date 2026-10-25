import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
// MARK: - Alleen lokale testopslag
// Comment NL: D1-contract op een tijdelijke SQLite-database; nooit echte gebruikersgegevens.
export function memoryD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../server/pulsefx-access/schema.sql', import.meta.url), 'utf8'));
  function prepare(sql, values = []) {
    return { bind: (...args) => prepare(sql, args),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      run: async () => { sqlite.prepare(sql).run(...values); return { success: true }; },
      execute: () => ({ success: true, results: sqlite.prepare(sql).all(...values) }) };
  }
  return { prepare, batch: async statements => {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }, close: () => sqlite.close() };
}
