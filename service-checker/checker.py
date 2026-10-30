"""Standalone service availability checker; Python standard library only."""
import argparse
import http.cookiejar
import json
import os
import sys
import time
from urllib.parse import urlencode
from urllib.request import build_opener, ProxyHandler, HTTPCookieProcessor, Request


def check(target, timeout):
    opener = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
    base = target['url'].rstrip('/')
    steps = []

    def request(path, data=None, json_response=True):
        req = Request(base + path, data=urlencode(data).encode() if data is not None else None)
        with opener.open(req, timeout=timeout) as response:
            if response.geturl() != base + path:
                raise ValueError('Unexpected redirect')
            if response.status != 200:
                raise ValueError('Expected HTTP 200')
            body = response.read(1048577)
            if len(body) > 1048576:
                raise ValueError('Response too large')
            if json_response:
                return json.loads(body)
            if 'text/html' not in response.headers.get('Content-Type', '') or not body.strip():
                raise ValueError('Expected nonempty HTML page')
            return body

    def require(condition, message):
        if not condition:
            raise ValueError(message)

    started = time.monotonic()
    try:
        request('/', json_response=False)
        steps.append('homepage')
        health = request('/health')
        if target['kind'] == 'identity':
            require(health.get('node') == target['expected_node'], 'Wrong node identity')
        elif target['kind'] == 'servicedesk':
            require(health.get('status') == 'ok' and bool(health.get('sandbox')), 'Invalid service health')
            if target.get('expected_sandbox'):
                require(health['sandbox'] == target['expected_sandbox'], 'Wrong sandbox identity')
        else:
            raise ValueError('Unknown target kind')
        steps.append('health')
        if target['kind'] == 'servicedesk':
            password = os.environ.get(target.get('password_env', ''), '')
            if not password:
                return dict(name=target['name'], status='INCOMPLETE', steps=steps,
                            error='Set password_env before functional checks')
            login = request('/login', {'username': 'alice', 'password': password})
            require(login.get('user') == 'alice', 'Unexpected login result')
            steps.append('login')
            tickets = request('/api/tickets')
            require(isinstance(tickets, list) and bool(tickets), 'Expected own tickets')
            require(all(t.get('owner') == 'alice' for t in tickets), 'Unexpected ticket owner')
            ticket = request('/api/tickets/' + str(int(tickets[0]['id'])))
            require(ticket.get('id') == tickets[0]['id'] and ticket.get('owner') == 'alice'
                    and isinstance(ticket.get('private_note'), str)
                    and ticket.get('status') in ('open', 'closed'), 'Invalid own ticket')
            steps.extend(['list_own_tickets', 'read_own_ticket'])
            require(request('/logout', {}).get('status') == 'logged out', 'Logout failed')
            steps.append('logout')
        return dict(name=target['name'], status='UP', steps=steps,
                    elapsed_ms=round((time.monotonic() - started) * 1000))
    except Exception as exc:
        # Do not print response bodies, credentials, or session cookies.
        return dict(name=target['name'], status='DOWN', steps=steps,
                    error=type(exc).__name__ + ': ' + str(exc),
                    elapsed_ms=round((time.monotonic() - started) * 1000))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--timeout', type=float, default=3)
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    with open(args.config, encoding='utf-8') as stream:
        config = json.load(stream)
    results = [check(target, args.timeout) for target in config['targets']]
    print(json.dumps({'results': results}, ensure_ascii=False, indent=2))
    return 1 if any(r['status'] == 'DOWN' for r in results) else (2 if any(r['status'] == 'INCOMPLETE' for r in results) else 0)


if __name__ == '__main__':
    sys.exit(main())
