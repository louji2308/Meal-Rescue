// Generates solid-color 160x160 placeholder PNGs for the onboarding cuisine
// step. Pure Node (no deps): zlib deflate + hand-rolled CRC32.
//
// Usage:  node scripts/gen-cuisine-placeholders.js [--size 160] [outDir]
// Default outDir: scripts/../assets/cuisines relative to this repo layout.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COLORS = {
  italian: 'C0392B',
  indian: 'E67E22',
  mexican: '27AE60',
  east_asian: '8E44AD',
  mediterranean: '2980B9',
  american: 'F39C12',
  middle_eastern: '16A085',
  african: 'D35400',
  caribbean: '2ECC71',
  thai: 'E91E63',
};

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size, hex) {
  const [r, g, b] = [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const scanlines = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 3);
    scanlines[row] = 0; // filter type none
    for (let x = 0; x < size; x += 1) {
      const p = row + 1 + x * 3;
      scanlines[p] = r;
      scanlines[p + 1] = g;
      scanlines[p + 2] = b;
    }
  }
  const idat = zlib.deflateSync(scanlines);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const args = process.argv.slice(2);
const sizeArg = args.find((a) => a.startsWith('--size='));
const size = sizeArg ? parseInt(sizeArg.split('=')[1], 10) : 160;
const explicitOut = args.find((a) => !a.startsWith('--'));
const outDir = clearPath(explicitOut) || path.resolve(__dirname, '..', 'assets', 'cuisines');

function clearPath(p) {
  return p && p.trim().length > 0 ? p.trim() : undefined;
}

fs.mkdirSync(outDir, { recursive: true });
for (const [family, hex] of Object.entries(COLORS)) {
  const file = path.join(outDir, `${family}.png`);
  fs.writeFileSync(file, makePng(size, hex));
  console.log(`wrote ${file} (${size}x${size})`);
}