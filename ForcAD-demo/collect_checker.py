"""Execute a fresh sandbox health check when ForcAD requests a tick."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent
BRIDGE = ROOT / 'checkers' / 'mekodata_bridge'
REQUEST = BRIDGE / 'request.json'
REMOTE = 'sudo -n -u web-checker /usr/bin/python3 /opt/web-checker/web_health.py --config /etc/web-checker/web_targets.json --json --database /var/lib/web-checker/results.sqlite3'
RPC_ROOT = ROOT / 'checkers' / 'round1' / 'rpc'


def process_rpc(path):
    """Only send structured, expiring requests to the fixed sandbox agent."""
    identity = path.name.removesuffix('.request.json')
    response = RPC_ROOT / (identity + '.response.json')
    if response.exists():
        return
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if not re.fullmatch('[0-9a-f]{32}', identity) or data['id'] != identity:
            return
        if not 0 < float(data['expires']) - time.time() <= 45:
            return
        proc = subprocess.run(['ssh', '-F', 'pool101-management-config', '-o', 'BatchMode=yes',
                               '-o', 'ConnectTimeout=8', 'checker',
                               'sudo -n /usr/bin/python3 /opt/round1/agent.py --config /etc/round1/agent.json'],
                              input=json.dumps(data['payload']), text=True, capture_output=True,
                              timeout=15, cwd=ROOT.parent,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if proc.returncode:
            raise RuntimeError('SSH agent unavailable')
        result = json.loads(proc.stdout)
        if result['status'] not in (101, 102, 103, 104, 110):
            raise ValueError('Invalid agent result')
    except FileNotFoundError:
        return
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.TimeoutExpired):
        result = {'status': 110, 'public': 'Sandbox agent unavailable', 'private': ''}
    if path.exists():
        atomic_json(response, dict(result, id=identity))


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / ('.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(data), encoding='utf-8')
    try:
        for attempt in range(20):
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.1)
    finally:
        temporary.unlink(missing_ok=True)


def process_request():
    try:
        request = json.loads(REQUEST.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return False
    request_id = request['request_id']
    if not isinstance(request_id, str) or not re.fullmatch('[0-9a-f]{32}', request_id):
        raise ValueError('Invalid request ID')
    tick = int(request['tick'])
    requested_at = float(request['requested_at'])
    if not 1 <= tick <= 30 or not 0 <= time.time() - requested_at <= 30:
        return False
    response = BRIDGE / 'responses' / (request_id + '.json')
    if response.exists():
        return False
    proc = subprocess.run(['ssh', '-F', 'pool101-management-config', '-o', 'BatchMode=yes',
                           '-o', 'ConnectTimeout=8', 'checker', REMOTE],
                          text=True, capture_output=True, timeout=25, cwd=ROOT.parent,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    # The checker exits 1 when any team is DOWN, but still returns valid results.
    if proc.returncode not in (0, 1):
        raise RuntimeError('SSH checker failed: ' + proc.stderr.strip()[-500:])
    data = json.loads(proc.stdout)
    expected = {f'team0{i}' for i in range(1, 5)}
    if len(data['results']) != 4 or {r['name'] for r in data['results']} != expected:
        raise ValueError('Incomplete checker cycle')
    if int(data['cycle_id']) < 1 or any(r['status'] not in ('UP', 'DOWN') for r in data['results']):
        raise ValueError('Invalid checker results')
    stamp = datetime.fromisoformat(data['checked_at'].replace('Z', '+00:00'))
    if not requested_at - 2 <= stamp.timestamp() <= time.time() + 2:
        raise ValueError('Checker timestamp mismatch')
    data.update(request_id=request_id, tick=tick, requested_at=requested_at)
    atomic_json(response, data)
    atomic_json(BRIDGE / 'latest.json', data)
    print('Tick', tick, 'fresh cycle', data['cycle_id'], data['checked_at'], flush=True)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    lock = (BRIDGE / 'collector.lock').open('a+b')
    if os.name == 'nt':
        import msvcrt
        lock.seek(0)
        if not lock.read(1):
            lock.write(b'0'); lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print('Collector is already running', file=sys.stderr)
            return 1
    executor = ThreadPoolExecutor(max_workers=8)
    pending = {}
    while True:
        try:
            process_request()
            pending = {path: job for path, job in pending.items() if not job.done()}
            for path in RPC_ROOT.glob('*.request.json'):
                if path not in pending and len(pending) < 8 and not path.with_name(path.name.replace('.request.', '.response.')).exists():
                    pending[path] = executor.submit(process_rpc, path)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.TimeoutExpired) as exc:
            print('Collection failed:', exc, file=sys.stderr, flush=True)
            if args.once:
                return 1
        if args.once:
            executor.shutdown(wait=True)
            return 0
        time.sleep(0.5)


if __name__ == '__main__':
    sys.exit(main())
