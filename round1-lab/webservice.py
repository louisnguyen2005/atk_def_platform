"""Round-one training webservice. Deliberate vulnerabilities stay in lab data."""
import argparse
import base64
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import secrets
import sqlite3
import stat
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
import zipfile


def make_server(host, port, config):
    root = Path(config['data_dir']).resolve()
    for name in ('uploads', 'flags'):
        (root / name).mkdir(parents=True, exist_ok=True)
    db = root / 'sqli.sqlite3'
    for task in ('idor', 'sqli', 'upload'):
        with sqlite3.connect(root / (task + '.sqlite3')) as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, task TEXT, owner TEXT, flag TEXT, request_key TEXT UNIQUE)')
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, name TEXT, description TEXT)')
        conn.execute("INSERT OR IGNORE INTO catalog VALUES ('1','Welcome','Training catalog')")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log flags, owner tokens or query strings.

        def reply(self, code, value):
            body = json.dumps(value).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            supplied = self.headers.get('X-Lab-Admin', '')
            return bool(supplied) and hmac.compare_digest(supplied, config['admin_token'])

        def do_GET(self):
            url = urlsplit(self.path)
            route = unquote(url.path)
            patched = config.get('patched', {})
            try:
                if route == '/health':
                    return self.reply(200, {'status': 'ok', 'node': config['node'], 'lab': 'round1'})
                if route == '/':
                    return self.reply(200, {'lab': 'Round 1', 'node': config['node'], 'routes': ['/api/scores/<id>', '/api/search?q=Welcome', '/api/upload', '/uploads/<name>']})
                if route == '/api/search':
                    query = parse_qs(url.query).get('q', [''])[0][:1024]
                    with sqlite3.connect(db) as conn:
                        if patched.get('sqli'):
                            rows = conn.execute('SELECT id,name,description FROM catalog WHERE name LIKE ?', ('%' + query + '%',)).fetchall()
                        else:
                            # Deliberate SQL injection for this training service only.
                            rows = conn.execute("SELECT id,name,description FROM catalog WHERE name LIKE '%" + query + "%'").fetchall()
                    return self.reply(200, {'results': rows})
                if route.startswith('/uploads/'):
                    requested = root / 'uploads' / route.removeprefix('/uploads/')
                    resolved = requested.resolve()
                    allowed = root / 'uploads' if patched.get('upload') else root
                    if not resolved.is_relative_to(allowed) or (patched.get('upload') and requested.is_symlink()):
                        return self.reply(403, {'error': 'file access denied'})
                    return self.reply(200, {'content': resolved.read_text()})
                prefixes = {'/api/scores/': 'idor', '/api/notes/': 'sqli', '/api/vault/': 'upload'}
                for prefix, task in prefixes.items():
                    if route.startswith(prefix):
                        record_id = route[len(prefix):]
                        with sqlite3.connect(root / (task + '.sqlite3')) as conn:
                            row = conn.execute('SELECT owner,flag FROM records WHERE id=? AND task=?', (record_id, task)).fetchone()
                        if not row:
                            return self.reply(404, {'error': 'not found'})
                        owner = self.headers.get('X-Owner-Token', '')
                        if (task != 'idor' or patched.get('idor')) and not hmac.compare_digest(owner, row[0]):
                            return self.reply(403, {'error': 'owner required'})
                        # IDOR: missing ownership check while intentionally unpatched.
                        value = (root / 'flags' / (record_id + '.txt')).read_text() if task == 'upload' else row[1]
                        return self.reply(200, {'id': record_id, 'value': value})
                self.reply(404, {'error': 'unknown route'})
            except (ValueError, OSError, sqlite3.Error):
                self.reply(400, {'error': 'request failed'})

        def do_POST(self):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 262144:
                    return self.reply(413, {'error': 'body size'})
                body = json.loads(self.rfile.read(length))
                route = urlsplit(self.path).path
                if route == '/internal/put':
                    if not self.authorized():
                        return self.reply(403, {'error': 'admin required'})
                    task, key, flag = body['task'], body['key'], body['flag']
                    if task not in ('idor', 'sqli', 'upload') or not isinstance(key, str) or len(key) > 128 or not isinstance(flag, str) or len(flag) != 32:
                        raise ValueError('invalid flag')
                    # Idempotent PUT: retries of one flag reuse the same ID and owner.
                    digest = hmac.new(config['admin_token'].encode(), (task + ':' + key).encode(), hashlib.sha256).hexdigest()
                    record_id = str(1000 + int(digest[:15], 16))
                    owner = digest[16:]
                    with sqlite3.connect(root / (task + '.sqlite3')) as conn:
                        conn.execute('INSERT OR IGNORE INTO records VALUES (?,?,?,?,?)', (record_id, task, owner, flag if task != 'upload' else '', task + ':' + key))
                        row = conn.execute('SELECT id,owner FROM records WHERE request_key=?', (task + ':' + key,)).fetchone()
                    if task == 'upload':
                        destination = root / 'flags' / (row[0] + '.txt')
                        if not destination.exists():
                            destination.write_text(flag)
                    return self.reply(200, {'id': row[0], 'owner': row[1], 'path': 'flags/' + row[0] + '.txt'})
                if route == '/api/upload':
                    # ZIP symlink handling is intentionally unsafe unless patched.
                    raw = base64.b64decode(body['archive'], validate=True)
                    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                        if len(archive.infolist()) > 8 or sum(i.file_size for i in archive.infolist()) > 65536:
                            raise ValueError('archive too large')
                        names = []
                        for item in archive.infolist():
                            if item.is_dir():
                                continue
                            target = root / 'uploads' / item.filename
                            if not target.resolve().is_relative_to(root / 'uploads') or '/' in item.filename or '\\' in item.filename:
                                raise ValueError('invalid filename')
                            contents = archive.read(item)
                            if stat.S_ISLNK(item.external_attr >> 16):
                                if config.get('patched', {}).get('upload'):
                                    return self.reply(403, {'error': 'symlinks forbidden'})
                                link = contents.decode()
                                if not (target.parent / link).resolve().is_relative_to(root):
                                    raise ValueError('link outside lab')
                                if target.exists() or target.is_symlink():
                                    target.unlink()
                                target.symlink_to(link)
                            else:
                                if target.is_symlink():
                                    target.unlink()
                                target.write_bytes(contents)
                            names.append('/uploads/' + item.filename)
                    return self.reply(200, {'files': names})
                self.reply(404, {'error': 'unknown route'})
            except (KeyError, TypeError, ValueError, OSError, sqlite3.Error, zipfile.BadZipFile):
                self.reply(400, {'error': 'invalid request'})

    return ThreadingHTTPServer((host, port), Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=80)
    args = parser.parse_args()
    with make_server(args.host, args.port, json.loads(Path(args.config).read_text())) as server:
        server.serve_forever()
