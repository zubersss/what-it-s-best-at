// Hands-off flight to the chosen target (GO): where to aim, how much extra boost, and when
// the trip is over. Pure (no DOM, no three): the app drives it, and scripts/flyby.mjs
// checks it without a browser.
//
// A target is { kind: 'body' | 'place', pos: [x, y, z] (planet-fixed metres: a body's
// centre, or a point on the ground), radius (a body's, in metres) }. The world underfoot
// is centred at the origin.
import { BOOST, flightBase } from './speedLaw.js';
import { SPACE_CAP } from './gravity.js';

export const TRANSFER = 2;      // on top of the stick's boost: six times the stick's speed in open space
export const OVER_PLACE = 500;  // a trip to a place ends this high above it (then gravity, or HOVER)

const hyp = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// Metres left to fly: to a body's surface, or to the point OVER_PLACE above a place.
export function gapTo(cam, t) {
  if (t.kind === 'body') return hyp(t.pos[0] - cam[0], t.pos[1] - cam[1], t.pos[2] - cam[2]) - t.radius;
  const pl = hyp(...t.pos) || 1, k = (pl + OVER_PLACE) / pl;
  return hyp(t.pos[0] * k - cam[0], t.pos[1] * k - cam[1], t.pos[2] * k - cam[2]);
}

// How far a place is along the ground (the great circle under the camera to it), metres:
// what the marker shows for a place, since the straight line runs through the world.
export function groundDistance(cam, t, R) {
  const cl = hyp(...cam) || 1, pl = hyp(...t.pos) || 1;
  const c = (cam[0] * t.pos[0] + cam[1] * t.pos[1] + cam[2] * t.pos[2]) / (cl * pl);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R;
}

// Where the trip stops: a little above a body (in a low orbit's place), or within a few
// hundred metres of the point above a place. Gravity takes over from there unless HOVER is on.
export function standoff(t) { return t.kind === 'place' ? 250 : Math.max(2000, 0.05 * t.radius); }

