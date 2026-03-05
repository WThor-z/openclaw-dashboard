import { HttpError } from "../../middleware/error-handler.js";
import { handleDailyCostsRead } from "./costs.js";
import { handleEventsRead } from "./events.js";
import {
  handleGatewayMonitorRead,
  handleOpenclawMonitorRead,
  handleWorkspaceMonitorsRead
} from "./monitors.js";
import { handleSessionDetailRead, handleSessionsListRead } from "./sessions.js";
import { handleStatusRead } from "./status.js";
import { handleTaskDetailRead, handleTasksListRead } from "./tasks.js";
import { handleWebhookDeliveriesRead, handleWebhooksSummaryRead } from "./webhooks.js";

function extractSuffix(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  return pathname.slice(prefix.length);
}

export function createReadApiRouter({ repositories, statusProvider, monitorProviders }) {
  return {
    async handle(req, res, requestUrl) {
      if (req.method !== "GET") {
        return false;
      }

      const pathname = requestUrl.pathname;
      if (pathname === "/api/status") {
        handleStatusRead(res, statusProvider);
        return true;
      }

      if (pathname === "/api/events") {
        handleEventsRead(res, requestUrl.searchParams, repositories);
        return true;
      }

      if (pathname === "/api/sessions") {
        handleSessionsListRead(res, repositories);
        return true;
      }

      const sessionSuffix = extractSuffix(pathname, "/api/sessions/");
      if (sessionSuffix !== null) {
        if (!sessionSuffix) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }

        handleSessionDetailRead(res, repositories, decodeURIComponent(sessionSuffix));
        return true;
      }

      if (pathname === "/api/tasks") {
        handleTasksListRead(res, repositories);
        return true;
      }

      const taskSuffix = extractSuffix(pathname, "/api/tasks/");
      if (taskSuffix !== null) {
        if (!taskSuffix) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }

        handleTaskDetailRead(res, repositories, decodeURIComponent(taskSuffix));
        return true;
      }

      if (pathname === "/api/costs/daily") {
        handleDailyCostsRead(res, repositories);
        return true;
      }

      if (pathname === "/api/monitors/workspaces") {
        await handleWorkspaceMonitorsRead(res, monitorProviders, requestUrl.searchParams);
        return true;
      }

      if (pathname === "/api/monitors/openclaw") {
        await handleOpenclawMonitorRead(res, monitorProviders);
        return true;
      }

      if (pathname === "/api/monitors/gateway") {
        await handleGatewayMonitorRead(res, monitorProviders);
        return true;
      }

      if (pathname === "/api/webhooks") {
        handleWebhooksSummaryRead(res, requestUrl.searchParams, repositories);
        return true;
      }

      const webhookSuffix = extractSuffix(pathname, "/api/webhooks/");
      if (webhookSuffix !== null) {
        if (!webhookSuffix.endsWith("/deliveries")) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }

        const webhookId = webhookSuffix.slice(0, -"/deliveries".length);
        if (!webhookId) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }

        handleWebhookDeliveriesRead(res, repositories, decodeURIComponent(webhookId));
        return true;
      }

      return false;
    }
  };
}
