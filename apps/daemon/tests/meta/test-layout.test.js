import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("daemon test layout", () => {
  it("does not keep the legacy test directory", () => {
    const legacyTestPath = path.resolve(import.meta.dirname, "../../test");

    expect(existsSync(legacyTestPath)).toBe(false);
  });

  it("keeps storage infrastructure under the platform layer", () => {
    const platformStoragePath = path.resolve(import.meta.dirname, "../../src/platform/storage");
    const legacyStoragePath = path.resolve(import.meta.dirname, "../../src/storage");

    expect(existsSync(platformStoragePath)).toBe(true);
    expect(existsSync(legacyStoragePath)).toBe(false);
  });

  it("keeps monitoring and openclaw infrastructure under the platform layer", () => {
    const platformMonitoringPath = path.resolve(import.meta.dirname, "../../src/platform/monitoring");
    const platformOpenclawPath = path.resolve(import.meta.dirname, "../../src/platform/openclaw");
    const legacyMonitoringPath = path.resolve(import.meta.dirname, "../../src/monitoring");
    const legacyOpenclawPath = path.resolve(import.meta.dirname, "../../src/openclaw");

    expect(existsSync(platformMonitoringPath)).toBe(true);
    expect(existsSync(platformOpenclawPath)).toBe(true);
    expect(existsSync(legacyMonitoringPath)).toBe(false);
    expect(existsSync(legacyOpenclawPath)).toBe(false);
  });

  it("keeps webhook infrastructure under the platform layer", () => {
    const platformWebhooksPath = path.resolve(import.meta.dirname, "../../src/platform/webhooks");
    const legacyWebhooksPath = path.resolve(import.meta.dirname, "../../src/webhooks");

    expect(existsSync(platformWebhooksPath)).toBe(true);
    expect(existsSync(legacyWebhooksPath)).toBe(false);
  });

  it("keeps gateway client infrastructure under the platform layer", () => {
    const platformGatewayPath = path.resolve(import.meta.dirname, "../../src/platform/gateway");
    const legacyGatewayPath = path.resolve(import.meta.dirname, "../../src/gateway");

    expect(existsSync(platformGatewayPath)).toBe(true);
    expect(existsSync(legacyGatewayPath)).toBe(false);
  });

  it("keeps ingest infrastructure under the platform layer", () => {
    const platformIngestPath = path.resolve(import.meta.dirname, "../../src/platform/ingest");
    const legacyIngestPath = path.resolve(import.meta.dirname, "../../src/ingest");

    expect(existsSync(platformIngestPath)).toBe(true);
    expect(existsSync(legacyIngestPath)).toBe(false);
  });

  it("keeps daemon API routers under operations domains", () => {
    const operationsApiPath = path.resolve(import.meta.dirname, "../../src/domains/operations/api");
    const legacyApiPath = path.resolve(import.meta.dirname, "../../src/api");

    expect(existsSync(operationsApiPath)).toBe(true);
    expect(existsSync(legacyApiPath)).toBe(false);
  });
});
