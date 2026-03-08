import { HttpError } from "./error-handler.js";

export function tokenFromAuthorizationHeader(authorization) {
  if (typeof authorization !== "string") {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function assertAuthorizedRequest(req, adminToken) {
  const suppliedToken = tokenFromAuthorizationHeader(req.headers.authorization);

  if (!adminToken || suppliedToken !== adminToken) {
    throw new HttpError(401, "UNAUTHORIZED", "Bearer token is required");
  }
}

export function assertAuthorizedControlRequest(req, adminToken) {
  assertAuthorizedRequest(req, adminToken);
}

export function assertAuthorizedReadRequest(req, adminToken) {
  assertAuthorizedRequest(req, adminToken);
}
