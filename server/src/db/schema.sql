-- First version of the schema. Tables for M3-M8 are added in their own pull requests.

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK (role IN ('parent', 'specialist', 'child')),
  specialist_type TEXT
);

-- A child user and the parent who owns their data
CREATE TABLE IF NOT EXISTS children (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Specialists the parent has linked to a child (M2)
CREATE TABLE IF NOT EXISTS specialist_links (
  child_id      INTEGER NOT NULL REFERENCES children(user_id) ON DELETE CASCADE,
  specialist_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (child_id, specialist_id)
);
