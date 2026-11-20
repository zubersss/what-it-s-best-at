// World registry. Adding a world = adding one data file and one line here.
// (Only these small files are loaded at start-up; a world's maps and elevation come when
// the traveller approaches it: App.loadWorldData.)
import mars from './mars.js';
import moon from './moon.js';
import phobos from './phobos.js';
import deimos from './deimos.js';
import mercury from './mercury.js';
import io from './io.js';
import europa from './europa.js';
import enceladus from './enceladus.js';
import titan from './titan.js';
import venus from './venus.js';
import triton from './triton.js';
import pluto from './pluto.js';
import charon from './charon.js';
import ceres from './ceres.js';

export const WORLDS = { mars, moon, phobos, deimos, mercury, io, europa, enceladus, titan, venus, triton, pluto, charon, ceres };

export function getWorld(id) {
  const w = WORLDS[id];
  if (!w) throw new Error(`Unknown world "${id}". Known: ${Object.keys(WORLDS).join(', ')}`);
  return w;
}
