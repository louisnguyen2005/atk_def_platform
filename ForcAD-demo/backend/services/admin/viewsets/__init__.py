"""Simple "viewsets" implementation for models' REST API."""

from .authentication import login, status
from .tasks import TaskApi
from .teams import TeamApi
from .teamtasks import TeamTaskApi
from .views import admin_bp
from .round_control import (round_control_status, round_control_update, round_control_reset,
                            round1_prepare, round1_archive, round1_archive_download, round1_recreate,
                            round1_restart, round2_prepare)

TeamApi(admin_bp, auth=True)
TaskApi(admin_bp, auth=True)
TeamTaskApi(admin_bp, auth=True)

admin_bp.add_url_rule('/login/', 'login', login, methods=['POST'])
admin_bp.add_url_rule('/status/', 'status', status, methods=['GET'])
admin_bp.add_url_rule('/round-control/', 'round_control_status', round_control_status, methods=['GET'])
admin_bp.add_url_rule('/round-control/', 'round_control_update', round_control_update, methods=['POST'])
admin_bp.add_url_rule('/round-control/reset/', 'round_control_reset', round_control_reset, methods=['POST'])
admin_bp.add_url_rule('/round1/prepare/', 'round1_prepare', round1_prepare, methods=['POST'])
admin_bp.add_url_rule('/round2/prepare/', 'round2_prepare', round2_prepare, methods=['POST'])
admin_bp.add_url_rule('/round1/archive/', 'round1_archive', round1_archive, methods=['POST'])
admin_bp.add_url_rule('/round1/archive/<archive_id>/', 'round1_archive_download', round1_archive_download, methods=['GET'])
admin_bp.add_url_rule('/round1/recreate/', 'round1_recreate', round1_recreate, methods=['POST'])
admin_bp.add_url_rule('/round1/restart/', 'round1_restart', round1_restart, methods=['POST'])

from .round_control import arena_data
admin_bp.add_url_rule("/arena/", "arena_data", arena_data, methods=["GET"])
