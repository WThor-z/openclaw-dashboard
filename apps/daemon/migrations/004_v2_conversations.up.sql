CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  state TEXT NOT NULL,
  content TEXT NOT NULL,
  error_code TEXT,
  external_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversations_agent_updated_at
  ON conversations(agent_id, updated_at DESC);

CREATE INDEX idx_conversations_workspace_updated_at
  ON conversations(workspace_id, updated_at DESC);

CREATE INDEX idx_conversation_messages_conversation_created_at
  ON conversation_messages(conversation_id, created_at DESC);

CREATE INDEX idx_conversation_messages_created_at
  ON conversation_messages(created_at DESC);
