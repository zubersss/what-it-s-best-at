// The tile worker: fetches map tiles (256-pixel Web Mercator tiles, the layout every map
// service uses) and puts them together into square mosaics round a place, off the main
// thread. Two kinds of mosaic:
//   elevation  Int16 metres, from "terrarium" PNG tiles (height = R * 256 + G + B / 256 - 32768)
//   picture    RGBA bytes with their mip maps, from JPEG or PNG tiles as they are
// Messages in:  { type: 'want', id, key, url, kind, zoom, tx, ty, n, ext }   (n x n tiles from column tx, row ty)
// Messages out: { type: 'mosaic', id, key, kind, zoom, tx, ty, n, buffer, mips? } or { type: 'failed', id, key, reason }
// A newer 'want' with the same key replaces an older one that has not finished.
import { hydrology, packWater, seaBed, despike } from './hydrology.js';

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
    let res = null, body = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      // (a service that does not answer must not hold a mosaic for ever)
      // (the limit covers the whole answer, body and all: a tile that stalls half way must not hold it either)
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 20000);
      try { res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: stop.signal }); if (res.ok) { body = await res.blob(); break; } if (res.status === 404) break; } catch (e) { res = null; if (attempt === 2) throw e; } finally { clearTimeout(timer); }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    if (!res) throw new Error('no answer');
    if (res.status === 404) return null;
    if (!res.ok || !body) throw new Error('HTTP ' + res.status);
    const bmp = await createImageBitmap(body, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(TILE, TILE), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, TILE, TILE); bmp.close?.();
    return g.getImageData(0, 0, TILE, TILE).data;
  } finally { done(); }
}

function tile(template, ext, z, x, y, maxZoom = 99) {
  if (z > maxZoom) {
    // (a layer that stops at a coarser zoom: the part of its last tile that covers this one, enlarged)
    const k = z - maxZoom, f = 2 ** k, nn = 2 ** z, xw = ((x % nn) + nn) % nn;
    return tile(template, ext, maxZoom, xw >> k, y >> k).then(({ data }) => {
      if (!data) return { data: null };
      const out = new Uint8ClampedArray(TILE * TILE * 4), ox = (xw % f) * TILE / f, oy = (y % f) * TILE / f;
      for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { const q = ((oy + Math.floor(j / f)) * TILE + ox + Math.floor(i / f)) * 4, o = (j * TILE + i) * 4; out[o] = data[q]; out[o + 1] = data[q + 1]; out[o + 2] = data[q + 2]; out[o + 3] = data[q + 3]; }
      return { data: out };
    });
  }
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

// How closed each land-cover class's canopy is (index: the class, 1..17 as IGBP numbers
// them; 0: unknown) and how tall where no measurement says (m).
export const COVER_DENSITY = [0, 1, 1, 1, 1, 1, 0.5, 0.12, 0.55, 0.22, 0.02, 0.25, 0.01, 0.03, 0.15, 0, 0, 0];
export const COVER_HEIGHT = [0, 18, 30, 16, 20, 18, 2.5, 1.5, 9, 7, 0, 6, 0, 0, 8, 0, 0, 0];
let palette = null;
async function coverOf(m, W, out) {
  if (!palette) palette = fetch(m.cover.palette).then((r) => r.json());
  const pal = await palette, { zoom, tx, ty, n } = m, rows = 2 ** zoom;
  const get = (url, maxZoom) => { const jobs = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const y = ty + j; jobs.push(y < 0 || y >= rows ? Promise.resolve({ data: null }) : tile(url, m.ext, zoom, tx + i, y, maxZoom)); } return Promise.all(jobs); };
  const [ct, ht] = await Promise.all([get(m.cover.classes, m.cover.classesZoom ?? 99), m.cover.canopy ? get(m.cover.canopy, m.cover.canopyZoom ?? 99) : null]);
  // colour -> meaning, remembered (a tile uses few colours)
  const look = (table) => { const memo = new Map(); return (r, g, b) => { const key = (r << 16) | (g << 8) | b; let v = memo.get(key); if (v === undefined) { let best = 1e9; v = 0; for (const e of table) { const d = (e[0] - r) ** 2 + (e[1] - g) ** 2 + (e[2] - b) ** 2; if (d < best) { best = d; v = e[3]; } } if (best > 900) v = -1; memo.set(key, v); } return v; }; };
  const classOf = look(pal.cover), heightOf = look(pal.canopy);
  const paint = m.cover.colours ? (m.cover.paint ?? 0) : 0;
  const cls = new Uint8Array(W * W), tall = new Uint8Array(W * W), closed = new Uint8Array(W * W);        // class, canopy height (0.25 m), how closed (0..255)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = ct[j * n + i].data, hd = ht ? ht[j * n + i].data : null;
    for (let y = 0; y < TILE; y++) for (let x = 0, q = y * TILE * 4, o = (j * TILE + y) * W + i * TILE; x < TILE; x++, q += 4, o++) {
      const k = c && c[q + 3] > 128 ? Math.max(0, classOf(c[q], c[q + 1], c[q + 2])) : 0;
      let h = hd && hd[q + 3] > 128 ? heightOf(hd[q], hd[q + 1], hd[q + 2]) : -1;
      let dens = COVER_DENSITY[k];
      // (a canopy measured tall is forest, whatever the class calls it: the mountain
      // parkland of the American West is "savanna" on the map)
      if (h > 8 && k !== 15 && k !== 17) dens = Math.max(dens, Math.min(1, h / 15));
      // (a measured mean over open ground is lower than its trees: lift it for open classes)
      h = h > 1 ? (dens < 0.6 ? Math.max(h * 1.5, COVER_HEIGHT[k]) : h) : COVER_HEIGHT[k];
      cls[o] = k; tall[o] = Math.min(255, Math.round(h * 4)); closed[o] = Math.round(dens * 255);
      out[o * 4 + 3] = Math.min(255, Math.round(h * dens * 5));
      // (the painted look: the land's colour drawn toward its class's own, m.cover.paint of the way)
      const pc = paint && m.cover.colours[k];
      if (pc) { const q4 = o * 4; out[q4] += (pc[0] - out[q4]) * paint; out[q4 + 1] += (pc[1] - out[q4 + 1]) * paint; out[q4 + 2] += (pc[2] - out[q4 + 2]) * paint; }
    }
  }
  return { cls, tall, closed };
}

