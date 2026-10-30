import logging
import json
import os
from pathlib import Path
import time
import uuid

from celery import Celery
from celery.canvas import chain, group

from lib import models, storage
from lib.storage import round_control
from . import utils

logger = logging.getLogger(__name__)


def submit_full_round_jobs(app: Celery, team: models.Team, task: models.Task, r: int):
    kwargs, params = utils.get_round_setup(app, team, task, r)

    check = utils.get_check_signature(app, kwargs, params)
    noop = utils.get_noop_signature(app)
    followups = [noop]
    if task.puts:
        followups.append(utils.get_puts_group(app, task, kwargs, params))
    if task.gets:
        followups.append(utils.get_gets_chain(app, task, kwargs, params))

    handler = utils.get_result_handler_signature(app, kwargs)

    scheme = chain(
        check,
        group(followups),  # noop passes the check result forward
        handler,
    )
    scheme.apply_async()


def run_classic_round(state):
    if storage.game.get_real_round_from_db() >= 30:
        round_control.set_enabled(False)
        return
    new_round = utils.update_round()
    if not new_round:
        return

    directory = Path('/checkers/mekodata_bridge')
    request = {'request_id': uuid.uuid4().hex, 'tick': new_round, 'requested_at': time.time()}
    temporary = directory / ('request-' + request['request_id'] + '.tmp')
    temporary.write_text(json.dumps(request), encoding='utf-8')
    os.replace(temporary, directory / 'request.json')
    args_list = utils.get_round_processor_args(new_round)

    for args in args_list:
        submit_full_round_jobs(state.celery_app, *args)
    if new_round >= 30:
        round_control.set_enabled(False)
