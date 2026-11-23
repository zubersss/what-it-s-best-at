// Where the far rocks lie, seen from straight above, without a browser in seconds: the
// tiles of every level over a square of country, each rock a dot of its size over the
// land's shading (steep ground dark, forest green, water blue). For judging the rule
// (src/rocks/rockBlock.js: fields under steep ground, clusters, erratics, none in water)
// before any picture in the game, and for the numbers: rocks a tile, the time a tile takes.
//
//   node scripts/rock-field.mjs [--world haven] [--lat .. --lon ..] [--span 3000] [--out rock-field.png] [--check] [--count [--up 100] [--small 0.82]]
//
// --count: no picture; the rocks drawn from the place (--up metres over its ground), by the
// drawing's own rule: all round, and in the fullest 100 degrees of the compass (what a
// phone's view takes in, at most). The budget is 6 000 rocks in a view.
//
// --check: no picture; the rule's own promises, each of which fails the run if broken:
// the same tile twice gives the same rocks, none stands in water, the ones seen from farthest come first,
// every rock is inside its tile's bound, steep open ground holds many times the rocks of
// level open ground, and a tile takes no longer than a worker can spare.
// (The land cover is made here as the game makes it; rivers and lakes come with the map
// rings in the game and are not known here: a rock in a river is the game's to refuse.)
import fs from 'node:fs';
import { loadWorld } from './lib/loadWorld.mjs';
import { png } from './lib/png.mjs';
import { rockBlock, rocksFarDef, tileDeg, tileLon, rockVis, rockTop, SMALL_SHARE, shareOf } from '../src/rocks/rockBlock.js';
import { MadeWorld } from '../src/terrain/tiles/madeTiles.js';
import { ShadowBaker } from '../src/terrain/shadowBake.js';
import { CONFIG } from '../src/config.js';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const { world, hs, rasters } = await loadWorld(opt('world', 'haven'));
const def = rocksFarDef(world);
if (!def) { console.log(`"${world.id}" has no far rocks (surface.rocks.far in its file)`); process.exit(1); }
const R = world.radius, RAD = Math.PI / 180, st = world.scene.start, lat0 = +opt('lat', st.lat), lon0 = +opt('lon', st.lon);
const SPAN = +opt('span', 3000), W = 768;

// the land cover round the place, as the tile worker makes it (a made world only)
if (world.terrain.tiles?.made) {
  const rainFile = world.terrain.tiles.hydrology?.rain, rain = rainFile ? new Uint8Array(fs.readFileSync(new URL('../public/' + rainFile, import.meta.url))) : null;
  const made = new MadeWorld({ radius: R, dem: rasters[0], lakes: null, rain, land: world.terrain.tiles.made.land, seed: world.terrain.tiles.made.seed });
  const zoom = 7, n = 2 ** zoom, tiles = 4;
  const fx = ((lon0 + 180) % 360) / 360 * n, fy = (1 - Math.log(Math.tan(lat0 * RAD) + 1 / Math.cos(lat0 * RAD)) / Math.PI) / 2 * n;
  const tx = Math.round(fx - tiles / 2), ty = Math.round(fy - tiles / 2), pic = made.picture(zoom, tx, ty, tiles);
  hs.setCover({ ...pic.cover, width: tiles * 256, zoom, tx, ty });
}

const dirOf = (lat, lon) => { const cl = Math.cos(lat * RAD); return [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)]; };
const mLat = R * RAD, mLon = R * RAD * Math.cos(lat0 * RAD);
// every tile of every level that touches the square
function tilesOver(span) {
  const out = [];
  def.levels.forEach((L, li) => {
    const deg = tileDeg(R, L.tile), i0 = Math.floor((lat0 - span / 2 / mLat) / deg), i1 = Math.floor((lat0 + span / 2 / mLat) / deg);
    for (let bi = i0; bi <= i1; bi++) { const dLon = tileLon(bi, deg), j0 = Math.floor((lon0 - span / 2 / mLon) / dLon), j1 = Math.floor((lon0 + span / 2 / mLon) / dLon); for (let bj = j0; bj <= j1; bj++) out.push([L, li, bi, bj]); }
  });
  return out;
}

