// The cloud-shade atlas (docs/briefs/sky-C-shade.md, package C of docs/briefs/
// clouds-weather-plan.md): its addressing, its snapping, its anchoring and the projection its
// readers do, replayed in Node against the arithmetic the game's own code is written from. No
// browser: the atlas is filled here texel by texel from a made-up field on the sphere, read
// back as a GPU reads it (scripts/lib/glslSamplers.mjs), and the reader's GLSL is run by
// scripts/lib/glslRun.mjs in 32-bit floats against its JS twin.
//
//   node scripts/cloud-shade-test.mjs            every check; exits 1 on any failure
//   node scripts/cloud-shade-test.mjs --break <what>   one fault put in on purpose, to see its
//        checks fail: nosnap (the windows not snapped to whole texels, as the trees' shade map
//        was), hold (the frame's anchor held for 30 km: the x D / R term a small world shows),
//        noband (no blend band where one window hands over to the next), probe (the figure left
//        in full Sun, as it was), layer (the cloud layer taken afresh from the country under the
//        traveller every frame, as the game's own base was). The flat slide the ground did is in
//        check 3 for good.
//
// TWO ADDRESSINGS ARE MEASURED, SIDE BY SIDE:
//   'atlas'  what src/sky/cloudShade.js does: windows on a lattice fixed to the world, each
//            snapped to whole texels, read along the Sun's ray to a sphere R + 2 500 m.
//   'today'  what src/life/treeShade.js did before this package: a 256 x 256 map 55 m a point
//            on a level plane through the ground under the traveller, re-centred every frame
//            without snapping, read by sliding along the Sun to that plane.
// Checks 1 to 4 must pass for 'atlas' and fail for 'today': that is how they were seen to fail
// (the plan's replay had the map off by up to 0.44 while walking, and the ground's shadow edges
// sliding 3 m per 10 m walked and 70-150 m per 100 m flown).
import { localFrame } from '../src/core/ephemeris.js';
import { SKY_V0 } from '../src/sky/skyGlsl.js';
import { sampler2D } from './lib/glslSamplers.mjs';
import { runGlsl } from './lib/glslRun.mjs';

const argv = process.argv.slice(2);
const BREAK = argv.includes('--break') ? argv[argv.indexOf('--break') + 1] : null;
const BREAKS = ['nosnap', 'hold', 'noband', 'probe', 'layer'];
if (BREAK && !BREAKS.includes(BREAK)) { console.log(`no break ${BREAK} (${BREAKS.join(', ')})`); process.exit(2); }
if (BREAK) console.log(`(with a fault put in: ${BREAK})`);

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// ---- the module under test -------------------------------------------------------------------
let M = null, why = '';
try { M = await import('../src/sky/cloudShade.js'); } catch (e) { why = e.message; }
if (M && !(M.SHADE && M.shadeState && M.shadeStep && M.shadeUniforms && M.shadeTexelDir && M.shadeReadJS && M.SHADE_READ_GLSL)) {
  why = `src/sky/cloudShade.js is there but does not export the atlas's arithmetic (SHADE, shadeState, shadeStep, shadeUniforms, shadeTexelDir, shadeReadJS, SHADE_READ_GLSL)`;
  M = null;
}
if (!M) console.log(`(src/sky/cloudShade.js not usable yet: ${why})`);

