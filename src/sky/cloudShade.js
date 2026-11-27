// The clouds' shade, worked out once a frame into one map fixed to the world and read by
// everything that is lit: the ground, the trees, the far forest, the grass, the far rocks, and
// through a probe read back from the GPU the figure and the things near it
// (docs/briefs/sky-C-shade.md, package C of docs/briefs/clouds-weather-plan.md).
//
// WHY. Before this, five places worked the clouds' shadow out for themselves from the cloud
// rule: the ground at its vertices and per pixel, the far rocks in their vertex shader, and the
// trees, the far forest and the far grass through a 256 x 256 map (life/treeShade.js) that lay
// on a level plane through the ground under the traveller and was re-centred every frame
// without snapping. Two faults came of it. The map moved with the traveller, so a tree at a
// shadow's edge changed by up to 0.44 in light as one walked (and the ground's shadow edges
// slid 3 m per 10 m walked, 70-150 m per 100 m flown, because the cloud base followed the
// country under the traveller as well); and the figure, the near rocks, the lander, the leaves,
// the dust and the grass within 30 m were lit through uWeather.x, which on a world without
// Earth's weather maps was always 1: they stood in full Sun inside a cloud's shadow. The owner
// saw both: "the shadows need a lot of work: they get jumpy when I'm moving around near them".
//
// THE RULE: ONE WRITER. This file works the shade out once, at points on a sphere R + REF
// metres, and writes it into one RGBA8 atlas. Every reader asks the atlas where the Sun's ray
// through its own place crosses that sphere. Nothing about a shadow hangs on where the
// traveller stands: the traveller decides only which windows are drawn, never a value.
//
// THE ATLAS (one texture, ATLAS_W x ATLAS_H):
//   the world window   1024 x 512 in latitude and longitude (1.53 km a texel on Haven), a
//                      sixteenth of its rows a frame (whole while the clock runs fast)
//   the near window    256 x 256 at NEAR_STEP m (14 km across), drawn whole every frame
//   the middle window  256 x 256 at MID_STEP m (56 km across), drawn whole every frame
// The two windows lie on a lattice fixed to the world: one tangent frame, anchored at a fixed
// world point and kept until the traveller is HOLD m from it, and each window's first texel
// snapped to a whole texel of that frame. A fixed place therefore lands on the very same texel
// however the traveller moves, and its shade is the same byte (check 1 of
// scripts/cloud-shade-test.mjs). ONE frame serves both windows, where the plan had two: a
// second anchor 80 km away would stretch the middle window's lattice by 2.5 % at a re-anchor
// (the x D / R term a small world shows), where one anchor held for 10 km stretches both
// windows by 0.2 %, a quarter of a texel at either window's edge.
//
// THE CHANNELS of a texel (the plan's, skyGlsl.js's skyShade):
//   R  the raw shade of the low cloud along the ray toward the Sun - the value whose crisp
//      curve is the share of the Sun taken. Readers apply the curve, so a shadow's edge stays
//      sharp although the map is coarse.
//   G  the Sun left after the mid and high layers
//   B  the sky's light left under the cover
//   A  the top of the low cloud along that ray (m above the sea / TOP_M), so a peak standing
//      above a deck or above fog stays in sunlight.
// Where the world's weather is made by rule (the field, sky/skyField.js) the channels come from
// the shared rule's skyShade(), with fog from field C and the exact chord of every storm tower
// the ray crosses. Where there is no field they come from the rule the game draws with (the
// day's cloud map and the heaps carved from the noise, skyGlsl.js's cloudHeap), so that a world
// still looks as it did; one writer either way.
//
// COST. The atlas is about 163 k texels a frame (two windows whole, a sixteenth of the world
// window) at 4 to 6 texture reads each, in place of the ground's per-pixel rule, the trees'
// map, and the far rocks' own reads. The reader is one texture read (two in a window's blend
// band). The ground's fragment shader goes from 16 of 16 textures to 15.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { localFrame } from '../core/ephemeris.js';
import { makePassMaterial, fullscreenGeometry } from '../render/fullscreen.js';
import { glslOnce, FIELD_GLSL } from '../weather/sky/format.js';
import { HEAP_GLSL, SKY_FIELD_GLSL, SKY_V0, SKY_UNIFORMS } from './skyGlsl.js';
import { CELL_GLSL, CELL_VEC4 } from '../weather/sky/cellShape.js';

// The atlas's numbers (the GLSL below and the JS twins are made from them; change them here).
export const SHADE = Object.freeze({
  ATLAS_W: 1024, ATLAS_H: 768,      // the one texture (3 MB)
  WORLD_W: 1024, WORLD_H: 512,      // the world window, rows 0 .. 511: latitude and longitude
  WIN: 256,                         // the near and the middle window, texels a side
  NEAR_STEP: 55, MID_STEP: 220,     // m a texel (14 km and 56 km across)
  NEAR_X: 0, NEAR_Y: 512, MID_X: 256, MID_Y: 512,     // their corner in the atlas (texels)
  REF: 2500,                        // m above the sea: the sphere every texel stands on
  HOLD: 2000,                       // m: the frame's anchor is kept until the traveller is this far from it
  NEAR_BAND: 2400, MID_BAND: 6000,  // m: the band inside a window's edge over which the next one takes over
  MID_SAMPLES: 2,                   // the middle window's texel is the mean of this many squared samples
  NEAR_EVERY: 8, MID_EVERY: 24,     // frames after which a window is drawn again though nothing of its lattice has moved (the clouds drift: 20 m/s is 5 m in 8 frames, a tenth of a near texel)
  PROBE_EVERY: 4,                   // frames between two looks of the probe in play
  SUN_MOVE: 3e-4,                   // radians the Sun moves before both windows are drawn again (a quarter of a minute of the clock)
  EDGE: 1.5,                        // texels left unread at a window's edge (its own filter's footprint)
  WORLD_SAMPLES: 2,                 // and the world window's
  STRIPS: 16,                       // the world window's rows are redrawn this many frames apart
  RATE_WHOLE: 60,                   // above this many seconds of game time a second it is drawn whole
  CELL_LEN: 550,                    // m of a storm's tower that takes nearly all the Sun
  FOG_K: 0.004,                     // 1/m: how much of the Sun a metre of fog takes
  PROBE: 3,                         // texels read back for the figure and the things near it
});
const S = SHADE, V = SKY_V0;
const HALF = (S.WIN - 1) / 2;

// ---- the arithmetic, pure (the GPU's pass and the GLSL readers are made from the same) --------

const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mod = (x, m) => ((x % m) + m) % m;
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const xyz = (v) => (Array.isArray(v) || v instanceof Float64Array || v instanceof Float32Array ? [v[0], v[1], v[2]] : [v.x, v.y, v.z]);

