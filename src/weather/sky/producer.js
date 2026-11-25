// What makes the sky's snapshots (docs/briefs/clouds-weather-plan.md, "THE SNAPSHOT"): the day's
// weather by rule (weather/sky/model.js) on a world whose weather is `made`, one static snapshot
// from a day's maps on a world whose weather is `maps` (weather/sky/fromMaps.js: Earth), and step
// 0's test pattern (weather/sky/stub.js) when a preset is asked for (?debug=sky:<preset>). One
// function for the page and for the worker that makes the snapshots (skyWorker.js), so both make
// the same bytes.
//
// opts (plain data, so it can be posted to a worker):
//   preset: 'fair' | 'fog' | 'storm' | 'front' (STUB_PRESETS) for the test pattern; 'model' or
//           none for the world's own weather
//   weather: the world file's weather block (recipe, seed, epoch, dayStart, steering, days, and
//           the model's own numbers: model.js MODEL_DEFAULTS)
//   radius (m), dayHours, origin { lat, lon } (where the patterns are laid: the opening place),
//   layout (format.js fieldLayout), stormAt { lat, lon } (a mature cell that stands still: debug=storm),
//   land { data: Int16Array, width, height, scale } (the elevation, rows from latitude 90, columns
//           from longitude 0), wxland (the planes of land.js, read from <world>_wxland_<W>.u8:
//           without them they are worked out from `land`),
//   maps (a world of maps: { rain, tops, cloud } as { data, w, h } and `storms`; fromMaps.js)
// Returns the producer API: { snapshot(t), at(place, t, out), cells(t), strikes(t0, t1),
// records(ta, tb) } and, from the model, anvils(t), lenses(t) and systems(t). t in seconds since
// weather.epoch.
//
// Pure: no three, no DOM, no Math.random.
import { createSkyStub } from './stub.js';
import { createSkyModel } from './model.js';
import { createEarthSky } from './fromMaps.js';
import { Steer } from './steer.js';

// The local solar hour at the opening place when the weather clock reads 0: the world's day
// begins at `dayStart` hours UTC (solar midnight there).
export function hourAtEpoch(weather = {}) {
  const ms = Date.parse(weather.epoch ?? '2024-01-01T00:00:00Z'), h = (ms / 3600000) % 24;
  return ((h - (weather.dayStart ?? 0)) % 24 + 24) % 24;
}

// The local solar hour at a longitude at the clock t, and the clock at which it is `hour` local
// at a longitude on a day of the world's calendar (steer.js dayIndex/dayStartT). One rule for the
// model, the scripts and the tests.
export function localHour(opts, lon, t) {
  const h0 = hourAtEpoch(opts.weather || {}), dayHours = opts.dayHours || 24;
  const originLon = (opts.origin || { lon: 0 }).lon;
  const h = (h0 + t * 24 / (dayHours * 3600) + (lon - originLon) / 15) % 24;
  return h < 0 ? h + 24 : h;
}
export function tForHour(opts, steer, dayIndex, hour, lon = (opts.origin || { lon: 0 }).lon) {
  const originLon = (opts.origin || { lon: 0 }).lon, dayHours = opts.dayHours || 24;
  return steer.dayStartT(dayIndex) + (hour - (lon - originLon) / 15) * dayHours * 3600 / 24;
}

// steer.js's motions in the form the stub takes (world = M . pattern; 'still': stands still)
export function steerMotion(steer) {
  return (layer, t, out = new Float64Array(9)) => {
    if (layer === 'still') { out.fill(0); out[0] = out[4] = out[8] = 1; return out; }
    return steer.motion(layer, t, out);
  };
}

export function makeProducer(opts) {
  const weather = opts.weather || {};
  const preset = opts.preset && opts.preset !== 'model' ? opts.preset : null;
  if (preset) {
    const steer = new Steer(weather, opts.radius);
    return createSkyStub({
      preset, radius: opts.radius, layout: opts.layout, origin: opts.origin,
      land: opts.land || null, motion: steerMotion(steer), hourAtEpoch: hourAtEpoch(weather),
      dayHours: opts.dayHours || 24, stormAt: opts.stormAt || undefined,
    });
  }
  const recipe = opts.recipe || weather.recipe || 'made';
  if (recipe === 'maps') return createEarthSky({ ...opts, hourAtEpoch: hourAtEpoch(weather) });
  return createSkyModel({ ...opts, hourAtEpoch: hourAtEpoch(weather) });
}
