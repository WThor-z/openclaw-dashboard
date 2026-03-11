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
- provides V2 Agent Runtime APIs for conversations, schedules, heartbeat, and memory

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
- `src/domains/agent-runtime/api/read/` - V2 runtime read API for conversations, schedules, heartbeat, and memory
- `src/domains/agent-runtime/api/control/` - V2 runtime control API for creating conversations, sending messages, managing schedules, updating heartbeat, and configuring memory
- `tests/` - daemon unit and integration tests

## Agent discovery behavior

The daemon can discover agents from:

- runtime session registry files
- modern config files such as `openclaw.json`
- legacy config files such as `clawdbot.json`
- legacy state directories such as `.clawdbot`, `.moltbot`, and `.moldbot`

When the runtime registry is missing, configured agents are used as a fallback so the
dashboard can still list known workspaces.

## V2 Agent Runtime API

The daemon exposes V2 runtime endpoints for agent-bound conversations, schedules, heartbeat, and memory:

Read endpoints:

- `GET /api/agents/:agentId/conversations` - list agent conversations
- `GET /api/conversations/:conversationId` - conversation detail
- `GET /api/conversations/:conversationId/messages` - conversation messages
- `GET /api/agents/:agentId/schedules` - list schedules
- `GET /api/agents/:agentId/schedules/:jobId/runs` - schedule run history
- `GET /api/agents/:agentId/heartbeat` - read heartbeat config
- `GET /api/agents/:agentId/memory` - read memory bindings

Control endpoints (require arming):

- `POST /api/control/agents/:agentId/conversations/create` - create conversation
- `POST /api/control/conversations/:conversationId/messages/send` - send message
- `POST /api/control/conversations/:conversationId/archive` - archive conversation
- `POST /api/control/agents/:agentId/schedules/create` - create schedule
- `POST /api/control/agents/:agentId/schedules/:jobId/update` - update schedule
- `POST /api/control/agents/:agentId/schedules/:jobId/run` - trigger schedule run
- `POST /api/control/agents/:agentId/schedules/:jobId/remove` - remove schedule
- `POST /api/control/agents/:agentId/heartbeat/update` - update heartbeat
- `POST /api/control/agents/:agentId/memory/configure` - configure memory

Runtime features:

- **Conversation isolation** - conversations are scoped to agents with unique session keys
- **Schedule management** - cron-based recurring prompts with execution history
- **Heartbeat configuration** - periodic agent check-ins with `every`, `session`, and `lightContext` fields
- **Memory bindings** - scoped memory attachments using `secretRef` and `apiKeyRef` only (no raw secrets)

## Notes

- this service is intended for local trusted environments
- end-to-end browser flows are tested from the repo-level Playwright suite
- V2 runtime APIs reuse the same auth, arming window, idempotency replay, and audit-event persistence as other control APIs
