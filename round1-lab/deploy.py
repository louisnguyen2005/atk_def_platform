"""Install the isolated lab and checker agent using the existing management SSH."""
import argparse
import base64
import json
from pathlib import Path
import secrets
import subprocess

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent


def install(host, payload, config, checker=False, reset_storage=False):
    # Fixed Python installer, data transported over stdin, never shell interpolated.
    package = base64.b64encode(json.dumps({'files': payload, 'config': config, 'checker': checker,
                                           'reset_storage': reset_storage}).encode()).decode()
    script = '''import base64,json,os,pathlib,pwd,subprocess
p=json.loads(base64.b64decode(PACKAGE))
base=pathlib.Path('/opt/round1'); base.mkdir(parents=True,exist_ok=True)
etc=pathlib.Path('/etc/round1'); etc.mkdir(parents=True,exist_ok=True)
for name,content in p['files'].items():
    compile(content,name,'exec')
    destination=base/name; destination.write_text(content); destination.chmod(0o644)
if p['checker']:
    destination=etc/'agent.json'; destination.write_text(json.dumps(p['config'])); destination.chmod(0o600)
else:
    user=pwd.getpwnam('attacker-http')
    destination=etc/'web.json'; destination.write_text(json.dumps(p['config'])); destination.chmod(0o640); os.chown(destination,0,user.pw_gid)
    node=p['config']['node']
    directory=pathlib.Path(p['config']['data_dir'])
    if p['reset_storage']:
        if str(directory) != '/var/lib/round1-web' or directory.is_symlink(): raise SystemExit('Refusing unexpected lab data directory')
        subprocess.run(['systemctl','stop','attacker-http@'+node],check=True)
        if directory.exists():
            import shutil
            shutil.rmtree(directory)
    directory.mkdir(parents=True,exist_ok=True); os.chown(directory,user.pw_uid,user.pw_gid); directory.chmod(0o700)
    dropin=pathlib.Path('/etc/systemd/system/attacker-http@'+node+'.service.d'); dropin.mkdir(parents=True,exist_ok=True)
    (dropin/'round1.conf').write_text('[Service]\\nExecStart=\\nExecStart=/usr/bin/python3 /opt/round1/webservice.py --config /etc/round1/web.json --host 0.0.0.0 --port 80\\nWorkingDirectory=/opt/round1\\nReadWritePaths=/var/lib/round1-web\\n')
    try:
        defender=pwd.getpwnam('user-access')
    except KeyError:
        defender=None
    if defender:
        os.chown(base,defender.pw_uid,defender.pw_gid)
        os.chown(base/'webservice.py',defender.pw_uid,defender.pw_gid)
        rule=pathlib.Path('/etc/sudoers.d/round1-service')
        rule.write_text('user-access ALL=(root) NOPASSWD: /usr/bin/systemctl restart attacker-http@'+node+'\\n')
        rule.chmod(0o440)
        subprocess.run(['visudo','-cf',str(rule)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','restart','attacker-http@'+node],check=True)
    subprocess.run(['systemctl','is-active','attacker-http@'+node],check=True,stdout=subprocess.DEVNULL)
    print('Installed round1 agent' if p['checker'] else ('Reset and installed round1 service ' if p['reset_storage'] else 'Installed round1 service ')+p['config']['node'])
'''.replace('PACKAGE', repr(package))
    subprocess.run(['ssh', '-F', 'pool101-management-config', '-o', 'BatchMode=yes',
                    '-o', 'ConnectTimeout=8', host, 'sudo -n /usr/bin/python3 -'],
                   input=script, text=True, check=True, timeout=35, cwd=WORKSPACE)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        print('Use --apply to install webservices on attacker1–4 and the agent on checker; no flags are generated.')
        return
    directory = ROOT / '.secrets'
    directory.mkdir(exist_ok=True)
    secret_file = directory / 'teams.json'
    if secret_file.exists():
        tokens = json.loads(secret_file.read_text())
    else:
        tokens = {f'10.80.0.{i}': secrets.token_hex(32) for i in range(11, 15)}
        secret_file.write_text(json.dumps(tokens))
    teams = {}
    for i in range(1, 5):
        ip = f'10.80.0.{10+i}'
        config = {'node': f'attacker{i}', 'data_dir': '/var/lib/round1-web',
                  'admin_token': tokens[ip], 'patched': {'idor': False, 'sqli': False, 'upload': False}}
        install(f'attacker{i}', {'webservice.py': (ROOT / 'webservice.py').read_text()}, config)
        teams[ip] = {'url': 'http://' + ip, 'token': tokens[ip]}
    install('checker', {'agent.py': (ROOT / 'agent.py').read_text()}, {'teams': teams}, checker=True)


if __name__ == '__main__':
    main()
