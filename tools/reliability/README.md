# Librarian Reliability Patch Kit

This package provides three focused guards to stop the failure classes we observed:

1. Non-JSON 429/403 payloads being parsed as JSON.
2. Missing retry/backoff policy for rate-limited responses.
3. `Task not found` when session exists (task/session fallback path).

## Modules

- `tools.reliability.safe_json`
  - `safe_json_loads(...)`
  - Fails fast with `SafeJsonError` for non-JSON 429/403 text bodies.

- `tools.reliability.rate_limit`
  - `compute_retry_delay_seconds(...)`
  - Supports `Retry-After` and exponential backoff.

- `tools.reliability.task_registry`
  - `TaskRegistry.lookup_with_fallback(...)`
  - Falls back from task lookup to session lookup to avoid losing completed payloads.

## Quick Integration

```python
from tools.reliability.safe_json import safe_json_loads, SafeJsonError
from tools.reliability.rate_limit import BackoffState, compute_retry_delay_seconds


def parse_http_response(body: str, content_type: str, status: int):
    try:
        return safe_json_loads(body, content_type=content_type, status_code=status)
    except SafeJsonError:
        if status in (403, 429):
            delay = compute_retry_delay_seconds(
                status_code=status,
                retry_after_header=None,
                state=BackoffState(attempt=1, base_delay_seconds=1.0, max_delay_seconds=60.0),
                jitter=True,
            )
            return {"retry": True, "delay_seconds": delay}
        raise
```

## Test

```bash
python -m unittest discover "tools/reliability/tests"
```

## What this fixes immediately

- Prevents "Unexpected token 'T' ... Too Many Requests ... not valid JSON" class errors.
- Establishes deterministic retry timing for 403/429/5xx.
- Prevents losing result retrieval when task handle disappears but session is still present.
