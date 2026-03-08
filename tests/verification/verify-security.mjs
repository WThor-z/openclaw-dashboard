import { DatabaseSync } from "node:sqlite";

import { redactSecrets } from "../../apps/daemon/src/shared/redaction.js";
import { runMigrations } from "../../apps/daemon/src/platform/storage/migrations.js";
import {
  createStorageRepositories,
  SECRET_PERSISTENCE_BLOCKED
} from "../../apps/daemon/src/platform/storage/repositories.js";

const PUBLIC_BIND_BLOCKED = "PUBLIC_BIND_BLOCKED";

function resolveBindHost(env = process.env) {
  const hostCandidate = env.DASHBOARD_BIND ?? env.DAEMON_HOST ?? "127.0.0.1";
  return String(hostCandidate).trim() || "127.0.0.1";
}

function assertLocalBindGuard(env = process.env) {
  const host = resolveBindHost(env);
  const normalized = host.toLowerCase();
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "*") {
    const error = new Error(`${PUBLIC_BIND_BLOCKED}: daemon must not bind publicly by default`);
    error.code = PUBLIC_BIND_BLOCKED;
    throw error;
  }

  return host;
}

function assertRedactionGuard() {
  const input = {
    token: "plain-token",
    nested: {
      secretKey: "plain-secret",
      safe: "ok"
    }
  };

  const redacted = redactSecrets(input);
  if (redacted.token !== "[REDACTED]" || redacted.nested?.secretKey !== "[REDACTED]") {
    throw new Error("REDACTION_SMOKE_FAILED");
  }

  if (redacted.nested?.safe !== "ok") {
    throw new Error("REDACTION_SAFE_FIELD_MUTATED");
  }
}

function assertSecretPersistenceGuard() {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db, { direction: "up" });
    const repositories = createStorageRepositories(db);

    let blocked = false;
    try {
      repositories.webhooks.insert({
        id: "security-check-webhook",
        workspaceId: "global",
        endpointUrl: "https://receiver.test/security-check",
        secretRef: "WH_SECRET",
        enabled: 1,
        createdAt: "2026-03-05T00:00:00.000Z",
        updatedAt: "2026-03-05T00:00:00.000Z",
        secretToken: "should-not-persist"
      });
    } catch (error) {
      blocked = error?.code === SECRET_PERSISTENCE_BLOCKED;
    }

    if (!blocked) {
      throw new Error("SECRET_PERSISTENCE_GUARD_FAILED");
    }
  } finally {
    db.close();
  }
}

try {
  const bindHost = assertLocalBindGuard();
  assertRedactionGuard();
  assertSecretPersistenceGuard();

  console.log(`verify:security bind host ${bindHost}`);
  console.log("verify:security pass");
} catch (error) {
  if (error?.code === PUBLIC_BIND_BLOCKED) {
    console.error(`${PUBLIC_BIND_BLOCKED}: ${error.message}`);
  } else {
    console.error("verify:security failed", error);
  }
  process.exit(1);
}