// What the windows stand on: the frame's anchor, its east and north, and each window's first
// texel in that frame. Never read it from outside this file's own twins: it is the state of a
// lattice, not a thing in the world.
export function shadeState() {
  return { anchor: null, a: [0, 0, 1], e: [1, 0, 0], n: [0, 1, 0], phN: [0, 0], phM: [0, 0], nx: 0, ny: 0, mx: 0, my: 0, near: true, Rs: 0, R: 0 };
}

// A place (unit direction) in the frame: metres east and north on the plane that touches the
// reference sphere at the anchor (a gnomonic projection: exact both ways, and one divide).
export function shadeProject(st, d, out = [0, 0]) {
  const k = st.Rs / dot3(d, st.a);
  out[0] = dot3(d, st.e) * k; out[1] = dot3(d, st.n) * k;
  return out;
}
// ... and back: the point on the reference sphere (m, planet axes).
export function shadeUnproject(st, x, y, out = [0, 0, 0]) {
  const a = st.a, e = st.e, n = st.n, Rs = st.Rs;
  const vx = a[0] * Rs + e[0] * x + n[0] * y, vy = a[1] * Rs + e[1] * x + n[1] * y, vz = a[2] * Rs + e[2] * x + n[2] * y;
  const k = Rs / Math.hypot(vx, vy, vz);
  out[0] = vx * k; out[1] = vy * k; out[2] = vz * k;
  return out;
}

// The lattice of a window: its texel centres stand at `ph + i * step` in the frame, so that the
// window's first texel can follow the traveller in whole texels and the lattice itself not move.
const latSnap = (t, ph, step) => ph + Math.round((t - ph) / step) * step;

// The traveller moved (once a frame, before the atlas is drawn). The frame's anchor is kept
// until the traveller is HOLD m from it; each window's first texel is snapped to its lattice;
// and at a re-anchor the lattice is carried over, so that the place the traveller stands at
// keeps the very texel it had. Returns { reanchored }.
export function shadeStep(st, pos, R, opts = {}) {
  const hold = opts.hold ?? S.HOLD, snap = opts.snap !== false;
  const p = xyz(pos), r = Math.hypot(p[0], p[1], p[2]) || 1, d = [p[0] / r, p[1] / r, p[2] / r];
  st.R = R; st.Rs = R + S.REF;
  let reanchored = false;
  if (!st.anchor || Math.hypot(d[0] - st.anchor[0], d[1] - st.anchor[1], d[2] - st.anchor[2]) * R > hold) {
    // what the old lattice held nearest the traveller, as two points of the world: the new
    // lattice is laid through them
    let hold0 = null;
    if (st.anchor) {
      const t0 = shadeProject(st, d);
      hold0 = {
        n: shadeUnproject(st, latSnap(t0[0], st.phN[0], S.NEAR_STEP), latSnap(t0[1], st.phN[1], S.NEAR_STEP)),
        m: shadeUnproject(st, latSnap(t0[0], st.phM[0], S.MID_STEP), latSnap(t0[1], st.phM[1], S.MID_STEP)),
      };
    }
    // The axes are carried over too, not taken afresh from east and north: the meridians
    // converge (3.5 degrees over 11 km at latitude 54), and a frame turned by that would turn
    // the whole lattice under the world. What is left is the gnomonic stretch between two
    // anchors, about 0.01 % of a place's distance per kilometre the anchor moves - at a hold of
    // HOLD m, a tenth of a texel at either window's edge (check 2 of scripts/cloud-shade-test.mjs).
    const a = d.slice();
    let e = null;
    if (st.anchor) {
      const k = dot3(st.e, a), ex = st.e[0] - a[0] * k, ey = st.e[1] - a[1] * k, ez = st.e[2] - a[2] * k;
      const l = Math.hypot(ex, ey, ez);
      if (l > 1e-3) e = [ex / l, ey / l, ez / l];
    }
    if (e) { st.a = a; st.e = e; st.n = [a[1] * e[2] - a[2] * e[1], a[2] * e[0] - a[0] * e[2], a[0] * e[1] - a[1] * e[0]]; }
    else { const f = localFrame(a, [0, 0, 0], [0, 0, 0], [0, 0, 0]); st.a = f.up; st.e = f.east; st.n = f.north; }
    st.anchor = a;
    const phase = (P, step) => { const t = shadeProject(st, norm3(P)); return [mod(t[0], step), mod(t[1], step)]; };
    st.phN = hold0 ? phase(hold0.n, S.NEAR_STEP) : [0, 0];
    st.phM = hold0 ? phase(hold0.m, S.MID_STEP) : [0, 0];
    reanchored = true;
  }
  const t = shadeProject(st, d);
  const first = (v, ph, step) => (snap ? latSnap(v, ph, step) : v) - (S.WIN / 2) * step;
  st.nx = first(t[0], st.phN[0], S.NEAR_STEP); st.ny = first(t[1], st.phN[1], S.NEAR_STEP);
  st.mx = first(t[0], st.phM[0], S.MID_STEP); st.my = first(t[1], st.phM[1], S.MID_STEP);
  return { reanchored };
}

// The unit direction of texel (i, j) of a window ('near', 'mid' or 'world'); ox and oy offset
// it inside its own texel (the world window's mean of several samples).
export function shadeTexelDir(st, win, i, j, R, out = [0, 0, 0], ox = 0, oy = 0) {
  if (win === 'world') {
    const lon = (i + 0.5 + ox) / S.WORLD_W * 2 * Math.PI, colat = (j + 0.5 + oy) / S.WORLD_H * Math.PI;
    out[0] = Math.sin(colat) * Math.cos(lon); out[1] = Math.sin(colat) * Math.sin(lon); out[2] = Math.cos(colat);
    return out;
  }
  const step = win === 'near' ? S.NEAR_STEP : S.MID_STEP;
  const x = (win === 'near' ? st.nx : st.mx) + (i + ox) * step, y = (win === 'near' ? st.ny : st.my) + (j + oy) * step;
  shadeUnproject(st, x, y, out);
  const k = 1 / Math.hypot(out[0], out[1], out[2]);
  out[0] *= k; out[1] *= k; out[2] *= k;
  return out;
}
// ... and where that texel is in the atlas (uv of its centre).
export function shadeTexelUV(win, i, j, out = [0, 0]) {
  const at = win === 'near' ? [S.NEAR_X, S.NEAR_Y] : win === 'mid' ? [S.MID_X, S.MID_Y] : [0, 0];
  out[0] = (at[0] + i + 0.5) / S.ATLAS_W; out[1] = (at[1] + j + 0.5) / S.ATLAS_H;
  return out;
}
// Where a place (unit direction) lies in a window, in texels from its first texel's centre.
// How far this moves (its fraction: the whole part is only which texel) when the frame is
// re-anchored is how far the shade's grid slides under the world.
export function shadeTexelAt(st, d, win) {
  const step = win === 'near' ? S.NEAR_STEP : S.MID_STEP, x0 = win === 'near' ? st.nx : st.mx, y0 = win === 'near' ? st.ny : st.my;
  const t = shadeProject(st, d);
  return [(t[0] - x0) / step, (t[1] - y0) / step];
}

