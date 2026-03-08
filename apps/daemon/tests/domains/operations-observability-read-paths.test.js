import { describe, expect, it } from "vitest";

import { handleEventsRead } from "../../src/domains/operations/read/events.js";
import {
  handleGatewayMonitorRead,
  handleOpenclawMonitorRead,
  handleWorkspaceMonitorsRead
} from "../../src/domains/operations/read/monitors.js";

describe("daemon operations observability read domain paths", () => {
  it("exports events handler from the operations read domain", () => {
    expect(handleEventsRead).toBeTypeOf("function");
  });

  it("exports monitor handlers from the operations read domain", () => {
    expect(handleWorkspaceMonitorsRead).toBeTypeOf("function");
    expect(handleOpenclawMonitorRead).toBeTypeOf("function");
    expect(handleGatewayMonitorRead).toBeTypeOf("function");
  });
});
