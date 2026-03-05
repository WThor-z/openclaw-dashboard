import unittest

from reliability.rate_limit import BackoffState, compute_retry_delay_seconds


class RetryDelayTests(unittest.TestCase):
    def test_prefers_retry_after_header(self) -> None:
        state = BackoffState(attempt=1, base_delay_seconds=1.0, max_delay_seconds=60.0)
        delay = compute_retry_delay_seconds(status_code=429, retry_after_header="5", state=state, jitter=False)
        self.assertEqual(delay, 5.0)

    def test_uses_exponential_backoff_without_header(self) -> None:
        state = BackoffState(attempt=3, base_delay_seconds=1.0, max_delay_seconds=60.0)
        delay = compute_retry_delay_seconds(status_code=429, retry_after_header=None, state=state, jitter=False)
        self.assertEqual(delay, 4.0)

    def test_caps_max_delay(self) -> None:
        state = BackoffState(attempt=10, base_delay_seconds=2.0, max_delay_seconds=30.0)
        delay = compute_retry_delay_seconds(status_code=429, retry_after_header=None, state=state, jitter=False)
        self.assertEqual(delay, 30.0)

    def test_retries_403_secondary_limit(self) -> None:
        state = BackoffState(attempt=2, base_delay_seconds=1.0, max_delay_seconds=60.0)
        delay = compute_retry_delay_seconds(status_code=403, retry_after_header=None, state=state, jitter=False)
        self.assertEqual(delay, 2.0)


if __name__ == "__main__":
    unittest.main()
