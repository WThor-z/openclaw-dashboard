import React from "react";

export type TaskItem = {
  id: string;
  state: string;
  summary: string | null;
};

type TasksPanelProps = {
  tasks: TaskItem[];
};

const stateColors: Record<string, string> = {
  queued: "gray",
  running: "blue",
  succeeded: "green",
  failed: "red",
  cancelled: "orange"
};

const stateLabels: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消"
};

export function TasksPanel({ tasks }: TasksPanelProps) {
  const grouped = React.useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        acc[task.state] = (acc[task.state] || []).concat(task);
        return acc;
      },
      {} as Record<string, TaskItem[]>
    );
  }, [tasks]);

  const states = ["running", "queued", "succeeded", "failed", "cancelled"];

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-title">暂无任务</div>
        <div className="empty-state-description">当前没有正在运行或等待的任务</div>
      </div>
    );
  }

  return (
    <div className="tasks-panel">
      <div className="tasks-stats">
        {states.map((state) => {
          const count = grouped[state]?.length || 0;
          if (count === 0) return null;
          return (
            <div key={state} className={`task-stat task-stat-${stateColors[state] || "gray"}`}>
              <span className="task-stat-count">{count}</span>
              <span className="task-stat-label">{stateLabels[state] || state}</span>
            </div>
          );
        })}
      </div>

      <div className="tasks-list">
        {states.map((state) => {
          const stateTasks = grouped[state];
          if (!stateTasks || stateTasks.length === 0) return null;
          
          return (
            <div key={state} className="task-group">
              <div className="task-group-header">
                <span className={`badge badge-${stateColors[state] || "gray"}`}>
                  {stateLabels[state] || state}
                </span>
                <span className="task-group-count">{stateTasks.length}</span>
              </div>
              
              <div className="task-group-items">
                {stateTasks.map((task) => (
                  <div 
                    key={task.id} 
                    data-testid="task-row"
                    className={`task-item task-item-${state}`}
                  >
                    <div className="task-icon">
                      {state === "running" && "▶️"}
                      {state === "queued" && "⏳"}
                      {state === "succeeded" && "✅"}
                      {state === "failed" && "❌"}
                      {state === "cancelled" && "🚫"}
                    </div>
                    <div className="task-content">
                      <div className="task-title">
                        {task.summary || task.id}
                      </div>
                      <div className="task-id">{task.id}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .tasks-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .tasks-stats {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-4);
        }

        .task-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--space-4) var(--space-6);
          background-color: var(--color-bg-secondary);
          border-radius: var(--radius-lg);
          min-width: 80px;
        }

        .task-stat-gray { border: 2px solid var(--color-text-muted); }
        .task-stat-blue { border: 2px solid var(--color-brand-500); }
        .task-stat-green { border: 2px solid var(--color-success-500); }
        .task-stat-red { border: 2px solid var(--color-error-500); }
        .task-stat-orange { border: 2px solid var(--color-warning-500); }

        .task-stat-count {
          font-size: var(--text-2xl);
          font-weight: var(--font-bold);
          color: var(--color-text-primary);
        }

        .task-stat-label {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin-top: var(--space-1);
        }

        .tasks-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .task-group {
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .task-group-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background-color: var(--color-bg-tertiary);
          border-bottom: 1px solid var(--color-border);
        }

        .task-group-count {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
        }

        .task-group-items {
          padding: var(--space-2);
        }

        .task-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-2);
          background-color: var(--color-bg-card);
          border: 1px solid transparent;
          transition: all var(--transition-fast);
        }

        .task-item:last-child {
          margin-bottom: 0;
        }

        .task-item:hover {
          border-color: var(--color-brand-200);
          box-shadow: var(--shadow-sm);
        }

        .task-icon {
          font-size: var(--text-lg);
        }

        .task-content {
          flex: 1;
          min-width: 0;
        }

        .task-title {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .task-id {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          font-family: var(--font-mono);
          margin-top: var(--space-1);
        }

        .task-item-running .task-title {
          color: var(--color-brand-600);
        }

        .task-item-failed .task-title {
          color: var(--color-error-600);
        }
      `}</style>
    </div>
  );
}
