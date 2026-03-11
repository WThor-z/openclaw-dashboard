import { spawn } from "node:child_process";

import { resolveConfigCandidates, resolvePreferredStateDir } from "./session-registry.js";

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isValidSecretRef(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  // Require explicit secret:// scheme to distinguish from raw tokens
  return trimmed.startsWith("secret://");
}

function makeErrorCode(input, fallbackCode) {
  const value = asNonEmptyString(input);
  if (!value) {
    return fallbackCode;
  }

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : fallbackCode;
}

function extractMessagePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof payload.error?.message === "string") {
    return payload.error.message;
  }
  if (typeof payload.message === "string") {
    return payload.message;
  }

  return null;
}

function extractResponseOutputText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      if (typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n");
}

function extractCliAgentOutputText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const collections = [
    Array.isArray(payload.result?.payloads) ? payload.result.payloads : [],
    Array.isArray(payload.payloads) ? payload.payloads : [],
    Array.isArray(payload.result?.output) ? payload.result.output : [],
    Array.isArray(payload.output) ? payload.output : []
  ];

  const chunks = [];
  for (const items of collections) {
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }

      if (typeof item.text === "string") {
        chunks.push(item.text);
        continue;
      }

      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (part && typeof part === "object" && typeof part.text === "string") {
          chunks.push(part.text);
        }
      }
    }
  }

  if (chunks.length > 0) {
    return chunks.join("\n");
  }

  return (
    asNonEmptyString(payload.result?.text) ??
    asNonEmptyString(payload.text) ??
    extractResponseOutputText(payload)
  );
}

function extractCliAgentResponseId(payload) {
  return (
    asNonEmptyString(payload?.id) ??
    asNonEmptyString(payload?.result?.id) ??
    asNonEmptyString(payload?.message?.id) ??
    null
  );
}

function tryParseJsonObject(input) {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractBusinessError(payload, outputText) {
  if (payload && typeof payload === "object") {
    if (typeof payload.error?.code === "string") {
      return {
        code: payload.error.code,
        message:
          asNonEmptyString(payload.error?.message) ??
          asNonEmptyString(payload.error?.code) ??
          "Upstream runtime reported an error"
      };
    }

    if (typeof payload.detail?.code === "string") {
      return {
        code: payload.detail.code,
        message:
          asNonEmptyString(payload.detail?.message) ??
          asNonEmptyString(payload.detail?.code) ??
          "Upstream runtime reported an error"
      };
    }
  }

  const parsedOutput = tryParseJsonObject(outputText);
  if (parsedOutput && typeof parsedOutput.detail?.code === "string") {
    return {
      code: parsedOutput.detail.code,
      message:
        asNonEmptyString(parsedOutput.detail?.message) ??
        asNonEmptyString(parsedOutput.detail?.code) ??
        "Upstream runtime reported an error"
    };
  }

  return null;
}

export function normalizeOpenclawAdapterError(error, fallbackCode, details = undefined) {
  if (
    error &&
    typeof error === "object" &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  ) {
    if (details && error.details === undefined) {
      return {
        code: error.code,
        message: error.message,
        details
      };
    }

    return error;
  }

  const message = asNonEmptyString(error?.message) ?? "OpenClaw adapter operation failed";
  const code = makeErrorCode(error?.code, fallbackCode);
  const normalized = { code, message };
  if (details !== undefined) {
    normalized.details = details;
  }
  return normalized;
}

function createDefaultCommandRunner() {
  return async function runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const [bin, ...args] = command;
      const child = spawn(bin, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: "pipe"
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (exitCode) => {
        resolve({
          exitCode: Number.isInteger(exitCode) ? exitCode : 1,
          stdout,
          stderr
        });
      });

      if (typeof options.input === "string") {
        child.stdin.write(options.input);
      }
      child.stdin.end();
    });
  };
}

function appendFlag(command, flag) {
  if (!command.includes(flag)) {
    command.push(flag);
  }
  return command;
}

function maybePush(command, flag, value) {
  if (value === undefined || value === null) {
    return;
  }
  command.push(flag, String(value));
}

