"""Root-owned service launcher used by the restricted systemd template."""
import json
import os
from pathlib import Path
import sys

SERVICES = {'curveball': 9011, 'padding_oracle': 9012, 'ecdsa_nonce': 9013}
TEAM_HOSTS = {'team1': '10.81.0.11', 'team2': '10.81.0.12'}
instance = sys.argv[1] if len(sys.argv) == 2 else ''
team, sep, service = instance.partition('-')
if not sep or team not in ('team1', 'team2') or service not in SERVICES:
    raise SystemExit('unknown crypto service')
config = json.loads(Path(f'/etc/crypto-lab/{team}/config.json').read_text())
os.chdir(f'/opt/crypto-lab/{team}')
os.execv('/usr/bin/python3', ['/usr/bin/python3', 'service.py', '--service', service,
                              '--config', f'/etc/crypto-lab/{team}/config.json',
                              '--host', TEAM_HOSTS[team], '--port', str(SERVICES[service])])
