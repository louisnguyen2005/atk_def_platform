from typing import List, Optional

from lib import models
from lib import storage
from lib.helpers.cache import cache_helper
from lib.storage.keys import CacheKeys


def get_teams() -> List[models.Team]:
    """Get list of active teams."""
    key = CacheKeys.teams()
    with storage.utils.redis_pipeline(transaction=True) as pipe:
        cache_helper(
            pipeline=pipe,
            cache_key=key,
            cache_func=storage.caching.cache_teams,
            cache_args=(pipe,),
        )

        teams, = pipe.smembers(key).execute()
        teams = list(models.Team.from_json(team) for team in teams)

    return teams


def get_all_teams() -> List[models.Team]:
    """Get list of all teams, including inactive."""
    with storage.utils.db_cursor(dict_cursor=True) as (_, curs):
        curs.execute(models.Team.get_select_all_query())
        teams = curs.fetchall()

    teams = list(models.Team.from_dict(team) for team in teams)
    return teams


def get_team_id_by_token(token: str) -> Optional[int]:
    """
    Get team by token.

    :param token: token string
    :return: team id
    """
    with storage.utils.redis_pipeline(transaction=False) as pipe:
        team_id, = pipe.get(CacheKeys.team_by_token(token)).execute()

    try:
        team_id = int(team_id)
    except (ValueError, TypeError):
        return None
    else:
        return team_id


def create_team(team: models.Team) -> models.Team:
    """Add new team to DB, reset cache & return created instance."""
    with storage.utils.db_cursor() as (conn, curs):
        team.insert(curs)

        insert_data = (
            {
                'task_id': task.id,
                'team_id': team.id,
                'score': task.default_score,
                'status': -1,
            }
            for task in storage.tasks.get_all_tasks()
        )
        curs.executemany(storage.tasks.TEAMTASK_INSERT_QUERY, insert_data)

        conn.commit()

    storage.caching.flush_teams_cache()
    return team


def update_team(team: models.Team) -> models.Team:
    """Update team, reset cache & return updated instance."""
    with storage.utils.db_cursor() as (conn, curs):
        curs.execute('SELECT token FROM Teams WHERE id=%s', (team.id,))
        row = curs.fetchone()
        curs.execute(team.get_update_query(), team.to_dict())
        conn.commit()

    storage.caching.flush_teams_cache()

    # Khóa team:token:<token> không bị xóa khi flush cache đội, nên khi đổi token
    # (vd. đồng bộ token từ website MekoDataCTF) phải tự gỡ token cũ, nếu không
    # token cũ vẫn nộp flag được. Token mới được ghi ngay để nộp flag không phải chờ dựng lại cache.
    old_token = row[0] if row else None
    with storage.utils.redis_pipeline(transaction=True) as pipe:
        if old_token and old_token != team.token:
            pipe.delete(CacheKeys.team_by_token(old_token))
        if team.active:
            pipe.set(CacheKeys.team_by_token(team.token), team.id)
        else:
            pipe.delete(CacheKeys.team_by_token(team.token))
        pipe.execute()

    return team


def delete_team(team_id: int) -> None:
    """Set active = False on a team."""
    with storage.utils.db_cursor() as (conn, curs):
        curs.execute(models.Team.get_delete_query(), {'id': team_id})
        conn.commit()

    storage.caching.flush_teams_cache()
