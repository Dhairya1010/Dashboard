ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

CREATE TABLE local_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations >= 100000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE local_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX local_sessions_expires ON local_sessions(expires_at);
CREATE INDEX local_sessions_user ON local_sessions(user_id);
