const amsterdamDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
});

const createTable = `CREATE TABLE IF NOT EXISTS pulsefx_link_days (
  day TEXT PRIMARY KEY, openings INTEGER NOT NULL
)`;

export async function recordOpening(db, now = new Date()) {
  const day = amsterdamDate.format(now);
  const increment = db.prepare(`INSERT INTO pulsefx_link_days (day, openings) VALUES (?, 1)
    ON CONFLICT(day) DO UPDATE SET openings = openings + 1`).bind(day);
  try {
    await increment.run();
  } catch (error) {
    if (!String(error).includes('no such table: pulsefx_link_days')) throw error;
    await db.batch([db.prepare(createTable), increment]);
  }
}

export async function readOpenings(db, now = new Date()) {
  const today = amsterdamDate.format(now);
  await db.prepare(createTable).run();
  return db.prepare(`SELECT
    COALESCE(SUM(openings) FILTER (WHERE day = ?), 0) AS today,
    COALESCE(SUM(openings) FILTER (WHERE day BETWEEN date(?, '-6 days') AND ?), 0) AS lastSevenDays,
    COALESCE(SUM(openings), 0) AS total
    FROM pulsefx_link_days`).bind(today, today, today).first();
}
