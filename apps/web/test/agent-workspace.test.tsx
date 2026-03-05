import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../src/app/auth.js";
import { BrowserRouter } from "react-router-dom";
import { AgentWorkspacePage } from "../src/pages/AgentWorkspacePage.js";
import { useEffect } from "react";
import { useAuth } from "../src/app/auth.js";

function LoginHelper() {
  const { signIn } = useAuth();
  useEffect(() => {
    signIn("dev-token");
  }, [signIn]);
  return null;
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BrowserRouter>
        <LoginHelper />
        {children}
      </BrowserRouter>
    </AuthProvider>
  );
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("AgentWorkspace layout", () => {
  it("renders the layout shell with placeholders", async () => {
    render(
      <TestWrapper>
        <AgentWorkspacePage />
      </TestWrapper>
    );

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    expect(await screen.findByTestId("agent-list-placeholder")).toBeTruthy();
    expect(await screen.findByTestId("drawer-placeholder")).toBeTruthy();
  });
});
