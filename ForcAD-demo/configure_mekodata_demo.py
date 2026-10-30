"""Register the four sandbox teams and health-only task in the local demo."""
import http.cookiejar
import json
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener
import yaml

ROOT = Path(__file__).resolve().parent
config = yaml.safe_load((ROOT / 'config.yml').read_text(encoding='utf-8'))
client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
base = 'http://127.0.0.1:18080/api/admin/'


def call(path, method='GET', value=None):
    data = None if value is None else json.dumps(value).encode()
    request = Request(base + path, data=data, method=method,
                      headers={'Content-Type': 'application/json'})
    with client.open(request, timeout=10) as response:
        return json.load(response)


call('login/', 'POST', config['admin'])
teams = call('teams/')
tasks = call('tasks/')
for team in teams:
    if team['name'] in ('Team 1', 'Team 2 (highlighted)') and team['active']:
        team['active'] = False
        call(f"teams/{team['id']}/", 'PUT', team)
for task in tasks:
    if task['name'] in ('test_basic_service', 'test_gevent_service_1') and task['active']:
        task['active'] = False
        call(f"tasks/{task['id']}/", 'PUT', task)
for i in range(1, 5):
    name = f'team0{i}'
    if not any(t['name'] == name and t['active'] for t in teams):
        call('teams/', 'POST', dict(name=name, ip=f'10.80.0.{10+i}', highlighted=False, active=True))
if not any(t['name'] == 'Sandbox HTTP health' and t['active'] for t in tasks):
    call('tasks/', 'POST', dict(name='Sandbox HTTP health',
         checker='/checkers/mekodata_bridge/bridge.py', gets=0, puts=0,
         places=1, checker_timeout=5, checker_type='hackerdom', env_path='',
         default_score=2500, get_period=0, active=True))
print('Registered four teams and health-only task; no flags or scoring rules changed.')
