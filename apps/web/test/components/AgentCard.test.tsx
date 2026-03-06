import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentCard, type Agent } from "../../src/components/AgentCard.js";

describe("AgentCard", () => {
  it("renders agent metadata and calls onClick", () => {
    const onClick = vi.fn();
    const agent: Agent = {
      id: "agent-42",
      name: "Navigator",
      role: "planner",
      workspacePath: "/tmp/navigator",
      status: "busy",
      updatedAt: "2026-03-06T10:00:00.000Z"
    };

    render(<AgentCard agent={agent} onClick={onClick} />);

    expect(screen.getByText("Navigator")).toBeTruthy();
    expect(screen.getByText("planner")).toBeTruthy();
    expect(screen.getByText("busy")).toBeTruthy();

    fireEvent.click(screen.getByTestId("agent-card-agent-42"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(agent);
  });
});
