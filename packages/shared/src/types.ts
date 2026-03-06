/** Supported runtime state values for a monitored agent. */
export type AgentStatus = "idle" | "busy" | "offline" | "error";

/** Canonical agent record shared across daemon and web surfaces. */
export interface Agent {
  id: string;
  name: string;
  role: string;
  workspacePath: string;
  status: AgentStatus;
  updatedAt: string;
}

/** Recursive file tree node for workspace browser responses. */
export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  children?: WorkspaceFile[];
}

/** API payload containing all currently known agents. */
export interface AgentListResponse {
  items: Agent[];
}

/** API payload for a single agent status lookup. */
export interface AgentStatusResponse {
  status: AgentStatus;
  updatedAt: string;
}

/** API payload containing workspace file browser entries. */
export interface WorkspaceFileListResponse {
  items: WorkspaceFile[];
}

/** API payload containing file contents and metadata. */
export interface FileContentResponse {
  path: string;
  content: string;
  modifiedAt: string;
}
