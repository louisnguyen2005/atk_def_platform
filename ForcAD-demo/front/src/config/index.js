let url = '';

if (import.meta.env.DEV) {
    url = 'http://127.0.0.1:8080';
} else {
    url = window.location.origin;
}

const serverUrl = url;
const apiUrl = `${serverUrl}/api`;

const statuses = [101, 102, 103, 104, 110];

const statusesNames = {
    101: 'UP',
    102: 'CORRUPT',
    103: 'MUMBLE',
    104: 'DOWN',
    110: 'CHECK FAILED',
    '-1': 'OFFLINE',
};

// Bảng màu trạng thái cho nền tối: `accent` là màu nhận diện (viền, nhãn, chữ),
// `bg` là nền ô đã pha loãng để chữ trắng vẫn đọc rõ.
const statusTheme = {
    101: { accent: '#3ddc84', bg: 'rgba(61, 220, 132, 0.14)' },
    102: { accent: '#56a8ff', bg: 'rgba(86, 168, 255, 0.15)' },
    103: { accent: '#ffa63d', bg: 'rgba(255, 166, 61, 0.15)' },
    104: { accent: '#ff6470', bg: 'rgba(255, 100, 112, 0.17)' },
    110: { accent: '#ffd34d', bg: 'rgba(255, 211, 77, 0.15)' },
    '-1': { accent: '#b08bff', bg: 'rgba(176, 139, 255, 0.15)' },
};

const defaultStatusTheme = { accent: '#5d7585', bg: 'rgba(93, 117, 133, 0.12)' };

// Huy hiệu hạng 1–3; các hạng còn lại dùng màu trung tính.
const topTeamColors = ['#ffcc33', '#cfd8de', '#d9904a'];
const defaultTeamColor = '#4d6575';

export {
    serverUrl,
    apiUrl,
    statusesNames,
    statuses,
    topTeamColors,
    defaultTeamColor,
    statusTheme,
    defaultStatusTheme,
};
