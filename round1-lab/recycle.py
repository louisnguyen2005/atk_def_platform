"""Archive-guarded recreation of the local CyberRange Round 1 lab."""
import argparse
import http.cookiejar
import getpass
import json
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import build_opener, HTTPCookieProcessor, Request

import deploy

ROOT = Path(__file__).resolve().parent
HOSTS = [f'attacker{i}' for i in range(1, 5)]
TEAM_IPS = [f'10.80.0.{i}' for i in range(11, 15)]


class AdminAPI:
    def __init__(self, base, username, password):
        self.base = base.rstrip('/')
        self.opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.request('/api/admin/login/', {'username': username, 'password': password}, origin=False)

    def request(self, path, data=None, origin=True):
        body = None if data is None else json.dumps(data).encode()
        headers = {'Accept': 'application/json'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        if origin:
            headers['Origin'] = self.base
        req = Request(self.base + path, data=body, headers=headers)
        try:
            with self.opener.open(req, timeout=15) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
        except HTTPError as exc:
            detail = exc.read(4096).decode(errors='replace')
            raise RuntimeError(f'Admin API HTTP {exc.code}: {detail}') from exc
        except URLError as exc:
            raise RuntimeError(f'Không kết nối được dashboard API: {exc.reason}') from exc
        if len(raw) > 8 * 1024 * 1024:
            raise RuntimeError('Phản hồi API vượt quá giới hạn an toàn.')
        return json.loads(raw) if raw else {}


def main():
    parser = argparse.ArgumentParser(description='Lưu nguyên hồ sơ rồi tái tạo Round 1 cho cuộc thi mới.')
    parser.add_argument('--archive-id', required=True, help='UUID hồ sơ do dashboard cung cấp')
    parser.add_argument('--api', default='http://127.0.0.1:18080', help='URL dashboard ForcAD đang chạy')
    args = parser.parse_args()
    if len(args.archive_id) != 36 or any(c not in '0123456789abcdef-' for c in args.archive_id.lower()):
        parser.error('--archive-id phải là UUID hợp lệ')

    username = input('ForcAD admin username: ').strip()
    password = getpass.getpass('ForcAD admin password: ')
    try:
        api = AdminAPI(args.api, username, password)
        state = api.request('/api/admin/round-control/', origin=False)
        round1 = state.get('round1') or {}
        if round1.get('phase') not in ('archived', 'recreating') or round1.get('archive_id') != args.archive_id:
            raise RuntimeError('Dashboard chưa đóng cuộc thi bằng đúng archive ID này, hoặc đã tái tạo xong.')
        archive = api.request('/api/admin/round1/archive/' + quote(args.archive_id, safe='') + '/', origin=False)
        if archive.get('id') != args.archive_id or not archive.get('snapshot', {}).get('tables'):
            raise RuntimeError('Không xác minh được bản snapshot lưu trong PostgreSQL.')

        secret_file = ROOT / '.secrets' / 'teams.json'
        if not secret_file.is_file():
            raise RuntimeError(f'Thiếu {secret_file}; không tự tạo token mới vì sẽ làm mất liên kết với checker.')
        tokens = json.loads(secret_file.read_text(encoding='utf-8'))
        if set(tokens) != set(TEAM_IPS) or any(not isinstance(tokens[ip], str) or not tokens[ip] for ip in TEAM_IPS):
            raise RuntimeError('File team secrets không có đủ token cho bốn IP; không thay đổi gì.')

        print('Đã xác minh hồ sơ lưu. Script sẽ đặt lại dữ liệu web trên 4 VM đội; PostgreSQL chỉ reset sau khi cả 4 VM qua health check.')
        if input('Gõ RECREATE để tiếp tục: ').strip() != 'RECREATE':
            print('Đã hủy; chưa thay đổi VM hay database.')
            return 2

        source = (ROOT / 'webservice.py').read_text(encoding='utf-8')
        for i, host in enumerate(HOSTS, start=1):
            ip = f'10.80.0.{10+i}'
            config = {'node': host, 'data_dir': '/var/lib/round1-web', 'admin_token': tokens[ip],
                      'patched': {'idor': False, 'sqli': False, 'upload': False}}
            deploy.install(host, {'webservice.py': source}, config, reset_storage=True)

        agent_config = {'teams': {ip: {'url': 'http://' + ip, 'token': tokens[ip]} for ip in TEAM_IPS}}
        deploy.install('checker', {'agent.py': (ROOT / 'agent.py').read_text(encoding='utf-8')}, agent_config, checker=True)
        for ip in TEAM_IPS:
            check = json.dumps({'ip': ip, 'task': 'health', 'action': 'check'})
            result = subprocess.run(['ssh', '-F', 'pool101-management-config', '-o', 'BatchMode=yes',
                                     '-o', 'ConnectTimeout=8', 'checker',
                                     'sudo -n /usr/bin/python3 /opt/round1/agent.py --config /etc/round1/agent.json'],
                                    input=check, text=True, capture_output=True, check=True, timeout=20,
                                    cwd=deploy.WORKSPACE)
            try:
                status = json.loads(result.stdout.strip().splitlines()[-1]).get('status')
            except (ValueError, IndexError):
                status = None
            if status != 101:
                raise RuntimeError(f'Health check từ checker tới {ip} chưa đạt; database vẫn giữ nguyên archive.')
            print(f'Health OK: {ip}')

        api.request('/api/admin/round1/recreate/', {
            'confirm': 'RECREATE ROUND1', 'archive_id': args.archive_id, 'verified_hosts': HOSTS,
        })
        print('Đã tái tạo xong: dữ liệu web đã về trạng thái lab ban đầu, tick/điểm/flag của ForcAD đã reset.')
        print('Giữ file archive JSON tải từ dashboard. Mở dashboard, bấm Chuẩn bị Round 1 rồi Bắt đầu khi sẵn sàng.')
        return 0
    except (RuntimeError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(f'LỖI: {exc}', file=sys.stderr)
        print('Hồ sơ và dữ liệu tính điểm cũ vẫn được giữ. Nếu đã dọn một phần VM, chạy lại cùng archive ID sau khi xử lý lỗi.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
