"""ForcAD check/put/get agent. Installed only on the trusted checker VM."""
import argparse
import hashlib
import json
from pathlib import Path
import secrets
import socket
import sys

from protocol import Client, SERVICES, G, unpack_point, verify, certificate_message

UP, CORRUPT, MUMBLE, DOWN, CHECK_FAILED = 101, 102, 103, 104, 110


def functional(client, task):
    info = client.call(op='info')
    if not info.get('ok') or info.get('service') != task:
        raise ValueError('wrong service')
    nonce = secrets.token_hex(12)
    if task == 'curveball':
        ca = client.call(op='ca')
        sample = client.call(op='sample', record=nonce)
        public = unpack_point(ca['Q'])
        if not verify(certificate_message(nonce, 'guest'), sample['signature'], public, G):
            raise ValueError('invalid guest certificate')
        denied = client.call(op='read', G=ca['G'], role='guest', record=nonce,
                             signature=sample['signature'])
        if denied.get('error') != 'forbidden':
            raise ValueError('guest access broken')
    elif task == 'padding_oracle':
        encrypted = client.call(op='encrypt', record=nonce, message=nonce)
        result = client.call(op='decrypt', record=nonce, ciphertext=encrypted['ciphertext'],
                             tag=encrypted.get('tag', ''))
        if not result.get('ok'):
            raise ValueError('valid document rejected')
        invalid = client.call(op='decrypt', record=nonce, ciphertext='00', tag='')
        if invalid.get('ok'):
            raise ValueError('invalid ciphertext accepted')
    else:
        public = unpack_point(client.call(op='pubkey')['Q'])
        for suffix in ('one', 'two'):
            message = nonce + suffix
            signature = client.call(op='sign', message=message)['signature']
            if not verify(message, signature, public):
                raise ValueError('invalid signature')


def run(payload, config):
    task, action, ip = (payload.get(k) for k in ('task', 'action', 'ip'))
    if task not in SERVICES or action not in ('check', 'put', 'get') or ip not in config['teams']:
        return {'status': CHECK_FAILED, 'public': 'Invalid checker request', 'private': ''}
    team = config['teams'][ip]
    port = team.get('ports', SERVICES)[task]
    try:
        with Client(team.get('host', ip), port, timeout=config.get('timeout', 4)) as client:
            if action == 'check':
                functional(client, task)
                return {'status': UP, 'public': 'Crypto service UP', 'private': ''}
            if action == 'put':
                # Same seed always produces the same record: PUT retries are idempotent.
                record = hashlib.sha256(payload['key'].encode()).hexdigest()[:24]
                seed = json.loads(payload['key']) if payload['key'].startswith('{') else {}
                result = client.call(op='put', token=team['token'], record=record,
                                     flag=payload['flag'], tick=int(seed.get('tick', 0)))
                if not result.get('ok'):
                    raise ValueError('flag placement rejected')
                locator = json.dumps({'record': record}, separators=(',', ':'))
            else:
                record = json.loads(payload['locator'])['record']
                locator = ''
            result = client.call(op='get', token=team['token'], record=record)
            if result.get('flag') != payload['flag']:
                return {'status': CORRUPT, 'public': 'Stored flag unavailable', 'private': ''}
            return {'status': UP, 'public': json.dumps({'record': record}) if action == 'put' else 'Flag intact',
                    'private': locator}
    except (ConnectionError, TimeoutError, socket.timeout, OSError):
        return {'status': DOWN, 'public': 'Crypto service unreachable', 'private': ''}
    except (ValueError, KeyError, TypeError, AssertionError):
        return {'status': MUMBLE, 'public': 'Invalid crypto response', 'private': ''}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        config = json.loads(Path(args.config).read_text())
        payload = json.loads(sys.stdin.buffer.read(65537))
        result = run(payload, config)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        result = {'status': CHECK_FAILED, 'public': 'Crypto checker configuration unavailable', 'private': ''}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
