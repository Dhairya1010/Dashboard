ALTER TABLE settings ADD COLUMN web_push_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (web_push_enabled IN (0, 1));

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_id TEXT REFERENCES reminders(id) ON DELETE SET NULL,
  occurrence_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(reminder_id, occurrence_at)
);
CREATE INDEX notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  delivered_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX notification_deliveries_pending ON notification_deliveries(status, attempts, updated_at);
