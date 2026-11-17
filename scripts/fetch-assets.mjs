// Downloads the public-domain source data and converts it into the small binary files
// in public/data/. See docs/ASSETS.md for sources and licences.
//
//   node scripts/fetch-assets.mjs [--cache <dir>]
//
// Originals are cached in .cache/assets (git-ignored) so re-runs do not re-download.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cacheDir = argv.includes('--cache') ? argv[argv.indexOf('--cache') + 1] : path.join(root, '.cache/assets');
const outDir = path.join(root, 'public/data');

const MOLA = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x';
const BSC = 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz';

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function fetchCached(name, url, range) {
  const file = path.join(cacheDir, name);
  if (await exists(file)) return readFile(file);
  console.log('downloading', url, range ? `bytes ${range[0]}-${range[1]}` : '');
  const headers = range ? { Range: `bytes=${range[0]}-${range[1]}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (range && buf.length !== range[1] - range[0] + 1) throw new Error(`${url}: short range read`);
  await writeFile(file, buf);
  return buf;
}

// PDS MEGDR images are big-endian int16; we store little-endian int16.
function swap16(buf) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i += 2) { out[i] = buf[i + 1]; out[i + 1] = buf[i]; }
  return out;
}

async function marsGlobal() {
  // 1440 x 720, lon 0..360E left to right, lat +90..-90 top to bottom.
  const src = await fetchCached('megt90n000cb.img', `${MOLA}/meg004/megt90n000cb.img`);
  if (src.length !== 1440 * 720 * 2) throw new Error('unexpected size for megt90n000cb.img');
  await writeFile(path.join(outDir, 'mars_mola_4ppd.i16'), swap16(src));
  console.log('wrote mars_mola_4ppd.i16');
}

async function marsCoprates() {
  // megt00n270hb.img: 128 px/deg, lat 0..-44 (5632 rows), lon 270..360E (11520 cols).
  const PPD = 128, TILE_LON0 = 270, TILE_LAT0 = 0, COLS = 11520;
  const lon0 = 291, lon1 = 302, lat0 = -9.5, lat1 = -16;   // crop (north edge first)
  const c0 = (lon0 - TILE_LON0) * PPD, c1 = (lon1 - TILE_LON0) * PPD;
  const r0 = (TILE_LAT0 - lat0) * PPD, r1 = (TILE_LAT0 - lat1) * PPD;
  const w = c1 - c0, h = r1 - r0;
  const rows = await fetchCached(`megt00n270hb_rows${r0}-${r1 - 1}.img`, `${MOLA}/meg128/megt00n270hb.img`,
    [r0 * COLS * 2, r1 * COLS * 2 - 1]);
  const out = Buffer.allocUnsafe(w * h * 2);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const s = (r * COLS + c0 + c) * 2, d = (r * w + c) * 2;
      out[d] = rows[s + 1]; out[d + 1] = rows[s];
    }
  }
  await writeFile(path.join(outDir, 'mars_mola_coprates_128ppd.i16'), out);
  console.log(`wrote mars_mola_coprates_128ppd.i16 (${w} x ${h})`);
}

async function stars() {
  const gz = await fetchCached('bsc5.dat.gz', BSC);
  const lines = gunzipSync(gz).toString('latin1').split('\n');
  const rec = [];
  for (const l of lines) {
    if (l.length < 107) continue;
    const rah = parseFloat(l.slice(75, 77)), ram = parseFloat(l.slice(77, 79)), ras = parseFloat(l.slice(79, 83));
    const sign = l[83] === '-' ? -1 : 1;
    const ded = parseFloat(l.slice(84, 86)), dem = parseFloat(l.slice(86, 88)), des = parseFloat(l.slice(88, 90));
    const vmag = parseFloat(l.slice(102, 107));
    let bv = parseFloat(l.slice(109, 114));
    if (!isFinite(rah) || !isFinite(vmag)) continue;       // 14 non-stellar placeholders
    if (!isFinite(bv)) bv = 0.6;
    const ra = (rah + ram / 60 + ras / 3600) * 15 * Math.PI / 180;
    const dec = sign * (ded + dem / 60 + des / 3600) * Math.PI / 180;
    rec.push(ra, dec, vmag, bv);
  }
  const f = new Float32Array(rec);
  await writeFile(path.join(outDir, 'stars_bsc5.f32'), Buffer.from(f.buffer));
  console.log(`wrote stars_bsc5.f32 (${rec.length / 4} stars)`);
}

await mkdir(cacheDir, { recursive: true });
await mkdir(outDir, { recursive: true });
await marsGlobal();
await marsCoprates();
await stars();
