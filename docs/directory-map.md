# Directory Map

This file is the fastest way to decide **where to put code** in this repo.

## Top-level directories

- `news/` - public-facing version posts and release blogs
- `apps/` - product code only
- `packages/` - cross-app shared contracts/types/helpers
- `tests/` - cross-app verification only (`contracts/`, `e2e/`, `verification/`)
- `tools/` - simulators, reliability helpers, and engineering scripts
- `docs/` - plans and architecture documentation

## App ownership

- `apps/web/` - frontend product app
- `apps/daemon/` - backend daemon product app

## Inside `apps/web/src/`

- `app/` - router, providers, auth, theme, bootstrap
- `domains/<domain>/` - frontend business features/pages
  - `domains/agent-workspace/` - workspace pages, sidebar, and storage/markdown helpers
  - `domains/agent-runtime/` - V2 runtime domain with conversations, schedules, heartbeat, and memory
- `shared/` - reusable UI, hooks, and styles used by web domains
- `main.tsx` - web entrypoint

Rule of thumb: if it is web business behavior, put it in `domains/`; if reused by multiple web domains, put it in `shared/`.

## Inside `apps/daemon/src/`

- `app/` - daemon startup and server composition
- `domains/<domain>/` - backend business logic and API domain handlers
  - `domains/operations/` - operations domain with read/control APIs for agents, webhooks, and workspace
  - `domains/agent-runtime/` - V2 runtime domain with conversations, schedules, heartbeat, and memory APIs
- `platform/` - infrastructure adapters (storage, gateway, monitoring, ingest, webhooks, openclaw)
- `shared/` - daemon-local shared middleware/helpers

Rule of thumb: if it talks to filesystem/network/db/runtime services, it likely belongs in `platform/`.

## Tests placement

- `apps/web/tests/` - web unit/component/integration tests
- `apps/daemon/tests/` - daemon unit/integration tests
- root `tests/contracts/` - cross-app contract tests
- root `tests/e2e/` - end-to-end browser tests
- root `tests/verification/` - env/security/ops verification entrypoints

## Tools placement

- `tools/simulator/` - simulators (for example gateway simulator)
- `tools/ops/` - local ops scripts
- `tools/reliability/` - reliability and safety helpers
- `tools/workspace/` - workspace-level engineering helpers

## Docs placement

- `docs/plans/` - implementation plans and migration plans

## News placement

- `news/` - public-facing version posts, launch blogs, and release-facing technical writeups

## Quick placement checklist

1. Is this product behavior?
   - Yes -> `apps/web` or `apps/daemon`
   - No -> `tools` or `docs`
2. Is it shared across apps?
   - Yes -> `packages/shared`
3. Is it daemon infrastructure?
   - Yes -> `apps/daemon/src/platform/`
4. Is it only test verification across apps?
   - Yes -> root `tests/`
