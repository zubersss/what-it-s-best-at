// The tile worker: fetches map tiles (256-pixel Web Mercator tiles, the layout every map
// service uses) and puts them together into square mosaics round a place, off the main
// thread. Two kinds of mosaic:
//   elevation  Int16 metres, from "terrarium" PNG tiles (height = R * 256 + G + B / 256 - 32768)
//   picture    RGBA bytes with their mip maps, from JPEG or PNG tiles as they are
// Messages in:  { type: 'want', id, key, url, kind, zoom, tx, ty, n, ext }   (n x n tiles from column tx, row ty)
// Messages out: { type: 'mosaic', id, key, kind, zoom, tx, ty, n, buffer, mips? } or { type: 'failed', id, key, reason }
// A newer 'want' with the same key replaces an older one that has not finished.
import { hydrology, packWater } from './hydrology.js';

const TILE = 256;
const cache = new Map();          // url -> Promise<{ data, at }> (decoded tiles, a few hundred at most)
const latest = new Map();         // key -> id of the newest request
const MAX_CACHE = 220;
let active = 0; const waiting = [];

function slot() { return active < 6 ? (active++, Promise.resolve()) : new Promise((r) => waiting.push(r)); }
function done() { const next = waiting.shift(); if (next) next(); else active--; }

// One tile's pixels (RGBA bytes), or null when the service has none there (404: open sea
// in some sets) — any other failure rejects.
async function pixels(url) {
  await slot();
  try {
    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      // (a service that does not answer must not hold a mosaic for ever)
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 20000);
      try { res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: stop.signal }); if (res.ok || res.status === 404) break; } catch (e) { if (attempt === 2) throw e; } finally { clearTimeout(timer); }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    if (!res) throw new Error('no answer');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(TILE, TILE), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, TILE, TILE); bmp.close?.();
    return g.getImageData(0, 0, TILE, TILE).data;
  } finally { done(); }
}

