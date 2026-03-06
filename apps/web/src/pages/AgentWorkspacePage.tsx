import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentList } from "../components/AgentList.js";
import { Agent } from "../components/AgentCard.js";
import { EmptyState } from "../components/EmptyState.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { FileTree, WorkspaceFile } from "../components/FileTree.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { MarkdownViewer } from "../components/MarkdownViewer.js";
import { Skeleton } from "../components/Skeleton.js";
import { useAuth } from "../app/auth.js";
import { useAgentStatus } from "../hooks/useAgentStatus.js";

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

export function AgentWorkspacePage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceFile[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPathKind, setSelectedPathKind] = useState<"file" | "directory" | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>("");
  const [selectedFileModifiedAt, setSelectedFileModifiedAt] = useState<string | null>(null);
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isEditingFile, setIsEditingFile] = useState(false);
  const closeGuardRef = useRef<(() => boolean) | null>(null);
  const { token } = useAuth();
  const selectedAgentStatus = useAgentStatus({
    agentId: isDrawerOpen ? selectedAgent?.id ?? null : null,
    token,
    initialStatus: selectedAgent?.status ?? "offline"
  });

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsDrawerOpen(true);
  };

  const closeDrawer = useCallback(() => {
    const guard = closeGuardRef.current;
    if (guard && !guard()) {
      return;
    }

    setIsDrawerOpen(false);
    setIsEditingFile(false);
    closeGuardRef.current = null;
  }, []);

  const loadFileContent = useCallback(
    async (agentId: string, filePath: string) => {
      setIsFileLoading(true);
      setSelectedFileError(null);

      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filePath)}`,
          {
            headers: {
              authorization: `Bearer ${token ?? ""}`
            }
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load file content");
        }

        const body = (await response.json()) as {
          content?: string;
          modifiedAt?: string;
        };

        setSelectedFileContent(typeof body.content === "string" ? body.content : "");
        setSelectedFileModifiedAt(
          typeof body.modifiedAt === "string" && body.modifiedAt.length > 0 ? body.modifiedAt : null
        );
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
    if (!isDrawerOpen || !selectedAgent) {
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
        const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.id)}/files`, {
          headers: {
            authorization: `Bearer ${token ?? ""}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to load workspace files");
        }

        const body = (await response.json()) as { items?: DaemonWorkspaceNode[] };
        if (isCancelled) {
          return;
        }

        const sourceItems = Array.isArray(body.items) ? body.items : [];
        setWorkspaceItems(toFileTreeNodes(sourceItems));
      } catch {
        if (isCancelled) {
          return;
        }
        setWorkspaceError("Failed to load workspace files.");
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
  }, [isDrawerOpen, selectedAgent, token]);

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

      if (!selectedNode || selectedNode.kind === "directory" || !selectedAgent) {
        setIsEditingFile(false);
        setSelectedFileError(null);
        setSelectedFileContent("");
        setSelectedFileModifiedAt(null);
        closeGuardRef.current = null;
        return;
      }

      setIsEditingFile(false);
      closeGuardRef.current = null;
      void loadFileContent(selectedAgent.id, path);
    },
    [loadFileContent, selectedAgent, workspaceItems]
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
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-200 font-mono selection:bg-indigo-500/30 overflow-hidden">
      {/* Sidebar */}
      <aside 
        data-testid="drawer-placeholder"
        className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col"
      >
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-indigo-400">
            <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase">System Active</span>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-2">
          <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-zinc-800 rounded animate-pulse delay-75" />
          <div className="h-4 w-2/3 bg-zinc-800 rounded animate-pulse delay-150" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-900/30 backdrop-blur-md">
          <h1 
            data-testid="agent-workspace-title"
            className="text-xl font-bold tracking-tight text-zinc-100"
          >
            Agent Workspace
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-8" data-testid="agent-list-placeholder">
          <div className="max-w-6xl mx-auto">
            <AgentList onAgentClick={handleAgentClick} />
          </div>
        </div>

        {/* Right-side Drawer */}
        {isDrawerOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={closeDrawer}
          />
        )}
        
        <div 
          className={`fixed top-0 right-0 h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 transition-transform duration-300 ease-in-out transform ${
            isDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: "600px", maxWidth: "100vw" }}
        >
          {selectedAgent && (
            <div className="flex flex-col h-full">
              <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                  </div>
                  <h2 className="font-bold text-zinc-100">{selectedAgent.name}</h2>
                </div>
                <button 
                  onClick={closeDrawer}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              
              <div className="flex-1 min-h-0 flex flex-col p-6 gap-6">
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Identity</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4">
                      <span className="block text-[10px] text-zinc-500 uppercase mb-1">Agent ID</span>
                      <span className="text-sm font-mono text-zinc-300">{selectedAgent.id}</span>
                    </div>
                    <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4">
                      <span className="block text-[10px] text-zinc-500 uppercase mb-1">Role</span>
                      <span className="text-sm text-zinc-300">{selectedAgent.role}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Status</h3>
                  <div className="flex items-center gap-4 bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4">
                    <span className={`status-indicator ${
                      selectedAgentStatus === "idle" ? "status-idle" :
                      selectedAgentStatus === "busy" ? "status-busy" :
                      selectedAgentStatus === "offline" ? "status-offline" :
                      "status-error"
                    }`} />
                    <span className="text-sm text-zinc-300 capitalize">{selectedAgentStatus}</span>
                  </div>
                </section>

                <section className="flex-1 min-h-0">
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Workspace</h3>
                  <ErrorBoundary fallbackTitle="Workspace pane failed to render.">
                    <div className="h-full min-h-0 border border-zinc-800/70 rounded-lg overflow-hidden bg-zinc-950/40 flex">
                      <div className="w-72 min-w-72 border-r border-zinc-800/70 p-3 overflow-auto">
                        {isWorkspaceLoading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, index) => (
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
                                agentId={selectedAgent.id}
                                filePath={selectedPath}
                                initialContent={selectedFileContent}
                                onSaved={() => void loadFileContent(selectedAgent.id, selectedPath)}
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
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
