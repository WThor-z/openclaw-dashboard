/** Supported runtime state values for a monitored agent. */
export type AgentStatus = "idle" | "busy" | "offline" | "error";

const conversationStatusValues = ["active", "archived"] as const;
const messageRoleValues = ["user", "assistant", "system"] as const;
const messageStateValues = ["pending", "completed", "failed"] as const;
const scheduleRunStatusValues = ["running", "succeeded", "failed", "cancelled"] as const;
const memoryScopeValues = ["conversation", "agent", "system"] as const;

function isStringLiteral<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

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

/** Supported lifecycle states for a V2 agent-bound conversation. */
export type ConversationStatus = (typeof conversationStatusValues)[number];

/** Narrow guard for shared conversation lifecycle values. */
export function isConversationStatus(value: unknown): value is ConversationStatus {
  return isStringLiteral(conversationStatusValues, value);
}

/** Supported message author roles for V2 runtime turns. */
export type MessageRole = (typeof messageRoleValues)[number];

/** Narrow guard for shared message author role values. */
export function isMessageRole(value: unknown): value is MessageRole {
  return isStringLiteral(messageRoleValues, value);
}

/** Supported delivery states for stored conversation messages. */
export type MessageState = (typeof messageStateValues)[number];

/** Supported execution states for observed schedule runs. */
export type ScheduleRunStatus = (typeof scheduleRunStatusValues)[number];

/** Supported memory attachment scopes shared across runtime surfaces. */
export type MemoryScope = (typeof memoryScopeValues)[number];

/** Narrow guard for shared memory scope values. */
export function isMemoryScope(value: unknown): value is MemoryScope {
  return isStringLiteral(memoryScopeValues, value);
}

/** Shared list-row shape for agent-bound runtime conversations. */
export interface ConversationSummary {
  id: string;
  agentId: string;
  workspaceId: string;
  sessionKey: string;
  title: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  lastMessageAt: string | null;
}

/** Shared detail shape for a single runtime conversation lookup. */
export interface ConversationDetail extends ConversationSummary {
  messageCount: number;
}

/** Shared stored message shape for V2 request-response turns. */
export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  state: MessageState;
  content: string;
  errorCode: string | null;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shared schedule summary for agent-owned cron-style jobs. */
export interface ScheduleSummary {
  id: string;
  agentId: string;
  workspaceId: string;
  label: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  timezone?: string | null;
  sessionKey?: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shared execution record for a single runtime schedule invocation. */
export interface ScheduleRun {
  id: string;
  scheduleId: string;
  agentId: string;
  status: ScheduleRunStatus;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
}

/** Shared heartbeat configuration and observation summary. */
export interface HeartbeatSummary {
  agentId: string;
  workspaceId: string;
  enabled: boolean;
  every: string;
  session: string;
  lightContext: boolean;
  prompt: string;
  lastBeatAt: string | null;
  nextBeatAt: string | null;
  updatedAt: string;
}

/** Shared memory plugin slot configuration exposed to runtime surfaces. */
export interface MemoryPluginConfig {
  provider: string;
  model?: string;
  remote?: {
    baseUrl: string;
  } | null;
  apiKeyRef?: string | null;
  secretRef: string | null;
}

/** Shared memory binding summary for scoped runtime context. */
export interface MemoryBindingSummary {
  id: string;
  agentId: string;
  workspaceId: string;
  scope: MemoryScope;
  provider: string;
  secretRef: string | null;
  conversationId: string | null;
  updatedAt: string;
}

/** Shared memory scope summary for conversation, agent, and system views. */
export interface MemoryScopeSummary {
  scope: MemoryScope;
  namespace: string;
  retention: string;
  summary: string;
  readonly?: boolean;
  conversationId?: string | null;
  updatedAt?: string;
}

/** Shared runtime memory payload returned by the daemon read API. */
export interface MemorySummary {
  agentId: string;
  workspaceId?: string;
  plugin?: MemoryPluginConfig | null;
  pluginSlot?: MemoryPluginConfig | null;
  activePlugin?: MemoryPluginConfig | null;
  bindings: MemoryBindingSummary[];
  scopes?: MemoryScopeSummary[];
}

/** API payload containing agent-bound runtime conversations. */
export interface ConversationListResponse {
  items: ConversationSummary[];
}

/** API payload containing all stored messages for a conversation. */
export interface ConversationMessagesResponse {
  items: ConversationMessage[];
}

/** API payload containing runtime-managed schedules for an agent. */
export interface ScheduleListResponse {
  items: ScheduleSummary[];
}

/** API payload containing recent runs for a single runtime schedule. */
export interface ScheduleRunsResponse {
  items: ScheduleRun[];
}

/** API payload containing the runtime heartbeat state for an agent. */
export interface HeartbeatResponse {
  heartbeat: HeartbeatSummary | null;
}

/** API payload containing runtime memory state for an agent. */
export interface MemoryResponse {
  memory: MemorySummary;
}

/** Control payload for creating a new agent-bound conversation. */
export interface CreateConversationRequest {
  workspaceId: string;
  title: string;
}

/** Control payload for sending a non-streaming message turn. */
export interface SendConversationMessageRequest {
  content: string;
}

/** Control payload for archiving a conversation thread. */
export interface ArchiveConversationRequest {
  reason?: string;
}

/** Control payload for creating a runtime-managed schedule. */
export interface CreateScheduleRequest {
  label: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  timezone?: string | null;
  sessionKey?: string | null;
}

/** Control payload for updating heartbeat configuration. */
export interface ConfigureHeartbeatRequest {
  workspaceId?: string;
  every: string;
  session: string;
  lightContext?: boolean;
  prompt?: string;
}

/** Control payload for configuring a scoped memory binding. */
export interface ConfigureMemoryBindingRequest {
  workspaceId?: string;
  scope: MemoryScope;
  provider: string;
  secretRef: string | null;
  conversationId?: string | null;
  model?: string;
  remote?: {
    baseUrl: string;
  } | null;
  apiKeyRef?: string | null;
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
