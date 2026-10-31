<template>
    <error-box :error="error">
        <div>
            <div class="log-head">
                <p class="log-kicker">Lịch sử checker</p>
                <h1 class="log-title">
                    {{ teamName }}
                    <span class="log-sep">·</span>
                    {{ taskName }}
                </h1>
                <p class="log-sub">
                    team #{{ teamId }} · task #{{ taskId }}
                </p>
            </div>

            <div class="log-wrap">
                <table class="log">
                    <thead>
                        <tr>
                            <th class="c-num">Tick</th>
                            <th>Trạng thái</th>
                            <th class="c-num">Điểm</th>
                            <th class="c-num">Flag</th>
                            <th class="c-num">Checks</th>
                            <th>Thông báo công khai</th>
                            <th>Thông báo nội bộ</th>
                            <th>Lệnh</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="tt in teamtasks" :key="tt.id">
                            <td class="c-num mono">{{ tt.round }}</td>
                            <td>
                                <span
                                    class="status-chip"
                                    :style="{
                                        '--accent': getStatusAccent(tt.status),
                                        backgroundColor: getStatusBackground(
                                            tt.status
                                        ),
                                    }"
                                >
                                    {{ statusesNames[tt.status] || tt.status }}
                                </span>
                            </td>
                            <td class="c-num mono">{{ tt.score }}</td>
                            <td class="c-num mono flags">
                                <span class="flag-stolen">+{{ tt.stolen }}</span>
                                <span class="flag-sep">/</span>
                                <span class="flag-lost">−{{ tt.lost }}</span>
                            </td>
                            <td class="c-num mono">
                                {{ tt.checks_passed }}/{{ tt.checks }}
                            </td>
                            <td class="c-msg">{{ tt.public_message }}</td>
                            <td class="c-msg">{{ tt.private_message }}</td>
                            <td class="c-msg mono">{{ tt.command }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </error-box>
</template>

<script>
import { getStatusAccent, getStatusBackground } from '@/utils/colors';
import { statusesNames } from '@/config';
import ErrorBox from '@/components/Lib/ErrorBox.vue';
import '@/assets/table.scss';

export default {
    components: {
        ErrorBox,
    },

    data: function () {
        return {
            error: null,
            taskId: null,
            teamId: null,
            teamtasks: null,
            teamName: null,
            taskName: null,

            statusesNames,
            getStatusAccent,
            getStatusBackground,
        };
    },

    created: async function () {
        try {
            this.taskId = this.$route.params.taskId;
            this.teamId = this.$route.params.teamId;
            let r = await this.$http.get('/admin/teamtasks/', {
                params: { team_id: this.teamId, task_id: this.taskId },
            });
            this.teamtasks = r.data;

            const {
                data: { name: teamName },
            } = await this.$http.get(`/admin/teams/${this.teamId}/`);
            this.teamName = teamName;

            const {
                data: { name: taskName },
            } = await this.$http.get(`/admin/tasks/${this.taskId}/`);
            this.taskName = taskName;
        } catch (e) {
            console.error(e);
            this.error = 'Error occured while fetching data.';
        }
    },

    methods: {
        openTeam: function (id) {
            this.$router.push({ name: 'team', params: { id } }).catch(() => {});
        },
    },
};
</script>

<style lang="scss" scoped>
.log-head {
    margin-bottom: 18px;
}

.log-kicker {
    margin: 0 0 2px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-teal);
}

.log-title {
    margin: 0;
    font-size: 1.55rem;
    font-weight: 700;
    color: var(--text);
}

.log-sep {
    color: var(--text-dim);
    margin: 0 4px;
}

.log-sub {
    margin: 2px 0 0;
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--text-dim);
}

.log-wrap {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    overflow: auto;
    max-height: 72vh;
}

.log {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.86rem;
}

.log thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 11px 14px;
    background: var(--bg-soft);
    border-bottom: 1px solid var(--line-strong);
    color: var(--text-dim);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
}

.log tbody td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
}

.log tbody tr:last-child td {
    border-bottom: 0;
}

.log tbody tr:hover {
    background: var(--panel-hi);
}

.c-num {
    text-align: right;
    white-space: nowrap;
}

.mono {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
}

.c-msg {
    max-width: 22rem;
    color: var(--text-dim);
    overflow-wrap: anywhere;
}

.status-chip {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    white-space: nowrap;
}

.flags {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
}

.flag-stolen {
    color: #6fe3a8;
}

.flag-lost {
    color: #ff8f99;
}

.flag-sep {
    color: var(--text-dim);
}
</style>
