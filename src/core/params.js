// URL parameters (see CLAUDE.md for the list).
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

function num(name, fallback) {
  if (!q.has(name)) return fallback;
  const v = parseFloat(q.get(name));
  return Number.isFinite(v) ? v : fallback;
}

export const PARAMS = {
  world: q.get('world') || 'mars',
  shot: q.get('shot') || null,          // bookmark name; also switches to deterministic "screenshot mode"
  timeOffsetHours: num('t', null),
  hud: q.has('hud') ? q.get('hud') !== '0' : null,
  scale: num('scale', null),            // fixed render scale (switches the governor off)
  mode: q.get('mode'),                  // 'smooth' (60 fps target) or 'sharp' (30 fps target)
  bench: q.get('bench'),                // 'run' or 'soak': start a benchmark as soon as the scene is ready
  fly: q.get('fly') === '1',
  dpr: num('dpr', null),                // pretend the screen has this device pixel ratio
  touch: q.get('touch') === '1',        // force the touch controls on
  hero: q.has('hero') ? q.get('hero') !== '0' : null,   // flying character on/off (default: on, off in screenshots)
  target: q.get('target'),              // the target marker on a body, 'sun' or 'place:<id>' (screenshots)
  heropose: q.get('heropose'),          // screenshots: in the air fly (default), fast, bank, climb, hover; on foot stand|walk|run|super|jump
  posedir: q.get('posedir'),            // screenshots on foot: 'side' = moving to the right of the view
  dust: q.get('dust') === '1',          // screenshots: a touch-down dust burst frozen in mid-flight
  lat: num('lat', null), lon: num('lon', null), alt: num('alt', null),
  heading: num('heading', null), pitch: num('pitch', null), fov: num('fov', null),
  east: num('east', null), north: num('north', null),   // metres from the bookmark's place, standing on the ground
  aim: q.get('aim'),                    // turn the view to this sky body (e.g. phobos, earth, sun) once it is placed
  debug: q.get('debug') || '',
};
