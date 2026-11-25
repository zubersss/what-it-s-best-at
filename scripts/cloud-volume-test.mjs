// The cloud volume's decisions, without a browser: whether it is drawn at all, and whether the
// storm cells are still marched when the governor has switched the volume off.
//   node scripts/cloud-volume-test.mjs
import * as THREE from 'three';
import { CloudVolume } from '../src/sky/cloudVolume.js';
import { SKY_UNIFORMS } from '../src/sky/skyGlsl.js';
import haven from '../src/worlds/haven.js';
import { cellGeometry, cellChord, cellShaftChord } from '../src/weather/sky/cellShape.js';

let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };

const R = haven.radius;
const cv = new CloudVolume(null);
cv.setWorld(haven);
cv.noise = {};                                   // (the 3-D noise is made in a worker; its presence is all that is asked)
const layer = { mesh: { visible: true }, uniforms: { uNearFade: { value: 0 } } };
const cam = new THREE.Vector3(R + 2000, 0, 0);

SKY_UNIFORMS.uCellCount.value = 0;
check('with the volume on and no cell, it is drawn', cv.ready(cam, layer) === true && cv.cellsOnly === false);

// the governor's last cloud step: the volume off near the traveller
cv.enabled = false;
check('with the volume off and no cell, nothing is marched', cv.ready(cam, layer) === false && cv.cellsOnly === false);

// a cell packed for the shaders this frame (what the march will read)
SKY_UNIFORMS.uCellCount.value = 1;
const active = cv.ready(cam, layer);
check('with the volume off and a cell in reach, the cells are still marched — on the very first frame',
  active === true && cv.cellsOnly === true, `active ${active}, cellsOnly ${cv.cellsOnly}`);

// and from space the volume is not drawn at all
cv.enabled = true;
const high = new THREE.Vector3(R + (haven.clouds.volume.above ?? 30000) + 1000, 0, 0);
check('from above the volume\'s ceiling nothing of it is drawn', cv.ready(high, layer) === false && cv.wanted === false);

// with the cloud layer itself gone (a world with no clouds, or the layer not loaded)
check('with no cloud layer there is nothing to march', cv.ready(cam, { mesh: { visible: false }, uniforms: { uNearFade: { value: 0 } } }) === false);

// ---- the rain shafts: a ray that passes UNDER a storm still sees its rain -----------------------
// Seen from the side, every ray aimed at the rain itself goes below the cloud's own base: it never
// meets the cell's body. The march finds the two cells its stepping needs by their BODY chord, so
// the shafts must be looked for over every live cell instead — else the rain is drawn nowhere but
// under a cell one is looking into, which is the one place a shaft cannot be seen.
{
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const u = [1, 0, 0];
  const g = cellGeometry({ id: 7, centre: u, radius: 3000, base: 1200, top: 9000, stage: 1.6, strength: 1,
    tilt: [0, 0.3, 0], shaft: [0, 0.5, 0], rain: 30, seed: 12345, age: 2000 }, R);
  const ang = 20000 / R, alt = 2000;                        // the traveller 20 km off, 2 km up
  const cam = [Math.cos(ang) * (R + alt), -Math.sin(ang) * (R + alt), 0];
  const foot = [R, 0, 0];                                   // the ground under the cell
  const toward = unit([foot[0] - cam[0], foot[1] - cam[1], foot[2] - cam[2]]);
  const up = unit(cam);
  let shaftOnly = 0, both = 0, lo = 99, hi = -99;
  for (let i = 0; i <= 240; i++) {
    const th = (-4 + 20 * i / 240) * Math.PI / 180;
    const dir = unit([0, 1, 2].map((k) => toward[k] * Math.cos(th) + up[k] * Math.sin(th)));
    const body = cellChord(g, cam, dir), shaft = cellShaftChord(g, cam, dir);
    const hasBody = body[0] <= body[1], hasShaft = shaft[0] <= shaft[1];
    if (hasShaft && hasBody) both++;
    if (hasShaft && !hasBody) { shaftOnly++; lo = Math.min(lo, th * 57.2958); hi = Math.max(hi, th * 57.2958); }
  }
  check('seen from the side, rays cross a storm\'s rain without crossing the storm',
    shaftOnly > 0 && both > 0, `${shaftOnly} of 241 rays (${lo.toFixed(1)} to ${hi.toFixed(1)} degrees), ${both} through both`);
  // and the march looks for the shafts over every live cell, not over the two its stepping found
  const fs = cv.march.fragmentShader;
  const block = fs.slice(fs.indexOf('float sA = 1.0'), fs.indexOf('// ---- the cloud, and the rain under it'));
  check('the march takes the shafts from every live cell',
    /for \(int k = 0; k < CELL_MAX; k\+\+\)/.test(block) && /cellShaftChord\(k,/.test(block) && !block.includes('cellShaftChord(gCellK'),
    `${block.split('\n').length} lines of the shaft's stretch`);
  check('and the rain\'s own strength under it likewise', !fs.includes('cellRain(gCellK'));
}

SKY_UNIFORMS.uCellCount.value = 0;
console.log(fails ? `cloud-volume-test: ${fails} FAILED` : 'cloud-volume-test: all passed');
process.exit(fails ? 1 : 0);
