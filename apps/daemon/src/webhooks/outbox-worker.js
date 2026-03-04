import { createHmac, randomUUID } from "node:crypto";

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);

function toIso(value) {
  return value.toISOString();
}

function waitFor(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableHttpStatus(statusCode) {
  return statusCode >= 500 || RETRYABLE_STATUS_CODES.has(statusCode);
}

function computeRetryDelayMs({ attemptCount, retryBaseDelayMs, retryMaxDelayMs, jitterRatio, random }) {
  const exponent = Math.max(0, attemptCount - 1);
  const baseDelay = Math.min(retryBaseDelayMs * 2 ** exponent, retryMaxDelayMs);
  const jitterAmount = Math.floor(baseDelay * jitterRatio * random());
  return baseDelay + jitterAmount;
}

function parsePayloadJson(payloadJson) {
  if (typeof payloadJson !== "string" || payloadJson.length === 0) {
    return "{}";
  }

  return payloadJson;
}

async function runWithConcurrency(items, concurrency, callback) {
  if (items.length === 0) {
    return;
  }

  const queue = [...items];
  const workers = [];
  const slotCount = Math.max(1, Math.min(concurrency, items.length));

  for (let index = 0; index < slotCount; index += 1) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const entry = queue.shift();
          await callback(entry);
        }
      })()
    );
  }

  await Promise.all(workers);
}

