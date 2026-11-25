// What makes the sky's snapshots (docs/briefs/clouds-weather-plan.md, "THE SNAPSHOT"): until the
// model (package A: weather/sky/model.js) lands, the test pattern of weather/sky/stub.js, moved by
// the world's own steering winds (weather/sky/steer.js). One function for the page and for the
// worker that makes the snapshots (skyWorker.js), so both make the same bytes. (Package A puts
// its model, model.js, in the stub's place here: the page and the worker keep calling makeProducer.)
//
// opts (plain data, so it can be posted to a worker):
//   preset: 'fair' | 'fog' | 'storm' | 'front' (STUB_PRESETS)
//   weather: the world file's weather block (seed, epoch, dayStart, steering, days)
//   radius (m), dayHours, origin { lat, lon } (where the patterns are laid: the opening place),
//   layout (format.js fieldLayout), stormAt { lat, lon } (a mature cell that stands still: debug=storm),
//   land { data: Int16Array, width, height, scale } (the elevation, rows from latitude 90, columns from longitude 0)
// Returns the producer API: { snapshot(t), at(place, t, out), cells(t), strikes(t0, t1), records(ta, tb) },
// t in seconds since weather.epoch.
//
// Pure: no three, no DOM, no Math.random.
import { createSkyStub } from './stub.js';
import { Steer } from './steer.js';

// The local solar hour at the opening place when the weather clock reads 0: the world's day
// begins at `dayStart` hours UTC (solar midnight there).
export function hourAtEpoch(weather = {}) {
  const ms = Date.parse(weather.epoch ?? '2024-01-01T00:00:00Z'), h = (ms / 3600000) % 24;
  return ((h - (weather.dayStart ?? 0)) % 24 + 24) % 24;
}

// steer.js's motions in the form the stub takes (world = M . pattern; 'still': stands still)
export function steerMotion(steer) {
  return (layer, t, out = new Float64Array(9)) => {
    if (layer === 'still') { out.fill(0); out[0] = out[4] = out[8] = 1; return out; }
    return steer.motion(layer, t, out);
  };
}

export function makeProducer(opts) {
  const steer = new Steer(opts.weather || {}, opts.radius);
  return createSkyStub({
    preset: opts.preset || 'fair', radius: opts.radius, layout: opts.layout, origin: opts.origin,
    land: opts.land || null, motion: steerMotion(steer), hourAtEpoch: hourAtEpoch(opts.weather),
    dayHours: opts.dayHours || 24, stormAt: opts.stormAt || undefined,
  });
}