// (the tiles of the smallest level round this square and round the world file's two places)
function both2() {
  const out = tilesOver(Math.min(SPAN, 2500)).filter((t) => t[1] < 2), L = def.levels[0], deg = tileDeg(R, L.tile);
  for (const at of [...Object.values(def.check || {}), [st.lat, st.lon]]) { const bi = Math.floor(at[0] / deg), dLon = tileLon(bi, deg), bj = Math.floor(at[1] / dLon); for (let k = -1; k <= 1; k++) out.push([L, 0, bi + k, bj]); }
  return out;
}
if (flag('check')) {
  let bad = 0; const fail = (s) => { console.log('FAILED: ' + s); bad++; };
  const list = tilesOver(Math.min(SPAN, 2500));
  let worst = 0, total = 0, rocks = 0;
  for (const [L, li, bi, bj] of list) {
    const t0 = performance.now(), b = rockBlock(hs, L, li, bi, bj), ms = performance.now() - t0; worst = Math.max(worst, ms); total += ms; rocks += b.count;
    const again = rockBlock(hs, L, li, bi, bj);
    if (again.count !== b.count || again.off.some((v, i) => v !== b.off[i])) fail(`level ${li} tile ${bi},${bj}: asked twice, two answers`);
    if (b.count > (L.cap ?? 512)) fail(`level ${li} tile ${bi},${bj}: ${b.count} rocks, over its cap`);
    for (let i = 0; i < b.count; i++) {
      const s = b.off[i * 4 + 3];
      if (i && s * b.seen[i] > b.off[i * 4 - 1] * b.seen[i - 1] + 1e-3) { fail(`level ${li} tile ${bi},${bj}: rock ${i} is seen from farther than the one before it`); break; }
      if (b.seen[i] < 1) { fail(`level ${li} tile ${bi},${bj}: rock ${i} is seen from nowhere`); break; }
      if (s < L.size[0] - 1e-3 || s > L.size[1] + 1e-3) { fail(`level ${li} tile ${bi},${bj}: a rock of ${s.toFixed(2)} m, outside the level's sizes`); break; }
      if (Math.hypot(b.off[i * 4] - b.bound[0], b.off[i * 4 + 1] - b.bound[1], b.off[i * 4 + 2] - b.bound[2]) > b.bound[3]) { fail(`level ${li} tile ${bi},${bj}: rock ${i} lies outside the tile's bound`); break; }
      const x = b.origin[0] + b.off[i * 4], y = b.origin[1] + b.off[i * 4 + 1], z = b.origin[2] + b.off[i * 4 + 2], r = Math.hypot(x, y, z);
      const h = hs.height(x / r, y / r, z / r, L.wl ?? 2);
      if (hs.waterDepth > 0) { fail(`level ${li} tile ${bi},${bj}: rock ${i} stands in water`); break; }
      if (r - R > h + 0.3 * s || r - R < h - 0.05 * s) { fail(`level ${li} tile ${bi},${bj}: rock ${i} (${s.toFixed(1)} m) is ${(r - R - h).toFixed(2)} m from the ground`); break; }
    }
  }
  console.log(`${list.length} tiles, ${rocks} rocks; a tile takes ${(total / list.length).toFixed(0)} ms, the slowest ${worst.toFixed(0)} ms`);
  if (worst > 400) fail(`a tile took ${worst.toFixed(0)} ms: more than a worker can spare (400 ms)`);
  // steep open ground against level open ground: the rocks a tile holds on each. (Over this
  // square and the two the world's file names for it, `surface.rocks.far.check`: one place
  // seldom has both kinds.)
  {
    const L = def.levels[0], deg = tileDeg(R, L.tile);
    let steepN = 0, steepA = 0, flatN = 0, flatA = 0;
    const both = [...list];
    for (const at of Object.values(def.check || {})) { const i0 = Math.floor(at[0] / deg) - 3; for (let bi = i0; bi < i0 + 6; bi++) { const dLon = tileLon(bi, deg), j0 = Math.floor(at[1] / dLon) - 3; for (let bj = j0; bj < j0 + 6; bj++) both.push([L, 0, bi, bj]); } }
    for (const [L2, li, bi, bj] of both) {
      if (li !== 0) continue;
      const b = rockBlock(hs, L2, li, bi, bj), dLon = tileLon(bi, deg), d = dirOf((bi + 0.5) * deg, (bj + 0.5) * dLon);
      let S = 0; for (let k = 0; k < 9; k++) { const dd = dirOf((bi + (k % 3 + 0.5) / 3) * deg, (bj + (Math.floor(k / 3) + 0.5) / 3) * dLon); hs.height(dd[0], dd[1], dd[2], 60); const e = 30 / R, a = hs.height(dd[0], dd[1], dd[2] + e, 60), c = hs.height(dd[0], dd[1], dd[2] - e, 60), f = hs.height(dd[0] + e, dd[1], dd[2], 60), g = hs.height(dd[0] - e, dd[1], dd[2], 60); S += Math.hypot(a - c, f - g) / 60 / 9; }
      const cov = hs.coverAt(d[0], d[1], d[2]), closed = cov < 0 ? 0 : (cov >> 16) / 255;
      if (closed > 0.3) continue;
      if (S > 0.45) { steepN += b.count; steepA++; } else if (S < 0.12) { flatN += b.count; flatA++; }
    }
    console.log(`open ground: ${steepA} steep tiles with ${(steepN / Math.max(1, steepA)).toFixed(0)} rocks each, ${flatA} level tiles with ${(flatN / Math.max(1, flatA)).toFixed(0)} each`);
    if (steepA && flatA && steepN / steepA < 4 * (flatN / flatA)) fail('steep open ground holds fewer than four times the rocks of level open ground');
    if (!steepA || !flatA) console.log('FAILED: (no steep or no level open tiles: that comparison was not made)'), bad++;
  }
  // the land's shadow on a tile: in full sun from overhead, in shade with the Sun under the ground
  {
    const baker = new ShadowBaker(hs, CONFIG, world), [L, li, bi, bj] = list.find((t) => t[1] === 0 && rockBlock(hs, t[0], t[1], t[2], t[3]).count > 120) || list[0], b = rockBlock(hs, L, li, bi, bj);
    if (b.count) {
      const ol = Math.hypot(...b.origin), up = b.origin.map((v) => v / ol), t0 = performance.now(), hi = rockVis(baker, b.origin, b.off, b.count, up, 0.0046), ms = performance.now() - t0, lo = rockVis(baker, b.origin, b.off, b.count, up.map((v) => -v), 0.0046);
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length / 255;
      console.log(`sunlight on a tile of ${b.count}: ${ms.toFixed(0)} ms; Sun overhead ${mean(hi).toFixed(2)}, Sun underfoot ${mean(lo).toFixed(2)}`);
      if (mean(hi) < 0.95 || mean(lo) > 0.05) fail('the sunlight on a tile is wrong (should be 1 with the Sun overhead, 0 with it underfoot)');
    }
  }
  // What a walker stands on is the block that is drawn: rockTop against the twenty faces
  // built here again as the vertex shader builds them (ROCK_SHAPE_GLSL), asked on a grid
  // over each rock. Wherever rockTop lifts the walker a face must be there, at that height.
  {
    const { rockGeometry } = await import('../src/rocks/rocks.js'), g = rockGeometry(0), lump = { pos: g.attributes.position.array, idx: g.index.array };
    const fr = (v) => v - Math.floor(v), TAU = 6.2831853;
    const faces = (b, i) => {                       // the block's faces in planet axes, from its middle
      const sh = [0, 1, 2, 3].map((k) => b.shape[i * 4 + k] / 255), sides = 4 + Math.floor(sh[3] * 2.999), q = b.quat.subarray(i * 4, i * 4 + 4), sc = b.scale.subarray(i * 3, i * 3 + 3), V = [];
      for (let k = 0; k < 12; k++) {
        const p = [lump.pos[k * 3], lump.pos[k * 3 + 1], lump.pos[k * 3 + 2]]; let r = Math.hypot(...p); const d = p.map((v) => v / r);
        for (let f = 0; f <= sides; f++) {
          let n, h;
          if (f < sides) { const a = sh[0] * TAU + f * TAU / sides + (fr(sh[1] * 7.13 + f * 0.618034) - 0.5) * 0.9, z = (fr(sh[2] * 5.71 + f * 0.381966) - 0.45) * 0.55, sn = Math.sqrt(1 - z * z); n = [Math.cos(a) * sn, Math.sin(a) * sn, z]; h = 0.5 + 0.32 * fr(sh[1] * 3.31 + f * 0.754878); }
          else { const z = 0.6 + 0.37 * sh[1], sn = Math.sqrt(1 - z * z), a = sh[2] * TAU; n = [Math.cos(a) * sn, Math.sin(a) * sn, z]; h = 0.35 + 0.35 * sh[0]; }
          const c = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; if (c > 1e-3 && r * c > h) r = h / c;
        }
        const v = [d[0] * r * sc[0], d[1] * r * sc[1], d[2] * r * sc[2]];
        // qrot: v + 2 q.xyz x (q.xyz x v + q.w v)
        const cx = q[1] * v[2] - q[2] * v[1] + q[3] * v[0], cy = q[2] * v[0] - q[0] * v[2] + q[3] * v[1], cz = q[0] * v[1] - q[1] * v[0] + q[3] * v[2];
        V.push([v[0] + 2 * (q[1] * cz - q[2] * cy), v[1] + 2 * (q[2] * cx - q[0] * cz), v[2] + 2 * (q[0] * cy - q[1] * cx)]);
      }
      return V;
    };
    // the highest point of the faces on the vertical through P (plain solving, no shared code with rockTop)
    const highest = (V, P, up) => {
      let best = null;
      for (let t = 0; t < 60; t += 3) {
        const A = V[lump.idx[t]], B = V[lump.idx[t + 1]], C = V[lump.idx[t + 2]];
        // P + s up = A + a (B - A) + c (C - A): three equations, Cramer's rule
        const m = [[B[0] - A[0], C[0] - A[0], -up[0]], [B[1] - A[1], C[1] - A[1], -up[1]], [B[2] - A[2], C[2] - A[2], -up[2]]], r = [P[0] - A[0], P[1] - A[1], P[2] - A[2]];
        const det3 = (x) => x[0][0] * (x[1][1] * x[2][2] - x[1][2] * x[2][1]) - x[0][1] * (x[1][0] * x[2][2] - x[1][2] * x[2][0]) + x[0][2] * (x[1][0] * x[2][1] - x[1][1] * x[2][0]);
        const D = det3(m); if (Math.abs(D) < 1e-12) continue;
        const col = (k) => m.map((row, ri) => row.map((v, ci) => ci === k ? r[ri] : v));
        const a = det3(col(0)) / D, c = det3(col(1)) / D, sv = det3(col(2)) / D;
        if (a < -1e-9 || c < -1e-9 || a + c > 1 + 1e-9) continue;
        if (best == null || sv > best) best = sv;
      }
      return best;
    };
    let asked = 0, lifted = 0, noRock = 0, worst = 0, rocksN = 0;
    for (const [L, li, bi, bj] of list) {
      if (L.size[0] < 3.4 - 1e-6) continue;
      const b = rockBlock(hs, L, li, bi, bj);
      for (let i = 0; i < b.count && rocksN < 300; i += Math.max(1, Math.floor(b.count / 150))) {
        rocksN++;
        const x = b.origin[0] + b.off[i * 4], y = b.origin[1] + b.off[i * 4 + 1], z = b.origin[2] + b.off[i * 4 + 2], r = Math.hypot(x, y, z), up = [x / r, y / r, z / r], s = b.off[i * 4 + 3];
        const e = [-up[1], up[0], 0], el = Math.hypot(e[0], e[1]) || 1; e[0] /= el; e[1] /= el; const n = [up[1] * e[2] - up[2] * e[1], up[2] * e[0] - up[0] * e[2], up[0] * e[1] - up[1] * e[0]];
        const V = faces(b, i);
        for (let gy = -6; gy <= 6; gy++) for (let gx = -6; gx <= 6; gx++) {
          // (a place 2 sizes under the rock's middle: under all of it)
          const P = [0, 1, 2].map((k) => (e[k] * gx + n[k] * gy) * s * 0.25 - up[k] * 2 * s);
          const t = rockTop(P[0], P[1], P[2], up, b.quat, b.scale, b.shape, i, lump), h = highest(V, P, up); asked++;
          if (t > 0) { lifted++; if (h == null) noRock++; else worst = Math.max(worst, Math.abs(t - h)); } else if (h != null && h > 1e-6) worst = Math.max(worst, h);
        }
      }
    }
    console.log(`a walker on ${rocksN} large rocks, ${asked} places: lifted at ${lifted}; with no face of the block under him at ${noRock}; farthest from the face ${worst.toFixed(3)} m`);
    if (!lifted) fail('no place over a large rock lifts a walker (the comparison was not made)');
    if (noRock) fail(`${noRock} places lift a walker where no face of the drawn block is`);
    if (worst > 0.01) fail(`a walker stands ${worst.toFixed(2)} m from the face of the block under him`);
  }
  // under a closed canopy a rock is seen from near by only, unless it stands over the trees
  {
    let under = 0, far = 0, open = 0;
    for (const [L, li, bi, bj] of both2()) { const b = rockBlock(hs, L, li, bi, bj); for (let i = 0; i < b.count; i++) {
      const sz = b.off[i * 4 + 3], x = b.origin[0] + b.off[i * 4], y = b.origin[1] + b.off[i * 4 + 1], z = b.origin[2] + b.off[i * 4 + 2], r = Math.hypot(x, y, z), cov = hs.coverAt(x / r, y / r, z / r), closed = cov < 0 ? 0 : (cov >> 16) / 255;
      if (closed < 0.7) { open++; continue; }
      under++; if (sz < 9 && sz * b.seen[i] / 255 * def.reach > 200) far++;
    } }
    console.log(`${open} rocks in the open or among scattered trees, ${under} under a closed canopy`);
    if (far) fail(`${far} rocks under 9 m under a closed canopy are seen from more than 200 m`);
    if (!under || !open) console.log('FAILED: (no rocks under trees, or none in the open: that comparison was not made)'), bad++;
  }
  console.log(bad ? `${bad} check(s) failed` : 'all checks passed');
  process.exit(bad ? 1 : 0);
}

