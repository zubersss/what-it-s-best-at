// The strokes of lightning (src/weather/bolt.js), without a browser, in seconds:
//   node scripts/bolt-test.mjs [--break <fault>]
// Check 4 of package D (docs/briefs/sky-D-storm.md). Fails (exit 1) on any broken promise.
//
//  4a. A STROKE IS SEEN ON A PHONE. The core ribbon's half-width is at least 1.25 pixels at 2,
//      10 and 40 km at the phone's pixel angle (880 x 412 at dsf 3.5, the reference pictures'
//      shape: a 48-degree view over 1 442 pixels), and never under 3 m, so a stroke 40 km off is
//      still a line and not a dotted row. The rule is one rule: the shader's own text is made
//      from the same numbers as the JS (a stroke was one-pixel lines, which a phone loses).
//  4b. A STROKE STANDS STILL. While the camera flies at 50 m/s for half a second, every drawn
//      vertex stays within 5 cm of its place in planet axes (they were worked out from the
//      camera once and drawn relative to it, so the stroke flew along with the traveller).
//  4c. IT IS A STROKE. 30 to 64 pieces with branches, from the cloud's base at the strike's
//      place down to the ground there, wandering less than a quarter of its drop; at most four
//      at once.
//  4d. IT CANNOT OWN THE METER. Every stroke writes alpha 0 into the picture, and it reads
//      without bloom: a glow ribbon five times the core's width is drawn with it.
//  4e. NOTHING WITHOUT A FLASH. No flash, nothing drawn.
//
// Faults for --break (each must make its check fail): thin (the core one pixel wide),
// camera (the stroke built from the camera each frame), alpha (the stroke writes alpha 1),
// noglow (the core alone, no glow ribbon).
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Bolt } from '../src/weather/bolt.js';
import { Weather } from '../src/weather/weather.js';
import { G } from '../src/render/globals.js';
import { makeProducer } from '../src/weather/sky/producer.js';
import { makeSkyAt } from '../src/weather/sky/format.js';
import { Steer } from '../src/weather/sky/steer.js';
import { landFromI16 } from '../src/weather/sky/stub.js';
import { localFrame } from '../src/core/ephemeris.js';
import haven from '../src/worlds/haven.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const BREAK = argv.includes('--break') ? argv[argv.indexOf('--break') + 1] : (argv.find((a) => a.startsWith('--break=')) || '=').split('=')[1] || null;
let failed = false;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed = true; };
const note = (text) => console.log(`     ${text}`);

const bolt = await import('../src/weather/bolt.js');
const SRC = fs.readFileSync(path.join(root, 'src/weather/bolt.js'), 'utf8');
const D2R = Math.PI / 180;
const enu = (lat, lon) => { const la = lat * D2R, lo = lon * D2R; return { e: [-Math.sin(lo), Math.cos(lo), 0], n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] }; };
const atPos = (R, lat, lon, h = 0) => { const f = enu(lat, lon).u, r = R + h; return new THREE.Vector3(f[0] * r, f[1] * r, f[2] * r); };

// ---- the phone's pixel angle (the reference pictures' shape) ------------------------------------
const VIEW = { w: 880 * 3.5, h: 412 * 3.5, fov: 48 };
const PIX = 2 * Math.tan(VIEW.fov * D2R / 2) / VIEW.h;

// ---- a storm on Haven, and the weather reading it -----------------------------------------------
const R = haven.radius, START = haven.scene.start;
const LAND = landFromI16(readFileSync(new URL('../public/data/haven_dem_4096.i16', import.meta.url)), 4096, 2048);
const steer = new Steer(haven.weather, R);
const T_SCENE = steer.t(Date.parse(haven.scene.dateUTC));
const prod = makeProducer({ preset: 'storm', weather: haven.weather, radius: R, dayHours: haven.dayHours || 24, origin: START, layout: { width: 1024, height: 512, cWidth: 512, cHeight: 256 }, land: LAND });
const field = { on: true, busy: false, at: (p, t, out) => prod.at(p, t, out), cells: (t) => prod.cells(t), strikes: (t0, t1) => prod.strikes(t0, t1), textures: null };
const SUN = new THREE.Vector3(0.3, 0.2, 0.93).normalize();

