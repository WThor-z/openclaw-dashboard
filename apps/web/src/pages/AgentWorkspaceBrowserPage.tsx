import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../app/auth.js";
import { type Agent } from "../components/AgentCard.js";
import { AgentWorkspaceSidebar } from "../components/AgentWorkspaceSidebar.js";
import { EmptyState } from "../components/EmptyState.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { FileTree, WorkspaceFile } from "../components/FileTree.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { MarkdownViewer } from "../components/MarkdownViewer.js";
import { Skeleton } from "../components/Skeleton.js";
import { useAgentStatus } from "../hooks/useAgentStatus.js";
import { saveSelectedAgentId } from "../features/agent-workspace/storage.js";

interface DaemonWorkspaceNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DaemonWorkspaceNode[];
}

function toFileTreeNodes(nodes: DaemonWorkspaceNode[]): WorkspaceFile[] {
  return nodes.map((node) => ({
    name: node.name,
    path: node.path,
    kind: node.isDirectory ? "directory" : "file",
    children: Array.isArray(node.children) ? toFileTreeNodes(node.children) : undefined
  }));
}

function findNodeByPath(items: WorkspaceFile[], targetPath: string): WorkspaceFile | null {
  for (const item of items) {
    if (item.path === targetPath) {
      return item;
    }

    if (item.children) {
      const match = findNodeByPath(item.children, targetPath);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

export function AgentWorkspaceBrowserPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentLoading, setIsAgentLoading] = useState(true);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceFile[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPathKind, setSelectedPathKind] = useState<"file" | "directory" | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [selectedFileModifiedAt, setSelectedFileModifiedAt] = useState<string | null>(null);
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isEditingFile, setIsEditingFile] = useState(false);
  const closeGuardRef = useRef<(() => boolean) | null>(null);
  const agentStatus = useAgentStatus({
    agentId: agent?.id ?? null,
    token,
    initialStatus: agent?.status ?? "idle"
  });

  const loadFileContent = useCallback(
    async (nextAgentId: string, filePath: string) => {
      setIsFileLoading(true);
      setSelectedFileError(null);

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(nextAgentId)}/files/${encodeURIComponent(filePath)}`, {
          headers: {
            authorization: `Bearer ${token ?? ""}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to load file content");
        }

        const body = (await response.json()) as { content?: string; modifiedAt?: string };
        setSelectedFileContent(typeof body.content === "string" ? body.content : "");
        setSelectedFileModifiedAt(typeof body.modifiedAt === "string" ? body.modifiedAt : null);
      } catch {
        setSelectedFileContent("");
        setSelectedFileModifiedAt(null);
        setSelectedFileError("Failed to load file content.");
      } finally {
        setIsFileLoading(false);
      }
    },
    [token]
  );

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

    let isCancelled = false;

    const loadWorkspace = async () => {
      setIsWorkspaceLoading(true);
      setWorkspaceError(null);
      setWorkspaceItems([]);
      setSelectedPath(null);
      setSelectedPathKind(null);
      setSelectedFileContent("");
      setSelectedFileModifiedAt(null);
      setSelectedFileError(null);
      setIsEditingFile(false);
      closeGuardRef.current = null;

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
        if (isCancelled) {
          return;
        }

        setWorkspaceItems(toFileTreeNodes(Array.isArray(body.items) ? body.items : []));
      } catch {
        if (!isCancelled) {
          setWorkspaceError("Failed to load workspace files.");
        }
      } finally {
        if (!isCancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    };

    void loadWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [agent?.id, token]);

  const isEditableTextFile = useMemo(() => {
    if (selectedPathKind !== "file" || !selectedPath) {
      return false;
    }

    return /\.(md|txt)$/i.test(selectedPath);
  }, [selectedPath, selectedPathKind]);

  const handleFileSelect = useCallback(
    (path: string) => {
      const selectedNode = findNodeByPath(workspaceItems, path);
      setSelectedPath(path);
      setSelectedPathKind(selectedNode?.kind ?? null);

      if (!selectedNode || selectedNode.kind === "directory" || !agent) {
        setIsEditingFile(false);
        setSelectedFileError(null);
        setSelectedFileContent("");
        setSelectedFileModifiedAt(null);
        closeGuardRef.current = null;
        return;
      }

      setIsEditingFile(false);
      closeGuardRef.current = null;
      void loadFileContent(agent.id, path);
    },
    [agent, loadFileContent, workspaceItems]
  );

  const handleLeaveEditor = useCallback(() => {
    const guard = closeGuardRef.current;
    if (guard && !guard()) {
      return;
    }

    setIsEditingFile(false);
    closeGuardRef.current = null;
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 font-mono text-zinc-200 selection:bg-indigo-500/30">
      <AgentWorkspaceSidebar
        agents={agents}
        selectedAgent={agent}
        activeSection="workspace"
        onSelectAgent={(nextAgent) => {
          saveSelectedAgentId(nextAgent.id);
          navigate(`/agents/${encodeURIComponent(nextAgent.id)}/workspace`);
        }}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/30 backdrop-blur-md">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-zinc-100">Full Workspace</h1>
            {agent ? <p className="text-xs text-zinc-500 truncate">{agent.name}</p> : null}
          </div>

          {agent ? (
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span
                className={`status-indicator ${
                  agentStatus === "idle"
                    ? "status-idle"
                    : agentStatus === "busy"
                      ? "status-busy"
                      : agentStatus === "offline"
                        ? "status-offline"
                        : "status-error"
                }`}
              />
              <span className="capitalize">{agentStatus}</span>
            </div>
          ) : null}
        </header>

        <div className="flex-1 min-h-0 p-6">
          {isAgentLoading ? (
            <div className="space-y-3">
              <Skeleton variant="line" className="w-40" />
              <Skeleton variant="panel" className="h-96" />
            </div>
          ) : agentError || !agent ? (
            <EmptyState title="Workspace unavailable" message={agentError ?? "Agent not found."} className="h-full" />
          ) : (
            <ErrorBoundary fallbackTitle="Workspace browser failed to render.">
              <div className="h-full min-h-0 border border-zinc-800/70 rounded-lg overflow-hidden bg-zinc-950/40 flex">
                <div className="w-80 min-w-80 border-r border-zinc-800/70 p-3 overflow-auto">
                  {isWorkspaceLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton key={index} variant="line" className="h-5" />
                      ))}
                    </div>
                  ) : workspaceError ? (
                    <EmptyState title="Workspace unavailable" message={workspaceError} className="px-4 py-6" />
                  ) : workspaceItems.length === 0 ? (
                    <EmptyState title="Workspace is empty." className="px-4 py-6" />
                  ) : (
                    <FileTree items={workspaceItems} selectedPath={selectedPath} onSelect={handleFileSelect} />
                  )}
                </div>

                <div className="flex-1 min-w-0 p-4 overflow-auto">
                  {!selectedPath ? (
                    <p className="text-xs text-zinc-500">Select a file to view content.</p>
                  ) : selectedPathKind === "directory" ? (
                    <p className="text-xs text-zinc-500">Selected path is a directory.</p>
                  ) : isFileLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="line" className="w-2/3" />
                      <Skeleton variant="line" className="w-1/3 h-3" />
                      <Skeleton variant="panel" className="h-64" />
                    </div>
                  ) : selectedFileError ? (
                    <p className="text-xs text-red-400">{selectedFileError}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-400 truncate">{selectedPath}</p>
                          <p className="text-[10px] text-zinc-500">
                            {selectedFileModifiedAt ? `Modified: ${selectedFileModifiedAt}` : "Modified: unknown"}
                          </p>
                        </div>

                        {isEditableTextFile ? (
                          isEditingFile ? (
                            <button
                              type="button"
                              onClick={handleLeaveEditor}
                              className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                            >
                              Back to preview
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsEditingFile(true)}
                              className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500"
                            >
                              Edit
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Read only</span>
                        )}
                      </div>

                      {isEditableTextFile && isEditingFile ? (
                        <MarkdownEditor
                          agentId={agent.id}
                          filePath={selectedPath}
                          initialContent={selectedFileContent}
                          onSaved={() => void loadFileContent(agent.id, selectedPath)}
                          onRequestClose={(guard) => {
                            closeGuardRef.current = guard;
                          }}
                        />
                      ) : (
                        <MarkdownViewer content={selectedFileContent} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  );
}
