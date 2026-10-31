<template>
    <div v-if="error !== null" class="board-empty">
        {{ error }}
    </div>
    <div
        v-else-if="team !== null"
        class="board board--history"
        :style="{ '--service-count': tasks.length }"
        :class="{ 'board--dense': tasks.length > 4 }"
    >
        <div class="board-head">
            <div class="col-team">Đội</div>
            <div class="col-score">Điểm</div>
            <div class="col-services">
                <div v-for="{ name } in tasks" :key="name" class="svc-head">
                    <span class="svc-head-name">{{ name }}</span>
                </div>
            </div>
        </div>

        <div class="board-body">
            <div v-for="(state, index) in states" :key="index" class="board-row">
                <div class="col-team">
                    <span class="team-name">{{ team.name }}</span>
                    <span class="team-ip">{{ team.ip }}</span>
                </div>
                <div class="col-score">
                    <span class="score-value">{{ money(state.score) }}</span>
                </div>
                <div class="col-services">
                    <div
                        v-for="(
                            { sla, score, stolen, lost, message, status }, i
                        ) in state.tasks"
                        :key="i"
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
                            <button v-if="message" class="icon-btn info">
                                <i class="fas fa-info-circle" />
                                <span class="tooltip">{{ message }}</span>
                            </button>
                        </div>
                        <div class="metric">
                            <span class="metric-label">SLA</span>
                            <span class="metric-value">
                                {{ sla.toFixed(2) }}%
                            </span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Điểm</span>
                            <span class="metric-value">{{ money(score) }}</span>
                        </div>
                        <div class="flags">
                            <span class="flag-stolen">+{{ stolen }}</span>
                            <span class="flag-sep">/</span>
                            <span class="flag-lost">−{{ lost }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { getStatusAccent, getStatusBackground } from '@/utils/colors';
import { statusesNames } from '@/config';
import Task from '@/models/task';
import TeamTask from '@/models/teamTask';
import '@/assets/table.scss';

const moneyFormat = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export default {
    data: function () {
        return {
            error: null,
            team: null,
            teamId: null,
            tasks: null,
            round: 0,
            by_task: [],
            // Khai báo sẵn để Vue theo dõi được (trước đây chỉ gán trong created).
            states: [],
            statusesNames,
            getStatusAccent,
            getStatusBackground,
        };
    },

    created: async function () {
        this.teamId = this.$route.params.id;
        try {
            const { data: teams } = await this.$http.get('/client/teams/');
            const { data: tasks } = await this.$http.get('/client/tasks/');
            let { data: states } = await this.$http.get(
                `/client/teams/${this.teamId}/`
            );
            this.team = teams.filter(({ id }) => id == this.teamId)[0];
            this.tasks = tasks.map((task) => new Task(task)).sort(Task.comp);

            this.round = states.reduce(
                (acc, { round }) => Math.max(acc, round),
                0
            );

            this.$store.commit('setRound', this.round);

            states = states.map((x) => ({
                id: Number(x.id),
                round: Number(x.round),
                task_id: Number(x.task_id),
                team_id: Number(x.team_id),
                status: x.status,
                stolen: x.stolen,
                lost: x.lost,
                score: Number(x.score),
                checks: Number(x.checks),
                checks_passed: Number(x.checks_passed),
                timestamp_secs: Number(
                    x.timestamp.slice(0, x.timestamp.indexOf('-'))
                ),
                timestamp_num: Number(
                    x.timestamp.slice(x.timestamp.indexOf('-') + 1)
                ),
                message: x.message,
            }));

            states = states.sort(
                (
                    { timestamp_secs: tss1, timestamp_num: tsn1 },
                    { timestamp_secs: tss2, timestamp_num: tsn2 }
                ) => {
                    if (tss1 === tss2) {
                        return tsn2 - tsn1;
                    }
                    return tss2 - tss1;
                }
            );

            states = states.map((state) => new TeamTask(state));
            this.by_task = {};
            for (const state of states) {
                let key = state.taskId - 1;
                if (!this.by_task[key]) {
                    this.by_task[key] = [];
                }
                this.by_task[key].push(state);
            }
            this.by_task = Object.values(this.by_task);
            let row_count = Math.min(...this.by_task.map((x) => x.length));

            this.states = [];
            for (let i = 0; i < row_count; i += 1) {
                this.states.push({
                    tasks: this.by_task.map((x) => x[i]),
                    score: this.by_task
                        .map((x) => x[i])
                        .reduce((acc, { score }) => acc + score, 0),
                });
            }
        } catch (e) {
            this.error = "Can't connect to server";
        }
    },

    methods: {
        money: (value) => moneyFormat.format(Number(value) || 0),
    },
};
</script>

<style lang="scss" scoped>
/* Lịch sử theo tick: bỏ cột hạng so với bảng xếp hạng chính. */
.board--history {
    --grid: minmax(12rem, 1fr) 8rem minmax(0, calc(var(--service-count) * 13rem));
}

.board--history.board--dense {
    --grid: minmax(10rem, 1fr) 7rem minmax(0, calc(var(--service-count) * 10rem));
}

.board-row {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
}

.col-team {
    display: flex;
    flex-flow: column nowrap;
    justify-content: center;
    gap: 2px;
    min-width: 0;
}

.team-name {
    font-weight: 700;
    color: var(--text);
}

.team-ip {
    font-family: var(--mono);
    font-size: 0.78em;
    color: var(--text-dim);
}

.score-value {
    font-family: var(--mono);
    font-size: 1.2em;
    font-weight: 700;
    color: var(--accent-teal);
    font-variant-numeric: tabular-nums;
}

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
}

.status-chip {
    font-size: 0.68em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    white-space: nowrap;
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
}

.metric-value {
    font-family: var(--mono);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.flags {
    display: flex;
    gap: 5px;
    font-family: var(--mono);
    font-size: 0.8em;
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
}

.info:hover .tooltip,
.info:focus-visible .tooltip {
    opacity: 1;
    visibility: visible;
}
</style>
