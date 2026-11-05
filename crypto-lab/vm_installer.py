"""Runs as root via SSH stdin; installs one isolated team VM or the checker VM."""
import base64
import grp
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import subprocess
import sys


def run(argv, *, input_text=None):
    return subprocess.run(argv, input=input_text, text=True, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=360)


def mkdir(path, mode=0o755, owner='root', group='root'):
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    os.chown(target, pwd.getpwnam(owner).pw_uid, grp.getgrnam(group).gr_gid)
    target.chmod(mode)


def write(path, text, mode=0o644, owner='root', group='root'):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')
    os.chown(target, pwd.getpwnam(owner).pw_uid, grp.getgrnam(group).gr_gid)
    target.chmod(mode)


def unpack_file(value):
    return base64.b64decode(value).decode('utf-8')


def ensure_group(name):
    try:
        grp.getgrnam(name)
    except KeyError:
        run(['/usr/sbin/groupadd', '--system', name])


def make_user(password):
    try:
        user = pwd.getpwnam('user-access')
    except KeyError:
        run(['/usr/sbin/useradd', '--create-home', '--shell', '/bin/bash', 'user-access'])
    run(['/usr/sbin/usermod', '--append', '--groups', 'crypto-defenders', 'user-access'])
    run(['/usr/sbin/chpasswd'], input_text=f'user-access:{password}\n')


def team_redeploy(team):
    return '''#!/usr/bin/python3
import os, pathlib, subprocess, sys, tempfile
team = sys.argv[1] if len(sys.argv) > 1 else ''
mode = sys.argv[2] if len(sys.argv) > 2 else ''
if team != __TEAM_ID__ or mode not in ('PATCHED=0','PATCHED=1'): raise SystemExit('usage: crypto-redeploy TEAM PATCHED=0|1')
target = pathlib.Path('/etc/crypto-lab/__TEAM__/team.env')
fd = os.open(target, os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW, 0o640)
with os.fdopen(fd, 'w') as file: file.write(mode+'\\n')
os.chown(target, 0, __GROUP_ID__); os.chmod(target, 0o640)
for service in __SERVICES__:
 subprocess.run(['/usr/bin/systemctl','restart','crypto-lab@__TEAM__-'+service+'.service'],check=True)
print(mode)
'''.replace('__TEAM_ID__', repr(team)).replace('__TEAM__', team).replace(
        '__GROUP_ID__', str(grp.getgrnam('crypto-defenders').gr_gid)).replace(
        '__SERVICES__', repr(['curveball', 'padding_oracle', 'ecdsa_nonce']))


