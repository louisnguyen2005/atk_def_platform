"""Load labs/<lab>/lab.json so scripts never hard-code teams, IPs or the SSH config path."""
import json
import os
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
LABS = WORKSPACE / 'labs'


def load(lab=None):
    """Read a lab by name or directory; defaults to $MEKO_LAB, then 'round1'."""
    directory = Path(lab) if lab and Path(lab).is_dir() else LABS / (lab or os.environ.get('MEKO_LAB', 'round1'))
    config = json.loads((directory / 'lab.json').read_text(encoding='utf-8'))
    if config.get('shared_with'):
        if config['shared_with'] == config['name']:
            raise ValueError('A lab cannot share its own deployment')
        web = load(config['shared_with'])
        config.update(teams=web['teams'], ssh_config=web['ssh_config'], checker_host=web['checker_host'])
    config['dir'] = directory
    # Quy ước: tên máy ảo = tên đội (= tên đội ForcAD); chỉ khai "host" khi lab cũ đặt tên khác (vd. attacker1).
    for team in config['teams']:
        team.setdefault('host', team['name'])
    # Relative to the workspace root; $MEKO_SSH_CONFIG overrides for another machine.
    # Dấu / vì ssh của Git làm mất dấu \ khi truyền đường dẫn cho ProxyJump.
    config['ssh_config'] = (WORKSPACE / os.environ.get('MEKO_SSH_CONFIG', config['ssh_config'])).as_posix()
    return config


def ssh(config, host, remote):
    """Fixed, non-interactive SSH argv through the lab's management config."""
    return ['ssh', '-F', config['ssh_config'], '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, remote]