// The radius at which the cloud rule's pattern is read, where a world's weather is not made by
// rule yet (no field): the cloud layer's own radius, but LATCHED at the first frame of a world
// and held. The layer the game draws stands `base` metres over "the country", and the country
// is the elevation map averaged over +-0.4 degrees round THE TRAVELLER (sky/cloudVolume.js,
// setGround): it therefore moves as the traveller does, by 25 to 51 m per 100 m flown, and the
// shadows of the clouds slid over the land at 70 to 150 m per 100 m at a low Sun - the owner's
// "they move when I move". Held still, the shade is fixed to the world; the cost is that where
// the country is far higher or lower than it is where the world opened, the drawn cloud and its
// shadow are not over one another. The field's own per-place base (A) ends both faults: where
// there is a field, skyShade() takes the base from it and nothing here is used.
export function shadeLayer(st, layerNow, world) {
  if (st.world !== world) { st.world = world; st.layerR = 0; }
  if (!(st.layerR > 0) && layerNow > 0) st.layerR = layerNow;
  return st.layerR || layerNow || 0;
}

// What a frame hands the readers (and the atlas's own pass): plain arrays, the very numbers the
// uniforms are filled from, so that the JS twins below answer exactly as the shaders do.
//   cam: the camera (m, planet axes); sun: toward the Sun (unit); strength: how dark a full
//   shadow is (0: no cloud casts one anywhere).
export function shadeUniforms(st, cam, sun, R, strength, out = {}) {
  const c = xyz(cam), s = xyz(sun);
  out.uShadeCam = [c[0], c[1], c[2], st.Rs];
  out.uShadeSun = [s[0], s[1], s[2], strength];
  out.uShadeA = [st.a[0], st.a[1], st.a[2], R];
  out.uShadeE = [st.e[0], st.e[1], st.e[2], st.nx];
  out.uShadeN = [st.n[0], st.n[1], st.n[2], st.ny];
  out.uShadeStep = [st.near ? 1 / S.NEAR_STEP : 0, 1 / S.MID_STEP, st.mx, st.my];
  out.uShadeBand = [(st.bandNear ?? S.NEAR_BAND) / S.NEAR_STEP, (st.bandMid ?? S.MID_BAND) / S.MID_STEP, 0, 0];
  return out;
}

// The raw shade whose crisp curve is the share `take` of the Sun (0 .. SHADOW): the inverse of
// the curve below. The world window writes it, because the mean of the shade over a 1.5 km
// texel is not the shade of the mean; so does a cloud whose shade is smooth by nature (fog, a
// storm's tower, a cloud map with no heaps in it).
export function shadeRawOf(take) {
  const y = clamp(take / V.SHADOW, 0, 1);
  const x = 0.5 - Math.sin(Math.asin(clamp(1 - 2 * y, -1, 1)) / 3);
  return V.CRISP0 + (V.CRISP1 - V.CRISP0) * x;
}
// The crisp edge of a cloud's shadow (skyGlsl.js's skyShadeCrisp, the one rule).
export const shadeCrispJS = (x) => V.SHADOW * sstep(V.CRISP0, V.CRISP1, x);
// What a lit thing at height h (m above the sea) takes from a texel: x the share of the Sun's
// light, y of the sky's (skyGlsl.js's skyShadeLight, with the atlas's own strength).
export function shadeLightJS(u, s, h) {
  const top = s[3] * V.TOP_M, below = 1 - sstep(top - V.TOP_SOFT, top + V.TOP_SOFT, h);
  return [(1 - u.uShadeSun[3] * shadeCrispJS(s[0]) * below) * s[1], s[2]];
}
// The point on the reference sphere whose ray toward the Sun passes through a place `rel` metres
// from the camera (planet axes); null where that ray never crosses the sphere.
export function shadeRayPointJS(u, rel) {
  const c = u.uShadeCam, s = u.uShadeSun, Rs = c[3];
  const p = [c[0] + rel[0], c[1] + rel[1], c[2] + rel[2]];
  const b = dot3(p, s), disc = b * b - (dot3(p, p) - Rs * Rs);
  if (!(disc > 0)) return null;
  const t = Math.sqrt(disc) - b;
  return [p[0] + s[0] * t, p[1] + s[1] * t, p[2] + s[2] * t];
}
const winWeight = (fx, fy, bandT) => 1 - sstep(S.WIN * 0.5 - S.EDGE - bandT, S.WIN * 0.5 - S.EDGE, Math.max(Math.abs(fx - HALF), Math.abs(fy - HALF)));
const atlasWin = (sampler, at, fx, fy) => sampler.sample([(at[0] + 0.5 + clamp(fx, 0, S.WIN - 1)) / S.ATLAS_W, (at[1] + 0.5 + clamp(fy, 0, S.WIN - 1)) / S.ATLAS_H]);
const atlasWorld = (sampler, d) => sampler.sample([Math.atan2(d[1], d[0]) / (2 * Math.PI), clamp(Math.acos(clamp(d[2], -1, 1)) / Math.PI * (S.WORLD_H / S.ATLAS_H), 0.5 / S.ATLAS_H, (S.WORLD_H - 0.5) / S.ATLAS_H)]);
const mix2 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

