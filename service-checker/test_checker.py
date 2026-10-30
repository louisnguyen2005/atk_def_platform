import importlib.util
import os
from pathlib import Path
import tempfile
import threading
import unittest
from wsgiref.simple_server import make_server, WSGIRequestHandler

from checker import check


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *args):
        pass


class CheckerTests(unittest.TestCase):
    def test_real_application_before_and_after_owner_patch(self):
        spec = importlib.util.spec_from_file_location('portal', os.environ['PORTAL_SOURCE'])
        portal = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(portal)
        for patched in (False, True):
            with self.subTest(patched=patched), tempfile.TemporaryDirectory() as directory:
                app = portal.create_app(Path(directory) / 'test.sqlite', 'test-only', 'sandbox-test', patched)
                with make_server('127.0.0.1', 0, app, handler_class=QuietHandler) as server:
                    thread = threading.Thread(target=server.serve_forever, daemon=True)
                    thread.start()
                    target = dict(name='test', url=f'http://127.0.0.1:{server.server_port}',
                                  kind='servicedesk', password_env='CHECKER_TEST_PASSWORD',
                                  expected_sandbox='sandbox-test')
                    try:
                        os.environ.pop('CHECKER_TEST_PASSWORD', None)
                        self.assertEqual(check(target, 1)['status'], 'INCOMPLETE')
                        os.environ['CHECKER_TEST_PASSWORD'] = 'wrong'
                        self.assertEqual(check(target, 1)['status'], 'DOWN')
                        os.environ['CHECKER_TEST_PASSWORD'] = 'test-only'
                        result = check(target, 1)
                        self.assertEqual(result['status'], 'UP', result)
                        self.assertIn('read_own_ticket', result['steps'])
                        target['expected_sandbox'] = 'other-sandbox'
                        self.assertEqual(check(target, 1)['status'], 'DOWN')
                    finally:
                        server.shutdown()
                        thread.join()
                        os.environ.pop('CHECKER_TEST_PASSWORD', None)


if __name__ == '__main__':
    unittest.main()
