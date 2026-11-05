"""Organizer-side exploit walkthrough for the three isolated training services."""
import argparse
import getpass
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from protocol import Client, G, N, certificate_message, sign, unpack_point


def latest_record(client):
    rows = client.call(op='targets').get('targets', [])
    if not rows:
        raise RuntimeError('No active target yet. Start the match and retry.')
    return max(rows, key=lambda row: int(row['tick']))['record']


def curveball(host, port):
    with Client(host, port, timeout=10) as client:
        record = latest_record(client)
        ca = client.call(op='ca')
        chosen_generator = unpack_point(ca['Q'])
        signature = sign(certificate_message(record, 'admin'), 1, generator=chosen_generator)
        result = client.call(op='read', record=record, role='admin', G=ca['Q'], signature=signature)
    if not result.get('ok'):
        raise RuntimeError('Curveball exploit failed: ' + str(result.get('error')))
    return result['flag']


def padding_oracle(host, port):
    with Client(host, port, timeout=15) as client:
        record = latest_record(client)
        encrypted = client.call(op='ciphertext', record=record)
        raw = bytes.fromhex(encrypted['ciphertext'])
        blocks = [raw[index:index + 16] for index in range(0, len(raw), 16)]
        plaintext = bytearray()

        for block_index in range(1, len(blocks)):
            current = blocks[block_index]
            intermediate = [0] * 16
            for padding in range(1, 17):
                position = 16 - padding
                recovered = None
                for guess in range(256):
                    probe = bytearray(16)
                    for index in range(position + 1, 16):
                        probe[index] = intermediate[index] ^ padding
                    probe[position] = guess
                    response = client.call(op='decrypt', record=record,
                                           ciphertext=(bytes(probe) + current).hex())
                    valid = response.get('ok') or response.get('error') == 'content'

                    # Discard the accidental match to an existing padding suffix.
                    if valid and padding == 1:
                        probe[14] ^= 1
                        check = client.call(op='decrypt', record=record,
                                            ciphertext=(bytes(probe) + current).hex())
                        valid = check.get('ok') or check.get('error') == 'content'
                    if valid:
                        recovered = guess ^ padding
                        break

                if recovered is None:
                    raise RuntimeError('Padding oracle stopped distinguishing padding from content.')
                intermediate[position] = recovered

            previous = blocks[block_index - 1]
            plaintext.extend(intermediate[index] ^ previous[index] for index in range(16))

    padding = plaintext[-1]
    if not 1 <= padding <= 16 or plaintext[-padding:] != bytes([padding]) * padding:
        raise RuntimeError('Recovered CBC padding is malformed.')
    flag = bytes(plaintext[:-padding]).decode('utf-8')
    if not (flag.startswith('MekoDataCTF{') and flag.endswith('}')):
        raise RuntimeError('Recovered plaintext does not look like a flag.')
    return flag


def ecdsa_nonce(host, port):
    with Client(host, port, timeout=10) as client:
        record = latest_record(client)
        public = unpack_point(client.call(op='pubkey')['Q'])
        first = client.call(op='sign', message='training-message-01')
        second = client.call(op='sign', message='training-message-02')
        r1, s1 = (int(first['signature'][name], 16) for name in ('r', 's'))
        r2, s2 = (int(second['signature'][name], 16) for name in ('r', 's'))
        if r1 != r2:
            raise RuntimeError('ECDSA signatures have different r values; the nonce is not reused.')

        z1 = int.from_bytes(hashlib.sha256(first['message'].encode()).digest(), 'big')
        z2 = int.from_bytes(hashlib.sha256(second['message'].encode()).digest(), 'big')
        nonce = ((z1 - z2) * pow((s1 - s2) % N, -1, N)) % N
        private = ((s1 * nonce - z1) * pow(r1, -1, N)) % N
        if G * private != public:
            raise RuntimeError('Recovered private key did not match the advertised public key.')
        opened = client.call(op='unlock', record=record,
                             signature=sign('unlock:' + record, private))
    if not opened.get('ok'):
        raise RuntimeError('ECDSA unlock failed: ' + str(opened.get('error')))
    return opened['flag']


ATTACKS = {
    'curveball': ('curveball_port', curveball),
    'padding_oracle': ('padding_port', padding_oracle),
    'ecdsa_nonce': ('ecdsa_port', ecdsa_nonce),
}


def submit_flags(url, token, flags):
    body = json.dumps({'flags': flags}).encode()
    request = Request(url.rstrip('/') + '/api/submit', data=body, method='POST',
                      headers={'Content-Type': 'application/json', 'X-Team-Token': token})
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def match_phase(url):
    with urlopen(url.rstrip('/') + '/api/state', timeout=10) as response:
        return json.load(response)['game']['phase']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True, help='IP address of the opposing team VM')
    parser.add_argument('--challenge', choices=['all', *ATTACKS], default='all')
    parser.add_argument('--curveball-port', type=int, default=9011)
    parser.add_argument('--padding-port', type=int, default=9012)
    parser.add_argument('--ecdsa-port', type=int, default=9013)
    parser.add_argument('--submit', action='store_true', help='submit recovered flags to the scoreboard')
    parser.add_argument('--scoreboard', default='http://10.81.0.30:8088')
    args = parser.parse_args()

    if args.submit:
        phase = match_phase(args.scoreboard)
        if phase not in ('running', 'paused', 'checking'):
            raise SystemExit(f'Match is {phase}. Start/resume it in Organizer before attacking and submitting flags.')

    selected = ATTACKS.items() if args.challenge == 'all' else [(args.challenge, ATTACKS[args.challenge])]
    flags = []
    for name, (port_option, attack) in selected:
        flag = attack(args.host, getattr(args, port_option))
        flags.append(flag)
        print(f'{name}: recovered {flag}')

    if args.submit:
        token = getpass.getpass('Attacking team token (input hidden): ').strip()
        result = submit_flags(args.scoreboard, token, flags)
        print(f"Scoreboard accepted {len(result.get('accepted', []))}, rejected {result.get('rejected', 0)}.")


if __name__ == '__main__':
    main()
