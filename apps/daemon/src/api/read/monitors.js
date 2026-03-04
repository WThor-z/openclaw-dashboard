import { sendJson } from "../../middleware/error-handler.js";
import { redactSecrets } from "./redaction.js";

export async function handleWorkspaceMonitorsRead(res, monitorProviders, searchParams) {
  const requestedPath = searchParams?.get("path") ?? undefined;
  const snapshot = monitorProviders?.workspaces
    ? await monitorProviders.workspaces({ path: requestedPath })
    : { items: [] };

  sendJson(res, 200, redactSecrets(snapshot));
}

export async function handleOpenclawMonitorRead(res, monitorProviders) {
  const snapshot = monitorProviders?.openclaw
    ? await monitorProviders.openclaw()
    : { snapshot: { status: "not_collected" } };

  sendJson(res, 200, redactSecrets(snapshot));
}
