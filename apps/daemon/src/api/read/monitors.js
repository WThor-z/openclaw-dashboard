import { sendJson } from "../../middleware/error-handler.js";
import { redactSecrets } from "./redaction.js";

export function handleWorkspaceMonitorsRead(res, monitorProviders) {
  const snapshot = monitorProviders?.workspaces
    ? monitorProviders.workspaces()
    : { items: [] };

  sendJson(res, 200, redactSecrets(snapshot));
}

export function handleOpenclawMonitorRead(res, monitorProviders) {
  const snapshot = monitorProviders?.openclaw
    ? monitorProviders.openclaw()
    : { snapshot: { status: "not_collected" } };

  sendJson(res, 200, redactSecrets(snapshot));
}
