from datetime import datetime, timedelta
from pathlib import Path
import yaml

root = Path(__file__).resolve().parent
compose_path = root / 'docker-compose.yml'
compose = yaml.safe_load(compose_path.read_text(encoding='utf-8'))
compose['services']['nginx']['ports'] = ['127.0.0.1:18080:80']
for name in ('postgres', 'redis', 'rabbitmq'):
    compose['services'][name].pop('ports', None)
compose_path.write_text(yaml.safe_dump(compose, sort_keys=False), encoding='utf-8')
config_path = root / 'config.yml'
config = yaml.safe_load(config_path.read_text(encoding='utf-8'))
config['game']['timezone'] = 'Asia/Ho_Chi_Minh'
config['game']['start_time'] = (datetime.now() + timedelta(minutes=15)).replace(microsecond=0)
config['game']['round_time'] = 60
config_path.write_text(yaml.safe_dump(config, sort_keys=False), encoding='utf-8')
print('Local demo: 127.0.0.1:18080, sample teams and checkers; no real contest configured.')