function skyFrame(t, tPrev, rig) {
  const here = field.at([rig.pos.x, rig.pos.y, rig.pos.z], t, makeSkyAt());
  const cells = field.cells(t).map((c) => ({ ...c, dist: Math.hypot(c.x * (R + c.base) - rig.pos.x, c.y * (R + c.base) - rig.pos.y, c.z * (R + c.base) - rig.pos.z) })).sort((a, b) => a.dist - b.dist);
  const strikes = [];
  if (tPrev != null && t > tPrev && t - tPrev < 60) {
    for (const s of field.strikes(tPrev, t)) {
      const r = R + (s.ground ? s.h1 : 0.5 * (s.h0 + s.h1)), pos = [s.x * r, s.y * r, s.z * r];
      const dist = Math.hypot(pos[0] - rig.pos.x, pos[1] - rig.pos.y, pos[2] - rig.pos.z);
      if (dist <= 60000) strikes.push({ ...s, pos, dist });
    }
  }
  return { t, tPrev, noiseT: t, rate: 1, paused: false, steer, rise: [0, 0, 1], field, here, cells, strikes, world: haven, R, noClouds: false, shotMode: false };
}
const makeRig = (pos, agl = 30) => ({ pos, agl, mode: 'hero', onFoot: false, throttle: 0, fov: 48, east: [1, 0, 0] });

// The first stroke to the ground within reach from a place: the weather and the bolt driven over
// the frames that hold it.
function strokeRun({ steps = 16, move = null, dt = 1 / 30, held = false } = {}) {
  const wx = new Weather(); wx.setWorld(haven);
  if (held) wx.forceFlash = true;              // (a stroke held at its brightest, as ?debug=flash holds one)
  const b = new Bolt(G);
  const pos = atPos(R, START.lat, START.lon, 1500);
  const rig = makeRig(pos.clone());
  let t = T_SCENE, strike = null, frames = [];
  for (let i = 0; i < 20000 && !strike; i++) {
    const prev = t; t += dt;
    const f = skyFrame(t, prev, rig);
    wx.update(rig, dt, SUN, 266, 1, f);
    // (the weather as it was made no flash at all on a made world: then the record its bolt took)
    if (!wx.flashes && !wx.flash && f.strikes.length) {
      const s = f.strikes.find((x) => x.ground) || null;
      if (s) {
        localFrame([rig.pos.x, rig.pos.y, rig.pos.z], wx._e, wx._n, wx._u);
        const v = new THREE.Vector3(s.pos[0] - rig.pos.x, s.pos[1] - rig.pos.y, s.pos[2] - rig.pos.z), d = v.length();
        wx.flash = { dir: v.divideScalar(d), dist: d, power: s.power, age: 0, ground: true, seed: (s.seed >>> 0) / 4294967296, strike: s };
      }
    }
    const fl = (wx.flashes && wx.flashes[0]) || wx.flash;
    if (fl && (fl.ground ?? true)) strike = fl.strike || fl;
    if (!strike) continue;
    // now follow it for `steps` frames, the camera flying if asked
    for (let k = 0; k < steps; k++) {
      if (move) rig.pos.addScaledVector(move, dt);
      b.update(wx, rig.agl, 1);
      frames.push({ cam: rig.pos.clone(), pts: worldPoints(b, rig.pos), visible: !!(b.mesh?.visible) });
      const prev2 = t; t += dt;
      const f2 = skyFrame(t, prev2, rig);
      wx.update(rig, dt, SUN, 266, 1, f2);
      if (wx.flash) wx.flash.age += dt;                     // (the old record aged by hand)
    }
  }
  return { wx, b, strike, frames, rig };
}

