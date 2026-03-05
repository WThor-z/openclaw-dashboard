# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-04T00:00:00Z
**Commit:** N/A (workspace is not a git repository)
**Branch:** N/A (workspace is not a git repository)

## OVERVIEW
This workspace currently contains a small Python reliability helper package and planning artifacts.
Code is concentrated in `reliability/` with unit tests in `reliability/tests/`.

## STRUCTURE
```text
openclaw dashboard/
|- reliability/              # Runtime reliability helpers
|  |- tests/                 # unittest test suite (inside package tree)
|  |- safe_json.py           # Guarded JSON parsing
|  |- rate_limit.py          # Retry/backoff policy helpers
|  |- task_registry.py       # Task/session fallback lookup helper
|  `- README.md              # Integration notes + test command
`- .sisyphus/                # Planning/notepad artifacts (non-runtime)
```

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| Understand package intent | `reliability/README.md` | Explains the three reliability guards and integration snippet |
| JSON parsing guard behavior | `reliability/safe_json.py` | Raises `SafeJsonError` for non-JSON and invalid JSON paths |
| Retry policy behavior | `reliability/rate_limit.py` | Handles `Retry-After`, exponential backoff, optional jitter |
| Task/session fallback behavior | `reliability/task_registry.py` | Falls back from missing task ID to session ID |
| Test conventions and coverage | `reliability/tests/test_*.py` | `unittest.TestCase` classes + `test_` methods |
| Current project constraints | `.sisyphus/plans/openclaw-dashboard-control-plane.md` | Read-only planning file; do not edit |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|---|---|---|---:|---|
| `safe_json_loads` | function | `reliability/safe_json.py` | 5 | Safe parse with rate-limit/non-JSON guards |
| `compute_retry_delay_seconds` | function | `reliability/rate_limit.py` | 6 | Retry delay policy for retryable statuses |
| `TaskRegistry.lookup_with_fallback` | method | `reliability/task_registry.py` | 9 | Lookup fallback from task to session |
| `SafeJsonError` | class | `reliability/safe_json.py` | 7 | Domain-specific parse failure type |
| `BackoffState` | dataclass | `reliability/rate_limit.py` | 7 | Immutable retry delay parameters |

## CONVENTIONS
- Tests are colocated at `reliability/tests/` instead of root-level `tests/`.
- Test framework style is `unittest` (not `pytest`): class-based `TestCase` + `unittest.main()` guards.
- Packaging/build metadata is not present at repo root (`pyproject.toml`/`setup.py` absent).
- CI workflow files are not present (`.github/workflows/` absent).

## ANTI-PATTERNS (THIS PROJECT)
- Do not modify `.sisyphus/plans/*.md`; these files are planning ground truth and read-only.
- Do not assume this workspace is a full monorepo implementation yet; only the `reliability/` patch kit exists.
- Do not claim CI/build automation exists without adding concrete config files.

## COMMANDS
```bash
python -m unittest discover "reliability/tests"
```

## NOTES
- LSP Python diagnostics are unavailable in this environment because `basedpyright-langserver` is missing.
- `rg` (ripgrep) is not installed in this environment.
- If project scope expands (apps/packages/tests roots become real), regenerate AGENTS hierarchy and add subdirectory AGENTS files.
