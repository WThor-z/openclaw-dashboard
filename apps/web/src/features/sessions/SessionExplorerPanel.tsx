import React, { useMemo } from "react";

export type SessionItem = {
  id: string;
  workspaceId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
};

export type SessionTimelineItem = {
  id: string;
  kind: string;
  level: string;
  createdAt: string;
};

type SessionExplorerPanelProps = {
  sessions: SessionItem[];
  searchValue: string;
  fromDate: string;
  toDate: string;
  selectedSessionId: string | null;
  selectedSessionStatus: string | null;
  selectedTimeline: SessionTimelineItem[];
  onSearchChange: (nextValue: string) => void;
  onFromDateChange: (nextValue: string) => void;
  onToDateChange: (nextValue: string) => void;
  onOpenDrilldown: (sessionId: string) => void;
};

export function SessionExplorerPanel({
  sessions,
  searchValue,
  fromDate,
  toDate,
  selectedSessionId,
  selectedSessionStatus,
  selectedTimeline,
  onSearchChange,
  onFromDateChange,
  onToDateChange,
  onOpenDrilldown
}: SessionExplorerPanelProps) {
  const filteredSessions = useMemo(() => {
    const normalized = searchValue.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesSearch =
        normalized.length === 0 ||
        session.id.toLowerCase().includes(normalized) ||
        session.workspaceId.toLowerCase().includes(normalized) ||
        session.status.toLowerCase().includes(normalized);
      const sessionDate = session.startedAt.slice(0, 10);
      const matchesFrom = !fromDate || sessionDate >= fromDate;
      const matchesTo = !toDate || sessionDate <= toDate;
      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [fromDate, searchValue, sessions, toDate]);

  return (
    <section aria-label="Session explorer panel">
      <h2>Session and Memory Explorer</h2>

      <label htmlFor="session-search-input">Search</label>
      <input
        id="session-search-input"
        data-testid="session-search-input"
        type="text"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <label htmlFor="session-from-date">From</label>
      <input
        id="session-from-date"
        data-testid="session-from-date"
        type="date"
        value={fromDate}
        onChange={(event) => onFromDateChange(event.target.value)}
      />

      <label htmlFor="session-to-date">To</label>
      <input
        id="session-to-date"
        data-testid="session-to-date"
        type="date"
        value={toDate}
        onChange={(event) => onToDateChange(event.target.value)}
      />

      <ul>
        {filteredSessions.map((session) => (
          <li data-testid="session-row" key={session.id}>
            <span>{session.id}</span> ({session.status})
            <button
              data-testid="open-session-drilldown-button"
              onClick={() => onOpenDrilldown(session.id)}
              type="button"
            >
              Open timeline
            </button>
          </li>
        ))}
      </ul>

      {selectedSessionId ? (
        <div data-testid="session-drilldown">
          <p>
            Session {selectedSessionId} ({selectedSessionStatus ?? "unknown"})
          </p>
          <ul>
            {selectedTimeline.map((entry) => (
              <li data-testid="session-timeline-row" key={entry.id}>
                <strong>{entry.kind}</strong> [{entry.level}] - {entry.createdAt}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
