"""Runs on the sandbox checker VM; accepts one structured request over SSH stdin."""
import argparse
import base64
import io
import json
from pathlib import Path
import secrets
import sys
from urllib.error import HTTPError, URLError
from urllib.request import build_opener, ProxyHandler, Request
import zipfile


def execute(request, config):
    team = config['teams'].get(request.get('ip'))
    task, action = request.get('task'), request.get('action')
    if not team or task not in ('idor', 'sqli', 'upload', 'health') or action not in ('check', 'put', 'get'):
        raise ValueError('unknown team/task/action')
    base = team['url'].rstrip('/')
    client = build_opener(ProxyHandler({}))

    def call(path, value=None, headers=None):
        data = None if value is None else json.dumps(value).encode()
        req = Request(base + path, data=data, headers={'Content-Type': 'application/json', **(headers or {})})
        with client.open(req, timeout=5) as response:
            if int(response.headers.get('Content-Length', '0')) > 262144:
                raise ValueError('oversized response')
            return json.loads(response.read(262145))

    if action == 'put':
        data = call('/internal/put', {'task': task, 'key': request['key'], 'flag': request['flag']}, {'X-Lab-Admin': team['token']})
        locator = {'id': str(data['id']), 'owner': str(data['owner']), 'path': str(data['path'])}
        public = {'id': locator['id']}
        if task == 'upload':
            public['path'] = locator['path']
        # Confirm persistence through the ordinary owner route before accepting PUT.
        prefix = {'idor': '/api/scores/', 'sqli': '/api/notes/', 'upload': '/api/vault/'}[task]
        verified = call(prefix + locator['id'], headers={'X-Owner-Token': locator['owner']})
        if verified.get('value') != request['flag']:
            return {'status': 102, 'public': 'Flag persistence failed', 'private': ''}
        return {'status': 101, 'public': json.dumps(public), 'private': json.dumps(locator)}
    if action == 'get':
        locator = json.loads(request['locator'])
        prefix = {'idor': '/api/scores/', 'sqli': '/api/notes/', 'upload': '/api/vault/'}[task]
        data = call(prefix + locator['id'], headers={'X-Owner-Token': locator['owner']})
        return {'status': 101 if data.get('value') == request['flag'] else 102, 'public': 'Flag verified' if data.get('value') == request['flag'] else 'Flag missing', 'private': ''}
    health = call('/health')
    if health.get('status') != 'ok' or health.get('lab') != 'round1':
        return {'status': 103, 'public': 'Unexpected service', 'private': ''}
    if task == 'sqli' and not call('/api/search?q=Welcome').get('results'):
        return {'status': 103, 'public': 'Search failed', 'private': ''}
    if task == 'upload':
        stream = io.BytesIO()
        name = secrets.token_hex(8) + '.txt'
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr(name, 'checker-upload-test')
        data = call('/api/upload', {'archive': base64.b64encode(stream.getvalue()).decode()})
        if call(data['files'][0]).get('content') != 'checker-upload-test':
            return {'status': 103, 'public': 'Upload failed', 'private': ''}
    return {'status': 101, 'public': 'Service functional', 'private': ''}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/round1/agent.json')
    args = parser.parse_args()
    try:
        request = json.loads(sys.stdin.read(16384))
        result = execute(request, json.loads(Path(args.config).read_text()))
    except HTTPError as exc:
        result = {'status': 102 if exc.code == 404 else 103, 'public': 'Service request failed', 'private': 'HTTP ' + str(exc.code)}
    except (URLError, TimeoutError, ConnectionError, OSError):
        result = {'status': 104, 'public': 'Service unreachable', 'private': ''}
    except (ValueError, KeyError, TypeError):
        result = {'status': 110, 'public': 'Agent configuration or response invalid', 'private': ''}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
