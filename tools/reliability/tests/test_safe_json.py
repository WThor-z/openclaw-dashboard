import unittest

from tools.reliability.safe_json import SafeJsonError, safe_json_loads


class SafeJsonLoadsTests(unittest.TestCase):
    def test_parses_valid_json(self) -> None:
        value = safe_json_loads('{"ok": true}', content_type="application/json")
        self.assertEqual(value["ok"], True)

    def test_rejects_rate_limit_plain_text(self) -> None:
        with self.assertRaises(SafeJsonError) as ctx:
            safe_json_loads("Too Many Requests", content_type="text/plain", status_code=429)
        self.assertIn("RATE_LIMIT", str(ctx.exception))

    def test_rejects_invalid_json(self) -> None:
        with self.assertRaises(SafeJsonError) as ctx:
            safe_json_loads("{bad json", content_type="application/json")
        self.assertIn("INVALID_JSON", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
