import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../../app/auth.js";
import { useI18n } from "../../../app/i18n.js";
import { type Agent } from "../../../shared/components/AgentCard.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { ErrorBoundary } from "../../../shared/components/ErrorBoundary.js";
import { FileTree, WorkspaceFile } from "../../../shared/components/FileTree.js";
import { MarkdownEditor } from "../../../shared/components/MarkdownEditor.js";
import { MarkdownViewer } from "../../../shared/components/MarkdownViewer.js";
import { Skeleton } from "../../../shared/components/Skeleton.js";
import { useAgentStatus } from "../../../shared/hooks/useAgentStatus.js";
import { AgentWorkspaceSidebar } from "../components/AgentWorkspaceSidebar.js";
import { saveSelectedAgentId } from "../lib/storage.js";

interface DaemonWorkspaceNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DaemonWorkspaceNode[];
}

type ContextTargetKind = "file" | "directory" | "background";

type ContextMenuState = {
  x: number;
  y: number;
  kind: ContextTargetKind;
  path: string | null;
  directoryPath: string;
};

type MoveDialogState = {
  path: string;
  kind: "file" | "directory";
  targetDirectory: string;
};

type ControlMutationError = Error & {
  status?: number;
};

type ControlMutationResponse = {
  ok: boolean;
  path?: string;
  nextPath?: string;
  modifiedAt?: string;
};

type OperationDialogState =
  | {
    mode: "create-file" | "create-folder";
    directoryPath: string;
    value: string;
  }
  | {
    mode: "rename";
    path: string;
    kind: "file" | "directory";
    value: string;
  }
  | {
    mode: "delete";
    path: string;
    kind: "file" | "directory";
  };

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

const EDITABLE_FILE_PATTERN = /\.(md|txt)$/i;

function isEditableFilePath(filePath: string | null) {
  return typeof filePath === "string" && EDITABLE_FILE_PATTERN.test(filePath);
}

function resolveParentDirectoryPath(targetPath: string) {
  const normalized = targetPath.replace(/\\+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex) : "";
}

function joinRelativePath(directoryPath: string, fileName: string) {
  return directoryPath.length > 0 ? `${directoryPath}/${fileName}` : fileName;
}

function collectDirectoryPaths(items: WorkspaceFile[]) {
  const directories = new Set<string>();
  directories.add("");

  const traverse = (nodes: WorkspaceFile[]) => {
    for (const node of nodes) {
      if (node.kind === "directory") {
        directories.add(node.path);
        if (Array.isArray(node.children) && node.children.length > 0) {
          traverse(node.children);
        }
      }
    }
  };

  traverse(items);
  return [...directories].sort((left, right) => left.localeCompare(right));
}

