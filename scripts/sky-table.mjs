// Where the sky bodies are from a world's start site over time (no browser): elevation,
// azimuth, angular size and lit fraction. Used to pick moments for sky checks.
//   node scripts/sky-table.mjs [--world mars] [--from -2] [--to 4] [--step 0.5] [--bodies phobos,deimos]
//                              [--lat .. --lon ..]   (another place on the same world)
import { WORLDS } from '../src/worlds/index.js';
import { SOLAR_SYSTEM } from '../src/worlds/solarSystem.js';
import { Ephemeris, dateToJD, latLonToDir, elevationAzimuth } from '../src/core/ephemeris.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const world = WORLDS[opt('world', 'mars')], from = +opt('from', -2), to = +opt('to', 4), step = +opt('step', 0.5);
const ids = opt('bodies', Object.keys(SOLAR_SYSTEM).filter((k) => k !== 'sun' && k !== world.body).join(',')).split(',');
const eph = new Ephemeris(SOLAR_SYSTEM, world.body), jd0 = dateToJD(Date.parse(world.scene.dateUTC));
const s = { lat: +opt('lat', world.scene.start.lat), lon: +opt('lon', world.scene.start.lon) }, d = latLonToDir(s.lat, s.lon), site = d.map((v) => v * world.radius);
console.log(`${world.name} site ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)} — ${world.scene.dateUTC}; columns: elevation° azimuth° size(arcmin) lit%`);
for (let t = from; t <= to + 1e-9; t += step) {
  eph.update(jd0 + t / 24, ids);
  const sun = elevationAzimuth(site, eph.sunDir);
  let line = `t=${t >= 0 ? '+' : ''}${t.toFixed(2)}h  sun ${sun.elevation.toFixed(1).padStart(6)} ${sun.azimuth.toFixed(0).padStart(4)}`;
  for (const id of ids) {
    const p = eph.bodies.get(id).pos, rel = [p[0] - site[0], p[1] - site[1], p[2] - site[2]], dist = Math.hypot(...rel);
    const ea = elevationAzimuth(site, rel.map((v) => v / dist));
    // phase angle at the body between the Sun and the observer
    const toSun = [eph.sunDir[0] * eph.sunDistance - p[0], eph.sunDir[1] * eph.sunDistance - p[1], eph.sunDir[2] * eph.sunDistance - p[2]], ls = Math.hypot(...toSun);
    const cosPhase = -(rel[0] * toSun[0] + rel[1] * toSun[1] + rel[2] * toSun[2]) / (dist * ls);
    line += `  | ${id} ${ea.elevation.toFixed(1).padStart(6)} ${ea.azimuth.toFixed(0).padStart(4)} ${(2 * Math.atan(SOLAR_SYSTEM[id].radius / dist) * 10800 / Math.PI).toFixed(2).padStart(6)}' ${(50 * (1 + cosPhase)).toFixed(0).padStart(3)}%`;
  }
  console.log(line);
}
