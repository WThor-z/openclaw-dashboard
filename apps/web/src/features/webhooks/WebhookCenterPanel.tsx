import React, { useCallback, useEffect, useMemo, useState } from "react";

type WebhookSummaryItem = {
  id: string;
  endpointUrl: string;
  secretRef: string | null;
  enabled: number | boolean;
  lastStatus?: string | null;
};

type WebhookDeliveryItem = {
  id: string;
  status: string;
  attemptCount: number;
  responseCode: number | null;
  nextAttemptAt: string | null;
  lastError: string | null;
};

type WebhookCenterPanelProps = {
  token: string | null;
};

function toBooleanEnabled(value: number | boolean) {
  return value === true || value === 1;
}

function toDisplayStatus(status: string | null | undefined) {
  if (status === "delivered") {
    return "succeeded";
  }

  if (typeof status === "string" && status.length > 0) {
    return status;
  }

  return "idle";
}

function createIdempotencyKey(seed: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${seed}-${crypto.randomUUID()}`;
  }

  return `${seed}-${Date.now()}`;
}

export function WebhookCenterPanel({ token }: WebhookCenterPanelProps) {
  const [items, setItems] = useState<WebhookSummaryItem[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [endpointUrlInput, setEndpointUrlInput] = useState("");
  const [secretRefInput, setSecretRefInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedDelivery = useMemo(
    () => deliveries.find((entry) => entry.id === selectedDeliveryId) ?? deliveries[0] ?? null,
    [deliveries, selectedDeliveryId]
  );

  const loadWebhooks = useCallback(async () => {
    try {
      const response = await fetch("/api/webhooks?workspaceId=global");
      if (!response.ok) {
        throw new Error("Failed webhook list");
      }

      const body = (await response.json()) as { items?: WebhookSummaryItem[] };
      setItems(body.items ?? []);
    } catch {
      setStatusMessage("Failed to load webhooks");
    }
  }, []);

  const loadDeliveries = useCallback(async (webhookId: string) => {
    try {
      const response = await fetch(`/api/webhooks/${encodeURIComponent(webhookId)}/deliveries`);
      if (!response.ok) {
        throw new Error("Failed webhook deliveries");
      }

      const body = (await response.json()) as { items?: WebhookDeliveryItem[] };
      setDeliveries(body.items ?? []);
      setSelectedWebhookId(webhookId);
      setSelectedDeliveryId((body.items ?? [])[0]?.id ?? null);
    } catch {
      setStatusMessage("Failed to load delivery history");
    }
  }, []);

  const armWrites = useCallback(async () => {
    const response = await fetch("/api/control/arm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token ?? ""}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed write arming");
    }
  }, [token]);

  const mutateWebhookControl = useCallback(
    async (path: string, body: Record<string, unknown>, keySeed: string) => {
      await armWrites();
      const response = await fetch(path, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey(keySeed)
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error("Control mutation failed");
      }

      return response;
    },
    [armWrites, token]
  );

  useEffect(() => {
    void loadWebhooks();
  }, [loadWebhooks]);

  async function onSaveWebhook() {
    const endpointUrl = endpointUrlInput.trim();
    const secretRef = secretRefInput.trim();
    if (!endpointUrl || !secretRef) {
      setStatusMessage("Webhook URL and token alias are required");
      return;
    }

    setIsSaving(true);
    try {
      if (editingWebhookId) {
        await mutateWebhookControl(
          `/api/control/webhooks/${encodeURIComponent(editingWebhookId)}/update`,
          {
            endpointUrl,
            secretRef,
            enabled: true
          },
          "webhook-update"
        );
        setStatusMessage("Webhook updated");
      } else {
        await mutateWebhookControl(
          "/api/control/webhooks/create",
          {
            workspaceId: "global",
            endpointUrl,
            secretRef,
            enabled: true
          },
          "webhook-create"
        );
        setStatusMessage("Webhook created");
      }

      await loadWebhooks();
      setFormOpen(false);
      setEditingWebhookId(null);
      setEndpointUrlInput("");
      setSecretRefInput("");
    } catch {
      setStatusMessage("Webhook save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function onDisableWebhook(webhookId: string) {
    try {
      await mutateWebhookControl(
        `/api/control/webhooks/${encodeURIComponent(webhookId)}/disable`,
        { workspaceId: "global" },
        "webhook-disable"
      );
      setStatusMessage("Webhook disabled");
      await loadWebhooks();
    } catch {
      setStatusMessage("Webhook disable failed");
    }
  }

  async function onSendTestEvent(webhookId: string, optimisticRetry = false) {
    try {
      if (optimisticRetry) {
        setDeliveries((previous) => {
          if (previous.length === 0) {
            return previous;
          }

          return [
            {
              ...previous[0],
              status: "retrying"
            },
            ...previous.slice(1)
          ];
        });
      }

      await mutateWebhookControl(
        `/api/control/webhooks/${encodeURIComponent(webhookId)}/enqueue`,
        {
          workspaceId: "global",
          payload: {
            type: "webhook.test",
            emittedAt: new Date().toISOString()
          }
        },
        optimisticRetry ? "webhook-retry" : "webhook-enqueue"
      );
      setStatusMessage(optimisticRetry ? "Delivery retrying" : "Test event queued");

      await loadWebhooks();
      await loadDeliveries(webhookId);
    } catch {
      setStatusMessage(optimisticRetry ? "Retry failed" : "Webhook test failed");
      await loadDeliveries(webhookId);
    }
  }

  return (
    <section aria-label="Webhook center panel">
      <h2>Webhook Center</h2>
      <button
        data-testid="add-webhook-button"
        onClick={() => {
          setFormOpen(true);
          setEditingWebhookId(null);
          setEndpointUrlInput("");
          setSecretRefInput("");
        }}
        type="button"
      >
        Add webhook
      </button>

      {formOpen ? (
        <div>
          <label htmlFor="webhook-endpoint-input">Endpoint URL</label>
          <input
            id="webhook-endpoint-input"
            data-testid="webhook-endpoint-input"
            type="text"
            value={endpointUrlInput}
            onChange={(event) => setEndpointUrlInput(event.target.value)}
          />

          <label htmlFor="webhook-secret-ref-input">Token alias</label>
          <input
            id="webhook-secret-ref-input"
            data-testid="webhook-secret-ref-input"
            type="text"
            value={secretRefInput}
            onChange={(event) => setSecretRefInput(event.target.value)}
          />

          <button data-testid="save-webhook-button" disabled={isSaving} onClick={onSaveWebhook} type="button">
            {isSaving ? "Saving..." : editingWebhookId ? "Update webhook" : "Save webhook"}
          </button>
        </div>
      ) : null}

      <ul>
        {items.map((item) => (
          <li data-testid="webhook-card" key={item.id}>
            <strong>{item.endpointUrl}</strong> ({toBooleanEnabled(item.enabled) ? "enabled" : "disabled"})
            <div>
              Secret alias: <span data-testid="redaction-indicator">[REDACTED]</span> ({item.secretRef ?? "unset"})
            </div>
            <div>Latest status: {toDisplayStatus(item.lastStatus)}</div>
            <button
              onClick={() => {
                setFormOpen(true);
                setEditingWebhookId(item.id);
                setEndpointUrlInput(item.endpointUrl);
                setSecretRefInput(item.secretRef ?? "");
              }}
              type="button"
            >
              Update
            </button>
            <button onClick={() => void onDisableWebhook(item.id)} type="button">
              Disable
            </button>
            <button
              data-testid="send-test-event-button"
              onClick={() => void onSendTestEvent(item.id)}
              type="button"
            >
              Send test event
            </button>
            <button onClick={() => void loadDeliveries(item.id)} type="button">
              View deliveries
            </button>
          </li>
        ))}
      </ul>

      {selectedWebhookId ? (
        <div>
          <h3>Delivery history ({selectedWebhookId})</h3>
          <ul>
            {deliveries.map((delivery) => (
              <li
                data-testid="delivery-row"
                key={delivery.id}
                onClick={() => setSelectedDeliveryId(delivery.id)}
              >
                #{delivery.id} - {toDisplayStatus(delivery.status)} (attempt {delivery.attemptCount})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedDelivery ? (
        <div aria-modal="true" data-testid="delivery-detail-drawer" role="dialog">
          <p>Delivery {selectedDelivery.id}</p>
          <p>Status: {toDisplayStatus(selectedDelivery.status)}</p>
          <p>Response code: {selectedDelivery.responseCode ?? "none"}</p>
          <p>Next attempt: {selectedDelivery.nextAttemptAt ?? "none"}</p>
          <p data-testid="delivery-error-reason">Error reason: {selectedDelivery.lastError ?? "none"}</p>
          {selectedWebhookId && toDisplayStatus(selectedDelivery.status) === "failed" ? (
            <button
              data-testid="retry-delivery-button"
              onClick={() => void onSendTestEvent(selectedWebhookId, true)}
              type="button"
            >
              Retry delivery
            </button>
          ) : null}
        </div>
      ) : null}

      {statusMessage ? <p data-testid="webhook-status-message">{statusMessage}</p> : null}
    </section>
  );
}
