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