// ---- the world and the field it stands in ------------------------------------------------------
const R = 250000;                       // Haven's radius (m)
const REF = M ? M.SHADE.REF : 2500;     // m above the sea: the reference sphere the atlas lies on
const Rs = R + REF;
const STRENGTH = 0.85;                  // how dark a full shadow is (haven.js clouds.shadow)
const D2R = Math.PI / 180;
const START = { lat: -54.395, lon: 38.285 };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / len(a));
const dirAt = (lat, lon) => { const la = lat * D2R, lo = lon * D2R; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
const at = (lat, lon, r) => mul(dirAt(lat, lon), r);
// a fixed spread of numbers (no Math.random in a test)
const spread = (i, k = 0) => { const x = Math.sin(i * 12.9898 + k * 78.233 + 0.5) * 43758.5453; return x - Math.floor(x); };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The cloud layer the shade is cast from. The game's layer stands `base` metres over "the
// country" - the elevation averaged over a few kilometres round THE TRAVELLER (cloudVolume.js
// setGround) - so it moved as the traveller did, and every shadow slid over the land with it.
// The atlas latches it at the first frame of a world and holds it (shadeLayer); the map as it
// was took it afresh every frame. Both are modelled here.
const COUNTRY = (d) => { const [x, y] = eastNorth(d); return 1500 + 900 * Math.sin(x / 9000) * Math.cos(y / 11000); };
const layerAt = (pos) => R + COUNTRY(norm(pos)) + 1200 + 0.3 * 3000;    // as sky/clouds.js has it

// the ground: 1 500 m above the sea with swells of a few hundred metres over a few kilometres
const O = dirAt(START.lat, START.lon), OF = localFrame(O);
// metres east and north of the opening place, for a direction
const eastNorth = (d) => [dot(d, OF.east) * R, dot(d, OF.north) * R];
const groundOf = (d) => { const [x, y] = eastNorth(d); return 1500 + 220 * Math.sin(x / 3100) + 180 * Math.sin(y / 2400 + 1.1); };

// The made-up sky: what the atlas's four channels hold over a place (a unit direction). It is
// not the game's cloud rule (sky-system-test.mjs checks that against its JS twin): it is a field
// with the heaps' own scales in it, so that the addressing is measured where it bites - edges
// about 80 m wide, masses a kilometre across, and a cover that changes over tens of kilometres.
function source(d) {
  const [x, y] = eastNorth(d);
  const mass = 0.5 + 0.35 * Math.sin(x / 940 + 0.3) * Math.sin(y / 1120 - 0.7) + 0.15 * Math.sin((x + y) / 310);
  const fine = 0.08 * Math.sin(x / 78) * Math.sin(y / 83);
  const cover = 0.45 + 0.4 * Math.sin(x / 21000 - 0.4) * Math.sin(y / 17000 + 0.9);
  const raw = Math.min(1, Math.max(0, (mass + fine) * cover * 1.8));
  const upper = 0.75 + 0.2 * Math.sin(x / 9000 + y / 11000);
  const sky = 0.8 + 0.15 * Math.sin(y / 14000);
  const top = (3200 + 1400 * Math.sin(x / 7000 - y / 9000)) / SKY_V0.TOP_M;
  return [raw, upper, sky, top];
}
// what a lit thing at height h (m above the sea) keeps of the Sun, by the one rule (skyGlsl.js)
const crisp = (x) => SKY_V0.SHADOW * sstep(SKY_V0.CRISP0, SKY_V0.CRISP1, x);
function lightOf(ch, h) {
  const top = ch[3] * SKY_V0.TOP_M, below = 1 - sstep(top - SKY_V0.TOP_SOFT, top + SKY_V0.TOP_SOFT, h);
  return [(1 - STRENGTH * crisp(ch[0]) * below) * ch[1], ch[2]];
}
// the truth, worked out at the place itself with no map in between (for check 4): along the
// Sun's ray from the place to the cloud layer
function truth(p, sun, layerR) {
  return lightOf(source(norm(hitSphere(p, sun, layerR))), len(p) - R);
}
// where the ray p + t sun crosses the sphere of radius Rr (the nearer crossing on the Sun's side
// for a place under it, the one behind for a place above it)
function hitSphere(p, sun, Rr) {
  const b = dot(p, sun), c = dot(p, p) - Rr * Rr, disc = b * b - c;
  const t = -b + Math.sqrt(Math.max(disc, 0));
  return add(p, mul(sun, t));
}

// the Sun: 25 degrees up, toward the north-east, at the opening place
function sunAt(elev, bearing) {
  const e = elev * D2R, b = bearing * D2R;
  return norm(add(mul(O, Math.sin(e)), add(mul(OF.east, Math.cos(e) * Math.sin(b)), mul(OF.north, Math.cos(e) * Math.cos(b)))));
}
const SUN = sunAt(25, 35);

// ---- the atlas as the game fills and reads it ---------------------------------------------------
// One traveller position -> the atlas's bytes and the uniforms its readers are handed.
class Atlas {
  constructor() {
    this.st = M.shadeState();
    this.W = M.SHADE.ATLAS_W; this.H = M.SHADE.ATLAS_H;
    this.bytes = new Uint8Array(this.W * this.H * 4);
    this.sampler = sampler2D(this.bytes, this.W, this.H, 4, { wrapS: 'repeat', wrapT: 'clamp' });
    this.u = null; this.near = ''; this.mid = ''; this.world = 0; this.reanchors = 0; this.sun = SUN; this.hold = undefined; this.layerR = 0;
  }
  // the traveller moved: the anchor and the windows follow (as a frame does), and whatever
  // window has moved is filled again
  step(pos) {
    const o = { snap: BREAK !== 'nosnap', hold: BREAK === 'hold' ? 30000 : this.hold };
    // the cloud layer, latched at the first frame of the world (the game: shadeLayer)
    this.layerR = BREAK === 'layer' ? layerAt(pos) : M.shadeLayer(this.st, layerAt(pos), 'haven');
    const r = M.shadeStep(this.st, pos, R, o);
    if (BREAK === 'noband') { this.st.bandNear = 0; this.st.bandMid = 0; }
    if (r.reanchored) this.reanchors++;
    this.u = M.shadeUniforms(this.st, pos, this.sun, R, STRENGTH);
    const an = this.st.anchor.join(), lr = Math.round(this.layerR);
    const kn = `${an}|${lr}|${this.st.nx},${this.st.ny}`, km = `${an}|${lr}|${this.st.mx},${this.st.my}`;
    if (kn !== this.near) { this._fill('near'); this.near = kn; }
    if (km !== this.mid) { this._fill('mid'); this.mid = km; }
    // (the world window once an atlas: it is in latitude and longitude, and the cloud layer it
    // is read at does not move - with --break layer it does, and the window is then left stale,
    // which the checks that break watches do not read)
    if (!this.world) { this._fill('world'); this.world = lr; }
    return r;
  }
  // the direction the cloud over a texel is read at: along the Sun to the layer
  up(d) { return norm(hitSphere(mul(d, Rs), this.sun, this.layerR)); }
  _fill(win) {
    const W = win === 'world' ? M.SHADE.WORLD_W : M.SHADE.WIN, H = win === 'world' ? M.SHADE.WORLD_H : M.SHADE.WIN;
    const d = [0, 0, 0], uv = [0, 0];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      M.shadeTexelDir(this.st, win, i, j, R, d);
      // (the writer: from the texel's own point on the reference sphere along the Sun to the
      // cloud layer, as shadeChannels does)
      const ch = win === 'near' ? source(this.up(d)) : meanSource(this, win, i, j);
      M.shadeTexelUV(win, i, j, uv);
      const o = (Math.round(uv[1] * this.H - 0.5) * this.W + Math.round(uv[0] * this.W - 0.5)) * 4;
      for (let k = 0; k < 4; k++) this.bytes[o + k] = Math.max(0, Math.min(255, Math.round(ch[k] * 255)));
    }
  }
  // (sun, sky) at a place (planet axes), as the ground, a crown, a rock or the figure reads it
  read(p) { return M.shadeReadJS(this.u, this.sampler, sub(p, this.cam), len(p) - R); }
  set cam(c) { this._cam = c; }
  get cam() { return this._cam; }
}
// The world window's texel is the mean of the shade over it, written back as a raw value whose
// crisp curve is that mean (the atlas's R channel is "the raw shade whose curve is the shade"):
// point-sampled at 1.5 km a texel a heap's edge would be a blotch kilometres across.
function meanSource(m, win, i, j) {
  const n = win === 'world' ? M.SHADE.WORLD_SAMPLES : M.SHADE.MID_SAMPLES, d = [0, 0, 0];
  let s = 0, up = 0, sky = 0, top = 0;
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    M.shadeTexelDir(m.st, win, i, j, R, d, (a + 0.5) / n - 0.5, (b + 0.5) / n - 0.5);
    const ch = source(m.up(d));
    s += crisp(ch[0]); up += ch[1]; sky += ch[2]; top += ch[3];
  }
  const k = 1 / (n * n);
  return [M.shadeRawOf(s * k), up * k, sky * k, top * k];
}

