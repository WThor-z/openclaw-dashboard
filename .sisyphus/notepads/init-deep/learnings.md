# Learnings

No config files found in repository root; no project-specific deviations reported.
Workspace is small: 20 files, 10 directories, max depth 4 including .sisyphus metadata.
Code lives in reliability/ with three production modules: safe_json.py, rate_limit.py, task_registry.py.
Tests use unittest under reliability/tests with test_*.py naming and __main__ runners.
Only explicit runnable command discovered: python -m unittest discover "reliability/tests" (reliability/README.md).
No AGENTS.md or CLAUDE.md existed before init-deep run.
## Cross-cutting conventions for AGENTS.md
- Centralize shared utilities under a root AGENTS.md. (Evidence: reliability/README.md; notepads init-deep/learnings.md)
- Document and enforce retry/backoff and resilient parsing as shared patterns. (Evidence: reliability/README.md)
- Maintain guard patterns (e.g., safe_json_loads) as a common library. (Evidence: reliability/README.md)

## Cross-cutting conventions for AGENTS.md
- Centralize shared utilities under a root AGENTS.md. (Evidence: reliability/README.md; notepads init-deep/learnings.md)
- Document and enforce retry/backoff and resilient parsing as shared patterns. (Evidence: reliability/README.md)
- Maintain guard patterns (e.g., safe_json_loads) as a common library. (Evidence: reliability/README.md)

### Auto-analysis: Project structure deviations (Python detected)
- Language detected: Python (package at repo root: reliability/)
- Baseline (typical Python project): root-level packaging config (pyproject.toml or setup.py), top-level tests directory (tests/), and source layout either src/pkg or directly as pkg/ with tests at root.
- Deviations observed:
  - Tests are colocated under reliability/tests/ instead of root/tests/
  - No packaging metadata file at repo root (no pyproject.toml or setup.py found) to declare a library; reliance on local packaging not visible
  - Package layout uses top-level reliability/ as the package directory, not under a conventional src/ layout (i.e., no src/reliability/ path)
  - Notable additional artefacts in repo root: .sisyphus/ planning folder is present, which is not standard for Python project structures
- Concrete evidence (paths):
  - Tests located at /C:/Users/25911/Desktop/openclaw dashboard/reliability/tests/test_task_registry.py and /C:/Users/25911/Desktop/openclaw dashboard/reliability/tests/test_rate_limit.py
  - Core package at /C:/Users/25911/Desktop/openclaw dashboard/reliability/__init__.py and modules there
  - Notepad planning artifacts at /C:/Users/25911/Desktop/openclaw dashboard/.sisyphus/notepads/init-deep/learnings.md (target of this append)
- Standard vs observed example:
  - Standard: root/tests/test_task_registry.py
  - Observed: reliability/tests/test_task_registry.py

