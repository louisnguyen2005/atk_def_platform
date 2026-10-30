"""HTTP and lifecycle integration tests, only in disposable PostgreSQL/Redis."""
import base64
from contextlib import ExitStack
from datetime import datetime, timezone
import io
import json
import logging
import os
from pathlib import Path
import stat
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
import zipfile

from webservice import make_server
from agent import execute


class ApplicationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = {'node': 'test', 'data_dir': self.directory.name, 'admin_token': 'private-admin', 'patched': {}}
        self.server = make_server('127.0.0.1', 0, self.config)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)
        self.agent = {'teams': {'10.80.0.11': {'url': self.base, 'token': 'private-admin'}}}

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.directory.cleanup()

    def call(self, path, value=None):
        req = Request(self.base+path, data=None if value is None else json.dumps(value).encode(), headers={'Content-Type': 'application/json'})
        with urlopen(req) as response:
            return json.load(response)

    def put(self, kind, key='tick1'):
        flag = kind[0].upper() + 'A'*30 + '='
        result = execute({'task':kind,'action':'put','ip':'10.80.0.11','key':key,'flag':flag}, self.agent)
        self.assertEqual(result['status'],101)
        return flag, json.loads(result['private'])

    def test_idor_and_patch(self):
        flag, position = self.put('idor')
        self.assertEqual(self.call('/api/scores/'+position['id'])['value'], flag)
        self.config['patched']['idor'] = True
        with self.assertRaises(HTTPError) as failure:
            self.call('/api/scores/'+position['id'])
        self.assertEqual(failure.exception.code,403)
        self.assertEqual(execute({'task':'idor','action':'get','ip':'10.80.0.11','locator':json.dumps(position),'flag':flag},self.agent)['status'],101)

    def test_sqli_and_patch(self):
        flag, position = self.put('sqli')
        query = "' UNION SELECT id,task,flag FROM records -- "
        self.assertIn(flag,json.dumps(self.call('/api/search?q='+quote(query))))
        self.config['patched']['sqli'] = True
        self.assertNotIn(flag,json.dumps(self.call('/api/search?q='+quote(query))))
        self.assertEqual(execute({'task':'sqli','action':'get','ip':'10.80.0.11','locator':json.dumps(position),'flag':flag},self.agent)['status'],101)

    def test_upload_symlink_and_patch(self):
        flag, position = self.put('upload')
        archive = io.BytesIO()
        with zipfile.ZipFile(archive,'w') as z:
            item = zipfile.ZipInfo('proof.txt'); item.create_system=3
            item.external_attr = (stat.S_IFLNK | 0o777)<<16
            z.writestr(item,'../'+position['path'])
        self.call('/api/upload',{'archive':base64.b64encode(archive.getvalue()).decode()})
        self.assertEqual(self.call('/uploads/proof.txt')['content'],flag)
        self.config['patched']['upload']=True
        with self.assertRaises(HTTPError):
            self.call('/uploads/proof.txt')
        with self.assertRaises(HTTPError):
            self.call('/api/upload',{'archive':base64.b64encode(archive.getvalue()).decode()})
        self.assertEqual(execute({'task':'upload','action':'check','ip':'10.80.0.11'},self.agent)['status'],101)
        self.assertEqual(execute({'task':'upload','action':'get','ip':'10.80.0.11','locator':json.dumps(position),'flag':flag},self.agent)['status'],101)

    def test_admin_put_auth_and_idempotency(self):
        with self.assertRaises(HTTPError) as failure:
            self.call('/internal/put',{'task':'idor','key':'bad','flag':'I'+'A'*30+'='})
        self.assertEqual(failure.exception.code,403)
        _, first=self.put('idor')
        _, same=self.put('idor')
        _, second=self.put('idor','tick2')
        self.assertEqual(first,same)
        self.assertNotEqual(first['id'],second['id'])


