// PNG files written from raw pixels and read back to them, with no dependencies.
// png(): 8 bits a channel; channels: 3 = RGB, 4 = RGBA.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function png(w, h, pixels, channels = 3) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const row = w * channels, raw = Buffer.alloc((row + 1) * h), src = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  for (let y = 0; y < h; y++) { raw[y * (row + 1)] = 0; src.copy(raw, y * (row + 1) + 1, y * row, (y + 1) * row); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Reads a PNG (8 bits a channel; grey, RGB, RGBA or palette, not interlaced) as RGB bytes.
export function readPng(file) { return decode(fs.readFileSync(file)); }

function decode(b) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = []; let plte = null;
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('a PNG this reader does not know'); } else if (type === 'IDAT') idat.push(d); else if (type === 'PLTE') plte = d;
    p += 12 + len;
  }
  const ch = ct === 2 ? 3 : ct === 6 ? 4 : 1, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 3), cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], o = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, bb = prev[x], c = x >= ch ? prev[x - ch] : 0, v = raw[o + x]; let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + bb; else if (f === 3) r = v + ((a + bb) >> 1); else { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c); }
      cur[x] = r & 255;
    }
    for (let x = 0; x < w; x++) { const q = (y * w + x) * 3; if (ct === 3) { const i = cur[x] * 3; out[q] = plte[i]; out[q + 1] = plte[i + 1]; out[q + 2] = plte[i + 2]; } else { out[q] = cur[x * ch]; out[q + 1] = cur[x * ch + 1]; out[q + 2] = cur[x * ch + 2]; } }
    prev.set(cur);
  }
  return { w, h, data: out };
}

// The names the older scripts know these by (peek, probe-terrain, stability).
export const encodePNG = png;
export function decodePNG(buf) { const { w, h, data } = decode(buf); return { width: w, height: h, rgb: data }; }
