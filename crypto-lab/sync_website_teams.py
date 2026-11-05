"""Map the first two MekoDataCTF Website teams to the two crypto VM identities."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / 'MekoDataCTF_Website'
SECRETS = ROOT / 'crypto-lab' / '.secrets'


def env_value(path, name, default=''):
    if not path.exists():
        return default
    for line in path.read_text(encoding='utf-8').splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() == name:
            return value.strip().strip('"\'')
    return default


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', help='Website SQLite path; defaults to data/mekodata.db')
    parser.add_argument('--controller', help='Controller URL; defaults to Website .env CRYPTO_API_URL')
    args = parser.parse_args()
    env = WEBSITE / '.env'
    database = Path(args.database or env_value(env, 'DB_FILE', str(WEBSITE / 'data' / 'mekodata.db')))
    url = (args.controller or env_value(env, 'CRYPTO_API_URL', 'http://127.0.0.1:8088')).rstrip('/')
    admin_path = SECRETS / 'admin.token'
    if not database.exists() or not admin_path.exists():
        raise SystemExit('Website database or crypto-lab/.secrets/admin.token is missing.')
    with sqlite3.connect(database) as db:
        rows = db.execute("SELECT id,name,token FROM teams WHERE token IS NOT NULL AND token != '' ORDER BY id").fetchall()
    if len(rows) != 2:
        raise SystemExit(f'Need exactly two registered Website teams to map; found {len(rows)}.')
    mapping = [{'id': f'team{i}', 'name': row[1], 'token': row[2]} for i, row in enumerate(rows, 1)]
    request = urllib.request.Request(url + '/api/admin/team-sync',
        data=json.dumps({'teams': mapping}).encode(), method='POST',
        headers={'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + admin_path.read_text(encoding='utf-8').strip()})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.load(response)
    except Exception as exc:
        raise SystemExit('Unable to reach the crypto scoreboard. Check its URL and team-network route.') from exc
    if not result.get('ok'):
        raise SystemExit('The crypto controller refused the team mapping.')
    print(f"Synced two Website team tokens to {url}. Tokens were not printed.")


if __name__ == '__main__':
    main()
