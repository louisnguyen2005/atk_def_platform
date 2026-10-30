from flask import jsonify, request

from lib.storage import round_control
from .authentication import check_session
from .utils import abort_with_error


def round_control_status():
    check_session()
    round_control.ensure_table()
    from lib.storage import round1
    return jsonify({'running': round_control.get_enabled(), 'round1': round1.state()})


def round1_prepare():
    check_session()
    if request.headers.get('Origin') != request.host_url.rstrip('/'):
        abort_with_error('Invalid origin', 403)
    if (request.get_json(silent=True) or {}).get('confirm') != 'PREPARE ROUND1':
        abort_with_error('Preparation confirmation required', 400)
    from lib.storage import round1
    try:
        round1.prepare()
    except ValueError as exc:
        abort_with_error(str(exc), 409)
    return jsonify({'status': 'prepared', 'running': False})


def round1_archive():
    check_session()
    if request.headers.get('Origin') != request.host_url.rstrip('/'):
        abort_with_error('Invalid origin', 403)
    if (request.get_json(silent=True) or {}).get('confirm') != 'ARCHIVE ROUND1':
        abort_with_error('Archive confirmation required', 400)
    from lib.storage import round1
    try:
        archive_id = round1.archive_competition()
    except ValueError as exc:
        abort_with_error(str(exc), 409)
    return jsonify({'status': 'archived', 'archive_id': archive_id})


def round1_archive_download(archive_id):
    check_session()
    from flask import make_response
    from lib.storage import round1
    archive = round1.get_archive(archive_id)
    if not archive:
        abort_with_error('Archive not found', 404)
    response = make_response(jsonify(archive))
    response.headers['Content-Disposition'] = 'attachment; filename="round1-archive-' + archive_id + '.json"'
    response.headers['Cache-Control'] = 'no-store'
    return response


def round1_recreate():
    check_session()
    if request.headers.get('Origin') != request.host_url.rstrip('/'):
        abort_with_error('Invalid origin', 403)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get('confirm') != 'RECREATE ROUND1':
        abort_with_error('Recreate confirmation required', 400)
    from lib.storage import round1
    try:
        round1.recreate_from_archive(data.get('archive_id'), data.get('verified_hosts'))
    except ValueError as exc:
        abort_with_error(str(exc), 409)
    return jsonify({'status': 'ready', 'round': 0, 'running': False})


def round_control_update():
    check_session()
    if request.headers.get('Origin') != request.host_url.rstrip('/'):
        abort_with_error('Invalid origin', 403)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or type(data.get('running')) is not bool:
        abort_with_error('Expected boolean running', 400)
    round_control.ensure_table()
    try:
        round_control.set_enabled(data['running'])
    except round_control.ResetUnavailable as exc:
        abort_with_error(str(exc), 409)
    return jsonify({'running': round_control.get_enabled()})


def round_control_reset():
    check_session()
    if request.headers.get('Origin') != request.host_url.rstrip('/'):
        abort_with_error('Invalid origin', 403)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get('confirm') != 'RESET':
        abort_with_error('Reset confirmation required', 400)
    try:
        round_control.reset_health_demo()
    except round_control.ResetUnavailable as exc:
        abort_with_error(str(exc), 409)
    return jsonify({'round': 0, 'running': False})


def arena_data():
    check_session()
    from lib.storage import utils
    with utils.db_cursor(dict_cursor=True) as (_, c):
        c.execute("SELECT tt.team_id,t.name AS team,k.name AS service,tt.status,tt.checks,tt.checks_passed FROM TeamTasks tt JOIN Teams t ON t.id=tt.team_id JOIN Tasks k ON k.id=tt.task_id WHERE t.active AND k.active ORDER BY t.name,k.name")
        services=[dict(r) for r in c.fetchall()]
        c.execute("SELECT f.id AS capture_flag_id,s.attacker_id,f.team_id AS victim_id,a.name AS attacker,v.name AS victim,k.name AS service,f.round AS tick,s.submit_time FROM StolenFlags s JOIN Flags f ON f.id=s.flag_id JOIN Teams a ON a.id=s.attacker_id JOIN Teams v ON v.id=f.team_id JOIN Tasks k ON k.id=f.task_id ORDER BY s.submit_time DESC,f.id DESC,s.attacker_id LIMIT 50")
        captures=[dict(r) for r in c.fetchall()]
        c.execute("SELECT l.team_id,t.name AS team,l.tick,l.status,l.points FROM MekodataSLA l JOIN Teams t ON t.id=l.team_id ORDER BY l.tick DESC,t.name LIMIT 120")
        checks=[dict(r) for r in c.fetchall()]
    response=jsonify({'services':services,'captures':captures,'checks':checks})
    response.headers['Cache-Control']='no-store'
    return response