// ---- the trees' shade map as it was (the 'today' addressing) -------------------------------------
const TODAY = { SIZE: 256, WIDTH: 14000 };
class Today {
  constructor() {
    this.bytes = new Uint8Array(TODAY.SIZE * TODAY.SIZE);
    this.sampler = sampler2D(this.bytes, TODAY.SIZE, TODAY.SIZE, 1, { wrapS: 'clamp', wrapT: 'clamp' });
  }
  step(pos) {
    // life/treeShade.js: the map's middle is the ground under the traveller, its plane level there
    this.layerR = layerAt(pos);
    const r = len(pos), g = groundOf(norm(pos)), agl = r - R - g;
    const c = mul(pos, Math.max(0.5, (r - Math.max(0, agl)) / r));
    const f = localFrame(c);
    this.c = c; this.f = f;
    for (let j = 0; j < TODAY.SIZE; j++) for (let i = 0; i < TODAY.SIZE; i++) {
      const x = (i + 0.5) / TODAY.SIZE - 0.5, y = (j + 0.5) / TODAY.SIZE - 0.5;
      const p = add(c, add(mul(f.east, x * TODAY.WIDTH), mul(f.north, y * TODAY.WIDTH)));
      // (its writer: the flat slide to the cloud layer, the ground's own rule line for line)
      const pl = len(p), up = mul(p, 1 / pl);
      const uc = norm(add(p, mul(SUN, (this.layerR - pl) / Math.max(dot(up, SUN), 0.08))));
      const lit = 1 - STRENGTH * crisp(source(uc)[0]);
      this.bytes[j * TODAY.SIZE + i] = Math.max(0, Math.min(255, Math.round(lit * 255)));
    }
    return { reanchored: false };
  }
  // its reader (TREE_SHADE_VERT): slide along the Sun to the map's own plane, then look up
  read(p) {
    const d0 = sub(p, this.c), f = this.f;
    const d = sub(d0, mul(SUN, dot(d0, f.up) / Math.max(dot(SUN, f.up), 0.08)));
    const u = dot(d, f.east) / TODAY.WIDTH + 0.5, v = dot(d, f.north) / TODAY.WIDTH + 0.5;
    return [this.sampler.sample([u, v])[0], 1];
  }
}