// The world place of every DRAWN vertex, as the vertex shader works it out: the stroke's own
// anchor (a uniform: the camera to the stroke's foot) plus the vertex's place in planet axes,
// and nothing for the pieces the shader throws out of the picture. Where there is no anchor the
// vertices are the camera's own frame, as they were. Keyed by the vertex, so a stroke that dies
// mid-run cannot shift the comparison.
function worldPoints(b, cam) {
  const geo = b.geo || b.mesh?.geometry;
  if (!geo || !b.mesh?.visible) return new Map();
  const pos = geo.attributes.position.array, bolt = geo.attributes.aBolt?.array;
  const anchors = b.uniforms?.uBoltPos?.value || null, bright = b.uniforms?.uBoltBright?.value || null;
  const idx = geo.index?.array || null;
  const start = geo.drawRange.start || 0, count = Math.min(geo.drawRange.count, idx ? idx.length : pos.length / 3);
  const out = new Map();
  for (let i = start; i < start + count; i++) {
    const v = idx ? idx[i] : i;
    if (out.has(v)) continue;
    const k = bolt ? (bolt[v * 4] | 0) : 0;
    if (bolt && bright && !(bolt[v * 4 + 3] * bright[k] > 0)) continue;       // (the shader throws it out)
    const a = anchors ? anchors[k] : { x: 0, y: 0, z: 0 };
    out.set(v, [cam.x + a.x + pos[v * 3], cam.y + a.y + pos[v * 3 + 1], cam.z + a.z + pos[v * 3 + 2]]);
  }
  return out;
}

// ---- 4a. the core's width ------------------------------------------------------------------------
{
  const hw = bolt.boltHalfWidth || null;
  if (!hw) check(false, 'bolt.js exports boltHalfWidth(dist, pixelAngle): the one rule for a stroke\'s width, in metres');
  else {
    const rows = [2000, 10000, 40000].map((d) => {
      const w = BREAK === 'thin' ? 0.5 * PIX * d : hw(d, PIX);
      return { d, w, px: w / (PIX * d) };
    });
    for (const r of rows) note(`${(r.d / 1000).toFixed(0)} km: the core is ${(2 * r.w).toFixed(1)} m wide, ${(2 * r.px).toFixed(2)} pixels`);
    const minPx = Math.min(...rows.map((r) => r.px)), minM = Math.min(...rows.map((r) => r.w));
    // the shader's own text, made from the same numbers
    const gl = bolt.BOLT_WIDTH_GLSL || '';
    const same = gl && SRC.includes('${BOLT_WIDTH_GLSL}');
    check(minPx >= 1.25 && minM >= 3 && same,
      `the core is at least ${minPx.toFixed(2)} pixels and ${minM.toFixed(1)} m of half-width at 2 to 40 km, by the rule the shader itself is made from (${same ? 'one rule' : 'the shader has a rule of its own'})`);
  }
}

// ---- 4b. it stands still while the camera flies --------------------------------------------------
{
  const fr = enu(START.lat, START.lon);
  const move = new THREE.Vector3(fr.n[0], fr.n[1], fr.n[2]).multiplyScalar(50);     // 50 m/s north
  const run = strokeRun({ steps: 15, move, held: true });
  const fs = run.frames.filter((f) => f.pts.size);
  let worst = 0, kept = 0;
  if (fs.length > 1) {
    for (const [v, a] of fs[0].pts) {
      if (!fs.every((f) => f.pts.has(v))) continue;
      kept++;
      for (const f of fs.slice(1)) {
        const q = f.pts.get(v);
        const b2 = BREAK === 'camera' ? [q[0] + (f.cam.x - fs[0].cam.x), q[1] + (f.cam.y - fs[0].cam.y), q[2] + (f.cam.z - fs[0].cam.z)] : q;
        worst = Math.max(worst, Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]));
      }
    }
  }
  note(`${fs.length} frames of a stroke while the camera flew ${(50 * 15 / 30).toFixed(0)} m: ${kept} vertices drawn throughout, moving ${fs.length > 1 ? worst.toFixed(3) : '-'} m in planet axes`);
  check(fs.length >= 8 && kept >= 30 && worst <= 0.05, `a stroke stands still in the world while the camera flies at 50 m/s (${fs.length > 1 ? worst.toFixed(3) + ' m over ' + kept + ' vertices' : 'no stroke was drawn'})`);
}

