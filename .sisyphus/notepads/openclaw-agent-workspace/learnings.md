## Learnings
- Ensured  exists even on fetch failure to satisfy .
- Implemented responsive 3-col grid and pulsing dot animation for busy status.
- Used fixed width (600px) for the right-side drawer as requested.
## Learnings
- Ensured agent-list-placeholder exists even on fetch failure to satisfy login.test.tsx.
- Implemented responsive 3-col grid and pulsing dot animation for busy status.
- Used fixed width (600px) for the right-side drawer as requested.
Implemented stable placeholder wrapper in AgentWorkspacePage to ensure login tests pass even when /api/agents fails. Unified status visualization using custom CSS classes across AgentCard and the right drawer.
- Markdown editor save flow must call `/api/control/arm` before each file write request, and each save requires a fresh `idempotency-key` header.
- Shared contracts now standardize `AgentStatus` as `"idle" | "busy" | "offline" | "error"`, matching existing `useAgentStatus` usage in the web app.
- Existing UI components still use local `WorkspaceFile` and gateway snapshot shapes; shared `packages/shared/src/types.ts` is now the canonical source for new agent/workspace API contracts.
NodeNext requires explicit .js extensions for relative imports in TypeScript files.
- Added daemon read endpoints `/api/agents` and `/api/agents/:id/status` by reusing `monitorProviders.gateway()`; note that gateway snapshot `agents` currently contains deduped active entries only, so status lookups rely on active registry visibility.
- Agent API status normalization is best-effort string matching: `error/failed -> error`, busy-like states (`busy/running/active/online/connected`) -> `busy`, offline-like states (`offline/closed/stopped/terminated`) -> `offline`, and all other states fall back to `idle`.
- Agent file APIs must resolve workspace roots from `monitorProviders.gateway().snapshot.agents` (`id` or `agent` match), and relative `entry.workspace` values only work when `DAEMON_MONITOR_OPENCLAW_ROOT` is set.
- Traversal testing over HTTP should use encoded slash payloads (for example `%2E%2E%2Ffile.md`) because URL normalization can collapse plain `..` segments before router matching.
- Control writes above 1MB may fail at JSON body parsing with `PAYLOAD_TOO_LARGE` before route-level file-size checks, but still satisfy the required 413 guardrail.
- To keep control router wiring minimal, `createControlApiRouter` can default `monitorProviders` via `createMonitorProvidersFromEnv()` and still route agent file writes through shared armed/idempotent `handleMutation`.
- Reusable workspace placeholders should follow the existing zinc/indigo utility palette to stay visually consistent with `AgentWorkspacePage`.
- EmptyState now handles AgentList and drawer-left workspace empty/error states, Skeleton covers agent cards and file-content loading states, and ErrorBoundary wraps the drawer workspace pane to isolate render failures.
- `MarkdownViewer` frontmatter extraction is easy to verify by asserting rendered key-value lines from the preamble while ensuring raw HTML content is absent under `skipHtml`.
- `MarkdownEditor` save tests are deterministic when `useAuth`, `fetch`, and `crypto.randomUUID` are mocked together so `idempotency-key` assertions stay stable.
- `/api/agents` cannot depend on `monitorProviders.gateway()` because gateway snapshots intentionally expose only active agents, which hides completed/offline entries required by dashboard history views.
- Reading `state/session-registry.json` directly and deduping by agent name with latest `updatedAt` keeps agent identity stable (`id === name`) while still surfacing current state for both running and ended sessions.

-  should prefer  runtime state (/) and fall back to latest  entry when the agent is missing from gateway active snapshots.

- Agent status endpoint should prefer gateway snapshot runtime state and fall back to the latest session-registry entry when gateway has no matching active agent.

- Web Agent UI now consumes  contract fields (, , ) and AgentList sends  when requesting agents.
- Agent card/workspace identity now use role instead of type, updatedAt instead of lastActive, and AgentList fetches /api/agents with Bearer auth from useAuth token.
- OpenClaw agent discovery must resolve both modern and legacy state/config locations (`.openclaw`, `.clawdbot`, and legacy `clawdbot.json`) because some real installs have no `~/.openclaw` directory at all.
- The agent config fallback must support both `agents.list[]` and legacy `routing.agents` shapes; otherwise migrated gateways can still render an empty dashboard.
- `AgentWorkspacePage` utility classes only render correctly once Tailwind/PostCSS is wired into `apps/web`; the existing design-system CSS alone does not cover those utility class names.
