export const SECRET_PERSISTENCE_BLOCKED = "SECRET_PERSISTENCE_BLOCKED";

const SECRET_KEY_PATTERN = /(token|secret)/i;
const ALLOWED_SECRET_KEY_PATTERN =
  /(secret_ref|token_ref|secretRef|tokenRef|secret_hash|token_hash|encrypted|ciphertext|salt)/i;

/**
 * @extends {Error}
 */
export class StorageError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} keyPath
 */
function assertNoPlaintextSecrets(value, keyPath = "") {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertNoPlaintextSecrets(entry, `${keyPath}[${index}]`);
    }
    return;
  }

  if (!isObjectRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = keyPath.length > 0 ? `${keyPath}.${key}` : key;
    if (
      SECRET_KEY_PATTERN.test(key) &&
      !ALLOWED_SECRET_KEY_PATTERN.test(key) &&
      typeof entry === "string" &&
      entry.trim().length > 0
    ) {
      throw new StorageError(
        `Refusing to persist plaintext secret/token field: ${nextPath}`,
        SECRET_PERSISTENCE_BLOCKED
      );
    }

    assertNoPlaintextSecrets(entry, nextPath);
  }
}

/**
 * @template T
 * @param {import('node:sqlite').StatementSync} statement
 * @param {T} values
 * @returns {void}
 */
