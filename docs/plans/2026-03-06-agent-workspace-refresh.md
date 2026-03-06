# Agent Workspace Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the misleading loading/offline states in Agent Workspace and split quick-view sidebar behavior from full workspace browsing/editing.

**Architecture:** Keep `/dashboard` as the agent overview entry, turn the right drawer into a lightweight quick-view surface for per-agent pinned markdown files, and add a dedicated full-workspace route for file tree browsing and editing. Improve status handling in both the web app and daemon so transient failures do not present healthy agents as offline.

**Tech Stack:** React, React Router, Vite, Vitest, Playwright, Node daemon APIs.

---

### Task 1: Fix false loading and false offline behavior

**Files:**
- Modify: `apps/web/src/pages/AgentWorkspacePage.tsx`
- Modify: `apps/web/src/components/AgentList.tsx`
- Modify: `apps/web/src/hooks/useAgentStatus.ts`
- Modify: `apps/daemon/src/api/read/agents.js`
- Test: `apps/web/test/agent-workspace.test.tsx`
- Test: `apps/daemon/test/api/read/agents-read.test.js`

**Step 1:** Write failing tests for the sidebar quick state and status handling.

**Step 2:** Run targeted tests and confirm they fail for the expected reasons.

**Step 3:** Implement minimal fixes so:
- the left sidebar stops being a hardcoded loading skeleton
- agent cards do not present configured fallback agents as permanently offline when live status is available
- status polling does not downgrade to `offline` on one transient error

**Step 4:** Re-run targeted tests until green.

### Task 2: Split quick view from full workspace editing

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/pages/AgentWorkspacePage.tsx`
- Create: `apps/web/src/pages/AgentWorkspaceBrowserPage.tsx`
- Create or modify: supporting components/hooks under `apps/web/src/components/` and `apps/web/src/hooks/`
- Test: `apps/web/test/agent-workspace.test.tsx`
- Test: `tests/e2e/agent-workspace.spec.ts`

**Step 1:** Write failing tests for the new quick-view drawer and full workspace page route.

**Step 2:** Implement the drawer as read-oriented quick view for pinned markdown files.

**Step 3:** Implement `/agents/:agentId/workspace` as the dedicated file browser/editor surface.

**Step 4:** Re-run targeted web and E2E tests until green.

### Task 3: Add per-agent pinned markdown preferences

**Files:**
- Modify: `apps/web/src/pages/AgentWorkspacePage.tsx`
- Create or modify: local preference helpers under `apps/web/src/`
- Test: `apps/web/test/agent-workspace.test.tsx`

**Step 1:** Write failing tests for saving and loading per-agent pinned markdown preferences.

**Step 2:** Implement local persistence with a simple user-editable preference model.

**Step 3:** Re-run targeted tests until green.

### Task 4: Verify end to end

**Files:**
- No new production files required

**Step 1:** Run diagnostics for all modified TS/TSX files.

**Step 2:** Run:
- `pnpm --filter @apps/web test`
- `pnpm --filter @apps/daemon test`
- `pnpm --filter @apps/web build`
- `pnpm test:e2e --reporter=list`
- `pnpm -w build`

**Step 3:** Use Playwright to verify the dashboard behavior in the browser.
