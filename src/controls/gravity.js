// Gravity for flight, and the two limits that keep a fast traveller from losing a planet.
//
// Flight speed here is not physical: top speed is proportional to the distance to the
// nearest surface, so that one stick covers a rock, an orbit and the gap between planets.
// Real gravity (millimetres per second squared between planets) would do nothing at those
// speeds, so gravity is expressed in the same currency: a drift toward each body, as a
// fraction of the local top speed. The fraction grows slowly with the body's real
// gravitational acceleration at the traveller's distance (g = surface gravity x (R / r)^2):
//
//   pull = PULL_SCALE * g^PULL_POWER      Sun's surface 0.68, Earth 0.35, Mars 0.29,
//                                         the Moon 0.24, Phobos 0.08, the Sun's pull at
//                                         Mars's distance 0.07
//
// Because speed shrinks with distance, a fall is an ever-slowing approach: it never ends
// in a crash. The pull is switched off by hovering and fades out as the stick is pushed
// (CameraRig does that part): gravity takes over when the pilot lets go.
//
// Pure numbers: no three.js, usable from Node.
export const PULL_SCALE = 0.22, PULL_POWER = 0.2, PULL_MAX = 0.75;
export const SWEEP = 0.45;          // rad/s: how fast the nearest body may sweep across the view
export const SPACE_CAP = 4.5e11;    // m/s (3 AU per second): no faster, however empty the space around

export function pullOf(g) { return g > 0 ? Math.min(PULL_MAX, PULL_SCALE * Math.pow(g, PULL_POWER)) : 0; }

// bodies: [{ x, y, z (centre, metres, same frame as pos), radius, gravity (surface, m/s^2) }].
// Writes into `out`: gx, gy, gz (the pull, a vector of length <= PULL_MAX pointing where
// things fall), and the body with the nearest surface: nx, ny, nz (unit vector toward its
// centre) and nr (distance to that centre).
//
// Each body's pull is weighted by its share of the total gravity felt (squared): close to
// a world only that world pulls. Without this the Sun, which pulls everything near a
// planet equally and so moves nothing relative to it, would drag a traveller standing
// on Mars sideways along the ground toward the sunset.
const _g = [];
export function surroundings(pos, bodies, out) {
  let best = Infinity, sum2 = 0;
  out.nx = 0; out.ny = 0; out.nz = 1; out.nr = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i], dx = b.x - pos.x, dy = b.y - pos.y, dz = b.z - pos.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // (gr: the radius the surface gravity belongs to, where `radius` is a wider keep-out: a ringed planet)
    const gr = b.gr ?? b.radius, g = (b.gravity || 0) * (gr / Math.max(r, gr)) * (gr / Math.max(r, gr));
    _g[i] = g; sum2 += g * g;
    if (r - b.radius < best) { best = r - b.radius; out.nx = dx / r; out.ny = dy / r; out.nz = dz / r; out.nr = r; }
  }
  let gx = 0, gy = 0, gz = 0;
  if (sum2 > 0) {
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i], dx = b.x - pos.x, dy = b.y - pos.y, dz = b.z - pos.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const p = pullOf(_g[i]) * (_g[i] * _g[i] / sum2);
      gx += dx / r * p; gy += dy / r * p; gz += dz / r * p;
    }
  }
  const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (gl > PULL_MAX) { const k = PULL_MAX / gl; gx *= k; gy *= k; gz *= k; }
  out.gx = gx; out.gy = gy; out.gz = gz;
  return out;
}
