# @apps/web

`@apps/web` is the frontend for OpenClaw Dashboard.
It is a Vite + React application that provides the authenticated dashboard shell and
the Agent Workspace experience at `/dashboard`.

## What it does

- handles token-based login for the local daemon
- redirects authenticated users into the dashboard
- renders agent cards and live status updates
- opens a 600px workspace drawer for the selected agent
- shows a recursive file tree for agent workspaces
- previews markdown files and supports editing supported text files
- sends save requests through the daemon control API

## Stack

- React 18
- React Router 6
- Vite 5
- Tailwind CSS via PostCSS
- Vitest + Testing Library

## Commands

Run from the repo root:

```bash
pnpm --filter @apps/web dev
pnpm --filter @apps/web test
pnpm --filter @apps/web build
```

## Important paths

- `src/app/App.tsx` - app routing and auth gate
- `src/pages/AgentWorkspacePage.tsx` - main Agent Workspace page
- `src/components/` - UI building blocks such as agent cards, file tree, and editor
- `src/styles/` - dashboard styles and Tailwind entrypoint
- `test/` - component and app-level tests

## Notes

- the main product entry is `/dashboard`
- the app expects a reachable local daemon API
- browser regression coverage lives in the repo-level `tests/e2e`
