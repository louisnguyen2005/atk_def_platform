"""Create the match secrets once on the checker VM and print them as JSON.

Running this again returns the same values, so re-provisioning a live sandbox
never invalidates a team token or an organizer key. Only root can read the file.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys

TARGET = Path('/etc/crypto-lab/tokens.json')


def build(teams):
    return {
        'admin': secrets.token_urlsafe(24),
        'checker_tokens': {team: secrets.token_urlsafe(24) for team in teams},
        'team_tokens': {team: secrets.token_urlsafe(24) for team in teams},
        'ssh_passwords': {team: secrets.token_urlsafe(12) for team in teams},
    }


def merge(existing, teams):
    """Keep every secret already issued; mint only what a newly added team needs."""
    data = {'admin': existing.get('admin') or secrets.token_urlsafe(24)}
    for group, length in (('checker_tokens', 24), ('team_tokens', 24), ('ssh_passwords', 12)):
        current = existing.get(group) if isinstance(existing.get(group), dict) else {}
        data[group] = {team: current.get(team) or secrets.token_urlsafe(length) for team in teams}
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--teams', required=True, help='comma-separated team IDs, e.g. team1,team2,team3')
    args = parser.parse_args()
    teams = [name.strip() for name in args.teams.split(',') if name.strip()]
    if not teams or len(teams) != len(set(teams)):
        raise SystemExit('--teams needs a non-empty list of unique team IDs')

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    try:
        existing = json.loads(TARGET.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        existing = {}
    data = merge(existing, teams) if existing else build(teams)

    if data != existing:
        # O_NOFOLLOW: never write through a symlink planted in /etc/crypto-lab.
        descriptor = os.open(TARGET, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2, sort_keys=True)
        os.chown(TARGET, 0, 0)
        os.chmod(TARGET, 0o600)
    json.dump(data, sys.stdout, separators=(',', ':'), sort_keys=True)


if __name__ == '__main__':
    main()
