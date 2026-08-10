// Generates public/icon-192.png and public/icon-512.png (minimal slate tile
// with a white diamond ring, matching the Dokan Minimalism theme).
// Pure Node built-ins: zlib + hand-rolled PNG chunks. Run: bun scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [15, 23, 42]; // slate-900
const FG = [255, 255, 255]; // white

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function render(size, radius) {
  const center = size / 2;
  const inner = radius * 0.55;
  const px = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    px[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x + 0.5 - center);
      const dy = Math.abs(y + 0.5 - center);
      const inRing = dx + dy <= radius && dx + dy > inner;
      px[p++] = inRing ? FG[0] : BG[0];
      px[p++] = inRing ? FG[1] : BG[1];
      px[p++] = inRing ? FG[2] : BG[2];
      px[p++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(px, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(`public/icon-${size}.png`, png);
  console.log(`public/icon-${size}.png written (${png.length} bytes)`);
}

render(192, 72);
render(512, 190);
