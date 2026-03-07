import React from "react";

export type EventItem = {
  id: string;
  createdAt: string;
  kind: string;
  level: string;
  source: string;
  sessionId?: string | null;
};

type EventsPanelProps = {
  events: EventItem[];
  filterValue: string;
  onFilterChange: (nextValue: string) => void;
};

const levelColors: Record<string, string> = {
  info: "blue",
  warn: "orange",
  warning: "orange",
  error: "red",
  debug: "gray"
};

const levelLabels: Record<string, string> = {
  info: "信息",
  warn: "警告",
  warning: "警告",
  error: "错误",
  debug: "调试"
};

function formatTime(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  } catch {
    return dateStr;
  }
}

export function EventsPanel({ events, filterValue, onFilterChange }: EventsPanelProps) {
  return (
    <div className="events-panel">
      <div className="form-group">
        <label htmlFor="events-filter-input" className="form-label">
          搜索事件
        </label>
        <input
          id="events-filter-input"
          data-testid="events-filter-input"
          type="text"
          className="input"
          placeholder="输入关键词过滤事件..."
          value={filterValue}
          onChange={(event) => onFilterChange(event.target.value)}
        />
        {filterValue && (
          <span className="form-hint">
            找到 {events.length} 个事件
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">暂无事件</div>
          <div className="empty-state-description">
            {filterValue ? "没有匹配当前过滤条件的事件" : "当前没有事件数据"}
          </div>
        </div>
      ) : (
        <div className="events-list">
          {events.map((entry) => {
            const levelColor = levelColors[entry.level.toLowerCase()] || "gray";
            return (
              <div 
                key={entry.id} 
                data-testid="event-row"
                className="event-item"
              >
                <div className="event-header">
                  <span className={`badge badge-${levelColor}`}>
                    {levelLabels[entry.level.toLowerCase()] || entry.level}
                  </span>
                  <span className="event-time">{formatTime(entry.createdAt)}</span>
                </div>
                <div className="event-content">
                  <div className="event-kind">{entry.kind}</div>
                  <div className="event-source">来源: {entry.source}</div>
                </div>
                {entry.sessionId && (
                  <div className="event-footer">
                    <span className="event-session">会话: {entry.sessionId}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .events-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .events-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          max-height: 500px;
          overflow-y: auto;
        }

        .event-item {
          padding: var(--space-4);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          border: 1px solid var(--color-border-light);
          border-radius: 1rem;
          transition: all var(--transition-fast);
          box-shadow: var(--shadow-sm);
        }

        .event-item:hover {
          border-color: var(--color-brand-200);
          box-shadow: var(--shadow-md);
        }

        .event-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .event-time {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          font-family: var(--font-mono);
        }

        .event-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .event-kind {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          line-height: 1.55;
        }

        .event-source {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }

        .event-footer {
          margin-top: var(--space-2);
          padding-top: var(--space-2);
          border-top: 1px solid var(--color-border-light);
        }

        .event-session {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          font-family: var(--font-mono);
        }
      `}</style>
    </div>
  );
}
