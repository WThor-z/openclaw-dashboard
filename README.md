# openclaw-dashboard

Language: English | [简体中文](README.zh-CN.md)

OpenClaw Dashboard is a local control-plane and Agent Workspace UI for OpenClaw-style
agent environments. It pairs a Node daemon with a React frontend so you can log in,
inspect agents, browse their workspace files, preview markdown and text output, and
save changes back through guarded local APIs.

Public-facing version posts and release blogs live under `news/`.

## Highlights

- Agent Workspace entry at `/dashboard`
- V2 Agent Runtime at `/agents/:agentId/runtime` with conversations, schedules, heartbeat, and memory
- token-gated local login flow
- agent cards with live status polling
- 600px side drawer for workspace inspection
- recursive file tree for agent workspaces
- markdown preview and editable `.md` or `.txt` files
- daemon monitoring, events, sessions, tasks, costs, and webhook-related APIs
- agent discovery fallback from registry, modern config, and legacy config layouts

## Architecture

This repo is a pnpm monorepo with three main layers:

- `apps/web` - Vite + React dashboard UI
- `apps/daemon` - local API server and control plane
- `packages/shared` - shared contracts and types

Supporting directories:

- `news` - public-facing version posts and release technical blogs
- `tests/e2e` - Playwright browser coverage
- `tests/contracts` - cross-app contract coverage
- `tools/simulator` - simulator implementation and launcher package
- `tools` - local ops scripts, reliability helpers, and workspace tooling
- `tests/verification` - environment, security, and ops verification entrypoints

## Monorepo layout

```text
apps/
  daemon/    Local daemon APIs and control flows
  web/       Dashboard frontend
packages/
  shared/    Shared contracts and types
tests/
  contracts/
  e2e/
  verification/
tools/       Ops scripts, reliability helpers, and workspace tooling
```

## Where to put code

If the structure still feels hard to read, start here:

- English map: `docs/directory-map.md`
- Chinese map: `docs/directory-map.zh-CN.md`
- Version news: `news/`

These files are the canonical entry points for repo structure and release-facing docs.

## Requirements

- Node.js 22+
- pnpm 10+

## Quick start

Install dependencies:

```bash
pnpm install
```

Start the daemon:

```bash
pnpm --filter @apps/daemon dev
```

Start the web app in another terminal:

```bash
pnpm --filter @apps/web dev
```

Then open the Vite dev URL, authenticate with your daemon token, and go to
`/dashboard`.

## Common commands

Run from the repo root:

```bash
pnpm test
pnpm test:e2e
pnpm build
pnpm lint
pnpm verify:env
pnpm verify:security
pnpm verify:ops
```

Target a specific app:

```bash
pnpm --filter @apps/daemon test
pnpm --filter @apps/web test
pnpm --filter @apps/web build
```

## Agent discovery behavior

The daemon can discover agents from several sources:

- `~/.openclaw/state/session-registry.json`
- modern config files such as `~/.openclaw/openclaw.json`
- legacy state or config directories such as `.clawdbot`, `.moltbot`, and `.moldbot`

If the runtime session registry is missing, the daemon falls back to configured agents
so the dashboard can still show known workspaces.

## Agent Runtime (V2)

The dashboard now includes a V2 Agent Runtime that lets you interact with agents through persistent conversations, scheduled jobs, heartbeat configuration, and memory bindings.

Runtime routes:

- `/agents/:agentId/runtime` - runtime shell with tabs for Conversations, Schedules, Heartbeat, and Memory
- `/agents/:agentId/runtime/conversations/:conversationId` - specific conversation thread

Runtime capabilities:

- **Conversations** - create, list, and send messages in agent-bound threads with persistent history
- **Schedules** - cron-based recurring prompts with run history
- **Heartbeat** - periodic check-in configuration for agents
- **Memory** - scoped memory bindings (conversation, agent, system) with secretRef-only credential handling

Runtime API endpoints:

- `GET /api/agents/:agentId/conversations` - list agent conversations
- `GET /api/conversations/:conversationId` - conversation detail
- `GET /api/conversations/:conversationId/messages` - conversation messages
- `POST /api/control/agents/:agentId/conversations/create` - create conversation
- `POST /api/control/conversations/:conversationId/messages/send` - send message
- `POST /api/control/conversations/:conversationId/archive` - archive conversation
- `GET /api/agents/:agentId/schedules` - list schedules
- `GET /api/agents/:agentId/schedules/:jobId/runs` - schedule run history
- `POST /api/control/agents/:agentId/schedules/create` - create schedule
- `POST /api/control/agents/:agentId/schedules/:jobId/update` - update schedule
- `POST /api/control/agents/:agentId/schedules/:jobId/run` - trigger schedule run
- `POST /api/control/agents/:agentId/schedules/:jobId/remove` - remove schedule
- `GET /api/agents/:agentId/heartbeat` - read heartbeat config
- `POST /api/control/agents/:agentId/heartbeat/update` - update heartbeat
- `GET /api/agents/:agentId/memory` - read memory bindings
- `POST /api/control/agents/:agentId/memory/configure` - configure memory

## Frontend and API notes

- the frontend uses React, React Router, Vite, and Tailwind via PostCSS
- the daemon exposes read APIs and guarded control APIs for local trusted use
- supported editable files are currently focused on markdown and plain text flows
- Playwright covers the main Agent Workspace login, browse, edit, and save path
- Playwright also covers V2 runtime flows including conversations, schedules, heartbeat, and memory

## Verification

The current repo includes coverage for:

- daemon unit and integration tests
- web component and app tests
- Playwright E2E flows
- workspace-wide TypeScript build verification

Typical validation stack:

```bash
pnpm --filter @apps/daemon test
pnpm --filter @apps/web test
pnpm --filter @apps/web build
pnpm test:e2e
pnpm build
```

## Project status

The project is active and evolving. Some nested app README files still contain older
skeleton text, but this root `README.md` is intended to describe the current repo
shape and working feature set.
