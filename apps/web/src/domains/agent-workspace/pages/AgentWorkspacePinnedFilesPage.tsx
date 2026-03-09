import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../../app/auth.js";
import { useI18n } from "../../../app/i18n.js";
import { type Agent } from "../../../shared/components/AgentCard.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { Skeleton } from "../../../shared/components/Skeleton.js";
import { AgentWorkspaceSidebar } from "../components/AgentWorkspaceSidebar.js";
import { collectMarkdownPaths, type DaemonWorkspaceNode } from "../lib/markdown.js";
import { loadStoredPinnedNotes, saveSelectedAgentId, saveStoredPinnedNotes } from "../lib/storage.js";

export function AgentWorkspacePinnedFilesPage() {
  const { t } = useI18n();
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentLoading, setIsAgentLoading] = useState(true);
  const [availableMarkdownPaths, setAvailableMarkdownPaths] = useState<string[]>([]);
  const [pinnedNotePaths, setPinnedNotePaths] = useState<string[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);

  useEffect(() => {
    if (!agentId || !token) {
      setIsAgentLoading(false);
      setAgent(null);
      setAgentError(t("workspace.pinned.unavailable"));
      return;
    }

    let cancelled = false;

    const loadAgent = async () => {
      setIsAgentLoading(true);
      setAgentError(null);

      try {
        const response = await fetch("/api/agents", {
          headers: { authorization: `Bearer ${token}` }
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
          setAgentError(t("workspace.pinned.unavailable"));
          return;
        }

        setAgent(matchedAgent);
        saveSelectedAgentId(matchedAgent.id);
      } catch {
        if (!cancelled) {
          setAgent(null);
          setAgentError(t("workspace.pinned.unavailable"));
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
  }, [agentId, t, token]);

  useEffect(() => {
    if (!agent || !token) {
      return;
    }

    let cancelled = false;

    const loadMarkdownFiles = async () => {
      setIsWorkspaceLoading(true);
      setWorkspaceError(null);

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/files`, {
          headers: { authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error("Failed to load workspace files");
        }

        const body = (await response.json()) as { items?: DaemonWorkspaceNode[] };
        if (cancelled) {
          return;
        }

        const markdownPaths = collectMarkdownPaths(Array.isArray(body.items) ? body.items : []);
        const storedPaths = loadStoredPinnedNotes(agent.id).filter((path) => markdownPaths.includes(path));
        setAvailableMarkdownPaths(markdownPaths);
        setPinnedNotePaths(storedPaths);
      } catch {
        if (!cancelled) {
          setWorkspaceError(t("workspace.pinned.unavailable"));
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    };

    void loadMarkdownFiles();

    return () => {
      cancelled = true;
    };
  }, [agent, t, token]);

  const togglePinnedPath = useCallback(
    (path: string) => {
      if (!agent) {
        return;
      }

      setPinnedNotePaths((currentPaths) => {
        const nextPaths = currentPaths.includes(path)
          ? currentPaths.filter((entry) => entry !== path)
          : [...currentPaths, path];

        saveStoredPinnedNotes(agent.id, nextPaths);
        return nextPaths;
      });
    },
    [agent]
  );

  const handleAgentSelection = useCallback(
    (nextAgentId: string) => {
      saveSelectedAgentId(nextAgentId);
      navigate(`/agents/${encodeURIComponent(nextAgentId)}/pinned-files`);
    },
    [navigate]
  );

  const pinnedCountLabel = useMemo(() => t("workspace.pinned.selectedCount", { count: pinnedNotePaths.length }), [pinnedNotePaths.length, t]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-slate-800 selection:bg-[#dbe9ff]">
      <AgentWorkspaceSidebar agents={agents} currentAgentId={agent?.id ?? null} activeSection="pinned-files" />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-slate-200 bg-white/80 px-10 py-5 backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>
              {t("workspace.pinned.title")}
            </h1>
          </header>

        <div className="flex-1 overflow-y-auto p-10">
          {isAgentLoading ? (
            <div className="space-y-3">
              <Skeleton variant="line" className="w-40" />
              <Skeleton variant="panel" className="h-96" />
            </div>
          ) : agentError || !agent ? (
            <EmptyState title={t("workspace.pinned.unavailable")} message={agentError ?? t("workspace.pinned.unavailable")} className="h-full" />
          ) : (
            <div className="mx-auto max-w-[900px] space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">{t("workspace.pinned.configuration")}</p>
                    <h2 className="mt-3 text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>{agent.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{t("workspace.pinned.selectForAgent")}</p>
                  </div>

                  <div className="flex items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500" htmlFor="pinned-files-agent-select">
                      {t("workspace.pinned.agent")}
                      <select
                        id="pinned-files-agent-select"
                        value={agent.id}
                        onChange={(event) => handleAgentSelection(event.target.value)}
                        className="min-w-[13rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 focus:border-[#1f5ba6] focus:outline-none focus:ring-2 focus:ring-[#1f5ba6]/20"
                      >
                        {agents.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{pinnedCountLabel}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {isWorkspaceLoading ? (
                  <div className="space-y-2">
                    {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6", "sk-7", "sk-8"].map((skeletonId) => (
                      <Skeleton key={skeletonId} variant="line" className="h-6" />
                    ))}
                  </div>
                ) : workspaceError ? (
                  <p className="text-sm text-rose-700">{workspaceError}</p>
                ) : availableMarkdownPaths.length === 0 ? (
                    <EmptyState title={t("workspace.pinned.noMarkdown")} message={t("workspace.pinned.noMarkdownHint")} className="px-0 py-8" />
                ) : (
                  <div className="space-y-2">
                    {availableMarkdownPaths.map((path) => (
                      <label key={path} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={pinnedNotePaths.includes(path)}
                          onChange={() => togglePinnedPath(path)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 bg-white text-[#1f5ba6] focus:ring-[#1f5ba6]"
                        />
                        <span className="min-w-0 break-all text-sm text-slate-700">{path}</span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate("/dashboard")}
                >
                  {t("workspace.pinned.backToOverview")}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
