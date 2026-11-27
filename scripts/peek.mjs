// What a camera would see from a place, without a browser: the height function ray-marched
// on the CPU with plain sunlight, the Sun and the larger bodies of the sky as discs. For
// choosing start sites, bookmarks and times of day in seconds instead of a five-minute
// headless screenshot each. It is a sketch of the view (no air, no rocks, no textures).
//   node scripts/peek.mjs --world phobos [--shot ledge | --lat .. --lon ..] [--heading 80] [--pitch 0]
//        [--fov 60] [--t <hours from the world's date>] [--eye 1.7] [--alt <m above ground>]
//        [--size 220x104] [--out peek.png] [--pan 4]   (pan: that many views, turning 90 degrees each)
// Prints the Sun's and the big bodies' elevation and azimuth, and the ground height.
import { writeFile } from 'node:fs/promises';
import { loadWorld } from './lib/loadWorld.mjs';
import { encodePNG } from './lib/png.mjs';
import { SOLAR_SYSTEM } from '../src/worlds/solarSystem.js';
import { Ephemeris, dateToJD, latLonToDir, localFrame, elevationAzimuth } from '../src/core/ephemeris.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const { world, hs } = await loadWorld(opt('world', 'mars'));
const bm = opt('shot', null) ? world.scene.bookmarks[opt('shot')] : null;
if (opt('shot', null) && !bm) throw new Error(`no bookmark "${opt('shot')}" on ${world.id}`);
const st = world.scene.start;
let lat = +opt('lat', bm?.lat ?? st.lat), lon = +opt('lon', bm?.lon ?? st.lon);
const heading0 = +opt('heading', bm?.heading ?? st.heading), pitch = +opt('pitch', bm?.pitch ?? st.pitch), fov = +opt('fov', bm?.fov ?? 60);
const tHours = +opt('t', bm?.timeOffsetHours ?? 0), eye = +opt('eye', 1.7), alt = opt('alt', null);
const [W, H] = opt('size', '220x104').split('x').map(Number), pan = +opt('pan', 1);
const R = world.radius, DEG = Math.PI / 180;

const eph = new Ephemeris(SOLAR_SYSTEM, world.body);
const ids = Object.keys(SOLAR_SYSTEM).filter((k) => k !== 'sun' && k !== world.body);
eph.update(dateToJD(Date.parse(world.scene.dateUTC)) + tHours / 24, ids);

let d0 = latLonToDir(lat, lon);
const fr = localFrame(d0);
if (bm && (bm.east || bm.north) && opt('lat', null) == null) {       // metres from the start, as the game places it
  const p = d0.map((v, k) => v * R + fr.east[k] * (bm.east || 0) + fr.north[k] * (bm.north || 0)), l = Math.hypot(...p);
  d0 = p.map((v) => v / l);
}
const { east, north, up } = localFrame(d0);
const ground = hs.height(d0[0], d0[1], d0[2], 1);
// (a bookmark's own alt is metres over the sea, as the game takes it: a view from the air)
const camR = alt != null ? R + ground + +alt : bm?.alt != null ? R + Math.max(bm.alt, ground + eye) : R + ground + eye;
const cam = d0.map((v) => v * camR);
const sunEA = elevationAzimuth(cam, eph.sunDir);
console.log(`${world.name} ${lat.toFixed(4)}, ${lon.toFixed(4)}  ground ${ground.toFixed(0)} m  t=${tHours} h  Sun: elevation ${sunEA.elevation.toFixed(1)}, azimuth ${sunEA.azimuth.toFixed(0)}`);
const discs = [{ dir: eph.sunDir, ang: Math.asin(SOLAR_SYSTEM.sun.radius / eph.sunDistance), col: [255, 250, 235], sun: true }];
for (const id of ids) {
  const p = eph.bodies.get(id).pos, rel = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]], dist = Math.hypot(...rel), ang = Math.asin(Math.min(1, SOLAR_SYSTEM[id].radius / dist));
  if (ang < 0.1 * DEG) continue;
  const dir = rel.map((v) => v / dist), ea = elevationAzimuth(cam, dir), c = SOLAR_SYSTEM[id].color || [1, 1, 1];
  console.log(`  ${id}: elevation ${ea.elevation.toFixed(1)}, azimuth ${ea.azimuth.toFixed(0)}, ${(2 * ang / DEG).toFixed(2)} deg wide`);
  discs.push({ dir, ang, col: c.map((v) => 200 * v), pos: p, id });
}

