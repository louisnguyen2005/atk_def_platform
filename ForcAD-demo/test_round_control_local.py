"""Check auth and control API on the local demo; leaves rounds paused."""
import http.cookiejar
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
import yaml

base = 'http://127.0.0.1:18080'
opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))

def call(path, data=None, origin=None):
    headers = {'Content-Type': 'application/json'}
    if origin:
        headers['Origin'] = origin
    req = Request(base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
    with opener.open(req, timeout=10) as response:
        return json.load(response)

try:
    call('/api/admin/round-control/')
    raise AssertionError('Unauthenticated request unexpectedly succeeded')
except HTTPError as exc:
    assert exc.code == 403

admin = yaml.safe_load((Path(__file__).parent / 'config.yml').read_text(encoding='utf-8'))['admin']
call('/api/admin/login/', admin)
try:
    call('/api/admin/round-control/', {'running': True}, 'http://evil.invalid')
    raise AssertionError('Cross-origin request unexpectedly succeeded')
except HTTPError as exc:
    assert exc.code == 403

assert call('/api/admin/round-control/', {'running': True}, base)['running'] is True
assert call('/api/admin/round-control/')['running'] is True
assert call('/api/admin/round-control/', {'running': False}, base)['running'] is False
assert call('/api/admin/round-control/')['running'] is False
print('OK: authentication, origin protection, start and stop API.')
