import { HttpError, sendJson } from "../../middleware/error-handler.js";

export function handleTasksListRead(res, repositories) {
  const items = repositories?.tasks?.listAll ? repositories.tasks.listAll() : [];
  sendJson(res, 200, { items });
}

export function handleTaskDetailRead(res, repositories, taskId) {
  const task = repositories?.tasks?.getById ? repositories.tasks.getById(taskId) : null;

  if (!task) {
    throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
  }

  sendJson(res, 200, { task });
}
