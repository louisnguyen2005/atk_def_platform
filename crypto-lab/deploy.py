"""Deploy the isolated two-team lab using a NEW pool's CyberRange SSH config."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
SECRETS = ROOT / '.secrets'
SSH = shutil.which('ssh') or 'ssh'
TASK_PORTS = {'curveball': 9011, 'padding_oracle': 9012, 'ecdsa_nonce': 9013}
FILES = ['service.py', 'protocol.py', 'launcher.py']
HINTS = ['README.md', 'curveball.md', 'padding_oracle.md', 'ecdsa_nonce.md']
remote_installer = (
    "import base64,json,sys; "
    "source=base64.b64decode(sys.stdin.readline()); payload=json.loads(sys.stdin.readline()); "
    "scope={'__name__':'crypto_vm_installer'}; "
    "exec(compile(source,'crypto-vm-installer.py','exec'),scope); "
    "installer=scope['install_team'] if payload.get('role')=='team' else scope['install_checker']; "
    "print(json.dumps(installer(payload),separators=(',',':')))"
)
print_lock = threading.Lock()


def secret(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(secrets.token_urlsafe(24), encoding='utf-8')
        try:
            path.chmod(0o600)
        except OSError:
            pass
    return path.read_text(encoding='utf-8').strip()


def b64_file(path):
    return base64.b64encode(path.read_bytes()).decode('ascii')


def apply_host(alias, config, payload, installer):
    data = base64.b64encode(installer).decode('ascii') + '\n' + json.dumps(payload, separators=(',', ':')) + '\n'
    args = [SSH, '-F', str(config), '-o', 'ConnectTimeout=12', '-o', 'ServerAliveInterval=10',
            '-o', 'ServerAliveCountMax=2', alias, 'sudo -n python3 -c ' + shlex.quote(remote_installer)]
    result = subprocess.run(args, input=data, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=420, cwd=WORKSPACE)
    if result.returncode:
        raise RuntimeError(f"{alias}: remote deployment failed (SSH exit {result.returncode}). {result.stdout.strip()[-900:]}")
    try:
        response = json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError(f'{alias}: installer response was not valid JSON.') from exc
    with print_lock:
        print(f"{alias}: {response.get('services', 'scoreboard')} installed and active")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh-config', required=True, type=Path,
                        help='SSH config downloaded for the new pool; it must define team1, team2 and checker')
    parser.add_argument('--apply', action='store_true', help='install packages, enable password SSH, and start services')
    parser.add_argument('--dry-run', action='store_true', help='show the host aliases without connecting')
    args = parser.parse_args()
    config_path = args.ssh_config.expanduser().resolve()
    if not config_path.is_file():
        raise SystemExit(f'New-pool SSH config not found: {config_path}')
    if args.dry_run:
        print('New pool only: team1 10.81.0.11, team2 10.81.0.12, checker 10.81.0.30')
        print(f'SSH config: {config_path}')
        for alias in ('team1', 'team2', 'checker'):
            print(f'{alias}: would install after the new pool VM is reachable')
        print('No credentials were generated and no remote host was changed.')
        return
    if not args.apply:
        parser.error('choose --dry-run or --apply')

    SECRETS.mkdir(parents=True, exist_ok=True)
    admin_token = secret(SECRETS / 'admin.token')
    checker_tokens = {team: secret(SECRETS / f'{team}.checker-token') for team in ('team1', 'team2')}
    team_tokens = {team: secret(SECRETS / f'{team}.token') for team in ('team1', 'team2')}
    passwords = {team: secret(SECRETS / f'{team}-login.password') for team in ('team1', 'team2')}
    installer = (ROOT / 'vm_installer.py').read_bytes()

    jobs = []
    for index, team in enumerate(('team1', 'team2'), start=1):
        app_files = {name: b64_file(ROOT / name) for name in FILES}
        app_files['hints'] = {name: b64_file(ROOT / 'hints' / name) for name in HINTS}
        jobs.append((team, {'role': 'team', 'team': team, 'ssh_password': passwords[team],
                            'checker_token': checker_tokens[team], 'files': app_files}))

    controller = {'bind_host': '10.81.0.30', 'public_host': '10.81.0.30', 'http_port': 8088,
                  'demo': False, 'ticks': 15, 'tick_seconds': 120, 'flag_ttl': 2,
                  'admin_token': admin_token, 'checker_tokens': checker_tokens, 'teams': [
                      {'id': 'team1', 'name': 'Team 01', 'host': '10.81.0.11',
                       'ports': dict(TASK_PORTS), 'token': team_tokens['team1']},
                      {'id': 'team2', 'name': 'Team 02', 'host': '10.81.0.12',
                       'ports': dict(TASK_PORTS), 'token': team_tokens['team2']},
                  ]}
    controller_files = {name: b64_file(ROOT / name) for name in ('controller.py', 'protocol.py')}
    controller_files.update({name: b64_file(ROOT / 'dashboard' / name)
                             for name in ('index.html', 'dashboard.css', 'dashboard.js')})
    jobs.append(('checker', {'role': 'checker', 'controller': controller, 'files': controller_files}))

    for team in ('team1', 'team2'):
        login = SECRETS / f'{team}-login.txt'
        login.write_text(f"VM: {('10.81.0.11' if team == 'team1' else '10.81.0.12')}\nUsername: user-access\nPassword: {passwords[team]}\n",
                         encoding='utf-8')
        try:
            login.chmod(0o600)
        except OSError:
            pass

    failed = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(apply_host, alias, config_path, payload, installer): alias for alias, payload in jobs}
        for future in as_completed(futures):
            alias = futures[future]
            try:
                future.result()
            except Exception as exc:
                failed.append((alias, str(exc)))
    if failed:
        print('Some hosts were not installed. Rerun after correcting their management SSH entries:')
        for alias, message in failed:
            print(f'  {alias}: {message}')
        raise SystemExit(1)
    print('CyberRange scoreboard: http://10.81.0.30:8088/')
    print('ncat team1: ncat 10.81.0.11 9011 (also use ports 9012 and 9013)')
    print('ncat team2: ncat 10.81.0.12 9011 (also use ports 9012 and 9013)')
    print('Team SSH login passwords and organizer key were saved in crypto-lab/.secrets/.')


if __name__ == '__main__':
    main()
