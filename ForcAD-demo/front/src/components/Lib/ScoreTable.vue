<template>
    <div
        class="board"
        :style="{ '--service-count': tasks.length }"
        :class="{ 'board--dense': tasks.length > 4 }"
    >
        <div class="board-head">
            <div class="col-rank">{{ headRowTitle }}</div>
            <div class="col-team">Đội</div>
            <div class="col-score">Tổng điểm</div>
            <div class="col-services">
                <div
                    v-for="{ name, id } in tasks"
                    :key="name"
                    class="svc-head"
                    :class="{ clickable: taskClickable }"
                    @click="$emit('openTask', id)"
                >
                    <span class="svc-head-name">{{ name }}</span>
                    <button
                        v-if="admin"
                        class="icon-btn"
                        title="Sửa dịch vụ"
                        @click.stop="$emit('openTaskAdmin', id)"
                    >
                        <i class="fas fa-edit" />
                    </button>
                </div>
            </div>
        </div>

        <transition-group name="teams-list" tag="div" class="board-body">
            <div
                v-for="(
                    {
                        name,
                        score: totalScore,
                        tasks: teamTasks,
                        ip,
                        id,
                        highlighted,
                    },
                    index
                ) in teams"
                :key="name"
                class="board-row"
                :class="{ highlighted, [`rank-${index + 1}`]: index < 3 }"
            >
                <div class="col-rank">
                    <span
                        class="rank-badge"
                        :style="{ '--rank-color': getRankColor(index) }"
                    >
                        {{ index + 1 }}
                    </span>
                </div>

                <div
                    class="col-team"
                    :class="{ clickable: teamClickable }"
                    @click="$emit('openTeam', id)"
                >
                    <span class="team-name">{{ name }}</span>
                    <span class="team-ip">{{ ip }}</span>
                    <button
                        v-if="admin"
                        class="icon-btn team-edit"
                        title="Sửa đội"
                        @click.stop="$emit('openTeamAdmin', id)"
                    >
                        <i class="fas fa-edit" />
                    </button>
                </div>

                <div class="col-score">
                    <span class="score-value">{{ money(totalScore) }}</span>
                </div>

                <div class="col-services">
                    <div
                        v-for="{
                            id: teamTaskID,
                            teamId,
                            taskId,
                            sla,
                            score,
                            stolen,
                            lost,
                            message,
                            status,
                        } in teamTasks"
                        :key="teamTaskID"
                        class="svc-cell"
                        :style="{
                            '--accent': getStatusAccent(status),
                            backgroundColor: getStatusBackground(status),
                        }"
                    >
                        <div class="svc-top">
                            <span class="status-chip">
                                {{ statusesNames[status] || 'CHƯA CHẤM' }}
                            </span>
                            <span class="svc-tools">
                                <button
                                    v-if="admin"
                                    class="icon-btn"
                                    title="Lịch sử checker"
                                    @click="
                                        $emit(
                                            'openTeamTaskHistory',
                                            teamId,
                                            taskId
                                        )
                                    "
                                >
                                    <i class="fas fa-history" />
                                </button>
                                <button
                                    v-if="message"
                                    class="icon-btn info"
                                    title="Thông báo của checker"
                                >
                                    <i class="fas fa-info-circle" />
                                    <span class="tooltip">{{ message }}</span>
                                </button>
                            </span>
                        </div>

                        <div class="metric">
                            <span class="metric-label">SLA</span>
                            <span class="metric-value">
                                {{ sla.toFixed(2) }}%
                            </span>
                        </div>
                        <div
                            class="sla-bar"
                            role="img"
                            :aria-label="`SLA ${sla.toFixed(0)}%`"
                        >
                            <i :style="{ width: `${clamp(sla)}%` }" />
                        </div>

                        <div class="metric">
                            <span class="metric-label">Điểm</span>
                            <span class="metric-value">{{ money(score) }}</span>
                        </div>

                        <div class="flags" title="Flag cướp được / Flag bị mất">
                            <span class="flag-stolen">+{{ int(stolen) }}</span>
                            <span class="flag-sep">/</span>
                            <span class="flag-lost">−{{ int(lost) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </transition-group>
    </div>
</template>

<script>
import { getRankColor, getStatusAccent, getStatusBackground } from '@/utils/colors';
import { statusesNames } from '@/config';
import '@/assets/table.scss';

const moneyFormat = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const intFormat = new Intl.NumberFormat('en-US');

export default {
    props: {
        headRowTitle: {
            type: String,
            default: '#',
        },
        tasks: {
            type: Array,
            required: true,
        },
        teams: {
            type: Array,
            required: true,
        },
        teamClickable: Boolean,
        taskClickable: Boolean,
        admin: Boolean,
    },

    data: function () {
        return {
            statusesNames,
            getRankColor,
            getStatusAccent,
            getStatusBackground,
        };
    },

    methods: {
        money: (value) => moneyFormat.format(Number(value) || 0),
        int: (value) => intFormat.format(Number(value) || 0),
        clamp: (value) => Math.max(0, Math.min(100, Number(value) || 0)),
    },
};
</script>

<style lang="scss" scoped>
/* ----- Hàng đội ----- */
.board-row {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    transition: border-color 0.2s, background 0.2s;

    &:hover {
        border-color: var(--line-strong);
        background: var(--panel-hi);
    }
}

.rank-1 {
    border-color: rgba(255, 204, 51, 0.5);
    background: linear-gradient(90deg, rgba(255, 204, 51, 0.12), var(--panel) 36%);
}

.rank-2 {
    border-color: rgba(207, 216, 222, 0.42);
    background: linear-gradient(90deg, rgba(207, 216, 222, 0.1), var(--panel) 36%);
}

.rank-3 {
    border-color: rgba(217, 144, 74, 0.45);
    background: linear-gradient(90deg, rgba(217, 144, 74, 0.11), var(--panel) 36%);
}

/* ----- Cột hạng ----- */
.rank-badge {
    display: grid;
    place-items: center;
    width: 2.2em;
    height: 2.2em;
    border-radius: 50%;
    background: color-mix(in srgb, var(--rank-color) 18%, transparent);
    border: 1.5px solid var(--rank-color);
    color: var(--rank-color);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

/* ----- Cột đội ----- */
.col-team {
    display: flex;
    flex-flow: column nowrap;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    position: relative;

    &.clickable {
        cursor: pointer;
    }
}

.team-name {
    font-weight: 700;
    font-size: 1.02em;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.col-team.clickable:hover .team-name {
    color: var(--accent-teal);
}

.team-ip {
    font-family: var(--mono);
    font-size: 0.78em;
    color: var(--text-dim);
}

.team-edit {
    position: absolute;
    top: 0;
    right: 0.4em;
    opacity: 0;
}

.board-row:hover .team-edit {
    opacity: 1;
}

/* ----- Cột điểm ----- */
.score-value {
    font-family: var(--mono);
    font-size: 1.35em;
    font-weight: 700;
    color: var(--accent-teal);
    font-variant-numeric: tabular-nums;
}

/* ----- Ô dịch vụ ----- */
.svc-cell {
    position: relative;
    display: flex;
    flex-flow: column nowrap;
    gap: 3px;
    padding: 9px 11px 10px;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-left: 3px solid var(--accent);
}

.svc-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 1px;
}

.status-chip {
    font-size: 0.68em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    white-space: nowrap;
}

.svc-tools {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
}

.svc-cell:hover .svc-tools,
.svc-tools:focus-within {
    opacity: 1;
}

.metric {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.82em;
}

.metric-label {
    color: var(--text-dim);
    letter-spacing: 0.04em;
}

.metric-value {
    font-family: var(--mono);
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
}

.sla-bar {
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.11);
    overflow: hidden;

    i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        transition: width 0.6s ease;
    }
}

.flags {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-family: var(--mono);
    font-size: 0.8em;
    font-variant-numeric: tabular-nums;
}

.flag-stolen {
    color: #6fe3a8;
    font-weight: 600;
}

.flag-lost {
    color: #ff8f99;
    font-weight: 600;
}

.flag-sep {
    color: var(--text-dim);
}

/* ----- Chú giải trên ô ----- */
.tooltip {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    z-index: 30;
    width: 22em;
    max-width: 60vw;
    padding: 10px 12px;
    border-radius: 8px;
    background: #05121a;
    border: 1px solid var(--line-strong);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.5;
    text-align: left;
    overflow-wrap: anywhere;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s;
}

.info:hover .tooltip,
.info:focus-visible .tooltip {
    opacity: 1;
    visibility: visible;
}

/* ----- Hiệu ứng đổi hạng ----- */
.teams-list-move {
    transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.highlighted {
    border-color: var(--accent-teal);
    box-shadow: 0 0 0 1px var(--accent-teal), 0 0 22px rgba(110, 240, 190, 0.22);
}

@media (prefers-reduced-motion: reduce) {
    .teams-list-move,
    .sla-bar i {
        transition: none;
    }
}
</style>
