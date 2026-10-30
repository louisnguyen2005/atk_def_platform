"""Only install Round 1 schema. Preparing and starting require admin dashboard."""
from lib.storage import round_control
round_control.ensure_table()
print('Round 1 schema installed. No tasks enabled and no flags created.')
