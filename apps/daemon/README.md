# @apps/daemon

Language: English | [简体中文](README.zh-CN.md)

`@apps/daemon` is the local backend for OpenClaw Dashboard.
It exposes read APIs, guarded control APIs, monitoring endpoints, and the agent
workspace file access used by the frontend.

## What it does

- starts a local HTTP daemon for the dashboard
- enforces bearer-token access for dashboard requests
- serves read APIs for status, events, sessions, tasks, costs, monitors, and agents
- serves control APIs for guarded write operations
- loads agent data from session registry files and config fallbacks
- supports legacy OpenClaw-style config and state directories
- resolves agent workspace roots for file browsing and saving

## Commands

Run from the repo root:

```bash
pnpm --filter @apps/daemon dev
pnpm --filter @apps/daemon test
```

## Important paths

- `src/app/` - daemon bootstrap, bind config, and HTTP server composition
- `src/domains/operations/read/` - operations read handlers for status, events, sessions, tasks, costs, and monitors
- `src/shared/middleware/` - daemon-local auth, request id, and error helpers shared across layers
- `src/shared/redaction.js` - shared payload redaction helper used by read and control APIs
- `src/platform/storage/` - database migrations and repository adapters
- `src/platform/monitoring/` - workspace, gateway, and OpenClaw monitoring collectors
- `src/platform/openclaw/` - OpenClaw state/config discovery and session registry loading
- `src/platform/webhooks/` - webhook endpoint policy and outbox delivery worker
- `src/platform/gateway/` - gateway websocket protocol client used by daemon tests and simulator integration
- `src/platform/ingest/` - canonical event envelope normalization and ingestion pipeline
- `src/domains/operations/api/read/` - read-only dashboard API router and read-side agent/webhook handlers
- `src/domains/operations/api/control/` - guarded mutation API router and control-side agent handlers
- `tests/` - daemon unit and integration tests

## Agent discovery behavior

The daemon can discover agents from:

- runtime session registry files
- modern config files such as `openclaw.json`
- legacy config files such as `clawdbot.json`
- legacy state directories such as `.clawdbot`, `.moltbot`, and `.moldbot`

When the runtime registry is missing, configured agents are used as a fallback so the
dashboard can still list known workspaces.

## Notes

- this service is intended for local trusted environments
- end-to-end browser flows are tested from the repo-level Playwright suite
