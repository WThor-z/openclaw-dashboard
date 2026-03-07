# OpenClaw Dashboard Agent Rules

## Scope
- This repository is a monorepo (`apps/web`, `apps/daemon`, `tests/e2e`, `docs`).
- Do not edit `.sisyphus/plans/*` unless the user explicitly asks.

## Product Delivery Order (Mandatory)
- Use **UI-first + contract-first** workflow:
  1. Confirm frontend information architecture and interaction flow.
  2. Build a clickable/high-fidelity frontend demo with mock or preset data.
  3. Freeze API contract (types/schema/OpenAPI) before backend implementation.
  4. Implement backend against contract, then switch frontend from mock to real APIs.
  5. Run regression checks (unit/integration/e2e) for key paths.
- Do not start backend-first implementation when UI flow and API contract are still unclear.

## Git / PR Constraints
- **Never** add `Co-authored-by` trailers unless the user explicitly requests it.
- Before any commit or PR, explicitly list the key checks to run, then run them.
- Keep commits atomic and reviewable; avoid bundling unrelated changes.

## Verification Defaults
- For browser verification, prefer Playwright.
- Support external forwarded environments (for example SSH forwarded `127.0.0.1:13001`) instead of forcing local server startup when external URL is provided.

## Communication
- Keep plans concise and executable.
- If constraints conflict, follow direct user instruction first.
