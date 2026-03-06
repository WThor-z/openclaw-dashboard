import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("renders the overview shell instead of a permanent loading sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl === "/api/agents") {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

    render(
      <TestWrapper>
        <AgentWorkspacePage />
      </TestWrapper>
    );

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    expect(await screen.findByTestId("agent-list-placeholder")).toBeTruthy();
    expect(await screen.findByTestId("drawer-placeholder")).toBeTruthy();
    expect(await screen.findByText("Overview")).toBeTruthy();
  });

  it("keeps the last known status through a transient polling failure", async () => {
    let intervalHandler: (() => void) | null = null;
    vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 3000 && typeof handler === "function") {
        intervalHandler = handler as () => void;
      }
      return 1 as unknown as number;
    }) as typeof window.setInterval);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const statusQueue: Array<{ ok: boolean; status: "idle" | "busy" | "offline" | "error" }> = [
      { ok: true, status: "busy" },
      { ok: false, status: "offline" },
      { ok: false, status: "offline" },
      { ok: false, status: "offline" }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl === "/api/agents") {
        expect(init?.headers).toMatchObject({ authorization: "Bearer dev-token" });

        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "agent-1",
                  name: "Alpha",
                  role: "worker",
                  workspacePath: "/workspace/alpha",
                  status: "idle",
                  updatedAt: "2026-03-06T00:00:00.000Z"
                }
              ]
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          )
        );
      }

      if (requestUrl === "/api/agents/agent-1/status") {
        expect(init?.headers).toMatchObject({ authorization: "Bearer dev-token" });

        const next = statusQueue.shift();
        if (!next) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: "busy", updatedAt: "2026-03-06T00:00:00.000Z" }), {
              status: 200,
              headers: { "content-type": "application/json" }
            })
          );
        }

        if (!next.ok) {
          return Promise.resolve(
            new Response(JSON.stringify({ message: "bad" }), {
              status: 503,
              headers: { "content-type": "application/json" }
            })
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ status: next.status, updatedAt: "2026-03-06T00:00:00.000Z" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

    render(
      <TestWrapper>
        <AgentWorkspacePage />
      </TestWrapper>
    );

    fireEvent.click(await screen.findByTestId("agent-card-agent-1"));

    expect(screen.getByText("idle", { selector: "span.text-sm.text-zinc-300.capitalize" })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("busy", { selector: "span.text-sm.text-zinc-300.capitalize" })).toBeTruthy();
    });

    expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 3000);
    expect(intervalHandler).toBeTruthy();

    await act(async () => {
      intervalHandler?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("busy", { selector: "span.text-sm.text-zinc-300.capitalize" })).toBeTruthy();
    });

    await act(async () => {
      intervalHandler?.();
      await Promise.resolve();
      await Promise.resolve();
      intervalHandler?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("offline", { selector: "span.text-sm.text-zinc-300.capitalize" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button"));
    const callCountBeforeClose = fetchSpy.mock.calls.filter(
      (call) => (typeof call[0] === "string" ? call[0] : call[0].toString()) === "/api/agents/agent-1/status"
    ).length;

    expect(clearIntervalSpy).toHaveBeenCalled();
    const callCountAfterClose = fetchSpy.mock.calls.filter(
      (call) => (typeof call[0] === "string" ? call[0] : call[0].toString()) === "/api/agents/agent-1/status"
    ).length;
    expect(callCountAfterClose).toBe(callCountBeforeClose);
  });

  it("opens a quick-view drawer with pinned notes actions instead of the full workspace browser", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl === "/api/agents") {
        expect(init?.headers).toMatchObject({ authorization: "Bearer dev-token" });

        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "agent-1",
                  name: "Alpha",
                  role: "worker",
                  workspacePath: "/workspace/alpha",
                  status: "busy",
                  updatedAt: "2026-03-06T00:00:00.000Z"
                }
              ]
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          )
        );
      }

      if (requestUrl === "/api/agents/agent-1/status") {
        return Promise.resolve(
          new Response(JSON.stringify({ status: "busy", updatedAt: "2026-03-06T00:00:00.000Z" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/agents/agent-1/files") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                { name: "README.md", path: "README.md", isDirectory: false },
                { name: "notes", path: "notes", isDirectory: true, children: [{ name: "PLAN.md", path: "notes/PLAN.md", isDirectory: false }] }
              ]
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          )
        );
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

    render(
      <TestWrapper>
        <AgentWorkspacePage />
      </TestWrapper>
    );

    fireEvent.click(await screen.findByTestId("agent-card-agent-1"));

    expect(await screen.findByText("Quick Notes")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Open Full Workspace" })).toBeTruthy();
  });
});
