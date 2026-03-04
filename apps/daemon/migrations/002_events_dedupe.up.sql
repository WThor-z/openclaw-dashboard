ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'daemon';
ALTER TABLE events ADD COLUMN task_id TEXT;
ALTER TABLE events ADD COLUMN dedupe_key TEXT;

CREATE INDEX idx_events_task_created_at
  ON events(task_id, created_at DESC);

CREATE UNIQUE INDEX idx_events_dedupe_key
  ON events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
