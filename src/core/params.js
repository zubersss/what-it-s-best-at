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
  heropose: q.get('heropose'),          // screenshots: 'fly' (default) or 'hover'
  lat: num('lat', null), lon: num('lon', null), alt: num('alt', null),
  heading: num('heading', null), pitch: num('pitch', null), fov: num('fov', null),
  debug: q.get('debug') || '',
};
