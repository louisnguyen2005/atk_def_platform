import {
    statusTheme,
    defaultStatusTheme,
    topTeamColors,
    defaultTeamColor,
} from '@/config';

// Màu huy hiệu hạng: vàng / bạc / đồng cho top 3, còn lại dùng màu trung tính.
function getRankColor(index) {
    return index < topTeamColors.length
        ? topTeamColors[index]
        : defaultTeamColor;
}

function getStatusTheme(status) {
    return statusTheme[status] || defaultStatusTheme;
}

function getStatusAccent(status) {
    return getStatusTheme(status).accent;
}

function getStatusBackground(status) {
    return getStatusTheme(status).bg;
}

export { getRankColor, getStatusTheme, getStatusAccent, getStatusBackground };
