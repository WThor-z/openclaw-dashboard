from dataclasses import dataclass
from typing import Any


class TaskLookupError(LookupError):
    pass


@dataclass
class TaskRecord:
    task_id: str
    session_id: str
    payload: dict[str, Any]


class TaskRegistry:
    def __init__(self) -> None:
        self._tasks: dict[str, TaskRecord] = {}
        self._sessions: dict[str, TaskRecord] = {}

    def register(self, task_id: str, session_id: str, payload: dict[str, Any]) -> None:
        record = TaskRecord(task_id=task_id, session_id=session_id, payload=payload)
        self._tasks[task_id] = record
        self._sessions[session_id] = record

    def evict_task(self, task_id: str) -> None:
        if task_id in self._tasks:
            del self._tasks[task_id]

    def lookup(self, task_id: str) -> dict[str, Any]:
        record = self._tasks.get(task_id)
        if record is None:
            raise TaskLookupError(f"TASK_NOT_FOUND: {task_id}")
        return record.payload

    def lookup_with_fallback(self, task_id: str, session_id: str | None) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if task is not None:
            return task.payload

        if session_id:
            session = self._sessions.get(session_id)
            if session is not None:
                return session.payload

        raise TaskLookupError(f"TASK_AND_SESSION_NOT_FOUND: task={task_id} session={session_id}")
