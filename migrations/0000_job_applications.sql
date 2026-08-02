CREATE TABLE IF NOT EXISTS job_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  subject TEXT,
  from_email TEXT,
  company TEXT,
  position TEXT,
  body TEXT
);
