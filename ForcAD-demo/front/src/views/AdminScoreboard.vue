<template>
    <div>
        <div class="page-head">
            <div>
                <p class="page-kicker">Bảng điều khiển BTC</p>
                <h1 class="page-title">Bảng điểm quản trị</h1>
            </div>
            <div class="page-actions">
                <button class="btn" @click="createTask">
                    <i class="fas fa-plus" /> Thêm dịch vụ
                </button>
                <button class="btn btn-primary" @click="createTeam">
                    <i class="fas fa-plus" /> Thêm đội
                </button>
            </div>
        </div>
        <statuses />
        <admin-scoreboard />
    </div>
</template>

<script>
import AdminScoreboard from '@/components/Admin/Scoreboard.vue';
import Statuses from '@/components/General/Statuses.vue';

export default {
    components: {
        AdminScoreboard,
        Statuses,
    },

    methods: {
        createTask: async function () {
            this.$router.push({ name: 'createTask' }).catch(() => {});
        },

        createTeam: async function () {
            this.$router.push({ name: 'createTeam' }).catch(() => {});
        },
    },
};
</script>

<style lang="scss" scoped>
.page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 20px;
}

.page-kicker {
    margin: 0 0 2px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-teal);
}

.page-title {
    margin: 0;
    font-size: 1.7rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
}

.page-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}
</style>
