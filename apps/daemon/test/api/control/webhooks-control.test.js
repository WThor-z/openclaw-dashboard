import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createDaemonServer } from "../../../src/server/http-server.js";
import { runMigrations } from "../../../src/storage/migrations.js";
import { createStorageRepositories } from "../../../src/storage/repositories.js";

const activeServers = [];
const openDatabases = [];

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
    adminToken: "dev-token",
    logger: { info() {}, error() {} },
    repositories
  });
  await server.start();
  activeServers.push(server);
  return server;
}

async function armWrites(baseUrl) {
  const response = await fetch(`${baseUrl}/api/control/arm`, {
    method: "POST",
    headers: {
      authorization: "Bearer dev-token"
    }
  });
  expect(response.status).toBe(200);
}

describe("control webhook APIs", () => {
  it("creates, updates, disables, and enqueues webhook deliveries", async () => {
    const repositories = createFixtureRepositories();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const createResponse = await fetch(`${baseUrl}/api/control/webhooks/create`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-wh-create-1"
      },
      body: JSON.stringify({
        workspaceId: "ws-1",
        endpointUrl: "https://receiver.test/webhook",
        secretRef: "WH_SECRET"
      })
    });
    const createBody = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createBody.ok).toBe(true);
    expect(typeof createBody.webhookId).toBe("string");

    const updateResponse = await fetch(
      `${baseUrl}/api/control/webhooks/${encodeURIComponent(createBody.webhookId)}/update`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "content-type": "application/json",
          "idempotency-key": "idem-wh-update-1"
        },
        body: JSON.stringify({
          endpointUrl: "https://receiver.test/updated",
          secretRef: "WH_SECRET_UPDATED",
          enabled: true
        })
      }
    );
    const updateBody = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updateBody).toMatchObject({ ok: true, webhookId: createBody.webhookId });

    const enqueueResponse = await fetch(
      `${baseUrl}/api/control/webhooks/${encodeURIComponent(createBody.webhookId)}/enqueue`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "content-type": "application/json",
          "idempotency-key": "idem-wh-enqueue-1"
        },
        body: JSON.stringify({
          payload: { hello: "world" },
          workspaceId: "ws-1"
        })
      }
    );
    const enqueueBody = await enqueueResponse.json();

    expect(enqueueResponse.status).toBe(200);
    expect(enqueueBody).toMatchObject({ ok: true, webhookId: createBody.webhookId });

    const disableResponse = await fetch(
      `${baseUrl}/api/control/webhooks/${encodeURIComponent(createBody.webhookId)}/disable`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "content-type": "application/json",
          "idempotency-key": "idem-wh-disable-1"
        },
        body: JSON.stringify({ workspaceId: "ws-1" })
      }
    );
    const disableBody = await disableResponse.json();

    expect(disableResponse.status).toBe(200);
    expect(disableBody).toMatchObject({ ok: true, webhookId: createBody.webhookId, enabled: false });

    const persisted = repositories.webhooks.getById(createBody.webhookId);
    expect(persisted).toMatchObject({
      endpointUrl: "https://receiver.test/updated",
      secretRef: "WH_SECRET_UPDATED",
      enabled: 0
    });

    const deliveries = repositories.webhookDeliveries.listByWebhook(createBody.webhookId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("pending");
  });

  it("returns WEBHOOK_NOT_FOUND for missing webhook mutations", async () => {
    const repositories = createFixtureRepositories();
    const server = await startServer({ repositories });
    const baseUrl = endpointFrom(server.address());

    await armWrites(baseUrl);

    const response = await fetch(`${baseUrl}/api/control/webhooks/missing-id/disable`, {
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "idem-wh-disable-missing-1"
      },
      body: JSON.stringify({ workspaceId: "ws-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("WEBHOOK_NOT_FOUND");
  });
});
