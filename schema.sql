PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'YR Badminton',
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '17:00',
  end_time TEXT NOT NULL DEFAULT '19:00',
  venue TEXT NOT NULL DEFAULT 'Goodminton',
  capacity INTEGER NOT NULL DEFAULT 26 CHECK (capacity > 0),
  note TEXT NOT NULL DEFAULT '',
  is_open INTEGER NOT NULL DEFAULT 0 CHECK (is_open IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(event_date, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON sessions(is_open, event_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_session_slot ON sessions(event_date, start_time, venue);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('YES', 'NO')),
  pax INTEGER NOT NULL DEFAULT 1 CHECK (pax >= 1),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, name_key),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_bookings_session_status ON bookings(session_id, status, updated_at);

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  pax INTEGER NOT NULL DEFAULT 1 CHECK (pax >= 1),
  email TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'PROMOTED', 'CANCELLED')),
  promoted_at TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, name_key),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_waitlist_session_status
  ON waitlist(session_id, status, created_at, id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings(key, value)
VALUES
  ('default_venue', 'Goodminton'),
  ('default_capacity', '26'),
  ('default_start', '17:00'),
  ('default_end', '19:00')
ON CONFLICT(key) DO NOTHING;
