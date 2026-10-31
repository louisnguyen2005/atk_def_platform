// Hình học bản đồ World Arena (toạ độ viewBox 1600×1000).
// Dùng chung cho: scripts/bake-map.js (dựng ảnh nền 4K) và views/scoreboard.ejs (lớp phủ động).
const W = 1600;
const H = 1000;

// Hai lục địa chính.
const LAND_W = 'M90 70C180 30 330 40 420 70C500 95 560 150 545 230C530 300 470 330 480 400C492 470 560 500 555 580C550 660 480 700 470 770C460 840 520 900 470 950C400 990 250 985 170 960C100 935 70 880 95 820C120 760 60 720 70 650C80 580 140 560 120 490C100 420 50 380 60 300C70 220 40 140 90 70Z';
const LAND_E = 'M640 300C700 230 820 250 900 230C980 210 1030 160 1120 170C1200 180 1230 230 1310 220C1400 205 1470 160 1530 210C1580 255 1560 330 1540 390C1520 460 1570 520 1545 600C1520 680 1440 700 1380 760C1320 820 1220 850 1140 820C1060 790 1000 840 920 830C840 820 780 760 720 740C660 720 610 660 620 590C630 520 690 480 670 420C650 360 600 350 640 300Z';

// [cx, cy, rx, ry, seed]
const ISLANDS = [[925, 110, 46, 26, 2], [1035, 66, 22, 14, 4], [600, 905, 52, 30, 6], [1490, 885, 60, 32, 8], [700, 70, 18, 12, 10], [1580, 260, 24, 40, 12], [1225, 925, 20, 11, 14], [40, 520, 16, 26, 16]];
const FORESTS = [[340, 420, 52, 34, 3], [380, 805, 46, 30, 5], [1305, 515, 48, 30, 7], [905, 765, 56, 30, 9], [705, 545, 34, 44, 11], [520, 470, 22, 40, 13], [150, 180, 40, 26, 15], [1440, 300, 34, 22, 17]];
// Mỗi dãy núi: danh sách [x, y, tỉ lệ].
const RANGES = [
  [[110, 320, 1], [138, 300, 1.25], [168, 326, .95], [96, 344, .8]],
  [[100, 650, .9], [126, 628, 1.2], [154, 656, .95]],
  [[1070, 450, 1], [1098, 430, 1.3], [1126, 456, 1], [1150, 440, .8]],
  [[1290, 262, .9], [1316, 244, 1.15], [1342, 266, .9]],
  [[880, 505, .9], [906, 486, 1.15], [932, 510, .85]],
  [[470, 120, .8], [494, 104, 1], [518, 124, .75]],
];
const RIVERS = ['M545 600C500 610 470 640 440 690', 'M1110 592C1090 650 1080 720 1060 822', 'M60 300C110 290 160 250 190 210', 'M1540 390C1490 400 1470 440 1430 470', 'M300 960C320 900 300 860 330 820'];
const LAKE = [1110, 560, 66, 30, 21];
const SUN = [1580, -40];

// Vị trí vùng đất của các đội. Bốn vị trí đầu trải đều hai lục địa; các vị trí sau dành cho khi mở rộng.
const SLOTS = [[260, 190], [1180, 320], [300, 720], [1250, 620], [800, 380], [1430, 420], [230, 450], [1000, 660],
  [420, 300], [1400, 690], [420, 560], [980, 320], [800, 620], [260, 880], [1120, 760], [1500, 560]];
const LANDS = ['Frostfang', 'Emberwood', 'Sunspire', 'Mosswater', 'Ironcliff', 'Coral Reach', 'Ashen Vale', 'Stormwatch',
  'Glimmer Bay', 'Thornfield', 'Obsidian Peak', 'Driftmoor', 'Saltmarsh', 'Skyforge', 'Willowmere', 'Duskhaven'];

// Đường cong khép kín mềm quanh tâm (Catmull-Rom → Bézier), độ gồ ghề cố định theo seed.
function blob(cx, cy, rx, ry, seed, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const r = (((Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1) + 1) % 1;
    const k = 0.78 + 0.32 * r;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const f = v => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// Núi: mặt sáng hướng về mặt trời (góc trên bên phải), có tuyết trên đỉnh.
function mountain(x, y, s) {
  return {
    dark: `M${x - 22 * s} ${y}L${x} ${y - 30 * s}L${x + 3 * s} ${y}Z`,
    light: `M${x} ${y - 30 * s}L${x + 22 * s} ${y}L${x + 3 * s} ${y}Z`,
    snow: `M${x - 7 * s} ${y - 20 * s}L${x} ${y - 30 * s}L${x + 7 * s} ${y - 20 * s}L${x + 3 * s} ${y - 22 * s}L${x} ${y - 19 * s}L${x - 3 * s} ${y - 22 * s}Z`,
  };
}

const islandPaths = () => ISLANDS.map(s => blob(s[0], s[1], s[2], s[3], s[4], 9));

module.exports = { W, H, LAND_W, LAND_E, ISLANDS, FORESTS, RANGES, RIVERS, LAKE, SUN, SLOTS, LANDS, blob, mountain, islandPaths };
