"""Shared line-JSON client and strict P-256 helpers for the training lab."""
import hashlib
import json
import socket

from ecdsa import NIST256p, ellipticcurve, rfc6979

CURVE = NIST256p.curve
G = NIST256p.generator
N = NIST256p.order
SERVICES = {"curveball": 9011, "padding_oracle": 9012, "ecdsa_nonce": 9013}
MAX_LINE = 16384


def pack_point(point):
    return [format(point.x(), '064x'), format(point.y(), '064x')]


def unpack_point(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError('point')
    x, y = (int(v, 16) for v in value)
    if not (0 <= x < CURVE.p() and 0 <= y < CURVE.p()) or not CURVE.contains_point(x, y):
        raise ValueError('point')
    return ellipticcurve.Point(CURVE, x, y, N)


def digest(message):
    return hashlib.sha256(message.encode()).digest()


def sign(message, private, generator=G, nonce=None):
    raw = digest(message)
    k = nonce or rfc6979.generate_k(N, private, hashlib.sha256, raw)
    r = (generator * k).x() % N
    s = (pow(k, -1, N) * (int.from_bytes(raw, 'big') + r * private)) % N
    if not r or not s:
        raise ValueError('invalid nonce')
    return {"r": format(r, '064x'), "s": format(s, '064x')}


def verify(message, signature, public, generator=G):
    try:
        r, s = (int(signature[v], 16) for v in ('r', 's'))
        if not (0 < r < N and 0 < s < N):
            return False
        w = pow(s, -1, N)
        point = generator * (int.from_bytes(digest(message), 'big') * w % N) + public * (r * w % N)
        return point != ellipticcurve.INFINITY and point.x() % N == r
    except (ValueError, TypeError, KeyError, AssertionError):
        return False


def certificate_message(record, role):
    return json.dumps({"record": record, "role": role}, sort_keys=True, separators=(',', ':'))


class Client:
    def __init__(self, host, port, timeout=5):
        self.socket = socket.create_connection((host, int(port)), timeout)
        # Small request/response JSON lines should not wait for Nagle's delayed ACK timer.
        self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.file = self.socket.makefile('rwb')

    def call(self, **request):
        self.file.write(json.dumps(request, separators=(',', ':')).encode() + b'\n')
        self.file.flush()
        line = self.file.readline(MAX_LINE + 1)
        if not line or len(line) > MAX_LINE or not line.endswith(b'\n'):
            raise ValueError('invalid line-JSON response')
        result = json.loads(line)
        if not isinstance(result, dict):
            raise ValueError('invalid response')
        return result

    def close(self):
        self.file.close()
        self.socket.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
