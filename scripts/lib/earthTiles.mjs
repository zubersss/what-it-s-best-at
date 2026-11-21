// Earth's streamed elevation in Node: the tile worker's own path (a mosaic of 4 x 4 tiles
// round a place, bad cells mended, the sea's bed, rivers and lakes) for scripts that check
// or survey the ground without a browser (lakes-check, find-vista).
// Tiles come from the test mirror's cache (/root/mapcache/ext, or EXT_CACHE), fetched with
// curl on a miss (needs s3.amazonaws.com). The water map is a JPEG: it is turned into
// plain bytes once with python3 and Pillow.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hydrology, packWater, seaBed, despike } from '../../src/terrain/tiles/hydrology.js';
import { createHeightSource } from '../../src/terrain/height/heightSource.js';
import earth from '../../src/worlds/earth.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = process.env.EXT_CACHE || '/root/mapcache/ext';
const HOST = 's3.amazonaws.com/elevation-tiles-prod/terrarium';
export const TILE = 256, N = 4, RAD = 180 / Math.PI;

function png(file) {
  const b = fs.readFileSync(file); let p = 8, w = 0, h = 0, ct = 0; const idat = []; let plte = null;
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
  return out;
}

function tileFile(z, x, y) {
  const f = `${EXT}/${HOST}/${z}/${x}/${y}.png`;
  if (!fs.existsSync(f) || fs.statSync(f).size === 0) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    execFileSync('curl', ['-sf', '--max-time', '60', '--retry', '2', '-o', f, `https://${HOST}/${z}/${x}/${y}.png`]);
  }
  return f;
}

const rain = new Uint8Array(fs.readFileSync(REPO + '/public/data/earth_rain_720.u8'));
function waterMap() {
  const f = `${EXT}/earth_water_2048.u8`;
  if (!fs.existsSync(f)) {
    fs.mkdirSync(EXT, { recursive: true });
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("L")\nassert im.size == (2048, 1024)\nopen(sys.argv[2], "wb").write(im.tobytes())', REPO + '/public/' + earth.terrain.tiles.hydrology.water, f]);
  }
  return fs.readFileSync(f);
}
const seen = waterMap();

// The tile worker's elevation path for a mosaic of N x N tiles round a place.
export function mosaic(zoom, lat, lon, minFlow) {
  const n = 2 ** zoom, W = N * TILE;
  const fx = (lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(Math.PI / 4 + lat / RAD / 2)) / Math.PI) / 2 * n;
  const tx = Math.round(fx) - N / 2, ty = Math.round(fy) - N / 2, h = new Int16Array(W * W);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = png(tileFile(zoom, ((tx + i) % n + n) % n, ty + j));
    for (let y = 0; y < TILE; y++) for (let x = 0, o = (j * TILE + y) * W + i * TILE, q = y * TILE * 3; x < TILE; x++, q += 3) { const v = d[q] * 256 + d[q + 1] + d[q + 2] / 256 - 32768; h[o + x] = v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v); }
  }
  const latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + y / TILE) / n))) * RAD, lonOf = (x) => (tx + x / TILE) / n * 360 - 180;
  const cell = 40075016 / (TILE * n) * Math.cos(latOf(W / 2) / RAD);
  despike(h, W, cell);
  seaBed(h, W, cell);
  const raw = h.slice();
  const res = hydrology(h, W, cell, (x, y) => { const v = rain[Math.min(359, Math.max(0, Math.floor((90 - latOf(y)) * 2))) * 720 + ((Math.floor((lonOf(x) + 180) * 2) % 720) + 720) % 720] / 3.2; return v * v; }, {
    minFlow, lat: latOf,
    water: (x, y) => seen[Math.min(1023, Math.max(0, Math.floor((90 - latOf(y)) / 180 * 1024))) * 2048 + ((Math.floor((lonOf(x) + 180) / 360 * 2048) % 2048) + 2048) % 2048],
  });
  const lake = res.lake.slice(), packed = packWater(res, h);
  return { zoom, tx, ty, W, cell, h, raw, lake, res, packed, latOf, lonOf, px: (lo) => ((lo + 180) / 360 * n - tx) * TILE, py: (la) => ((1 - Math.log(Math.tan(Math.PI / 4 + la / RAD / 2)) / Math.PI) / 2 * n - ty) * TILE };
}


// The game's height code with a mosaic as its one ring (layers: Earth's own, or only the
// map and the sea).
export function heightSource(m, layers = true) {
  const bundled = new Int16Array(fs.readFileSync(REPO + '/public/data/earth_dem_4ppd.i16').buffer.slice(0));
  const hs = createHeightSource({ radius: earth.radius, terrain: { ...earth.terrain, layers: layers ? earth.terrain.layers : [{ op: 'dem' }, { op: 'sea', level: 0 }] } }, [{ data: bundled, width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true }]);
  hs.setRing(0, { data: m.h, width: m.W, height: m.W, zoom: m.zoom, tx: m.tx, ty: m.ty, water: m.packed });
  return hs;
}
