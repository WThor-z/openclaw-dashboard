# Decisions (append-only)

- 2026-03-04: Workspace is not a git repo; treating `C:\Users\25911\Desktop\openclaw dashboard` as `worktree_path` in boulder.json.

- 2026-03-04: Task 8 safety-mode contract uses env var `DAEMON_READ_ONLY_SAFETY_MODE` (enabled with value `1`) and API error code `READ_ONLY_SAFETY_MODE`; mode blocks all `/api/control/*` POST routes including `/api/control/arm`.

- 2026-03-05: Task 9 breaker policy set to persisted per-webhook state transitions `closed -> open -> half_open -> closed` with defaults `failureThreshold=3` and `cooldownMs=30000`; worker can override thresholds/timing via injected options for deterministic tests.
- 2026-03-05: Task 9 retry policy uses exponential backoff with injectable jitter (`delay = min(base * 2^(attempt-1), max) + jitter`) and finite `maxAttempts`; retriable conditions include transport errors and HTTP `>=500` plus `408/409/425/429`.
- 2026-03-05: Task 9 API surface keeps control mutations POST-only under `/api/control/webhooks/*` (`create`, `{id}/update`, `{id}/disable`, `{id}/enqueue`) and read endpoints GET-only under `/api/webhooks` and `/api/webhooks/{id}/deliveries`.
- 2026-03-05: Delivery claim strategy now permits reclaiming stale `in_progress` rows after `claimTimeoutMs` using `updated_at` as a lease marker, avoiding permanent queue stalls without adding new schema columns.
- 2026-03-05: Control mutation idempotency uses a router-local dedupe lock map keyed by `<route>:<idempotency-key>` to serialize concurrent identical mutations before audit-event replay can be observed.
- 2026-03-05: Task 9 evidence refresh keeps dual-command verification: full daemon package run for regression confidence and focused verbose run for explicit error-path proof in `task-9-webhooks-error.log`.
- 2026-03-05: Task 10 monitor provider defaults are environment-driven (`DAEMON_MONITOR_WORKSPACE_ROOTS` split by platform path delimiter and optional `DAEMON_MONITOR_OPENCLAW_ROOT`) so daemon startup can collect monitoring data without explicit wiring.
- 2026-03-05: Path safety policy is canonical allowlist containment (`resolve`/`realpath` + prefix boundary check); rejected requests map to HTTP 400 `PATH_NOT_ALLOWED` to make traversal failures explicit.
