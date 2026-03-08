export const SELECTED_AGENT_STORAGE_KEY = "agent-workspace:selected-agent-id";

export function loadSelectedAgentId() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY);
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function saveSelectedAgentId(agentId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof agentId === "string" && agentId.trim().length > 0) {
    window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, agentId);
    return;
  }

  window.localStorage.removeItem(SELECTED_AGENT_STORAGE_KEY);
}

function getPinnedNotesStorageKey(agentId: string) {
  return `agent-workspace:pinned-notes:${agentId}`;
}

export function loadStoredPinnedNotes(agentId: string) {
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

export function saveStoredPinnedNotes(agentId: string, paths: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getPinnedNotesStorageKey(agentId), JSON.stringify(paths));
}