if (flag('count')) {
  const d0 = dirOf(lat0, lon0), up = +opt('up', 2), r0 = R + hs.height(d0[0], d0[1], d0[2], 4) + up, eye = d0.map((v) => v * r0);
  const small = +opt('small', SMALL_SHARE), lo = def.share[0], hi = def.share[1];
  const east = [-Math.sin(lon0 * RAD), Math.cos(lon0 * RAD), 0], north = [-Math.sin(lat0 * RAD) * Math.cos(lon0 * RAD), -Math.sin(lat0 * RAD) * Math.sin(lon0 * RAD), Math.cos(lat0 * RAD)];
  const bins = new Float64Array(36), by = def.levels.map(() => [0, 0, 0]), near = [0, 0];
  def.levels.forEach((L, li) => {
    const deg = tileDeg(R, L.tile), T = deg * mLat, radius = (L.seenTo || def.reach * L.size[1]) + 0.72 * T, nb = Math.ceil(radius / T), bi0 = Math.floor(lat0 / deg);
    for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
      const dLon = tileLon(bi, deg), bj0 = Math.floor(lon0 / dLon), nbj = Math.ceil(radius / (dLon * mLon));
      for (let bj = bj0 - nbj; bj <= bj0 + nbj; bj++) {
        if (Math.hypot(((bi + 0.5) * deg - lat0) * mLat, ((bj + 0.5) * dLon - lon0) * mLon) > radius) continue;
        const b = rockBlock(hs, L, li, bi, bj); by[li][0]++; by[li][1] += b.count;
        for (let i = 0; i < b.count; i++) {
          const x = b.origin[0] + b.off[i * 4] - eye[0], y = b.origin[1] + b.off[i * 4 + 1] - eye[1], z = b.origin[2] + b.off[i * 4 + 2] - eye[2], d = Math.hypot(x, y, z), e = b.off[i * 4 + 3] * b.seen[i] / 255;
          if (d >= e * def.reach * shareOf(e, small, lo, hi)) continue;
          by[li][2]++; if (d < 150) near[0]++; if (li < 3 && b.seen[i] < 255) near[1]++;
          bins[Math.floor(((Math.atan2(x * east[0] + y * east[1] + z * east[2], x * north[0] + y * north[1] + z * north[2]) / RAD + 360) % 360) / 10)]++;
        }
      }
    }
  });
  let most = 0, at = 0; for (let k = 0; k < 36; k++) { let n = 0; for (let j = 0; j < 10; j++) n += bins[(k + j) % 36]; if (n > most) { most = n; at = k * 10; } }
  const all = by.reduce((s, v) => s + v[2], 0);
  console.log(`from lat ${lat0} lon ${lon0}, ${up} m up: ${all} rocks drawn all round (${near[0]} within 150 m, ${near[1]} of them under trees); the fullest 100 degrees (from bearing ${at}): ${most}`);
  def.levels.forEach((L, li) => console.log(`  level ${li} (${L.size[0]}-${L.size[1]} m): ${by[li][2]} drawn of ${by[li][1]} in ${by[li][0]} tiles`));
  process.exit(0);
}

