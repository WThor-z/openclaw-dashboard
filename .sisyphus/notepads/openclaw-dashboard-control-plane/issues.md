# Issues (append-only)

- 2026-03-04: `git worktree list --porcelain` fails because workspace is not a git repository.

- 2026-03-04: Librarian background tasks failed to spawn (task() returned status=error with no session_id/task_id retrievable); use direct `webfetch` for docs until tool is stable.

- 2026-03-04: `pnpm install` encountered intermittent npm registry `ECONNRESET` warnings; retries eventually completed successfully.

- 2026-03-04: Package-level Vitest runs inherited root include globs unexpectedly; adding `apps/daemon/vitest.config.ts` plus explicit `--config` in package script was required for local `test/**/*.test.js` discovery.

- 2026-03-04: Node `node:sqlite` emits an ExperimentalWarning on every storage test run under Node v22.14.0; behavior is expected for now and captured in evidence logs.

- 2026-03-04: `pnpm --filter @apps/daemon test -- -t "auth failures"` still executes all daemon suites (title filter applies to test cases but does not skip file discovery), so task evidence captures full-suite output for both happy/error-path logs.
- 2026-03-04: Even with `-t`/`--testNamePattern`, Vitest output under `pnpm --filter @apps/daemon test -- ...` may omit per-case lines in evidence logs unless the selected test produces explicit assertion output; rely on command line args captured in log header plus integration assertions.
- 2026-03-04: For Task 3 evidence runs, setting `SIM_MODE=valid-auth|bad-auth` intentionally causes one simulator integration case to run and one to skip; this keeps logs deterministic while proving each mode independently.

- 2026-03-04: `pnpm test --filter gateway-sim` originally forwarded `--filter` to Vitest (unknown option) because it was treated as a script arg; fixed by routing root `test` through `scripts/test-entry.mjs` and lifting `--filter` into pnpm recursive args.
- 2026-03-04: LSP diagnostics for JSON files are limited in this environment because configured `biome` LSP is not installed; TypeScript/JavaScript diagnostics still run clean for changed executable source files.

- 2026-03-04: Task 6 evidence command `pnpm --filter @apps/daemon test -- test/ingest/pipeline.test.js -t "idempotent|malformed"` still executes full daemon suite under current script wiring; log remains valid but includes unrelated passing suites.
- 2026-03-04: For Task 7 evidence, `pnpm --filter @apps/daemon test -- test/api/read/read-apis.test.js -t "rejects unbounded event limit"` still runs full suite under current package script, so error-path evidence includes broader passing output plus target-case coverage.

- 2026-03-04: Task 8 evidence commands with `pnpm --filter @apps/daemon test -- ... -t ...` still execute all daemon test files due current Vitest invocation shape in package script; targeted scenario output is present but bundled with full-suite pass lines.
