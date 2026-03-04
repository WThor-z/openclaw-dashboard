import { HttpError, sendJson } from "../../middleware/error-handler.js";

export function handleSessionsListRead(res, repositories) {
  const items = repositories?.sessions?.listAll ? repositories.sessions.listAll() : [];
  sendJson(res, 200, { items });
}

export function handleSessionDetailRead(res, repositories, sessionId) {
  const session = repositories?.sessions?.getById
    ? repositories.sessions.getById(sessionId)
    : null;

  if (!session) {
    throw new HttpError(404, "SESSION_NOT_FOUND", "Session not found");
  }

  sendJson(res, 200, { session });
}
