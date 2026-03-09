import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createWebhookOutboxWorker } from "../../src/platform/webhooks/outbox-worker.js";
import { runMigrations } from "../../src/platform/storage/migrations.js";
import { createStorageRepositories } from "../../src/platform/storage/repositories.js";

const openDatabases = [];
const activeServers = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
});

function createFixtureRepositories() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  openDatabases.push(db);
  runMigrations(db, { direction: "up" });
  return createStorageRepositories(db);
}

async function startReceiver(statuses, seenRequests) {
  const queue = [...statuses];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }

    seenRequests.push({
      url: req.url,
      method: req.method,
      body: Buffer.concat(chunks),
      signature: req.headers["x-openclaw-signature"],
      timestamp: req.headers["x-openclaw-timestamp"]
    });

    const status = queue.length > 0 ? queue.shift() : 200;
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: status >= 200 && status < 300 }));
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  activeServers.push(server);

  const address = server.address();
  return `http://${address.address}:${address.port}/receiver`;
}

describe("webhook outbox worker", () => {
  it("signs and delivers due webhook payloads", async () => {
    const repositories = createFixtureRepositories();
    const nowIso = "2026-03-05T00:00:00.000Z";
    const seenRequests = [];
    const endpointUrl = await startReceiver([200], seenRequests);

    repositories.webhooks.insert({
      id: "wh-1",
      workspaceId: "ws-1",
      endpointUrl,
      secretRef: "WH_SECRET",
      enabled: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    repositories.webhookDeliveries.enqueue({
      id: "delivery-1",
      webhookId: "wh-1",
      payloadJson: JSON.stringify({ event: "daemon.started" }),
      status: "pending",
      maxAttempts: 4,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const worker = createWebhookOutboxWorker({
      repositories,
      resolveSecretRef(secretRef) {
        return secretRef === "WH_SECRET" ? "super-secret" : null;
      },
      now() {
        return new Date(nowIso);
      },
      random() {
        return 0;
      },
      endpointPolicy: {
        allowHttp: true,
        allowPrivateAddresses: true
      },
      timeoutMs: 2000,
      logger: { info() {}, error() {} }
    });

    await worker.runOnce();

    const history = repositories.webhookDeliveries.listByWebhook("wh-1");
    expect(history[0]).toMatchObject({
      status: "delivered",
      attemptCount: 1,
      responseCode: 200,
      nextAttemptAt: null
    });

    expect(seenRequests).toHaveLength(1);
    const expectedSignature = `sha256=${createHmac("sha256", "super-secret").update(seenRequests[0].body).digest("hex")}`;
    expect(seenRequests[0].signature).toBe(expectedSignature);
  });

  it("applies retry backoff and breaker transitions", async () => {
    const repositories = createFixtureRepositories();
    const seenRequests = [];
    const endpointUrl = await startReceiver([500, 500, 200], seenRequests);
    let nowMs = Date.parse("2026-03-05T01:00:00.000Z");

    repositories.webhooks.insert({
      id: "wh-2",
      workspaceId: "ws-1",
      endpointUrl,
      secretRef: "WH_SECRET",
      enabled: 1,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString()
    });
    repositories.webhookDeliveries.enqueue({
      id: "delivery-2",
      webhookId: "wh-2",
      payloadJson: JSON.stringify({ event: "task.updated" }),
      status: "pending",
      maxAttempts: 5,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString()
    });

    const worker = createWebhookOutboxWorker({
      repositories,
      resolveSecretRef() {
        return "super-secret";
      },
      now() {
        return new Date(nowMs);
      },
      random() {
        return 0;
      },
      endpointPolicy: {
        allowHttp: true,
        allowPrivateAddresses: true
      },
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 8000,
      jitterRatio: 0,
      breakerFailureThreshold: 2,
      breakerCooldownMs: 500,
      timeoutMs: 2000,
      logger: { info() {}, error() {} }
    });

    await worker.runOnce();
    let webhook = repositories.webhooks.getById("wh-2");
    expect(webhook.breakerState).toBe("closed");
    expect(webhook.consecutiveFailures).toBe(1);

    nowMs += 1000;
    await worker.runOnce();
    webhook = repositories.webhooks.getById("wh-2");
    expect(webhook.breakerState).toBe("open");
    expect(webhook.consecutiveFailures).toBe(2);

    nowMs += 200;
    await worker.runOnce();
    expect(seenRequests).toHaveLength(2);

    nowMs += 2200;
    await worker.runOnce();
    webhook = repositories.webhooks.getById("wh-2");
    expect(webhook.breakerState).toBe("closed");
    expect(webhook.consecutiveFailures).toBe(0);

    const history = repositories.webhookDeliveries.listByWebhook("wh-2");
    expect(history[0]).toMatchObject({
      status: "delivered",
      attemptCount: 3,
      responseCode: 200
    });
  });

  it("reclaims stale in-progress deliveries", async () => {
    const repositories = createFixtureRepositories();
    const seenRequests = [];
    let nowMs = Date.parse("2026-03-05T03:00:00.000Z");
    const endpointUrl = await startReceiver([200], seenRequests);

    repositories.webhooks.insert({
      id: "wh-3",
      workspaceId: "ws-1",
      endpointUrl,
      secretRef: "WH_SECRET",
      enabled: 1,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString()
    });
    repositories.webhookDeliveries.enqueue({
      id: "delivery-3",
      webhookId: "wh-3",
      payloadJson: JSON.stringify({ event: "reclaim" }),
      status: "pending",
      maxAttempts: 3,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString()
    });

    repositories.webhookDeliveries.claim({
      id: "delivery-3",
      updatedAt: new Date(nowMs).toISOString()
    });

    nowMs += 2000;
    const worker = createWebhookOutboxWorker({
      repositories,
      resolveSecretRef() {
        return "super-secret";
      },
      now() {
        return new Date(nowMs);
      },
      random() {
        return 0;
      },
      endpointPolicy: {
        allowHttp: true,
        allowPrivateAddresses: true
      },
      claimTimeoutMs: 1000,
      timeoutMs: 2000,
      logger: { info() {}, error() {} }
    });

    await worker.runOnce();

    expect(seenRequests).toHaveLength(1);
    const history = repositories.webhookDeliveries.listByWebhook("wh-3");
    expect(history[0]).toMatchObject({
      status: "delivered",
      attemptCount: 1,
      responseCode: 200
    });
  });

  it("fails fast for blocked endpoint addresses", async () => {
    const repositories = createFixtureRepositories();
    const nowIso = "2026-03-05T04:00:00.000Z";

    repositories.webhooks.insert({
      id: "wh-4",
      workspaceId: "ws-1",
      endpointUrl: "https://169.254.169.254/latest/meta-data",
      secretRef: "WH_SECRET",
      enabled: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    repositories.webhookDeliveries.enqueue({
      id: "delivery-4",
      webhookId: "wh-4",
      payloadJson: JSON.stringify({ event: "blocked" }),
      status: "pending",
      maxAttempts: 3,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const worker = createWebhookOutboxWorker({
      repositories,
      resolveSecretRef() {
        return "super-secret";
      },
      now() {
        return new Date(nowIso);
      },
      random() {
        return 0;
      },
      timeoutMs: 2000,
      logger: { info() {}, error() {} }
    });

    await worker.runOnce();

    const history = repositories.webhookDeliveries.listByWebhook("wh-4");
    expect(history[0]).toMatchObject({
      status: "failed",
      attemptCount: 1,
      responseCode: null
    });
    expect(history[0].lastError).toContain("not allowed");
  });

  it("does not follow webhook redirects", async () => {
    const repositories = createFixtureRepositories();
    const nowIso = "2026-03-05T05:00:00.000Z";
    const seenRequests = [];
    const redirectServer = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      seenRequests.push(Buffer.concat(chunks).toString("utf8"));

      res.statusCode = 302;
      res.setHeader("location", "https://169.254.169.254/latest/meta-data");
      res.end("redirect");
    });

    await new Promise((resolve) => {
      redirectServer.listen(0, "127.0.0.1", resolve);
    });
    activeServers.push(redirectServer);

    const redirectAddress = redirectServer.address();
    const endpointUrl = `http://${redirectAddress.address}:${redirectAddress.port}/redirect`;

    repositories.webhooks.insert({
      id: "wh-5",
      workspaceId: "ws-1",
      endpointUrl,
      secretRef: "WH_SECRET",
      enabled: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    repositories.webhookDeliveries.enqueue({
      id: "delivery-5",
      webhookId: "wh-5",
      payloadJson: JSON.stringify({ event: "redirect" }),
      status: "pending",
      maxAttempts: 2,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const worker = createWebhookOutboxWorker({
      repositories,
      resolveSecretRef() {
        return "super-secret";
      },
      now() {
        return new Date(nowIso);
      },
      random() {
        return 0;
      },
      endpointPolicy: {
        allowHttp: true,
        allowPrivateAddresses: true
      },
      timeoutMs: 2000,
      logger: { info() {}, error() {} }
    });

    await worker.runOnce();

    expect(seenRequests).toHaveLength(1);
    const history = repositories.webhookDeliveries.listByWebhook("wh-5");
    expect(history[0]).toMatchObject({
      status: "failed",
      responseCode: 302
    });
  });
});