// The direction to fly (unit, planet-fixed, into `out`) from the camera at `cam`, on a world
// of radius R centred at the origin.
// A place on this world: follow a point a little ahead on an arc over the ground, as high
// as a third of the arc still to go (at most half the world's radius), so the trip climbs
// at about 60 degrees at first, cruises high and comes down onto the place.
// A body: straight at it, but climbing at 40 degrees or more while still within two radii
// of the world being left (speed grows with height: skimming the ground toward a body on
// the horizon would crawl).
// Either way never through the world: a line that would pass under its surface is raised
// to clear it.
export function aimDirection(cam, t, R, out) {
  const cl = hyp(...cam) || 1, u0 = cam[0] / cl, u1 = cam[1] / cl, u2 = cam[2] / cl, h = cl - R;
  let px, py, pz;
  if (t.kind === 'place') {
    const pl = hyp(...t.pos), q0 = t.pos[0] / pl, q1 = t.pos[1] / pl, q2 = t.pos[2] / pl;
    const a = Math.acos(Math.max(-1, Math.min(1, u0 * q0 + u1 * q1 + u2 * q2)));         // arc still to go (radians)
    const ahead = Math.max(2000, 0.5 * Math.max(h, 0)) / R;                               // the carrot's lead along the arc
    const f = a > 1e-9 ? Math.min(1, ahead / a) : 1;
    // slerp from here toward the place by f of the arc
    const sa = Math.sin(a), wa = sa > 1e-9 ? Math.sin((1 - f) * a) / sa : 1 - f, wb = sa > 1e-9 ? Math.sin(f * a) / sa : f;
    const c0 = u0 * wa + q0 * wb, c1 = u1 * wa + q1 * wb, c2 = u2 * wa + q2 * wb, cn = hyp(c0, c1, c2) || 1;
    const lift = Math.max(OVER_PLACE, Math.min(0.5 * R, 0.35 * Math.max(0, a - ahead) * R));
    // no steeper than about 60 degrees: the carrot at most 1.7 leads above the camera, so the
    // trip heads for the place from the start instead of rising straight up first
    const r = Math.min(pl + lift, cl + 1.7 * ahead * R);
    px = c0 / cn * r; py = c1 / cn * r; pz = c2 / cn * r;
  } else { px = t.pos[0]; py = t.pos[1]; pz = t.pos[2]; }
  let dx = px - cam[0], dy = py - cam[1], dz = pz - cam[2];
  const dl = hyp(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
  let need = -Math.PI / 2;
  // climbing out toward a body (not the world underfoot itself)
  if (t.kind !== 'place' && hyp(...t.pos) > 2 * R) {
    const x = Math.min(1, Math.max(0, (h - 0.5 * R) / (1.5 * R)));
    need = Math.max(need, (40 * Math.PI / 180) * (1 - x * x * (3 - 2 * x)));
  }
  // never through the world: if the segment dips under 1.02 R, at least the angle that grazes it
  const along = -(cam[0] * dx + cam[1] * dy + cam[2] * dz);
  if (along > 0 && along < dl) {
    const m = hyp(cam[0] + dx * along, cam[1] + dy * along, cam[2] + dz * along);
    if (m < 1.02 * R) need = Math.max(need, (cl > 1.02 * R ? -Math.acos(1.02 * R / cl) : 0) + 3 * Math.PI / 180);
  }
  const e = Math.asin(Math.max(-1, Math.min(1, dx * u0 + dy * u1 + dz * u2)));
  if (e < need) {
    let hx = dx - u0 * Math.sin(e), hy = dy - u1 * Math.sin(e), hz = dz - u2 * Math.sin(e);
    const hl = hyp(hx, hy, hz);
    if (hl < 1e-9) { hx = 1; hy = 0; hz = 0; } else { hx /= hl; hy /= hl; hz /= hl; }
    const cs = Math.cos(need), sn = Math.sin(need);
    dx = hx * cs + u0 * sn; dy = hy * cs + u1 * sn; dz = hz * cs + u2 * sn;
  }
  out[0] = dx; out[1] = dy; out[2] = dz;
  return out;
}

// Extra boost for the transfer: TRANSFER times the boost when every body is more than 20 of
// its radii away, the plain boost within 4 (clear: metres to the nearest surface, nearR:
// that body's radius; gravity.js's `nr` minus `clear`). The speed rule still scales with the distance left, so the arrival
// is as gentle as ever.
export function transferMult(clear, nearR) {
  const x = Math.min(1, Math.max(0, (clear / Math.max(nearR, 1) - 4) / 16));
  return 1 + (TRANSFER - 1) * x * x * (3 - 2 * x);
}


// How long a GO trip from `cam` takes (seconds): the same path flown quickly as a point at
// the speed rule's limit, in steps of 3 % of the distance to the nearest surface (the world
// underfoot, or the target body). LAG covers what the point leaves out: the speed easing up
// to its limit and the turn at the start, about a second and a half (measured with
// scripts/transfer.mjs: within a few seconds of the trips it flies, longer for short hops).
// ground: the ground's height above the datum under the camera (metres); the speed rule
// counts height above the ground, which near a place is the place's own ground height.
export function tripTime(cam, t, R, ground = 0, out = [0, 0, 0]) {
  let x = cam[0], y = cam[1], z = cam[2], time = 0;
  const stop = standoff(t), p = [0, 0, 0], gap0 = Math.max(1, gapTo(cam, t)), gEnd = t.kind === 'place' ? hyp(...t.pos) - R : ground;
  for (let n = 0; n < 4000; n++) {
    p[0] = x; p[1] = y; p[2] = z;
    const gap = gapTo(p, t);
    if (gap < stop) return time + 1.5;
    const s = Math.min(1, Math.max(0, 1 - gap / gap0));
    const height = Math.max(0, hyp(x, y, z) - R - (ground + (gEnd - ground) * s));
    const near = Math.max(1.5, t.kind === 'body' ? Math.min(height, gap) : height);
    const nearRadius = t.kind === 'body' && gap < height ? t.radius : R;
    const v = Math.min(SPACE_CAP, flightBase(near) * BOOST * transferMult(near, nearRadius));
    const ds = Math.min(gap - stop + 1, Math.max(1, 0.03 * near));
    aimDirection(p, t, R, out);
    x += out[0] * ds; y += out[1] * ds; z += out[2] * ds;
    const r = hyp(x, y, z);
    const floor = R + ground + (gEnd - ground) * Math.min(1, Math.max(0, 1 - gap / gap0)) + 1.2;
    if (r < floor) { const k = floor / r; x *= k; y *= k; z *= k; }
    time += ds / v;
  }
  return Infinity;
}

