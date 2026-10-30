"""Native ForcAD checker protocol backed by a structured SSH RPC spool."""
import json
import os
from pathlib import Path
import sys
import time
import uuid

ROOT = Path('/checkers/round1/rpc')


def rpc(payload, timeout=40):
    ROOT.mkdir(parents=True, exist_ok=True)
    identity = uuid.uuid4().hex
    request = ROOT / (identity + '.request.json')
    response = ROOT / (identity + '.response.json')
    temporary = ROOT / (identity + '.tmp')
    temporary.write_text(json.dumps({'id': identity, 'expires': time.time() + timeout, 'payload': payload}), encoding='utf-8')
    os.replace(temporary, request)
    try:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if response.exists():
                data = json.loads(response.read_text(encoding='utf-8'))
                if data['id'] != identity or data['status'] not in (101, 102, 103, 104, 110):
                    raise ValueError('Invalid collector response')
                return data
            time.sleep(0.1)
        return {'status': 110, 'public': 'SSH collector unavailable', 'private': ''}
    finally:
        request.unlink(missing_ok=True)
        response.unlink(missing_ok=True)


def main(task):
    try:
        action, ip = sys.argv[1:3]
        if action not in ('check', 'put', 'get') or ip not in {f'10.80.0.{i}' for i in range(11, 15)}:
            raise ValueError('Invalid action/team')
        payload = {'task': task, 'action': action, 'ip': ip}
        if action in ('put', 'get'):
            if len(sys.argv) != 6:
                raise ValueError('Invalid checker arguments')
            payload.update(key=sys.argv[3], locator=sys.argv[3], flag=sys.argv[4])
        result = rpc(payload)
        print(result.get('public', ''))
        print(result.get('private', ''), file=sys.stderr)
        return result['status']
    except (OSError, ValueError, KeyError, TypeError):
        print('Checker transport failed')
        return 110
