import { sendJson } from "../../../shared/middleware/error-handler.js";

export function handleStatusRead(res, statusProvider) {
  const provided = statusProvider ? statusProvider() : null;

  sendJson(res, 200, {
    ok: true,
    connection: provided?.connection ?? "local",
    status: provided?.status ?? "idle",
    ...provided
  });
}
