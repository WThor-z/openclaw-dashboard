# @apps/daemon

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

- `src/server/` - daemon bootstrap and HTTP server
- `src/api/read/` - read-only dashboard APIs
- `src/api/control/` - guarded mutation endpoints
- `src/openclaw/` - agent discovery and session registry loading
- `src/monitoring/` - workspace, gateway, and OpenClaw monitoring collectors
- `test/` - daemon unit and integration tests

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
