<template>
    <div class="topbar">
        <div class="progress" :style="{ width: `${roundProgress}%` }" />
        <div class="topbar-inner">
            <div class="brand">
                <span class="brand-mark">MEKODATACTF</span>
                <span class="brand-sub">Attack &amp; Defense · Scoreboard</span>
            </div>
            <div class="topbar-right">
                <div class="tick">
                    <span class="tick-label">Tick tổng</span>
                    <span class="tick-value">{{ round }}</span>
                </div>
                <router-link class="live-link" to="/live/">
                    <i class="fas fa-bolt" /> Live
                </router-link>
            </div>
        </div>
    </div>
</template>

<script>
import { mapState } from 'vuex';

export default {
    beforeRouteLeave: function (to, from, next) {
        clearInterval(this.timer);
        next();
    },
    data: function () {
        return {
            timer: null,
        };
    },

    computed: mapState(['round', 'roundProgress']),

    created: async function () {
        await this.$store.dispatch('fetchRoundTime');
        this.timer = setInterval(
            () => this.$store.dispatch('calculateRoundProgress'),
            500
        );
    },
};
</script>

<style lang="scss" scoped>
.topbar {
    position: relative;
    background: var(--bg-soft);
    border-bottom: 1px solid var(--line);
    overflow: hidden;
}

/* Thanh tiến độ tick chạy nền phía sau nội dung */
.progress {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(
        90deg,
        rgba(110, 240, 190, 0.16),
        rgba(110, 240, 190, 0.06)
    );
    border-right: 2px solid rgba(110, 240, 190, 0.55);
    transition: width 0.5s linear;
}

.topbar-inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 2.5rem;
}

.brand {
    display: flex;
    flex-flow: column nowrap;
    line-height: 1.2;
}

.brand-mark {
    font-weight: 800;
    font-size: 1.02rem;
    letter-spacing: 0.16em;
    color: var(--text);
}

.brand-sub {
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
}

.topbar-right {
    display: flex;
    align-items: center;
    gap: 14px;
}

.tick {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: rgba(10, 22, 32, 0.6);
}

.tick-label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
}

.tick-value {
    font-family: var(--mono);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--accent-teal);
    font-variant-numeric: tabular-nums;
}

.live-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 15px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    color: var(--text);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 600;

    &:hover {
        border-color: var(--accent-teal);
        color: var(--accent-teal);
    }
}

@media (prefers-reduced-motion: reduce) {
    .progress {
        transition: none;
    }
}
</style>
