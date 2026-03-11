import { afterEach, describe, expect, it } from "vitest";

import { createEntrypointDaemon } from "../../src/app/index.js";

const ADMIN_TOKEN = "dev-token";
const activeServers = [];
const openDatabases = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server.stop();
  }

  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
});

function endpointFrom(address) {
  return `http://${address.address}:${address.port}`;
}

async function startEntrypointServer() {
  const { daemon, storageDb } = createEntrypointDaemon({
    host: "127.0.0.1",
    port: 0,
    adminToken: ADMIN_TOKEN,
    logger: { info() {}, error() {} }
  });

  await daemon.start();
  activeServers.push(daemon);
  openDatabases.push(storageDb);

  return endpointFrom(daemon.address());
}

async function armWrites(baseUrl) {
  const response = await fetch(`${baseUrl}/api/control/arm`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`
    }
  });

  expect(response.status).toBe(200);
}

describe("daemon startup entrypoint", () => {
  it("creates repositories before handling runtime conversation creation", async () => {
    const baseUrl = await startEntrypointServer();

    await armWrites(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/control/agents/${encodeURIComponent("agent-1")}/conversations/create`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
          "idempotency-key": "bootstrap-conversation-create-1"
        },
        body: JSON.stringify({ workspaceId: "ws-1", title: "Bootstrap works" })
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.conversation).toMatchObject({
      agentId: "agent-1",
      workspaceId: "ws-1",
      title: "Bootstrap works",
      status: "active"
    });
    expect(body.code).not.toBe("CONVERSATION_NOT_FOUND");
  });
});
