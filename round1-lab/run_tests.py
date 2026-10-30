"""Run HTTP/lifecycle integration in temporary Docker/PostgreSQL/Redis resources."""
from pathlib import Path
import re
import subprocess
import sys
import uuid

root = Path(__file__).resolve().parent
demo = root.parent / 'ForcAD-demo'
identity = uuid.uuid4().hex[:10]
database = 'forcad_round1_test_' + identity
redis_name = 'forcad-round1-test-' + identity
assert re.fullmatch('forcad_round1_test_[0-9a-f]{10}', database)
network = subprocess.check_output(['docker','inspect','forcad-demo-ticker-1','--format','{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{end}}'],text=True).strip()
created = False
try:
    subprocess.run(['docker','exec','forcad-demo-postgres-1','createdb','-U','forcad',database],check=True)
    created = True
    subprocess.run(['docker','run','-d','--name',redis_name,'--network',network,'redis:6.2.5-alpine','redis-server','--requirepass','round1-isolated-test'],check=True,stdout=subprocess.DEVNULL)
    command=['docker','run','--rm','--network',network,
             '--env-file',str(demo/'docker_config'/'postgres_environment.env'),
             '--env-file',str(demo/'docker_config'/'redis_environment.env'),
             '-e','POSTGRES_DB='+database,'-e','REDIS_HOST='+redis_name,'-e','REDIS_PASSWORD=round1-isolated-test',
             '-e','PYTHONPATH=/app:/lab','-v',str(root)+':/lab:ro','-v',str(demo/'backend')+':/app:ro','-w','/lab',
             '--entrypoint','python','forcad-demo-ticker','-m','unittest','-v','test_round1']
    result=subprocess.run(command)
finally:
    subprocess.run(['docker','rm','-f',redis_name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if created:
        subprocess.run(['docker','exec','forcad-demo-postgres-1','dropdb','-U','forcad',database],check=True)
sys.exit(result.returncode)
