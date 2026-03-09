ALTER TABLE webhooks ADD COLUMN updated_at TEXT;
ALTER TABLE webhooks ADD COLUMN breaker_state TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE webhooks ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhooks ADD COLUMN breaker_next_attempt_at TEXT;

UPDATE webhooks
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE webhook_deliveries ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE webhook_deliveries ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhook_deliveries ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5;
ALTER TABLE webhook_deliveries ADD COLUMN next_attempt_at TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN last_error TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN created_at TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN updated_at TEXT;

UPDATE webhook_deliveries
SET
  next_attempt_at = attempted_at,
  created_at = attempted_at,
  updated_at = attempted_at
WHERE next_attempt_at IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

CREATE INDEX idx_webhooks_workspace_enabled
  ON webhooks(workspace_id, enabled);

CREATE INDEX idx_webhook_deliveries_due
  ON webhook_deliveries(status, next_attempt_at);

CREATE INDEX idx_webhook_deliveries_webhook_updated
  ON webhook_deliveries(webhook_id, updated_at DESC);