// ---- 4c, 4d, 4e. what is drawn --------------------------------------------------------------------
{
  const run = strokeRun({ steps: 4, held: true });
  const b = run.b, s = run.strike, geo = b.geo || b.mesh?.geometry;
  const drawn = geo ? geo.drawRange.count : 0;
  const pts = run.frames.length ? [...run.frames[0].pts.values()] : [];
  // the stroke's reach: from the cloud's base at the strike's place to the ground there
  let top = -Infinity, foot = Infinity, wander = 0;
  const dir = s ? [s.x, s.y, s.z] : null;
  if (dir && pts.length) {
    for (const p of pts) {
      const h = Math.hypot(p[0], p[1], p[2]) - R, along = (p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]);
      top = Math.max(top, h); foot = Math.min(foot, h);
      const off = Math.hypot(p[0] - dir[0] * along, p[1] - dir[1] * along, p[2] - dir[2] * along);
      wander = Math.max(wander, off);
    }
  }
  const pieces = bolt.BOLT ? bolt.BOLT.PIECES : 0, strokes = bolt.BOLT ? bolt.BOLT.STROKES : 0;
  note(s ? `the strike: ${((s.h1 - s.h0) / 1000).toFixed(2)} km from the base (${Math.round(s.h1)} m) to the ground (${Math.round(s.h0)} m); drawn ${drawn} indices, ${pts.length} vertices; the stroke reached ${Math.round(foot)} to ${Math.round(top)} m, wandering ${Math.round(wander)} m` : 'no strike');
  const drop = s ? s.h1 - s.h0 : 1;
  check(!!s && pts.length > 0 && strokes <= 4 && pieces >= 30 && pieces <= 64 && Math.abs(top - s.h1) < 150 && Math.abs(foot - s.h0) < 150 && wander < 0.2 * drop,
    `a stroke of ${pieces} pieces at most, ${strokes} at once, from the base to the ground (${s ? `${Math.round(foot)}-${Math.round(top)} m against ${Math.round(s.h0)}-${Math.round(s.h1)} m` : '-'}), wandering ${(100 * wander / drop).toFixed(0)} % of its drop`);

  // alpha 0, and the glow ribbon
  const mat = (b.mesh?.material) || null;
  const alphaZero = BREAK !== 'alpha' && !!mat && mat.blendSrcAlpha === THREE.ZeroFactor && /fragColor = vec4\([^;]*0\.0\)/.test(mat.fragmentShader || '');
  const glow = BREAK !== 'noglow' && (bolt.BOLT?.GLOW >= 4) && /GLOW|glow/.test(mat?.fragmentShader || '');
  check(alphaZero && glow, `a stroke writes alpha 0 into the picture (it cannot own the exposure meter) and carries a glow ribbon ${bolt.BOLT?.GLOW ?? '-'} times the core's width, so it reads with bloom off`);

  // nothing without a flash
  const wx2 = new Weather(); wx2.setWorld(haven);
  const b2 = new Bolt(G);
  wx2.place = [R, 0, 0]; wx2.flashes = []; wx2.flash = null;
  b2.update(wx2, 30, 1);
  const g2 = b2.geo || b2.mesh?.geometry;
  check(!(b2.mesh?.visible) && (!g2 || g2.drawRange.count === 0), 'with no flash nothing is drawn');
}

console.log(failed ? '\nFAILED' : '\nall ok');
process.exit(failed ? 1 : 0);
