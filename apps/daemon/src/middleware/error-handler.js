export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);

  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

export function sendError(res, error, requestId) {
  const knownError =
    error instanceof HttpError
      ? error
      : new HttpError(500, "INTERNAL_ERROR", "Internal server error");

  sendJson(res, knownError.status, {
    requestId,
    code: knownError.code,
    message: knownError.message
  });
}