// ---- the places the checks watch -----------------------------------------------------------------
// ground points fixed in the world, within 4 km of the walk (so that one window holds them all)
const WALK_PTS = [];
for (let i = 0; i < 24; i++) {
  const ea = 3600 * (spread(i, 1) - 0.5), no = 3600 * (spread(i, 2) - 0.5) + 1000;
  const d = norm(add(O, add(mul(OF.east, ea / R), mul(OF.north, no / R))));
  WALK_PTS.push(mul(d, R + groundOf(d)));
}
// a place `ea` m east and `no` m north of the opening place, on the ground
const groundPt = (ea, no) => { const d = norm(add(O, add(mul(OF.east, ea / R), mul(OF.north, no / R)))); return mul(d, R + groundOf(d)); };
// the traveller: on the ground, `ea` m east, looking from 1.7 m up
const walker = (ea, no) => { const d = norm(add(O, add(mul(OF.east, ea / R), mul(OF.north, no / R)))); return mul(d, R + groundOf(d) + 1.7); };

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { max: s[s.length - 1] ?? 0, p95: s[Math.floor(s.length * 0.95)] ?? 0, mean: s.reduce((a, b) => a + b, 0) / (s.length || 1) };
};

// ---- check 1: nothing moves because the traveller moved -------------------------------------------
// (a) walking 2 km in 1 m steps: a fixed ground point's shade must not move by one byte.
function walkCheck(kind) {
  const m = kind === 'atlas' ? new Atlas() : new Today();
  const frac = (x) => x - Math.round(x);
  let first = null, worst = 0, at0 = 0, grid = null, slide = 0;
  for (let s = 0; s <= 2000; s++) {
    const pos = walker(s, 0);
    m.cam = pos; m.step(pos);
    const now = WALK_PTS.map((p) => m.read(p)[0]);
    if (!first) first = now;
    for (let i = 0; i < now.length; i++) { const d = Math.abs(now[i] - first[i]); if (d > worst) { worst = d; at0 = s; } }
    // and the lattice itself: where in its texel a fixed place lies may not move at all
    if (kind === 'atlas') {
      const f = WALK_PTS.map((p) => M.shadeTexelAt(m.st, norm(p), 'near'));
      if (!grid) grid = f;
      else for (let i = 0; i < f.length; i++) slide = Math.max(slide, Math.abs(frac(f[i][0] - grid[i][0])), Math.abs(frac(f[i][1] - grid[i][1])));
    }
  }
  return { worst, at0, slide, reanchors: m.reanchors ?? 0 };
}
{
  const a = M ? walkCheck('atlas') : null, t = walkCheck('today');
  check(!!a && a.worst <= 1 / 255 && a.slide < 1e-9, `1a. walking 2 km in 1 m steps, the shade at 24 fixed ground points moves by at most one byte: ${a ? a.worst.toFixed(4) : 'no atlas'} (the map that follows the traveller: ${t.worst.toFixed(4)} at ${t.at0} m), and the lattice under them does not move at all (${a ? a.slide.toExponential(1) : '-'} of a texel)`);
  check(t.worst > 0.05, `1a. the trees' shade map as it was fails this check (${t.worst.toFixed(3)} at ${t.at0} m walked)`);
}
// (b) flying 30 km in 100 m steps: the shade at fixed places read from the same window, with the
// anchor held, must not move by one byte; across a re-anchor check 2's limit applies.
function flyCheck(kind) {
  const m = kind === 'atlas' ? new Atlas() : new Today();
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push(groundPt(1000 * i * 0.75 + 600 * (spread(i, 7) - 0.5), 1500 * (spread(i, 8) - 0.5)));
  const last = new Map(), windowOf = new Map();
  let same = 0, over = 0, hand = 0;
  for (let s = 0; s <= 300; s++) {
    const ea = s * 100, d = norm(add(O, mul(OF.east, ea / R))), pos = mul(d, R + groundOf(d) + 1200);
    m.cam = pos;
    const r = m.step(pos);
    for (let i = 0; i < pts.length; i++) {
      const v = m.read(pts[i])[0], w = kind === 'atlas' ? M.shadeWindowOf(m.u, sub(pts[i], pos)) : 0;
      const band = kind === 'atlas' && w >= 10;
      const had = last.get(i);
      if (had !== undefined) {
        const d2 = Math.abs(v - had);
        if (r.reanchored) over = Math.max(over, d2);
        else if (band || windowOf.get(i) >= 10) hand = Math.max(hand, d2);
        else same = Math.max(same, d2);
      }
      last.set(i, v); windowOf.set(i, w);
    }
  }
  return { same, over, hand, reanchors: m.reanchors ?? 0 };
}
{
  const a = M ? flyCheck('atlas') : null, t = flyCheck('today');
  check(!!a && a.same <= 1 / 255 && a.hand <= 0.03, `1b. flying 30 km, the shade at 40 fixed places moves by at most one byte between steps of 100 m while one window holds it (${a ? a.same.toFixed(4) : 'no atlas'}), and by at most 0.03 a step inside a window's blend band (${a ? a.hand.toFixed(4) : '-'}); the map as it was: ${t.same.toFixed(3)} a step`);
  check(t.same > 0.05, `1b. the map as it was fails this check (${t.same.toFixed(3)} per 100 m flown)`);
}

