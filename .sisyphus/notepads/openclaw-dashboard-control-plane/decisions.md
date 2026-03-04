# Decisions (append-only)

- 2026-03-04: Workspace is not a git repo; treating `C:\Users\25911\Desktop\openclaw dashboard` as `worktree_path` in boulder.json.

- 2026-03-04: Task 8 safety-mode contract uses env var `DAEMON_READ_ONLY_SAFETY_MODE` (enabled with value `1`) and API error code `READ_ONLY_SAFETY_MODE`; mode blocks all `/api/control/*` POST routes including `/api/control/arm`.