// The reader, in JS: what the clouds leave of the Sun's light and of the sky's at a place `rel`
// metres from the camera (planet axes). The twin of cloudShadeLight() below, line for line.
//   u: shadeUniforms' record; sampler: the atlas read as a GPU reads it (LINEAR, no mipmaps,
//   REPEAT across the atlas's width).
export function shadeReadJS(u, sampler, rel) {
  if (!(u.uShadeSun[3] > 0)) return [1, 1];
  const c = u.uShadeCam, Rs = c[3];
  const p = [c[0] + rel[0], c[1] + rel[1], c[2] + rel[2]];
  const h = Math.hypot(p[0], p[1], p[2]) - u.uShadeA[3];
  const q = shadeRayPointJS(u, rel);
  if (!q) return [1, 1];
  const d = [q[0] / Rs, q[1] / Rs, q[2] / Rs];
  const ka = dot3(d, u.uShadeA);
  if (ka < 0.5) return shadeLightJS(u, atlasWorld(sampler, d), h);
  const k = Rs / ka, x = dot3(d, u.uShadeE) * k, y = dot3(d, u.uShadeN) * k;
  const fnx = (x - u.uShadeE[3]) * u.uShadeStep[0], fny = (y - u.uShadeN[3]) * u.uShadeStep[0];
  const wn = u.uShadeStep[0] > 0 ? winWeight(fnx, fny, u.uShadeBand[0]) : 0;
  if (wn >= 1) return shadeLightJS(u, atlasWin(sampler, [S.NEAR_X, S.NEAR_Y], fnx, fny), h);
  const fmx = (x - u.uShadeStep[2]) * u.uShadeStep[1], fmy = (y - u.uShadeStep[3]) * u.uShadeStep[1];
  const wm = winWeight(fmx, fmy, u.uShadeBand[1]);
  const mid = () => shadeLightJS(u, atlasWin(sampler, [S.MID_X, S.MID_Y], fmx, fmy), h);
  const world = () => shadeLightJS(u, atlasWorld(sampler, d), h);
  const rest = wm >= 1 ? mid() : wm <= 0 ? world() : mix2(world(), mid(), wm);
  if (wn <= 0) return rest;
  return mix2(rest, shadeLightJS(u, atlasWin(sampler, [S.NEAR_X, S.NEAR_Y], fnx, fny), h), wn);
}
// Which window a place is read from (0 near, 1 middle, 2 the world): for the tests.
export function shadeWindowOf(u, rel) {
  const q = shadeRayPointJS(u, rel);
  if (!q) return 2;
  const Rs = u.uShadeCam[3], d = [q[0] / Rs, q[1] / Rs, q[2] / Rs], ka = dot3(d, u.uShadeA);
  if (ka < 0.5) return 2;
  const k = Rs / ka, x = dot3(d, u.uShadeE) * k, y = dot3(d, u.uShadeN) * k;
  const wn = u.uShadeStep[0] > 0 ? winWeight((x - u.uShadeE[3]) * u.uShadeStep[0], (y - u.uShadeN[3]) * u.uShadeStep[0], u.uShadeBand[0]) : 0;
  if (wn > 0 && wn < 1) return 10;
  if (wn >= 1) return 0;
  const wm = winWeight((x - u.uShadeStep[2]) * u.uShadeStep[1], (y - u.uShadeStep[3]) * u.uShadeStep[1], u.uShadeBand[1]);
  if (wm > 0 && wm < 1) return 11;
  return wm >= 1 ? 1 : 2;
}
// The probe, in JS: the atlas read at each of a few places (points in planet axes), as the GPU
// pass reads them back for the figure and the things near it.
export function shadeProbeJS(u, sampler, points, R) {
  const c = u.uShadeCam;
  return points.map((p) => {
    const q = xyz(p), v = shadeReadJS(u, sampler, [q[0] - c[0], q[1] - c[1], q[2] - c[2]]);
    return { sun: v[0], sky: v[1] };
  });
}

// ---- the readers' uniforms and GLSL -------------------------------------------------------------

// One set of uniform objects for every shader that is shaded by a cloud: never replaced (the
// materials hold these very objects; CloudShade.render fills them in place).
export const CLOUD_SHADE_UNIFORMS = {
  tCloudShade: { value: null },
  uShadeCam: { value: new THREE.Vector4(0, 0, 0, 1) },   // xyz the camera (m, planet axes), w the reference sphere's radius (m)
  uShadeSun: { value: new THREE.Vector4(0, 0, 1, 0) },   // xyz toward the Sun, w how dark a full shadow is (0: none anywhere)
  uShadeA: { value: new THREE.Vector4(0, 0, 1, 1) },     // xyz the windows' anchor (unit), w the world's radius (m)
  uShadeE: { value: new THREE.Vector4(1, 0, 0, 0) },     // xyz its east, w the near window's first texel in the frame (m)
  uShadeN: { value: new THREE.Vector4(0, 1, 0, 0) },     // xyz its north, w the same, north
  uShadeStep: { value: new THREE.Vector4(0, 0, 0, 0) },  // x 1 / the near texel (0: no near window), y the middle's, zw its first texel (m)
  uShadeBand: { value: new THREE.Vector4(0, 0, 0, 0) },  // xy the band inside the near and the middle window's edge over which the next takes over (texels)
};

// The frame the atlas is written and read in (one declaration however many of these texts a
// shader takes).
export const SHADE_FRAME_GLSL = glslOnce('CLOUD_SHADE_FRAME', /* glsl */`
// the cloud-shade atlas's frame (src/sky/cloudShade.js)
uniform vec4 uShadeCam;   // xyz the camera (m, planet axes), w the reference sphere's radius (m)
uniform vec4 uShadeSun;   // xyz toward the Sun (unit), w how dark a full shadow is (0: no cloud casts one)
uniform vec4 uShadeA;     // xyz the windows' anchor (unit), w the world's radius (m)
uniform vec4 uShadeE;     // xyz its east, w the near window's first texel in the frame (m)
uniform vec4 uShadeN;     // xyz its north, w the same, north
uniform vec4 uShadeStep;  // x 1 / the near window's texel (1/m; 0: no near window), y the middle's, zw its first texel (m)
uniform vec4 uShadeBand;  // xy the blend band inside the near and the middle window's edge (texels)
const float SHADE_RS_W = ${glf(S.ATLAS_W)};
const float SHADE_RS_H = ${glf(S.ATLAS_H)};
const float SHADE_WIN = ${glf(S.WIN)};
const float SHADE_WORLD_V = ${glf(S.WORLD_H / S.ATLAS_H)};
const float SHADE_SHADOW = ${glf(V.SHADOW)};
const float SHADE_CRISP0 = ${glf(V.CRISP0)};
const float SHADE_CRISP1 = ${glf(V.CRISP1)};
const float SHADE_TOP_M = ${glf(V.TOP_M)};
const float SHADE_TOP_SOFT = ${glf(V.TOP_SOFT)};
const float SHADE_MU_MIN = ${glf(V.MU_MIN)};
// the crisp edge of a cloud's shadow: the share of the Sun a raw shade takes (skyShadeCrisp)
float shadeCrisp(float x) { return SHADE_SHADOW * smoothstep(SHADE_CRISP0, SHADE_CRISP1, x); }
// and the raw shade whose curve is a given share (the world window writes it, and so does a
// cloud whose shade is smooth by nature: fog, a storm's tower, a map with no heaps in it)
float shadeRaw(float take) {
  float y = clamp(take / SHADE_SHADOW, 0.0, 1.0);
  return SHADE_CRISP0 + (SHADE_CRISP1 - SHADE_CRISP0) * (0.5 - sin(asin(clamp(1.0 - 2.0 * y, -1.0, 1.0)) / 3.0));
}
// where the ray p + t toSun crosses the sphere of radius Rr (w 0: it never does)
vec4 shadeHit(vec3 p, vec3 toSun, float Rr) {
  float b = dot(p, toSun), disc = b * b - (dot(p, p) - Rr * Rr);
  if (disc <= 0.0) return vec4(0.0);
  return vec4(p + toSun * (sqrt(disc) - b), 1.0);
}`);