// ---- check 2: a re-anchor, and a window's edge ------------------------------------------------------
{
  // the grid's own shift at a re-anchor: how far a fixed place moves on the lattice (texels)
  let shiftN = 0, shiftM = 0, moved = 0;
  if (M) {
    const m = new Atlas();
    m.cam = walker(0, 0); m.step(m.cam);
    const st0 = { ...m.st, anchor: m.st.anchor.slice(), a: m.st.a.slice(), e: m.st.e.slice(), n: m.st.n.slice() };
    let found = null;
    for (let km = 1; km <= 400 && !found; km++) {
      const pos = walker(km * 1000, 0);
      m.cam = pos;
      if (m.step(pos).reanchored) found = pos;
    }
    check(!!found, `2. the anchor is kept until the traveller is far from it, then re-chosen (after ${found ? Math.round(len(sub(found, walker(0, 0))) / 1000) : '-'} km of flight)`);
    // the lattice's shift, over the near and middle windows
    // (the texel a place lies in, and where in it: only the fraction matters - the whole part
    // is which texel of the window, and the window follows the traveller by whole texels)
    const frac = (x) => x - Math.round(x);
    const shiftOf = (d, win) => {
      const a = M.shadeTexelAt(st0, d, win), b = M.shadeTexelAt(m.st, d, win);
      return Math.hypot(frac(b[0] - a[0]), frac(b[1] - a[1]));
    };
    const sN = [], sM = [];
    for (let i = 0; i < 400; i++) {
      const ea = 7000 * (spread(i, 3) - 0.5) * 2, no = 7000 * (spread(i, 4) - 0.5) * 2;
      sN.push(shiftOf(norm(groundPt(ea, no)), 'near'));
      sM.push(shiftOf(norm(groundPt(ea * 4, no * 4)), 'mid'));
    }
    shiftN = stats(sN).max; shiftM = stats(sM).max;
    // and what it does to the shade at fixed places (both windows, the same places)
    const before = new Atlas(); before.cam = walker(0, 0); before.step(before.cam);
    const after = new Atlas();
    after.st.anchor = m.st.anchor.slice(); after.st.a = m.st.a.slice(); after.st.e = m.st.e.slice(); after.st.n = m.st.n.slice();
    after.hold = 1e9; after.cam = before.cam; after.step(after.cam);
    const ds = [];
    for (let i = 0; i < 600; i++) {
      const p = groundPt(5000 * (spread(i, 5) - 0.5) * 2, 5000 * (spread(i, 6) - 0.5) * 2);
      ds.push(Math.abs(before.read(p)[0] - after.read(p)[0]));
    }
    const S = stats(ds);
    moved = S.p95;
    check(shiftN <= 0.25 && shiftM <= 0.25, `2. a re-anchor moves the lattice under a fixed place by at most a quarter of a texel: ${shiftN.toFixed(3)} texels over the near window, ${shiftM.toFixed(3)} over the middle one`);
    check(S.p95 <= 0.02, `2. a re-anchor changes the shade at fixed places by at most 0.02 (95th of 600 places): ${S.p95.toFixed(4)}, mean ${S.mean.toFixed(4)}, worst ${S.max.toFixed(4)}`);
  } else { check(false, '2. a re-anchor: no atlas'); check(false, '2. a re-anchor: no atlas'); check(false, '2. a re-anchor: no atlas'); }
  // a window's edge: a FIXED place is left behind by the near window as the traveller walks
  // away from it, 20 m a step (the band is the only thing that may change its shade)
  if (M) {
    const m = new Atlas(), p = groundPt(0, 0);
    let jump = 0, prev = null, from = 1, to = 1;
    for (let d = 2000; d < 12000; d += 20) {
      const pos = walker(-d, 0);
      m.cam = pos; m.hold = 1e9; m.step(pos);
      const v = m.read(p)[0];
      if (prev !== null) jump = Math.max(jump, Math.abs(v - prev));
      if (d === 2000) from = v;
      to = v; prev = v;
    }
    check(jump <= 0.03, `2. a fixed place left behind by the near window as the traveller walks 10 km away, 20 m a step: the shade steps by at most 0.03 (${jump.toFixed(4)}; ${from.toFixed(3)} near, ${to.toFixed(3)} from the middle window)`);
  } else check(false, "2. the window's edge: no atlas");
}

