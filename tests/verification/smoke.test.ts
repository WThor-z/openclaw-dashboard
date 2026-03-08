import { describe, expect, it } from "vitest";
import { monorepoSmokeCheck } from "../../packages/shared/src/index";

describe("monorepo smoke test", () => {
  it("returns true from shared baseline helper", () => {
    expect(monorepoSmokeCheck()).toBe(true);
  });
});
