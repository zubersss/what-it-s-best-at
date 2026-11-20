// Low-precision ephemeris: Keplerian orbits + IAU rotation models.
// Pure JS (no three) so it also runs in Node scripts.
//
// Internal inertial frame: J2000 equatorial (ICRF), metres. The home world's
// planet-fixed frame is described in docs/ARCHITECTURE.md.

const DEG = Math.PI / 180;
const OBLIQUITY = 23.43928 * DEG;
const COS_E = Math.cos(OBLIQUITY), SIN_E = Math.sin(OBLIQUITY);
const J2000 = 2451545.0;
const TT_MINUS_UTC_DAYS = 69.184 / 86400;   // good to ~1 s for 2017+, 2 s for 2012–2016

export function dateToJD(ms) { return ms / 86400000 + 2440587.5 + TT_MINUS_UTC_DAYS; }
export function jdToDate(jd) { return (jd - TT_MINUS_UTC_DAYS - 2440587.5) * 86400000; }

function solveKepler(M, e) {
  M = M % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI; else if (M < -Math.PI) M += 2 * Math.PI;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

// Position in the orbit's own reference frame.
function orbitPosition(orbit, jd, out) {
  const T = (jd - (orbit.epochJD ?? J2000)) / 36525;
  const a = orbit.a[0] + orbit.a[1] * T;
  const e = orbit.e[0] + orbit.e[1] * T;
  const inc = (orbit.i[0] + orbit.i[1] * T) * DEG;
  // (swing: [degrees, period in centuries, phase in degrees]: a moon locked in a resonance
  // runs ahead of and behind its mean place by this much, like a slow pendulum)
  const swing = orbit.swing;
  const L = (orbit.L[0] + orbit.L[1] * T + (swing ? swing[0] * Math.sin((360 * T / swing[1] + swing[2]) * DEG) : 0)) * DEG;
  const lp = (orbit.lonPeri[0] + orbit.lonPeri[1] * T) * DEG;
  const node = (orbit.node[0] + orbit.node[1] * T) * DEG;
  const w = lp - node;
  const E = solveKepler(L - lp, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);
  out[0] = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  out[1] = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  out[2] = (sw * si) * xp + (cw * si) * yp;
  return out;
}

// Basis (rows X, Y, Z in ICRF) of a plane whose pole is at (ra, dec).
function poleFrame(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  const Z = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const X = [-Math.sin(ra), Math.cos(ra), 0];
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  return [X, Y, Z];
}

export class Ephemeris {
  constructor(catalogue, homeId) {
    this.cat = catalogue;
    this.homeId = homeId;
    this._tmp = [0, 0, 0];
    this._frames = new Map();
    // Per-update outputs
    this.jd = 0;
    this.icrfToFixed = new Float64Array(9);     // row-major 3x3
    this.sunDir = [0, 0, 1];                      // unit, planet-fixed
    this.sunDistance = 1;                         // metres
    this.bodies = new Map();                      // id -> { pos:[x,y,z] fixed frame, relative to home centre; distance; sunPos (ICRF, from sun) }
  }

  // Position relative to the Sun, ICRF, metres.
  positionICRF(id, jd, out = [0, 0, 0]) {
    out[0] = out[1] = out[2] = 0;
    let cur = id;
    const t = this._tmp;
    while (cur && cur !== 'sun') {
      const body = this.cat[cur];
      const o = body.orbit;
      orbitPosition(o, jd, t);
      if (o.frame === 'ecliptic') {
        out[0] += t[0];
        out[1] += t[1] * COS_E - t[2] * SIN_E;
        out[2] += t[1] * SIN_E + t[2] * COS_E;
      } else {
        let F = this._frames.get(cur);
        if (!F) { F = poleFrame(o.framePole.ra, o.framePole.dec); this._frames.set(cur, F); }
        out[0] += t[0] * F[0][0] + t[1] * F[1][0] + t[2] * F[2][0];
        out[1] += t[0] * F[0][1] + t[1] * F[1][1] + t[2] * F[2][1];
        out[2] += t[0] * F[0][2] + t[1] * F[1][2] + t[2] * F[2][2];
      }
      cur = body.parent;
    }
    return out;
  }

  // Row-major 3x3: v_fixed = M * v_icrf.
  rotationMatrix(id, jd, out = new Float64Array(9)) {
    const rot = this.cat[id].rotation;
    if (!rot) return this._lockedMatrix(id, jd, out);
    const d = jd - J2000, T = d / 36525;
    const a0 = (rot.ra[0] + rot.ra[1] * T) * DEG;
    const d0 = (rot.dec[0] + rot.dec[1] * T) * DEG;
    const W = ((rot.w[0] + rot.w[1] * d) % 360) * DEG;
    const ca = Math.cos(a0), sa = Math.sin(a0), cd = Math.cos(d0), sd = Math.sin(d0);
    const cw = Math.cos(W), sw = Math.sin(W);
    // Node Q = (-sa, ca, 0); pole P = (cd ca, cd sa, sd); R = P x Q.
    const Q = [-sa, ca, 0];
    const P = [cd * ca, cd * sa, sd];
    const R = [P[1] * Q[2] - P[2] * Q[1], P[2] * Q[0] - P[0] * Q[2], P[0] * Q[1] - P[1] * Q[0]];
    for (let k = 0; k < 3; k++) {
      out[k] = cw * Q[k] + sw * R[k];
      out[3 + k] = -sw * Q[k] + cw * R[k];
      out[6 + k] = P[k];
    }
    return out;
  }

  // A moon that keeps one face to its planet and has no rotation elements of its own:
  // longitude 0 looks at the parent, the pole is the normal of its orbit.
  _lockedMatrix(id, jd, out) {
    const body = this.cat[id];
    if (!body.parent || !body.orbit) { out.fill(0); out[0] = out[4] = out[8] = 1; return out; }
    const a = this._la || (this._la = [0, 0, 0]), b = this._lb || (this._lb = [0, 0, 0]), pa = this._lp || (this._lp = [0, 0, 0]);
    const rel = (t, o) => { this.positionICRF(id, t, o); this.positionICRF(body.parent, t, pa); o[0] -= pa[0]; o[1] -= pa[1]; o[2] -= pa[2]; return o; };
    rel(jd, a); rel(jd + 1e-3, b);                              // a minute and a half later: the direction of travel
    const al = Math.hypot(a[0], a[1], a[2]), X = [-a[0] / al, -a[1] / al, -a[2] / al];
    let Z = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const zl = Math.hypot(Z[0], Z[1], Z[2]); Z = [Z[0] / zl, Z[1] / zl, Z[2] / zl];
    const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
    for (let k = 0; k < 3; k++) { out[k] = X[k]; out[3 + k] = Y[k]; out[6 + k] = Z[k]; }
    return out;
  }

  update(jd, bodyIds) {
    this.jd = jd;
    const M = this.rotationMatrix(this.homeId, jd, this.icrfToFixed);
    const home = this.positionICRF(this.homeId, jd, [0, 0, 0]);
    const toFixed = (v, out) => {
      out[0] = M[0] * v[0] + M[1] * v[1] + M[2] * v[2];
      out[1] = M[3] * v[0] + M[4] * v[1] + M[5] * v[2];
      out[2] = M[6] * v[0] + M[7] * v[1] + M[8] * v[2];
      return out;
    };
    const s = toFixed([-home[0], -home[1], -home[2]], [0, 0, 0]);
    this.sunDistance = Math.hypot(s[0], s[1], s[2]);
    this.sunDir[0] = s[0] / this.sunDistance; this.sunDir[1] = s[1] / this.sunDistance; this.sunDir[2] = s[2] / this.sunDistance;
    for (const id of bodyIds) {
      let b = this.bodies.get(id);
      if (!b) { b = { pos: [0, 0, 0], sunPos: [0, 0, 0], distance: 0 }; this.bodies.set(id, b); }
      const p = this.positionICRF(id, jd, b.sunPos);
      toFixed([p[0] - home[0], p[1] - home[1], p[2] - home[2]], b.pos);
      b.distance = Math.hypot(b.pos[0], b.pos[1], b.pos[2]);
    }
  }
}

// Helpers shared by the app and scripts.
export function latLonToDir(latDeg, lonDeg, out = [0, 0, 0]) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  out[0] = Math.cos(la) * Math.cos(lo); out[1] = Math.cos(la) * Math.sin(lo); out[2] = Math.sin(la);
  return out;
}