// What a lit thing reads: one texture read (two in a window's blend band). rel is the place
// from the camera, in metres, in the planet's axes - the same argument the trees' shade map
// took, so that trees.js, farForest.js and grass.js are unchanged.
export const SHADE_READ_GLSL = SHADE_FRAME_GLSL + glslOnce('CLOUD_SHADE_READ', /* glsl */`
uniform sampler2D tCloudShade;   // the cloud-shade atlas (src/sky/cloudShade.js)
const vec2 SHADE_NEAR_AT = vec2(${glf(S.NEAR_X)}, ${glf(S.NEAR_Y)});
const vec2 SHADE_MID_AT = vec2(${glf(S.MID_X)}, ${glf(S.MID_Y)});
const float SHADE_EDGE = ${glf(S.EDGE)};
// what a lit thing at height h (m above the sea) takes from a texel: x the Sun's share, y the sky's
vec2 shadeLight(vec4 s, float h) {
  float top = s.w * SHADE_TOP_M;
  float below = 1.0 - smoothstep(top - SHADE_TOP_SOFT, top + SHADE_TOP_SOFT, h);
  return vec2((1.0 - uShadeSun.w * shadeCrisp(s.x) * below) * s.y, s.z);
}
vec4 shadeAtWin(vec2 at, vec2 f) { return textureLod(tCloudShade, (at + 0.5 + clamp(f, 0.0, SHADE_WIN - 1.0)) / vec2(SHADE_RS_W, SHADE_RS_H), 0.0); }
vec4 shadeAtWorld(vec3 d) {
  float v = acos(clamp(d.z, -1.0, 1.0)) * ${glf(1 / Math.PI)} * SHADE_WORLD_V;
  return textureLod(tCloudShade, vec2(atan(d.y, d.x) * ${glf(1 / (2 * Math.PI))}, clamp(v, 0.5 / SHADE_RS_H, (${glf(S.WORLD_H)} - 0.5) / SHADE_RS_H)), 0.0);
}
float shadeWinW(vec2 f, float band) { return 1.0 - smoothstep(SHADE_WIN * 0.5 - SHADE_EDGE - band, SHADE_WIN * 0.5 - SHADE_EDGE, max(abs(f.x - ${glf(HALF)}), abs(f.y - ${glf(HALF)}))); }
vec2 cloudShadeLight(vec3 rel) {
  if (uShadeSun.w <= 0.0) return vec2(1.0);
  vec3 p = uShadeCam.xyz + rel;
  float h = length(p) - uShadeA.w;
  vec4 q = shadeHit(p, uShadeSun.xyz, uShadeCam.w);
  if (q.w < 0.5) return vec2(1.0);
  vec3 d = q.xyz / uShadeCam.w;
  float ka = dot(d, uShadeA.xyz);
  if (ka < 0.5) return shadeLight(shadeAtWorld(d), h);
  vec2 xy = vec2(dot(d, uShadeE.xyz), dot(d, uShadeN.xyz)) * (uShadeCam.w / ka);
  vec2 fn = (xy - vec2(uShadeE.w, uShadeN.w)) * uShadeStep.x;
  float wn = uShadeStep.x > 0.0 ? shadeWinW(fn, uShadeBand.x) : 0.0;
  if (wn >= 1.0) return shadeLight(shadeAtWin(SHADE_NEAR_AT, fn), h);
  vec2 fm = (xy - uShadeStep.zw) * uShadeStep.y;
  float wm = shadeWinW(fm, uShadeBand.y);
  vec2 rest = wm >= 1.0 ? shadeLight(shadeAtWin(SHADE_MID_AT, fm), h)
    : wm <= 0.0 ? shadeLight(shadeAtWorld(d), h)
    : mix(shadeLight(shadeAtWorld(d), h), shadeLight(shadeAtWin(SHADE_MID_AT, fm), h), wm);
  return wn <= 0.0 ? rest : mix(rest, shadeLight(shadeAtWin(SHADE_NEAR_AT, fn), h), wn);
}
// how much of the Sun the clouds leave a place (the name every tree, blade and rock reads by)
float cloudShade(vec3 rel) { return cloudShadeLight(rel).x; }`);

// How wet the ground is at a place, from the weather field's own map (the ground asks at its
// vertices and carries it in vCloud.z; where there is no field, the traveller's own uWeather.z,
// as before). Its sampler is its own, so that a shader that reads nothing else of the field
// does not declare the field's three maps.
export const CLOUD_WET_UNIFORMS = {
  tCloudWet: { value: null },     // the field's B map ('now'), or a white one
  uCloudWet: { value: 0 },        // 1 when that map is there
};
export const SHADE_WET_GLSL = FIELD_GLSL + glslOnce('CLOUD_SHADE_WET', /* glsl */`
uniform sampler2D tCloudWet;   // the weather field's B map: how wet the ground is (src/sky/cloudShade.js)
uniform float uCloudWet;       // 1 when it is there (0: the traveller's own uWeather.z)
float cloudWet(vec3 dir, float here) { return uCloudWet > 0.5 ? wxWet(wxRead(tCloudWet, dir)) : here; }`);

// ---- the atlas's own pass ------------------------------------------------------------------------

// The four channels at a point on the reference sphere. Where the world's weather is made by
// rule the shared rule answers (skyShade, with fog and the storms' chords); where it is not,
// the rule the game draws with (the day's map and its heaps), so that a world looks as it did.
const WRITE_GLSL = /* glsl */`
precision highp sampler3D;
${SHADE_FRAME_GLSL}
${SKY_FIELD_GLSL}
${HEAP_GLSL}
${CELL_GLSL}
uniform sampler2D tClouds;     // the day's cloud map (the rule as the game draws it)
uniform vec4 uCloud;           // x how dark the shadow is, y the cloud layer's radius (m), z the map's longitude shift (turns)
uniform vec4 uCloudHeap;       // x 1 - the layer's cover, y the fair-weather cover, w 1: shade by the heaps
uniform vec4 uCloudVol;        // the heaps' scales, w the low pattern's rise (m)
uniform vec4 uShadeLayer;      // x the radius the cloud rule's pattern is read at (m), held still against the world
const float SHADE_CELL_LEN = ${glf(S.CELL_LEN)};
const float SHADE_FOG_K = ${glf(S.FOG_K)};
// The share of the Sun the storm towers take along the ray: each tower's exact chord
// (weather/sky/cellShape.js). A cheap reject first, so that a cell costs nothing where its
// shadow cannot fall.
float shadeCells(vec3 P, vec3 toSun, float mu) {
  float take = 0.0;
  for (int k = 0; k < uCellCount; k++) {
    vec4 a = uCells[k * ${CELL_VEC4}], b = uCells[k * ${CELL_VEC4} + 1], dd = uCells[k * ${CELL_VEC4} + 3];
    if (dd.y <= 0.0) continue;
    vec3 Pm = P + toSun * max((a.w + 0.5 * dd.x - length(P)) / mu, 0.0);
    float hd = length(Pm - a.xyz * dot(Pm, a.xyz));
    if (hd > b.w * 2.2 + dd.x) continue;
    take = 1.0 - (1.0 - take) * exp(-cellLight(k, P, toSun) / SHADE_CELL_LEN);
  }
  return take;
}
vec4 shadeChannels(vec3 P, vec3 toSun) {
  float r = length(P);
  vec3 up = P / r;
  float mu = max(dot(up, toSun), SHADE_MU_MIN);
  if (uSkyLow.w > 0.5) {
    // the world's own weather: the shared rule, and the things whose shade is smooth
    vec4 s = skyShade(P, toSun);
    vec4 c = wxRead(tWxC, up);
    float fogTop = wxFogTop(c), deep = max(fogTop - wxCountry(c), 0.0);
    float soft = deep > 0.0 ? 1.0 - exp(-SHADE_FOG_K * deep / mu) : 0.0;
    if (uCellCount > 0) soft = 1.0 - (1.0 - soft) * (1.0 - shadeCells(P, toSun, mu));
    s.x = max(s.x, shadeRaw(soft * SHADE_SHADOW));
    if (deep > 0.0) s.w = max(s.w, clamp(fogTop / SHADE_TOP_M, 0.0, 1.0));
    return s;
  }
  // the rule the game draws with: the day's map at the layer's own radius, and its heaps
  vec4 hit = shadeHit(P, toSun, uShadeLayer.x);
  vec3 uc = hit.w > 0.5 ? normalize(hit.xyz) : up;
  float cd = textureLod(tClouds, vec2(atan(uc.y, uc.x) * ${glf(1 / (2 * Math.PI))} + uCloud.z, acos(clamp(uc.z, -1.0, 1.0)) * ${glf(1 / Math.PI)}), 0.0).r;
  float raw = uCloudHeap.w > 0.5
    ? cloudHeap(tCloudNoise, uc, cd, uCloudHeap.x, uCloudHeap.y, uCloudVol, uCloudSteer, 0.0).x
    : shadeRaw(smoothstep(0.2, 0.7, cd) * SHADE_SHADOW);
  return vec4(raw, 1.0, 1.0, clamp((uShadeLayer.x - uShadeA.w) / SHADE_TOP_M, 0.0, 1.0));
}`;

