"""Small persistent A/D controller and HTTP API for the three educational crypto tasks."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from protocol import Client, SERVICES

TASKS = tuple(SERVICES)
MAX_BODY = 65536
DASHBOARD_FILES = {'dashboard.css': 'text/css; charset=utf-8', 'dashboard.js': 'text/javascript; charset=utf-8',
                   'arena.js': 'text/javascript; charset=utf-8', 'space-bg.webp': 'image/webp',
                   'ship-saucer.png': 'image/png', 'ship-raptor.png': 'image/png', 'ship-manta.png': 'image/png',
                   'crown.png': 'image/png', 'arena3d.js': 'text/javascript; charset=utf-8'}
NESTED_TYPES = {'.js': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json'}
def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class Lab:
    def __init__(self, config_path):
        self.path = Path(config_path)
        self.config = json.loads(self.path.read_text(encoding='utf-8'))
        self.public_host = self.config.get('public_host', '127.0.0.1')
        self.db_path = Path(self.config['database'])
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.changed = threading.Condition(self.lock)
        with self.database() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT NOT NULL, host TEXT NOT NULL, ports TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS scores (team_id TEXT PRIMARY KEY, attack INTEGER NOT NULL DEFAULT 0,
                    defense INTEGER NOT NULL DEFAULT 0, sla INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS flags (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, task TEXT NOT NULL,
                    tick INTEGER NOT NULL, value TEXT NOT NULL, record TEXT NOT NULL, placed INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(team_id, task, tick));
                CREATE TABLE IF NOT EXISTS checks (tick INTEGER NOT NULL, team_id TEXT NOT NULL, task TEXT NOT NULL,
                    status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', checked_at TEXT NOT NULL,
                    PRIMARY KEY(tick,team_id,task));
                CREATE TABLE IF NOT EXISTS captures (id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER NOT NULL,
                    attacker_id TEXT NOT NULL, victim_id TEXT NOT NULL, task TEXT NOT NULL, flag_id TEXT NOT NULL,
                    captured_at TEXT NOT NULL, UNIQUE(attacker_id,flag_id));
                CREATE TABLE IF NOT EXISTS sla_awards (tick INTEGER NOT NULL, team_id TEXT NOT NULL,
                    PRIMARY KEY(tick,team_id));
                CREATE TABLE IF NOT EXISTS defense_awards (id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER NOT NULL,
                    team_id TEXT NOT NULL, task TEXT NOT NULL, awarded_at TEXT NOT NULL, UNIQUE(tick,team_id,task));
            ''')
            for team in self.config['teams']:
                db.execute('''INSERT OR IGNORE INTO teams(id,name,token,host,ports) VALUES(?,?,?,?,?)''',
                           (team['id'], team['name'], team['token'], team['host'], json.dumps(team['ports'])))
                db.execute('INSERT OR IGNORE INTO scores(team_id) VALUES(?)', (team['id'],))
            defaults = {'phase': 'ready', 'tick': '0', 'sequence': '0', 'deadline': '0', 'ticks': str(self.config.get('ticks', 15)),
                        'tick_seconds': str(self.config.get('tick_seconds', 120)),
                        'flag_ttl': str(self.config.get('flag_ttl', 2)), 'run_id': secrets.token_hex(4)}
            for key, value in defaults.items():
                db.execute('INSERT OR IGNORE INTO settings VALUES(?,?)', (key, str(value)))
        self._recover_after_restart()
        self.stop = threading.Event()
        self.worker = threading.Thread(target=self._run, daemon=True, name='crypto-round-manager')
        self.worker.start()

    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA foreign_keys=ON')
        return db

    @contextmanager
    def database(self):
        db = self.connect()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def read_setting(self, db, key, default=''):
        row = db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return row['value'] if row else default

    def write_setting(self, db, key, value):
        db.execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                   (key, str(value)))

    def _recover_after_restart(self):
        with self.database() as db:
            phase = self.read_setting(db, 'phase', 'ready')
            if phase == 'running':
                left = max(0, float(self.read_setting(db, 'deadline', 0)) - time.time())
                self.write_setting(db, 'resume_phase', 'running')
                self.write_setting(db, 'remaining', left)
                self.write_setting(db, 'phase', 'paused')
            elif phase in ('preparing', 'checking'):
                self.write_setting(db, 'resume_phase', phase)
                self.write_setting(db, 'phase', 'paused')

    def admin_ok(self, value):
        return isinstance(value, str) and hmac.compare_digest(value, self.config['admin_token'])

    def _teams(self, db):
        return [dict(row) | {'ports': json.loads(row['ports'])} for row in db.execute('SELECT * FROM teams ORDER BY id')]

    def _live_flags(self, db, tick):
        return db.execute('SELECT * FROM flags WHERE tick>=? ORDER BY tick DESC', (tick - int(self.read_setting(db, 'flag_ttl', 2)),)).fetchall()

    def state(self, private=False):
        with self.database() as db:
            phase, tick = self.read_setting(db, 'phase', 'ready'), int(self.read_setting(db, 'tick', '0'))
            sequence = int(self.read_setting(db, 'sequence', '0'))
            deadline = float(self.read_setting(db, 'deadline', '0'))
            teams = self._teams(db)
            scores = {r['team_id']: dict(r) for r in db.execute('SELECT * FROM scores')}
            score_rows = [{'team_id': t['id'], 'name': t['name'], **{k: scores[t['id']][k] for k in ('attack', 'defense', 'sla')},
                           'total': sum(scores[t['id']][k] for k in ('attack', 'defense', 'sla'))} for t in teams]
            visible = []
            for row in self._live_flags(db, sequence):
                visible.append({'id': row['id'], 'team_id': row['team_id'], 'task': row['task'], 'tick': row['tick'],
                                'placed': bool(row['placed'])})
            services = []
            for row in db.execute('''SELECT c.*,t.name FROM checks c JOIN teams t ON t.id=c.team_id
                    WHERE c.tick=? ORDER BY t.id,c.task''', (sequence,)):
                services.append({'team_id': row['team_id'], 'team': row['name'], 'service': row['task'],
                                 'status': row['status'], 'detail': row['detail'] if private else ''})
            captures = [dict(r) | {'attacker': next(t['name'] for t in teams if t['id'] == r['attacker_id']),
                                   'victim': next(t['name'] for t in teams if t['id'] == r['victim_id'])}
                        for r in db.execute('SELECT * FROM captures ORDER BY id DESC LIMIT 40')]
            names = {t['id']: t['name'] for t in teams}
            defenses = [dict(r) | {'team': names.get(r['team_id'], r['team_id'])}
                        for r in db.execute('SELECT * FROM defense_awards ORDER BY id DESC LIMIT 60')]
            result = {'ok': True, 'now': time.time(), 'game': {'mode': 'crypto-ad', 'phase': phase, 'tick': tick,
                      'ticks_per_round': int(self.read_setting(db, 'ticks', 15)), 'tick_seconds': int(self.read_setting(db, 'tick_seconds', 120)),
                      'deadline': deadline if phase == 'running' else None, 'running': phase == 'running'},
                      'scores': sorted(score_rows, key=lambda x: (-x['total'], x['name'].casefold())),
                      'services': services, 'targets': visible, 'captures': captures, 'defenses': defenses,
                      'teams': [{'id': t['id'], 'name': t['name'], 'host': t['host'], 'ports': t['ports']} for t in teams],
                      'challenges': [{'id': name, 'title': title, 'port': SERVICES[name], 'cve': cve, 'status': 'ready'}
                                     for name, title, cve in [('curveball','Curveball','CVE-2020-0601'),
                                     ('padding_oracle','Padding Oracle','CVE-2016-2107'),('ecdsa_nonce','ECDSA Nonce','CWE-323')]]}
            if private:
                result['admin'] = {'tokenConfigured': bool(self.config.get('admin_token')), 'public_host': self.public_host}
            if self.config.get('demo') and not private:
                result['demoTeamTokens'] = {t['id']: t['token'] for t in teams}
            return result

    def _request(self, team, task, payload):
        port = team['ports'][task]
        with Client(team['host'], port, timeout=7) as client:
            return client.call(**payload)

    def _new_flag(self, team, task, tick):
        record, value = secrets.token_hex(12), 'MekoDataCTF{' + secrets.token_hex(16) + '}'
        return {'id': secrets.token_hex(12), 'team_id': team['id'], 'task': task, 'tick': tick, 'value': value, 'record': record}

    def _prepare_tick(self, sequence):
        with self.database() as db:
            teams = self._teams(db)
            for team in teams:
                for task in TASKS:
                    db.execute('INSERT OR IGNORE INTO checks VALUES(?,?,?,?,?,?)',
                               (sequence, team['id'], task, 'PENDING', '', utc_now()))
                    if not db.execute('SELECT 1 FROM flags WHERE team_id=? AND task=? AND tick=?',
                                      (team['id'], task, sequence)).fetchone():
                        f = self._new_flag(team, task, sequence)
                        db.execute('INSERT INTO flags VALUES(?,?,?,?,?,?,0)',
                                   (f['id'], f['team_id'], f['task'], f['tick'], f['value'], f['record']))
            todo = db.execute('SELECT * FROM flags WHERE tick=? AND placed=0 ORDER BY team_id,task',
                              (sequence,)).fetchall()
            by_id = {team['id']: team for team in teams}
        for flag in todo:
            team = by_id[flag['team_id']]
            try:
                auth = {'token': self.config['checker_tokens'][team['id']], 'record': flag['record']}
                placed = self._request(team, flag['task'], {'op': 'put', **auth,
                                      'flag': flag['value'], 'tick': sequence})
                stored = self._request(team, flag['task'], {'op': 'get', **auth})
                if not placed.get('ok') or stored.get('flag') != flag['value']:
                    raise RuntimeError('flag persistence check failed')
                self._functional_check(team, flag['task'], flag['record'])
                info = self._request(team, flag['task'], {'op': 'info'})
                status, detail = ('PATCHED', 'reference patch enabled') if info.get('patched') else ('UP', '')
                with self.database() as db:
                    db.execute('UPDATE flags SET placed=1 WHERE id=?', (flag['id'],))
                    db.execute('UPDATE checks SET status=?,detail=?,checked_at=? WHERE tick=? AND team_id=? AND task=?',
                               (status, detail, utc_now(), sequence, team['id'], flag['task']))
            except Exception as exc:
                print(f"checker {team['id']}/{flag['task']} tick={sequence}: {exc}", file=sys.stderr, flush=True)
                with self.database() as db:
                    db.execute("UPDATE checks SET status='CHECK_FAILED',detail='retrying service check',checked_at=? WHERE tick=? AND team_id=? AND task=?",
                               (utc_now(), sequence, team['id'], flag['task']))

    def _functional_check(self, team, task, record):
        info = self._request(team, task, {'op': 'info'})
        if not info.get('ok'):
            raise RuntimeError('service info failed')
        if task == 'curveball':
            ca = self._request(team, task, {'op': 'ca'})
            sample = self._request(team, task, {'op': 'sample', 'record': record})
            denied = self._request(team, task, {'op': 'read', 'G': ca['G'], 'role': 'guest', 'record': record,
                                  'signature': sample['signature']})
            if not ca.get('ok') or not sample.get('ok') or denied.get('error') != 'forbidden':
                raise RuntimeError('signature verification failed')
        elif task == 'padding_oracle':
            encrypted = self._request(team, task, {'op': 'encrypt', 'record': 'checker', 'message': 'availability'})
            decrypted = self._request(team, task, {'op': 'decrypt', 'record': 'checker', **encrypted})
            if not encrypted.get('ciphertext') or not decrypted.get('ok'):
                raise RuntimeError('authenticated decrypt failed')
        else:
            key = self._request(team, task, {'op': 'pubkey'})
            first = self._request(team, task, {'op': 'sign', 'message': 'checker:one'})
            second = self._request(team, task, {'op': 'sign', 'message': 'checker:two'})
            from protocol import unpack_point, verify
            public = unpack_point(key['Q'])
            if not verify(first['message'], first['signature'], public) or not verify(second['message'], second['signature'], public):
                raise RuntimeError('signature verification failed')
        return info

    def _check_tick(self, sequence, tick):
        with self.database() as db:
            teams = self._teams(db)
        for team in teams:
            statuses = []
            for task in TASKS:
                try:
                    targets = self._request(team, task, {'op': 'targets'})
                    row = next((r for r in targets.get('targets', []) if r.get('tick') == sequence), None)
                    if not row:
                        status, detail = 'DOWN', 'no flag record for this tick'
                    else:
                        with self.database() as db:
                            expected = db.execute('SELECT value FROM flags WHERE team_id=? AND task=? AND tick=? AND placed=1',
                                                  (team['id'], task, sequence)).fetchone()
                        stored = self._request(team, task, {'op': 'get', 'token': self.config['checker_tokens'][team['id']], 'record': row['record']})
                        if not expected or stored.get('flag') != expected['value']:
                            status, detail = 'DOWN', 'checker could not verify the placed flag'
                        else:
                            info = self._functional_check(team, task, row['record'])
                            status, detail = ('PATCHED', 'reference patch enabled') if info.get('patched') else ('UP', '')
                except (OSError, TimeoutError):
                    status, detail = 'DOWN', 'service unreachable'
                except (ValueError, RuntimeError, KeyError):
                    status, detail = 'DOWN', 'cryptographic check failed'
                statuses.append(status)
                with self.database() as db:
                    db.execute('INSERT OR REPLACE INTO checks VALUES(?,?,?,?,?,?)', (sequence, team['id'], task, status, detail, utc_now()))
                    # Defense +1: the service stayed healthy and nobody captured this round's flag.
                    flag = db.execute('SELECT id FROM flags WHERE team_id=? AND task=? AND tick=? AND placed=1',
                                      (team['id'], task, sequence)).fetchone()
                    if status in ('UP', 'PATCHED') and flag and not db.execute(
                            'SELECT 1 FROM captures WHERE flag_id=?', (flag['id'],)).fetchone():
                        awarded = db.execute('INSERT OR IGNORE INTO defense_awards(tick,team_id,task,awarded_at) VALUES(?,?,?,?)',
                                             (sequence, team['id'], task, utc_now()))
                        if awarded.rowcount:
                            db.execute('UPDATE scores SET defense=defense+1 WHERE team_id=?', (team['id'],))
            if all(s in ('UP', 'PATCHED') for s in statuses):
                with self.database() as db:
                    inserted = db.execute('INSERT OR IGNORE INTO sla_awards VALUES(?,?)', (sequence, team['id']))
                    if inserted.rowcount:
                        db.execute('UPDATE scores SET sla=sla+1 WHERE team_id=?', (team['id'],))
        with self.database() as db:
            phase = 'finished' if tick >= int(self.read_setting(db, 'ticks', 15)) else 'preparing'
            self.write_setting(db, 'phase', phase)
            self.write_setting(db, 'deadline', 0)
            if phase == 'preparing':
                self.write_setting(db, 'tick', tick + 1)
                sequence += 1
                self.write_setting(db, 'sequence', sequence)
                self.write_setting(db, 'next_prepare_retry', 0)

    def _run(self):
        while not self.stop.wait(0.5):
            with self.lock:
                try:
                    with self.database() as db:
                        phase = self.read_setting(db, 'phase', 'ready')
                        tick = int(self.read_setting(db, 'tick', '0'))
                        sequence = int(self.read_setting(db, 'sequence', '0'))
                        deadline = float(self.read_setting(db, 'deadline', '0'))
                        retry_at = float(self.read_setting(db, 'next_prepare_retry', '0'))
                    now = time.time()
                    if phase == 'preparing' or (phase == 'running' and now < deadline and now >= retry_at):
                        self._prepare_tick(sequence)
                        with self.database() as db:
                            if phase == 'preparing':
                                self.write_setting(db, 'phase', 'running')
                                self.write_setting(db, 'deadline', time.time() + int(self.read_setting(db, 'tick_seconds', 120)))
                            self.write_setting(db, 'next_prepare_retry', time.time() + 10)
                    elif phase == 'running' and now >= deadline:
                        with self.database() as db:
                            self.write_setting(db, 'phase', 'checking')
                        self._check_tick(sequence, tick)
                    elif phase == 'checking':
                        self._check_tick(sequence, tick)
                except Exception as exc:
                    print(f'round worker error: {exc}', file=sys.stderr, flush=True)
                    with self.database() as db:
                        if self.read_setting(db, 'phase') == 'checking':
                            self.write_setting(db, 'resume_phase', 'checking')
                        else:
                            self.write_setting(db, 'resume_phase', 'preparing')
                        self.write_setting(db, 'phase', 'paused')
                self.changed.notify_all()

    def action(self, action):
        with self.lock, self.database() as db:
            phase = self.read_setting(db, 'phase', 'ready')
            if action == 'start' and phase in ('ready', 'paused', 'finished'):
                if phase in ('ready', 'finished'):
                    if phase == 'finished':
                        db.execute('UPDATE scores SET attack=0,defense=0,sla=0')
                        db.execute('DELETE FROM flags')
                        db.execute('DELETE FROM checks')
                        db.execute('DELETE FROM captures')
                        db.execute('DELETE FROM defense_awards')
                    if phase == 'finished':
                        self.write_setting(db, 'run_id', secrets.token_hex(4))
                    self.write_setting(db, 'tick', 1)
                    sequence = int(self.read_setting(db, 'sequence', 0)) + 1
                    self.write_setting(db, 'sequence', sequence)
                    self.write_setting(db, 'phase', 'preparing')
                else:
                    resume = self.read_setting(db, 'resume_phase', 'running')
                    if resume == 'preparing':
                        self.write_setting(db, 'phase', 'preparing')
                    elif resume == 'checking':
                        self.write_setting(db, 'phase', 'checking')
                    else:
                        remaining = float(self.read_setting(db, 'remaining', 0))
                        self.write_setting(db, 'deadline', time.time() + max(remaining, 15))
                        self.write_setting(db, 'phase', 'running')
                return {'ok': True, 'phase': self.read_setting(db, 'phase')}
            if action == 'pause' and phase == 'running':
                self.write_setting(db, 'remaining', max(0, float(self.read_setting(db, 'deadline', 0)) - time.time()))
                self.write_setting(db, 'resume_phase', 'running')
                self.write_setting(db, 'phase', 'paused')
                return {'ok': True, 'phase': 'paused'}
            if action == 'retry' and phase == 'paused':
                self.write_setting(db, 'phase', self.read_setting(db, 'resume_phase', 'preparing'))
                return {'ok': True, 'phase': self.read_setting(db, 'phase')}
            if action == 'reset' and phase in ('ready', 'finished', 'paused'):
                db.execute('UPDATE scores SET attack=0,defense=0,sla=0')
                db.execute('DELETE FROM flags')
                db.execute('DELETE FROM checks')
                db.execute('DELETE FROM captures')
                db.execute('DELETE FROM sla_awards')
                db.execute('DELETE FROM defense_awards')
                self.write_setting(db, 'phase', 'ready')
                self.write_setting(db, 'tick', 0)
                self.write_setting(db, 'next_prepare_retry', 0)
                self.write_setting(db, 'deadline', 0)
                self.write_setting(db, 'run_id', secrets.token_hex(4))
                return {'ok': True, 'phase': 'ready'}
            return {'ok': False, 'error': 'action_not_allowed_in_current_phase', 'phase': phase}

    def submit(self, token, flags):
        if not isinstance(token, str) or not isinstance(flags, list) or not (1 <= len(flags) <= 50):
            return {'ok': False, 'error': 'invalid_request'}
        with self.lock, self.database() as db:
            team = db.execute('SELECT * FROM teams WHERE token=?', (token,)).fetchone()
            phase, tick = self.read_setting(db, 'phase', 'ready'), int(self.read_setting(db, 'tick', 0))
            sequence = int(self.read_setting(db, 'sequence', 0))
            if not team:
                return {'ok': False, 'error': 'invalid_team_token'}
            accepted, rejected = [], 0
            for value in flags:
                if not isinstance(value, str) or len(value) != 45 or not value.startswith('MekoDataCTF{') or not value.endswith('}'):
                    rejected += 1
                    continue
                record = db.execute('SELECT * FROM flags WHERE value=? AND placed=1', (value,)).fetchone()
                if not record or record['team_id'] == team['id'] or sequence - record['tick'] > int(self.read_setting(db, 'flag_ttl', 2)) or phase not in ('running', 'paused', 'checking'):
                    rejected += 1
                    continue
                try:
                    db.execute('INSERT INTO captures(tick,attacker_id,victim_id,task,flag_id,captured_at) VALUES(?,?,?,?,?,?)',
                               (sequence, team['id'], record['team_id'], record['task'], record['id'], utc_now()))
                except sqlite3.IntegrityError:
                    rejected += 1
                    continue
                db.execute('UPDATE scores SET attack=attack+1 WHERE team_id=?', (team['id'],))
                db.execute('UPDATE scores SET defense=defense-1 WHERE team_id=?', (record['team_id'],))
                accepted.append({'task': record['task'], 'victim': record['team_id']})
            return {'ok': True, 'accepted': accepted, 'rejected': rejected}


def make_handler(lab):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'MekoCryptoRange/1.0'

        def log_message(self, fmt, *args):
            sys.stderr.write('%s [%s] %s\n' % (self.address_string(), utc_now(), fmt % args))

        def send(self, status, payload):
            raw = json.dumps(payload, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw)

        def body(self):
            length = int(self.headers.get('Content-Length', '0'))
            if length > MAX_BODY:
                raise ValueError('body too large')
            raw = self.rfile.read(length)
            return json.loads(raw) if raw else {}

        def nested_asset(self, path):
            """Serve /crypto/assets/{vendor,arena3d}/** (3D arena modules) and /crypto/assets/models/* (optional .glb ships)."""
            for prefix, folder in (('/crypto/assets/vendor/', 'vendor'), ('/crypto/assets/models/', 'assets/models'),
                                   ('/crypto/assets/arena3d/', 'arena3d')):
                if not path.startswith(prefix):
                    continue
                base = (Path(__file__).resolve().parent / 'dashboard' / folder).resolve()
                target = (base / path[len(prefix):]).resolve()
                kind = NESTED_TYPES.get(target.suffix.lower())
                if kind and target.is_file() and target.is_relative_to(base):
                    return target, kind
            return None

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/' or path == '/index.html':
                raw = (Path(__file__).resolve().parent / 'dashboard' / 'index.html').read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(raw)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(raw)
                return
            nested = self.nested_asset(path)
            if nested:
                raw = nested[0].read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', nested[1])
                self.send_header('Content-Length', str(len(raw)))
                self.send_header('Cache-Control', 'public, max-age=86400' if '/vendor/' in path else 'no-store')
                self.end_headers()
                self.wfile.write(raw)
                return
            filename = path.rsplit('/', 1)[-1]
            if path in ('/' + filename, '/crypto/assets/' + filename) and filename in DASHBOARD_FILES:
                folder = Path(__file__).resolve().parent / 'dashboard'
                raw = (folder / filename if filename.endswith(('.js', '.css')) else folder / 'assets' / filename).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', DASHBOARD_FILES[filename])
                self.send_header('Content-Length', str(len(raw)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(raw)
                return
            if path == '/healthz':
                return self.send(200, {'ok': True, 'service': 'crypto-ad-scoreboard'})
            if path in ('/api/state', '/api/health'):
                return self.send(200, lab.state())
            if path == '/api/admin/state':
                if not lab.admin_ok(self.headers.get('Authorization', '').removeprefix('Bearer ')):
                    return self.send(401, {'ok': False, 'error': 'unauthorized'})
                return self.send(200, lab.state(private=True))
            return self.send(404, {'ok': False, 'error': 'not_found'})

        def do_POST(self):
            path = urlsplit(self.path).path
            try:
                data = self.body()
            except (ValueError, UnicodeError, json.JSONDecodeError):
                return self.send(400, {'ok': False, 'error': 'invalid_request'})
            if path == '/api/submit':
                token = self.headers.get('X-Team-Token', '')
                return self.send(200, lab.submit(token, data.get('flags')))
            if path == '/api/admin/action':
                if not lab.admin_ok(self.headers.get('Authorization', '').removeprefix('Bearer ')):
                    return self.send(401, {'ok': False, 'error': 'unauthorized'})
                return self.send(200, lab.action(data.get('action')))
            if path == '/api/admin/team-sync':
                if not lab.admin_ok(self.headers.get('Authorization', '').removeprefix('Bearer ')):
                    return self.send(401, {'ok': False, 'error': 'unauthorized'})
                rows = data.get('teams')
                if not isinstance(rows, list) or not (2 <= len(rows) <= 16):
                    return self.send(400, {'ok': False, 'error': 'team_count_must_be_2_to_16'})
                try:
                    with lab.database() as db:
                        for item in rows:
                            if item['id'] not in (x['id'] for x in lab._teams(db)) or len(item['name']) > 80 or len(item['token']) < 16:
                                raise ValueError('invalid team')
                            db.execute('UPDATE teams SET name=?,token=? WHERE id=?', (item['name'],item['token'],item['id']))
                    return self.send(200, {'ok': True, 'synced': len(rows)})
                except (ValueError, KeyError, TypeError):
                    return self.send(400, {'ok': False, 'error': 'invalid_team'})
            return self.send(404, {'ok': False, 'error': 'not_found'})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='crypto-lab/.secrets/controller.json')
    args = parser.parse_args()
    lab = Lab(args.config)
    server = ThreadingHTTPServer((lab.config.get('bind_host', '0.0.0.0'), int(lab.config.get('http_port', 8088))), make_handler(lab))
    server.daemon_threads = True
    print(f"Crypto A/D scoreboard: http://{lab.public_host}:{lab.config.get('http_port', 8088)}/", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        lab.stop.set()
        server.server_close()


if __name__ == '__main__':
    main()
