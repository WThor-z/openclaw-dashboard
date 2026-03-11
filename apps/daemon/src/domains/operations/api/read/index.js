import { HttpError } from "../../../../shared/middleware/error-handler.js";
import { createAgentRuntimeReadApiRouter } from "../../../agent-runtime/api/read/index.js";
import { handleDailyCostsRead } from "../../read/costs.js";
import { handleEventsRead } from "../../read/events.js";
import {
  handleAgentFileRead,
  handleAgentFilesListRead,
  handleAgentStatusRead,
  handleAgentsListRead
} from "./agents.js";
import {
  handleGatewayMonitorRead,
  handleOpenclawMonitorRead,
  handleWorkspaceMonitorsRead
} from "../../read/monitors.js";
import { handleSessionDetailRead, handleSessionsListRead } from "../../read/sessions.js";
import { handleStatusRead } from "../../read/status.js";
import { handleTaskDetailRead, handleTasksListRead } from "../../read/tasks.js";
import { handleWebhookDeliveriesRead, handleWebhooksSummaryRead } from "./webhooks.js";

function extractSuffix(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  return pathname.slice(prefix.length);
}

function decodePathOrThrow(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "INVALID_FILE_PATH", "File path is invalid");
  }
}

function resolveAgentFilesRoute(pathname) {
  const prefix = "/api/agents/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const suffix = pathname.slice(prefix.length);
  if (!suffix) {
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  }

  const firstSlash = suffix.indexOf("/");
  if (firstSlash <= 0) {
    return null;
  }

  const encodedAgentId = suffix.slice(0, firstSlash);
  const remainder = suffix.slice(firstSlash + 1);
  if (!remainder.startsWith("files")) {
    return null;
  }

  const agentId = decodePathOrThrow(encodedAgentId);
  if (!agentId) {
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  }

  if (remainder === "files") {
    return { agentId, filePath: null };
  }

  if (!remainder.startsWith("files/")) {
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  }

  const encodedFilePath = remainder.slice("files/".length);
  if (!encodedFilePath) {
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  }

  return { agentId, filePath: decodePathOrThrow(encodedFilePath) };
}

export function createReadApiRouter({
  repositories,
  statusProvider,
  monitorProviders,
  openclawRuntimeAdapter
}) {
  const agentRuntimeReadRouter = createAgentRuntimeReadApiRouter({
    repositories,
    openclawRuntimeAdapter
  });

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

      if (pathname === "/api/agents") {
        await handleAgentsListRead(res, monitorProviders);
        return true;
      }

      const agentFilesRoute = resolveAgentFilesRoute(pathname);
      if (agentFilesRoute !== null) {
        if (agentFilesRoute.filePath === null) {
          await handleAgentFilesListRead(res, monitorProviders, agentFilesRoute.agentId);
          return true;
        }

        await handleAgentFileRead(
          res,
          monitorProviders,
          agentFilesRoute.agentId,
          agentFilesRoute.filePath
        );
        return true;
      }

      if (await agentRuntimeReadRouter.handle(req, res, requestUrl)) {
        return true;
      }

      const agentStatusSuffix = extractSuffix(pathname, "/api/agents/");
      if (agentStatusSuffix !== null) {
        if (!agentStatusSuffix.endsWith("/status")) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }

        const agentId = agentStatusSuffix.slice(0, -"/status".length);
        if (!agentId) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }

        await handleAgentStatusRead(res, monitorProviders, decodeURIComponent(agentId));
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
