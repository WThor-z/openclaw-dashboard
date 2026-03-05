from dataclasses import dataclass
import random


@dataclass(frozen=True)
class BackoffState:
    attempt: int
    base_delay_seconds: float
    max_delay_seconds: float


def _parse_retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value.strip())
    except (ValueError, TypeError):
        return None
    if parsed < 0:
        return None
    return parsed


def compute_retry_delay_seconds(
    status_code: int,
    retry_after_header: str | None,
    state: BackoffState,
    jitter: bool = True,
) -> float:
    retry_after = _parse_retry_after(retry_after_header)
    if retry_after is not None:
        return min(retry_after, state.max_delay_seconds)

    if status_code not in (403, 429, 500, 502, 503, 504):
        return 0.0

    raw = state.base_delay_seconds * (2 ** max(0, state.attempt - 1))
    capped = min(raw, state.max_delay_seconds)

    if not jitter:
        return capped

    floor = capped * 0.5
    return random.uniform(floor, capped)
