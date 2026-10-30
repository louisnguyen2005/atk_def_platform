import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError

from web_health import check_web


class WebHealthTests(unittest.TestCase):
    def response(self, body, status=200):
        context = MagicMock()
        context.__enter__.return_value.status = status
        context.__enter__.return_value.read.return_value = body
        return context

    def test_health_contract(self):
        for body, code, expected in [
            (b'{"status":"ok"}', 200, 'UP'),
            (b'{"status":"error"}', 200, 'DOWN'),
            (b'<html>login</html>', 200, 'DOWN'),
            (b'[]', 200, 'DOWN'),
            (b'{"status":"ok"}', 503, 'DOWN'),
        ]:
            with self.subTest(body=body, code=code), patch('web_health.build_opener') as opener:
                opener.return_value.open.return_value = self.response(body, code)
                self.assertEqual(check_web({'name': 'team', 'url': 'http://example/health'}, 3)['status'], expected)

    def test_unreachable_is_down(self):
        with patch('web_health.build_opener') as opener:
            opener.return_value.open.side_effect = URLError('connection refused')
            self.assertEqual(check_web({'name': 'team', 'url': 'http://example/health'}, 3)['status'], 'DOWN')


if __name__ == '__main__':
    unittest.main()
