<template>
    <div class="legend">
        <span class="legend-title">Trạng thái dịch vụ</span>
        <div class="legend-items">
            <span
                v-for="status in statuses"
                :key="status"
                class="legend-chip"
                :style="{
                    '--accent': getStatusAccent(status),
                    backgroundColor: getStatusBackground(status),
                }"
            >
                <i class="dot" />
                {{ statusesNames[status] }}
            </span>
        </div>
    </div>
</template>

<script>
import { statuses, statusesNames } from '@/config';
import { getStatusAccent, getStatusBackground } from '@/utils/colors';

export default {
    data: function () {
        return {
            statuses,
            statusesNames,
            getStatusAccent,
            getStatusBackground,
        };
    },
};
</script>

<style lang="scss" scoped>
.legend {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin: 0 0 18px;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg-soft);
}

.legend-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
}

.legend-items {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.legend-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 13px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    white-space: nowrap;
}

.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 7px var(--accent);
}
</style>
