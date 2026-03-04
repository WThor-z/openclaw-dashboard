import { HttpError, sendJson } from "../../middleware/error-handler.js";

function parseWorkspaceId(searchParams) {
  const raw = searchParams.get("workspaceId");
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }

  return "global";
}

export function handleWebhooksSummaryRead(res, searchParams, repositories) {
  const workspaceId = parseWorkspaceId(searchParams);
  const items = repositories?.webhooks?.listWithDeliverySummaryByWorkspace
    ? repositories.webhooks.listWithDeliverySummaryByWorkspace(workspaceId)
    : [];
  sendJson(res, 200, {
    workspaceId,
    items
  });
}

export function handleWebhookDeliveriesRead(res, repositories, webhookId) {
  const webhook = repositories?.webhooks?.getById
    ? repositories.webhooks.getById(webhookId)
    : null;
  if (!webhook) {
    throw new HttpError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
  }

  const items = repositories?.webhookDeliveries?.listByWebhook
    ? repositories.webhookDeliveries.listByWebhook(webhookId)
    : [];
  sendJson(res, 200, {
    webhook,
    items
  });
}
