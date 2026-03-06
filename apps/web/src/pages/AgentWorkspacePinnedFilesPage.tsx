import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../app/auth.js";
import { type Agent } from "../components/AgentCard.js";
import { AgentWorkspaceSidebar } from "../components/AgentWorkspaceSidebar.js";
import { EmptyState } from "../components/EmptyState.js";
import { Skeleton } from "../components/Skeleton.js";
import { useAgentStatus } from "../hooks/useAgentStatus.js";
import { loadStoredPinnedNotes, saveSelectedAgentId, saveStoredPinnedNotes } from "../features/agent-workspace/storage.js";

interface DaemonWorkspaceNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DaemonWorkspaceNode[];
}

const DEFAULT_PIN_LIMIT = 3;
const EXCLUDED_SEGMENTS = new Set([".git", ".runtime", "node_modules", "dist", "build", ".next", "coverage"]);

function shouldSkipPath(targetPath: string) {
  return targetPath
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function collectMarkdownPaths(nodes: DaemonWorkspaceNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (shouldSkipPath(node.path)) {
      continue;
    }

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

export function AgentWorkspacePinnedFilesPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentLoading, setIsAgentLoading] = useState(true);
  const [availableMarkdownPaths, setAvailableMarkdownPaths] = useState<string[]>([]);
  const [pinnedNotePaths, setPinnedNotePaths] = useState<string[]>([]);
  const [selectedQuickNotePath, setSelectedQuickNotePath] = useState<string | null>(null);
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [quickNoteModifiedAt, setQuickNoteModifiedAt] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [quickNoteError, setQuickNoteError] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isQuickNoteLoading, setIsQuickNoteLoading] = useState(false);

  const agentStatus = useAgentStatus({
    agentId: agent?.id ?? null,
    token,
    initialStatus: agent?.status ?? "idle"
  });

  useEffect(() => {
    if (!agentId || !token) {
      setIsAgentLoading(false);
      setAgent(null);
      setAgentError("Agent not found.");
      return;
    }

    let cancelled = false;

    const loadAgent = async () => {
      setIsAgentLoading(true);
      setAgentError(null);

      try {
        const response = await fetch("/api/agents", {
          headers: {
            authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to load agents");
        }

        const body = (await response.json()) as { items?: Agent[] };
        if (cancelled) {
          return;
        }

        const nextAgents = Array.isArray(body.items) ? body.items : [];
        const matchedAgent = nextAgents.find((entry) => entry.id === agentId) ?? null;
        setAgents(nextAgents);

        if (!matchedAgent) {
          setAgent(null);
          setAgentError("Agent not found.");
          return;
        }

        setAgent(matchedAgent);
        saveSelectedAgentId(matchedAgent.id);
      } catch {
        if (!cancelled) {
          setAgent(null);
          setAgentError("Failed to load agent.");
        }
      } finally {
        if (!cancelled) {
          setIsAgentLoading(false);
        }
      }
    };

    void loadAgent();

    return () => {
      cancelled = true;
    };
  }, [agentId, token]);

  useEffect(() => {
    if (!agent || !token) {
      return;
    }

    let cancelled = false;

    const loadQuickNotes = async () => {
      setIsWorkspaceLoading(true);
      setWorkspaceError(null);

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/files`, {
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
        const storedPaths = loadStoredPinnedNotes(agent.id);
        const validStoredPaths = storedPaths.filter((path) => markdownPaths.includes(path));
        const nextPinnedPaths = validStoredPaths.length > 0 ? validStoredPaths : markdownPaths.slice(0, DEFAULT_PIN_LIMIT);

        setAvailableMarkdownPaths(markdownPaths);
        setPinnedNotePaths(nextPinnedPaths);
        setSelectedQuickNotePath((currentPath) => {
          if (currentPath && nextPinnedPaths.includes(currentPath)) {
            return currentPath;
          }
          return nextPinnedPaths[0] ?? null;
        });
        saveStoredPinnedNotes(agent.id, nextPinnedPaths);
      } catch {
        if (!cancelled) {
          setWorkspaceError("Failed to load markdown preview files.");
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
  }, [agent?.id, token]);

  useEffect(() => {
    if (!agent || !selectedQuickNotePath || !token) {
      return;
    }

    let cancelled = false;

    const loadPreviewFile = async () => {
      setIsQuickNoteLoading(true);
      setQuickNoteError(null);

      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(agent.id)}/files/${encodeURIComponent(selectedQuickNotePath)}`,
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
        setQuickNoteModifiedAt(typeof body.modifiedAt === "string" ? body.modifiedAt : null);
      } catch {
        if (!cancelled) {
          setQuickNoteContent("");
          setQuickNoteModifiedAt(null);
          setQuickNoteError("Failed to load preview file.");
        }
      } finally {
        if (!cancelled) {
          setIsQuickNoteLoading(false);
        }
      }
    };

    void loadPreviewFile();

    return () => {
      cancelled = true;
    };
  }, [agent?.id, selectedQuickNotePath, token]);

  const handlePinnedNoteToggle = useCallback(
    (path: string) => {
      if (!agent) {
        return;
      }

      setPinnedNotePaths((currentPaths) => {
        const nextPaths = currentPaths.includes(path)
          ? currentPaths.filter((entry) => entry !== path)
          : [...currentPaths, path];

        saveStoredPinnedNotes(agent.id, nextPaths);
        setSelectedQuickNotePath((currentPath) => {
          if (nextPaths.length === 0) {
            return null;
          }
          if (currentPath && nextPaths.includes(currentPath)) {
            return currentPath;
          }
          return nextPaths[0];
        });

        return nextPaths;
      });
    },
    [agent]
  );

  const statusLabel = useMemo(() => agentStatus, [agentStatus]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 font-mono text-zinc-200 selection:bg-indigo-500/30">
      <AgentWorkspaceSidebar
        agents={agents}
        selectedAgent={agent}
        activeSection="quick-notes"
        onSelectAgent={(nextAgent) => {
          saveSelectedAgentId(nextAgent.id);
          navigate(`/agents/${encodeURIComponent(nextAgent.id)}/quick-notes`);
        }}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-zinc-800 bg-zinc-900/30 px-8 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">Preview Files</h1>
              <p className="text-xs text-zinc-500">Configure pinned markdown files for quick preview without leaving the main workspace flow.</p>
            </div>
            {agent ? <span className="text-xs capitalize text-zinc-400">{statusLabel}</span> : null}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {isAgentLoading ? (
            <div className="space-y-3">
              <Skeleton variant="line" className="w-40" />
              <Skeleton variant="panel" className="h-96" />
            </div>
          ) : agentError || !agent ? (
            <EmptyState title="Preview files unavailable" message={agentError ?? "Agent not found."} className="h-full" />
          ) : (
            <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <section className="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">Pinned Markdown Files</h2>
                    <p className="mt-1 text-xs text-zinc-500">Only markdown files outside heavy system folders are shown here.</p>
                  </div>
                </div>

                {isWorkspaceLoading ? (
                  <div className="mt-4 space-y-2">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton key={index} variant="line" className="h-5" />
                    ))}
                  </div>
                ) : workspaceError ? (
                  <p className="mt-4 text-xs text-red-400">{workspaceError}</p>
                ) : availableMarkdownPaths.length === 0 ? (
                  <EmptyState title="No markdown files found" message="This agent does not currently expose any previewable markdown files." className="px-0 py-8" />
                ) : (
                  <div className="mt-4 max-h-[38rem] space-y-2 overflow-auto pr-1">
                    {availableMarkdownPaths.map((path) => (
                      <label key={path} className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800/70 px-3 py-3 hover:bg-zinc-800/50">
                        <input
                          type="checkbox"
                          checked={pinnedNotePaths.includes(path)}
                          onChange={() => handlePinnedNoteToggle(path)}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500"
                        />
                        <span className="min-w-0 break-all text-xs text-zinc-300">{path}</span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {pinnedNotePaths.length > 0 ? (
                    pinnedNotePaths.map((path) => (
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
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500">Choose pinned files from the left list to start previewing.</p>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-4">
                  {!selectedQuickNotePath ? (
                    <EmptyState title="Pick a pinned note" message="Pinned files appear here for quick markdown preview." className="px-4 py-10" />
                  ) : isQuickNoteLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="line" className="w-1/2" />
                      <Skeleton variant="line" className="w-1/3 h-3" />
                      <Skeleton variant="panel" className="h-[32rem]" />
                    </div>
                  ) : quickNoteError ? (
                    <p className="text-xs text-red-400">{quickNoteError}</p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="truncate text-xs text-zinc-400">{selectedQuickNotePath}</p>
                        <p className="text-[10px] text-zinc-500">{quickNoteModifiedAt ? `Modified: ${quickNoteModifiedAt}` : "Modified: unknown"}</p>
                      </div>
                      <div className="max-h-[36rem] overflow-auto whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                        {quickNoteContent}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
