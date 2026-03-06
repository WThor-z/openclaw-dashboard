import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../app/auth.js";
import { AgentList } from "../components/AgentList.js";
import { type Agent } from "../components/AgentCard.js";
import { EmptyState } from "../components/EmptyState.js";
import { Skeleton } from "../components/Skeleton.js";
import { useAgentStatus } from "../hooks/useAgentStatus.js";

interface DaemonWorkspaceNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DaemonWorkspaceNode[];
}

const DEFAULT_PIN_LIMIT = 3;

function collectMarkdownPaths(nodes: DaemonWorkspaceNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.isDirectory) {
      paths.push(...collectMarkdownPaths(Array.isArray(node.children) ? node.children : []));
      continue;
    }

    if (/\.md$/i.test(node.path)) {
      paths.push(node.path);
    }
  }

  return paths;
}

function getPinnedNotesStorageKey(agentId: string) {
  return `agent-workspace:pinned-notes:${agentId}`;
}

function loadStoredPinnedNotes(agentId: string) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(getPinnedNotesStorageKey(agentId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function savePinnedNotes(agentId: string, paths: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getPinnedNotesStorageKey(agentId), JSON.stringify(paths));
}

export function AgentWorkspacePage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [availableMarkdownPaths, setAvailableMarkdownPaths] = useState<string[]>([]);
  const [pinnedNotePaths, setPinnedNotePaths] = useState<string[]>([]);
  const [selectedQuickNotePath, setSelectedQuickNotePath] = useState<string | null>(null);
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [quickNoteModifiedAt, setQuickNoteModifiedAt] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isQuickNoteLoading, setIsQuickNoteLoading] = useState(false);
  const [quickNoteError, setQuickNoteError] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const selectedAgentStatus = useAgentStatus({
    agentId: isDrawerOpen ? selectedAgent?.id ?? null : null,
    token,
    initialStatus: selectedAgent?.status ?? "offline"
  });

  const handleAgentClick = useCallback((agent: Agent) => {
    setSelectedAgentId(agent.id);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedQuickNotePath(null);
    setQuickNoteContent("");
    setQuickNoteModifiedAt(null);
    setQuickNoteError(null);
  }, []);

  useEffect(() => {
    if (!isDrawerOpen || !selectedAgent || !token) {
      return;
    }

    let cancelled = false;

    const loadQuickNotes = async () => {
      setIsWorkspaceLoading(true);
      setWorkspaceError(null);
      setAvailableMarkdownPaths([]);
      setPinnedNotePaths([]);
      setSelectedQuickNotePath(null);
      setQuickNoteContent("");
      setQuickNoteModifiedAt(null);
      setQuickNoteError(null);

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.id)}/files`, {
          headers: {
            authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to load workspace files");
        }

        const body = (await response.json()) as { items?: DaemonWorkspaceNode[] };
        if (cancelled) {
          return;
        }

        const markdownPaths = collectMarkdownPaths(Array.isArray(body.items) ? body.items : []);
        const storedPaths = loadStoredPinnedNotes(selectedAgent.id);
        const validStoredPaths = storedPaths.filter((path) => markdownPaths.includes(path));
        const nextPinnedPaths =
          validStoredPaths.length > 0 ? validStoredPaths : markdownPaths.slice(0, DEFAULT_PIN_LIMIT);

        setAvailableMarkdownPaths(markdownPaths);
        setPinnedNotePaths(nextPinnedPaths);
        setSelectedQuickNotePath(nextPinnedPaths[0] ?? null);
        savePinnedNotes(selectedAgent.id, nextPinnedPaths);
      } catch {
        if (!cancelled) {
          setWorkspaceError("Failed to load quick-view files.");
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    };

    void loadQuickNotes();

    return () => {
      cancelled = true;
    };
  }, [isDrawerOpen, selectedAgent, token]);

  useEffect(() => {
    if (!isDrawerOpen || !selectedAgent || !selectedQuickNotePath || !token) {
      return;
    }

    let cancelled = false;

    const loadQuickNoteContent = async () => {
      setIsQuickNoteLoading(true);
      setQuickNoteError(null);

      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(selectedAgent.id)}/files/${encodeURIComponent(selectedQuickNotePath)}`,
          {
            headers: {
              authorization: `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load file content");
        }

        const body = (await response.json()) as { content?: string; modifiedAt?: string };
        if (cancelled) {
          return;
        }

        setQuickNoteContent(typeof body.content === "string" ? body.content : "");
        setQuickNoteModifiedAt(
          typeof body.modifiedAt === "string" && body.modifiedAt.length > 0 ? body.modifiedAt : null
        );
      } catch {
        if (!cancelled) {
          setQuickNoteContent("");
          setQuickNoteModifiedAt(null);
          setQuickNoteError("Failed to load quick note.");
        }
      } finally {
        if (!cancelled) {
          setIsQuickNoteLoading(false);
        }
      }
    };

    void loadQuickNoteContent();

    return () => {
      cancelled = true;
    };
  }, [isDrawerOpen, selectedAgent, selectedQuickNotePath, token]);

  const handlePinnedNoteToggle = useCallback(
    (path: string) => {
      if (!selectedAgent) {
        return;
      }

      setPinnedNotePaths((currentPaths) => {
        const nextPaths = currentPaths.includes(path)
          ? currentPaths.filter((entry) => entry !== path)
          : [...currentPaths, path];

        savePinnedNotes(selectedAgent.id, nextPaths);

        if (nextPaths.length === 0) {
          setSelectedQuickNotePath(null);
          setQuickNoteContent("");
          setQuickNoteModifiedAt(null);
          setQuickNoteError(null);
        } else if (!nextPaths.includes(selectedQuickNotePath ?? "")) {
          setSelectedQuickNotePath(nextPaths[0]);
        }

        return nextPaths;
      });
    },
    [selectedAgent, selectedQuickNotePath]
  );

  const handleOpenFullWorkspace = useCallback(() => {
    if (!selectedAgent) {
      return;
    }

    setIsDrawerOpen(false);
    navigate(`/agents/${encodeURIComponent(selectedAgent.id)}/workspace`);
  }, [navigate, selectedAgent]);

  const overviewStats = useMemo(
    () => [
      { label: "Agents", value: String(agents.length) },
      { label: "Online", value: String(agents.filter((agent) => agent.status !== "offline").length) },
      { label: "Pinned Notes", value: String(pinnedNotePaths.length) }
    ],
    [agents, pinnedNotePaths.length]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 font-mono text-zinc-200 selection:bg-indigo-500/30">
      <aside
        data-testid="drawer-placeholder"
        className="hidden w-72 shrink-0 border-r border-zinc-800 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.2),_transparent_55%),linear-gradient(180deg,_rgba(24,24,27,0.96),_rgba(9,9,11,0.98))] p-6 lg:flex lg:flex-col"
      >
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-2xl shadow-black/20">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-indigo-300">Overview</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-50">Agent Workspace</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Keep the dashboard focused on status and quick notes. Open the full workspace only when you need file browsing or editing.
          </p>
        </div>

        <div className="mt-6 grid gap-3">
          {overviewStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-bold text-zinc-100">{stat.value}</p>
            </div>
          ))}
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-zinc-800 bg-zinc-900/30 px-8 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4">
            <div>
              <h1 data-testid="agent-workspace-title" className="text-xl font-bold tracking-tight text-zinc-100">
                Agent Workspace
              </h1>
              <p className="text-xs text-zinc-500">Dashboard overview, live status, and pinned markdown quick views.</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8" data-testid="agent-list-placeholder">
          <div className="mx-auto max-w-6xl">
            <AgentList onAgentClick={handleAgentClick} onAgentsChange={setAgents} />
          </div>
        </div>

        {isDrawerOpen ? (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={closeDrawer}
          />
        ) : null}

        <div
          className={`fixed right-0 top-0 z-50 flex h-full w-[620px] max-w-full transform flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 ease-in-out ${
            isDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedAgent ? (
            <>
              <div className="flex h-16 items-center justify-between border-b border-zinc-800 px-6">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Quick View</p>
                  <h2 className="truncate text-lg font-bold text-zinc-100">{selectedAgent.name}</h2>
                </div>
                <div
                  aria-label="Close quick view"
                  className="cursor-pointer rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  onClick={closeDrawer}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
                <section className="grid gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-5 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Agent ID</p>
                    <p className="mt-2 text-sm text-zinc-200">{selectedAgent.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Role</p>
                    <p className="mt-2 text-sm text-zinc-200">{selectedAgent.role}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Workspace</p>
                    <p className="mt-2 break-all text-sm text-zinc-300">{selectedAgent.workspacePath}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Status</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span
                        className={`status-indicator ${
                          selectedAgentStatus === "idle"
                            ? "status-idle"
                            : selectedAgentStatus === "busy"
                              ? "status-busy"
                              : selectedAgentStatus === "offline"
                                ? "status-offline"
                                : "status-error"
                        }`}
                      />
                      <span className="text-sm capitalize text-zinc-300">{selectedAgentStatus}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">Quick Notes</h3>
                      <p className="mt-1 text-xs text-zinc-500">Choose which markdown files stay pinned for this agent.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenFullWorkspace}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
                    >
                      Open Full Workspace
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/50 p-4">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Pinned Files</p>
                        {isWorkspaceLoading ? (
                          <div className="mt-3 space-y-2">
                            {Array.from({ length: 4 }).map((_, index) => (
                              <Skeleton key={index} variant="line" className="h-5" />
                            ))}
                          </div>
                        ) : workspaceError ? (
                          <p className="mt-3 text-xs text-red-400">{workspaceError}</p>
                        ) : availableMarkdownPaths.length === 0 ? (
                          <p className="mt-3 text-xs text-zinc-500">No markdown files available for quick view.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {availableMarkdownPaths.map((path) => {
                              const checked = pinnedNotePaths.includes(path);

                              return (
                                <label key={path} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-zinc-800/60">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handlePinnedNoteToggle(path)}
                                    className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500"
                                  />
                                  <span className="min-w-0 break-all text-xs text-zinc-300">{path}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {pinnedNotePaths.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {pinnedNotePaths.map((path) => (
                            <button
                              key={path}
                              type="button"
                              onClick={() => setSelectedQuickNotePath(path)}
                              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                selectedQuickNotePath === path
                                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-200"
                                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                              }`}
                            >
                              {path}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-4">
                      {!selectedQuickNotePath ? (
                        <EmptyState
                          title="Pick a pinned note"
                          message="Select at least one markdown file to keep it available in this quick-view drawer."
                          className="px-4 py-8"
                        />
                      ) : isQuickNoteLoading ? (
                        <div className="space-y-3">
                          <Skeleton variant="line" className="w-1/2" />
                          <Skeleton variant="line" className="w-1/3 h-3" />
                          <Skeleton variant="panel" className="h-72" />
                        </div>
                      ) : quickNoteError ? (
                        <p className="text-xs text-red-400">{quickNoteError}</p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs text-zinc-400">{selectedQuickNotePath}</p>
                              <p className="text-[10px] text-zinc-500">
                                {quickNoteModifiedAt ? `Modified: ${quickNoteModifiedAt}` : "Modified: unknown"}
                              </p>
                            </div>
                          </div>
                          <div className="max-h-[28rem] overflow-auto">
                            <article className="prose prose-invert max-w-none prose-pre:overflow-x-auto">
                              <div className="text-sm leading-7 text-zinc-200 whitespace-pre-wrap">{quickNoteContent}</div>
                            </article>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