// Rivers and lakes of an elevation mosaic (hydrology.js). m.hydrology: { rain: url of the
// yearly rainfall map (720 x 360 bytes, 3.2 * sqrt(mm), north first, from longitude -180),
// water: url of a grey picture of the world's water as seen from space (white: water),
// minFlow (m3/s: what is drawn as a river at this zoom) }. The coarser mosaic's result, if
// one is there or on its way, says what the rivers bring in over the edge.
const hydro = new Map();          // zoom -> { res, tx, ty } (the last result at that zoom) or a promise of one
let rainMap = null, waterMap = null;
// A whole-world grey picture as { data (one byte a pixel), W, H }, or null.
async function greyMap(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }), W = bmp.width, H = bmp.height;
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0); bmp.close?.();
    const rgba = g.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
    return { data, W, H };
  } catch (e) { return null; }
}
async function waters(m, h, W, cell) {
  try {
    if (!rainMap) rainMap = fetch(m.hydrology.rain).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint8Array(b) : null)).catch(() => null);
    if (!waterMap) waterMap = m.hydrology.water ? greyMap(m.hydrology.water) : Promise.resolve(null);
    const rain = await rainMap, seen = await waterMap, n = 2 ** m.zoom;
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
      lat: (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (m.ty + y / TILE) / n))) * 57.29577951,
      // (the water map: the whole world, north first, from longitude -180)
      water: seen ? (x, y) => {
        const lon = (m.tx + x / TILE) / n, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (m.ty + y / TILE) / n))) * 57.29577951;
        return seen.data[Math.min(seen.H - 1, Math.max(0, Math.floor((90 - lat) / 180 * seen.H))) * seen.W + ((Math.floor(lon * seen.W) % seen.W) + seen.W) % seen.W];
      } : null,
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
      despike(out, W, cell);
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
      // What grows there (m.cover: { classes: url of land-cover tiles, canopy: url of
      // canopy-height tiles, their last zooms, palette: url of the colours' meanings }):
      // a class and a canopy height for every pixel, for the trees; and in the picture's
      // fourth channel the height of the canopy as a whole (height x how closed it is,
      // 0.2 m a step), for the ground shader to raise the forest it cannot draw tree by tree.
      let cover = null;
      if (m.cover) { try { cover = await coverOf(m, W, out); } catch (e) { console.warn('land cover:', e); } }
      if (latest.get(m.key) !== m.id) return;
      if (!cover) for (let i = 3; i < out.length; i += 4) out[i] = 0;
      const mips = mipChain(out, W);
      const msg = { type: 'mosaic', id: m.id, key: m.key, kind: m.kind, zoom, tx, ty, n, buffer: out.buffer, mips: mips.map((x) => x.buffer) }, transfer = [out.buffer, ...mips.map((x) => x.buffer)];
      if (cover) { msg.cover = { cls: cover.cls.buffer, tall: cover.tall.buffer, closed: cover.closed.buffer }; transfer.push(cover.cls.buffer, cover.tall.buffer, cover.closed.buffer); }
      self.postMessage(msg, transfer);
    }
  } catch (e) {
    if (latest.get(m.key) === m.id) self.postMessage({ type: 'failed', id: m.id, key: m.key, reason: String(e?.message || e) });
  } finally { settle?.(null); }
};
