export const SECRET_PERSISTENCE_BLOCKED = "SECRET_PERSISTENCE_BLOCKED";

const SECRET_KEY_PATTERN = /(token|secret)/i;
const ALLOWED_SECRET_KEY_PATTERN =
  /(secret_ref|token_ref|secret_hash|token_hash|encrypted|ciphertext|salt)/i;

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
    insertSession: db.prepare(
      "INSERT INTO sessions(id, workspace_id, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)"
    ),
    listSessionsByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, status, started_at AS startedAt, ended_at AS endedAt FROM sessions WHERE workspace_id = ? ORDER BY started_at DESC"
    ),
    insertTask: db.prepare(
      "INSERT INTO tasks(id, session_id, workspace_id, state, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ),
    listTasksBySession: db.prepare(
      "SELECT id, session_id AS sessionId, workspace_id AS workspaceId, state, summary, created_at AS createdAt, updated_at AS updatedAt FROM tasks WHERE session_id = ? ORDER BY created_at DESC"
    ),
    insertCostEntry: db.prepare(
      "INSERT INTO cost_entries(id, workspace_id, session_id, task_id, amount_usd, model, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ),
    listCostEntriesByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, session_id AS sessionId, task_id AS taskId, amount_usd AS amountUsd, model, recorded_at AS recordedAt FROM cost_entries WHERE workspace_id = ? ORDER BY recorded_at DESC"
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
      "INSERT INTO webhooks(id, workspace_id, endpoint_url, secret_ref, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ),
    listWebhooksByWorkspace: db.prepare(
      "SELECT id, workspace_id AS workspaceId, endpoint_url AS endpointUrl, secret_ref AS secretRef, enabled, created_at AS createdAt FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC"
    ),
    insertWebhookDelivery: db.prepare(
      "INSERT INTO webhook_deliveries(id, webhook_id, event_id, status, response_code, attempted_at) VALUES (?, ?, ?, ?, ?, ?)"
    ),
    listWebhookDeliveriesByWebhook: db.prepare(
      "SELECT id, webhook_id AS webhookId, event_id AS eventId, status, response_code AS responseCode, attempted_at AS attemptedAt FROM webhook_deliveries WHERE webhook_id = ? ORDER BY attempted_at DESC"
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
      }
    },
    sessions: {
      insert(record) {
        insertRecord(statements.insertSession, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listSessionsByWorkspace.all(workspaceId);
      }
    },
    tasks: {
      insert(record) {
        insertRecord(statements.insertTask, record);
      },
      listBySession(sessionId) {
        return statements.listTasksBySession.all(sessionId);
      }
    },
    costEntries: {
      insert(record) {
        insertRecord(statements.insertCostEntry, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listCostEntriesByWorkspace.all(workspaceId);
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
        insertRecord(statements.insertWebhook, record);
      },
      listByWorkspace(workspaceId) {
        return statements.listWebhooksByWorkspace.all(workspaceId);
      }
    },
    webhookDeliveries: {
      insert(record) {
        insertRecord(statements.insertWebhookDelivery, record);
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
