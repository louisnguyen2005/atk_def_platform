from flask import Blueprint
from flask import jsonify, make_response

from lib import storage

client_bp = Blueprint('client_api', __name__)


@client_bp.route('/teams/')
def get_teams():
    teams = [team.to_dict_for_participants() for team in storage.teams.get_teams()]
    return jsonify(teams)


@client_bp.route('/tasks/')
def get_tasks():
    tasks = [task.to_dict_for_participants() for task in storage.tasks.get_tasks()]

    return jsonify(tasks)


@client_bp.route('/config/')
def get_game_config():
    cfg = storage.game.get_current_game_config().to_dict()
    return jsonify(cfg)


@client_bp.route('/attack_data/')
def serve_attack_data():
    attack_data = storage.attacks.get_attack_data()
    response = make_response(attack_data)
    response.headers['Content-Type'] = 'application/json'
    return response


@client_bp.route('/teams/<int:team_id>/')
def get_team_history(team_id):
    teamtasks = storage.tasks.get_teamtasks_for_team(team_id)
    teamtasks = storage.tasks.filter_teamtasks_for_participants(teamtasks)
    return jsonify(teamtasks)


@client_bp.route('/ctftime/')
def get_ctftime_scoreboard():
    standings = storage.game.construct_ctftime_scoreboard()
    if not standings:
        return jsonify({'error': 'not available'}), 400
    return jsonify(standings)


@client_bp.route('/health/')
def health_check():
    return jsonify({'status': 'ok'})


@client_bp.route('/tick-status/')
def tick_status():
    from lib.storage import round1
    if round1.configured():
        s = round1.state()
        return jsonify({'mode': 'round1', 'round': 1, 'tick': s['tick'],
                        'phase': s['phase'], 'deadline': s['deadline'], 'error': s['error'],
                        'tick_seconds': storage.game.get_current_game_config().round_time,
                        'max_rounds': 2, 'ticks_per_round': 15, 'scores': round1.scores()})
    with storage.utils.db_cursor() as (_, curs):
        curs.execute('SELECT real_round FROM GameConfig WHERE id=1')
        tick = curs.fetchone()[0]
        curs.execute('SELECT enabled FROM MekodataRoundControl WHERE id=1')
        running = bool(curs.fetchone()[0])
        curs.execute('''SELECT team_id, (tick-1)/15+1 AS round_number,
                               SUM(points) AS points, COUNT(*) FILTER (WHERE status=110) AS unknown
                        FROM MekodataTickResults GROUP BY team_id, round_number''')
        results = [{'team_id': team_id, 'round': rnd, 'points': points, 'unknown': unknown}
                   for team_id, rnd, points, unknown in curs.fetchall()]
    current_tick = min(tick + 1, 30) if running else tick
    return jsonify({'overall_tick': tick, 'running': running, 'round': ((current_tick - 1) // 15 + 1) if current_tick else 0,
                    'tick': ((current_tick - 1) % 15 + 1) if current_tick else 0,
                    'max_rounds': 2, 'ticks_per_round': 15, 'results': results})


@client_bp.route("/arena/")
def public_arena_data():
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
