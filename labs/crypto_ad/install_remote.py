"""Root installer transported over SSH by deploy.py; PAYLOAD is supplied on stdin."""
import json
import os
from pathlib import Path
import pwd
import secrets
import subprocess


def command(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def write(path, value, mode=0o644, owner='root', group='root'):
    import grp
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(value)
    target.chmod(mode)
    os.chown(target, pwd.getpwnam(owner).pw_uid, grp.getgrnam(group).gr_gid)


def directory(path, user, group, mode=0o750):
    import grp
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    os.chown(target, pwd.getpwnam(user).pw_uid, grp.getgrnam(group).gr_gid)
    target.chmod(mode)


def write_if_missing(path, value, mode, owner, group):
    if not Path(path).exists():
        write(path, value, mode=mode, owner=owner, group=group)


def challenge_source(source, service):
    marker = f"        if self.name == '{service}':"
    start = source.index(marker)
    if service == 'curveball':
        end = source.index("        if self.name == 'padding_oracle':", start)
    elif service == 'padding_oracle':
        end = source.index("        if self.name == 'ecdsa_nonce':", start)
    else:
        end = source.index("        return {'ok': False, 'error': 'unknown_operation'}", start)
    branch = source[start:end].rstrip()

    seal = ''
    if service == 'padding_oracle':
        seal_start = source.index('    def seal(')
        seal_end = source.index('    def dispatch(', seal_start)
        seal = source[seal_start:seal_end].rstrip() + '\n\n'

    header = f'''# Challenge-specific vulnerable source excerpt: {service}
# Extracted from /opt/meko-crypto/service.py; other challenge handlers omitted.
# Reading copy only; the live service source is /opt/meko-crypto/service.py.
# This excerpt uses Service state initialized outside this challenge handler.

class ServiceExcerpt:
'''
    return header + seal + '    def dispatch(self, req):\n        op = req.get(\'op\')\n' + branch + '\n'


def install_workspace(data):
    user = data['player_user']
    account = pwd.getpwnam(user)
    import grp
    group = grp.getgrgid(account.pw_gid).gr_name
    root = Path(account.pw_dir) / 'crypto-lab'
    directory(root, user, group, 0o750)
    write(str(root / 'submit_flag.py'), data['submit_flag.py'], mode=0o750,
          owner=user, group=group)

    opponents = data['opponents']
    roster = ''.join(f"{row['name']} {row['ip']}\n" for row in opponents)
    write(str(root / 'targets.txt'), roster, mode=0o640, owner=user, group=group)
    port_matrix = '# team host curveball padding_oracle ecdsa_nonce\n' + ''.join(
        f"{row['name']} {row['ip']} {data['ports']['curveball']} "
        f"{data['ports']['padding_oracle']} {data['ports']['ecdsa_nonce']}\n"
        for row in opponents)
    write(str(root / 'host_port.txt'), port_matrix, mode=0o640, owner=user, group=group)
    write(str(root / 'README.txt'), '''MekoDataCTF · Crypto workspace
================================

Mỗi thư mục chall có source riêng của lỗ hổng, host/port đối thủ, flag mẫu,
file Python để đội tự viết exploit và file ghi chú.

Bắt đầu:  cd ~/crypto-lab/chall1_curveball
Host/port: cat host_port.txt
Kết nối:   ./connect.sh [IP-đối-thủ]
Nộp flag:  từ thư mục chall chạy `python3 ../submit_flag.py`.

Chỉ khai thác IP đối thủ trong host_port.txt. `flag.txt` là ví dụ định dạng,
không phải flag hợp lệ. Flag thật cần nộp khi Round 2 đang chạy. VM có `nc`.
''', mode=0o640, owner=user, group=group)

    specs = (
        ('chall1_curveball', 'Curveball', 'curveball', 101, 116),
        ('chall2_padding_oracle', 'Padding Oracle', 'padding_oracle', 117, 142),
        ('chall3_ecdsa_nonce', 'ECDSA Nonce', 'ecdsa_nonce', 143, 156),
    )
    source = data['files']['service.py']
    protocol = data['files']['protocol.py']
    for folder, title, service, first_line, last_line in specs:
        port = int(data['ports'][service])
        challenge = root / folder
        source_dir = challenge / 'src'
        directory(challenge, user, group, 0o750)
        directory(source_dir, user, group, 0o750)
        write(str(challenge / 'hosts.txt'), roster, mode=0o640, owner=user, group=group)
        write(str(challenge / 'port.txt'), f'{port}\n', mode=0o640, owner=user, group=group)
        challenge_host_port = '# team host port\n' + ''.join(
            f"{row['name']} {row['ip']} {port}\n" for row in opponents)
        write(str(challenge / 'host_port.txt'), challenge_host_port,
              mode=0o640, owner=user, group=group)
        readme = f'''Challenge: {title} · port {port}
{'=' * (len(title) + 12)}

Source: src/service.py (dòng {first_line}-{last_line}){'; helper liên quan: src/protocol.py' if service in ('curveball', 'ecdsa_nonce') else ''}.
Host/port đối thủ: host_port.txt. Flag mẫu: flag.txt.

Kết nối máy đầu tiên trong danh sách hoặc chọn IP cụ thể:

  ./connect.sh
  ./connect.sh {opponents[0]['ip']}

Gửi thử hai yêu cầu JSON:

  printf '%s\\n' '{{"op":"info"}}' '{{"op":"targets"}}' | nc -w 3 {opponents[0]['ip']} {port}

Mỗi dòng là một JSON request. `info` liệt kê operation; `targets` trả record
ID cần dùng.

Tự viết lời giải trong exploit.py. Ghi chú vào notes.txt, kết quả thăm dò vào
results.txt và flag thật đã lấy được vào captured_flags.txt. Không nộp flag mẫu.
Nộp flag đã lưu: `python3 ../submit_flag.py --file captured_flags.txt`.
'''
        write(str(challenge / 'README.txt'), readme, mode=0o640, owner=user, group=group)
        connect = '''#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
PORT="$(cat "$HERE/port.txt")"
HOST="${1:-$(awk 'NR == 1 { print $2; exit }' "$HERE/hosts.txt")}"
if ! awk -v host="$HOST" '$2 == host { found=1 } END { exit !found }' "$HERE/hosts.txt"; then
  echo "Choose an opponent IP from $HERE/hosts.txt" >&2
  exit 2
fi
exec nc "$HOST" "$PORT"
'''
        write(str(challenge / 'connect.sh'), connect, mode=0o750, owner=user, group=group)
        starter = f'''#!/usr/bin/env python3
"""Starter client for {title}. Add your exploit logic below."""
import argparse
import json
from pathlib import Path
import socket

ROOT = Path(__file__).resolve().parent
PORT = int((ROOT / 'port.txt').read_text().strip())
HOSTS = [line.split()[1] for line in (ROOT / 'hosts.txt').read_text().splitlines() if line.strip()]


def call(host, request):
    payload = json.dumps(request, separators=(',', ':')).encode() + b'\\n'
    with socket.create_connection((host, PORT), timeout=5) as conn:
        conn.settimeout(5)
        conn.sendall(payload)
        conn.shutdown(socket.SHUT_WR)
        response = bytearray()
        while not response.endswith(b'\\n'):
            chunk = conn.recv(16384)
            if not chunk:
                break
            response.extend(chunk)
    return json.loads(response)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default=HOSTS[0] if HOSTS else None,
                        help='opponent IP from hosts.txt')
    args = parser.parse_args()
    if not args.host:
        parser.error('hosts.txt has no opponent IP')
    for request in ({{'op': 'info'}}, {{'op': 'targets'}}):
        print(json.dumps(call(args.host, request), indent=2))
    # TODO: implement the {service} exploit using the returned record ID.


if __name__ == '__main__':
    main()
'''
        write_if_missing(str(challenge / 'exploit.py'), starter, 0o750, user, group)
        notes_heading = '=' * (len(title) + 6)
        write_if_missing(str(challenge / 'notes.txt'), f'{title} notes\n{notes_heading}\n\n',
                         0o600, user, group)
        write_if_missing(str(challenge / 'results.txt'), '', 0o600, user, group)
        sample = '# MẪU ĐỊNH DẠNG — không phải flag thật, không nộp dòng bên dưới\n'
        sample += 'MekoDataCTF{' + ('0' * 32) + '}\n'
        write(str(challenge / 'flag.txt'), sample, mode=0o640, owner=user, group=group)
        captured = challenge / 'captured_flags.txt'
        write_if_missing(str(captured), '', 0o600, user, group)
        legacy = challenge / 'flags.txt'
        if legacy.exists():
            old_lines = [line for line in legacy.read_text().splitlines() if line.strip()]
            current_lines = captured.read_text().splitlines()
            merged = list(current_lines)
            merged.extend(line for line in old_lines if line not in merged)
            if merged:
                write(str(captured), '\n'.join(merged) + '\n', mode=0o600,
                      owner=user, group=group)
            legacy.unlink()
        submit_help = '''NỘP FLAG

Đặt mỗi flag thật đã khai thác được trên một dòng trong captured_flags.txt.
Từ thư mục challenge chạy:

  python3 ../submit_flag.py --file captured_flags.txt

Nhập email/mật khẩu đội trưởng khi được hỏi. Thành viên có thể dùng
`python3 ../submit_flag.py --team-token` để nhập token ẩn.
Script gửi flag qua website bằng phiên đăng nhập của đội; không lưu mật khẩu
hoặc token vào file. Cũng có thể đăng nhập trên scoreboard rồi dán flag.

flag.txt chỉ là ví dụ định dạng, không được tính điểm. Flag Crypto chỉ được
chấm khi Round 2 đang chạy.
'''
        write(str(challenge / 'submit.txt'), submit_help, mode=0o640, owner=user, group=group)
        write(str(source_dir / 'service.py'), challenge_source(source, service),
              mode=0o444, owner=user, group=group)
        helper = source_dir / 'protocol.py'
        if service in ('curveball', 'ecdsa_nonce'):
            write(str(helper), protocol, mode=0o444, owner=user, group=group)
        elif helper.exists():
            helper.unlink()
        old_hint = source_dir / 'hint.md'
        if old_hint.exists():
            old_hint.unlink()


def install(data):
    if data['role'] == 'workspace':
        install_workspace(data)
        print(json.dumps({'ok': True, 'path': str(Path(pwd.getpwnam(data['player_user']).pw_dir) / 'crypto-lab')}))
        return
    # Reuse installed libraries; do not upgrade the web VM's Python runtime.
    check = subprocess.run(['/usr/bin/python3', '-c',
        "import ecdsa; import importlib.util; assert importlib.util.find_spec('Crypto') or importlib.util.find_spec('Cryptodome')"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if check.returncode:
        command('apt-get', 'update', '-qq')
        command('apt-get', 'install', '-y', '-qq', '--no-upgrade', '--no-install-recommends',
                'python3-ecdsa', 'python3-pycryptodome')
    if data['role'] == 'checker':
        for name, source in data['files'].items():
            write('/opt/crypto-checker/' + name, source)
        Path('/etc/crypto-checker').mkdir(mode=0o700, exist_ok=True)
        write('/etc/crypto-checker/config.json', json.dumps(data['config']), mode=0o600)
        print(json.dumps({'ok': True, 'role': 'checker'}))
        return
    user = data['player_user']
    account = pwd.getpwnam(user)  # Reuse the existing defender login; no password changes.
    import grp
    group = grp.getgrgid(account.pw_gid).gr_name
    config_path = Path('/etc/meko-crypto/service.json')
    config = json.loads(config_path.read_text()) if config_path.exists() else {
        'team': data['team'], 'data_dir': '/var/lib/meko-crypto',
        'admin_token': secrets.token_hex(32), 'patched': '0'}
    if config['team'] != data['team']:
        raise ValueError('Existing crypto installation belongs to another team')
    write(str(config_path), json.dumps(config), mode=0o640, group=group)
    directory = Path(config['data_dir'])
    directory.mkdir(mode=0o750, exist_ok=True)
    os.chown(directory, account.pw_uid, account.pw_gid)
    source_dir = Path('/opt/meko-crypto')
    source_dir.mkdir(mode=0o775, exist_ok=True)
    os.chown(source_dir, 0, account.pw_gid)
    for name, source in data['files'].items():
        write(str(source_dir / name), source, mode=0o664, group=group)
    unit = f'''[Unit]
Description=MekoDataCTF Round 2 crypto %i
After=network-online.target
Wants=network-online.target
[Service]
User={user}
Group={group}
WorkingDirectory=/opt/meko-crypto
ExecStart=/usr/bin/python3 /opt/meko-crypto/service.py --service %i --config /etc/meko-crypto/service.json --host {data['ip']}
Restart=on-failure
RestartSec=2
UMask=0007
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/var/lib/meko-crypto
[Install]
WantedBy=multi-user.target
'''
    write('/etc/systemd/system/meko-crypto@.service', unit)
    tasks = ('curveball', 'padding_oracle', 'ecdsa_nonce')
    sudoers = '\n'.join(f'{user} ALL=(root) NOPASSWD: /usr/bin/systemctl restart meko-crypto@{task}.service' for task in tasks) + '\n'
    write('/etc/sudoers.d/meko-crypto', sudoers, mode=0o440)
    command('visudo', '-cf', '/etc/sudoers.d/meko-crypto')
    command('systemctl', 'daemon-reload')
    for task in tasks:
        command('systemctl', 'enable', '--now', f'meko-crypto@{task}.service')
        command('systemctl', 'restart', f'meko-crypto@{task}.service')
    if data.get('workspace'):
        install_workspace(data['workspace'])
    print(json.dumps({'ok': True, 'token': config['admin_token']}))


if __name__ == '__main__':
    install(PAYLOAD)