// the picture: the land's shading, then the rocks
const px = new Uint8Array(W * W * 3), mpp = SPAN / W;
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const e = (x + 0.5 - W / 2) * mpp, n = (W / 2 - y - 0.5) * mpp, lat = lat0 + n / mLat, lon = lon0 + e / mLon, d = dirOf(lat, lon);
  const h = hs.height(d[0], d[1], d[2], mpp * 2), wet = hs.waterDepth > 0, d2 = dirOf(lat + mpp / mLat, lon), d3 = dirOf(lat, lon + mpp / mLon);
  const gn = (hs.height(d2[0], d2[1], d2[2], mpp * 2) - h) / mpp, ge = (hs.height(d3[0], d3[1], d3[2], mpp * 2) - h) / mpp, S = Math.hypot(gn, ge);
  const cov = hs.coverAt(d[0], d[1], d[2]), closed = cov < 0 ? 0 : (cov >> 16) / 255, cls = cov < 0 ? 0 : cov & 255;
  const light = Math.max(0.25, Math.min(1.2, 0.75 + 0.9 * (ge - gn) * 0.7)) * (1 - 0.35 * Math.min(1, S));
  let c = cls === 15 ? [235, 238, 245] : [200 - 120 * closed, 185 - 60 * closed, 140 - 90 * closed];
  if (wet || cls === 17) c = [70, 120, 190];
  const q = (y * W + x) * 3; px[q] = Math.min(255, c[0] * light); px[q + 1] = Math.min(255, c[1] * light); px[q + 2] = Math.min(255, c[2] * light);
}
const counts = def.levels.map(() => 0), tilesN = def.levels.map(() => 0), most = def.levels.map(() => 0); let ms = 0, n = 0;
const COL = [[40, 20, 10], [150, 20, 20], [130, 0, 150], [20, 20, 20]];
for (const [L, li, bi, bj] of tilesOver(SPAN)) {
  const t0 = performance.now(), b = rockBlock(hs, L, li, bi, bj); ms += performance.now() - t0; n++;
  counts[li] += b.count; tilesN[li]++; most[li] = Math.max(most[li], b.count);
  for (let i = 0; i < b.count; i++) {
    const x = b.origin[0] + b.off[i * 4], y = b.origin[1] + b.off[i * 4 + 1], z = b.origin[2] + b.off[i * 4 + 2], r = Math.hypot(x, y, z);
    const lat = Math.asin(z / r) / RAD, lon = ((Math.atan2(y, x) / RAD) + 360) % 360, cx = ((lon - lon0 + 540) % 360 - 180) * mLon / mpp + W / 2, cy = W / 2 - (lat - lat0) * mLat / mpp, rad = Math.max(0.6, 0.65 * b.off[i * 4 + 3] / mpp);
    for (let yy = Math.floor(cy - rad); yy <= Math.ceil(cy + rad); yy++) for (let xx = Math.floor(cx - rad); xx <= Math.ceil(cx + rad); xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= W || Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) > rad + 0.3) continue;
      const q = (yy * W + xx) * 3; px[q] = COL[li % 4][0]; px[q + 1] = COL[li % 4][1]; px[q + 2] = COL[li % 4][2];
    }
  }
}
const out = opt('out', 'rock-field.png');
fs.writeFileSync(out, png(W, W, px));
console.log(`${out}: ${SPAN} m across at lat ${lat0} lon ${lon0}, ${mpp.toFixed(1)} m a pixel`);
def.levels.forEach((L, li) => console.log(`  level ${li} (${L.size[0]}-${L.size[1]} m, tiles of ${(tileDeg(R, L.tile) * mLat).toFixed(0)} m): ${counts[li]} rocks in ${tilesN[li]} tiles, the fullest ${most[li]} of ${L.cap}`));
console.log(`  a tile takes ${(ms / n).toFixed(0)} ms`);
