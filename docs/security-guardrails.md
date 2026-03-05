# Security Guardrails

## Enforced Checks

`pnpm verify:security` validates:

1. **Localhost bind guard**
   - Blocks public bind values (`0.0.0.0`, `::`, `*`).
   - Failure code: `PUBLIC_BIND_BLOCKED`.
2. **Redaction smoke test**
   - Ensures token/secret keys are returned as `[REDACTED]`.
3. **Secret persistence guard**
   - Ensures plaintext secret/token-like fields are rejected at repository boundary.
   - Failure code path includes `SECRET_PERSISTENCE_BLOCKED`.

## Runtime Defaults

- Daemon bind default: `127.0.0.1:4060`.
- Control routes require bearer token (`DASHBOARD_ADMIN_TOKEN`).
- Write mutations require arming window (`/api/control/arm`).

## Operator Rules

- Do not persist upstream gateway secrets in browser storage.
- Do not disable redaction in read APIs.
- Do not expose daemon publicly by default.
- Keep audit trail and idempotency checks enabled for control mutations.

## Release Gate

Before release, run:

- `pnpm verify:security`
- `pnpm verify:ops`
- `pnpm build`

Expected gate output includes `release-gate:pass`.
