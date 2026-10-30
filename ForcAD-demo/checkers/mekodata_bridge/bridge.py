#!/usr/bin/env python3
"""Use only the fresh checker result requested for this particular tick."""
import json
import re
import sys
import time
from pathlib import Path

MAPPING = {f'10.80.0.{i + 10}': f'team0{i}' for i in range(1, 5)}
ROOT = Path('/checkers/mekodata_bridge')


def main():
    if len(sys.argv) != 4 or sys.argv[1] != 'check' or sys.argv[2] not in MAPPING:
        print('Unsupported action or team', file=sys.stderr)
        return 110
    try:
        tick = int(sys.argv[3])
        request = json.loads((ROOT / 'request.json').read_text(encoding='utf-8'))
        request_id = request['request_id']
        requested_at = float(request['requested_at'])
        if (not isinstance(request_id, str) or not re.fullmatch('[0-9a-f]{32}', request_id)
                or int(request['tick']) != tick or not 0 <= time.time() - requested_at <= 30):
            raise ValueError('No current request for tick')
        response = ROOT / 'responses' / (request_id + '.json')
        deadline = time.monotonic() + 22
        while not response.exists() and time.monotonic() < deadline:
            time.sleep(0.2)
        data = json.loads(response.read_text(encoding='utf-8'))
        if data['request_id'] != request_id or int(data['tick']) != tick or float(data['requested_at']) != requested_at:
            raise ValueError('Response does not match tick')
        rows = [item for item in data['results'] if item['name'] == MAPPING[sys.argv[2]]]
        if len(rows) != 1 or rows[0]['status'] not in ('UP', 'DOWN'):
            raise ValueError('Invalid or missing team status')
        cycle = int(data['cycle_id'])
        if cycle < 1:
            raise ValueError('Invalid checker cycle')
        print(f"cycle={cycle};status={rows[0]['status']}")
        return 101 if rows[0]['status'] == 'UP' else 104
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print('Checker data unavailable: ' + str(exc), file=sys.stderr)
        return 110


if __name__ == '__main__':
    sys.exit(main())
