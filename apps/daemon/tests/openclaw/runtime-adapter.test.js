import { describe, expect, it, vi } from "vitest";

import { createOpenclawRuntimeAdapter } from "../../src/platform/openclaw/runtime-adapter.js";

function createRunnerResult(stdout, exitCode = 0, stderr = "") {
  return { exitCode, stdout, stderr };
}

describe("openclaw runtime adapter", () => {
  it("sends messaging requests to /v1/responses with required OpenClaw headers", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      openclawApiBaseUrl: "http://127.0.0.1:11478"
    });

    const response = await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    expect(response).toMatchObject({ id: "resp-1", outputText: "hello" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11478/v1/responses");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      "x-openclaw-agent-id": "agent-main",
      "x-openclaw-session-key": "session-001"
    });
  });

  it("reads base URL from OPENCLAW_API_BASE_URL env var when options not provided", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      env: { OPENCLAW_API_BASE_URL: "http://127.0.0.1:18789" }
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:18789/v1/responses");
  });

  it("uses options.openclawApiBaseUrl over env var", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      openclawApiBaseUrl: "http://127.0.0.1:99999",
      env: { OPENCLAW_API_BASE_URL: "http://127.0.0.1:18789" }
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:99999/v1/responses");
  });

  it("falls back to default when neither options nor env var provided", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      env: {}
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11478/v1/responses");
  });

  it("sends Authorization header with Bearer token when OPENCLAW_GATEWAY_TOKEN env var is set", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      env: { OPENCLAW_GATEWAY_TOKEN: "test-token-123" }
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      "x-openclaw-agent-id": "agent-main",
      "x-openclaw-session-key": "session-001",
      authorization: "Bearer test-token-123"
    });
  });

  it("uses options.openclawGatewayToken over env var for Authorization header", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      openclawGatewayToken: "options-token",
      env: { OPENCLAW_GATEWAY_TOKEN: "env-token" }
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers).toMatchObject({
      authorization: "Bearer options-token"
    });
  });

  it("does not include Authorization header when no gateway credential is provided", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      env: {}
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      "x-openclaw-agent-id": "agent-main",
      "x-openclaw-session-key": "session-001"
    });
    expect(requestInit.headers.authorization).toBeUndefined();
  });

  it("falls back to OPENCLAW_GATEWAY_PASSWORD env var when OPENCLAW_GATEWAY_TOKEN is not set", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      env: { OPENCLAW_GATEWAY_PASSWORD: "password-credential-456" }
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      "x-openclaw-agent-id": "agent-main",
      "x-openclaw-session-key": "session-001",
      authorization: "Bearer password-credential-456"
    });
  });

  it("prefers OPENCLAW_GATEWAY_TOKEN over OPENCLAW_GATEWAY_PASSWORD when both are set", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "resp-1", output_text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runCommand = vi.fn(async () => createRunnerResult('{"ok":true}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand,
      env: {
        OPENCLAW_GATEWAY_TOKEN: "token-credential",
        OPENCLAW_GATEWAY_PASSWORD: "password-credential"
      }
    });

    await adapter.messaging.send({
      agentId: "agent-main",
      sessionKey: "session-001",
      content: "hello"
    });

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers.authorization).toBe("Bearer token-credential");
  });

  it("wraps cron operations as non-interactive CLI calls", async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce(createRunnerResult('{"items":[]}'))
      .mockResolvedValueOnce(createRunnerResult('{"id":"job-1"}'))
      .mockResolvedValueOnce(createRunnerResult('{"ok":true}'))
      .mockResolvedValueOnce(createRunnerResult('{"runId":"run-1"}'))
      .mockResolvedValueOnce(createRunnerResult('{"ok":true}'))
      .mockResolvedValueOnce(createRunnerResult('{"items":[]}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand
    });

    await adapter.cron.list({ agentId: "agent-main" });
    await adapter.cron.add({
      agentId: "agent-main",
      label: "Daily sync",
      cron: "0 9 * * *",
      prompt: "Sync now",
      enabled: true
    });
    await adapter.cron.update({
      agentId: "agent-main",
      scheduleId: "job-1",
      label: "Daily sync",
      cron: "0 10 * * *",
      prompt: "Sync now",
      enabled: false
    });
    await adapter.cron.run({ agentId: "agent-main", scheduleId: "job-1" });
    await adapter.cron.remove({ agentId: "agent-main", scheduleId: "job-1" });
    await adapter.cron.runs({ agentId: "agent-main", scheduleId: "job-1", limit: 5 });

    expect(runCommand).toHaveBeenCalledTimes(6);
    for (const [command] of runCommand.mock.calls) {
      expect(command[0]).toBe("openclaw");
      expect(command).toContain("--non-interactive");
    }
    expect(runCommand.mock.calls[1][0]).toContain("add");
    expect(runCommand.mock.calls[5][0]).toContain("runs");
  });

  it("validates config before applying heartbeat updates", async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce(createRunnerResult('{"ok":true}'))
      .mockResolvedValueOnce(createRunnerResult('{"agentId":"agent-main"}'));
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand,
      resolvePreferredStateDir: async () => "/tmp/.openclaw",
      resolveConfigCandidates: () => ["/tmp/.openclaw/openclaw.json"]
    });

    await adapter.heartbeat.configure({
      agentId: "agent-main",
      workspaceId: "ws-1",
      every: "*/5 * * * *",
      session: "session-001",
      lightContext: true,
      prompt: "Ping"
    });

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand.mock.calls[0][0]).toEqual([
      "openclaw",
      "config",
      "validate",
      "--non-interactive"
    ]);
    expect(runCommand.mock.calls[1][0]).toEqual(
      expect.arrayContaining(["openclaw", "heartbeat", "set", "--agent", "agent-main"])
    );
    expect(runCommand.mock.calls[1][0]).toEqual(
      expect.arrayContaining([
        "--every",
        "*/5 * * * *",
        "--session",
        "session-001",
        "--light-context",
        "true"
      ])
    );
    expect(runCommand.mock.calls[1][0]).toContain("--non-interactive");
  });

  it("rejects memory config updates that contain raw API key input", async () => {
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand: vi.fn()
    });

    await expect(
      adapter.memory.configure({
        agentId: "agent-main",
        workspaceId: "ws-1",
        scope: "agent",
        provider: "openai",
        secretRef: "secret://runtime/openai",
        apiKey: "sk-raw-should-not-pass"
      })
    ).rejects.toMatchObject({
      code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
      message: expect.any(String)
    });
  });

  it("rejects memory config with non-secretRef format (e.g., raw token)", async () => {
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand: vi.fn()
    });

    // Test invalid secretRef (not starting with secret://)
    await expect(
      adapter.memory.configure({
        agentId: "agent-main",
        workspaceId: "ws-1",
        scope: "agent",
        provider: "openai",
        secretRef: "sk-some-api-key-that-looks-like-token"
      })
    ).rejects.toMatchObject({
      code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
      message: expect.stringContaining("secret://")
    });

    // Test another invalid format
    await expect(
      adapter.memory.configure({
        agentId: "agent-main",
        workspaceId: "ws-1",
        scope: "agent",
        provider: "openai",
        secretRef: "plain-string-value"
      })
    ).rejects.toMatchObject({
      code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
      message: expect.stringContaining("secret://")
    });
  });

  it("rejects memory config with invalid apiKeyRef format", async () => {
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand: vi.fn()
    });

    await expect(
      adapter.memory.configure({
        agentId: "agent-main",
        workspaceId: "ws-1",
        scope: "agent",
        provider: "openai",
        secretRef: "secret://runtime/openai",
        apiKeyRef: "not-a-secret-ref-format"
      })
    ).rejects.toMatchObject({
      code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
      message: expect.stringContaining("secret://")
    });

    // Also reject apiKey that looks like a token
    await expect(
      adapter.memory.configure({
        agentId: "agent-main",
        workspaceId: "ws-1",
        scope: "agent",
        provider: "openai",
        secretRef: "secret://runtime/openai",
        apiKeyRef: "sk-proj-xxxxxxxxxx"
      })
    ).rejects.toMatchObject({
      code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
      message: expect.stringContaining("secret://")
    });
  });

  it("accepts valid secret reference format for secretRef and apiKeyRef", async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true })
    });
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand,
      resolvePreferredStateDir: async () => "/tmp/.openclaw",
      resolveConfigCandidates: () => ["/tmp/.openclaw/openclaw.json"]
    });

    // Should not throw for valid secret:// format
    const result = await adapter.memory.configure({
      agentId: "agent-main",
      workspaceId: "ws-1",
      scope: "agent",
      provider: "openai",
      secretRef: "secret://runtime/openai",
      apiKeyRef: "secret://credentials/openai-key"
    });

    expect(result).toBeDefined();
    expect(runCommand).toHaveBeenCalled();
  });

  it("accepts null secretRef to clear secret reference", async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true })
    });
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand,
      resolvePreferredStateDir: async () => "/tmp/.openclaw",
      resolveConfigCandidates: () => ["/tmp/.openclaw/openclaw.json"]
    });

    // Should not throw when secretRef is explicitly null
    const result = await adapter.memory.configure({
      agentId: "agent-main",
      workspaceId: "ws-1",
      scope: "agent",
      provider: "openai",
      secretRef: null
    });

    expect(result).toBeDefined();
    // Verify --clear-secret-ref flag is used
    const lastCall = runCommand.mock.calls[runCommand.mock.calls.length - 1];
    expect(lastCall[0]).toContain("--clear-secret-ref");
  });

  it("normalizes messaging transport failures into structured adapter errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "invalid" } }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    });
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl,
      runCommand: vi.fn()
    });

    await expect(
      adapter.messaging.send({
        agentId: "agent-main",
        sessionKey: "session-001",
        content: "hello"
      })
    ).rejects.toMatchObject({
      code: "OPENCLAW_HTTP_400",
      message: "invalid",
      details: expect.objectContaining({ status: 400 })
    });
  });

  it("normalizes CLI failures into structured adapter errors", async () => {
    const runCommand = vi.fn(async () => {
      throw Object.assign(new Error("openclaw missing"), { code: "ENOENT" });
    });
    const adapter = createOpenclawRuntimeAdapter({
      fetchImpl: vi.fn(),
      runCommand
    });

    await expect(adapter.cron.list({ agentId: "agent-main" })).rejects.toMatchObject({
      code: "OPENCLAW_CLI_ENOENT",
      message: "openclaw missing",
      details: expect.objectContaining({ command: expect.any(Array) })
    });
  });
});
