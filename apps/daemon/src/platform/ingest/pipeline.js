import { normalizeEventEnvelope, normalizeIngestError } from "./normalizer.js";

function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseGatewayFrame(rawFrame) {
  if (typeof rawFrame === "string") {
    return JSON.parse(rawFrame);
  }

  if (isObjectRecord(rawFrame)) {
    return rawFrame;
  }

  throw new Error("Gateway frame must be JSON text or object");
}

function detectSeqGap(state, nextSeq) {
  if (!Number.isInteger(nextSeq)) {
    return null;
  }

  if (state.lastGatewaySeq === null) {
    state.lastGatewaySeq = nextSeq;
    return null;
  }

  const previous = state.lastGatewaySeq;
  state.lastGatewaySeq = Math.max(previous, nextSeq);

  if (nextSeq > previous + 1) {
    return {
      expected: previous + 1,
      received: nextSeq
    };
  }

  return null;
}

export function createEventIngestionPipeline(options) {
  const repositories = options?.repositories;
  if (!repositories?.events) {
    throw new Error("repositories.events is required");
  }

  const workspaceId = options?.workspaceId ?? "default";
  const nowIso = options?.nowIso ?? (() => new Date().toISOString());
  const onResyncRequired = options?.onResyncRequired;
  const state = {
    lastGatewaySeq: null,
    resyncRequired: false,
    lastGap: null
  };

  function persistEnvelope(envelope) {
    const inserted = repositories.events.insertIfNotExists
      ? repositories.events.insertIfNotExists(envelope)
      : (repositories.events.insert(envelope), true);

    return {
      inserted,
      envelope
    };
  }

  function resolveCorrelations(sessionId, taskId) {
    let safeSessionId = sessionId;
    let safeTaskId = taskId;

    if (typeof safeSessionId === "string" && safeSessionId.length > 0 && repositories?.sessions?.listByWorkspace) {
      const sessions = repositories.sessions.listByWorkspace(workspaceId);
      if (!sessions.some((session) => session.id === safeSessionId)) {
        safeSessionId = null;
      }
    }

    if (typeof safeTaskId === "string" && safeTaskId.length > 0) {
      if (!safeSessionId || !repositories?.tasks?.listBySession) {
        safeTaskId = null;
      } else {
        const tasks = repositories.tasks.listBySession(safeSessionId);
        if (!tasks.some((task) => task.id === safeTaskId)) {
          safeTaskId = null;
        }
      }
    }

    return {
      sessionId: safeSessionId,
      taskId: safeTaskId
    };
  }

  function ingestNormalizedEvent(eventInput) {
    const correlations = resolveCorrelations(eventInput?.sessionId, eventInput?.taskId);
    const envelope = normalizeEventEnvelope({
      ...eventInput,
      sessionId: correlations.sessionId,
      taskId: correlations.taskId,
      workspaceId,
      nowIso: nowIso()
    });

    return {
      ...persistEnvelope(envelope),
      resyncRequired: state.resyncRequired,
      gap: state.lastGap
    };
  }

  function ingestGatewayEvent(frame) {
    if (!isObjectRecord(frame) || frame.type !== "event") {
      throw new Error("Gateway event frame must be an object with type=event");
    }

    const gap = detectSeqGap(state, frame.seq);
    if (gap) {
      state.resyncRequired = true;
      state.lastGap = gap;
      onResyncRequired?.(gap);
    }

    return ingestNormalizedEvent({
      source: "gateway",
      kind: typeof frame.event === "string" && frame.event.length > 0 ? frame.event : "gateway.unknown",
      level: gap ? "warn" : "info",
      sessionId: frame?.payload?.sessionId ?? frame?.payload?.session?.id ?? null,
      taskId: frame?.payload?.taskId ?? frame?.payload?.task?.id ?? null,
      payload: {
        seq: Number.isInteger(frame.seq) ? frame.seq : null,
        event: frame.event,
        payload: frame.payload ?? null
      }
    });
  }

  function persistIngestError(source, reason, detail) {
    const envelope = normalizeIngestError({
      source,
      workspaceId,
      reason,
      detail,
      nowIso: nowIso()
    });

    return {
      ...persistEnvelope(envelope),
      error: new Error(reason),
      resyncRequired: state.resyncRequired,
      gap: state.lastGap
    };
  }

  return {
    ingestGatewayFrame(rawFrame) {
      try {
        const frame = parseGatewayFrame(rawFrame);
        return ingestGatewayEvent(frame);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return persistIngestError("gateway", `Malformed gateway frame: ${reason}`);
      }
    },
    ingestGatewayEvent(frame) {
      try {
        return ingestGatewayEvent(frame);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return persistIngestError("gateway", `Malformed gateway event: ${reason}`);
      }
    },
    ingestDaemonEvent(event) {
      try {
        return ingestNormalizedEvent({
          source: "daemon",
          kind: event?.kind,
          level: event?.level,
          payload: event?.payload,
          sessionId: event?.sessionId,
          taskId: event?.taskId,
          createdAt: event?.createdAt
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return persistIngestError("daemon", `Malformed daemon event: ${reason}`);
      }
    },
    ingestCliEvent(event) {
      try {
        return ingestNormalizedEvent({
          source: "cli",
          kind: event?.kind,
          level: event?.level,
          payload: event?.payload,
          sessionId: event?.sessionId,
          taskId: event?.taskId,
          createdAt: event?.createdAt
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return persistIngestError("cli", `Malformed cli event: ${reason}`);
      }
    },
    triggerResync(reason = "manual") {
      state.resyncRequired = true;
      state.lastGap = {
        expected: state.lastGatewaySeq === null ? null : state.lastGatewaySeq + 1,
        received: null,
        reason
      };
      onResyncRequired?.(state.lastGap);
      return state.lastGap;
    },
    clearResync() {
      state.resyncRequired = false;
      state.lastGap = null;
    },
    getState() {
      return {
        lastGatewaySeq: state.lastGatewaySeq,
        resyncRequired: state.resyncRequired,
        lastGap: state.lastGap
      };
    }
  };
}
