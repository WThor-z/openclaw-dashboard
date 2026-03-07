import React, { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

import { AuthProvider, useAuth } from "../src/app/auth.js";
import { I18nProvider } from "../src/app/i18n.js";
import { ThemeProvider } from "../src/app/theme.js";
import { saveStoredPinnedNotes } from "../src/features/agent-workspace/storage.js";
import { AgentWorkspacePage } from "../src/pages/AgentWorkspacePage.js";
import { AgentWorkspacePinnedFilesPage } from "../src/pages/AgentWorkspacePinnedFilesPage.js";

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
      <ThemeProvider>
        <I18nProvider>
          <BrowserRouter>
            <LoginHelper />
            {children}
          </BrowserRouter>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AgentWorkspace layout", () => {
  it("renders grouped sidebar navigation without redundant selected-agent panels", async () => {
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
    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Workspaces" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Configuration" })).toBeTruthy();
    expect(screen.queryByText("Selected Agent")).toBeNull();
    expect(screen.queryByText("Agents")).toBeNull();
  });

  it("keeps the last known status through a transient polling failure", async () => {
    let intervalHandler: (() => void) | null = null;
    vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 5000 && typeof handler === "function") {
        intervalHandler = handler as () => void;
      }
      return 1 as unknown as number;
    }) as typeof window.setInterval);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const statusQueue: Array<{ ok: boolean; status: "idle" | "busy" | "offline" | "error" }> = [
      { ok: true, status: "busy" },
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

      if (requestUrl === "/api/agents/agent-1/files") {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [{ name: "README.md", path: "README.md", isDirectory: false }] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/agents/agent-1/files/README.md") {
        return Promise.resolve(
          new Response(JSON.stringify({ content: "# Readme", modifiedAt: "2026-03-06T00:00:00.000Z" }), {
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

    await waitFor(() => {
      expect(screen.getAllByText("busy").length).toBeGreaterThan(0);
    });

    expect(intervalHandler).toBeTruthy();
    await act(async () => {
      intervalHandler?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByText("busy").length).toBeGreaterThan(0);
    });

    cleanup();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(
      fetchSpy.mock.calls.filter(
        (call) => (typeof call[0] === "string" ? call[0] : call[0].toString()) === "/api/agents/agent-1/status"
      ).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("opens a markdown preview drawer from the overview when an agent card is selected", async () => {
    saveStoredPinnedNotes("agent-1", ["README.md", "notes/PLAN.md"]);

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
            { status: 200, headers: { "content-type": "application/json" } }
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
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }

      if (requestUrl === "/api/agents/agent-1/files/README.md") {
        return Promise.resolve(
          new Response(JSON.stringify({ content: "# Readme\n\nHello **world**.", modifiedAt: "2026-03-06T00:00:00.000Z" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/agents/agent-1/files/notes%2FPLAN.md") {
        return Promise.resolve(
          new Response(JSON.stringify({ content: "## Plan", modifiedAt: "2026-03-06T00:00:00.000Z" }), {
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

    expect(await screen.findByTestId("preview-drawer")).toBeTruthy();
    expect((await screen.findAllByText("README.md")).length).toBeGreaterThan(0);
    expect(await screen.findByText("world", { selector: "strong" })).toBeTruthy();
  });

  it("keeps the selected agent status stable when the agent list refreshes stale offline data", async () => {
    let agentListIntervalHandler: (() => void) | null = null;
    vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 5000 && typeof handler === "function") {
        agentListIntervalHandler = handler as () => void;
      }
      return 1 as unknown as number;
    }) as typeof window.setInterval);

    let agentListRequestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl === "/api/agents") {
        agentListRequestCount += 1;
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
                  status: agentListRequestCount === 1 ? "busy" : "offline",
                  updatedAt: "2026-03-06T00:00:00.000Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
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
          new Response(JSON.stringify({ items: [{ name: "README.md", path: "README.md", isDirectory: false }] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/agents/agent-1/files/README.md") {
        return Promise.resolve(
          new Response(JSON.stringify({ content: "# Readme", modifiedAt: "2026-03-06T00:00:00.000Z" }), {
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

    await waitFor(() => {
      expect(screen.getAllByText("busy").length).toBeGreaterThan(0);
    });

    expect(agentListIntervalHandler).toBeTruthy();
    await act(async () => {
      agentListIntervalHandler?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByText("busy").length).toBeGreaterThan(0);
    });
  });

  it("shows pinned files in configuration instead of embedding them in preview content", async () => {
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
            { status: 200, headers: { "content-type": "application/json" } }
          )
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
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

    render(
      <TestWrapper>
        <AgentWorkspacePinnedFilesPage />
      </TestWrapper>
    );

    expect(await screen.findByRole("heading", { name: "Pinned Files" })).toBeTruthy();
    expect(screen.getByText("Configuration")).toBeTruthy();
    expect(screen.queryByText("Pick a pinned note")).toBeNull();
  });
});
