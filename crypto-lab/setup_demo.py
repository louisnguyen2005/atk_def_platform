"""Start the multi-team range locally and persist per-host demo configuration."""
import argparse
from ipaddress import ip_interface
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
SECRETS = ROOT / '.secrets'
TASKS = {'curveball': 9011, 'padding_oracle': 9012, 'ecdsa_nonce': 9013}


def write_secret(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(value, encoding='utf-8')
        try:
            path.chmod(0o600)
        except OSError:
            pass


def choose_host():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.connect(('10.32.8.223', 443))
        return sock.getsockname()[0]


def get_password(path, label):
    write_secret(path, secrets.token_urlsafe(24))
    return path.read_text(encoding='utf-8').strip()


def spawn(host, port, service_config, log_path):
    argv = [sys.executable, str(ROOT / 'service.py'), '--service', service_config['service'],
            '--config', str(service_config['config']), '--host', host, '--port', str(port)]
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log = log_path.open('ab')
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0) | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
    process = subprocess.Popen(argv, cwd=str(ROOT), stdin=subprocess.DEVNULL, stdout=log,
                               stderr=subprocess.STDOUT, creationflags=flags,
                               start_new_session=(os.name != 'nt'))
    return process, log


def service_ready(host, port, expected):
    try:
        with socket.create_connection((host, port), timeout=1.5) as connection:
            connection.sendall(b'{"op":"info"}\n')
            response = connection.makefile('rb').readline(1000)
        data = json.loads(response)
        return data.get('ok') is True and data.get('service') == expected
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def port_open(host, port):
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def controller_ready(host):
    try:
        with urlopen(f'http://{host}:8088/healthz', timeout=2) as response:
            payload = json.load(response)
        return response.status == 200 and payload.get('service') == 'crypto-ad-scoreboard'
    except (OSError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='auto', help='IPv4 address on the network visible to the team, or auto')
    parser.add_argument('--teams', type=int, default=3, choices=range(2, 10), help='number of demo teams (default 3)')
    args = parser.parse_args()
    host = choose_host() if args.host == 'auto' else args.host
    ip_interface(host + '/32')
    SECRETS.mkdir(parents=True, exist_ok=True)
    admin = get_password(SECRETS / 'admin.token', 'admin token')
    checker_tokens, teams = {}, []
    for index in range(1, args.teams + 1):
        team_id = f'team{index}'
        team_dir = SECRETS / 'vm-state' / team_id
        team_dir.mkdir(parents=True, exist_ok=True)
        ports = {task: (19000 + index * 100 + (TASKS[task] - 9000)) for task in TASKS}
        token_path = SECRETS / f'{team_id}.token'
        token = get_password(token_path, team_id)
        checker_path = SECRETS / f'{team_id}.checker-token'
        checker = get_password(checker_path, team_id + ' checker')
        checker_tokens[team_id] = checker
        config_path = SECRETS / f'{team_id}.json'
        config = {'team': team_id, 'data_dir': str(team_dir), 'admin_token': checker, 'patched': '0'}
        config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
        config_path.chmod(0o600)
        teams.append({'id': team_id, 'name': f'Team {index:02d}', 'host': host,
                      'ports': ports, 'token': token})

    payload = {'bind_host': host, 'public_host': host, 'http_port': 8088, 'demo': True,
               'ticks': 15, 'tick_seconds': 120, 'flag_ttl': 2,
               'admin_token': admin, 'checker_tokens': checker_tokens,
               'teams': teams, 'database': str(SECRETS / 'scoreboard.sqlite')}
    config_path = SECRETS / 'controller.json'
    config_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    config_path.chmod(0o600)
    (SECRETS / 'README.txt').write_text(
        'LOCAL DEMO KEYS\nadmin.token = organizer API key (keep private)\n'
        'teamN.token = team submission keys shown only in demo mode\n'
        'Team checker-token files and JSON configs are private internal checker credentials.\n', encoding='utf-8')
    firewall = (ROOT / 'firewall-demo.ps1').read_text(encoding='utf-8')
    firewall = firewall.replace("'10.13.132.126'", repr(host)).replace(
        "'10.13.128.0/19'", repr(str(ip_interface(host + '/19').network)))
    (SECRETS / 'firewall-demo.ps1').write_text(firewall, encoding='utf-8')

    endpoints = [(team, task, port) for team in teams for task, port in team['ports'].items()]
    ready = [service_ready(host, port, task) for team, task, port in endpoints]
    occupied = [port_open(host, port) for team, task, port in endpoints]
    checker_up = controller_ready(host)
    jobs = []
    logs = []
    if all(ready) and checker_up:
        print('Existing demo services and scoreboard are healthy; reusing them.')
    elif any(occupied) or checker_up:
        raise RuntimeError('A partial demo is already listening. Stop its remaining processes before starting it again.')
    else:
        for team, task, port in endpoints:
            cfg = str(SECRETS / f"{team['id']}.json")
            process, log = spawn(host, port, {'service': task, 'config': cfg},
                                 SECRETS / 'logs' / f"{team['id']}-{task}.log")
            jobs.append({'pid': process.pid, 'team': team['id'], 'task': task, 'host': host, 'port': port})
            logs.append(log)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and not all(service_ready(host, port, task) for _, task, port in endpoints):
            time.sleep(0.25)
        if not all(service_ready(host, port, task) for _, task, port in endpoints):
            raise RuntimeError('One or more line-JSON services failed to start; inspect crypto-lab/.secrets/logs/.')

        log = (SECRETS / 'logs' / 'controller.log').open('ab')
        controller = subprocess.Popen([sys.executable, str(ROOT / 'controller.py'), '--config', str(config_path)],
                                      cwd=str(ROOT), stdin=subprocess.DEVNULL, stdout=log,
                                      stderr=subprocess.STDOUT,
                                      creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) |
                                      getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0),
                                      start_new_session=(os.name != 'nt'))
        jobs.append({'pid': controller.pid, 'team': 'scoreboard', 'task': 'http', 'host': host, 'port': 8088})
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and not controller_ready(host):
            time.sleep(0.25)
        if not controller_ready(host):
            raise RuntimeError('Scoreboard failed to start; inspect crypto-lab/.secrets/logs/controller.log.')
        (SECRETS / 'demo-processes.json').write_text(json.dumps(jobs, indent=2), encoding='utf-8')

    web_env = ROOT.parent / 'MekoDataCTF_Website' / '.env'
    web_admin_path = SECRETS / 'website-admin.txt'
    web_admin_password = get_password(SECRETS / 'website-admin-password.txt', 'website admin password')
    web_email = 'crypto.admin@mekodatactf.local'
    if not web_env.exists():
        web_env.write_text('\n'.join([
            'NODE_ENV=development', f'HOST={host}', 'PORT=3000',
            'SESSION_SECRET=' + secrets.token_hex(48), f'ADMIN_EMAIL={web_email}',
            f'ADMIN_PASSWORD={web_admin_password}', 'CRYPTO_MODE=1', 'CRYPTO_DEMO_MODE=1',
            f'CRYPTO_API_URL=http://{host}:8088', f'CRYPTO_ADMIN_TOKEN={admin}', '',
        ]), encoding='utf-8')
    web_admin_path.write_text(f'Email: {web_email}\nPassword: {web_admin_password}\n', encoding='utf-8')
    try:
        web_admin_path.chmod(0o600)
    except OSError:
        pass

    print(f'Range demo ready. Scoreboard: http://{host}:8088/')
    print(f'MekoDataCTF website: http://{host}:3000/scoreboard')
    for team in teams:
        print(f"{team['name']} line-JSON: " + '  '.join(f"ncat {host}:{team['ports'][task]}" for task in TASKS))
    print('Private admin key: crypto-lab/.secrets/admin.token')
    print('Website admin login: crypto-lab/.secrets/website-admin.txt')
    if web_env.exists() and f'CRYPTO_API_URL=http://{host}:8088' not in web_env.read_text(encoding='utf-8'):
        print('Note: existing Website .env was preserved; update its CRYPTO_API_URL and CRYPTO_ADMIN_TOKEN if needed.')


if __name__ == '__main__':
    main()
