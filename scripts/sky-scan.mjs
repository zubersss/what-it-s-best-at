// The sky's field round a place at an hour of the game (?t=H), as the clouds are handed it,
// without a browser: heap and sheet cover, base, thickness, the country's height, on a grid.
//   node scripts/sky-scan.mjs [--t 4] [--lat .. --lon ..] [--span 120] [--n 9] [--stub fair]
// The hour is the game's (?t=, from the scene's moment), turned into the weather's clock here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldLayout, fieldAt, uvOfLatLon } from '../src/weather/sky/format.js';
import { makeProducer } from '../src/weather/sky/producer.js';
import { readWxLand } from '../src/weather/sky/land.js';
import haven from '../src/worlds/haven.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const H = Number(arg('t', 4)), lat0 = Number(arg('lat', haven.scene.start.lat)), lon0 = Number(arg('lon', haven.scene.start.lon));
const span = Number(arg('span', 120)) * 1000, n = Number(arg('n', 9)), preset = arg('stub', null);

export function havenProducer(preset = null) {
  const buf = fs.readFileSync(path.join(root, 'public/data/haven_dem_4096.i16'));
  const dem = { data: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1), width: 4096, height: 2048 };
  const peaks = JSON.parse(fs.readFileSync(path.join(root, 'public/data/haven_peaks.json'), 'utf8')).peaks;
  const wxland = readWxLand(fs.readFileSync(path.join(root, 'public/data/haven_wxland_1024.u8')), peaks);
  const layout = fieldLayout(haven);
  return makeProducer({ preset, weather: haven.weather, radius: haven.radius, dayHours: haven.dayHours || 24, origin: haven.scene.start, layout, land: dem, wxland, year: haven.year || null });
}
// the weather clock at ?t=H
export const tWeather = (h) => (Date.parse(haven.scene.dateUTC) - Date.parse(haven.weather.epoch)) / 1000 + h * 3600;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = havenProducer(preset), t = tWeather(H);
  const s = p.snapshot(Math.floor(t / 120) * 120);
  const R = haven.radius, dLat = (span / R) * 180 / Math.PI;
  for (const key of (arg('keys', 'heap,sheet,base,thick,country,mid,high')).split(',')) {
    console.log(`${key} (north at the top, ${span / 1000} km across, ?t=${H})`);
    for (let j = 0; j < n; j++) {
      let row = '';
      for (let i = 0; i < n; i++) {
        const lat = lat0 + dLat * (0.5 - j / (n - 1)), lon = lon0 + dLat * (i / (n - 1) - 0.5) / Math.cos(lat * Math.PI / 180);
        const uv = uvOfLatLon(lat, ((lon % 360) + 360) % 360);
        const f = fieldAt(s, null, 0, uv[0], uv[1]);
        row += (['heap', 'sheet', 'mid', 'high', 'wet'].includes(key) ? f[key].toFixed(2) : String(Math.round(f[key]))).padStart(6);
      }
      console.log(row);
    }
  }
  console.log('cells:', p.cells(t).length, 'systems:', JSON.stringify(p.systems ? p.systems(t).slice(0, 3) : []).slice(0, 400));
}