export function createWebhookOutboxWorker({
  repositories,
  resolveSecretRef,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  random = Math.random,
  pollIntervalMs = 250,
  maxBatchSize = 20,
  concurrency = 2,
  timeoutMs = 5000,
  claimTimeoutMs = 30000,
  retryBaseDelayMs = 1000,
  retryMaxDelayMs = 30000,
  jitterRatio = 0.1,
  maxAttempts = 5,
  breakerFailureThreshold = 3,
  breakerCooldownMs = 30000,
  logger = console
} = {}) {
  if (!repositories?.webhookDeliveries || !repositories?.webhooks) {
    throw new Error("Webhook outbox worker requires repositories.webhookDeliveries and repositories.webhooks");
  }

  if (typeof resolveSecretRef !== "function") {
    throw new Error("Webhook outbox worker requires resolveSecretRef(secretRef)");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Webhook outbox worker requires fetch implementation");
  }

  let running = false;
  let timer = null;
  let inFlight = Promise.resolve();

  function scheduleNextTick() {
    if (!running) {
      return;
    }

    timer = setTimeout(async () => {
      timer = null;
      inFlight = runOnce()
        .catch((error) => {
          logger.error?.("webhook outbox worker runOnce failed", error);
        })
        .finally(() => {
          scheduleNextTick();
        });
      await inFlight;
    }, pollIntervalMs);
  }

  async function deliverSingle(entry) {
    const deliveryId = entry.id;
    const webhookId = entry.webhookId;
    const attemptCount = entry.attemptCount + 1;
    const nowDate = now();
    const nowIso = toIso(nowDate);
    const reclaimBeforeIso = toIso(new Date(nowDate.getTime() - claimTimeoutMs));
    const payloadJson = parsePayloadJson(entry.payloadJson);
    const maxAttemptsForDelivery = Number.isInteger(entry.maxAttempts) ? entry.maxAttempts : maxAttempts;

    const claimed = repositories.webhookDeliveries.claim({
      id: deliveryId,
      updatedAt: nowIso,
      reclaimBeforeAt: reclaimBeforeIso
    });
    if (!claimed) {
      return;
    }

    if (entry.breakerState === "open") {
      repositories.webhooks.updateBreaker({
        id: webhookId,
        breakerState: "half_open",
        consecutiveFailures: entry.consecutiveFailures,
        breakerNextAttemptAt: entry.breakerNextAttemptAt,
        updatedAt: nowIso
      });
    }

    const secretValue = resolveSecretRef(entry.secretRef);
    if (typeof secretValue !== "string" || secretValue.length === 0) {
      repositories.webhookDeliveries.markFailed({
        id: deliveryId,
        attemptCount,
        responseCode: null,
        attemptedAt: nowIso,
        lastError: "missing secret for secret_ref",
        updatedAt: nowIso
      });
      repositories.webhooks.updateBreaker({
        id: webhookId,
        breakerState: "open",
        consecutiveFailures: Math.max(entry.consecutiveFailures + 1, breakerFailureThreshold),
        breakerNextAttemptAt: toIso(new Date(nowDate.getTime() + breakerCooldownMs)),
        updatedAt: nowIso
      });
      return;
    }

    const bodyBytes = Buffer.from(payloadJson, "utf8");
    const signature = createHmac("sha256", secretValue).update(bodyBytes).digest("hex");
    const attemptId = randomUUID();

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let responseCode = null;
    let requestError = null;

    try {
      const response = await fetchImpl(entry.endpointUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-openclaw-signature": `sha256=${signature}`,
          "x-openclaw-attempt-id": attemptId,
          "x-openclaw-timestamp": nowIso
        },
        body: bodyBytes,
        signal: controller.signal
      });
      responseCode = response.status;

      if (response.ok) {
        repositories.webhookDeliveries.markDelivered({
          id: deliveryId,
          attemptCount,
          responseCode,
          attemptedAt: nowIso,
          updatedAt: nowIso
        });
        repositories.webhooks.updateBreaker({
          id: webhookId,
          breakerState: "closed",
          consecutiveFailures: 0,
          breakerNextAttemptAt: null,
          updatedAt: nowIso
        });
        return;
      }

      requestError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      requestError = error;
    } finally {
      clearTimeout(timeout);
    }

    const shouldRetry =
      attemptCount < maxAttemptsForDelivery && (responseCode === null || isRetryableHttpStatus(responseCode));

    const nextConsecutiveFailures = entry.breakerState === "half_open"
      ? breakerFailureThreshold
      : entry.consecutiveFailures + 1;

    let breakerState = "closed";
    let breakerNextAttemptAt = null;
    if (nextConsecutiveFailures >= breakerFailureThreshold) {
      breakerState = "open";
      breakerNextAttemptAt = toIso(new Date(nowDate.getTime() + breakerCooldownMs));
    }

    repositories.webhooks.updateBreaker({
      id: webhookId,
      breakerState,
      consecutiveFailures: nextConsecutiveFailures,
      breakerNextAttemptAt,
      updatedAt: nowIso
    });

    const errorMessage = requestError instanceof Error ? requestError.message : "delivery failed";

    if (shouldRetry) {
      const delayMs = computeRetryDelayMs({
        attemptCount,
        retryBaseDelayMs,
        retryMaxDelayMs,
        jitterRatio,
        random
      });
      repositories.webhookDeliveries.markRetry({
        id: deliveryId,
        attemptCount,
        responseCode,
        attemptedAt: nowIso,
        nextAttemptAt: toIso(new Date(nowDate.getTime() + delayMs)),
        lastError: errorMessage,
        updatedAt: nowIso
      });
      return;
    }

    repositories.webhookDeliveries.markFailed({
      id: deliveryId,
      attemptCount,
      responseCode,
      attemptedAt: nowIso,
      lastError: errorMessage,
      updatedAt: nowIso
    });
  }

  async function runOnce() {
    const nowDate = now();
    const nowIso = toIso(nowDate);
    const reclaimBeforeIso = toIso(new Date(nowDate.getTime() - claimTimeoutMs));
    const due = repositories.webhookDeliveries.listDue(nowIso, reclaimBeforeIso, maxBatchSize);
    await runWithConcurrency(due, concurrency, deliverSingle);
  }

  return {
    async start() {
      if (running) {
        return;
      }
      running = true;
      inFlight = runOnce().catch((error) => {
        logger.error?.("webhook outbox worker start run failed", error);
      });
      await inFlight;
      scheduleNextTick();
    },
    async stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await inFlight;
      await waitFor(0);
    },
    runOnce
  };
}
