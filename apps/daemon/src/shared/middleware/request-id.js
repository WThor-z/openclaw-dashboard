import { randomUUID } from "node:crypto";

export function attachRequestId(req, res) {
  const requestId = randomUUID();

  req.context = {
    ...(req.context ?? {}),
    requestId
  };
  res.setHeader("x-request-id", requestId);

  return requestId;
}
