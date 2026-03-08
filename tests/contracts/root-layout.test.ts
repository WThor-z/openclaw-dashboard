import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());

describe("root layout", () => {
  it("uses tools as the home for engineering helpers", () => {
    expect(existsSync(path.join(root, "tools"))).toBe(true);
    expect(existsSync(path.join(root, "scripts"))).toBe(false);
    expect(existsSync(path.join(root, "reliability"))).toBe(false);
    expect(existsSync(path.join(root, "infra"))).toBe(false);
    expect(existsSync(path.join(root, "tools", "workspace", "test-entry.mjs"))).toBe(true);
    expect(existsSync(path.join(root, "tools", "reliability", "README.md"))).toBe(true);
    expect(existsSync(path.join(root, "tools", "ops", "run-local.mjs"))).toBe(true);
    expect(existsSync(path.join(root, "tools", "simulator", "gateway-sim.ts"))).toBe(true);
    expect(existsSync(path.join(root, "tests", "verification", "verify-env.mjs"))).toBe(true);
    expect(existsSync(path.join(root, "tests", "verification", "verify-security.mjs"))).toBe(true);
    expect(existsSync(path.join(root, "tests", "verification", "verify-ops.mjs"))).toBe(true);
    expect(existsSync(path.join(root, "tests", "verification", "smoke.test.ts"))).toBe(true);
    expect(existsSync(path.join(root, "tests", "simulator"))).toBe(false);
    expect(existsSync(path.join(root, "tests", "gateway-sim"))).toBe(false);
    expect(existsSync(path.join(root, "tests", "smoke.test.ts"))).toBe(false);
  });
});
