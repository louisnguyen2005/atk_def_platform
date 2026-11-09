"""Add crypto to existing web VMs. Does not start a match or change web services."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / 'shared'))
import labconfig


def remote(lab, host, command, input=None, timeout=40):
    result = subprocess.run(labconfig.ssh(lab, host, command), input=input,
                            capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # Never include stdout: the installer returns checker credentials there.
        raise RuntimeError(f'SSH action failed on {host}: {result.stderr[-1500:]}')
    return result.stdout


def install(lab, host, payload):
    script = 'import json\nPAYLOAD = json.loads(' + repr(json.dumps(payload)) + ')\n'
    script += (ROOT / 'install_remote.py').read_text()
    output = remote(lab, host, 'sudo -n /usr/bin/python3 -', input=script, timeout=600)
    return json.loads(output.strip().splitlines()[-1])


def workspace_payload(team, all_teams, ports, app):
    opponents = [other for other in all_teams if other['name'] != team['name']]
    return {
        'role': 'workspace',
        'team': team['name'],
        'player_user': team['player_user'],
        'opponents': [{'name': other['name'], 'ip': other['ip']} for other in opponents],
        'ports': ports,
        'files': {name: (app / name).read_text() for name in ('service.py', 'protocol.py')},
        'submit_flag.py': (ROOT / 'sandbox' / 'player-workspace' / 'submit_flag.py').read_text(),
    }


def install_workspaces(lab, crypto):
    app = ROOT / 'sandbox' / 'app'
    for team in lab['teams']:
        payload = workspace_payload(team, lab['teams'], crypto['task_ports'], app)
        result = install(lab, team['host'], payload)
        print(f"{team['name']}: player workspace installed at {result['path']}", flush=True)


def probe(lab):
    config = labconfig.load('crypto_ad')
    for team in lab['teams']:
        for task in config['tasks']:
            request = {'task': task, 'action': 'check', 'ip': team['ip']}
            result = json.loads(remote(lab, lab['checker_host'], config['agent_command'], json.dumps(request)))
            print(f"{team['name']}/{task}: {result['status']} {result['public']}")
            if result['status'] != 101:
                raise RuntimeError('Crypto functional probe failed')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--web-lab', choices=('round1', 'meko_boutique'), required=True)
    parser.add_argument('--ssh-config')
    parser.add_argument('--player-user', help='Existing login; default: team name for boutique, user-access for round1')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--probe', action='store_true')
    mode.add_argument('--workspace', action='store_true',
                      help='install/update per-challenge source, connection details and work files only')
    args = parser.parse_args()
    if args.player_user and not re.fullmatch(r'[a-z_][a-z0-9_-]*', args.player_user):
        parser.error('Invalid player username')
    lab = labconfig.load(args.web_lab)
    for team in lab['teams']:
        team['player_user'] = args.player_user or (team['name'] if args.web_lab == 'meko_boutique' else 'user-access')
    if args.ssh_config:
        lab['ssh_config'] = str(Path(args.ssh_config).resolve())
    if args.probe:
        probe(lab)
        return
    crypto = labconfig.load('crypto_ad')
    if args.workspace:
        for team in lab['teams']:
            remote(lab, team['host'], 'sudo -n true')
            remote(lab, team['host'], 'id ' + team['player_user'])
        install_workspaces(lab, crypto)
        return
    for team in lab['teams']:
        print(f"{team['name']}: SSH {team['host']}; crypto {team['ip']}:9011,9012,9013")
    print(f"Checker: {lab['checker_host']}; ForcAD remains the only scoring engine.")
    if not args.apply:
        print('Plan only. Use --apply to install, --probe to check.')
        return
    # Verify every host before changing any VM.
    for host in [lab['checker_host']] + [t['host'] for t in lab['teams']]:
        remote(lab, host, 'sudo -n true')
    for team in lab['teams']:
        remote(lab, team['host'], 'id ' + team['player_user'])
        preflight = """import socket,pathlib
if not pathlib.Path('/etc/meko-crypto/service.json').exists():
 for port in (9011,9012,9013):
  s=socket.socket(); s.bind(('0.0.0.0',port)); s.close()
"""
        remote(lab, team['host'], 'sudo -n /usr/bin/python3 -', preflight)
    app = ROOT / 'sandbox' / 'app'
    files = {name: (app / name).read_text() for name in ('service.py', 'protocol.py')}
    roster = {}
    for team in lab['teams']:
        print('Installing crypto on ' + team['host'], flush=True)
        result = install(lab, team['host'], {'role': 'team', 'team': team['name'], 'ip': team['ip'],
                         'player_user': team['player_user'], 'files': files,
                         'workspace': workspace_payload(team, lab['teams'], crypto['task_ports'], app)})
        roster[team['ip']] = {'token': result['token']}
    install(lab, lab['checker_host'], {'role': 'checker', 'config': {'teams': roster, 'timeout': 4},
            'files': {name: (app / name).read_text() for name in ('agent.py', 'protocol.py')}})
    path = ROOT / 'lab.json'
    config = json.loads(path.read_text())
    config['shared_with'] = args.web_lab
    path.write_text(json.dumps(config, indent=2) + '\n')
    probe(lab)
    print('Crypto installed and verified; start Round 2 from ForcAD after web finishes.')


if __name__ == '__main__':
    main()