// The near and the middle window: vUv runs over the window, so a fragment is a texel's centre.
const WIN_FRAG = /* glsl */`
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${WRITE_GLSL}
uniform vec4 uShadeDraw;       // xy the window's first texel in the frame (m), z m a texel, w samples a side
void main() {
  vec2 f = vUv * SHADE_WIN - 0.5;
  int n = int(uShadeDraw.w + 0.5);
  float k = 1.0 / float(n * n), take = 0.0, raw0 = 0.0;
  vec4 sum = vec4(0.0);
  for (int b = 0; b < n; b++) for (int a = 0; a < n; a++) {
    vec2 o = n > 1 ? (vec2(float(a) + 0.5, float(b) + 0.5) / float(n) - 0.5) : vec2(0.0);
    vec2 xy = uShadeDraw.xy + (f + o) * uShadeDraw.z;
    vec3 P = normalize(uShadeA.xyz * uShadeCam.w + uShadeE.xyz * xy.x + uShadeN.xyz * xy.y) * uShadeCam.w;
    vec4 s = shadeChannels(P, uShadeSun.xyz);
    if (a == 0 && b == 0) raw0 = s.x;
    take += shadeCrisp(s.x) * k;
    sum += vec4(0.0, s.y, s.z, s.w) * k;
  }
  // (one sample: the raw shade itself, so that a near shadow's edge keeps its place; several:
  // the mean of the shade, written back as the raw value whose curve is that mean)
  fragColor = vec4(n > 1 ? shadeRaw(take) : raw0, sum.y, sum.z, sum.w);
}`;

// The world window: latitude and longitude, and the mean of a few samples over a texel (at
// 1.5 km a texel a heap's edge point-sampled would be a blotch kilometres across). The mean
// of the shade is written back as the raw value whose curve is that mean.
const WORLD_FRAG = /* glsl */`
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${WRITE_GLSL}
uniform vec4 uShadeDraw;       // w: samples a side
void main() {
  int n = int(uShadeDraw.w + 0.5);
  float k = 1.0 / float(n * n);
  vec4 sum = vec4(0.0);
  float take = 0.0;
  for (int b = 0; b < n; b++) for (int a = 0; a < n; a++) {
    vec2 uv = vUv + (vec2(float(a) + 0.5, float(b) + 0.5) / float(n) - 0.5) / vec2(${glf(S.WORLD_W)}, ${glf(S.WORLD_H)});
    float lon = uv.x * ${glf(2 * Math.PI)}, colat = uv.y * ${glf(Math.PI)};
    vec3 d = vec3(sin(colat) * cos(lon), sin(colat) * sin(lon), cos(colat));
    vec4 s = shadeChannels(d * uShadeCam.w, uShadeSun.xyz);
    take += shadeCrisp(s.x) * k;
    sum += vec4(0.0, s.y, s.z, s.w) * k;
  }
  fragColor = vec4(shadeRaw(take), sum.y, sum.z, sum.w);
}`;

// The probe: PROBE texels, one for each place whose shade is read back to the CPU (the figure's
// feet, the camera, the lander). It reads the atlas, so the figure is shaded by the very texel
// the ground under it is.
const PROBE_FRAG = /* glsl */`
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${SHADE_READ_GLSL}
uniform vec4 uProbeAt[${S.PROBE}];    // xyz: the place from the camera (m, planet axes); w: 1 when it is there
void main() {
  int k = int(vUv.x * ${glf(S.PROBE)});
  vec4 at = uProbeAt[k];
  vec2 l = at.w > 0.5 ? cloudShadeLight(at.xyz) : vec2(1.0);
  fragColor = vec4(l, 0.0, 1.0);
}`;

