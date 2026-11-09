"""Install per-user services for the existing local website and SSH collector."""
import argparse
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ssh-config', type=Path, required=True)
    parser.add_argument('--web-lab', default='meko_boutique', choices=('round1','meko_boutique'))
    args = parser.parse_args()
    config = args.ssh_config.resolve(strict=True)
    units = Path.home() / '.config/systemd/user'
    units.mkdir(parents=True, exist_ok=True)
    node = shutil.which('node')
    if not node:
        raise SystemExit('Install Node.js before running this script')
    for name, working, executable, env in (
        ('mekodata-website', ROOT/'MekoDataCTF_Website', f'{node} app.js', ''),
        ('mekodata-collector', ROOT,
         f'/usr/bin/python3 {ROOT}/ForcAD-demo/collect_checker.py --labs {args.web_lab},crypto_ad',
         f'Environment="MEKO_LAB={args.web_lab}"\nEnvironment="MEKO_SSH_CONFIG={config}"\n'),
    ):
        (units/(name+'.service')).write_text(f'''[Unit]
Description={name}
After=network-online.target
[Service]
WorkingDirectory={working}
{env}ExecStart={executable}
Restart=on-failure
RestartSec=5
[Install]
WantedBy=default.target
''')
    subprocess.run(['systemctl','--user','daemon-reload'], check=True)
    subprocess.run(['systemctl','--user','enable','--now','mekodata-website','mekodata-collector'], check=True)
    print('Website and collector services enabled for this user.')


if __name__ == '__main__':
    main()
