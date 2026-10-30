import logging
import sys
import time
from datetime import timedelta, datetime, timezone

from lib import storage, models
from lib.storage import round_control
from services.tasks import get_celery_app
from . import hooks
from .models import TickerState, Schedule

logger = logging.getLogger('ticker')
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


def bootstrap_state() -> TickerState:
    celery_app = get_celery_app()
    already_started = storage.game.get_game_running()
    return TickerState(
        game_started=already_started,
        celery_app=celery_app,
    )


def bootstrap_schedules(state: TickerState):
    game_config = storage.game.get_current_game_config()
    start_schedule = Schedule(
        schedule_id='start_game',
        start=game_config.start_time,
        func=hooks.start_game,
    )
    start_schedule.load_last_run()
    state.register_schedule(start_schedule)

    round_interval = timedelta(seconds=game_config.round_time)

    if game_config.mode == models.GameMode.CLASSIC:
        rounds_schedule = Schedule(
            schedule_id='classic_rounds',
            start=game_config.start_time,
            func=hooks.run_classic_round,
            interval=round_interval,
        )
        rounds_schedule.load_last_run()
        state.register_schedule(rounds_schedule)

    elif game_config.mode == models.GameMode.BLITZ:
        rounds_schedule = Schedule(
            'blitz_rounds',
            start=game_config.start_time,
            func=hooks.run_blitz_puts_round,
            interval=round_interval,
        )
        rounds_schedule.load_last_run()
        state.register_schedule(rounds_schedule)

        tasks = storage.tasks.get_tasks()
        for task in tasks:
            interval = timedelta(seconds=task.get_period)
            check_gets_schedule = Schedule(
                f'blitz_check_gets_task_{task.id}',
                start=game_config.start_time,
                func=hooks.blitz_check_gets_runner_factory(task.id),
                interval=interval,
            )
            check_gets_schedule.load_last_run()
            state.register_schedule(check_gets_schedule)

    else:
        logger.critical('Game mode %s unsupported', game_config.mode)
        sys.exit(1)


def main(state: TickerState):
    round_control.ensure_table()
    from lib.storage import round1
    # Require an organizer to start rounds after the scheduler restarts.
    round_control.set_enabled(False)
    was_enabled = False
    while True:
        if round1.configured():
            try:
                round1.pump()
            except Exception:
                logger.exception('Round 1 scheduler failed; paused for organizer review')
                round_control.set_enabled(False)
                round1.update(error='Scheduler gặp lỗi; đã dừng. Kiểm tra log trước khi tiếp tục.')
            time.sleep(0.5)
            continue
        if not round_control.get_enabled():
            was_enabled = False
            time.sleep(0.5)
            continue
        now = datetime.now(timezone.utc)
        if not was_enabled:
            # A new or resumed tick gets a full interval before scoring.
            for schedule in state.schedules:
                if schedule.schedule_id == 'classic_rounds':
                    schedule.last_run = now
            was_enabled = True
        due_schedules = state.get_due_schedules(now)
        for schedule in due_schedules:
            if not round_control.get_enabled():
                break
            logger.info('Executing schedule %s', schedule.schedule_id)
            schedule.execute(state=state)
            logger.info('Schedule %s completed', schedule.schedule_id)
            schedule.last_run = now
            schedule.save_last_run()
        time.sleep(0.1)  # 100ms precision


if __name__ == '__main__':
    ticker_state = bootstrap_state()
    bootstrap_schedules(ticker_state)
    main(ticker_state)