@unittest.skipUnless(os.environ.get('POSTGRES_DB','').startswith('forcad_round1_test_'),'Requires disposable database')
class LifecycleTest(unittest.TestCase):
    def test_full_round_native_flags_and_fixed_scores(self):
        from lib import models, storage
        from lib.storage import round1, round_control
        from lib.models import Action, TaskStatus
        with storage.utils.db_cursor() as (conn,c):
            c.execute(Path('/app/scripts/create_tables.sql').read_text())
            c.execute("INSERT INTO GameConfig(id,real_round,round_time,flag_lifetime,game_hardness,inflation,volga_attacks_mode,start_time) VALUES(1,0,120,2,10,true,false,now())")
            for i in range(1,5):
                c.execute('INSERT INTO Teams(name,ip) VALUES(%s,%s)',('team0'+str(i),'10.80.0.'+str(10+i)))
            conn.commit()
        round_control.ensure_table()
        services=[]; directories=[]; config={'teams':{}}
        for i in range(11,15):
            directory=tempfile.TemporaryDirectory(); directories.append(directory)
            server=make_server('127.0.0.1',0,{'node':str(i),'data_dir':directory.name,'admin_token':'token'+str(i),'patched':{}})
            threading.Thread(target=server.serve_forever,daemon=True).start(); services.append(server)
            config['teams']['10.80.0.'+str(i)]={'url':'http://127.0.0.1:'+str(server.server_port),'token':'token'+str(i)}
        unavailable=[True]
        put_calls=[]
        class Runner:
            def __init__(self,team,task,logger,flag=None):
                self.team,self.task,self.flag=team,task,flag
            def run(self,action):
                payload={'ip':self.team.ip,'task':Path(self.task.checker).stem,'action':action}
                if self.flag:
                    payload.update(key=self.flag.private_flag_data,locator=self.flag.private_flag_data,flag=self.flag.flag)
                r=execute(payload,config)
                return models.CheckerVerdict(status=TaskStatus(r['status']),action={'put':Action.PUT,'get':Action.GET,'check':Action.CHECK}[action],public_message=r['public'],private_message=r['private'],command='test')
            def put(self):
                put_calls.append((self.team.id,self.task.id,self.flag.round))
                if unavailable[0]:
                    return models.CheckerVerdict(status=TaskStatus.DOWN,action=Action.PUT,public_message='down',private_message='',command='test')
                return self.run('put')
            def get(self): return self.run('get')
            def check(self): return self.run('check')
        clock=[time.time()]
        try:
            with patch.object(round1,'CheckerRunner',Runner), patch.object(round1.time,'time',lambda:clock[0]), patch.object(storage.utils.SIOManager,'write_only'):
                round1.prepare()
                round1.pump()
                with storage.utils.db_cursor() as (_,c):
                    c.execute('SELECT COUNT(*) FROM Flags'); self.assertEqual(c.fetchone()[0],0)
                round_control.set_enabled(True); round1.pump(); round1.collect_puts(wait=True)
                self.assertEqual(round1.state()['phase'],'running')
                with storage.utils.db_cursor() as (_,c):
                    c.execute('SELECT COUNT(*) FROM Flags'); self.assertEqual(c.fetchone()[0],0)
                # Every service is down; tick is already counting. Recover at +10s.
                unavailable[0]=False
                clock[0]+=10.1
                round1.pump(); round1.collect_puts(wait=True)
                self.assertEqual(round1.state()['tick'],1)
                self.assertEqual(round1.state()['phase'],'running')
                self.assertTrue(all(s['total']==0 for s in round1.scores()))
                with storage.utils.db_cursor() as (_,c):
                    c.execute('SELECT COUNT(*),COUNT(DISTINCT flag) FROM Flags'); self.assertEqual(c.fetchone(),(12,12))
                clock[0]+=108.9; round1.pump(); self.assertEqual(len(put_calls),24)
                self.assertTrue(all(s['sla']==0 for s in round1.scores()))
                round_control.set_enabled(False); round1.pump()
                remaining=round1.state()['remaining']
                clock[0]+=200; round1.pump()
                self.assertEqual(round1.state()['remaining'],remaining)
                round_control.set_enabled(True); round1.pump(); round1.collect_puts(wait=True); clock[0]+=1.1; round1.pump()
                self.assertTrue(all(s['sla']==1 for s in round1.scores()))
                round1.pump(); round1.collect_puts(wait=True)  # tick 2
                with storage.utils.db_cursor(dict_cursor=True) as (_,c):
                    c.execute('SELECT * FROM Flags WHERE team_id=2 AND round=2 ORDER BY task_id LIMIT 1'); flag=models.Flag.from_dict(dict(c.fetchone()))
                    c.execute('SELECT COUNT(*) AS all_flags,COUNT(DISTINCT flag) AS distinct_flags FROM Flags'); self.assertEqual(tuple(c.fetchone().values()),(24,24))
                # Recover the exact flag after an interrupted SQL/cache handoff.
                with storage.utils.db_cursor() as (conn,c):
                    c.execute('UPDATE MekodataPlacements SET flag_id=NULL WHERE team_id=2 AND task_id=%s AND tick=2',(flag.task_id,)); conn.commit()
                redis=storage.utils.RedisStorage.get()
                redis.delete(storage.keys.CacheKeys.flag_by_id(flag.id),storage.keys.CacheKeys.flag_by_str(flag.flag))
                team=next(t for t in storage.teams.get_teams() if t.id==2)
                task=next(t for t in storage.tasks.get_tasks() if t.id==flag.task_id)
                self.assertTrue(round1.put_flag((team,task,2)))
                self.assertIsNotNone(storage.flags.get_flag_by_str(flag.flag,2))
                # A result for a different tick, or after its deadline, must never enter Flags.
                self.assertFalse(round1.put_flag((team,task,99)))
                with patch.object(round1,'state',return_value={'phase':'running','tick':98,'deadline':clock[0]-1}):
                    self.assertFalse(round1.put_flag((team,task,98)))
                with storage.utils.db_cursor() as (_,c):
                    c.execute('SELECT COUNT(*) FROM Flags'); self.assertEqual(c.fetchone()[0],24)
                own=storage.attacks.handle_attack(2,flag.flag,2); self.assertFalse(own.submit_ok)
                first=storage.attacks.handle_attack(1,flag.flag,2); self.assertTrue(first.submit_ok)
                self.assertEqual((first.attacker_delta,first.victim_delta),(1,-1))
                self.assertFalse(storage.attacks.handle_attack(1,flag.flag,2).submit_ok)
                round_control.set_enabled(False); round1.pump()
                self.assertFalse(storage.attacks.handle_attack(3,flag.flag,2).submit_ok)
                round_control.set_enabled(True); round1.pump(); round1.collect_puts(wait=True)
                for tick in range(2,16):
                    self.assertEqual(round1.state()['tick'],tick)
                    clock[0]+=120.1; round1.pump()
                    if tick<15: round1.pump(); round1.collect_puts(wait=True)
                self.assertEqual(round1.state()['phase'],'draining')
                self.assertTrue(all(s['sla']==15 for s in round1.scores()))
                self.assertFalse(storage.attacks.handle_attack(3,flag.flag,15).submit_ok)
                clock[0]+=240.1; round1.pump()
                self.assertEqual(round1.state()['phase'],'finished')
                self.assertFalse(round_control.get_enabled())
                with storage.utils.db_cursor() as (_,c):
                    c.execute('SELECT COUNT(*),COUNT(DISTINCT flag) FROM Flags'); self.assertEqual(c.fetchone(),(180,180))
                self.assertEqual(sorted((s['attack'],s['defense'],s['sla'],s['total']) for s in round1.scores()),[(0,-1,15,14),(0,0,15,15),(0,0,15,15),(1,0,15,16)])
        finally:
            for server in services: server.shutdown(); server.server_close()
            for directory in directories: directory.cleanup()


if __name__=='__main__':
    unittest.main()
