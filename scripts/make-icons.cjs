// Draws the app icon (a barbell with plates in the split colours) as PNGs. Run: node scripts/make-icons.cjs
const fs = require('fs');
const zlib = require('zlib');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#141414'), BAR = hex('#C8C8C8');
const PLATES = ['#4FC3F7', '#A78BFA', '#34D399', '#FB923C'].map(hex);

// Shapes in a 100×100 space, kept inside the maskable safe zone (centre 80%).
const shapes = [
  { x: 18, y: 47.5, w: 64, h: 5, c: BAR, r: 1.5 },
  { x: 22, y: 30, w: 8, h: 40, c: PLATES[0], r: 2 },
  { x: 31, y: 35, w: 6, h: 30, c: PLATES[1], r: 2 },
  { x: 63, y: 35, w: 6, h: 30, c: PLATES[2], r: 2 },
  { x: 70, y: 30, w: 8, h: 40, c: PLATES[3], r: 2 },
];

function inside(px, py, s) {
  const { x, y, w, h, r } = s;
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function render(size) {
  const ss = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const px = ((x + (sx + 0.5) / ss) / size) * 100, py = ((y + (sy + 0.5) / ss) / size) * 100;
          const hit = shapes.findLast((s) => inside(px, py, s));
          const c = hit ? hit.c : BG;
          for (let i = 0; i < 3; i++) acc[i] += c[i];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (ss * ss));
      raw[o + 3] = 255;
    }
  }
  return png(size, raw);
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  fs.writeFileSync(`public/icons/icon-${size}x${size}.png`, render(size));
}
console.log('icons written');
