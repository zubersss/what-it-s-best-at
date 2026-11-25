// Earth's weather maps as plain numbers, for Node scripts (src/weather/sky/fromMaps.js takes
// them this way; in the game the page decodes them as src/weather/weather.js did).
//
// The maps are JPEGs, which Node cannot decode on its own: they are turned into raw bytes by
// Python's PIL (as scripts/make-world-maps.mjs makes its JPEGs) and kept in .cache/earthmaps/.
// The storms are JSON and need nothing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// One greyscale map: { data: Uint8Array, w, h }. Cached beside the repository.
export function greyMap(root, url, cache = '.cache/earthmaps') {
  const src = path.join(root, 'public', url);
  if (!fs.existsSync(src)) throw new Error(`earthMaps: ${url} is not in public/`);
  const dir = path.join(root, cache);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, path.basename(url).replace(/\.\w+$/, '') + '.grey');
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
    const py = `
import sys
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
im = Image.open(sys.argv[1]).convert('L')
open(sys.argv[2], 'wb').write(im.tobytes())
open(sys.argv[2] + '.size', 'w').write('%d %d' % im.size)
`;
    execFileSync('python3', ['-c', py, src, out], { stdio: 'inherit' });
  }
  const [w, h] = fs.readFileSync(out + '.size', 'utf8').trim().split(' ').map(Number);
  const data = new Uint8Array(fs.readFileSync(out));
  if (data.length !== w * h) throw new Error(`earthMaps: ${url} is ${data.length} bytes, not ${w} x ${h}`);
  return { data, w, h };
}

// Every map a world's `weather` block names, and its storms.
export function earthMapsFromDisk(root, world) {
  const d = world.weather || {};
  const maps = {};
  if (d.rain) maps.rain = greyMap(root, d.rain);
  if (d.tops) maps.tops = greyMap(root, d.tops);
  if (d.cloud) maps.cloud = greyMap(root, d.cloud);
  const storms = d.storms ? JSON.parse(fs.readFileSync(path.join(root, 'public', d.storms), 'utf8')).storms || [] : [];
  return { ...maps, storms };
}

// Check 10: the rain and the ground wind of fromMaps.js against src/weather/weather.js's own, at
// five places (hurricane Irma among them). weather.js is given the same maps by hand, since in
// the game it reads them through the DOM.
export async function compareWithWeatherJs(world, maps, mod) {
  const { Weather } = await import('../../src/weather/weather.js');
  const wx = new Weather();
  wx.setWorld(world);
  wx.maps = { rain: maps.rain, tops: maps.tops, cloud: maps.cloud };
  wx.storms = maps.storms;
  const sky = mod.createEarthSky({ weather: world.weather, radius: world.radius, maps, storms: maps.storms });
  const irma = maps.storms.find((s) => /irma/i.test(s.name || '')) || maps.storms[0];
  const places = [
    ['Irma', irma ? irma.lat : 21, irma ? irma.lon : -72],
    ['the Grand Canyon', 36.1, -112.1],
    ['the Amazon', -3.1, -60.0],
    ['the Southern Ocean', -52.0, 150.0],
    ['the Sahara', 23.4, 12.0],
  ];
  let worstRain = 0, worstWind = 0;
  const lines = [], out = [0, 0];
  for (const [name, lat, lon] of places) {
    const r0 = wx.rainAt(lat, lon), r1 = sky.rain(lat, (lon + 360) % 360);
    const w0 = wx.windAt(lat, lon, [0, 0]), w1 = sky.wind(lat, (lon + 360) % 360, out);
    const dr = Math.abs(r1 - r0) / Math.max(0.05, r0);
    const dw = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) / Math.max(0.5, Math.hypot(w0[0], w0[1]));
    worstRain = Math.max(worstRain, dr); worstWind = Math.max(worstWind, dw);
    lines.push(`${name}: rain ${r0.toFixed(3)} -> ${r1.toFixed(3)} mm/h (${(dr * 100).toFixed(2)} %), wind ${Math.hypot(w0[0], w0[1]).toFixed(2)} -> ${Math.hypot(w1[0], w1[1]).toFixed(2)} m/s (${(dw * 100).toFixed(2)} %)`);
  }
  return { worstRain, worstWind, lines };
}
