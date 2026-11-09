"""Use the shared checker RPC spool with the active lab's private IP range."""
import importlib.util
import ipaddress
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('crypto_rpc', ROOT.parent / 'round1' / 'common.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
transport.ROOT = ROOT / 'rpc'


def main(task):
    try:
        action, ip = sys.argv[1:3]
        address = ipaddress.IPv4Address(ip)
        if action not in ('check', 'put', 'get') or not address.is_private:
            raise ValueError('Invalid action/team')
        payload = {'task': task, 'action': action, 'ip': str(address)}
        if action in ('put', 'get'):
            if len(sys.argv) != 6:
                raise ValueError('Invalid checker arguments')
            payload.update(key=sys.argv[3], locator=sys.argv[3], flag=sys.argv[4])
        result = transport.rpc(payload)
        print(result.get('public', ''))
        print(result.get('private', ''), file=sys.stderr)
        return result['status']
    except (OSError, ValueError, IndexError, KeyError, TypeError):
        print('Checker transport failed')
        return 110
