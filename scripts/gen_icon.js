// 生成简约App图标：海洋蓝圆角底 + 白色简约鱼剪影 + 负空间眼睛
// 造型参考 emoji 🐟：圆胖侧身、叉形尾、背鳍/腹鳍、朝右游动
// 4x 超采样抗锯齿，输出 tray.png (64x64)
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const N = 64;
const SS = 4;                       // 超采样倍率
const BG = [18, 135, 200];          // 海洋蓝 #1287C8
const WHITE = [255, 255, 255];

function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  const dx = x - cx, dy = y - cy;
  if ((x < x0 + r || x > x0 + w - r) && (y < y0 + r || y > y0 + h - r)) {
    return dx * dx + dy * dy <= r * r;
  }
  return true;
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// 🐟 风格：圆胖椭圆身体 + 左侧叉形尾 + 上背鳍 + 下腹鳍，整体朝右
const TAIL  = [[21, 32], [6, 17], [11, 32], [6, 47]]; // 凹口叉尾，尖端与身体重叠
const DORSAL = [[27, 24], [35, 13], [46, 23]];        // 背鳍：收短，避免太尖
const VENTRAL = [[28, 40], [35, 51], [43, 40]];       // 腹鳍：收短
function inFish(x, y) {
  if (inEllipse(x, y, 34, 32, 17, 12.5)) return true;
  if (inPoly(x, y, TAIL)) return true;
  if (inPoly(x, y, DORSAL)) return true;
  if (inPoly(x, y, VENTRAL)) return true;
  return false;
}
// 负空间眼睛：位于头部上方，小尺寸依然是一个清晰的绿点
function inEye(x, y) {
  return inEllipse(x, y, 46, 29, 2.3, 2.3);
}

const rowBytes = N * 4;
const raw = Buffer.alloc((rowBytes + 1) * N);
for (let py = 0; py < N; py++) {
  raw[py * (rowBytes + 1)] = 0;
  for (let px = 0; px < N; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
      if (!inRoundRect(x, y, 0, 0, N - 1, N - 1, 14)) continue;
      let col = BG;
      if (inFish(x, y)) col = WHITE;
      if (inFish(x, y) && inEye(x, y)) col = BG;   // 负空间眼睛
      r += col[0]; g += col[1]; b += col[2]; a += 255;
    }
    const n = SS * SS;
    const o = py * (rowBytes + 1) + 1 + px * 4;
    raw[o] = Math.round(r / n);
    raw[o + 1] = Math.round(g / n);
    raw[o + 2] = Math.round(b / n);
    raw[o + 3] = Math.round(a / n);
  }
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(ROOT, 'tray.png'), png);
console.log('tray.png 生成成功，字节数:', png.length, '尺寸:', N + 'x' + N);

// ---- 打包用：按同一套矢量逻辑生成多尺寸图标，封装为 Windows ICO（PNG 压缩） ----
// 逻辑坐标固定 64x64，按输出尺寸等比放大；每个像素做 2x2 子采样抗锯齿。
function makeIconPng(size) {
  const scale = size / 64;
  const sub = 2;
  const rowBytes = size * 4;
  const buf = Buffer.alloc((rowBytes + 1) * size);
  for (let py = 0; py < size; py++) {
    buf[py * (rowBytes + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) {
        const x = (px + (sx + 0.5) / sub) / scale;
        const y = (py + (sy + 0.5) / sub) / scale;
        if (!inRoundRect(x, y, 0, 0, 63, 63, 14)) continue;
        let col = BG;
        if (inFish(x, y)) col = WHITE;
        if (inFish(x, y) && inEye(x, y)) col = BG;
        r += col[0]; g += col[1]; b += col[2]; a += 255; n++;
      }
      const o = py * (rowBytes + 1) + 1 + px * 4;
      buf[o] = n ? Math.round(r / n) : 0;
      buf[o + 1] = n ? Math.round(g / n) : 0;
      buf[o + 2] = n ? Math.round(b / n) : 0;
      buf[o + 3] = n ? Math.round(a / n) : 0;
    }
  }
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(size, 0); hdr.writeUInt32BE(size, 4);
  hdr[8] = 8; hdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', hdr), chunk('IDAT', zlib.deflateSync(buf)), chunk('IEND', Buffer.alloc(0))]);
}
const SIZES = [16, 32, 48, 64, 128, 256];
const images = SIZES.map(makeIconPng);
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(SIZES.length, 4);
let offset = 6 + 16 * SIZES.length;
const entries = SIZES.map((size, i) => {
  const e = Buffer.alloc(16);
  e[0] = size >= 256 ? 0 : size;
  e[1] = size >= 256 ? 0 : size;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
const ico = Buffer.concat([dir, ...entries, ...images]);
const buildDir = path.join(ROOT, 'build');
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(buildDir, 'icon.png'), images[images.length - 1]);
console.log('build/icon.ico 生成成功，字节数:', ico.length, '尺寸:', SIZES.join('/'));