// ---- check 3: the writer and the reader meet on the sphere -----------------------------------------
{
  // a place 2 km above the reference sphere, the Sun 15 degrees up: the texel the reader asks for
  // must be the one whose own point stands on the Sun's ray through the place
  const sun15 = sunAt(15, 35);
  let worst = 0, worstToday = 0;
  for (let i = 0; i < 30; i++) {
    const p = groundPt(12000 * (spread(i, 9) - 0.5), 12000 * (spread(i, 10) - 0.5));
    const high = mul(norm(p), Rs + 2000);
    const want = hitSphere(high, sun15, Rs);
    if (M) {
      const m = new Atlas();
      m.sun = sun15; m.cam = high; m.step(high);
      worst = Math.max(worst, len(sub(M.shadeRayPointJS(m.u, sub(high, high)), want)));
    }
    // the flat slide the ground did: (layer - r) / max(dot(up, sun), 0.08) along the Sun
    const r = len(high), up = mul(high, 1 / r);
    const flat = add(high, mul(sun15, (Rs - r) / Math.max(dot(up, sun15), 0.08)));
    worstToday = Math.max(worstToday, len(sub(flat, want)));
  }
  check(!!M && worst <= 5, `3. the reader's texel stands on the Sun's ray through the place, 2 km over the sphere with the Sun 15 degrees up: within ${M ? worst.toFixed(2) : '-'} m (the flat slide the ground did: ${worstToday.toFixed(0)} m off)`);
  check(worstToday > 5, `3. the flat slide fails this check (${worstToday.toFixed(0)} m)`);
  // above the low cloud's top only the mid and high layers stand in the way (channel G alone)
  if (M) {
    let bad = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const ch = source(dirAt(START.lat + spread(i, 11) - 0.5, START.lon + spread(i, 12) - 0.5));
      const top = ch[3] * SKY_V0.TOP_M, above = M.shadeLightJS({ uShadeSun: [0, 0, 0, STRENGTH] }, ch, top + 400);
      if (Math.abs(above[0] - ch[1]) > 1e-6) bad++;
      n++;
    }
    check(!bad, `3. a reader above the low cloud's top takes only the Sun through the mid and high layers (${n - bad}/${n} places)`);
  } else check(false, '3. above the top: no atlas');
}

