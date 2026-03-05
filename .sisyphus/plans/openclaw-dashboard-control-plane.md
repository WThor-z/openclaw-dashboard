# OpenClaw Dashboard Control Plane (Local-First)

## TL;DR
> **Summary**: Build a local-first, full-featured OpenClaw control dashboard using a split architecture (daemon + web UI) with safe actuation, realtime observability, and automation guardrails.
> **Deliverables**:
> - Local daemon (Gateway protocol client, ingest, control APIs, webhook worker, filesystem monitors)
> - Web UI (status/event stream, tasks+approvals, config center, costs, sessions/memory, webhook center, workspace/.openclaw monitoring)
> - Test infrastructure (unit/integration/e2e with Gateway simulator)
> **Effort**: XL
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 -> 2 -> 3 -> 5 -> 6 -> 7 -> 8 -> 12 -> 13 -> 15

## Context
### Original Request
User wants a personal OpenClaw dashboard because messaging-app-based usage is insufficient for daily operations and development workflows; user wants stable control and optimization capabilities.

### Interview Summary
- V1 scope: full-featured control console (monitoring + control + automation).
- Deployment: local-first with optional secure remote access later.
- Test strategy: establish test infrastructure from day one.
- Priority modules: realtime status/events, tasks+approvals, config center, cost/token analytics, session/memory browser, webhook automation.
- Additional requirement: per-agent workspace monitoring and `.openclaw` monitoring.
- Architecture/security baseline: local daemon + web UI; single-admin token in v1.

### Metis Review (gaps addressed)
- Locked topology to two-hop connection model (Browser -> daemon -> Gateway) to reduce browser-side credential risk.
- Added explicit scope guardrail: single-user only in v1 (no RBAC/MFA/multi-tenant).
- Added reliability guardrails: reconnect, dedupe, resync, rate limits, write-arming window, webhook circuit breaker.
- Added early Gateway simulator task to keep CI runnable without requiring local OpenClaw runtime.

## Work Objectives
### Core Objective
Deliver a self-hosted OpenClaw control plane that is stable, auditable, and safe-by-default for day-to-day agent operations.

### Deliverables
- `apps/daemon`: local API + Gateway WS client + ingest pipeline + workers.
- `apps/web`: operator UI with all selected modules.
- `packages/shared`: shared contracts/types/schemas.
- `tests/`: protocol contract tests + e2e tests.
- `infra/`: scripts for run/verify/build/test.

### Definition of Done (verifiable conditions with commands)
- `pnpm install` succeeds from repo root.
- `pnpm lint` passes.
- `pnpm test` passes (unit + integration + protocol contracts).
- `pnpm test:e2e` passes with simulator-backed scenarios.
- `pnpm build` succeeds for daemon and web artifacts.
- `pnpm verify:security` passes local guardrail checks (bind scope, redaction, no plaintext secret persistence in app DB).

### Must Have
- Local-only bind defaults for daemon and secure token-based write controls.
- Gateway protocol client implementing challenge-auth flow and reconnect/resync behavior.
- End-to-end observability: status/events/sessions/costs/workspace/.openclaw state.
- Safe control surfaces: task queue, approvals, config diff + guarded apply, webhook delivery controls.
- Automated QA evidence artifacts for every task.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No public bind by default.
- No multi-user RBAC/MFA in v1.
- No blind config writes without diff preview and audit trail.
- No direct browser storage of upstream OpenClaw gateway secrets.
- No dependence on manual-only verification for completion.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after with immediate infra bootstrap (Vitest + Playwright + simulator).
- QA policy: every task includes at least one happy-path and one failure-path scenario.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Shared foundations extracted to Wave 1.

Wave 1: foundation (repo bootstrap, daemon core, protocol client, simulator, storage, ingest)
Wave 2: control/data modules (read APIs, control APIs, webhooks, filesystem monitoring, UI shell, event/task UX)
Wave 3: advanced UX + hardening (config/cost/session UI, automation UI, integration tests, release verification)

### Dependency Matrix (full, all tasks)
| Task | Depends On | Enables |
|---|---|---|
| 1 | - | 2, 3, 4, 5, 11 |
| 2 | 1 | 3, 6, 7, 8, 9, 10 |
| 3 | 1, 2 | 6, 7, 8, 12, 15 |
| 4 | 1 | 3, 6, 12, 15 |
| 5 | 1, 2 | 6, 7, 8, 9, 10, 13 |
| 6 | 2, 3, 5 | 7, 12, 13, 14 |
| 7 | 2, 5, 6 | 12, 13, 14 |
| 8 | 2, 3, 5, 6 | 12, 13, 14, 15 |
| 9 | 2, 5, 6, 8 | 14, 15 |
| 10 | 2, 5 | 14, 15 |
| 11 | 1 | 12, 13, 14 |
| 12 | 3, 4, 7, 8, 11 | 15 |
| 13 | 6, 7, 8, 11 | 15 |
| 14 | 7, 9, 10, 11 | 15 |
| 15 | 4, 8, 12, 13, 14 | 16 |
| 16 | 15 | final sign-off |

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 6 tasks -> quick, deep, unspecified-high
- Wave 2 -> 6 tasks -> unspecified-high, visual-engineering
- Wave 3 -> 4 tasks -> unspecified-high, deep

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task includes Agent Profile + Parallelization + QA Scenarios.


