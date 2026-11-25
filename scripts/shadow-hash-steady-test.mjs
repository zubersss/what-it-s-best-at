// The flecks of Sun in the trees' shadows stay where they are while the traveller walks
// (no browser; a second). Finding shadows-1 of docs/briefs/shadows-governor-10.md: the trees'
// shadow pass lets the Sun through a crown by a hash of the shadow map's pixel, and the
// tiles of the near shadow follow the traveller a whole texel at a time, so the same patch
// of ground fell on another pixel at every redraw: walking, every fleck under every crown
// was drawn anew fifteen times a second (standing, nothing changed).
//
// What it does: the real NearShadow (src/shadows/nearShadow.js) with a renderer that only
// records each tile it is asked to draw (its square of the atlas, its camera, the uniform
// the shadow pass hands the trees then), the game's settings for Sharp (every = 2,
// alternate) and for Smooth, Haven's radius and the opening's Sun 19.5 degrees up. The eye
// walks 6 m at 4.5 m/s, toward the Sun, across it and away. For 400 fixed spots on the
// ground ahead, in every draw of the wide and the fine tile, it works out what the trees'
// depth shader (life/trees.js, as built by Trees) hashes for the pixel that spot falls on:
// the shader's own expression for it, read from its source. A spot must keep one hash
// input in each tile for the whole walk. And with the Sun moving, when the near shadow takes
// its light axes anew, a spot may be hashed anew only where the lattice's own small turn
// takes it into another texel (no more than a fifth of them; a hash counted from a point
// moved at the renewal drew every one anew).
//
// Run: node scripts/shadow-hash-steady-test.mjs      (exit 1 on a failed check)
import * as THREE from 'three';
import { NearShadow } from '../src/shadows/nearShadow.js';
import { G } from '../src/render/globals.js';
import { Trees } from '../src/life/trees.js';
import { WORLDS } from '../src/worlds/index.js';

// (the trees' picture is fetched in the constructor; nothing to fetch here)
globalThis.fetch = () => new Promise(() => {}); globalThis.createImageBitmap = () => new Promise(() => {});
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); return ok; };

let seen = [], current = null;
const renderer = {
  setRenderTarget(t) { current = t; }, clear() {}, getContext: () => ({ invalidateFramebuffer() {}, FRAMEBUFFER: 0, COLOR_ATTACHMENT0: 0 }),
  render(mesh, cam) { seen.push({ vp: current.viewport.clone(), cam: cam.clone(), shift: G.uShadowHashShift ? G.uShadowHashShift.value.clone() : null }); },
};
// (in the game the near shadow is made before the trees: their materials take its uniforms)
const ns = new NearShadow(renderer);
const trees = new Trees(WORLDS.haven, { shared: { uWind: { value: new THREE.Vector4(1, 0, 0, 6) } } });

// What the depth shader hashes: its own line, one of the forms this test knows.
const frag = trees.depthMaterial.fragmentShader, line = (/uvec2\s+q\s*=[^;]*;/.exec(frag) || [''])[0];
const BY_PIXEL = /^uvec2\s+q\s*=\s*uvec2\(\s*gl_FragCoord\.xy\s*\)\s*;$/, BY_GROUND = /^uvec2\s+q\s*=\s*uvec2\(\s*ivec2\(\s*gl_FragCoord\.xy\s*\)\s*\+\s*uShadowHashShift\s*\)\s*;$/;
const form = BY_PIXEL.test(line) ? 'pixel' : BY_GROUND.test(line) ? 'ground' : null;
console.log(`the trees' shadow pass hashes: ${line || '(no hash found)'}`);
if (!check(!!form, `the depth shader's dither is not in a form this test knows (${line}): teach the test, do not drop the check`)) { console.log('FAIL:\n  ' + fail.join('\n  ')); process.exit(1); }
if (form === 'ground') {
  check(/uniform\s+ivec2\s+uShadowHashShift\s*;/.test(frag), 'the depth shader reads uShadowHashShift without declaring it as an ivec2');
  check(trees.depthMaterial.uniforms.uShadowHashShift === G.uShadowHashShift && !!G.uShadowHashShift, 'the trees\' depth material does not hold the near shadow\'s uShadowHashShift (it would read 0)');
}

