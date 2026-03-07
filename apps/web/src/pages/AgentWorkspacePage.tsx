import React, { useEffect, useMemo, useState } from "react";

import { useAuth } from "../app/auth.js";
import { useI18n } from "../app/i18n.js";
import { AgentList } from "../components/AgentList.js";
import { type Agent } from "../components/AgentCard.js";
import { AgentWorkspaceSidebar } from "../components/AgentWorkspaceSidebar.js";
import { EmptyState } from "../components/EmptyState.js";
import { MarkdownViewer } from "../components/MarkdownViewer.js";
import { Skeleton } from "../components/Skeleton.js";
import { collectMarkdownPaths, type DaemonWorkspaceNode, sortPreviewPaths } from "../features/agent-workspace/markdown.js";
import { loadSelectedAgentId, loadStoredPinnedNotes, saveSelectedAgentId } from "../features/agent-workspace/storage.js";

export function AgentWorkspacePage() {
  const { t } = useI18n();
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => loadSelectedAgentId());
  const [previewPaths, setPreviewPaths] = useState<string[]>([]);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewModifiedAt, setPreviewModifiedAt] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    if (!selectedAgent) {
      saveSelectedAgentId(null);
      setSelectedAgentId(null);
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    if (!token) {
      setSelectedAgentId(null);
      saveSelectedAgentId(null);
    }
  }, [token]);

  useEffect(() => {
    if (!selectedAgentId || !token) {
      setPreviewPaths([]);
      setSelectedPreviewPath(null);
      setPreviewContent("");
      setPreviewModifiedAt(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;

    const loadPreviewFiles = async () => {
      setIsDrawerLoading(true);
      setPreviewError(null);

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}/files`, {
          headers: { authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error("Failed to load preview files");
        }

        const body = (await response.json()) as { items?: DaemonWorkspaceNode[] };
        if (cancelled) {
          return;
        }

        const markdownPaths = collectMarkdownPaths(Array.isArray(body.items) ? body.items : []);
        const pinnedPaths = loadStoredPinnedNotes(selectedAgentId);
        const availablePinnedPaths = markdownPaths.filter((path) => pinnedPaths.includes(path));
        const nextPaths = sortPreviewPaths(availablePinnedPaths, pinnedPaths);
        setPreviewPaths(nextPaths);
        setSelectedPreviewPath((currentPath) => (currentPath && nextPaths.includes(currentPath) ? currentPath : nextPaths[0] ?? null));
      } catch {
        if (!cancelled) {
          setPreviewPaths([]);
          setSelectedPreviewPath(null);
          setPreviewError(t("workspace.preview.unavailable"));
        }
      } finally {
        if (!cancelled) {
          setIsDrawerLoading(false);
        }
      }
    };

    void loadPreviewFiles();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, t, token]);

  useEffect(() => {
    if (!selectedAgentId || !selectedPreviewPath || !token) {
      setPreviewContent("");
      setPreviewModifiedAt(null);
      return;
    }

    let cancelled = false;

    const loadPreviewContent = async () => {
      setIsPreviewLoading(true);
      setPreviewError(null);

      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(selectedAgentId)}/files/${encodeURIComponent(selectedPreviewPath)}`,
          { headers: { authorization: `Bearer ${token}` } }
        );

        if (!response.ok) {
          throw new Error("Failed to load preview content");
        }

        const body = (await response.json()) as { content?: string; modifiedAt?: string };
        if (cancelled) {
          return;
        }

        setPreviewContent(typeof body.content === "string" ? body.content : "");
        setPreviewModifiedAt(typeof body.modifiedAt === "string" ? body.modifiedAt : null);
      } catch {
        if (!cancelled) {
          setPreviewContent("");
          setPreviewModifiedAt(null);
          setPreviewError(t("workspace.preview.unavailable"));
        }
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      }
    };

    void loadPreviewContent();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, selectedPreviewPath, t, token]);

  const onlineCount = agents.filter((agent) => agent.status !== "offline").length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-slate-800 selection:bg-[#dbe9ff]">
      <AgentWorkspaceSidebar agents={agents} currentAgentId={selectedAgentId} activeSection="overview" />

      <main className="relative flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-b border-slate-200 bg-white/80 px-10 py-5 backdrop-blur-md">
            <h1 data-testid="agent-workspace-title" className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>
              {t("workspace.overview.title")}
            </h1>
          </header>

          <div className="flex-1 overflow-y-auto p-10" data-testid="agent-list-placeholder">
            <div className="mx-auto max-w-[1180px] space-y-7">
              <div data-testid="drawer-placeholder" className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">{t("workspace.overview.card.overview")}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>{agents.length}</p>
                  <p className="mt-2 text-xs text-slate-600">{t("workspace.overview.trackedAgents")}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-emerald-700">{t("workspace.overview.card.online")}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>{onlineCount}</p>
                  <p className="mt-2 text-xs text-slate-600">{t("workspace.overview.openPreviewHint")}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <AgentList
                  onAgentClick={(agent) => {
                    setSelectedAgentId(agent.id);
                    saveSelectedAgentId(agent.id);
                  }}
                  onAgentsChange={setAgents}
                />
              </div>
            </div>
          </div>
        </div>

        {selectedAgent ? (
          <>
              <button
                type="button"
                aria-label={t("workspace.preview.close")}
                className="absolute inset-0 z-20 bg-slate-900/10 backdrop-blur-[1px]"
                onClick={() => setSelectedAgentId(null)}
              />

            <aside
              data-testid="preview-drawer"
              className="absolute inset-y-0 right-0 z-30 flex w-full max-w-full flex-col border-l border-slate-200 bg-white shadow-[-20px_0_48px_rgba(18,43,74,0.16)] md:w-[clamp(42rem,58vw,74rem)]"
            >
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">{t("workspace.preview.label")}</p>
                  <h2 className="mt-2 truncate text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>{selectedAgent.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-500">{selectedAgent.role}</p>
                </div>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                    onClick={() => setSelectedAgentId(null)}
                >
                  {t("workspace.preview.close")}
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden p-6">
              {isDrawerLoading ? (
                <div className="space-y-3">
                  <Skeleton variant="line" className="w-1/2" />
                  <Skeleton variant="panel" className="h-72" />
                </div>
              ) : previewError ? (
                <EmptyState title={t("workspace.preview.unavailable")} message={previewError} className="h-full" />
              ) : previewPaths.length === 0 ? (
                <EmptyState title={t("workspace.preview.none")} message={t("workspace.preview.noneHint")} className="h-full" />
              ) : (
                <>
                  <ul className="rounded-xl border border-slate-200 bg-slate-50/70" aria-label={t("workspace.pinned.title")}>
                    {previewPaths.map((path, index) => (
                      <li key={path} className={index > 0 ? "border-t border-slate-200" : ""}>
                        <div
                          role="option"
                          aria-selected={selectedPreviewPath === path}
                          tabIndex={0}
                          onClick={() => setSelectedPreviewPath(path)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedPreviewPath(path);
                            }
                          }}
                          className={`flex cursor-pointer items-center justify-between px-4 py-2 text-left text-xs transition-colors ${
                            selectedPreviewPath === path ? "bg-[#ecf3ff] text-[#123f77]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          <span className="truncate">{path}</span>
                          {selectedPreviewPath === path ? <span className="ml-3 text-[10px] uppercase tracking-[0.24em] text-[#1f5ba6]">{t("workspace.preview.open")}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    {isPreviewLoading ? (
                      <div className="space-y-3">
                        <Skeleton variant="line" className="w-1/3" />
                        <Skeleton variant="panel" className="h-[28rem]" />
                      </div>
                    ) : selectedPreviewPath ? (
                      <div className="space-y-3">
                        <div>
                          <p className="truncate text-xs text-slate-600">{selectedPreviewPath}</p>
                          <p className="text-[10px] text-slate-500">{previewModifiedAt ? t("workspace.preview.modifiedPrefix", { value: previewModifiedAt }) : t("workspace.preview.modifiedUnknown")}</p>
                        </div>
                        <MarkdownViewer content={previewContent} showToc />
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
