# Learnings (append-only)

- 2026-03-04: Initialized notepad for plan `openclaw-dashboard-control-plane`.
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