function tile(template, ext, z, x, y) {
  const n = 2 ** z, xx = ((x % n) + n) % n;
  let url = template.replace('{z}', z).replace('{x}', xx).replace('{y}', y);
  if (ext) url = ext + '/' + url.replace(/^https?:\/\//, '');           // the test mirror (scripts/lib/browser.mjs)
  let p = cache.get(url);
  if (!p) {
    p = pixels(url).then((data) => ({ data }));
    p.catch(() => cache.delete(url));
    cache.set(url, p);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  } else { cache.delete(url); cache.set(url, p); }
  return p;
}

// Half-size copies of an RGBA picture down to one pixel (colours averaged in linear light
// would be better still; these maps are tints, and plain averages serve).
function mipChain(top, w) {
  const mips = [];
  let src = top, sw = w;
  while (sw > 1) {
    const dw = sw >> 1, dst = new Uint8Array(dw * dw * 4);
    for (let y = 0; y < dw; y++) for (let x = 0; x < dw; x++) {
      const a = (y * 2 * sw + x * 2) * 4, b = a + 4, c = a + sw * 4, d = c + 4, o = (y * dw + x) * 4;
      for (let k = 0; k < 4; k++) dst[o + k] = (src[a + k] + src[b + k] + src[c + k] + src[d + k] + 2) >> 2;
    }
    mips.push(dst); src = dst; sw = dw;
  }
  return mips;
}

// Elevation sets made from radar leave coastal water at exactly zero: no bed, so no
// depth, and nothing to tell sea from a beach. Water pixels (zero or below) get a bed that
// falls away from the land: 2.5 % for the first stretch, then more gently, as deep as the
// set says where it knows better. Distance to land by a two-pass chamfer transform.
function seaBed(h, W, metresPerPixel) {
  const d = new Float32Array(W * W), far = 1e9;
  let wet = 0;
  for (let i = 0; i < W * W; i++) { if (h[i] <= 0) { d[i] = far; wet++; } }
  if (!wet || wet === W * W) { if (wet) for (let i = 0; i < W * W; i++) if (h[i] === 0) h[i] = -30; return; }
  const a = 1, b = 1.41421;
  for (let y = 0; y < W; y++) for (let x = 0, o = y * W; x < W; x++, o++) {
    let v = d[o]; if (v === 0) continue;
    if (x > 0 && d[o - 1] + a < v) v = d[o - 1] + a;
    if (y > 0) { if (d[o - W] + a < v) v = d[o - W] + a; if (x > 0 && d[o - W - 1] + b < v) v = d[o - W - 1] + b; if (x < W - 1 && d[o - W + 1] + b < v) v = d[o - W + 1] + b; }
    d[o] = v;
  }
  for (let y = W - 1; y >= 0; y--) for (let x = W - 1, o = y * W + x; x >= 0; x--, o--) {
    let v = d[o]; if (v === 0) continue;
    if (x < W - 1 && d[o + 1] + a < v) v = d[o + 1] + a;
    if (y < W - 1) { if (d[o + W] + a < v) v = d[o + W] + a; if (x < W - 1 && d[o + W + 1] + b < v) v = d[o + W + 1] + b; if (x > 0 && d[o + W - 1] + b < v) v = d[o + W - 1] + b; }
    d[o] = v;
  }
  for (let i = 0; i < W * W; i++) {
    if (d[i] === 0) continue;
    const m = (d[i] - 0.5) * metresPerPixel, bed = -(m < 400 ? m * 0.025 : 10 + Math.sqrt(m - 400) * 0.9);
    if (bed < h[i]) h[i] = Math.max(-32000, Math.round(bed < -1 ? bed : -1));
  }
}

// Rivers and lakes of an elevation mosaic (hydrology.js). m.hydrology: { rain: url of the
// yearly rainfall map (720 x 360 bytes, 3.2 * sqrt(mm), north first, from longitude -180),
// minFlow (m3/s: what is drawn as a river at this zoom) }. The coarser mosaic's result, if
// one is there or on its way, says what the rivers bring in over the edge.
const hydro = new Map();          // zoom -> { res, tx, ty } (the last result at that zoom) or a promise of one
let rainMap = null;
async function waters(m, h, W, cell) {
  try {
    if (!rainMap) rainMap = fetch(m.hydrology.rain).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint8Array(b) : null)).catch(() => null);
    const rain = await rainMap, n = 2 ** m.zoom;
    const rainAt = (x, y) => {
      if (!rain) return 600;
      const lon = (m.tx + x / TILE) / n * 360, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (m.ty + y / TILE) / n))) * 57.29577951;
      const v = rain[Math.min(359, Math.max(0, Math.floor((90 - lat) * 2))) * 720 + ((Math.floor(lon * 2) % 720) + 720) % 720] / 3.2;
      return v * v;
    };
    // the nearest coarser zoom that has (or will have) a result
    let coarse = null;
    for (let z = m.zoom - 1; z >= 0 && !coarse; z--) if (hydro.has(z)) coarse = await Promise.race([hydro.get(z), new Promise((r) => setTimeout(() => r(null), 8000))]);
    if (coarse && !coarse.res) coarse = null;
    const s = coarse ? 2 ** (coarse.zoom - m.zoom) : 1;
    const res = hydrology(h, W, cell, rainAt, {
      minFlow: m.hydrology.minFlow,
      coarse: coarse ? { q: coarse.res.q, down: coarse.res.down, W: coarse.res.W, s, ox: m.tx * TILE * s - coarse.tx * TILE, oy: m.ty * TILE * s - coarse.ty * TILE } : null,
    });
    const packed = packWater(res, h);
    packed.info = { rivers: res.rivers.length, stretches: packed.segs.length / 10, inflow: !!coarse, flow: 0 };
    for (let i = 0; i < res.q.length; i++) if (res.q[i] > packed.info.flow) packed.info.flow = res.q[i];
    const mine = { res: { q: res.q, down: res.down, W }, zoom: m.zoom, tx: m.tx, ty: m.ty };
    hydro.set(m.zoom + 0.5, mine);          // (handed to those waiting by the caller: see `settle`)
    return packed;
  } catch (e) { console.warn('rivers and lakes:', e); return null; }
}

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type !== 'want') return;
  latest.set(m.key, m.id);
  const { zoom, tx, ty, n } = m, W = n * TILE, rows = 2 ** zoom;
  // (a finer mosaic's rivers wait for this one's: say so before the tiles are even asked for)
  let settle = null;
  if (m.kind === 'elevation' && m.hydrology) { const before = hydro.get(zoom); const p = new Promise((r) => { settle = r; }); p.then((v) => { if (hydro.get(zoom) === p) hydro.set(zoom, v || (before && before.res ? before : {})); }); hydro.set(zoom, p); }
  try {
    const jobs = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const y = ty + j;
      jobs.push(y < 0 || y >= rows ? Promise.resolve({ data: null }) : tile(m.url, m.ext, zoom, tx + i, y));
    }
    const tiles = await Promise.all(jobs);
    if (latest.get(m.key) !== m.id) return;                 // overtaken by a newer request
    if (m.kind === 'elevation') {
      const out = new Int16Array(W * W);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const d = tiles[j * n + i].data;
        for (let y = 0; y < TILE; y++) {
          const o = (j * TILE + y) * W + i * TILE;
          if (!d) { out.fill(0, o, o + TILE); continue; }
          for (let x = 0, q = y * TILE * 4; x < TILE; x++, q += 4) {
            const h = d[q] * 256 + d[q + 1] + d[q + 2] / 256 - 32768;
            out[o + x] = h > 32767 ? 32767 : h < -32768 ? -32768 : Math.round(h);
          }
        }
      }
      const cell = 40075016 / (TILE * rows) * Math.cos(Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + n / 2) / rows))));
      seaBed(out, W, cell);
      const water = m.hydrology ? await waters(m, out, W, cell) : null;
      settle?.(water ? hydro.get(zoom + 0.5) : null);
      if (latest.get(m.key) !== m.id) return;
      const msg = { type: 'mosaic', id: m.id, key: m.key, kind: m.kind, zoom, tx, ty, n, buffer: out.buffer }, transfer = [out.buffer];
      if (water) {
        msg.water = { info: water.info, segs: water.segs.buffer, gridStart: water.gridStart.buffer, gridItems: water.gridItems.buffer, lake: water.lake ? water.lake.buffer : null };
        transfer.push(water.segs.buffer, water.gridStart.buffer, water.gridItems.buffer); if (water.lake) transfer.push(water.lake.buffer);
      }
      self.postMessage(msg, transfer);
    } else {
      const out = new Uint8Array(W * W * 4);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const d = tiles[j * n + i].data;
        if (!d) continue;
        for (let y = 0; y < TILE; y++) out.set(d.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((j * TILE + y) * W + i * TILE) * 4);
      }
      const mips = mipChain(out, W);
      self.postMessage({ type: 'mosaic', id: m.id, key: m.key, kind: m.kind, zoom, tx, ty, n, buffer: out.buffer, mips: mips.map((x) => x.buffer) }, [out.buffer, ...mips.map((x) => x.buffer)]);
    }
  } catch (e) {
    if (latest.get(m.key) === m.id) self.postMessage({ type: 'failed', id: m.id, key: m.key, reason: String(e?.message || e) });
  } finally { settle?.(null); }
};
