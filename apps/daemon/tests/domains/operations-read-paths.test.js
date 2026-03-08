import { describe, expect, it } from "vitest";

import { handleDailyCostsRead } from "../../src/domains/operations/read/costs.js";
import { handleSessionDetailRead, handleSessionsListRead } from "../../src/domains/operations/read/sessions.js";
import { handleStatusRead } from "../../src/domains/operations/read/status.js";
import { handleTaskDetailRead, handleTasksListRead } from "../../src/domains/operations/read/tasks.js";

describe("daemon operations read domain paths", () => {
  it("exports status and costs handlers from the operations read domain", () => {
    expect(handleStatusRead).toBeTypeOf("function");
    expect(handleDailyCostsRead).toBeTypeOf("function");
  });

  it("exports sessions and tasks handlers from the operations read domain", () => {
    expect(handleSessionsListRead).toBeTypeOf("function");
    expect(handleSessionDetailRead).toBeTypeOf("function");
    expect(handleTasksListRead).toBeTypeOf("function");
    expect(handleTaskDetailRead).toBeTypeOf("function");
  });
});
