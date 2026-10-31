// Dựng ảnh nền World Arena từ views/partials/map-terrain.ejs:
//   public/images/map/terrain-{1280,1920,2560,3840}.jpg  — nền biển + địa hình (tới 4K)
//   public/images/map/sea-mask.png                       — mặt nạ vùng biển cho sóng/lấp lánh động
// Chạy lại khi đổi hình học trong config/arenaMap.js:  npm run bake:map
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { Resvg } = require('@resvg/resvg-js');
const jpeg = require('jpeg-js');
const m = require('../config/arenaMap');

const template = path.join(__dirname, '..', 'views', 'partials', 'map-terrain.ejs');
const outDir = path.join(__dirname, '..', 'public', 'images', 'map');
const WIDTHS = process.env.BAKE_WIDTHS ? process.env.BAKE_WIDTHS.split(',').map(Number) : [1280, 1920, 2560, 3840];

function render(mode, width) {
  const svg = ejs.render(fs.readFileSync(template, 'utf8'), { m, mode }, { filename: template });
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: mode === 'terrain' ? '#1a7bb2' : undefined }).render();
  return image;
}

fs.mkdirSync(outDir, { recursive: true });
for (const width of WIDTHS) {
  const started = Date.now();
  const image = render('terrain', width);
  const data = jpeg.encode({ data: image.pixels, width: image.width, height: image.height }, width >= 2560 ? 84 : 88).data;
  const file = path.join(outDir, `terrain-${width}.jpg`);
  fs.writeFileSync(file, data);
  console.log(`${path.relative(process.cwd(), file)}  ${image.width}×${image.height}  ${(data.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);
}
const mask = render('seamask', 800).asPng();
fs.writeFileSync(path.join(outDir, 'sea-mask.png'), mask);
console.log(`public/images/map/sea-mask.png  ${(mask.length / 1024).toFixed(0)} KB`);
