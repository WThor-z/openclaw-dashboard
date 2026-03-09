import { describe, expect, it } from "vitest";

import { parseAndRedactJson, redactSecrets } from "../../src/shared/redaction.js";

describe("daemon shared redaction paths", () => {
  it("exports redaction helpers from shared layer", () => {
    expect(redactSecrets).toBeTypeOf("function");
    expect(parseAndRedactJson).toBeTypeOf("function");
  });
});
