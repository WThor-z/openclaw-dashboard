import { sendJson } from "../../../shared/middleware/error-handler.js";
import { redactSecrets } from "../../../shared/redaction.js";

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

export async function handleGatewayMonitorRead(res, monitorProviders) {
  const snapshot = monitorProviders?.gateway
    ? await monitorProviders.gateway()
    : {
      snapshot: {
        status: "not_collected",
        registryExists: false,
        activeAgentCount: 0,
        totalEntryCount: 0,
        agents: []
      }
    };

  sendJson(res, 200, redactSecrets(snapshot));
}
