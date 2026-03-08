import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonServer } from "../../../src/app/http-server.js";
import { runMigrations } from "../../../src/platform/storage/migrations.js";
import { createStorageRepositories } from "../../../src/platform/storage/repositories.js";

const activeServers = [];
const openDatabases = [];
const READ_TOKEN = "dev-token";

afterEach(async () => {
  while (activeServers.length > 0) {
    const entry = activeServers.pop();
    await entry.stop();
  }

  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
});

function endpointFrom(address) {
  return `http://${address.address}:${address.port}`;
}

function createFixtureRepositories() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  openDatabases.push(db);
  runMigrations(db, { direction: "up" });
  return createStorageRepositories(db);
}

async function startServer({ repositories } = {}) {
  const server = createDaemonServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: READ_TOKEN,
    logger: { info() {}, error() {} },
    repositories,
    webhookWorker: {
      start: async () => {},
      stop: async () => {}
    }
  });
  await server.start();
  activeServers.push(server);
  return server;
}

function authorizedGet(url) {
  return fetch(url, {
    headers: {
      authorization: `Bearer ${READ_TOKEN}`
    }
  });
}

describe("read webhook APIs", () => {
  it("returns webhook summary and per-webhook delivery history", async () => {
    const repositories = createFixtureRepositories();
    const nowIso = "2026-03-05T02:00:00.000Z";
    repositories.webhooks.insert({
      id: "wh-1",
      workspaceId: "ws-1",
      endpointUrl: "https://receiver.test/webhook",
      secretRef: "WH_SECRET",
      enabled: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    repositories.webhookDeliveries.enqueue({
      id: "delivery-1",
      webhookId: "wh-1",
      eventId: null,
      payloadJson: JSON.stringify({ event: "task.updated" }),
      status: "retrying",
      attemptCount: 2,
      maxAttempts: 5,
      responseCode: 503,
      attemptedAt: nowIso,
      nextAttemptAt: "2026-03-05T02:00:10.000Z",
      lastError: "upstream unavailable",
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    const summaryResponse = await authorizedGet(`${baseUrl}/api/webhooks?workspaceId=ws-1`);
    const summaryBody = await summaryResponse.json();

    expect(summaryResponse.status).toBe(200);
    expect(summaryBody.items).toHaveLength(1);
    expect(summaryBody.items[0]).toMatchObject({
      id: "wh-1",
      hasSecretRef: true,
      lastStatus: "retrying",
      lastAttemptCount: 2,
      nextAttemptAt: "2026-03-05T02:00:10.000Z"
    });
    expect(summaryBody.items[0].secretRef).toBeUndefined();

    const historyResponse = await authorizedGet(
      `${baseUrl}/api/webhooks/${encodeURIComponent("wh-1")}/deliveries`
    );
    const historyBody = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(historyBody.webhook.secretRef).toBeUndefined();
    expect(historyBody.webhook.hasSecretRef).toBe(true);
    expect(historyBody.items).toHaveLength(1);
    expect(historyBody.items[0]).toMatchObject({
      id: "delivery-1",
      status: "retrying",
      attemptCount: 2,
      responseCode: 503,
      nextAttemptAt: "2026-03-05T02:00:10.000Z"
    });
  });
});
