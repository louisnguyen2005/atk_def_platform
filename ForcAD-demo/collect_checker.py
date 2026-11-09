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
sys.path.insert(0, str(ROOT.parent / 'shared'))
import labconfig  # noqa: E402

# Active lab: $MEKO_LAB (default round1) -> labs/<lab>/lab.json and checkers/<lab>/rpc.
LAB = labconfig.load()
TEAM_IPS = {team['ip'] for team in LAB['teams']}
BRIDGE = ROOT / 'checkers' / 'mekodata_bridge'
REQUEST = BRIDGE / 'request.json'
REMOTE = 'sudo -n -u web-checker /usr/bin/python3 /opt/web-checker/web_health.py --config /etc/web-checker/web_targets.json --json --database /var/lib/web-checker/results.sqlite3'
RPC_ROOT = ROOT / 'checkers' / LAB['name'] / 'rpc'
# round1 keeps these defaults; other labs declare them in lab.json.
AGENT_COMMAND = LAB.get('agent_command', 'sudo -n /usr/bin/python3 /opt/round1/agent.py --config /etc/round1/agent.json')
AGENT_TIMEOUT = LAB.get('agent_timeout', 15)


def process_rpc(path, lab=None):
    """Only send structured, expiring requests to the fixed sandbox agent."""
    identity = path.name.removesuffix('.request.json')
    response = path.parent / (identity + '.response.json')
    config = lab or LAB
    team_ips = {team['ip'] for team in config['teams']}
    command = config.get('agent_command', AGENT_COMMAND)
    if response.exists():
        return
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if not re.fullmatch('[0-9a-f]{32}', identity) or data['id'] != identity:
            return
        if not 0 < float(data['expires']) - time.time() <= 45:
            return
        if data['payload']['ip'] not in team_ips or data['payload']['task'] not in config['tasks']:
            raise ValueError('Invalid action/team')
        proc = subprocess.run(labconfig.ssh(config, config['checker_host'], command),
                              input=json.dumps(data['payload']), text=True, capture_output=True,
                              timeout=config.get('agent_timeout', AGENT_TIMEOUT), cwd=labconfig.WORKSPACE,
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
    proc = subprocess.run(labconfig.ssh(LAB, LAB['checker_host'], REMOTE),
                          text=True, capture_output=True, timeout=25, cwd=labconfig.WORKSPACE,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    # The checker exits 1 when any team is DOWN, but still returns valid results.
    if proc.returncode not in (0, 1):
        raise RuntimeError('SSH checker failed: ' + proc.stderr.strip()[-500:])
    data = json.loads(proc.stdout)
    expected = {team['name'] for team in LAB['teams']}
    if len(data['results']) != len(expected) or {r['name'] for r in data['results']} != expected:
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
    parser.add_argument('--labs', help='Comma-separated labs, e.g. round1,crypto_ad')
    args = parser.parse_args()
    labs = [labconfig.load(name) for name in args.labs.split(',')] if args.labs else [LAB]
    BRIDGE.mkdir(parents=True, exist_ok=True)
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
    else:
        import fcntl
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Collector is already running', file=sys.stderr)
            return 1
    executor = ThreadPoolExecutor(max_workers=8)
    pending = {}
    while True:
        try:
            process_request()
            pending = {path: job for path, job in pending.items() if not job.done()}
            for lab in labs:
                for path in (ROOT / 'checkers' / lab['name'] / 'rpc').glob('*.request.json'):
                    if path not in pending and len(pending) < 8 and not path.with_name(path.name.replace('.request.', '.response.')).exists():
                        pending[path] = executor.submit(process_rpc, path, lab)
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
