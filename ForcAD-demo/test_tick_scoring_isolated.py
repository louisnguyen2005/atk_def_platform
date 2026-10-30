"""Integration check against a disposable database, never the live scoreboard."""
import os
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

assert os.environ['POSTGRES_DB'] == 'forcad_tick_test_codex'
from lib import storage
from lib.storage import round_control
from lib.models import Action, TaskStatus
from services.ticker.hooks import classic_round

with storage.utils.db_cursor() as (conn, cur):
    cur.execute(Path('/app/scripts/create_tables.sql').read_text())
    cur.execute("INSERT INTO GameConfig(id, real_round) VALUES (1, 0)")
    cur.execute("INSERT INTO Teams(id,name,ip) VALUES (1,'team01','10.0.0.11')")
    cur.execute("INSERT INTO Tasks(id,name,gets,puts,places,checker_timeout,default_score,active) VALUES (1,'health',0,0,1,5,0,true)")
    cur.execute("INSERT INTO TeamTasks(task_id,team_id,status,score,checks,checks_passed) VALUES (1,1,-1,0,0,0)")
    conn.commit()
round_control.ensure_table()

class Pipeline:
    def xadd(self, *args, **kwargs): return self
    def execute(self): return []
@contextmanager
def pipeline(**kwargs):
    yield Pipeline()

def result(tick, status, message):
    verdict = SimpleNamespace(status=status, action=Action.CHECK,
                              public_message=message, private_message='', command='test')
    storage.tasks.update_task_status(1, 1, tick, verdict)

with patch.object(storage.utils, 'redis_pipeline', pipeline), \
     patch.object(storage.game, 'update_game_state'):
    result(1, TaskStatus.UP, 'cycle=11;status=UP')
    result(1, TaskStatus.UP, 'cycle=11;status=UP')  # retry, no double points
    result(2, TaskStatus.DOWN, 'cycle=12;status=DOWN')
    result(3, TaskStatus.UP, 'cycle=11;status=UP')  # reused cycle -> checker error
    result(4, TaskStatus.CHECK_FAILED, '')
    for tick in range(5, 31):
        result(tick, TaskStatus.UP, f'cycle={100+tick};status=UP')
    result(31, TaskStatus.UP, 'cycle=999;status=UP')  # outside match

with storage.utils.db_cursor() as (_, cur):
    cur.execute('SELECT score,checks,checks_passed FROM TeamTasks WHERE team_id=1 AND task_id=1')
    assert cur.fetchone() == (27, 30, 27)
    cur.execute('SELECT COUNT(*),SUM(points),COUNT(*) FILTER (WHERE status=110) FROM MekodataTickResults')
    assert cur.fetchone() == (30, 27, 2)
    cur.execute('SELECT points FROM MekodataTickResults WHERE tick=2')
    assert cur.fetchone() == (0,)

with patch.object(storage.game, 'get_real_round_from_db', return_value=30), \
     patch.object(classic_round.round_control, 'set_enabled') as pause, \
     patch.object(classic_round.utils, 'update_round') as advance:
    classic_round.run_classic_round(SimpleNamespace(celery_app=None))
    pause.assert_called_once_with(False)
    advance.assert_not_called()
print('OK: UP +1, DOWN 0, duplicate tick and cycle protected, unknown recorded, cap 30 ticks.')
