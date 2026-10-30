"""Organizer-controlled gate for scheduling rounds in the local demo."""
from . import utils


class ResetUnavailable(Exception):
    pass


def ensure_table():
    with utils.db_cursor() as (conn, curs):
        curs.execute('''CREATE TABLE IF NOT EXISTS MekodataRoundControl (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )''')
        curs.execute('ALTER TABLE MekodataRoundControl ADD COLUMN IF NOT EXISTS resetting BOOLEAN NOT NULL DEFAULT FALSE')
        curs.execute('INSERT INTO MekodataRoundControl (id) VALUES (1) ON CONFLICT DO NOTHING')
        curs.execute('''CREATE TABLE IF NOT EXISTS MekodataTickResults (
            team_id INTEGER NOT NULL REFERENCES Teams(id),
            task_id INTEGER NOT NULL REFERENCES Tasks(id),
            tick INTEGER NOT NULL CHECK (tick BETWEEN 1 AND 30),
            status INTEGER NOT NULL,
            points INTEGER NOT NULL CHECK (points IN (0, 1)),
            checker_cycle INTEGER,
            PRIMARY KEY (team_id, task_id, tick),
            UNIQUE (team_id, task_id, checker_cycle)
        )''')
        conn.commit()
    from . import round1
    round1.ensure_schema()


def get_enabled():
    with utils.db_cursor() as (_, curs):
        curs.execute('SELECT enabled AND NOT resetting FROM MekodataRoundControl WHERE id = 1')
        row = curs.fetchone()
        return bool(row and row[0])


def set_enabled(enabled):
    with utils.db_cursor() as (conn, curs):
        if enabled:
            from . import round1
            if round1.configured():
                s = round1.state()
                if s['phase'] in ('archived', 'recreating'):
                    raise ResetUnavailable('Cuộc thi đã đóng hoặc đang tái tạo; hoàn tất quy trình lưu hồ sơ trước khi bắt đầu mới.')
                if s['phase'] == 'finished':
                    raise ResetUnavailable('Round 1 đã kết thúc. Round 2 chưa triển khai.')
                curs.execute("SELECT COUNT(*) FROM Tasks WHERE active AND checker LIKE '/checkers/round1/%'")
                if curs.fetchone()[0] != 3:
                    raise ResetUnavailable('Round 1 cần đủ ba task IDOR, SQLi, Upload.')
                curs.execute("UPDATE MekodataRoundControl SET enabled=true,updated_at=now() WHERE id=1 AND NOT resetting AND NOT EXISTS (SELECT 1 FROM MekodataRound1 WHERE id=1 AND phase IN ('archived','recreating'))")
                if not curs.rowcount:
                    conn.rollback()
                    raise ResetUnavailable('Cuộc thi đã đóng hoặc reset đang chạy.')
                conn.commit()
                return
            curs.execute('SELECT real_round FROM GameConfig WHERE id=1')
            if curs.fetchone()[0] >= 30:
                raise ResetUnavailable('Đã hoàn thành 30 tick. Reset trước khi bắt đầu cuộc thi mới.')
            curs.execute('SELECT COUNT(*) FROM Tasks WHERE active')
            if curs.fetchone()[0] != 1:
                raise ResetUnavailable('Bản thử 30 điểm yêu cầu đúng một dịch vụ đang hoạt động.')
        curs.execute("UPDATE MekodataRoundControl SET enabled=%s, updated_at=now() WHERE id=1 AND NOT resetting AND (NOT %s OR NOT EXISTS (SELECT 1 FROM MekodataRound1 WHERE id=1 AND phase IN ('archived','recreating'))) ", (enabled, enabled))
        if not curs.rowcount:
            conn.rollback()
            raise ResetUnavailable('Reset đang chạy; vui lòng chờ.')
        conn.commit()


def reset_health_demo():
    """Reset only the health-only demo after the scheduler and workers quiesce."""
    from services.tasks import get_celery_app
    from lib import storage
    from .keys import CacheKeys
    ensure_table()
    from . import round1
    if round1.configured():
        raise ResetUnavailable('Round 1 dùng flag thật: không hỗ trợ reset xóa dữ liệu bằng nút health-only.')
    with utils.db_cursor() as (conn, curs):
        try:
            curs.execute('SELECT enabled, resetting, EXTRACT(EPOCH FROM (now() - updated_at)) FROM MekodataRoundControl WHERE id=1 FOR UPDATE')
            enabled, resetting, paused_seconds = curs.fetchone()
            if resetting:
                raise ResetUnavailable('Reset trước chưa hoàn tất; cần quản trị viên kiểm tra.')
            if enabled or paused_seconds < 30:
                raise ResetUnavailable('Hãy dừng round và chờ ít nhất 30 giây trước khi reset.')
            curs.execute('SELECT COUNT(*) FROM Flags')
            if curs.fetchone()[0]:
                raise ResetUnavailable('Đã có flag; bản reset thử nghiệm không hỗ trợ xóa dữ liệu thi có flag.')
            curs.execute('SELECT COUNT(*) FROM Tasks WHERE active AND (puts <> 0 OR gets <> 0)')
            if curs.fetchone()[0]:
                raise ResetUnavailable('Chỉ hỗ trợ bài kiểm tra health không có PUT/GET flag.')
            app = get_celery_app()
            inspector = app.control.inspect(timeout=2)
            for category in ('active', 'reserved', 'scheduled'):
                workers = getattr(inspector, category)()
                if not workers or any(workers.values()):
                    raise ResetUnavailable('Worker chưa sẵn sàng hoặc còn tác vụ; hãy thử lại sau.')
            with app.connection_for_read() as connection:
                queue = connection.default_channel.queue_declare(queue='celery', passive=True)
                if queue.message_count:
                    raise ResetUnavailable('Hàng đợi còn tác vụ; hãy thử lại sau.')
            curs.execute('DELETE FROM MekodataTickResults')
            curs.execute('DELETE FROM TeamTasksLog')
            curs.execute('''UPDATE TeamTasks AS tt SET status=-1, stolen=0, lost=0,
                score=0, checks=0, checks_passed=0,
                public_message='', private_message='', command=''
                FROM Tasks AS t WHERE tt.task_id=t.id''')
            curs.execute('UPDATE GameConfig SET real_round=0 WHERE id=1')
            curs.execute('UPDATE MekodataRoundControl SET resetting=true WHERE id=1')
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    redis = utils.RedisStorage.get()
    keys = list(redis.scan_iter(match='teamtasks:*'))
    if keys:
        redis.delete(*keys)
    redis.set(CacheKeys.current_round(), 0)
    redis.delete(CacheKeys.attack_data())
    storage.game.set_round_start(0)
    storage.game.update_game_state(for_round=0)
    with utils.db_cursor() as (conn, curs):
        curs.execute('UPDATE MekodataRoundControl SET resetting=false, updated_at=now() WHERE id=1')
        conn.commit()
