#!/usr/bin/env python3
"""Submit captured flags through the team's authenticated MekoDataCTF session."""
import argparse
from getpass import getpass
from html.parser import HTMLParser
import http.cookiejar
import json
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener


class CsrfParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.token = None

    def handle_starttag(self, tag, attrs):
        if tag != 'input':
            return
        fields = dict(attrs)
        if fields.get('name') == '_csrf':
            self.token = fields.get('value')


def read_csrf(opener, url):
    with opener.open(url, timeout=15) as response:
        parser = CsrfParser()
        parser.feed(response.read().decode('utf-8', errors='replace'))
    if not parser.token:
        raise RuntimeError('Không đọc được CSRF token. Hãy kiểm tra URL hoặc trạng thái đăng nhập.')
    return parser.token


def load_flags(path):
    flags = []
    for raw in path.read_text(encoding='utf-8').splitlines():
        value = raw.strip()
        if value and not value.startswith('#') and value not in flags:
            if len(value) > 100:
                raise ValueError('Flag vượt quá giới hạn 100 ký tự của scoreboard.')
            flags.append(value)
    if not flags:
        raise ValueError(f'Không tìm thấy flag trong {path}. Mỗi flag thật đặt trên một dòng; dòng # là ghi chú.')
    if len(flags) > 100:
        raise ValueError('Mỗi lần chỉ nộp tối đa 100 flag.')
    return flags


def post_form(opener, url, data):
    request = Request(url, data=urlencode(data).encode(), headers={
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    return opener.open(request, timeout=15)


def main():
    parser = argparse.ArgumentParser(description='Đăng nhập và nộp flag trong captured_flags.txt.')
    parser.add_argument('--url', default='http://10.90.0.30:3000',
                        help='website MekoDataCTF; mặc định: http://10.90.0.30:3000')
    parser.add_argument('--file', type=Path, default=Path('captured_flags.txt'),
                        help='mỗi dòng một flag; mặc định: captured_flags.txt')
    parser.add_argument('--team-token', action='store_true',
                        help='đăng nhập bằng token thành viên thay cho email/mật khẩu đội trưởng')
    args = parser.parse_args()

    base = args.url.rstrip('/')
    flags = load_flags(args.file)
    opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [('User-Agent', 'MekoDataCTF-FlagSubmit/1.0')]
    csrf = read_csrf(opener, base + '/login?next=/scoreboard')

    if args.team_token:
        credentials = {'token': getpass('Team token: ')}
        login_path = '/login/token'
    else:
        credentials = {'email': input('Email đội trưởng: ').strip(),
                       'password': getpass('Mật khẩu: ')}
        login_path = '/login'
    credentials.update({'_csrf': csrf, 'next': '/scoreboard'})

    try:
        with post_form(opener, base + login_path, credentials) as response:
            if response.status >= 400:
                raise RuntimeError(f'Đăng nhập thất bại (HTTP {response.status}).')
    except HTTPError as exc:
        raise RuntimeError(f'Đăng nhập thất bại (HTTP {exc.code}); kiểm tra tài khoản.') from None

    # Login regenerates the session. Fetch the scoreboard for the fresh CSRF token.
    csrf = read_csrf(opener, base + '/scoreboard')
    request = Request(base + '/scoreboard/submit', data=json.dumps({'flags': flags}).encode(),
                      headers={'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, method='POST')
    try:
        with opener.open(request, timeout=20) as response:
            body = response.read().decode('utf-8', errors='replace')
            status = response.status
    except HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')
        status = exc.code
    except URLError as exc:
        raise RuntimeError(f'Không kết nối được website: {exc.reason}') from None

    print(f'HTTP {status}')
    try:
        print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))
    except json.JSONDecodeError:
        print(body[:1000])
    return 1 if status >= 400 else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError) as exc:
        print(f'Lỗi: {exc}', file=sys.stderr)
        sys.exit(1)
