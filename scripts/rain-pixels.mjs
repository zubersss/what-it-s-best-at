// How much of a view the rain stands in, and how much of it a shader that looks for the storms by
// their BODY alone must throw away. Without a browser, in seconds: the world's own weather model
// gives the cells, and the same chords the march and the far sheets use give the answer.
//   node scripts/rain-pixels.mjs [--t 8.25] [--view "lat,lon,alt,heading,pitch,fov"] [--world haven]
// With no --view it takes the three views of the report's cell pictures.
// It fails (exit 1) if the hour has no raining cell: then it is measuring nothing.
import { skyModel, cameraAt, rayOf } from './lib/skyModel.mjs';
import { cellGeometry, cellChord, cellShaftChord } from '../src/weather/sky/cellShape.js';
import { opt } from './lib/browser.mjs';

const { prod, tOf, R } = await skyModel(opt('world', 'haven'));
const t = tOf(+opt('t', '8.25'));
const cells = prod.cells(t);
const raining = cells.filter((c) => c.rain > 0 && c.strength > 0.05);
console.log(`${cells.length} cells at t=${opt('t', '8.25')} h, ${raining.length} of them raining`);

// the slices of the distance from the eye (sky/cloudVolume.js SLICE_Z, then the two far ones)
const SLICE_Z = [0, 300, 900, 2400, 5000, 9000, 16000, 40000, 200000];
const geoms = cells.map((c) => cellGeometry(c, R));

function look(name, lat, lon, alt, head, pitch, fov) {
  const view = cameraAt(R, lat, lon, alt, head, pitch), cam = view.pos;
  const W = 220, H = 103;
  let body = 0, rain = 0, rainNoBody = 0, cut = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = rayOf(view, (x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2, fov);
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
