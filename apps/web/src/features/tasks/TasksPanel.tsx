import React from "react";

export type TaskItem = {
  id: string;
  state: string;
  summary: string | null;
};

type TasksPanelProps = {
  tasks: TaskItem[];
};

export function TasksPanel({ tasks }: TasksPanelProps) {
  return (
    <section aria-label="Tasks panel">
      <h2>Tasks</h2>
      <ul>
        {tasks.map((task) => (
          <li data-testid="task-row" key={task.id}>
            <span>{task.summary ?? task.id}</span> - <strong>{task.state}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
