"""Expose the local website inside the lab using a reconnecting SSH reverse tunnel."""
import argparse
import ipaddress
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ssh-config', type=Path, required=True)
    parser.add_argument('--checker-ip', default='10.90.0.30')
    args = parser.parse_args()
    address = str(ipaddress.IPv4Address(args.checker_ip))
    config = args.ssh_config.resolve(strict=True)
    unit = f'''[Unit]
Description=MekoDataCTF website inside the training LAN
After=network-online.target
[Service]
User=nobody
ExecStart=/usr/bin/socat TCP-LISTEN:3000,bind={address},reuseaddr,fork TCP:127.0.0.1:13000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
'''
    script = "from pathlib import Path\nimport subprocess\nassert Path('/usr/bin/socat').exists(), 'Install socat first'\n"
    script += "Path('/etc/systemd/system/mekodata-web-proxy.service').write_text(" + repr(unit) + ")\n"
    script += "subprocess.run(['systemctl','daemon-reload'],check=True)\nsubprocess.run(['systemctl','enable','--now','mekodata-web-proxy'],check=True)\n"
    subprocess.run(['ssh','-F',str(config),'-o','BatchMode=yes','checker','sudo -n python3 -'],
                   input=script,text=True,check=True)
    units = Path.home()/'.config/systemd/user'
    units.mkdir(parents=True,exist_ok=True)
    (units/'mekodata-range-tunnel.service').write_text(f'''[Unit]
Description=Reverse SSH for MekoDataCTF lab website
After=network-online.target mekodata-website.service
[Service]
ExecStart=/usr/bin/ssh -F {config} -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -R 127.0.0.1:13000:127.0.0.1:3000 checker
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
''')
    subprocess.run(['systemctl','--user','daemon-reload'],check=True)
    subprocess.run(['systemctl','--user','enable','--now','mekodata-range-tunnel'],check=True)
    print(f'Lab website URL: http://{address}:3000/scoreboard')


if __name__ == '__main__':
    main()
