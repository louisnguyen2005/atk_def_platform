"""Run only against the disposable database named below, never the live game."""
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

assert os.environ['POSTGRES_DB'] == 'forcad_reset_test_codex'
from lib import storage
from lib.storage import round_control

with storage.utils.db_cursor() as (conn, cur):
    cur.execute(Path('/app/scripts/create_tables.sql').read_text())
    cur.execute("INSERT INTO GameConfig(id, real_round) VALUES (1, 29)")
    cur.execute("INSERT INTO Teams(id,name,ip) VALUES (1,'team01','10.0.0.11')")
    cur.execute("INSERT INTO Tasks(id,name,gets,puts,places,checker_timeout,default_score,active) VALUES (1,'health',0,0,1,5,2500,true)")
    cur.execute("INSERT INTO TeamTasks(task_id,team_id,status,score,checks,checks_passed,stolen,lost) VALUES (1,1,104,123,5,2,1,1)")
    cur.execute("INSERT INTO TeamTasksLog(round,task_id,team_id) VALUES(42,1,1)")
    conn.commit()

round_control.ensure_table()
round_control.set_enabled(True)
try:
    round_control.reset_health_demo()
    raise AssertionError('Reset was allowed while running')
except round_control.ResetUnavailable:
    pass

with storage.utils.db_cursor() as (conn, cur):
    cur.execute("UPDATE MekodataRoundControl SET enabled=false, updated_at=now()-interval '60 seconds'")
    cur.execute("INSERT INTO Flags(flag,team_id,task_id,round,public_flag_data,private_flag_data) VALUES ('test',1,1,1,'','')")
    conn.commit()
try:
    round_control.reset_health_demo()
    raise AssertionError('Reset was allowed with existing flags')
except round_control.ResetUnavailable:
    pass
with storage.utils.db_cursor() as (conn, cur):
    cur.execute('DELETE FROM Flags')
    conn.commit()

class Inspector:
    def active(self): return {'worker': []}
    def reserved(self): return {'worker': []}
    def scheduled(self): return {'worker': []}

class Connection:
    def __enter__(self): return self
    def __exit__(self, *args): pass
    default_channel = SimpleNamespace(queue_declare=lambda **kwargs: SimpleNamespace(message_count=0))

app = SimpleNamespace(control=SimpleNamespace(inspect=lambda **kwargs: Inspector()),
                      connection_for_read=lambda: Connection())
redis = SimpleNamespace(scan_iter=lambda **kwargs: iter([]), set=lambda *args: None,
                        delete=lambda *args: None)
with patch('services.tasks.get_celery_app', return_value=app), \
     patch.object(round_control.utils.RedisStorage, 'get', return_value=redis), \
     patch.object(storage.game, 'set_round_start'), \
     patch.object(storage.game, 'update_game_state'):
    round_control.reset_health_demo()

with storage.utils.db_cursor() as (_, cur):
    cur.execute('SELECT real_round FROM GameConfig WHERE id=1')
    assert cur.fetchone() == (0,)
    cur.execute('SELECT status,score,checks,checks_passed,stolen,lost FROM TeamTasks')
    assert cur.fetchone() == (-1, 0, 0, 0, 0, 0)
    cur.execute('SELECT COUNT(*) FROM TeamTasksLog')
    assert cur.fetchone() == (0,)
    cur.execute('SELECT COUNT(*) FROM Teams')
    assert cur.fetchone() == (1,)
    cur.execute('SELECT resetting FROM MekodataRoundControl')
    assert cur.fetchone() == (False,)
print('OK: isolated reset preserves teams, clears history, resets score and round; running and flags are rejected.')