- [ ] 1. Bootstrap Monorepo and Quality Baseline

  **What to do**: Initialize a pnpm workspace with `apps/daemon`, `apps/web`, `packages/shared`, `tests`, and `infra`; pin Node 22+, TypeScript, ESLint, Prettier, Vitest, and Playwright; add root scripts (`lint`, `test`, `test:e2e`, `build`, `verify:env`, `verify:security`) and a CI-ready smoke test.
  **Must NOT do**: Do not add framework-specific business code yet; do not skip version checks; do not add optional tooling not used in v1.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: greenfield foundation with multiple toolchain decisions.
  - Skills: [`superpowers/test-driven-development`] — Reason: enforce test-first setup discipline.
  - Omitted: [`frontend-design`] — Reason: no UI design work in this task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 11 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/start/getting-started` — baseline runtime prerequisites and local workflow.
  - External: `https://github.com/grp06/openclaw-studio` — reference structure for OpenClaw dashboard project layout.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — required scripts and verification contract.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm install` exits 0 from repo root.
  - [ ] `pnpm lint` exits 0 with no errors.
  - [ ] `pnpm test` exits 0 and includes at least one smoke test.
  - [ ] `pnpm verify:env` enforces Node major version >= 22.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path workspace bootstrap
    Tool: Bash
    Steps: Run `pnpm install && pnpm verify:env && pnpm lint && pnpm test`
    Expected: All commands return exit code 0
    Evidence: .sisyphus/evidence/task-1-bootstrap.log

  Scenario: Unsupported runtime rejected
    Tool: Bash
    Steps: Run `NODE_VERSION_OVERRIDE=18.20.0 pnpm verify:env`
    Expected: Non-zero exit with explicit message `Node 22+ required`
    Evidence: .sisyphus/evidence/task-1-bootstrap-error.log
  ```

  **Commit**: YES | Message: `chore(repo): bootstrap monorepo and quality gates` | Files: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `eslint.config.*`, `playwright.config.ts`, `vitest.config.ts`, `infra/*`

- [ ] 2. Create Daemon Skeleton with Local-Only Auth Gate

  **What to do**: Implement `apps/daemon` HTTP server with health/status endpoints, localhost-only bind default (`127.0.0.1`), admin bearer token middleware for write routes, request id logging, and standardized error envelope.
  **Must NOT do**: Do not bind to `0.0.0.0` by default; do not allow unauthenticated writes; do not read/write OpenClaw config yet.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: security-critical server baseline.
  - Skills: [`superpowers/systematic-debugging`] — Reason: enforce deterministic behavior for auth and bind edge cases.
  - Omitted: [`frontend-ui-ux`] — Reason: backend-only task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3, 6, 7, 8, 9, 10 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/web/dashboard` — admin-surface security expectations.
  - External: `https://docs.openclaw.ai/gateway/troubleshooting` — operational status command ladder for diagnostics.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — v1 security baseline and guardrails.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @apps/daemon test` passes auth and bind tests.
  - [ ] `pnpm --filter @apps/daemon dev` starts on `127.0.0.1:4060` by default.
  - [ ] `curl -s http://127.0.0.1:4060/health` returns HTTP 200.
  - [ ] `curl -s -X POST http://127.0.0.1:4060/api/control/ping` returns HTTP 401 without bearer token.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path health and protected write route
    Tool: Bash
    Steps: Start daemon with `DASHBOARD_ADMIN_TOKEN=dev-token`; call `/health`; call write route with `Authorization: Bearer dev-token`
    Expected: Health=200, write route=200 with JSON `{ "ok": true }`
    Evidence: .sisyphus/evidence/task-2-daemon-auth.log

  Scenario: Unauthorized write blocked
    Tool: Bash
    Steps: Call write route without auth header
    Expected: HTTP 401 and error code `UNAUTHORIZED`
    Evidence: .sisyphus/evidence/task-2-daemon-auth-error.log
  ```

  **Commit**: YES | Message: `feat(daemon): add local-only server and auth gate` | Files: `apps/daemon/src/server/*`, `apps/daemon/src/middleware/*`, `apps/daemon/test/*`

- [ ] 3. Implement Gateway Protocol Client (Challenge/Auth/Reconnect)

  **What to do**: Build daemon-side Gateway WS client module implementing connect lifecycle, `connect.challenge` handling, `connect` request framing, auth token injection, event decoding, exponential backoff with jitter, gap detection hooks, and idempotent dedupe key generation.
  **Must NOT do**: Do not place gateway token in browser storage; do not bypass challenge path; do not hard-fail process on transient disconnect.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: protocol correctness + reliability behavior.
  - Skills: [`superpowers/test-driven-development`] — Reason: contract tests must drive protocol implementation.
  - Omitted: [`visual-engineering`] — Reason: no UI scope.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 7, 8, 12, 15 | Blocked By: 1, 2

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/protocol` — handshake, framing, roles/scopes, auth, approvals.
  - External: `https://github.com/openclaw/openclaw/blob/main/src/gateway/client.ts` — protocol behavior patterns around `connect.challenge`.
  - External: `https://github.com/openclaw/openclaw/blob/main/ui/src/ui/gateway.ts` — client-side gateway event handling model.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Protocol unit tests cover challenge reception, connect request build, auth failure, reconnect backoff.
  - [ ] Dedupe key generator is deterministic for same source event.
  - [ ] Client emits internal `status` transitions (`connecting`, `connected`, `degraded`, `disconnected`).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path challenge-auth connection
    Tool: Bash
    Steps: Run simulator in `valid-auth` mode; start daemon protocol client with correct token
    Expected: Client reaches `connected`; receives and stores latest sequence cursor
    Evidence: .sisyphus/evidence/task-3-protocol-client.log

  Scenario: Invalid token and reconnect behavior
    Tool: Bash
    Steps: Start client with bad token against simulator
    Expected: Client enters `degraded`, retries with exponential backoff, no process crash
    Evidence: .sisyphus/evidence/task-3-protocol-client-error.log
  ```

  **Commit**: YES | Message: `feat(protocol): add gateway ws client with reconnect and dedupe` | Files: `apps/daemon/src/gateway/*`, `apps/daemon/test/gateway/*.test.ts`

- [ ] 4. Build Deterministic Gateway Simulator for CI

  **What to do**: Implement a local simulator service (`tests/simulator/gateway-sim.ts`) that emits scripted OpenClaw-like frames (`connect.challenge`, status events, approval events, errors) and supports modes (`valid-auth`, `bad-auth`, `gap`, `flaky-network`) for deterministic automated tests.
  **Must NOT do**: Do not embed implementation shortcuts into production code to satisfy simulator behavior.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: focused test harness module.
  - Skills: [`superpowers/test-driven-development`] — Reason: simulator contract must be test-backed.
  - Omitted: [`superpowers/systematic-debugging`] — Reason: task is deterministic harness, not incident response.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 12, 15 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/protocol` — frame schema and method/event model.
  - External: `https://github.com/openclaw/openclaw/blob/main/scripts/dev/gateway-smoke.ts` — smoke-style Gateway probing behavior.
  - External: `https://github.com/openclaw/openclaw/blob/main/src/gateway/server.auth.test.ts` — challenge/auth test motifs.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm test --filter gateway-sim` exits 0.
  - [ ] Simulator mode switch changes outputs deterministically.
  - [ ] Simulator can run headless in CI and exit cleanly.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path scripted event stream
    Tool: Bash
    Steps: Run simulator `--mode valid-auth --script basic-events`; run probe test
    Expected: Probe receives challenge, hello response, and ordered events
    Evidence: .sisyphus/evidence/task-4-simulator.log

  Scenario: Gap mode triggers missing-seq condition
    Tool: Bash
    Steps: Run simulator `--mode gap`; execute client contract test
    Expected: Test detects sequence gap and asserts resync flag was raised
    Evidence: .sisyphus/evidence/task-4-simulator-error.log
  ```

  **Commit**: YES | Message: `test(simulator): add deterministic gateway protocol simulator` | Files: `tests/simulator/*`, `tests/contracts/*`

- [ ] 5. Define SQLite Schema, Migrations, and Repository Layer

  **What to do**: Create SQLite schema and migration pipeline for `events`, `sessions`, `tasks`, `cost_entries`, `config_snapshots`, `config_operations`, `webhooks`, `webhook_deliveries`, `workspace_metrics`, and `system_metrics`; implement typed repository helpers and seed fixtures for tests.
  **Must NOT do**: Do not store plaintext secrets (gateway token/hook secrets) in application DB; do not skip indexes required for realtime queries.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: data model must support all downstream modules.
  - Skills: [`superpowers/test-driven-development`] — Reason: schema behavior must be migration-tested.
  - Omitted: [`visual-engineering`] — Reason: data layer only.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 7, 8, 9, 10, 13 | Blocked By: 1, 2

  **References** (executor has NO interview context — be exhaustive):
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — canonical table requirements and reliability goals.
  - External: `https://docs.openclaw.ai/cli/sessions` — session metadata fields to model.
  - External: `https://docs.openclaw.ai/gateway/configuration` — config surface requiring snapshot/audit support.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @apps/daemon test -- db` passes migration and repository tests.
  - [ ] Migration up/down tests pass on empty and non-empty fixtures.
  - [ ] Query benchmarks for event timeline and session list remain under defined thresholds in test fixtures.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path migration and read/write roundtrip
    Tool: Bash
    Steps: Run migration; insert fixture rows for each table; query timeline/session/cost views
    Expected: All inserts and reads succeed with expected counts
    Evidence: .sisyphus/evidence/task-5-storage.log

  Scenario: Secret persistence guard
    Tool: Bash
    Steps: Attempt to persist a record with plaintext token fields via repository API
    Expected: Write rejected with validation error `SECRET_PERSISTENCE_BLOCKED`
    Evidence: .sisyphus/evidence/task-5-storage-error.log
  ```

  **Commit**: YES | Message: `feat(storage): add sqlite schema, migrations, and repositories` | Files: `apps/daemon/src/storage/*`, `apps/daemon/migrations/*`, `apps/daemon/test/storage/*`

- [ ] 6. Implement Event Ingestion and Normalization Pipeline

  **What to do**: Build ingestion pipeline that normalizes gateway events, daemon system events, and optional CLI import events into canonical envelope; assign dedupe keys; correlate to sessions/tasks; persist ordered timeline records; expose internal replay/resync trigger.
  **Must NOT do**: Do not assume strictly ordered delivery; do not drop malformed events silently.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: correctness-critical event processing.
  - Skills: [`superpowers/systematic-debugging`] — Reason: handling out-of-order and malformed input.
  - Omitted: [`frontend-design`] — Reason: no UI output.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 7, 12, 13, 14 | Blocked By: 2, 3, 4, 5

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/protocol` — event framing and sequencing context.
  - External: `https://docs.openclaw.ai/concepts/session` — session lifecycle expectations.
  - External: `https://docs.openclaw.ai/cli/sessions` — supplemental CLI session data format.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Ingestion tests prove idempotency for duplicate event payloads.
  - [ ] Gap detection emits explicit resync-required state.
  - [ ] Malformed events are captured in error stream without crashing worker.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path normalized event ingestion
    Tool: Bash
    Steps: Feed simulator stream (`valid-auth`, ordered events) into pipeline
    Expected: Canonical events persisted with session/task correlation and monotonic timeline index
    Evidence: .sisyphus/evidence/task-6-ingestion.log

  Scenario: Duplicate and malformed event handling
    Tool: Bash
    Steps: Inject duplicate event + malformed JSON frame through test harness
    Expected: Duplicate ignored via dedupe key; malformed captured as error event; process remains healthy
    Evidence: .sisyphus/evidence/task-6-ingestion-error.log
  ```

  **Commit**: YES | Message: `feat(daemon): add event normalization and dedupe pipeline` | Files: `apps/daemon/src/ingest/*`, `apps/daemon/test/ingest/*`

- [ ] 7. Build Read APIs for Status, Events, Sessions, Costs, and Monitors

  **What to do**: Implement daemon read endpoints for connection status, event timeline (cursor pagination), session list/detail, cost/token rollups, task list/detail, workspace monitor snapshots, and `.openclaw` monitor snapshots.
  **Must NOT do**: Do not expose raw secret fields; do not return unbounded timelines.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: broad API surface with performance constraints.
  - Skills: [`superpowers/test-driven-development`] — Reason: endpoint contracts and pagination semantics.
  - Omitted: [`visual-engineering`] — Reason: API layer task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 12, 13, 14 | Blocked By: 2, 5, 6

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/cli/sessions` — session listing semantics.
  - External: `https://docs.openclaw.ai/gateway/troubleshooting` — status/readiness concepts for surfaced health.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — required module-level outputs.

  **Acceptance Criteria** (agent-executable only):
  - [ ] OpenAPI/contract tests pass for all read endpoints.
  - [ ] Cursor pagination is stable across inserts.
  - [ ] Redaction tests confirm sensitive paths/values are hidden.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path dashboard read model fetch
    Tool: Bash
    Steps: Seed fixture data; call `/api/status`, `/api/events?cursor=...`, `/api/sessions`, `/api/costs/daily`
    Expected: HTTP 200 with schema-valid JSON and non-empty fixture-backed payloads
    Evidence: .sisyphus/evidence/task-7-read-apis.log

  Scenario: Unbounded query rejected
    Tool: Bash
    Steps: Call `/api/events?limit=50000`
    Expected: HTTP 400 with error code `LIMIT_OUT_OF_RANGE`
    Evidence: .sisyphus/evidence/task-7-read-apis-error.log
  ```

  **Commit**: YES | Message: `feat(daemon): expose read apis for dashboard modules` | Files: `apps/daemon/src/api/read/*`, `apps/daemon/test/api/read/*`

- [ ] 8. Implement Guarded Control APIs (Tasks, Approvals, Config Diff/Apply)

  **What to do**: Add write endpoints for task enqueue/cancel, approval resolve, config diff preview, and guarded config apply; enforce write-arming window, idempotency key, optimistic version checks, and audit event logging for every mutation.
  **Must NOT do**: Do not apply config without version match; do not allow write endpoints when daemon in read-only safety mode.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: high-risk actuation path requiring strong invariants.
  - Skills: [`superpowers/systematic-debugging`] — Reason: edge cases in idempotency and concurrent writes.
  - Omitted: [`frontend-ui-ux`] — Reason: backend mutation controls only.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 12, 13, 14, 15 | Blocked By: 2, 3, 5, 6

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/configuration` — config mutation and validation constraints.
  - External: `https://docs.openclaw.ai/gateway/protocol` — approval-related events and scope semantics.
  - External: `https://docs.openclaw.ai/gateway/troubleshooting` — diagnostics for failed runtime mutations.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Contract tests validate arming required for all write endpoints.
  - [ ] Duplicate idempotency key returns previous result without duplicate mutation.
  - [ ] Config apply rejects stale base version with explicit conflict error.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path guarded config apply
    Tool: Bash
    Steps: Arm writes (`POST /api/control/arm`); request config diff; apply with correct `baseVersion` and idempotency key
    Expected: HTTP 200, config snapshot version increments, audit event persisted
    Evidence: .sisyphus/evidence/task-8-control-apis.log

  Scenario: Stale version conflict
    Tool: Bash
    Steps: Submit config apply with outdated `baseVersion`
    Expected: HTTP 409 with error code `CONFIG_VERSION_CONFLICT` and no config change applied
    Evidence: .sisyphus/evidence/task-8-control-apis-error.log
  ```

  **Commit**: YES | Message: `feat(daemon): add guarded control apis and audit trail` | Files: `apps/daemon/src/api/control/*`, `apps/daemon/test/api/control/*`

- [ ] 9. Build Webhook Automation Core (Registry, Outbox, Retry, Breaker)

  **What to do**: Implement webhook registry APIs, delivery outbox worker, HMAC signing, exponential retry with jitter, per-webhook circuit breaker, and delivery history endpoints; include safe defaults for timeout/concurrency.
  **Must NOT do**: Do not permit unsigned outbound payload mode; do not retry indefinitely without cooldown.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: asynchronous reliability and failure handling.
  - Skills: [`superpowers/systematic-debugging`] — Reason: retries and breaker behavior validation.
  - Omitted: [`frontend-design`] — Reason: backend automation internals.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 14, 15 | Blocked By: 2, 5, 6, 8

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/automation/webhook` — webhook semantics, auth, and security notes.
  - External: `https://docs.openclaw.ai/gateway/configuration` — hook-related config concepts and guardrails.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — required retry and breaker policy.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Worker tests validate retry schedule and breaker open/half-open/closed transitions.
  - [ ] Signature header is present and verifiable in delivery requests.
  - [ ] Delivery history endpoint exposes last status, attempts, and next retry timestamp.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path successful webhook delivery
    Tool: Bash
    Steps: Register webhook to local test receiver; enqueue event; run worker
    Expected: Delivery status `succeeded` on first attempt with valid signature
    Evidence: .sisyphus/evidence/task-9-webhooks.log

  Scenario: Failing endpoint opens circuit breaker
    Tool: Bash
    Steps: Register webhook target returning HTTP 500; enqueue 5 events
    Expected: Retries follow policy then breaker opens; further sends paused until cooldown
    Evidence: .sisyphus/evidence/task-9-webhooks-error.log
  ```

  **Commit**: YES | Message: `feat(daemon): add webhook outbox worker with retry and breaker` | Files: `apps/daemon/src/webhooks/*`, `apps/daemon/test/webhooks/*`

- [ ] 10. Implement Workspace and `.openclaw` Monitoring Collectors

  **What to do**: Build collectors that track per-agent workspace health (size, churn, hot files, failure markers) and `.openclaw` state health (config validity, session store health, gateway runtime artifacts) with strict path allowlist and redaction.
  **Must NOT do**: Do not expose file contents by default; do not allow arbitrary path traversal from UI params.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: filesystem safety + monitoring semantics.
  - Skills: [`superpowers/systematic-debugging`] — Reason: path/security edge cases.
  - Omitted: [`visual-engineering`] — Reason: collector backend work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 14, 15 | Blocked By: 2, 5

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/configuration` — location and behavior of `.openclaw` config/state concepts.
  - External: `https://docs.openclaw.ai/cli/sessions` — session store shape and maintenance implications.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — custom requirement for agent workspace + `.openclaw` monitoring.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Collector unit tests validate allowlist enforcement and redaction.
  - [ ] Snapshot endpoint returns per-agent workspace metrics and `.openclaw` status summary.
  - [ ] Path traversal attempts are rejected with `PATH_NOT_ALLOWED`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path monitor snapshot
    Tool: Bash
    Steps: Seed test directories for 2 agent workspaces and one `.openclaw` fixture; run collector
    Expected: API returns health snapshot for all configured targets with no raw file contents
    Evidence: .sisyphus/evidence/task-10-monitoring.log

  Scenario: Path traversal blocked
    Tool: Bash
    Steps: Call monitor endpoint with target path `../../Users`
    Expected: HTTP 400 with error code `PATH_NOT_ALLOWED`
    Evidence: .sisyphus/evidence/task-10-monitoring-error.log
  ```

  **Commit**: YES | Message: `feat(daemon): add workspace and openclaw state monitoring collectors` | Files: `apps/daemon/src/monitoring/*`, `apps/daemon/test/monitoring/*`

- [ ] 11. Build Web UI Shell, Auth Handshake, and Module Routing

  **What to do**: Scaffold `apps/web` with dashboard layout, module navigation, daemon-token connection form, route guards, and shared data fetching primitives (REST + WS stream subscription proxy endpoints).
  **Must NOT do**: Do not connect browser directly to OpenClaw gateway; do not persist upstream gateway token in browser localStorage.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: core UI architecture and operator UX skeleton.
  - Skills: [`frontend-ui-ux`] — Reason: clear control-plane navigation and usable shell.
  - Omitted: [`superpowers/systematic-debugging`] — Reason: no deep failure triage in this scaffolding task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 12, 13, 14 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://github.com/grp06/openclaw-studio` — proven OpenClaw dashboard navigation and setup patterns.
  - External: `https://docs.openclaw.ai/web/dashboard` — control-ui/admin security constraints.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — selected module list and local-first security model.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @apps/web test` passes route/auth component tests.
  - [ ] UI renders module nav entries for all selected modules.
  - [ ] Daemon token is stored only in in-memory state or secure same-site session cookie (no localStorage persistence).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path authenticated shell load
    Tool: Playwright
    Steps: Open `http://127.0.0.1:3000`; fill `[data-testid="daemon-token-input"]` with `dev-token`; click `[data-testid="connect-button"]`
    Expected: Redirect to dashboard home; `[data-testid="nav-events"]` and `[data-testid="nav-config"]` visible
    Evidence: .sisyphus/evidence/task-11-web-shell.png

  Scenario: Missing token prevented
    Tool: Playwright
    Steps: Open login form; click connect without entering token
    Expected: Inline error text `Token is required`; route remains on login screen
    Evidence: .sisyphus/evidence/task-11-web-shell-error.png
  ```

  **Commit**: YES | Message: `feat(web): add dashboard shell and daemon-auth routing` | Files: `apps/web/src/app/*`, `apps/web/src/components/layout/*`, `apps/web/test/*`

- [ ] 12. Implement Realtime Event Stream + Task/Approval Control UI

  **What to do**: Build UI panels for connection status, live event timeline with filters, task queue state, and approval actions; wire to read/control APIs and realtime subscriptions from daemon.
  **Must NOT do**: Do not execute approval actions without confirmation modal; do not hide failed task states.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: high-density operator workflows and realtime UI state.
  - Skills: [`frontend-ui-ux`] — Reason: actionable, non-noisy operations interface.
  - Omitted: [`git-master`] — Reason: no git-specific workflow required.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 15 | Blocked By: 3, 4, 7, 8, 11

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/protocol` — event and approval semantics.
  - External: `https://docs.openclaw.ai/gateway/troubleshooting` — status/error signatures to surface in UI.
  - External: `https://github.com/grp06/openclaw-studio` — realtime dashboard interaction patterns.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Timeline updates live when simulator emits events.
  - [ ] Task state transitions reflect backend updates (`queued -> running -> succeeded/failed`).
  - [ ] Approval action calls control API and updates row status without full page refresh.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path live stream and approval resolve
    Tool: Playwright
    Steps: Start simulator event script; open Events page; assert `[data-testid="event-row"]` count increases; open Approvals panel; click `[data-testid="approve-button"]`
    Expected: Approval row status changes to `resolved`; success toast appears
    Evidence: .sisyphus/evidence/task-12-realtime.png

  Scenario: Control API failure surfaced
    Tool: Playwright
    Steps: Configure simulator/control API to reject approval; click approve
    Expected: Error toast `Approval failed`; row remains `pending`; retry button visible
    Evidence: .sisyphus/evidence/task-12-realtime-error.png
  ```

  **Commit**: YES | Message: `feat(web): add realtime events and approval/task control panels` | Files: `apps/web/src/features/events/*`, `apps/web/src/features/tasks/*`, `apps/web/src/features/approvals/*`

- [ ] 13. Build Config Center + Cost/Token Analytics + Session/Memory Explorer

  **What to do**: Implement three module screens: (a) Config Center with current config view, diff preview, guarded apply flow; (b) Cost/Token analytics with daily/model/session rollups and anomaly badges; (c) Session/Memory explorer with search, filters, and timeline drilldown.
  **Must NOT do**: Do not expose raw secrets in config views; do not allow direct JSON apply without diff preview.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: complex multi-module UI with data density.
  - Skills: [`frontend-ui-ux`] — Reason: high legibility and operational clarity.
  - Omitted: [`superpowers/systematic-debugging`] — Reason: primary work is feature implementation, not incident triage.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 15 | Blocked By: 6, 7, 8, 11

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/configuration` — config editing constraints and validation behavior.
  - External: `https://docs.openclaw.ai/cli/sessions` — session metadata dimensions.
  - External: `https://docs.openclaw.ai/concepts/session` — session lifecycle and routing context.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Config center only enables apply after diff preview is generated.
  - [ ] Cost charts render from API rollups and support model/date filtering.
  - [ ] Session explorer supports text search + time range filters and opens event drilldown.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path config diff and apply
    Tool: Playwright
    Steps: Open Config module; edit field in form; click `[data-testid="preview-diff-button"]`; then `[data-testid="apply-config-button"]`
    Expected: Diff modal appears; apply success toast shown; config version badge increments
    Evidence: .sisyphus/evidence/task-13-config-cost-session.png

  Scenario: Invalid config blocked
    Tool: Playwright
    Steps: Input invalid type in config form (string for numeric field); request preview/apply
    Expected: Validation error displayed; apply button disabled
    Evidence: .sisyphus/evidence/task-13-config-cost-session-error.png
  ```

  **Commit**: YES | Message: `feat(web): add config center, cost analytics, and session explorer` | Files: `apps/web/src/features/config/*`, `apps/web/src/features/costs/*`, `apps/web/src/features/sessions/*`

- [ ] 14. Build Webhook Center + Workspace/.openclaw Monitoring UI

  **What to do**: Implement automation center for webhook registration/testing/delivery history and dedicated monitoring views for per-agent workspace health and `.openclaw` status with redacted detail drawers.
  **Must NOT do**: Do not show secret values in webhook cards; do not render file content previews by default.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: operations-heavy configuration/monitoring UX.
  - Skills: [`frontend-ui-ux`] — Reason: readable alerting and failure-state ergonomics.
  - Omitted: [`git-master`] — Reason: task does not require git-specific techniques.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 15 | Blocked By: 7, 9, 10, 11

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/automation/webhook` — webhook behavior and security expectations.
  - External: `https://docs.openclaw.ai/gateway/configuration` — `.openclaw` operational context.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — explicit requirement for workspace and `.openclaw` monitoring.

  **Acceptance Criteria** (agent-executable only):
  - [ ] User can create/update/disable webhook entries and view delivery attempts.
  - [ ] Monitoring page displays per-agent workspace cards and `.openclaw` health indicators.
  - [ ] Redaction indicators are visible wherever sensitive values are withheld.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path webhook creation and test dispatch
    Tool: Playwright
    Steps: Open Webhooks module; click `[data-testid="add-webhook-button"]`; fill URL/token alias; save; click `[data-testid="send-test-event-button"]`
    Expected: New webhook appears in list; latest delivery row shows `succeeded`
    Evidence: .sisyphus/evidence/task-14-automation-monitoring.png

  Scenario: Failed webhook delivery visible with retry
    Tool: Playwright
    Steps: Configure webhook target to fail; send test event; click `[data-testid="retry-delivery-button"]`
    Expected: Status changes `failed -> retrying`; error reason visible in drawer
    Evidence: .sisyphus/evidence/task-14-automation-monitoring-error.png
  ```

  **Commit**: YES | Message: `feat(web): add webhook center and workspace/openclaw monitoring views` | Files: `apps/web/src/features/webhooks/*`, `apps/web/src/features/monitoring/*`

- [ ] 15. Implement Integration and E2E Verification Matrix

  **What to do**: Add end-to-end matrix using Playwright + Gateway simulator covering login, live events, approval flow, config diff/apply guardrails, webhook retry behavior, and monitor snapshots; add CI workflow to run lint/test/e2e/build.
  **Must NOT do**: Do not rely on manual UI checks; do not require a real OpenClaw instance for CI.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cross-module reliability and CI integration.
  - Skills: [`superpowers/verification-before-completion`] — Reason: evidence-first completion gating.
  - Omitted: [`frontend-design`] — Reason: verification and automation focus.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 16 | Blocked By: 4, 8, 12, 13, 14

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/gateway/protocol` — protocol behavior expected in integration tests.
  - External: `https://github.com/openclaw/openclaw/blob/main/scripts/dev/gateway-smoke.ts` — smoke validation concept.
  - Plan: `.sisyphus/plans/openclaw-dashboard-control-plane.md` — required test matrix and done conditions.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm test:e2e` passes all critical flows in headless CI mode.
  - [ ] CI pipeline runs `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.
  - [ ] Test artifacts (screenshots/traces) are generated for failed cases.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path full regression matrix
    Tool: Bash
    Steps: Run `pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
    Expected: Exit code 0 for all commands; no skipped critical tests
    Evidence: .sisyphus/evidence/task-15-integration.log

  Scenario: Failure capture on injected approval error
    Tool: Bash
    Steps: Run e2e suite with `SIM_MODE=approval-fail`
    Expected: Target test fails with preserved screenshot/trace in artifacts directory
    Evidence: .sisyphus/evidence/task-15-integration-error.log
  ```

  **Commit**: YES | Message: `test(ci): add simulator-backed e2e matrix and pipeline checks` | Files: `tests/e2e/*`, `.github/workflows/ci.yml`, `apps/*/test/*`

- [ ] 16. Hardening, Ops Scripts, and Final Release Gate

  **What to do**: Add ops scripts for local run, backup/export, data retention cleanup, and security assertions (`localhost bind`, redaction smoke, secret persistence checks); finalize docs for local-first deployment and optional secure remote access path.
  **Must NOT do**: Do not claim production-ready remote exposure; do not remove guardrails for convenience.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: final operational guardrail validation and release readiness.
  - Skills: [`superpowers/verification-before-completion`] — Reason: release only on verified evidence.
  - Omitted: [`frontend-ui-ux`] — Reason: non-UI hardening task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: final sign-off | Blocked By: 15

  **References** (executor has NO interview context — be exhaustive):
  - External: `https://docs.openclaw.ai/web/dashboard` — admin-surface safety expectations.
  - External: `https://docs.openclaw.ai/gateway/troubleshooting` — runbook-style operational checks.
  - External: `https://docs.openclaw.ai/gateway/configuration` — config validation and hot-reload behavior.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm verify:security` passes all guardrail checks.
  - [ ] `pnpm verify:ops` validates run/backup/retention scripts.
  - [ ] Local operator docs include startup, recovery, and safe-remote instructions.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Happy path release gate
    Tool: Bash
    Steps: Run `pnpm verify:security && pnpm verify:ops && pnpm build`
    Expected: All commands succeed and output `release-gate:pass`
    Evidence: .sisyphus/evidence/task-16-hardening.log

  Scenario: Public bind guardrail rejection
    Tool: Bash
    Steps: Run daemon with `DASHBOARD_BIND=0.0.0.0`; execute `pnpm verify:security`
    Expected: Verification fails with `PUBLIC_BIND_BLOCKED`
    Evidence: .sisyphus/evidence/task-16-hardening-error.log
  ```

  **Commit**: YES | Message: `chore(ops): add hardening checks and release gate` | Files: `infra/verify/*`, `docs/local-ops.md`, `docs/security-guardrails.md`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit cadence: one commit per completed task unless task is infra-only setup that must be squashed with immediate fix.
- Conventional message format: `type(scope): description`.
- Required scopes: `daemon`, `web`, `protocol`, `storage`, `tests`, `docs`, `ops`.
- No commit allowed without passing task-local QA scenario commands.

## Success Criteria
- Dashboard runs locally and shows live Gateway state, events, sessions, costs, workspace health, and `.openclaw` monitoring.
- Operator can execute guarded control actions (approvals, config apply with diff, webhook controls) with full audit trail.
- Simulator-backed CI verifies protocol correctness and critical failure handling.
- Security defaults prevent accidental public exposure and secret leakage.
