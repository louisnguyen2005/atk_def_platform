"""Root-owned service launcher used by the restricted systemd template.

The systemd instance name is "<team>-<service>", for example "team1-curveball".
Both the team identity and the address to bind come from the root-owned
/etc/crypto-lab/<team>/config.json, so adding a team never needs a code change.
"""
import json
import os
from pathlib import Path
import re
import sys

SERVICES = {'curveball': 9011, 'padding_oracle': 9012, 'ecdsa_nonce': 9013}

instance = sys.argv[1] if len(sys.argv) == 2 else ''
team, separator, service = instance.partition('-')
if not separator or service not in SERVICES or not re.fullmatch(r'team[0-9]{1,2}', team):
    raise SystemExit('usage: launcher.py <team>-<curveball|padding_oracle|ecdsa_nonce>')

config_path = Path('/etc/crypto-lab') / team / 'config.json'
config = json.loads(config_path.read_text(encoding='utf-8'))
if config.get('team') != team:
    raise SystemExit(f'{config_path} does not belong to {team}')

source = Path('/opt/crypto-lab') / team
os.chdir(source)
os.execv('/usr/bin/python3', ['/usr/bin/python3', 'service.py', '--service', service,
                              '--config', str(config_path),
                              '--host', config.get('bind_host', '0.0.0.0'),
                              '--port', str(SERVICES[service])])
