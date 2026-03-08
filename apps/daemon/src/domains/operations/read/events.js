import { Buffer } from "node:buffer";

import { HttpError, sendJson } from "../../../shared/middleware/error-handler.js";
import { parseAndRedactJson } from "../../../shared/redaction.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

function parseLimit(searchParams) {
  const rawLimit = searchParams.get("limit");
  if (rawLimit === null) {
    return DEFAULT_LIMIT;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
    throw new HttpError(
      400,
      "LIMIT_OUT_OF_RANGE",
      `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`
    );
  }

  return limit;
}

function decodeCursor(rawCursor) {
  if (!rawCursor) {
    return null;
  }

  let parsed;
  try {
    const decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
    parsed = JSON.parse(decoded);
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Invalid cursor");
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.id !== "string" ||
    parsed.createdAt.length === 0 ||
    parsed.id.length === 0
  ) {
    throw new HttpError(400, "INVALID_CURSOR", "Invalid cursor");
  }

  return {
    createdAt: parsed.createdAt,
    id: parsed.id
  };
}

function encodeCursor(eventRecord) {
  return Buffer.from(
    JSON.stringify({
      createdAt: eventRecord.createdAt,
      id: eventRecord.id
    }),
    "utf8"
  ).toString("base64url");
}

function toEventItem(record) {
  return {
    id: record.id,
    source: record.source,
    sessionId: record.sessionId,
    taskId: record.taskId,
    workspaceId: record.workspaceId,
    level: record.level,
    kind: record.kind,
    payload: parseAndRedactJson(record.payloadJson),
    createdAt: record.createdAt,
    dedupeKey: record.dedupeKey
  };
}

export function handleEventsRead(res, searchParams, repositories) {
  const limit = parseLimit(searchParams);
  const cursor = decodeCursor(searchParams.get("cursor"));
  const rows = repositories?.events?.listPage
    ? repositories.events.listPage({ limit: limit + 1, cursor })
    : [];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null;

  sendJson(res, 200, {
    items: pageRows.map(toEventItem),
    nextCursor,
    limit
  });
}
