# Learnings (append-only)

- 2026-03-04: Initialized notepad for a previous control-plane planning cycle.
Analysis: Extracted top-level plan tasks 1-16 and F1-F4 with wave/parallelization.

- 2026-03-04: Tooling inventory: Node v22.14.0, corepack v0.31.0, pnpm v10.28.1, Python v3.13.2, git v2.45.1.windows.1.
- 2026-03-04: No `package.json` / `pnpm-workspace.yaml` / `tsconfig*.json` present yet in workspace.
- 2026-03-04: `rg` (ripgrep) and `sg` (ast-grep CLI) not found on PATH; use built-in Grep + `ast_grep_*` tools instead.

- 2026-03-04: OpenClaw docs: Getting Started prereq is Node 22+ (source: https://docs.openclaw.ai/start/getting-started).
- 2026-03-04: Gateway protocol handshake: server emits `connect.challenge` event first; client replies with `connect` req carrying `minProtocol/maxProtocol`, role/scopes, and `auth.token` (source: https://docs.openclaw.ai/gateway/protocol).

- 2026-03-04: Bootstrap baseline validated with root scripts `verify:env`, `lint`, `test`, and `build`; happy-path execution is logged in `.sisyphus/evidence/task-1-bootstrap.log`.
- 2026-03-04: TDD smoke cycle confirmed: initial test failed on missing shared helper import, then passed after adding `packages/shared/src/index.ts` and fixing test import path.

- 2026-03-04: Daemon skeleton v1 uses Node `http` only, binds to `127.0.0.1:4060` by default, and stamps each response with `x-request-id` from `crypto.randomUUID()`.
- 2026-03-04: Control-path auth gate is centralized via `/api/control/*` prefix middleware and server-side `DASHBOARD_ADMIN_TOKEN`; unauthorized responses return `{ requestId, code, message }` envelope.

- 2026-03-04: CI gateway simulator contract now lives in `tests/simulator/gateway-sim.ts` with deterministic modes (`valid-auth`, `bad-auth`, `gap`, `flaky-network`) and stable scripted timing/ordering for event frames.
- 2026-03-04: Contract probes in `tests/contracts/gateway-sim.test.ts` validate handshake minimum (`connect.challenge` + `hello-ok`), auth rejection path, sequence gap behavior, and deterministic flaky-network replay.

- 2026-03-04: Daemon storage baseline added with SQL file migrations (`apps/daemon/migrations/001_initial.{up,down}.sql`) and runtime runner (`apps/daemon/src/storage/migrations.js`) supporting both `up` and full `down` replay.
- 2026-03-04: Realtime query indexes required by dashboard views are now codified as `idx_events_workspace_created_at`, `idx_events_session_created_at`, and `idx_sessions_workspace_started_at`.
- 2026-03-04: Repo boundary now hard-blocks plaintext fields matching token/secret semantics (unless explicitly ref/hash/encrypted variants) and throws `StorageError` with code `SECRET_PERSISTENCE_BLOCKED`.

- 2026-03-04: Daemon gateway client (`apps/daemon/src/gateway/client.js`) now enforces challenge-first handshake ordering: it does not send `connect` until `connect.challenge` arrives with a nonce.
- 2026-03-04: Connect frame builder now includes protocol range, operator role/scopes, `auth.token`, and a device identity hook that always binds the challenge nonce (`device.nonce`) for downstream device-auth evolution.
- 2026-03-04: Reconnect policy in daemon gateway client uses bounded exponential backoff with configurable jitter and transitions status through `connecting -> connected -> degraded -> disconnected` without hard process exits.
- 2026-03-04: Sequence cursor tracking and gap hook are wired (`onGap({ expected, received })`), and dedupe keys are deterministic via stable-key-order JSON canonicalization for identical source events.

- 2026-03-04: Task 4 simulator is now a real WS service in `tests/simulator/gateway-sim.ts`, with deterministic handshake frames (`connect.challenge` -> `connect` req -> `hello-ok`) and deterministic modes (`valid-auth`, `bad-auth`, `gap`, `flaky-network`).
- 2026-03-04: Contract tests now spawn the simulator process on an ephemeral port and assert wire-level frames over WebSocket, including seq-gap assertion (`[1,3,4]`) and deterministic flaky close behavior.
- 2026-03-04: `pnpm test --filter gateway-sim` is routed through `scripts/test-entry.mjs` so pnpm workspace filtering works without passing `--filter` down to Vitest directly.
- 2026-03-04: Setting `SIM_MODE=gap` before `pnpm test --filter gateway-sim` now yields a gap-focused run (`1 passed, 3 skipped`) so CI can assert deterministic seq-gap behavior explicitly.
- 2026-03-04: TypeScript build stability for simulator tests required root `@types/node` + `@types/ws` and Node typings enabled via `tsconfig.base.json` `compilerOptions.types=["node"]`.
- 2026-03-04: Gateway client runtime compatibility now supports both EventEmitter-style sockets (`.on("message")`) and Node 22 global WebSocket EventTarget-style listeners (`addEventListener("message")` with `MessageEvent.data`).
- 2026-03-04: Added daemon integration coverage (`apps/daemon/test/gateway/client.integration.test.js`) that spawns `tests/simulator/gateway-sim.ts` on ephemeral ports and validates status transitions to `connected` (valid-auth) and `degraded` (bad-auth) with deterministic child-process teardown.
- 2026-03-04: Gateway simulator integration now runs from `apps/daemon/test/gateway/simulator.integration.test.js` and explicitly uses Node 22 global `WebSocket` via `socketFactory`, covering EventTarget message handling against the real simulator.
- 2026-03-04: Simulator spawn in daemon integration uses repo-root `cwd` plus `node --experimental-strip-types tests/simulator/gateway-sim.ts`, then consumes `SIM_LISTENING:<port>` for deterministic ephemeral-port wiring.

- 2026-03-04: Task 6 added `apps/daemon/src/ingest/pipeline.js` + `normalizer.js` to normalize gateway/daemon/cli events into one envelope (`id`, `source`, `kind`, `level`, `workspaceId`, `sessionId`, `taskId`, `payloadJson`, `createdAt`, `dedupeKey`) and persist with duplicate-safe insert semantics.
- 2026-03-04: Sequence-gap handling in ingestion tracks `lastGatewaySeq`, raises `resyncRequired`, and exposes explicit internal trigger/clear APIs (`triggerResync`, `clearResync`, `getState`) so replay can be coordinated without assuming ordered delivery.
- 2026-03-04: Because `events.session_id` is a foreign key, ingestion now validates correlation IDs against stored sessions/tasks before persisting so unknown references do not fail writes; malformed frames are persisted as `ingest.error` events instead of being dropped.

- 2026-03-04: Task 7 read API surface is now routed through `apps/daemon/src/api/read/index.js` from `http-server.js`, keeping read endpoints unauthenticated while preserving `/api/control/*` auth-gate behavior.
- 2026-03-04: Event pagination now uses an opaque base64url cursor over `(createdAt,id)` with SQL predicate `(created_at < ?) OR (created_at = ? AND id < ?)` and deterministic ordering `created_at DESC, id DESC`, which remains stable across newer inserts.
- 2026-03-04: Event payload responses parse JSON and recursively redact any key containing `token` or `secret` as `[REDACTED]`; monitor stubs are also passed through the same redaction helper to prevent accidental leakage in future collector wiring.

- 2026-03-04: Task 8 control writes now route through `apps/daemon/src/api/control/index.js` and are uniformly guarded by bearer auth (existing middleware), write-arming (`/api/control/arm` window), idempotency-key replay, and optional read-only safety mode (`DAEMON_READ_ONLY_SAFETY_MODE=1` -> `READ_ONLY_SAFETY_MODE`).
- 2026-03-04: Idempotency replay is persisted via `events.dedupe_key` with a route-scoped dedupe key (`<route>:<idempotency-key>`); duplicate writes replay the stored prior response payload instead of creating a second mutation audit record.
- 2026-03-04: Config apply now enforces optimistic `baseVersion` against snapshot count and returns `CONFIG_VERSION_CONFLICT` on stale versions before any snapshot/config-operation/audit writes.
- 2026-03-04: HTTP daemon request handler already routes `POST /api/control/*` through `createControlApiRouter().handle(req, res, requestUrl)` with control auth gate preserved, and daemon tests confirm unarmed `/api/control/ping` returns `423 WRITE_NOT_ARMED`.
- 2026-03-04: Control cancel semantics depend on repository `tasks.updateState` returning a boolean change count; this enables API-level `TASK_NOT_FOUND` (404) for missing task IDs while preserving idempotent replay for successful cancels.

- 2026-03-05: Task 9 webhook core now persists outbox/retry/breaker metadata via migration `003_webhooks_outbox` (`webhooks.breaker_state/consecutive_failures/breaker_next_attempt_at` and `webhook_deliveries.attempt_count/max_attempts/next_attempt_at/...`) so retry and breaker state survive daemon restarts.
- 2026-03-05: Outbound webhook delivery always signs raw JSON bytes with `x-openclaw-signature: sha256=<hex>` plus `x-openclaw-attempt-id` and `x-openclaw-timestamp`; secret material is resolved at runtime from `secret_ref` and never persisted as plaintext.
- 2026-03-05: Read + control webhook APIs are now wired under existing patterns (`POST /api/control/webhooks/*`, `GET /api/webhooks*`) with idempotency/audit behavior inherited from the control router and summary/history views sourced from repository joins.
- 2026-03-05: Worker reliability hardening added stale-claim recovery: deliveries left in `in_progress` beyond lease timeout are reclaimed and retried so daemon restarts/crashes do not wedge outbox rows indefinitely.
- 2026-03-05: Control API idempotency now includes an in-process per-dedupe-key lock around mutation execution, preventing same-key concurrent requests from applying side effects twice before replay state is persisted.
- 2026-03-05: Task 9 verification rerun confirms daemon webhook suite still passes end-to-end (`11 files / 39 tests`), including worker signature, retry, breaker, and read/control API coverage after outbox wiring.
- 2026-03-05: Task 10 monitoring collectors now scan allowlisted workspace roots only, emit metadata-only summaries (`fileCount`, `totalBytes`, hot-file recency, failure-marker presence), and normalize relative file paths to forward slashes for deterministic cross-platform assertions.
- 2026-03-05: `/api/monitors/workspaces` now supports an optional `path` query but rejects traversal/out-of-root values with `PATH_NOT_ALLOWED`; `/api/monitors/openclaw` reports minimal health (`exists`, expected files, missing count) without exposing file contents.
- 2026-03-05: Task 10 follow-up fixed `.openclaw` existence detection to use `stat(canonicalRoot).isDirectory()`; a resolvable but missing root no longer reports `exists: true`.
- 2026-03-05: Added unit coverage for missing `.openclaw` root in `apps/daemon/test/monitoring/collectors.test.js`, asserting `snapshot.exists === false` while expected-file probes remain present and false.

- 2026-03-05: Task 12 web UI now composes feature panels under `apps/web/src/features/{events,tasks,approvals}` and keeps dashboard wiring in `apps/web/src/pages/DashboardPage.tsx` with polling-based refresh (`/api/status`, `/api/events`, `/api/tasks`).
- 2026-03-05: Approval flow in Task 12 uses explicit confirmation (`confirm-approve-button`), per-item mutation state, and idempotency-key headers against `/api/control/approvals/{id}/resolve`; success marks row resolved while failure keeps row pending and exposes retry affordance.
- 2026-03-05: Task 12 automated evidence is generated via Playwright in `tests/e2e/web-shell.spec.ts` with route-level API mocking for happy/error scenarios and screenshots at `.sisyphus/evidence/task-12-realtime.png` + `.sisyphus/evidence/task-12-realtime-error.png`.

- 2026-03-05: Task 13 added modular web panels for config, costs, and sessions under `apps/web/src/features/{config,costs,sessions}` while keeping orchestration/wiring in `apps/web/src/pages/DashboardPage.tsx`.
- 2026-03-05: Config Center guardrail in UI now enforces diff-before-apply by tracking a draft fingerprint; `apply-config-button` remains disabled until `preview-diff-button` succeeds for the same draft.
- 2026-03-05: Session explorer drilldown is implemented by selecting a session row and loading `/api/sessions/{id}` detail while timeline rows are filtered from current event stream by `sessionId`.
- 2026-03-05: Task 13 evidence is captured in Playwright tests with screenshot artifacts `.sisyphus/evidence/task-13-config-cost-session.png` and `.sisyphus/evidence/task-13-config-cost-session-error.png`.

- 2026-03-05: Task 14 introduced dedicated `WebhookCenterPanel` and `MonitoringPanel` modules under `apps/web/src/features/{webhooks,monitoring}`, including webhook create/update/disable/test flows and monitor cards with explicit redaction indicators.
- 2026-03-05: Webhook UI maps delivery status `delivered -> succeeded` for operator readability and exposes delivery detail drawer with error reason plus retry action (`retry-delivery-button`).
- 2026-03-05: Task 14 Playwright evidence is captured via `tests/e2e/web-shell.spec.ts` screenshots `.sisyphus/evidence/task-14-automation-monitoring.png` and `.sisyphus/evidence/task-14-automation-monitoring-error.png`.
- 2026-03-05: Task 15 CI matrix now exists at `.github/workflows/ci.yml` and runs `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` on Node 22 with Playwright Chromium install.
- 2026-03-05: Playwright failure artifacts are now retained by default (`screenshot: only-on-failure`, `trace/video: retain-on-failure`) under `test-results/playwright`, enabling automated failure evidence capture.
## AgentWorkspace Layout & Routing
- Created AgentWorkspacePage with stable testids for testing.
- Updated App.tsx to route /dashboard to AgentWorkspacePage.
- Simplified existing tests to focus on the new shell layout, removing legacy module expectations.
- Verified that all tests pass with the new UI structure.
