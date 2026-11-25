// The world's own weather model, loaded for a Node script (no browser): the producer that the
// game's sky field reads from, the world, and the clock conversion the URL's ?t= uses.
//   const { world, prod, tOf, R } = await skyModel('haven');
//   prod.at(place, t, out) · prod.cells(t) · prod.anvils(t) · prod.lenses(t)   (t: s since the epoch)
//   tOf(hours)   hours from the SCENE's own moment -> the weather clock's t (?t= counts those hours;
//                the weather clock counts seconds from world.weather.epoch, 521 h earlier on Haven)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from './loadWorld.mjs';
import { makeProducer } from '../../src/weather/sky/producer.js';
import { readWxLand } from '../../src/weather/sky/land.js';
import { fieldLayout } from '../../src/weather/sky/format.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function skyModel(id = 'haven') {
  const { world, hs } = await loadWorld(id);
  const w = world.weather || {};
  const planes = w.land
    ? readWxLand(
      fs.readFileSync(path.join(root, 'public', w.land)),
      JSON.parse(fs.readFileSync(path.join(root, 'public', w.peaks), 'utf8')).peaks,
    )
    : null;
  const prod = makeProducer({ weather: w, radius: world.radius, layout: fieldLayout(world), origin: world.scene.start, wxland: planes, dayHours: world.dayHours || 24 });
  const sceneT = (Date.parse(world.scene.dateUTC) - Date.parse(w.epoch)) / 1000;
  return { world, hs, prod, R: world.radius, sceneT, tOf: (hours) => sceneT + hours * 3600 };
}

// the camera's frame at a place: its position and the three axes a view is cast with
export function cameraAt(R, lat, lon, alt, heading, pitch) {
  const RAD = Math.PI / 180, cl = Math.cos(lat * RAD);
  const u = [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  const pos = u.map((v) => v * (R + alt));
  let east = [-u[1], u[0], 0];
  const el = Math.hypot(east[0], east[1]) || 1;
  east = [east[0] / el, east[1] / el, 0];
  const north = [u[1] * east[2] - u[2] * east[1], u[2] * east[0] - u[0] * east[2], u[0] * east[1] - u[1] * east[0]];
  const ch = Math.cos(heading * RAD), sh = Math.sin(heading * RAD), cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
  const fwd = [0, 1, 2].map((k) => cp * (north[k] * ch + east[k] * sh) + u[k] * sp);
  const cr = [fwd[1] * u[2] - fwd[2] * u[1], fwd[2] * u[0] - fwd[0] * u[2], fwd[0] * u[1] - fwd[1] * u[0]];
  const rl = Math.hypot(...cr) || 1, right = cr.map((v) => v / rl);
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { pos, u, east, north, fwd, right, up };
}

// the ray through a pixel of a view (nx, ny in -1..1; fov is the VERTICAL field, as ?fov= is)
export function rayOf(cam, nx, ny, fov, aspect = 880 / 412) {
  const ty = Math.tan(fov * Math.PI / 360);
  const d = [0, 1, 2].map((k) => cam.fwd[k] + cam.right[k] * (nx * ty * aspect) + cam.up[k] * (ny * ty));
  const l = Math.hypot(...d) || 1;
  return d.map((v) => v / l);
}

// where a ray from cam.pos crosses the shell h metres over the sea, as a direction (null: it does not)
export function onShell(cam, d, R, h) {
  const rr = R + h, o = cam.pos;
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - rr * rr;
  const dis = b * b - c;
  if (dis < 0) return null;
  const s = Math.sqrt(dis), t0 = -b - s, t1 = -b + s, t = t0 > 0 ? t0 : t1;
  if (t <= 0) return null;
  const p = [0, 1, 2].map((k) => o[k] + d[k] * t);
  const l = Math.hypot(...p) || 1;
  return { dir: p.map((v) => v / l), pos: p, dist: t };
}
