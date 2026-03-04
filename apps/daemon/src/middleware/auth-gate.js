import { HttpError } from "./error-handler.js";

function tokenFromAuthorizationHeader(authorization) {
  if (typeof authorization !== "string") {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

export function assertAuthorizedControlRequest(req, adminToken) {
  const suppliedToken = tokenFromAuthorizationHeader(req.headers.authorization);

  if (!adminToken || suppliedToken !== adminToken) {
    throw new HttpError(401, "UNAUTHORIZED", "Bearer token is required");
  }
}
