import unittest

from tools.reliability.task_registry import TaskLookupError, TaskRegistry


class TaskRegistryTests(unittest.TestCase):
    def test_lookup_by_task_id(self) -> None:
        registry = TaskRegistry()
        registry.register(task_id="bg_1", session_id="ses_1", payload={"status": "done"})
        result = registry.lookup(task_id="bg_1")
        self.assertEqual(result["status"], "done")

    def test_fallback_lookup_by_session_id_when_task_missing(self) -> None:
        registry = TaskRegistry()
        registry.register(task_id="bg_1", session_id="ses_1", payload={"status": "done"})
        registry.evict_task("bg_1")
        result = registry.lookup_with_fallback(task_id="bg_1", session_id="ses_1")
        self.assertEqual(result["status"], "done")

    def test_raises_when_both_task_and_session_missing(self) -> None:
        registry = TaskRegistry()
        with self.assertRaises(TaskLookupError):
            registry.lookup_with_fallback(task_id="bg_x", session_id="ses_x")


if __name__ == "__main__":
    unittest.main()
