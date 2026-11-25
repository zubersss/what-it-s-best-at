// How much of a view the rain stands in, and how much of it a shader that looks for the storms by
// their BODY alone must throw away. Without a browser, in seconds: the world's own weather model
// gives the cells, and the same chords the march and the far sheets use give the answer.
//   node scripts/rain-pixels.mjs [--t 8.25] [--view "lat,lon,alt,heading,pitch,fov"] [--world haven]
// With no --view it takes the three views of the report's cell pictures.
// It fails (exit 1) if the hour has no raining cell: then it is measuring nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from './lib/loadWorld.mjs';
import { makeProducer } from '../src/weather/sky/producer.js';
import { readWxLand } from '../src/weather/sky/land.js';
import { fieldLayout } from '../src/weather/sky/format.js';
import { cellGeometry, cellChord, cellShaftChord } from '../src/weather/sky/cellShape.js';
import { opt } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = opt('world', 'haven');
const { world } = await loadWorld(id);
const RAD = Math.PI / 180, R = world.radius;
const planes = readWxLand(
  fs.readFileSync(path.join(root, `public/data/${id}_wxland_1024.u8`)),
  JSON.parse(fs.readFileSync(path.join(root, `public/data/${id}_peaks.json`), 'utf8')).peaks,
);
const prod = makeProducer({ weather: world.weather, radius: R, layout: fieldLayout(world), origin: world.scene.start, wxland: planes, dayHours: world.dayHours || 24 });
// (?t= counts hours from the scene's own moment; the weather clock counts seconds from its epoch)
const sceneT = (Date.parse(world.scene.dateUTC) - Date.parse(world.weather.epoch)) / 1000;
const t = sceneT + +opt('t', '8.25') * 3600;
const cells = prod.cells(t);
const raining = cells.filter((c) => c.rain > 0 && c.strength > 0.05);
console.log(`${cells.length} cells at t=${opt('t', '8.25')} h, ${raining.length} of them raining`);

// the slices of the distance from the eye (sky/cloudVolume.js SLICE_Z, then the two far ones)
const SLICE_Z = [0, 300, 900, 2400, 5000, 9000, 16000, 40000, 200000];
const geoms = cells.map((c) => cellGeometry(c, R));

function look(name, lat, lon, alt, head, pitch, fov) {
  const cl = Math.cos(lat * RAD), u = [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  const cam = u.map((v) => v * (R + alt));
  let east = [-u[1], u[0], 0]; const el = Math.hypot(east[0], east[1]) || 1; east = [east[0] / el, east[1] / el, 0];
  const north = [u[1] * east[2] - u[2] * east[1], u[2] * east[0] - u[0] * east[2], u[0] * east[1] - u[1] * east[0]];
  const ch = Math.cos(head * RAD), sh = Math.sin(head * RAD), cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
  const f = [0, 1, 2].map((k) => cp * (north[k] * ch + east[k] * sh) + u[k] * sp);
  const cr = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  const rl = Math.hypot(...cr) || 1, r = cr.map((v) => v / rl);
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const ty = Math.tan(fov * RAD / 2), aspect = 880 / 412, W = 220, H = 103;
  let body = 0, rain = 0, rainNoBody = 0, cut = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x + 0.5) / W * 2 - 1, ny = 1 - (y + 0.5) / H * 2;
    const d0 = [0, 1, 2].map((k) => f[k] + r[k] * (nx * ty * aspect) + up[k] * (ny * ty));
    const dl = Math.hypot(...d0), d = d0.map((v) => v / dl);
    let hasBody = false, hasRain = false, cutHere = false;
    for (let i = 0; i < geoms.length; i++) {
      const bc = cellChord(geoms[i], cam, d);
      const b = bc[0] <= bc[1] && bc[1] > 0;
      if (b) hasBody = true;
      if (!(cells[i].rain > 0)) continue;
      const sc = cellShaftChord(geoms[i], cam, d);
      if (!(sc[0] <= sc[1] && sc[1] > 0)) continue;
      hasRain = true;
      // the rain crosses a slice of the distance in which this cell's own body does not
      for (let k = 0; k < SLICE_Z.length - 1; k++) {
        const tA = SLICE_Z[k], tB = SLICE_Z[k + 1];
        if (Math.min(sc[1], tB) <= Math.max(sc[0], tA)) continue;
        if (!(b && Math.min(bc[1], tB) > Math.max(bc[0], tA))) cutHere = true;
      }
    }
    if (hasBody) body++;
    if (hasRain) rain++;
    if (hasRain && !hasBody) rainNoBody++;
    if (cutHere) cut++;
  }
  const n = W * H, pc = (v) => `${(100 * v / n).toFixed(1)} %`;
  console.log(`${name}\n    cloud on ${pc(body)} of the picture, rain on ${pc(rain)}; of the picture, ${pc(rainNoBody)} is rain on a ray that crosses no cloud at all, and ${pc(cut)} is rain in a slice of the distance that holds no cloud of its own`);
}

const v = opt('view', null);
if (v) {
  const [lat, lon, alt, head, pitch, fov] = v.split(',').map(Number);
  look(`lat ${lat}, lon ${lon}, ${alt} m, heading ${head}, pitch ${pitch}, fov ${fov}`, lat, lon, alt, head, pitch, fov || 70);
} else {
  look('the cell from 9 km (haven_ledge_M_cell9)', -52.2848, 29.7865, 4500, 243, 3, 70);
  look("the cell's portrait (haven_ledge_M_cellsun)", -52.0691, 23.3976, 4200, 120, 5, 70);
  look('the storm 20 km off (haven_ledge_M_storm20)', -51.1478, 33.5441, 3000, 243, 6, 55);
}
if (!raining.length) { console.log('FAIL no cell is raining at this hour: nothing is being measured'); process.exit(1); }
process.exit(0);
