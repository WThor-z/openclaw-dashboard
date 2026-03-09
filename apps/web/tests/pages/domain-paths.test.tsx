import { existsSync } from "node:fs";
import path from "node:path";
import { LoginPage } from "../../src/domains/auth/pages/LoginPage.js";
import { describe, expect, it } from "vitest";

describe("web domain-first paths", () => {
  it("exports LoginPage from the auth domain", () => {
    expect(LoginPage).toBeTypeOf("function");
  });

  it("keeps app-layer code focused on bootstrap concerns", () => {
    const legacyLoginPagePath = path.resolve(import.meta.dirname, "../../src/app/LoginPage.tsx");

    expect(existsSync(legacyLoginPagePath)).toBe(false);
  });

  it("keeps reusable frontend code under src/shared", () => {
    const sharedPath = path.resolve(import.meta.dirname, "../../src/shared");
    const componentsPath = path.resolve(import.meta.dirname, "../../src/components");
    const hooksPath = path.resolve(import.meta.dirname, "../../src/hooks");
    const stylesPath = path.resolve(import.meta.dirname, "../../src/styles");

    expect(existsSync(sharedPath)).toBe(true);
    expect(existsSync(componentsPath)).toBe(false);
    expect(existsSync(hooksPath)).toBe(false);
    expect(existsSync(stylesPath)).toBe(false);
  });

  it("keeps web tests in apps/web/tests only", () => {
    const legacyTestPath = path.resolve(import.meta.dirname, "../../test");

    expect(existsSync(legacyTestPath)).toBe(false);
  });

  it("does not keep a dead dashboard domain around", () => {
    const dashboardDomainPath = path.resolve(import.meta.dirname, "../../src/domains/dashboard");

    expect(existsSync(dashboardDomainPath)).toBe(false);
  });
});