export function AgentWorkspaceBrowserPage() {
  const { t } = useI18n();
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
  const [isFileOperationLoading, setIsFileOperationLoading] = useState(false);
  const [fileOperationError, setFileOperationError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);
  const [operationDialog, setOperationDialog] = useState<OperationDialogState | null>(null);
  const closeGuardRef = useRef<(() => boolean) | null>(null);
  const treePanelRef = useRef<HTMLDivElement | null>(null);
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

  const armWrites = useCallback(async () => {
    const response = await fetch("/api/control/arm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token ?? ""}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed to arm writes");
    }
  }, [token]);

  const loadWorkspaceTree = useCallback(
    async (nextAgentId: string, options: { resetSelection: boolean }) => {
      setIsWorkspaceLoading(true);
      setWorkspaceError(null);
      setFileOperationError(null);

      if (options.resetSelection) {
        setWorkspaceItems([]);
        setSelectedPath(null);
        setSelectedPathKind(null);
        setSelectedFileContent("");
        setSelectedFileModifiedAt(null);
        setSelectedFileError(null);
        setIsEditingFile(false);
        closeGuardRef.current = null;
      }

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(nextAgentId)}/files`, {
          headers: {
            authorization: `Bearer ${token ?? ""}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to load workspace files");
        }

        const body = (await response.json()) as { items?: DaemonWorkspaceNode[] };
        setWorkspaceItems(toFileTreeNodes(Array.isArray(body.items) ? body.items : []));
      } catch {
        setWorkspaceError("Failed to load workspace files.");
      } finally {
        setIsWorkspaceLoading(false);
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

    void loadWorkspaceTree(agent.id, { resetSelection: true });
  }, [agent, loadWorkspaceTree, token]);

  const isEditableTextFile = useMemo(() => {
    if (selectedPathKind !== "file" || !selectedPath) {
      return false;
    }

    return isEditableFilePath(selectedPath);
  }, [selectedPath, selectedPathKind]);

  const directoryPaths = useMemo(() => collectDirectoryPaths(workspaceItems), [workspaceItems]);

  const getMutationStatus = useCallback((error: unknown) => {
    if (!error || typeof error !== "object") {
      return null;
    }

    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }, []);

  const sendControlMutation = useCallback(
    async <T extends object>(url: string, body: T, idempotencySeed: string) => {
      await armWrites();

      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
          "idempotency-key": `${Date.now()}-${idempotencySeed}-${Math.random().toString(36).slice(2)}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        let message = `Request failed (${response.status}) at ${url}.`;
        const cloned = response.clone();
        try {
          const errorBody = (await cloned.json()) as { error?: { message?: string } };
          if (typeof errorBody?.error?.message === "string" && errorBody.error.message.trim().length > 0) {
            message = errorBody.error.message;
          }
        } catch {
          try {
            const textBody = (await response.text()).trim();
            if (textBody.length > 0) {
              message = `${message} ${textBody.slice(0, 180)}`;
            }
          } catch {
            // keep fallback message
          }
        }

        if (response.status === 404 && message === `Request failed (${response.status}) at ${url}.`) {
          message = `Control API route not found (${url}). Restart daemon with latest code.`;
        }

        const mutationError = new Error(message) as ControlMutationError;
        mutationError.status = response.status;
        throw mutationError;
      }

      return (await response.json()) as ControlMutationResponse;
    },
    [armWrites, token]
  );

  const handleCreateFileAt = useCallback(
    async (filePath: string) => {
      if (!agent) {
        return;
      }

      const normalizedPath = filePath.trim().replace(/\\+/g, "/").replace(/^\/+/, "");
      if (!isEditableFilePath(normalizedPath)) {
        setFileOperationError("Only .md and .txt files are supported for file operations.");
        return;
      }

      setIsFileOperationLoading(true);
      setFileOperationError(null);
      try {
        try {
          await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/files/create`, { path: normalizedPath, content: "" }, "file-create");
        } catch (error) {
          if (getMutationStatus(error) !== 404) {
            throw error;
          }

          await sendControlMutation(
            `/api/control/agents/${encodeURIComponent(agent.id)}/files/${encodeURIComponent(normalizedPath)}`,
            { content: "" },
            "file-create-legacy"
          );
        }

        await loadWorkspaceTree(agent.id, { resetSelection: false });
        setSelectedPath(normalizedPath);
        setSelectedPathKind("file");
        await loadFileContent(agent.id, normalizedPath);
        setIsEditingFile(true);
      } catch (error) {
        setFileOperationError(error instanceof Error ? error.message : "Failed to create file.");
      } finally {
        setIsFileOperationLoading(false);
      }
    },
    [agent, getMutationStatus, loadFileContent, loadWorkspaceTree, sendControlMutation]
  );

  const handleCreateFolderAt = useCallback(
    async (directoryPath: string) => {
      if (!agent) {
        return;
      }

      const normalizedPath = directoryPath.trim().replace(/\\+/g, "/").replace(/^\/+/, "");
      if (normalizedPath.length === 0) {
        setFileOperationError("Folder path is required.");
        return;
      }

      setIsFileOperationLoading(true);
      setFileOperationError(null);
      try {
        await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/folders/create`, { path: normalizedPath }, "folder-create");
        await loadWorkspaceTree(agent.id, { resetSelection: false });
      } catch (error) {
        setFileOperationError(error instanceof Error ? error.message : "Failed to create folder.");
      } finally {
        setIsFileOperationLoading(false);
      }
    },
    [agent, loadWorkspaceTree, sendControlMutation]
  );

  const handleRenamePath = useCallback(
    async (pathToRename: string, kind: "file" | "directory", nextName: string) => {
      if (!agent) {
        return;
      }

      const parent = resolveParentDirectoryPath(pathToRename);
      const trimmedName = nextName.trim();
      if (!trimmedName) {
        setFileOperationError("Name is required.");
        return;
      }

      const targetPath = joinRelativePath(parent, trimmedName);

      setIsFileOperationLoading(true);
      setFileOperationError(null);
      try {
        const body = await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/paths/rename`, { path: pathToRename, nextPath: targetPath }, "path-rename");
        await loadWorkspaceTree(agent.id, { resetSelection: false });
        const nextPath = typeof body.nextPath === "string" ? body.nextPath : targetPath;
        setSelectedPath(nextPath);
        setSelectedPathKind(kind);
        if (kind === "file") {
          await loadFileContent(agent.id, nextPath);
        }
      } catch (error) {
        setFileOperationError(error instanceof Error ? error.message : "Failed to rename path.");
      } finally {
        setIsFileOperationLoading(false);
      }
    },
    [agent, loadFileContent, loadWorkspaceTree, sendControlMutation]
  );

  const handleDeletePath = useCallback(
    async (pathToDelete: string, kind: "file" | "directory") => {
      if (!agent) {
        return;
      }

      setIsFileOperationLoading(true);
      setFileOperationError(null);
      try {
        if (kind === "file") {
          try {
            await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/paths/delete`, { path: pathToDelete, recursive: true }, "path-delete");
          } catch (error) {
            if (getMutationStatus(error) !== 404) {
              throw error;
            }

            try {
              await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/files/delete`, { path: pathToDelete }, "file-delete-legacy-body");
            } catch (legacyError) {
              if (getMutationStatus(legacyError) !== 404) {
                throw legacyError;
              }

              await sendControlMutation(
                `/api/control/agents/${encodeURIComponent(agent.id)}/files/${encodeURIComponent(pathToDelete)}/delete`,
                {},
                "file-delete-legacy-path"
              );
            }
          }
        } else {
          await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/paths/delete`, { path: pathToDelete, recursive: true }, "path-delete");
        }

        await loadWorkspaceTree(agent.id, { resetSelection: false });
        if (selectedPath === pathToDelete || selectedPath?.startsWith(`${pathToDelete}/`)) {
          setSelectedPath(null);
          setSelectedPathKind(null);
          setSelectedFileContent("");
          setSelectedFileModifiedAt(null);
          setSelectedFileError(null);
          setIsEditingFile(false);
          closeGuardRef.current = null;
        }
      } catch (error) {
        setFileOperationError(error instanceof Error ? error.message : "Failed to delete path.");
      } finally {
        setIsFileOperationLoading(false);
      }
    },
    [agent, getMutationStatus, loadWorkspaceTree, selectedPath, sendControlMutation]
  );

  const handleMovePath = useCallback(
    async (pathToMove: string, kind: "file" | "directory", targetDirectory: string) => {
      if (!agent) {
        return;
      }

      setIsFileOperationLoading(true);
      setFileOperationError(null);
      try {
        let body: ControlMutationResponse;
        try {
          body = await sendControlMutation(`/api/control/agents/${encodeURIComponent(agent.id)}/paths/move`, { path: pathToMove, targetDirectory }, "path-move");
        } catch (error) {
          if (getMutationStatus(error) !== 404) {
            throw error;
          }

          const pathSegments = pathToMove.split("/").filter((segment) => segment.length > 0);
          const sourceName = pathSegments[pathSegments.length - 1];
          if (!sourceName) {
            throw error;
          }

          const legacyTargetPath = joinRelativePath(targetDirectory, sourceName);
          body = await sendControlMutation(
            `/api/control/agents/${encodeURIComponent(agent.id)}/paths/rename`,
            { path: pathToMove, nextPath: legacyTargetPath },
            "path-move-legacy-rename"
          );
        }

        await loadWorkspaceTree(agent.id, { resetSelection: false });
        const nextPath = typeof body.nextPath === "string" ? body.nextPath : null;
        if (nextPath) {
          setSelectedPath(nextPath);
          setSelectedPathKind(kind);
          if (kind === "file") {
            await loadFileContent(agent.id, nextPath);
          }
        }
      } catch (error) {
        setFileOperationError(error instanceof Error ? error.message : "Failed to move path.");
      } finally {
        setIsFileOperationLoading(false);
      }
    },
    [agent, getMutationStatus, loadFileContent, loadWorkspaceTree, sendControlMutation]
  );

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

  const openContextMenu = useCallback((payload: Omit<ContextMenuState, "directoryPath"> & { directoryPath?: string }) => {
    const nextDirectory = payload.directoryPath ?? (payload.kind === "directory" ? payload.path ?? "" : payload.path ? resolveParentDirectoryPath(payload.path) : "");
    setContextMenu({
      x: payload.x,
      y: payload.y,
      kind: payload.kind,
      path: payload.path,
      directoryPath: nextDirectory
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const onPointerDown = () => {
      setContextMenu(null);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [contextMenu]);

  const runContextAction = useCallback(
    async (action: "create-file" | "create-folder" | "rename" | "delete" | "move") => {
      if (!contextMenu) {
        return;
      }

      const targetPath = contextMenu.path;
      const targetKind = contextMenu.kind;
      const directoryPath = contextMenu.directoryPath;
      closeContextMenu();

      if (action === "create-file") {
        setOperationDialog({
          mode: "create-file",
          directoryPath,
          value: joinRelativePath(directoryPath, "new-note.md")
        });
        return;
      }

      if (action === "create-folder") {
        setOperationDialog({
          mode: "create-folder",
          directoryPath,
          value: joinRelativePath(directoryPath, "new-folder")
        });
        return;
      }

      if (!targetPath || targetKind === "background") {
        return;
      }

      if (action === "rename") {
        setOperationDialog({
          mode: "rename",
          path: targetPath,
          kind: targetKind,
          value: targetPath.split("/").pop() ?? targetPath
        });
        return;
      }

      if (action === "delete") {
        setOperationDialog({
          mode: "delete",
          path: targetPath,
          kind: targetKind
        });
        return;
      }

      if (action === "move") {
        const defaultTarget = targetKind === "file" ? resolveParentDirectoryPath(targetPath) : "";
        setMoveDialog({
          path: targetPath,
          kind: targetKind,
          targetDirectory: defaultTarget
        });
      }
    },
    [closeContextMenu, contextMenu]
  );

  const handleSubmitOperationDialog = useCallback(async () => {
    if (!operationDialog) {
      return;
    }

    if (operationDialog.mode === "create-file") {
      await handleCreateFileAt(operationDialog.value);
      setOperationDialog(null);
      return;
    }

    if (operationDialog.mode === "create-folder") {
      await handleCreateFolderAt(operationDialog.value);
      setOperationDialog(null);
      return;
    }

    if (operationDialog.mode === "rename") {
      await handleRenamePath(operationDialog.path, operationDialog.kind, operationDialog.value);
      setOperationDialog(null);
      return;
    }

    if (operationDialog.mode === "delete") {
      await handleDeletePath(operationDialog.path, operationDialog.kind);
      setOperationDialog(null);
    }
  }, [handleCreateFileAt, handleCreateFolderAt, handleDeletePath, handleRenamePath, operationDialog]);

  const handleSubmitMoveDialog = useCallback(async () => {
    if (!moveDialog) {
      return;
    }

    await handleMovePath(moveDialog.path, moveDialog.kind, moveDialog.targetDirectory);
    setMoveDialog(null);
  }, [handleMovePath, moveDialog]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-slate-800 selection:bg-[#dbe9ff]">
      <AgentWorkspaceSidebar
        agents={agents}
        currentAgentId={agent?.id ?? null}
        activeSection="workspace"
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-slate-200 bg-white/80 px-10 py-5 backdrop-blur-md">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>{t("workspace.browser.title")}</h1>
            {agent ? <p className="text-xs text-slate-600 truncate">{agent.name}</p> : null}
          </div>
        </header>

        <div className="flex-1 min-h-0 p-10">
          {isAgentLoading ? (
            <div className="space-y-3">
              <Skeleton variant="line" className="w-40" />
              <Skeleton variant="panel" className="h-96" />
            </div>
          ) : agentError || !agent ? (
            <EmptyState title="Workspace unavailable" message={agentError ?? "Agent not found."} className="h-full" />
          ) : (
            <ErrorBoundary fallbackTitle="Workspace browser failed to render.">
              <div className="relative mx-auto flex h-full min-h-0 max-w-[1240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <aside
                  ref={treePanelRef}
                  className="relative w-80 min-w-80 overflow-auto border-r border-slate-200 bg-slate-50/60 p-3"
                  onContextMenu={(event) => {
                    if (event.target !== event.currentTarget) {
                      return;
                    }

                    event.preventDefault();
                    openContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      kind: "background",
                      path: null,
                      directoryPath: ""
                    });
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourcePath = event.dataTransfer.getData("application/x-openclaw-path");
                    const sourceKind = event.dataTransfer.getData("application/x-openclaw-kind");
                    if (!sourcePath || (sourceKind !== "file" && sourceKind !== "directory")) {
                      return;
                    }

                    void handleMovePath(sourcePath, sourceKind, "");
                  }}
                >
                  <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">{t("workspace.browser.hint")}</p>
                  {fileOperationError ? <p className="mb-2 px-2 text-xs text-rose-700">{fileOperationError}</p> : null}

                  {isWorkspaceLoading ? (
                    <div className="space-y-2">
                      {["b-1", "b-2", "b-3", "b-4", "b-5", "b-6", "b-7", "b-8"].map((skeletonId) => (
                        <Skeleton key={skeletonId} variant="line" className="h-5" />
                      ))}
                    </div>
                  ) : workspaceError ? (
                    <EmptyState title="Workspace unavailable" message={workspaceError} className="px-4 py-6" />
                  ) : workspaceItems.length === 0 ? (
                    <EmptyState title="Workspace is empty." className="px-4 py-6" />
                  ) : (
                    <FileTree
                      items={workspaceItems}
                      selectedPath={selectedPath}
                      onSelect={handleFileSelect}
                      onMoveRequest={({ sourcePath, sourceKind, targetDirectory }) => {
                        void handleMovePath(sourcePath, sourceKind, targetDirectory);
                      }}
                      onContextMenu={(payload) => {
                        openContextMenu({
                          x: payload.clientX,
                          y: payload.clientY,
                          kind: payload.kind,
                          path: payload.path
                        });
                      }}
                    />
                  )}

                  {contextMenu ? (
                    <div
                      className="fixed z-50 min-w-[13rem] rounded-lg border border-slate-300 bg-white p-1 shadow-xl"
                      style={{ left: contextMenu.x, top: contextMenu.y }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <button type="button" className="block w-full rounded px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => void runContextAction("create-file")}>{t("workspace.browser.newFile")}</button>
                      <button type="button" className="block w-full rounded px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => void runContextAction("create-folder")}>{t("workspace.browser.newFolder")}</button>
                      {contextMenu.path && contextMenu.kind !== "background" ? (
                        <>
                          <div className="my-1 border-t border-slate-200" />
                          <button type="button" className="block w-full rounded px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => void runContextAction("rename")}>{t("workspace.browser.rename")}</button>
                          <button type="button" className="block w-full rounded px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => void runContextAction("move")}>{t("workspace.browser.moveTo")}</button>
                          <button type="button" className="block w-full rounded px-3 py-1.5 text-left text-xs text-rose-700 hover:bg-rose-50" onClick={() => void runContextAction("delete")}>{t("common.delete")}</button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </aside>

                <div className="flex-1 min-w-0 p-4 overflow-auto">
                  {!selectedPath ? (
                    <p className="text-xs text-slate-600">{t("workspace.browser.selectFile")}</p>
                  ) : selectedPathKind === "directory" ? (
                    <p className="text-xs text-slate-600">{t("workspace.browser.selectedDirectory")}</p>
                  ) : isFileLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="line" className="w-2/3" />
                      <Skeleton variant="line" className="w-1/3 h-3" />
                      <Skeleton variant="panel" className="h-64" />
                    </div>
                  ) : selectedFileError ? (
                    <p className="text-xs text-rose-700">{selectedFileError}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-600 truncate">{selectedPath}</p>
                          <p className="text-[10px] text-slate-500">
                            {selectedFileModifiedAt ? t("workspace.preview.modifiedPrefix", { value: selectedFileModifiedAt }) : t("workspace.preview.modifiedUnknown")}
                          </p>
                        </div>

                        {isEditableTextFile ? (
                          isEditingFile ? (
                            <button
                              type="button"
                              onClick={handleLeaveEditor}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                            >
                              {t("workspace.browser.backToPreview")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsEditingFile(true)}
                              className="rounded-lg bg-[#1f5ba6] px-3 py-1.5 text-xs text-white hover:bg-[#174d92]"
                            >
                              {t("workspace.browser.edit")}
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-slate-500">{t("workspace.browser.readOnly")}</span>
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

              {operationDialog ? (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/20">
                  <div className="w-[26rem] rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                    {operationDialog.mode === "create-file" ? <h3 className="text-sm font-semibold text-slate-900">{t("workspace.browser.createFile")}</h3> : null}
                    {operationDialog.mode === "create-folder" ? <h3 className="text-sm font-semibold text-slate-900">{t("workspace.browser.createFolder")}</h3> : null}
                    {operationDialog.mode === "rename" ? <h3 className="text-sm font-semibold text-slate-900">{t("workspace.browser.renameKind", { kind: operationDialog.kind })}</h3> : null}
                    {operationDialog.mode === "delete" ? <h3 className="text-sm font-semibold text-slate-900">{t("workspace.browser.deleteKind", { kind: operationDialog.kind })}</h3> : null}

                    {operationDialog.mode === "delete" ? (
                      <p className="mt-3 text-sm text-slate-700 break-all">
                        {operationDialog.kind === "directory"
                          ? t("workspace.browser.deleteFolderPrompt", { path: operationDialog.path })
                          : t("workspace.browser.deleteFilePrompt", { path: operationDialog.path })}
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-xs text-slate-600">
                          {operationDialog.mode === "create-file" || operationDialog.mode === "create-folder"
                            ? t("workspace.browser.targetDirectory", { path: operationDialog.directoryPath || "/" })
                            : t("workspace.browser.currentPath", { path: operationDialog.mode === "rename" ? operationDialog.path : "" })}
                        </p>
                        <input
                          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
                          value={operationDialog.value}
                          onChange={(event) => setOperationDialog((current) => {
                            if (!current || current.mode === "delete") {
                              return current;
                            }

                            return { ...current, value: event.target.value };
                          })}
                        />
                      </>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100" onClick={() => setOperationDialog(null)}>
                        {t("common.cancel")}
                      </button>
                      <button type="button" className="rounded-lg bg-[#1f5ba6] px-3 py-1.5 text-xs text-white hover:bg-[#174d92]" onClick={() => void handleSubmitOperationDialog()}>
                        {operationDialog.mode === "delete" ? t("common.delete") : t("common.confirm")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {moveDialog ? (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/20">
                  <div className="w-[26rem] rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                    <h3 className="text-sm font-semibold text-slate-900">{t("workspace.browser.moveKind", { kind: moveDialog.kind })}</h3>
                    <p className="mt-1 text-xs text-slate-600 truncate">{moveDialog.path}</p>

                    <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="move-target-directory">
                      {t("workspace.browser.moveTargetDirectory")}
                    </label>
                    <select
                      id="move-target-directory"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      value={moveDialog.targetDirectory}
                      onChange={(event) => setMoveDialog((current) => (current ? { ...current, targetDirectory: event.target.value } : current))}
                    >
                      {directoryPaths.map((directoryPath) => (
                        <option key={directoryPath || "root"} value={directoryPath}>
                          {directoryPath.length > 0 ? directoryPath : "/"}
                        </option>
                      ))}
                    </select>

                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100" onClick={() => setMoveDialog(null)}>
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-[#1f5ba6] px-3 py-1.5 text-xs text-white hover:bg-[#174d92] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={moveDialog.targetDirectory === resolveParentDirectoryPath(moveDialog.path)}
                        onClick={() => void handleSubmitMoveDialog()}
                      >
                        {t("common.move")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  );
}