function parseJsonOutput(output, fallbackCode, command) {
  try {
    return output.trim().length > 0 ? JSON.parse(output) : {};
  } catch (error) {
    throw normalizeOpenclawAdapterError(error, fallbackCode, {
      command,
      output
    });
  }
}

async function resolveCommandContext({
  env,
  resolvePreferredStateDirImpl,
  resolveConfigCandidatesImpl
}) {
  const stateDir = await resolvePreferredStateDirImpl(env);
  const configCandidates = resolveConfigCandidatesImpl(env);
  const configPath = configCandidates.find((candidate) => asNonEmptyString(candidate));

  const commandEnv = {
    ...env
  };
  if (asNonEmptyString(stateDir)) {
    commandEnv.OPENCLAW_STATE_DIR = stateDir;
  }
  if (asNonEmptyString(configPath)) {
    commandEnv.OPENCLAW_CONFIG_PATH = configPath;
  }

  return {
    env: commandEnv,
    cwd: asNonEmptyString(stateDir) ?? undefined
  };
}

export function createOpenclawRuntimeAdapter(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const runCommand = options.runCommand ?? createDefaultCommandRunner();
  const env = options.env ?? process.env;
  const openclawApiBaseUrl =
    asNonEmptyString(options.openclawApiBaseUrl) ??
    asNonEmptyString(env.OPENCLAW_API_BASE_URL) ??
    "http://127.0.0.1:11478";
  const openclawGatewayToken =
    asNonEmptyString(options.openclawGatewayToken) ??
    asNonEmptyString(env.OPENCLAW_GATEWAY_TOKEN) ??
    asNonEmptyString(env.OPENCLAW_GATEWAY_PASSWORD) ??
    null;
  const openclawModel =
    asNonEmptyString(options.openclawModel) ??
    asNonEmptyString(env.OPENCLAW_MODEL) ??
    asNonEmptyString(env.OPENAI_MODEL) ??
    asNonEmptyString(env.MODEL) ??
    null;
  const resolvePreferredStateDirImpl = options.resolvePreferredStateDir ?? resolvePreferredStateDir;
  const resolveConfigCandidatesImpl = options.resolveConfigCandidates ?? resolveConfigCandidates;

  async function runCli(command, parseJson = true, cliOptions = {}) {
    const fullCommand = ["openclaw", ...command];
    if (cliOptions.nonInteractive !== false) {
      appendFlag(fullCommand, "--non-interactive");
    }

    try {
      const context = await resolveCommandContext({
        env,
        resolvePreferredStateDirImpl,
        resolveConfigCandidatesImpl
      });
      const result = await runCommand(fullCommand, context);

      if (result.exitCode !== 0) {
        throw normalizeOpenclawAdapterError(
          {
            code: `OPENCLAW_CLI_EXIT_${result.exitCode}`,
            message: result.stderr || "OpenClaw CLI failed"
          },
          "OPENCLAW_CLI_FAILED",
          {
            command: fullCommand,
            exitCode: result.exitCode,
            stderr: result.stderr,
            stdout: result.stdout
          }
        );
      }

      return parseJson
        ? parseJsonOutput(result.stdout ?? "", "OPENCLAW_CLI_BAD_JSON", fullCommand)
        : (result.stdout ?? "");
    } catch (error) {
      const rawCode = makeErrorCode(error?.code, "FAILED");
      const fallbackCode = rawCode.startsWith("OPENCLAW_") ? rawCode : `OPENCLAW_CLI_${rawCode}`;
      throw normalizeOpenclawAdapterError(
        {
          code: fallbackCode,
          message: asNonEmptyString(error?.message) ?? "OpenClaw CLI failed"
        },
        fallbackCode,
        {
          causeCode: asNonEmptyString(error?.code) ?? null,
          command: fullCommand
        }
      );
    }
  }

  async function validateConfig() {
    return runCli(["config", "validate"]);
  }

  function resolveMessagingModel(model = undefined) {
    return asNonEmptyString(model) ?? openclawModel;
  }

  async function sendMessageViaCliFallback({ agentId, content }) {
    const payload = await runCli(
      ["agent", "--agent", agentId, "--message", content, "--json"],
      true,
      { nonInteractive: false }
    );
    const outputText = extractCliAgentOutputText(payload);
    const businessError = extractBusinessError(payload, outputText);
    if (businessError) {
      throw normalizeOpenclawAdapterError(
        {
          code: `OPENCLAW_UPSTREAM_${makeErrorCode(businessError.code, "BUSINESS_ERROR")}`,
          message: businessError.message
        },
        "OPENCLAW_UPSTREAM_BUSINESS_ERROR",
        {
          body: payload
        }
      );
    }

    return {
      id: extractCliAgentResponseId(payload),
      outputText,
      raw: payload
    };
  }

  async function sendMessage({ agentId, sessionKey, content, model = undefined }) {
    const finalAgentId = asNonEmptyString(agentId);
    const finalSessionKey = asNonEmptyString(sessionKey);
    const finalContent = asNonEmptyString(content);
    const finalModel = resolveMessagingModel(model);
    if (!finalAgentId || !finalSessionKey || !finalContent) {
      throw normalizeOpenclawAdapterError(
        { code: "OPENCLAW_BAD_REQUEST", message: "agentId, sessionKey, and content are required" },
        "OPENCLAW_BAD_REQUEST"
      );
    }
    if (!finalModel) {
      throw normalizeOpenclawAdapterError(
        { code: "OPENCLAW_MODEL_REQUIRED", message: "model is required" },
        "OPENCLAW_MODEL_REQUIRED"
      );
    }

    const url = `${openclawApiBaseUrl}/v1/responses`;
    const requestBody = {
      input: finalContent,
      model: finalModel
    };

    const headers = {
      "content-type": "application/json",
      "x-openclaw-agent-id": finalAgentId,
      "x-openclaw-session-key": finalSessionKey
    };
    if (openclawGatewayToken) {
      headers.authorization = `Bearer ${openclawGatewayToken}`;
    }

    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      throw normalizeOpenclawAdapterError(error, "OPENCLAW_HTTP_REQUEST_FAILED", {
        url,
        method: "POST"
      });
    }

    const responseText = await response.text();
    const contentType = asNonEmptyString(response.headers.get("content-type")) ?? "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const payload = isJson
      ? parseJsonOutput(responseText, "OPENCLAW_HTTP_BAD_JSON", ["POST", url])
      : { message: responseText };

    if (!response.ok) {
      const message =
        extractMessagePayload(payload) ??
        `OpenClaw HTTP request failed with status ${response.status}`;
      throw normalizeOpenclawAdapterError(
        {
          code: `OPENCLAW_HTTP_${response.status}`,
          message
        },
        "OPENCLAW_HTTP_ERROR",
        {
          status: response.status,
          body: payload
        }
      );
    }

    const outputText = extractResponseOutputText(payload);
    const businessError = extractBusinessError(payload, outputText);
    if (businessError) {
      const normalizedError = normalizeOpenclawAdapterError(
        {
          code: `OPENCLAW_UPSTREAM_${makeErrorCode(businessError.code, "BUSINESS_ERROR")}`,
          message: businessError.message
        },
        "OPENCLAW_UPSTREAM_BUSINESS_ERROR",
        {
          body: payload
        }
      );

      if (normalizedError.code === "OPENCLAW_UPSTREAM_DEACTIVATED_WORKSPACE") {
        return sendMessageViaCliFallback({
          agentId: finalAgentId,
          content: finalContent
        });
      }

      throw normalizedError;
    }

    return {
      id: asNonEmptyString(payload?.id) ?? null,
      outputText,
      raw: payload
    };
  }

  async function configureMemory({
    agentId,
    workspaceId,
    scope,
    provider,
    secretRef = null,
    conversationId = null,
    model = null,
    remoteBaseUrl = null,
    apiKeyRef = null,
    apiKey = undefined
  }) {
    // Reject raw API key; only accept secretRef / apiKeyRef
    if (secretRef !== null && !isValidSecretRef(secretRef)) {
      throw normalizeOpenclawAdapterError(
        {
          code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
          message: "secretRef must be a secret reference (e.g., secret://path) or null"
        },
        "OPENCLAW_MEMORY_SECRET_REF_REQUIRED"
      );
    }

    // Explicitly reject raw apiKey to prevent accidental credential exposure
    if (apiKey !== undefined) {
      throw normalizeOpenclawAdapterError(
        {
          code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
          message: "Raw apiKey is not allowed; use secretRef or apiKeyRef"
        },
        "OPENCLAW_MEMORY_SECRET_REF_REQUIRED"
      );
    }

    // Validate apiKeyRef format if provided
    if (apiKeyRef !== undefined && apiKeyRef !== null && !isValidSecretRef(apiKeyRef)) {
      throw normalizeOpenclawAdapterError(
        {
          code: "OPENCLAW_MEMORY_SECRET_REF_REQUIRED",
          message: "apiKeyRef must be a secret reference (e.g., secret://path)"
        },
        "OPENCLAW_MEMORY_SECRET_REF_REQUIRED"
      );
    }

    await validateConfig();

    const command = ["memory", "set"];
    maybePush(command, "--agent", agentId);
    maybePush(command, "--workspace", workspaceId);
    maybePush(command, "--scope", scope);
    maybePush(command, "--provider", provider);
    if (secretRef === null) {
      command.push("--clear-secret-ref");
    } else {
      maybePush(command, "--secret-ref", secretRef);
    }
    maybePush(command, "--conversation", conversationId);
    maybePush(command, "--model", model);
    maybePush(command, "--remote-base-url", remoteBaseUrl);
    maybePush(command, "--api-key-ref", apiKeyRef);
    command.push("--json");
    return runCli(command);
  }

  return {
    messaging: {
      send: sendMessage,
      resolveModel: resolveMessagingModel
    },
    cron: {
      list: ({ agentId }) => runCli(["cron", "list", "--agent", agentId, "--json"]),
      add: ({ agentId, label, cron, prompt, enabled, timezone, sessionKey }) => {
        const command = [
          "cron",
          "add",
          "--agent",
          agentId,
          "--label",
          label,
          "--cron",
          cron,
          "--prompt",
          prompt,
          "--enabled",
          String(Boolean(enabled))
        ];
        maybePush(command, "--timezone", timezone);
        maybePush(command, "--session-key", sessionKey);
        command.push("--json");
        return runCli(command);
      },
      update: ({ agentId, scheduleId, label, cron, prompt, enabled, timezone, sessionKey }) => {
        const command = [
          "cron",
          "update",
          "--agent",
          agentId,
          "--schedule",
          scheduleId,
          "--label",
          label,
          "--cron",
          cron,
          "--prompt",
          prompt,
          "--enabled",
          String(Boolean(enabled))
        ];
        maybePush(command, "--timezone", timezone);
        maybePush(command, "--session-key", sessionKey);
        command.push("--json");
        return runCli(command);
      },
      run: ({ agentId, scheduleId }) =>
        runCli(["cron", "run", "--agent", agentId, "--schedule", scheduleId, "--json"]),
      remove: ({ agentId, scheduleId }) =>
        runCli(["cron", "remove", "--agent", agentId, "--schedule", scheduleId, "--json"]),
      runs: ({ agentId, scheduleId, limit = 20 }) =>
        runCli([
          "cron",
          "runs",
          "--agent",
          agentId,
          "--schedule",
          scheduleId,
          "--limit",
          String(limit),
          "--json"
        ])
    },
    heartbeat: {
      read: ({ agentId }) => runCli(["heartbeat", "get", "--agent", agentId, "--json"]),
      configure: async ({ agentId, workspaceId, every, session, lightContext, prompt }) => {
        await validateConfig();
        const command = ["heartbeat", "set", "--agent", agentId, "--json"];
        maybePush(command, "--workspace", workspaceId);
        maybePush(command, "--every", every);
        maybePush(command, "--session", session);
        if (typeof lightContext === "boolean") {
          command.push("--light-context", String(lightContext));
        }
        maybePush(command, "--prompt", prompt);
        return runCli(command);
      }
    },
    memory: {
      read: ({ agentId }) => runCli(["memory", "get", "--agent", agentId, "--json"]),
      configure: configureMemory
    }
  };
}
