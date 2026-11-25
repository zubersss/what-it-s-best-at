// The cloud volume's decisions, without a browser: whether it is drawn at all, and whether the
// storm cells are still marched when the governor has switched the volume off.
//   node scripts/cloud-volume-test.mjs
import * as THREE from 'three';
import { CloudVolume } from '../src/sky/cloudVolume.js';
import { SKY_UNIFORMS } from '../src/sky/skyGlsl.js';
import haven from '../src/worlds/haven.js';

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

SKY_UNIFORMS.uCellCount.value = 0;
console.log(fails ? `cloud-volume-test: ${fails} FAILED` : 'cloud-volume-test: all passed');
process.exit(fails ? 1 : 0);