// Height above datum at a planet-centred point, and the ground there.
const hAt = (x, y, z, wl) => { const l = Math.hypot(x, y, z); return [l - R, hs.height(x / l, y / l, z / l, wl)]; };
const rgb = new Uint8Array(W * pan * H * 3);
const S = eph.sunDir, th = Math.tan(fov * DEG / 2), aspect = W / H;
for (let v = 0; v < pan; v++) {
  const hd = (heading0 + v * 90) * DEG, cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
  const fwd = [0, 1, 2].map((k) => (Math.sin(hd) * east[k] + Math.cos(hd) * north[k]) * cp + up[k] * sp);
  const right = [0, 1, 2].map((k) => Math.cos(hd) * east[k] - Math.sin(hd) * north[k]);
  const upv = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const sx = ((i + 0.5) / W * 2 - 1) * th * aspect, sy = (1 - (j + 0.5) / H * 2) * th;
    let dx = fwd[0] + right[0] * sx + upv[0] * sy, dy = fwd[1] + right[1] * sx + upv[1] * sy, dz = fwd[2] + right[2] * sx + upv[2] * sy;
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    // march: steps grow with distance; stop on the first sample under the ground
    let t = 0.5, hit = -1, prevT = 0, prevGap = 1;
    const px = th * 2 / H;                                    // one pixel, radians
    for (let n = 0; n < 260 && t < 4 * R; n++) {
      const x = cam[0] + dx * t, y = cam[1] + dy * t, z = cam[2] + dz * t;
      const [a, g] = hAt(x, y, z, Math.max(2, t * px * 4));
      const gap = a - g;
      if (gap <= 0) { hit = prevT + (t - prevT) * prevGap / Math.max(1e-6, prevGap - gap); break; }
      if (a > world.terrain.maxAltitude + 50 && (x * dx + y * dy + z * dz) > 0) break;       // above everything and climbing
      prevT = t; prevGap = gap;
      t += Math.max(0.5, Math.min(gap * 0.8, t * 0.12) + t * px);
    }
    const o = (j * W * pan + v * W + i) * 3;
    if (hit < 0) {
      let c = [2, 2, 4];
      for (const b of discs) {
        const cosA = dx * b.dir[0] + dy * b.dir[1] + dz * b.dir[2];
        if (cosA < Math.cos(b.ang)) continue;
        if (b.sun) { c = b.col; continue; }
        // a lit sphere: the point of the disc this ray meets, lit by the Sun
        const oc = [cam[0] - b.pos[0], cam[1] - b.pos[1], cam[2] - b.pos[2]], bq = oc[0] * dx + oc[1] * dy + oc[2] * dz, Rb = SOLAR_SYSTEM[b.id].radius;
        const disc = bq * bq - (oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - Rb * Rb);
        if (disc < 0) continue;
        const tt = -bq - Math.sqrt(disc), nx = (oc[0] + dx * tt) / Rb, ny = (oc[1] + dy * tt) / Rb, nz = (oc[2] + dz * tt) / Rb;
        const sb = [S[0] * eph.sunDistance - b.pos[0], S[1] * eph.sunDistance - b.pos[1], S[2] * eph.sunDistance - b.pos[2]], sl = Math.hypot(...sb);
        const lam = Math.max(0, (nx * sb[0] + ny * sb[1] + nz * sb[2]) / sl);
        c = b.col.map((q) => 6 + q * lam);
      }
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      continue;
    }
    // shade: normal from two more height samples, a shadow ray toward the Sun
    const x = cam[0] + dx * hit, y = cam[1] + dy * hit, z = cam[2] + dz * hit, l = Math.hypot(x, y, z), wl = Math.max(1, hit * px * 2), e = Math.max(0.5, hit * px);
    const u = [x / l, y / l, z / l], lf = localFrame(u), h0 = hs.height(u[0], u[1], u[2], wl);
    const hE = hAt(x + lf.east[0] * e, y + lf.east[1] * e, z + lf.east[2] * e, wl)[1], hN = hAt(x + lf.north[0] * e, y + lf.north[1] * e, z + lf.north[2] * e, wl)[1];
    const gx = (hE - h0) / e, gy = (hN - h0) / e, nl = Math.hypot(gx, gy, 1);
    const N = [0, 1, 2].map((k) => (u[k] - lf.east[k] * gx - lf.north[k] * gy) / nl);
    let lit = Math.max(0, N[0] * S[0] + N[1] * S[1] + N[2] * S[2]);
    if (lit > 0) {
      let ts = Math.max(2, e * 2);
      for (let n = 0; n < 60 && ts < (world.terrain.shadowRange || 1e5); n++) {
        const [a, g] = hAt(x + S[0] * ts, y + S[1] * ts, z + S[2] * ts, Math.max(wl, ts * 0.02));
        if (a < g) { lit = 0; break; }
        if (a > world.terrain.maxAltitude) break;
        ts += Math.max(e, (a - g) * 0.7, ts * 0.12);
      }
    }
    const fogT = Math.exp(-hit / (world.atmosphere ? 60000 : 1e12)), base = world.surface.dust, sky = world.atmosphere ? 0.25 : 0.03;
    const gain = 0.55 / Math.max(base[0], base[1], base[2]);       // (exposed for the ground's own brightness)
    for (let k = 0; k < 3; k++) rgb[o + k] = Math.min(255, 255 * Math.pow(Math.min(1, (base[k] * gain * (lit + sky)) * fogT + (1 - fogT) * 0.5 * base[k] * gain), 1 / 2.2));
  }
}
const out = opt('out', 'peek.png');
await writeFile(out, encodePNG(W * pan, H, rgb, 3));
console.log('wrote', out);
