// Times chunk builds along the quadtree path from the root down to a world's start site
// (no browser): total, height sampling alone, and the shadow bake.
//   node scripts/profile-chunks.mjs [--world moon] [--from 4] [--repeat 2]
import { loadWorld } from './lib/loadWorld.mjs';
import { CONFIG } from '../src/config.js';
import { ChunkBuilder } from '../src/terrain/chunkBuilder.js';
import { ShadowBaker } from '../src/terrain/shadowBake.js';
import { dirToFace, FACES } from '../src/terrain/cubeSphere.js';
import { SOLAR_SYSTEM } from '../src/worlds/solarSystem.js';
import { Ephemeris, dateToJD, latLonToDir } from '../src/core/ephemeris.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const { world, hs } = await loadWorld(opt('world', 'moon'));
const baker = new ShadowBaker(hs, CONFIG, world), builder = new ChunkBuilder(hs, CONFIG, baker);
const eph = new Ephemeris(SOLAR_SYSTEM, world.body);
eph.update(dateToJD(Date.parse(world.scene.dateUTC)), []);
const sun = [eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]], sunHalf = Math.asin(SOLAR_SYSTEM.sun.radius / eph.sunDistance);
const d = latLonToDir(world.scene.start.lat, world.scene.start.lon), ab = [0, 0];
let face = 0; for (let f = 0; f < FACES.length; f++) if (dirToFace(f, d[0], d[1], d[2], ab) && Math.abs(ab[0]) <= 1 && Math.abs(ab[1]) <= 1) { face = f; break; }
const repeat = +opt('repeat', 2), from = +opt('from', 4);
let sumAll = 0, sumBake = 0, n = 0;
console.log(`${world.name}: level  total ms  shadow ms  heights+mesh ms`);
for (let level = from; level <= world.terrain.maxLevel; level++) {
  const k = 1 << level, ix = Math.min(k - 1, Math.floor((ab[0] + 1) / 2 * k)), iy = Math.min(k - 1, Math.floor((ab[1] + 1) / 2 * k));
  let best = Infinity, bestBake = Infinity;
  for (let r = 0; r < repeat; r++) {
    const bake0 = baker.ms || 0, t0 = performance.now();
    builder.build(face, level, ix, iy, sun, sunHalf);
    const t = performance.now() - t0;
    let tb = 0; { const t1 = performance.now(); baker.bakeChunk(face, level, ix, iy, sun, sunHalf, null); tb = performance.now() - t1; }
    if (t < best) { best = t; bestBake = tb; }
    void bake0;
  }
  console.log(`  ${String(level).padStart(2)}  ${best.toFixed(1).padStart(8)}  ${bestBake.toFixed(1).padStart(8)}  ${(best - bestBake).toFixed(1).padStart(8)}`);
  sumAll += best; sumBake += bestBake; n++;
}
console.log(`  mean ${(sumAll / n).toFixed(1)} ms per chunk (shadow re-bake alone ${(sumBake / n).toFixed(1)} ms)`);
