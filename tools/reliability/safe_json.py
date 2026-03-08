import json
from typing import Any


class SafeJsonError(ValueError):
    pass


def safe_json_loads(body: str, content_type: str | None, status_code: int | None = None) -> Any:
    normalized_ct = (content_type or "").lower()

    if status_code in (403, 429) and "json" not in normalized_ct:
        raise SafeJsonError(f"RATE_LIMIT_OR_FORBIDDEN_NON_JSON: status={status_code} body={body[:120]}")

    if "json" not in normalized_ct and body.strip() and not body.strip().startswith(("{", "[")):
        raise SafeJsonError("NON_JSON_PAYLOAD")

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise SafeJsonError(f"INVALID_JSON: {exc.msg}") from exc
