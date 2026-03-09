import { describe, expect, it } from "vitest";

import { assertAuthorizedReadRequest, tokenFromAuthorizationHeader } from "../../src/shared/middleware/auth-gate.js";
import { HttpError, sendError, sendJson } from "../../src/shared/middleware/error-handler.js";
import { attachRequestId } from "../../src/shared/middleware/request-id.js";

describe("daemon shared middleware paths", () => {
  it("exports error handling helpers from shared middleware", () => {
    expect(HttpError).toBeTypeOf("function");
    expect(sendJson).toBeTypeOf("function");
    expect(sendError).toBeTypeOf("function");
  });

  it("exports auth and request id helpers from shared middleware", () => {
    expect(tokenFromAuthorizationHeader).toBeTypeOf("function");
    expect(assertAuthorizedReadRequest).toBeTypeOf("function");
    expect(attachRequestId).toBeTypeOf("function");
  });
});
