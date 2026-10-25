-- MARK: - Tijdelijke toegang en pogingentellers
-- Comment NL: Geen namen, ruwe IP-adressen, wachtwoorden of handelsgegevens opslaan.
CREATE TABLE IF NOT EXISTS friends_sessions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS friends_sessions_expiry ON friends_sessions(expires_at);
CREATE TABLE IF NOT EXISTS friends_attempts (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS friends_attempts_expiry ON friends_attempts(expires_at);