// ---- check 4: the ground, a crown, a far rock and the figure agree -----------------------------------
{
  // The same spot asked for by four readers: the ground at its vertex, a tree's crown 30 m up, a
  // far rock a metre up, and the figure through the probe (one texel read back from the atlas at
  // its feet). A crown 30 m up is lit through another part of the cloud - 64 m along the Sun's
  // ray at 25 degrees - so they are only alike where the sky above them is: where the true shade
  // at two of these places is the same, no reader may add a disagreement of its own.
  let same = 0, apart = 0; const ds = []; let dark = 0, n = 0;
  if (M) {
    const m = new Atlas();
    for (let i = 0; i < 120; i++) {
      const ea = 4000 * (spread(i, 13) - 0.5) * 2, no = 4000 * (spread(i, 14) - 0.5) * 2;
      const pos = walker(ea, no);
      m.cam = pos; m.step(pos);
      const g = groundPt(ea, no), gd = norm(g), h = len(g) - R;
      const places = [g, mul(gd, R + h + 30), mul(gd, R + h + 1)];
      const got = places.map((p) => m.read(p)[0]), want = places.map((p) => truth(p, SUN, m.layerR)[0]);
      const probe = BREAK === 'probe' ? 1 : M.shadeProbeJS(m.u, m.sampler, [g], R)[0].sun;
      same = Math.max(same, Math.abs(got[0] - probe));
      for (let k = 1; k < 3; k++) if (Math.abs(want[k] - want[0]) < 0.01) ds.push(Math.abs(got[k] - got[0]));
      apart = Math.max(apart, Math.abs(got[0] - want[0]));
      dark += 1 - got[0]; n++;
    }
  }
  const S4 = stats(ds);
  check(!!M && same <= 1 / 255, `4. the figure's probe reads the ground's own texel: within ${M ? same.toFixed(4) : '-'} of the ground at 120 places`);
  check(!!M && S4.p95 <= 0.03, `4. where the sky over the ground, a crown 30 m up and a far rock is the same, the three agree within 0.03 (95th of ${ds.length}): ${M ? S4.p95.toFixed(4) : '-'}, worst ${S4.max.toFixed(4)}; the atlas is within ${apart.toFixed(3)} of the shade worked out at the place itself`);
  check(!!M && dark / Math.max(n, 1) > 0.05, `4. the figure is no longer left in full Sun inside a cloud's shadow: it is ${M ? (dark / Math.max(n, 1)).toFixed(3) : '-'} darker than full Sun on the mean of 120 places (it was 1.0 everywhere)`);
}

