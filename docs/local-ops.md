# Local Operations Guide

## Startup

1. Verify runtime and dependencies:
   - `pnpm verify:env`
   - `pnpm install`
2. Start daemon (local-only bind by default):
   - `pnpm --filter @apps/daemon dev`
3. Start web UI:
   - `pnpm --filter @apps/web dev --host 127.0.0.1 --port 4173`
4. Validate health:
   - `curl -s http://127.0.0.1:4060/health`

## Backup and Export

- Create backup manifest:
  - `pnpm ops:backup`
- Backup destination defaults to `./backups`.
- Override with `OPS_BACKUP_DIR=/path/to/backups`.

## Retention Cleanup

- Run retention cleanup (default 14 days):
  - `pnpm ops:retention`
- Override retention window:
  - `node infra/ops/retention-cleanup.mjs --max-age-days 30`

## Recovery

1. Confirm latest backup manifest exists in `./backups`.
2. Restore local state directories (`data`, `.openclaw`) from trusted backup source.
3. Re-run verification gates:
   - `pnpm verify:security`
   - `pnpm verify:ops`
4. Restart daemon and web, then verify dashboard modules load.

## Optional Secure Remote Access (Not v1 default)

- Keep daemon bound to localhost (`127.0.0.1`).
- Use a local tunnel or reverse proxy with authenticated access controls.
- Do not expose daemon directly on `0.0.0.0` without compensating controls.
- Re-run `pnpm verify:security` after remote access changes.
