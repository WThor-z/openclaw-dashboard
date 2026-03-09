import { describe, expect, it } from "vitest";

import { resolveBindConfig } from "../../src/app/config.js";
import { createDaemonServer } from "../../src/app/http-server.js";

describe("daemon app server paths", () => {
  it("exports bind config helpers from the app layer", () => {
    expect(resolveBindConfig).toBeTypeOf("function");
  });

  it("exports createDaemonServer from the app layer", () => {
    expect(createDaemonServer).toBeTypeOf("function");
  });
});