const geo = new THREE.InstancedBufferGeometry(); geo.instanceCount = 1;
const caster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
ns.addCaster(caster, new THREE.MeshBasicMaterial());            // (a tree list: instanced, it reaches every tile)
const R = WORLDS.haven.radius, lat = -48.55 * Math.PI / 180, lon = 49.06 * Math.PI / 180;
const up = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0), north = new THREE.Vector3().crossVectors(up, east);
const elev = 19.5 * Math.PI / 180;
const ground = up.clone().multiplyScalar(R);
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// One walk: frames of 1/30 s at 4.5 m/s from the start, the Sun at elevation elevOf(f).
// Per tile: the texels each spot was hashed as, and at the frames in `renewals` (the light's
// axes taken anew) how many spots were hashed differently from that tile's draw before.
function walk(every, alternate, dir, frames, elevOf, renewals = []) {
  ns.every = every; ns.alternate = alternate; ns._anchored = false; ns._has = false;
  // 400 spots on the ground, 4 to 10 m ahead of the start and up to 3 m to the side
  const side = new THREE.Vector3().crossVectors(up, dir);
  const spots = Array.from({ length: 400 }, () => ground.clone().addScaledVector(dir, 4 + 6 * rnd()).addScaledVector(side, 6 * rnd() - 3));
  const keys = [new Map(), new Map()], last = [new Map(), new Map()], draws = [0, 0], anew = [[0, 0], [0, 0]];
  for (let f = 0; f < frames; f++) {
    const cam = ground.clone().addScaledVector(up, 1.7).addScaledVector(dir, 0.15 * f);       // 4.5 m/s, 30 frames a second
    const e = elevOf(f), sun = up.clone().multiplyScalar(Math.sin(e)).addScaledVector(east, Math.cos(e)).normalize();
    seen = [];
    ns.render(cam, sun, [up.x, up.y, up.z]);
    for (const s of seen) {
      const k = s.vp.x > 0 ? (s.vp.y > 0 ? 2 : 1) : 0;
      if (k === 2) continue;
      draws[k]++;
      s.cam.updateMatrixWorld(true);
      spots.forEach((p, i) => {
        const ndc = p.clone().sub(cam).project(s.cam);
        if (Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95) return;          // (not in this tile)
        let qx = Math.floor(s.vp.x + (ndc.x * 0.5 + 0.5) * s.vp.z), qy = Math.floor(s.vp.y + (ndc.y * 0.5 + 0.5) * s.vp.w);
        if (form === 'ground') {
          if (!s.shift) { check(false, 'the near shadow hands the trees no uShadowHashShift'); return; }
          check(Number.isInteger(s.shift.x) && Number.isInteger(s.shift.y), 'uShadowHashShift is not a whole number of texels');
          qx += s.shift.x; qy += s.shift.y;
          check(qx >= 0 && qy >= 0, 'a hashed texel came out negative (uvec2 of a negative int)');
        }
        const key = qx + ',' + qy, was = last[k].get(i);
        if (renewals.includes(f) && was !== undefined) { anew[k][1]++; if (was !== key) anew[k][0]++; }
        last[k].set(i, key);
        const m = keys[k].get(i) || new Set(); m.add(key); keys[k].set(i, m);
      });
    }
  }
  return { keys, draws, anew };
}

// 1. The Sun still: a spot keeps one hash input in each tile for the whole walk.
for (const [mode, every, alternate] of [['Sharp', 2, true], ['Smooth', 2, false]]) {
  for (const [walkName, dir] of [['toward the Sun', east], ['across it', north], ['away from it', east.clone().negate()]]) {
    const { keys, draws } = walk(every, alternate, dir, 40, () => elev);
    for (const k of [0, 1]) {
      let moved = 0, n = 0;
      for (const m of keys[k].values()) { n++; if (m.size > 1) moved++; }
      const name = k ? 'fine' : 'wide';
      console.log(`${mode}, walking ${walkName}: ${name} tile drawn ${draws[k]} times; ${moved} of ${n} spots were hashed as more than one texel`);
      check(n > 100 && draws[k] >= 10, `${mode}, ${walkName}: the ${name} tile was hardly drawn (${draws[k]} times, ${n} spots in it): the walk tests nothing`);
      check(moved === 0, `${mode}, walking ${walkName}: ${moved} of ${n} spots in the ${name} tile had their leaf flecks drawn anew as the tile followed the traveller`);
    }
  }
}

// 2. The Sun moving (Haven's day turns it 0.03 degrees every 7 s, and the near shadow then
// takes its light axes anew and draws every tile): walking, at each renewal a spot is hashed
// anew only where the turn of the lattice itself takes it into another texel. The turn is
// about the anchor, a few metres from these spots: it moves them by millimetres, and some
// tenth of them cross a fine texel's edge (3.9 cm). A hash counted from an anchor that is
// itself moved at the renewal (a whole number of texels, as a lattice-tied anchor is) would
// draw every fleck anew there: that is what this catches.
for (const [mode, every, alternate] of [['Sharp', 2, true], ['Smooth', 2, false]]) {
  for (const [walkName, dir] of [['toward the Sun', east], ['across it', north], ['away from it', east.clone().negate()]]) {
    const { anew } = walk(every, alternate, dir, 120, (f) => elev + Math.floor(f / 30) * 0.035 * Math.PI / 180, [30, 60, 90]);
    const share = anew.map(([a, n]) => (n ? a / n : 0));
    console.log(`${mode}, walking ${walkName}, the Sun moving: at three renewals of the light's axes, spots hashed anew: wide ${(100 * share[0]).toFixed(0)} %, fine ${(100 * share[1]).toFixed(0)} %`);
    check(anew[0][1] > 300 && anew[1][1] > 300, `${mode}, ${walkName}, the Sun moving: too few spots in the tiles at the renewals (${anew[0][1]}, ${anew[1][1]}): it tests nothing`);
    check(share[0] <= 0.2 && share[1] <= 0.2, `${mode}, walking ${walkName}, the Sun moving: at a renewal of the light's axes ${(100 * Math.max(...share)).toFixed(0)} % of the spots had their leaf flecks drawn anew, more than the lattice's turn moves (the hash is counted from a point that moved?)`);
  }
}
if (fail.length) { console.log('FAIL:\n  ' + [...new Set(fail)].join('\n  ')); process.exit(1); }
console.log('ok: a spot of ground keeps its flecks of Sun while the tiles follow the traveller');
