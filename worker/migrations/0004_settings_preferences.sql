ALTER TABLE settings ADD COLUMN week_starts_on INTEGER NOT NULL DEFAULT 1
  CHECK (week_starts_on IN (0, 1));
ALTER TABLE settings ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (default_task_priority IN ('low', 'medium', 'high'));