function insertRecord(statement, values) {
  assertNoPlaintextSecrets(values);
  statement.run(...Object.values(values));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createStorageRepositories(db) {
  const statements = {
    insertEvent: db.prepare(
      "INSERT INTO events(id, source, session_id, task_id, workspace_id, level, kind, payload_json, created_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    insertEventIfNotExists: db.prepare(
      "INSERT OR IGNORE INTO events(id, source, session_id, task_id, workspace_id, level, kind, payload_json, created_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    listEventsBySession: db.prepare(
      "SELECT id, source, session_id AS sessionId, task_id AS taskId, workspace_id AS workspaceId, level, kind, payload_json AS payloadJson, created_at AS createdAt, dedupe_key AS dedupeKey FROM events WHERE session_id = ? ORDER BY created_at DESC"
    ),
    listTimelineByWorkspace: db.prepare(
      "SELECT id, source, session_id AS sessionId, task_id AS taskId, workspace_id AS workspaceId, level, kind, payload_json AS payloadJson, created_at AS createdAt, dedupe_key AS dedupeKey FROM events WHERE workspace_id = ? ORDER BY created_at DESC"
    ),
    listEventsPage: db.prepare(
      "SELECT id, source, session_id AS sessionId, task_id AS taskId, workspace_id AS workspaceId, level, kind, payload_json AS payloadJson, created_at AS createdAt, dedupe_key AS dedupeKey FROM events ORDER BY created_at DESC, id DESC LIMIT ?"
    ),
    listEventsPageAfterCursor: db.prepare(
      "SELECT id, source, session_id AS sessionId, task_id AS taskId, workspace_id AS workspaceId, level, kind, payload_json AS payloadJson, created_at AS createdAt, dedupe_key AS dedupeKey FROM events WHERE (created_at < ?) OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT ?"
    ),
    getEventByDedupeKey: db.prepare(
      "SELECT id, source, session_id AS sessionId, task_id AS taskId, workspace_id AS workspaceId, level, kind, payload_json AS payloadJson, created_at AS createdAt, dedupe_key AS dedupeKey FROM events WHERE dedupe_key = ? LIMIT 1"
    ),
    insertSession: db.prepare(
      "INSERT INTO sessions(id, workspace_id, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)"
    ),
    listSessionsByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, status, started_at AS startedAt, ended_at AS endedAt FROM sessions WHERE workspace_id = ? ORDER BY started_at DESC"
    ),
    listSessions: db.prepare(
      "SELECT id, workspace_id AS workspaceId, status, started_at AS startedAt, ended_at AS endedAt FROM sessions ORDER BY started_at DESC, id DESC"
    ),
    getSessionById: db.prepare(
      "SELECT id, workspace_id AS workspaceId, status, started_at AS startedAt, ended_at AS endedAt FROM sessions WHERE id = ? LIMIT 1"
    ),
    insertConversation: db.prepare(
      "INSERT INTO conversations(id, agent_id, workspace_id, session_key, title, status, model, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    listConversationsByAgent: db.prepare(
      "SELECT c.id, c.agent_id AS agentId, c.workspace_id AS workspaceId, c.session_key AS sessionKey, c.title, c.status, c.model AS model, c.created_at AS createdAt, c.updated_at AS updatedAt, c.archived_at AS archivedAt, message_stats.last_message_at AS lastMessageAt, coalesce(message_stats.message_count, 0) AS messageCount FROM conversations c LEFT JOIN (SELECT conversation_id, max(created_at) AS last_message_at, count(*) AS message_count FROM conversation_messages GROUP BY conversation_id) message_stats ON message_stats.conversation_id = c.id WHERE c.agent_id = ? ORDER BY c.updated_at DESC, c.id DESC"
    ),
    getConversationById: db.prepare(
      "SELECT c.id, c.agent_id AS agentId, c.workspace_id AS workspaceId, c.session_key AS sessionKey, c.title, c.status, c.model AS model, c.created_at AS createdAt, c.updated_at AS updatedAt, c.archived_at AS archivedAt, message_stats.last_message_at AS lastMessageAt, coalesce(message_stats.message_count, 0) AS messageCount FROM conversations c LEFT JOIN (SELECT conversation_id, max(created_at) AS last_message_at, count(*) AS message_count FROM conversation_messages GROUP BY conversation_id) message_stats ON message_stats.conversation_id = c.id WHERE c.id = ? LIMIT 1"
    ),
    touchConversation: db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?"),
    archiveConversation: db.prepare(
      "UPDATE conversations SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?"
    ),
    setConversationTitle: db.prepare(
      "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?"
    ),
    insertConversationMessage: db.prepare(
      "INSERT INTO conversation_messages(id, conversation_id, role, state, content, error_code, external_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    listConversationMessagesByConversation: db.prepare(
      "SELECT id, conversation_id AS conversationId, role, state, content, error_code AS errorCode, external_message_id AS externalMessageId, created_at AS createdAt, updated_at AS updatedAt FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC"
    ),
    completeAssistantMessage: db.prepare(
      "UPDATE conversation_messages SET state = ?, content = ?, error_code = ?, external_message_id = ?, updated_at = ? WHERE id = ? AND role = 'assistant'"
    ),
    insertTask: db.prepare(
      "INSERT INTO tasks(id, session_id, workspace_id, state, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ),
    listTasksBySession: db.prepare(
      "SELECT id, session_id AS sessionId, workspace_id AS workspaceId, state, summary, created_at AS createdAt, updated_at AS updatedAt FROM tasks WHERE session_id = ? ORDER BY created_at DESC"
    ),
    listTasks: db.prepare(
      "SELECT id, session_id AS sessionId, workspace_id AS workspaceId, state, summary, created_at AS createdAt, updated_at AS updatedAt FROM tasks ORDER BY updated_at DESC, id DESC"
    ),
    getTaskById: db.prepare(
      "SELECT id, session_id AS sessionId, workspace_id AS workspaceId, state, summary, created_at AS createdAt, updated_at AS updatedAt FROM tasks WHERE id = ? LIMIT 1"
    ),
    updateTaskState: db.prepare("UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?"),
    insertCostEntry: db.prepare(
      "INSERT INTO cost_entries(id, workspace_id, session_id, task_id, amount_usd, model, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ),
    listCostEntriesByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, session_id AS sessionId, task_id AS taskId, amount_usd AS amountUsd, model, recorded_at AS recordedAt FROM cost_entries WHERE workspace_id = ? ORDER BY recorded_at DESC"
    ),
    rollupDailyCosts: db.prepare(
      "SELECT substr(recorded_at, 1, 10) AS date, round(sum(amount_usd), 6) AS amountUsd, count(*) AS entryCount FROM cost_entries GROUP BY substr(recorded_at, 1, 10) ORDER BY date DESC"
    ),
    insertConfigSnapshot: db.prepare(
      "INSERT INTO config_snapshots(id, workspace_id, source, snapshot_json, captured_at) VALUES (?, ?, ?, ?, ?)"
    ),
    listConfigSnapshotsByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, source, snapshot_json AS snapshotJson, captured_at AS capturedAt FROM config_snapshots WHERE workspace_id = ? ORDER BY captured_at DESC"
    ),
    insertConfigOperation: db.prepare(
      "INSERT INTO config_operations(id, workspace_id, actor, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ),
    listConfigOperationsByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, actor, operation, payload_json AS payloadJson, created_at AS createdAt FROM config_operations WHERE workspace_id = ? ORDER BY created_at DESC"
    ),
    insertWebhook: db.prepare(
      "INSERT INTO webhooks(id, workspace_id, endpoint_url, secret_ref, enabled, created_at, updated_at, breaker_state, consecutive_failures, breaker_next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    updateWebhook: db.prepare(
      "UPDATE webhooks SET endpoint_url = ?, secret_ref = ?, enabled = ?, updated_at = ? WHERE id = ?"
    ),
    disableWebhook: db.prepare("UPDATE webhooks SET enabled = 0, updated_at = ? WHERE id = ?"),
    updateWebhookBreaker: db.prepare(
      "UPDATE webhooks SET breaker_state = ?, consecutive_failures = ?, breaker_next_attempt_at = ?, updated_at = ? WHERE id = ?"
    ),
    getWebhookById: db.prepare(
      "SELECT id, workspace_id AS workspaceId, endpoint_url AS endpointUrl, secret_ref AS secretRef, enabled, created_at AS createdAt, updated_at AS updatedAt, breaker_state AS breakerState, consecutive_failures AS consecutiveFailures, breaker_next_attempt_at AS breakerNextAttemptAt FROM webhooks WHERE id = ? LIMIT 1"
    ),
    listWebhooksByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, endpoint_url AS endpointUrl, secret_ref AS secretRef, enabled, created_at AS createdAt, updated_at AS updatedAt, breaker_state AS breakerState, consecutive_failures AS consecutiveFailures, breaker_next_attempt_at AS breakerNextAttemptAt FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC"
    ),
    listWebhooksWithDeliverySummaryByWorkspace: db.prepare(
      "SELECT w.id, w.workspace_id AS workspaceId, w.endpoint_url AS endpointUrl, w.secret_ref AS secretRef, w.enabled, w.created_at AS createdAt, w.updated_at AS updatedAt, w.breaker_state AS breakerState, w.consecutive_failures AS consecutiveFailures, w.breaker_next_attempt_at AS breakerNextAttemptAt, d.status AS lastStatus, d.attempt_count AS lastAttemptCount, d.next_attempt_at AS nextAttemptAt, d.response_code AS lastResponseCode, d.attempted_at AS attemptedAt FROM webhooks w LEFT JOIN webhook_deliveries d ON d.id = (SELECT wd.id FROM webhook_deliveries wd WHERE wd.webhook_id = w.id ORDER BY wd.updated_at DESC, wd.id DESC LIMIT 1) WHERE w.workspace_id = ? ORDER BY w.created_at DESC"
    ),
    enqueueWebhookDelivery: db.prepare(
      "INSERT INTO webhook_deliveries(id, webhook_id, event_id, payload_json, status, attempt_count, max_attempts, response_code, attempted_at, next_attempt_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    listDueWebhookDeliveries: db.prepare(
      "SELECT d.id, d.webhook_id AS webhookId, d.event_id AS eventId, d.payload_json AS payloadJson, d.status, d.attempt_count AS attemptCount, d.max_attempts AS maxAttempts, d.response_code AS responseCode, d.attempted_at AS attemptedAt, d.next_attempt_at AS nextAttemptAt, d.last_error AS lastError, d.created_at AS createdAt, d.updated_at AS updatedAt, w.endpoint_url AS endpointUrl, w.secret_ref AS secretRef, w.enabled, w.breaker_state AS breakerState, w.consecutive_failures AS consecutiveFailures, w.breaker_next_attempt_at AS breakerNextAttemptAt FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE w.enabled = 1 AND ((d.status IN ('pending', 'retrying') AND d.next_attempt_at <= ?) OR (d.status = 'in_progress' AND d.updated_at <= ?)) AND (w.breaker_state = 'closed' OR w.breaker_state = 'half_open' OR (w.breaker_state = 'open' AND (w.breaker_next_attempt_at IS NULL OR w.breaker_next_attempt_at <= ?))) ORDER BY d.next_attempt_at ASC, d.id ASC LIMIT ?"
    ),
    claimWebhookDelivery: db.prepare(
      "UPDATE webhook_deliveries SET status = 'in_progress', updated_at = ? WHERE id = ? AND (status IN ('pending', 'retrying') OR (status = 'in_progress' AND updated_at <= ?))"
    ),
    markWebhookDeliveryDelivered: db.prepare(
      "UPDATE webhook_deliveries SET status = 'delivered', attempt_count = ?, response_code = ?, attempted_at = ?, next_attempt_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?"
    ),
    markWebhookDeliveryRetry: db.prepare(
      "UPDATE webhook_deliveries SET status = 'retrying', attempt_count = ?, response_code = ?, attempted_at = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?"
    ),
    markWebhookDeliveryFailed: db.prepare(
      "UPDATE webhook_deliveries SET status = 'failed', attempt_count = ?, response_code = ?, attempted_at = ?, next_attempt_at = NULL, last_error = ?, updated_at = ? WHERE id = ?"
    ),
    listWebhookDeliveriesByWebhook: db.prepare(
      "SELECT id, webhook_id AS webhookId, event_id AS eventId, payload_json AS payloadJson, status, attempt_count AS attemptCount, max_attempts AS maxAttempts, response_code AS responseCode, attempted_at AS attemptedAt, next_attempt_at AS nextAttemptAt, last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt FROM webhook_deliveries WHERE webhook_id = ? ORDER BY updated_at DESC, id DESC"
    ),
    insertWorkspaceMetric: db.prepare(
      "INSERT INTO workspace_metrics(id, workspace_id, metric_key, metric_value, recorded_at) VALUES (?, ?, ?, ?, ?)"
    ),
    listWorkspaceMetricsByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, metric_key AS metricKey, metric_value AS metricValue, recorded_at AS recordedAt FROM workspace_metrics WHERE workspace_id = ? ORDER BY recorded_at DESC"
    ),
    insertSystemMetric: db.prepare(
      "INSERT INTO system_metrics(id, metric_key, metric_value, recorded_at) VALUES (?, ?, ?, ?)"
    ),
    listSystemMetrics: db.prepare(
      "SELECT id, metric_key AS metricKey, metric_value AS metricValue, recorded_at AS recordedAt FROM system_metrics ORDER BY recorded_at DESC LIMIT ?"
    )
  };

  return {
    events: {
      insert(record) {
        const eventRecord = {
          id: record.id,
          source: record?.source ?? "daemon",
          sessionId: record?.sessionId ?? null,
          taskId: record?.taskId ?? null,
          workspaceId: record.workspaceId,
          level: record.level,
          kind: record.kind,
          payloadJson: record.payloadJson,
          createdAt: record.createdAt,
          dedupeKey: record?.dedupeKey ?? null
        };

        assertNoPlaintextSecrets(eventRecord);
        statements.insertEvent.run(
          eventRecord.id,
          eventRecord.source,
          eventRecord.sessionId,
          eventRecord.taskId,
          eventRecord.workspaceId,
          eventRecord.level,
          eventRecord.kind,
          eventRecord.payloadJson,
          eventRecord.createdAt,
          eventRecord.dedupeKey
        );
      },
      insertIfNotExists(record) {
        const eventRecord = {
          id: record.id,
          source: record?.source ?? "daemon",
          sessionId: record?.sessionId ?? null,
          taskId: record?.taskId ?? null,
          workspaceId: record.workspaceId,
          level: record.level,
          kind: record.kind,
          payloadJson: record.payloadJson,
          createdAt: record.createdAt,
          dedupeKey: record?.dedupeKey ?? null
        };

        assertNoPlaintextSecrets(eventRecord);
        const result = statements.insertEventIfNotExists.run(
          eventRecord.id,
          eventRecord.source,
          eventRecord.sessionId,
          eventRecord.taskId,
          eventRecord.workspaceId,
          eventRecord.level,
          eventRecord.kind,
          eventRecord.payloadJson,
          eventRecord.createdAt,
          eventRecord.dedupeKey
        );
        return result.changes > 0;
      },
      listBySession(sessionId) {
        return statements.listEventsBySession.all(sessionId);
      },
      listTimelineByWorkspace(workspaceId) {
        return statements.listTimelineByWorkspace.all(workspaceId);
      },
      listPage({ limit, cursor }) {
        if (!cursor) {
          return statements.listEventsPage.all(limit);
        }

        return statements.listEventsPageAfterCursor.all(
          cursor.createdAt,
          cursor.createdAt,
          cursor.id,
          limit
        );
      },
      getByDedupeKey(dedupeKey) {
        if (typeof dedupeKey !== "string" || dedupeKey.length === 0) {
          return null;
        }

        return statements.getEventByDedupeKey.get(dedupeKey) ?? null;
      }
    },
    sessions: {
      insert(record) {
        insertRecord(statements.insertSession, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listSessionsByWorkspace.all(workspaceId);
      },
      listAll() {
        return statements.listSessions.all();
      },
      getById(id) {
        return statements.getSessionById.get(id) ?? null;
      }
    },
    conversations: {
      insert(record) {
        const conversationRecord = {
          id: record.id,
          agentId: record.agentId,
          workspaceId: record.workspaceId,
          sessionKey: record.sessionKey,
          title: record.title,
          status: record.status,
          model: record.model ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? record.createdAt,
          archivedAt: record.archivedAt ?? null
        };
        insertRecord(statements.insertConversation, conversationRecord);
      },
      listByAgent(agentId) {
        return statements.listConversationsByAgent.all(agentId);
      },
      getById(id) {
        return statements.getConversationById.get(id) ?? null;
      },
      touch({ id, updatedAt }) {
        const result = statements.touchConversation.run(updatedAt, id);
        return result.changes > 0;
      },
      archiveConversation({ id, archivedAt, updatedAt }) {
        const result = statements.archiveConversation.run(archivedAt, updatedAt, id);
        return result.changes > 0;
      },
      setTitle({ id, title, updatedAt }) {
        const result = statements.setConversationTitle.run(title, updatedAt, id);
        return result.changes > 0;
      }
    },
    conversationMessages: {
      insert(record) {
        const messageRecord = {
          id: record.id,
          conversationId: record.conversationId,
          role: record.role,
          state: record.state,
          content: record.content,
          errorCode: record.errorCode ?? null,
          externalMessageId: record.externalMessageId ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? record.createdAt
        };
        insertRecord(statements.insertConversationMessage, messageRecord);
      },
      listByConversation(conversationId) {
        return statements.listConversationMessagesByConversation.all(conversationId);
      },
      appendPendingAssistantMessage(record) {
        const messageRecord = {
          id: record.id,
          conversationId: record.conversationId,
          role: "assistant",
          state: "pending",
          content: record.content,
          errorCode: null,
          externalMessageId: record.externalMessageId ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? record.createdAt
        };
        insertRecord(statements.insertConversationMessage, messageRecord);
        return messageRecord;
      },
      completeAssistantMessage({
        id,
        state = "completed",
        content,
        errorCode = null,
        externalMessageId = null,
        updatedAt
      }) {
        const result = statements.completeAssistantMessage.run(
          state,
          content,
          errorCode,
          externalMessageId,
          updatedAt,
          id
        );
        return result.changes > 0;
      }
    },
    tasks: {
      insert(record) {
        insertRecord(statements.insertTask, record);
      },
      listBySession(sessionId) {
        return statements.listTasksBySession.all(sessionId);
      },
      listAll() {
        return statements.listTasks.all();
      },
      getById(id) {
        return statements.getTaskById.get(id) ?? null;
      },
      updateState({ id, state, updatedAt }) {
        if (typeof id !== "string" || id.length === 0) {
          return false;
        }

        const result = statements.updateTaskState.run(state, updatedAt, id);
        return result.changes > 0;
      }
    },
    costEntries: {
      insert(record) {
        insertRecord(statements.insertCostEntry, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listCostEntriesByWorkspace.all(workspaceId);
      },
      rollupDaily() {
        return statements.rollupDailyCosts.all();
      }
    },
    configSnapshots: {
      insert(record) {
        insertRecord(statements.insertConfigSnapshot, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listConfigSnapshotsByWorkspace.all(workspaceId);
      }
    },
    configOperations: {
      insert(record) {
        insertRecord(statements.insertConfigOperation, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listConfigOperationsByWorkspace.all(workspaceId);
      }
    },
    webhooks: {
      insert(record) {
        assertNoPlaintextSecrets(record);
        const webhookRecord = {
          id: record.id,
          workspaceId: record.workspaceId,
          endpointUrl: record.endpointUrl,
          secretRef: record.secretRef ?? null,
          enabled: record.enabled ?? 1,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? record.createdAt,
          breakerState: record.breakerState ?? "closed",
          consecutiveFailures: record.consecutiveFailures ?? 0,
          breakerNextAttemptAt: record.breakerNextAttemptAt ?? null
        };
        insertRecord(statements.insertWebhook, webhookRecord);
      },
      update(record) {
        const result = statements.updateWebhook.run(
          record.endpointUrl,
          record.secretRef ?? null,
          record.enabled,
          record.updatedAt,
          record.id
        );
        return result.changes > 0;
      },
      disable({ id, updatedAt }) {
        const result = statements.disableWebhook.run(updatedAt, id);
        return result.changes > 0;
      },
      updateBreaker({ id, breakerState, consecutiveFailures, breakerNextAttemptAt, updatedAt }) {
        const result = statements.updateWebhookBreaker.run(
          breakerState,
          consecutiveFailures,
          breakerNextAttemptAt,
          updatedAt,
          id
        );
        return result.changes > 0;
      },
      getById(id) {
        return statements.getWebhookById.get(id) ?? null;
      },
      listByWorkspace(workspaceId) {
        return statements.listWebhooksByWorkspace.all(workspaceId);
      },
      listWithDeliverySummaryByWorkspace(workspaceId) {
        return statements.listWebhooksWithDeliverySummaryByWorkspace.all(workspaceId);
      }
    },
    webhookDeliveries: {
      enqueue(record) {
        const deliveryRecord = {
          id: record.id,
          webhookId: record.webhookId,
          eventId: record.eventId ?? null,
          payloadJson: record.payloadJson,
          status: record.status ?? "pending",
          attemptCount: record.attemptCount ?? 0,
          maxAttempts: record.maxAttempts ?? 5,
          responseCode: record.responseCode ?? null,
          attemptedAt: record.attemptedAt ?? record.createdAt,
          nextAttemptAt: record.nextAttemptAt ?? record.createdAt,
          lastError: record.lastError ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? record.createdAt
        };
        insertRecord(statements.enqueueWebhookDelivery, deliveryRecord);
      },
      insert(record) {
        this.enqueue(record);
      },
      listDue(nowIso, reclaimBeforeIsoOrLimit, maybeLimit) {
        const reclaimBeforeIso = typeof maybeLimit === "number" ? reclaimBeforeIsoOrLimit : nowIso;
        const limit = typeof maybeLimit === "number" ? maybeLimit : reclaimBeforeIsoOrLimit;
        return statements.listDueWebhookDeliveries.all(nowIso, reclaimBeforeIso, nowIso, limit);
      },
      claim({ id, updatedAt, reclaimBeforeAt }) {
        const result = statements.claimWebhookDelivery.run(
          updatedAt,
          id,
          reclaimBeforeAt ?? updatedAt
        );
        return result.changes > 0;
      },
      markDelivered({ id, attemptCount, responseCode, attemptedAt, updatedAt }) {
        const result = statements.markWebhookDeliveryDelivered.run(
          attemptCount,
          responseCode,
          attemptedAt,
          updatedAt,
          id
        );
        return result.changes > 0;
      },
      markRetry({
        id,
        attemptCount,
        responseCode,
        attemptedAt,
        nextAttemptAt,
        lastError,
        updatedAt
      }) {
        const result = statements.markWebhookDeliveryRetry.run(
          attemptCount,
          responseCode,
          attemptedAt,
          nextAttemptAt,
          lastError,
          updatedAt,
          id
        );
        return result.changes > 0;
      },
      markFailed({ id, attemptCount, responseCode, attemptedAt, lastError, updatedAt }) {
        const result = statements.markWebhookDeliveryFailed.run(
          attemptCount,
          responseCode,
          attemptedAt,
          lastError,
          updatedAt,
          id
        );
        return result.changes > 0;
      },
      listByWebhook(webhookId) {
        return statements.listWebhookDeliveriesByWebhook.all(webhookId);
      }
    },
    workspaceMetrics: {
      insert(record) {
        insertRecord(statements.insertWorkspaceMetric, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listWorkspaceMetricsByWorkspace.all(workspaceId);
      }
    },
    systemMetrics: {
      insert(record) {
        insertRecord(statements.insertSystemMetric, record);
      },
      listRecent(limit = 50) {
        return statements.listSystemMetrics.all(limit);
      }
    }
  };
}