export function dirToLatLon(d) {
  const r = Math.hypot(d[0], d[1], d[2]);
  return { lat: Math.asin(d[2] / r) / DEG, lon: ((Math.atan2(d[1], d[0]) / DEG) + 360) % 360 };
}

// East / north / up unit vectors at a direction (planet-fixed frame).
export function localFrame(dir, east = [0, 0, 0], north = [0, 0, 0], up = [0, 0, 0]) {
  const r = Math.hypot(dir[0], dir[1], dir[2]);
  up[0] = dir[0] / r; up[1] = dir[1] / r; up[2] = dir[2] / r;
  let ex = -up[1], ey = up[0];
  const el = Math.hypot(ex, ey);
  if (el < 1e-12) { ex = 1; ey = 0; } else { ex /= el; ey /= el; }
  east[0] = ex; east[1] = ey; east[2] = 0;
  north[0] = up[1] * east[2] - up[2] * east[1];
  north[1] = up[2] * east[0] - up[0] * east[2];
  north[2] = up[0] * east[1] - up[1] * east[0];
  return { east, north, up };
}

// Elevation (deg) and azimuth (deg, clockwise from north) of a planet-fixed direction as
// seen from a surface point `dir`.
export function elevationAzimuth(siteDir, target) {
  const { east, north, up } = localFrame(siteDir);
  const e = target[0] * east[0] + target[1] * east[1] + target[2] * east[2];
  const n = target[0] * north[0] + target[1] * north[1] + target[2] * north[2];
  const u = target[0] * up[0] + target[1] * up[1] + target[2] * up[2];
  return { elevation: Math.asin(Math.max(-1, Math.min(1, u))) / DEG, azimuth: ((Math.atan2(e, n) / DEG) + 360) % 360 };
}