def install_team(config):
    team = config['team']
    if team not in ('team1', 'team2'):
        raise ValueError('invalid team ID')
    run(['/usr/bin/apt-get', 'update', '-qq'])
    run(['/usr/bin/apt-get', 'install', '-y', '-qq', 'python3', 'python3-ecdsa',
         'python3-pycryptodome', 'ncat', 'openssh-server', 'sudo'])
    ensure_group('crypto-defenders')
    make_user(config['ssh_password'])
    mkdir('/opt/crypto-lab', 0o755, 'root', 'crypto-defenders')
    mkdir(f"/opt/crypto-lab/{team}", 0o2775, 'user-access', 'crypto-defenders')
    mkdir(f"/opt/crypto-lab/{team}/hints", 0o2775, 'user-access', 'crypto-defenders')
    mkdir('/etc/crypto-lab', 0o750, 'root', 'crypto-defenders')
    mkdir(f"/etc/crypto-lab/{team}", 0o750, 'root', 'crypto-defenders')
    mkdir('/var/lib/crypto-lab', 0o2770, 'user-access', 'crypto-defenders')
    for name, contents in config['files'].items():
        if name == 'hints' and isinstance(contents, dict):
            for filename, content in contents.items():
                if '/' in filename or filename.startswith('.'):
                    raise ValueError('invalid hint filename')
                write(f'/opt/crypto-lab/{team}/hints/{filename}', unpack_file(content),
                      0o664, 'user-access', 'crypto-defenders')
            continue
        if '/' in name or name.startswith('.'):
            raise ValueError('invalid source filename')
        write(f'/opt/crypto-lab/{team}/{name}', unpack_file(contents), 0o664,
              'user-access', 'crypto-defenders')
    config_json = {'team': team, 'data_dir': '/var/lib/crypto-lab',
                   'admin_token': config['checker_token'], 'patched': '0'}
    write(f'/etc/crypto-lab/{team}/config.json', json.dumps(config_json, indent=2),
          0o640, 'root', 'crypto-defenders')
    write(f'/etc/crypto-lab/{team}/team.env', 'PATCHED=0\n', 0o640, 'root', 'crypto-defenders')

    unit = '''[Unit]
Description=MekoDataCTF educational crypto service %i
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=user-access
Group=crypto-defenders
WorkingDirectory=/opt/crypto-lab
EnvironmentFile=/etc/crypto-lab/TEAM/team.env
ExecStart=/usr/bin/python3 /opt/crypto-lab/launcher.py %i
Restart=on-failure
RestartSec=2
UMask=0007
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/var/lib/crypto-lab
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
'''.replace('TEAM', team)
    write('/etc/systemd/system/crypto-lab@.service', unit, 0o644)

    dropin = Path('/etc/ssh/sshd_config.d/60-crypto-lab.conf')
    write(str(dropin), 'PasswordAuthentication yes\nKbdInteractiveAuthentication no\n', 0o644)
    run(['/usr/sbin/sshd', '-t'])
    run(['/usr/bin/systemctl', 'reload', 'ssh'])

    helper = team_redeploy(team)
    write('/usr/local/sbin/crypto-redeploy', helper, 0o755)
    units = [f'/usr/bin/systemctl restart crypto-lab@{team}-{name}.service' for name in
             ('curveball', 'padding_oracle', 'ecdsa_nonce')]
    helper_commands = [f'/usr/local/sbin/crypto-redeploy {team} PATCHED={mode}' for mode in ('0', '1')]
    sudoers = 'user-access ALL=(root) NOPASSWD: ' + ', '.join(units + helper_commands) + '\n'
    write(f'/etc/sudoers.d/crypto-lab-{team}', sudoers, 0o440)
    run(['/usr/sbin/visudo', '-cf', f'/etc/sudoers.d/crypto-lab-{team}'])
    run(['/usr/bin/systemctl', 'daemon-reload'])
    for name in ('curveball', 'padding_oracle', 'ecdsa_nonce'):
        unit_name = f'crypto-lab@{team}-{name}.service'
        run(['/usr/bin/systemctl', 'enable', '--now', unit_name])
        run(['/usr/bin/systemctl', 'is-active', unit_name])

    home = Path('/home/user-access/crypto-lab')
    mkdir(str(home / 'src'), 0o755, 'user-access', 'user-access')
    mkdir(str(home / 'hints'), 0o755, 'user-access', 'user-access')
    for file in ('service.py', 'protocol.py'):
        shutil.copyfile(f'/opt/crypto-lab/{team}/{file}', home / 'src' / file)
        os.chown(home / 'src' / file, pwd.getpwnam('user-access').pw_uid, grp.getgrnam('user-access').gr_gid)
    for file in Path(f'/opt/crypto-lab/{team}/hints').glob('*.md'):
        shutil.copyfile(file, home / 'hints' / file.name)
        os.chown(home / 'hints' / file.name, pwd.getpwnam('user-access').pw_uid, grp.getgrnam('user-access').gr_gid)
    return {'team': team, 'services': 'active', 'ssh_user': 'user-access'}


def install_checker(config):
    run(['/usr/bin/apt-get', 'update', '-qq'])
    run(['/usr/bin/apt-get', 'install', '-y', '-qq', 'python3', 'python3-ecdsa',
         'python3-pycryptodome', 'sudo'])
    ensure_group('crypto-controller')
    try:
        pwd.getpwnam('crypto-controller')
    except KeyError:
        run(['/usr/sbin/useradd', '--system', '--home', '/var/lib/crypto-lab',
             '--shell', '/usr/sbin/nologin', '--gid', 'crypto-controller', 'crypto-controller'])
    mkdir('/opt/crypto-lab', 0o755)
    mkdir('/opt/crypto-lab/dashboard', 0o755)
    mkdir('/etc/crypto-lab', 0o750, 'root', 'crypto-controller')
    mkdir('/var/lib/crypto-lab', 0o750, 'crypto-controller', 'crypto-controller')
    for name in ('controller.py', 'protocol.py'):
        write(f"/opt/crypto-lab/{name}", unpack_file(config['files'][name]), 0o644)
    for name in ('index.html', 'dashboard.css', 'dashboard.js'):
        write(f"/opt/crypto-lab/dashboard/{name}", unpack_file(config['files'][name]), 0o644)
    controller_json = dict(config['controller'])
    controller_json['database'] = '/var/lib/crypto-lab/scoreboard.sqlite'
    write('/etc/crypto-lab/controller.json', json.dumps(controller_json, indent=2),
          0o640, 'root', 'crypto-controller')
    unit = '''[Unit]
Description=MekoDataCTF Crypto A/D Scoreboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=crypto-controller
Group=crypto-controller
WorkingDirectory=/opt/crypto-lab
ExecStart=/usr/bin/python3 /opt/crypto-lab/controller.py --config /etc/crypto-lab/controller.json
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/crypto-lab
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
'''
    write('/etc/systemd/system/crypto-ad-scoreboard.service', unit, 0o644)
    run(['/usr/bin/systemctl', 'daemon-reload'])
    run(['/usr/bin/systemctl', 'enable', '--now', 'crypto-ad-scoreboard.service'])
    run(['/usr/bin/systemctl', 'is-active', 'crypto-ad-scoreboard.service'])
    return {'host': 'checker', 'scoreboard': 'http://10.81.0.30:8088'}


if __name__ == '__main__':
    payload = json.loads(sys.stdin.readline())
    result = install_team(payload) if payload.get('role') == 'team' else install_checker(payload)
    print(json.dumps(result, separators=(',', ':')))
