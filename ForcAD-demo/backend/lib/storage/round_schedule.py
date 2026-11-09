"""Timing rules of a competition round, shared by every lab. No database or Redis here.

A lab declares round_time, ticks_per_round, check_seconds and drain_ticks in lab_profile.

check_seconds > 0: ticks are anchored to the start of the round and checks run inside the
tick, so the round lasts exactly round_time * ticks_per_round even when checks are slow.
check_seconds = 0: checks run after the tick and each tick starts when the last one ended.
"""
MIN_ATTACK_SECONDS = 60


def is_fixed(lab):
    return lab['check_seconds'] > 0


def flags_per_tick(lab):
    """Flags one team receives each tick: one per task."""
    return len(lab['tasks'])


def round_seconds(lab):
    """Planned length of a round, without the time checks add when check_seconds is 0."""
    return lab['round_time'] * (lab['ticks_per_round'] + lab['drain_ticks'])


def tick_deadline(lab, started_at, tick, now):
    """End of a tick; a late start keeps the plan unless that leaves no time to attack."""
    if not is_fixed(lab):
        return now + lab['round_time']
    planned = started_at + tick * lab['round_time']
    return max(planned, now + lab['check_seconds'] + MIN_ATTACK_SECONDS)


def check_at(lab, deadline):
    """Moment the checks of a tick start."""
    return deadline - lab['check_seconds']


def after_last_tick(lab, deadline, now):
    """End of the round once the last tick has been checked."""
    if lab['drain_ticks']:
        return now + lab['drain_ticks'] * lab['round_time']
    return max(deadline, now)


def virtual_tick(lab, deadline, now):
    """Round number used for flag expiry while the final window is open."""
    window = lab['drain_ticks'] * lab['round_time']
    elapsed = int((window - (deadline - now)) // lab['round_time'])
    return lab['ticks_per_round'] + min(lab['drain_ticks'], max(0, elapsed))
