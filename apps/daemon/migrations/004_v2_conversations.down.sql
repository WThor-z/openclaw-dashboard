DROP INDEX IF EXISTS idx_conversation_messages_created_at;
DROP INDEX IF EXISTS idx_conversation_messages_conversation_created_at;
DROP INDEX IF EXISTS idx_conversations_workspace_updated_at;
DROP INDEX IF EXISTS idx_conversations_agent_updated_at;

DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversations;
