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
  scale: num('scale', null),            // fixed render scale (disables dynamic resolution)
  fly: q.get('fly') === '1',
  fps: num('fps', null),
  lat: num('lat', null), lon: num('lon', null), alt: num('alt', null),
  heading: num('heading', null), pitch: num('pitch', null), fov: num('fov', null),
  debug: q.get('debug') || '',
};