// ---- check 5: the reader's GLSL is its JS twin ---------------------------------------------------
if (M) {
  const src = `${M.SHADE_READ_GLSL}
vec2 light(vec3 rel) { return cloudShadeLight(rel); }
float one(vec3 rel) { return cloudShade(rel); }`;
  const m = new Atlas(), pos = walker(300, -200);
  m.cam = pos; m.step(pos);
  const u = { ...m.u, tCloudShade: m.sampler };
  let err = '', worst = 0, worstOne = 0;
  try {
    const g = runGlsl(src, u);
    for (let i = 0; i < 200; i++) {
      // places from underfoot to 120 km off, on the ground and well above it
      const far = 120000 * spread(i, 15) ** 3, bear = 2 * Math.PI * spread(i, 16);
      const p = groundPt(far * Math.sin(bear), far * Math.cos(bear));
      const q = mul(norm(p), len(p) + 4000 * spread(i, 17) ** 2);
      const rel = sub(q, pos);
      const a = g.fn.light(rel), b = M.shadeReadJS(m.u, m.sampler, rel, len(q) - R);
      worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
      worstOne = Math.max(worstOne, Math.abs(g.fn.one(rel) - b[0]));
    }
  } catch (e) { err = e.message; }
  check(!err && worst < 2e-3 && worstOne < 2e-3, `5. the reader's GLSL gives its JS twin's answer within ${worst.toExponential(1)} at 200 places out to 120 km${err ? ` (it threw: ${err})` : ''}`);
} else check(false, "5. the reader's GLSL: no atlas");

// ---- check 6: no reader works the cloud rule out for itself ----------------------------------------
{
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  const bad = [];
  for (const [k, f] of [['the ground', '../src/terrain/terrainMaterial.js'], ['the trees\' shade', '../src/life/treeShade.js'], ['the far rocks', '../src/rocks/farRocks.js']]) {
    const s = read(f);
    if (/cloudHeap\s*\(|HEAP_GLSL/.test(s)) bad.push(`${k} still works the heaps out itself`);
    if (!/tCloudShade|SHADE_READ_GLSL|cloudShade\.js/.test(s)) bad.push(`${k} does not read the shade atlas`);
  }
  check(!bad.length, `6. the ground, the trees' shade and the far rocks read the one atlas and none of them works the cloud rule out again${bad.length ? ': ' + bad.join('; ') : ''}`);
}

console.log(failed ? `cloud-shade-test: ${failed} FAILED` : 'cloud-shade-test: all passed');
process.exit(failed ? 1 : 0);