// (one mesh and camera of our own: the passes draw into part of the atlas, with no clear, so
// that the whole of it is written out once a frame and not three times)
const _mesh = new THREE.Mesh(fullscreenGeometry, null);
_mesh.frustumCulled = false;
const _cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class CloudShade {
  // terrain: the Terrain (its shared uniforms carry the cloud rule's own numbers and are where
  // the ground reads the atlas from).
  constructor(terrain) {
    const sh = terrain.shared;
    this.shared = sh;
    this.st = shadeState();
    this.u = shadeUniforms(this.st, [0, 0, 0], [0, 0, 1], 1, 0);
    this.strip = 0; this.whole = true; this.near = true; this.frames = 0;
    this.saved = new Set();
    this.target = new THREE.WebGLRenderTarget(S.ATLAS_W, S.ATLAS_H, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.target.texture.wrapS = THREE.RepeatWrapping; this.target.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.target.texture.colorSpace = THREE.NoColorSpace;
    CLOUD_SHADE_UNIFORMS.tCloudShade.value = this.target.texture;
    this.cleared = false;
    this._vp = new THREE.Vector4(); this._sc = new THREE.Vector4();
    const rule = {
      ...CLOUD_SHADE_UNIFORMS,
      tClouds: sh.tClouds, uCloud: sh.uCloud, uCloudHeap: sh.uCloudHeap, uCloudVol: sh.uCloudVol,
      tCloudNoise: sh.tCloudNoise, uCloudSteer: SKY_UNIFORMS.uCloudSteer, uCloudRise: SKY_UNIFORMS.uCloudRise,
      tWxA: SKY_UNIFORMS.tWxA, tWxB: SKY_UNIFORMS.tWxB, tWxC: SKY_UNIFORMS.tWxC, uSkyLow: SKY_UNIFORMS.uSkyLow,
      uCells: SKY_UNIFORMS.uCells, uCellCount: SKY_UNIFORMS.uCellCount,
      uShadeDraw: { value: new THREE.Vector4() },
      uShadeLayer: { value: new THREE.Vector4() },
    };
    this.layer = rule.uShadeLayer.value;
    this.material = makePassMaterial(WIN_FRAG, rule);
    this.worldMaterial = makePassMaterial(WORLD_FRAG, { ...rule, uShadeDraw: { value: new THREE.Vector4(0, 0, 0, S.WORLD_SAMPLES) } });
    this.worldMaterial.uniforms.uShadeLayer = rule.uShadeLayer;
    this.draw = this.material.uniforms.uShadeDraw.value;
    // The probe: the atlas read back for the figure and the things lit with it. It belongs to
    // the sky system's frame order (sky/skySystem.js calls probe.render after the shade map),
    // and is kept here so that it is there whether or not that one holds it yet; where it is
    // held there too, both write the same value.
    this.probe = new ShadeProbe(this);
  }

  // Before the main picture (sky/skySystem.js, beforeScene). rig: the camera rig; sun: the Sun's
  // direction; wanted: whether anything that reads the atlas is drawn (it always is: the ground
  // reads it); sky: the sky's frame.
  render(renderer, rig, sun, wanted, sky) {
    const sh = this.shared, U = CLOUD_SHADE_UNIFORMS;
    const R = sky?.R || rig.world?.radius || (rig.pos.length() - (rig.agl || 0));
    // (how dark a full shadow is: 0 when no cloud casts one - no clouds at all, the part left
    // out of the benchmark, or the governor's old 'clouds' step)
    const strength = sh.uCloud?.value?.x || 0;
    if (!renderer || !(strength > 0) || !R) { U.uShadeSun.value.w = 0; return; }
    // the cloud layer the old rule's pattern is read at, held still against the world
    this.layer.x = shadeLayer(this.st, sh.uCloud.value.y, sky?.world ?? null);
    shadeStep(this.st, rig.pos, R);
    this.st.near = this.near;
    shadeUniforms(this.st, rig.pos, sun, R, strength, this.u);
    const u = this.u;
    U.uShadeCam.value.fromArray(u.uShadeCam); U.uShadeSun.value.fromArray(u.uShadeSun);
    U.uShadeA.value.fromArray(u.uShadeA); U.uShadeE.value.fromArray(u.uShadeE);
    U.uShadeN.value.fromArray(u.uShadeN); U.uShadeStep.value.fromArray(u.uShadeStep); U.uShadeBand.value.fromArray(u.uShadeBand);
    // (the ground's wet, from the field's own map; a white map and 0 where there is no field)
    const W = CLOUD_WET_UNIFORMS, B = SKY_UNIFORMS.tWxB.value;
    W.uCloudWet.value = B && SKY_UNIFORMS.uSkyLow.value[3] > 0.5 && !sky?.noClouds ? 1 : 0;
    W.tCloudWet.value = B || this.shared.tClouds?.value || null;
    const rate = Math.abs(sky?.rate ?? 1);
    const whole = this.whole || rate > S.RATE_WHOLE || !!sky?.shotMode;
    // (the renderer's own viewport and scissor are its state, not the target's: a pass that
    // draws into part of a target must put them back, or everything drawn afterwards - the
    // whole picture - is laid in the corner this one used. It was: a black frame.)
    const auto = renderer.autoClear, keep = renderer.getRenderTarget();
    renderer.getViewport(this._vp); renderer.getScissor(this._sc);
    const scissorWas = renderer.getScissorTest();
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    if (!this.cleared) { renderer.setScissorTest(false); renderer.clear(true, false, false); this.cleared = true; }
    // the world window: a sixteenth of its rows a frame, all of them while the clock runs fast
    const rows = whole ? S.WORLD_H : Math.ceil(S.WORLD_H / S.STRIPS);
    const y0 = whole ? 0 : this.strip * rows;
    this._pass(renderer, this.worldMaterial, 0, 0, S.WORLD_W, S.WORLD_H, [0, y0, S.WORLD_W, Math.min(rows, S.WORLD_H - y0)]);
    this.strip = whole ? 0 : (this.strip + 1) % Math.ceil(S.WORLD_H / rows);
    this.whole = false;
    // The near and the middle window, each drawn whole WHEN ITS PICTURE CAN HAVE CHANGED: its
    // lattice has stepped (the traveller has moved a texel, or the anchor was renewed), the Sun
    // has moved, or the clouds have had time to drift an eighth of a texel (NEAR_EVERY, MID_EVERY
    // frames at the clock's own rate; fewer as the clock runs faster). They were drawn whole
    // every frame whatever was on screen, 131 000 texels of four to six reads: standing or
    // walking, nine frames in ten of that drew the picture that was there already.
    // (the saving cloud-shade-rate: the middle window at most every other frame, as it was)
    this.frames++;
    const st = this.st, lat = u.uShadeA.join(',') + '|' + u.uShadeE.join(',') + '|' + u.uShadeN.join(',');
    const sunMoved = !this._sun || Math.hypot(sun.x - this._sun[0], sun.y - this._sun[1], sun.z - this._sun[2]) > S.SUN_MOVE;
    const every = (n) => Math.max(1, Math.round(n / Math.max(1, rate)));
    const all = whole || sunMoved || this._all;
    const kN = `${st.nx},${st.ny},${lat}`, kM = `${st.mx},${st.my},${lat}`;
    this.drew = 0;
    if (this.near && (all || kN !== this._kN || this.frames - (this._fN || 0) >= every(S.NEAR_EVERY))) {
      this.draw.set(this.st.nx, this.st.ny, S.NEAR_STEP, 1);
      this._pass(renderer, this.material, S.NEAR_X, S.NEAR_Y, S.WIN, S.WIN);
      this._kN = kN; this._fN = this.frames; this.drew |= 1;
    }
    // (the saving: the middle window every other frame. The near window holds what is within
    // 7 km whatever happens, so nothing near the traveller waits for it)
    const rateOk = !this.saved.has('cloud-shade-rate') || this.frames % 2 === 0 || !this.near;
    if (rateOk && (all || kM !== this._kM || this.frames - (this._fM || 0) >= every(S.MID_EVERY))) {
      this.draw.set(this.st.mx, this.st.my, S.MID_STEP, S.MID_SAMPLES);
      this._pass(renderer, this.material, S.MID_X, S.MID_Y, S.WIN, S.WIN);
      this._kM = kM; this._fM = this.frames; this.drew |= 2;
      this._all = false;
    } else if (all) this._all = true;       // (the middle window still owes its picture)
    if (sunMoved) this._sun = [sun.x, sun.y, sun.z];
    renderer.setRenderTarget(keep);
    renderer.setViewport(this._vp); renderer.setScissor(this._sc); renderer.setScissorTest(scissorWas);
    renderer.autoClear = auto;
    // the figure and the things near it: the atlas at their own places, read back (1 to 3 frames
    // late in play, at once in a picture)
    this.probe.render({ renderer, rig, sky });
    const pv = this.probe.value;
    if (pv && !sky?.noClouds) { G.uWeather.value.x = pv.sun; G.uWeather.value.y = pv.sky; }
  }

  _pass(renderer, material, x, y, w, h, scissor) {
    renderer.setViewport(x, y, w, h);
    const s = scissor || [x, y, w, h];
    renderer.setScissor(s[0], s[1], s[2], s[3]);
    renderer.setScissorTest(true);
    _mesh.material = material;
    renderer.render(_mesh, _cam);
  }

  // the governor's savings (perf/governor.js, through sky/skySystem.js)
  saving(id, off) {
    if (off) this.saved.add(id); else this.saved.delete(id);
    if (id === 'cloud-shade-coarse') { this.near = !off; this.whole = true; }
    if (id === 'cloud-shade-rate') this.whole = true;
  }
  live(id) { return (CLOUD_SHADE_UNIFORMS.uShadeSun.value.w || 0) > 0 && (id === 'cloud-shade-rate' || id === 'cloud-shade-coarse'); }
  has(id) { return id === 'cloud-shade-rate' || id === 'cloud-shade-coarse'; }

  dispose() { this.target.dispose(); this.material.dispose(); this.worldMaterial.dispose(); this.probe.dispose(); }
}

// The three texels read back from the atlas for the figure and the things lit with it (the near
// rocks, the lander, the leaves, the dust and the grass within 30 m, all through G.uWeather):
// drawn after the atlas, read back without stopping the GPU (as the exposure meter's is), and
// read at once in a picture. Its value is 1 to 3 frames old and is eased, so that the figure
// never jumps from light to shade.
export class ShadeProbe {
  // shade: the CloudShade whose atlas it reads.
  constructor(shade) {
    this.shade = shade;
    this.target = new THREE.WebGLRenderTarget(S.PROBE, 1, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    });
    this.at = Array.from({ length: S.PROBE }, () => new THREE.Vector4());
    this.material = makePassMaterial(PROBE_FRAG, { ...CLOUD_SHADE_UNIFORMS, uProbeAt: { value: this.at } });
    // (a byte a channel, four channels a texel: a buffer of the right size, or three quarters
    // of it is never written)
    this.buf = new Uint8Array(S.PROBE * 4);
    this.reading = false; this.value = null; this.values = null; this.frames = 0; this.ease = 0;
    this.out = false; this.saved = new Set();
    this._rel = new THREE.Vector3(); this._vp = new THREE.Vector4(); this._sc = new THREE.Vector4();
  }

  // After the atlas, before the march (sky/skySystem.js, beforeScene).
  // c: { renderer, rig, sky, lander? }
  render(c) {
    const r = c?.renderer, rig = c?.rig;
    if (!r || !rig || this.out || !((CLOUD_SHADE_UNIFORMS.uShadeSun.value.w || 0) > 0)) { this.value = null; this.values = null; this.frames = 0; return; }
    const shot = !!c.sky?.shotMode;
    // (in play, every fourth frame: the value is eased over several frames as it is, and each
    // look is a pass of its own, a read back, a fence and a flush, paid whatever is on screen)
    this.tick = (this.tick || 0) + 1;
    if (!shot && this.value && this.tick % S.PROBE_EVERY !== 0) return;
    // the places: the traveller (the figure's feet on foot, the figure itself in flight), the
    // camera, and the lander if there is one
    const cam = rig.pos, rel = this._rel;
    // the traveller: on foot its soles, in flight the figure itself (both are already kept
    // relative to the camera, which is the thing that moves)
    if (rig.onFoot) rel.copy(rig.feet).sub(cam);
    else if (rig.mode === 'hero' && rig.heroRel) rel.copy(rig.heroRel);
    else rel.set(0, 0, 0);
    this.at[0].set(rel.x, rel.y, rel.z, 1);
    this.at[1].set(0, 0, 0, 1);                                  // the camera
    if (c.lander) { rel.copy(c.lander).sub(cam); this.at[2].set(rel.x, rel.y, rel.z, 1); } else this.at[2].copy(this.at[0]);
    const keep = r.getRenderTarget(), auto = r.autoClear, scissorWas = r.getScissorTest();
    r.getViewport(this._vp); r.getScissor(this._sc);
    r.autoClear = false;
    r.setRenderTarget(this.target);
    r.setScissorTest(false);
    r.setViewport(0, 0, S.PROBE, 1);
    r.clear(true, false, false);
    _mesh.material = this.material;
    r.render(_mesh, _cam);
    r.setRenderTarget(keep);
    r.setViewport(this._vp); r.setScissor(this._sc); r.setScissorTest(scissorWas);
    r.autoClear = auto;
    this.frames++;
    if (shot) {
      // a picture: read it now, so that the figure is shaded in the first frame
      r.readRenderTargetPixels(this.target, 0, 0, S.PROBE, 1, this.buf);
      this._take(1);
    } else if (!this.reading && r.readRenderTargetPixelsAsync) {
      this.reading = true;
      r.readRenderTargetPixelsAsync(this.target, 0, 0, S.PROBE, 1, this.buf).then(() => {
        this.reading = false;
        this._take(this.value ? Math.min(1, 0.25 + this.ease) : 1);
      }).catch(() => { this.reading = false; });
    }
  }

  // the bytes -> the value the figure is lit by, eased toward (k 1: at once)
  _take(k) {
    const b = this.buf, got = [];
    for (let i = 0; i < S.PROBE; i++) got.push({ sun: b[i * 4] / 255, sky: b[i * 4 + 1] / 255 });
    if (!this.values) this.values = got.map((g) => ({ ...g }));
    else for (let i = 0; i < got.length; i++) {
      this.values[i].sun += (got[i].sun - this.values[i].sun) * k;
      this.values[i].sky += (got[i].sky - this.values[i].sky) * k;
    }
    this.value = this.values[0];
  }

  // true while a picture is still waiting for a value (__shotReady, through SkySystem.busy)
  get pending() { return !this.value && this.frames > 0 && this.frames < 4; }

  saving(id, off) { if (off) this.saved.add(id); else this.saved.delete(id); }
  live() { return !this.out && (CLOUD_SHADE_UNIFORMS.uShadeSun.value.w || 0) > 0; }
  has(id) { return id === 'cloud-shade' || id === 'cloud-shade-rate' || id === 'cloud-shade-coarse'; }
  partOut(id, out) { if (id === 'cloud-shade') { this.out = !!out; if (out) { this.value = null; this.values = null; } } }

  dispose() { this.target.dispose(); this.material.dispose(); }
}
