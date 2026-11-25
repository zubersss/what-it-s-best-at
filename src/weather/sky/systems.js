// The travelling weather: lows with their fronts, highs between them, and tropical waves
// (docs/briefs/clouds-weather-plan.md, "SYSTEMS"). Closed form: every system is born at a slot
// of the clock, at a place and with numbers a hash of that slot gives, and is carried rigidly by
// the mid layer's steering (steer.js), centre and fronts alike:
//     position(t) = M_mid(t) . M_mid(born)^-1 . the birth point
// so nothing of it is added up frame by frame, any jump of the clock simply works, and
// scripts/sky-model-test.mjs can hold it against steer.carry().
//
// A low: a centre that travels along its hemisphere's track, with a cold front trailing behind
// it and a warm front ahead, both arcs from the centre, drawn as a few points carried with it.
// It brings lift (cloud and rain), moisture in its warm sector, a shield of mid and high cloud
// ahead of its warm front, a deck of rain cloud in the last 20 km before it, and a gustier
// ground wind. The fronts occlude in the last part of its life: the warm front shortens and the
// lift gathers round the centre.
// A high: no fronts, air sinking: less cloud, drier aloft, calmer wind.
// A tropical wave: a small moist whirl near the season's tropical line, no fronts.
//
// Nothing here turns the cloud winds: the steering is the wind, one rigid flow a layer (the plan,
// "CORRECTIONS"). A low only strengthens and gusts the ground wind and brings lift, moisture,
// cover and rain.
//
// Pure: no three, no DOM, no Math.random. A function of (seed, the world's numbers, the clock).
import { hash3 } from '../../terrain/height/noise.js';
import { dirOf, latOf, lonOf, offsetDir } from './land.js';

export const SYSTEM_DEFAULTS = Object.freeze({
  lowEvery: 26 * 3600,        // s: one low on each hemisphere's track every so often
  lowLat: [40, 56],           // degrees: where its centre is born ...
  seasonLat: 4,               // ... shifted this far toward the summer pole by the season
  lowRadius: [70000, 130000], // m
  lowLife: [36 * 3600, 64 * 3600],  // s
  coldBearing: [200, 235],    // degrees from the centre (north: the cold front's arc turns from .. to ..)
  coldLength: 2.2,            // radii
  warmBearing: [110, 70], warmLength: 1.4,
  occlude: 0.6,               // the share of its life after which the fronts occlude
  highLat: [28, 46], highRadius: 160000, highBetween: 0.5,   // a high between each pair of lows, at this share of the way
  waveEvery: 30 * 3600, waveLat: [8, 20], waveRadius: 90000, waveLife: 40 * 3600,
  still: false,               // a fault for the test: leave every system where it was born
});

const DEG = Math.PI / 180;
// A front's segments, worked out once: for each, its ends, the unit normal of its great circle
// and the cosine of its length. A place's distance to it then costs one square root and one
// arc sine (systemFieldAt is asked it at tens of thousands of places a snapshot).
const SEG = 10;
const SIDE_SOFT = 7000;          // m: how wide the change from one side of a front to the other is
const SIDE_FAR = [80000, 220000]; // m: where its air masses fade out altogether
function segments(pts) {
  const out = new Float64Array((pts.length - 1) * SEG);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], o = (i - 1) * SEG;
    let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    out[o] = a[0]; out[o + 1] = a[1]; out[o + 2] = a[2];
    out[o + 3] = b[0]; out[o + 4] = b[1]; out[o + 5] = b[2];
    out[o + 6] = nx; out[o + 7] = ny; out[o + 8] = nz;
    out[o + 9] = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  }
  return out;
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const CH = { LAT: 11, LON: 12, RADIUS: 13, LIFE: 14, WAVE: 15, HIGH: 16 };
const u01 = (seed, slot, ch) => hash3(slot, ch, 0x51a7, seed) / 4294967296;

// One system's shape at t: where it is, how strong, and the points of its fronts.
// kind: 'low' | 'high' | 'wave'. strength 0..1 (0 at birth and death).
function carry(steer, cfg, born, t, p, out) {
  if (cfg.still) { out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; }
  return steer.carry('mid', born, t, p, out);
}

// Every system alive at t (s since the weather epoch), in a fixed order.
export function systemsAt(cfg, steer, t, season = 0) {
  const out = [];
  const lowEvery = cfg.lowEvery, maxLife = cfg.lowLife[1];
  const k0 = Math.ceil((t - maxLife) / lowEvery), k1 = Math.floor(t / lowEvery);
  for (let k = k0; k <= k1; k++) for (const hemi of [1, -1]) {
    const seed = steer.seed ^ (hemi > 0 ? 0 : 0x5bf03635);
    const life = cfg.lowLife[0] + (cfg.lowLife[1] - cfg.lowLife[0]) * u01(seed, k, CH.LIFE);
    const born = k * lowEvery, age = t - born;
    if (age < 0 || age >= life) continue;
    const lat = hemi * (cfg.lowLat[0] + (cfg.lowLat[1] - cfg.lowLat[0]) * u01(seed, k, CH.LAT) + cfg.seasonLat * season * hemi);
    const lon = 360 * u01(seed, k, CH.LON);
    const radius = cfg.lowRadius[0] + (cfg.lowRadius[1] - cfg.lowRadius[0]) * u01(seed, k, CH.RADIUS);
    const strength = Math.pow(Math.sin(Math.PI * age / life), 1.2);
    const occ = ss(cfg.occlude, 1, age / life);
    const birth = dirOf(lat, lon);
    const s = { id: k * 8 + (hemi > 0 ? 0 : 1), kind: 'low', born, age, life, radius, strength, hemi, occluded: occ, lat: 0, lon: 0, x: 0, y: 0, z: 0, cold: [], warm: [] };
    const c = carry(steer, cfg, born, t, birth, [0, 0, 0]);
    s.x = c[0]; s.y = c[1]; s.z = c[2]; s.lat = latOf(c); s.lon = lonOf(c);
    // the fronts: arcs of points from the centre, made at birth and carried with it
    const arc = (b0, b1, len, n, into) => {
      for (let i = 1; i <= n; i++) {
        const f = i / n, b = (b0 + (b1 - b0) * f) * hemi * DEG, d = f * len * radius;
        const p = offsetDir(birth, b, d, steer.R);
        const q = carry(steer, cfg, born, t, p, [0, 0, 0]);
        into.push(q);
      }
    };
    arc(cfg.coldBearing[0], cfg.coldBearing[1], cfg.coldLength, 4, s.cold);
    arc(cfg.warmBearing[0], cfg.warmBearing[1], cfg.warmLength * (1 - 0.7 * occ), 3, s.warm);
    s.cold.unshift([s.x, s.y, s.z]); s.warm.unshift([s.x, s.y, s.z]);
    s.coldSeg = segments(s.cold); s.warmSeg = segments(s.warm);
    out.push(s);
  }
  // a high between each pair of lows (half way along the track, a third of a turn on), and the waves
  for (let k = k0; k <= k1 + 1; k++) for (const hemi of [1, -1]) {
    const seed = (steer.seed ^ (hemi > 0 ? 0x1234 : 0x4321)) | 0;
    const life = 1.6 * lowEvery, born = (k + 0.5) * lowEvery, age = t - born;
    if (age < 0 || age >= life) continue;
    const lat = hemi * (cfg.highLat[0] + (cfg.highLat[1] - cfg.highLat[0]) * u01(seed, k, CH.HIGH) - cfg.seasonLat * season * hemi);
    const lon = 360 * ((u01(seed, k, CH.LON) + 0.37) % 1);
    const birth = dirOf(lat, lon), c = carry(steer, cfg, born, t, birth, [0, 0, 0]);
    out.push({ id: k * 8 + 2 + (hemi > 0 ? 0 : 1), kind: 'high', born, age, life, radius: cfg.highRadius, strength: Math.pow(Math.sin(Math.PI * age / life), 0.8), hemi, occluded: 0, lat: latOf(c), lon: lonOf(c), x: c[0], y: c[1], z: c[2], cold: [], warm: [] });
  }
  {
    const seed = (steer.seed ^ 0x2f6b) | 0, every = cfg.waveEvery, life = cfg.waveLife;
    for (let k = Math.ceil((t - life) / every); k <= Math.floor(t / every); k++) {
      const born = k * every, age = t - born;
      if (age < 0 || age >= life) continue;
      const hemi = u01(seed, k, CH.WAVE) < 0.5 ? 1 : -1;
      const lat = hemi * (cfg.waveLat[0] + (cfg.waveLat[1] - cfg.waveLat[0]) * u01(seed, k, CH.LAT));
      const lon = 360 * u01(seed, k, CH.LON);
      const birth = dirOf(lat, lon), c = carry(steer, cfg, born, t, birth, [0, 0, 0]);
      out.push({ id: k * 8 + 4, kind: 'wave', born, age, life, radius: cfg.waveRadius, strength: Math.pow(Math.sin(Math.PI * age / life), 1.0), hemi, occluded: 0, lat: latOf(c), lon: lonOf(c), x: c[0], y: c[1], z: c[2], cold: [], warm: [] });
    }
  }
  return out;
}

// ---- what the systems do at a place ----------------------------------------------------------

export function makeSystemField() {
  return {
    lift: 0,          // m/s of rising air they give (the fronts and the lows; a high is negative)
    nimbo: 0,         // 0..1: how much rain deck (nimbostratus) they lay
    mid: 0, high: 0,  // 0..1: the shields of mid and high cloud ahead of a warm front
    wet: 0,           // 0..1: how much moister the air is (the warm sector, the warm front)
    dry: 0,           // 0..1: how much drier (behind a cold front, under a high)
    cold: 0,          // 0..1: how near the cold front's own line (its band of lift)
    behind: 0,        // 0..1: in the cold air behind a cold front (unstable)
    high0: 0,         // 0..1: under a high (stable, calm)
    strength: 0,      // 0..1: the strongest low or wave over the place (gusts the ground wind)
    frontDist: 1e9,   // m to the nearest front (either), for the model's front-borne cells
  };
}

const _dd = [0, 0];
// The nearest distance (m) from the unit direction p to a front's segments, and which side of it
// p lies on (+1 on the side the segment's normal points to): into out. The foot's angle from each
// end is tested by cosines alone (dot(a, p) over sqrt(1 - s^2), since the normal is at right
// angles to both ends), so only the answer itself costs an arc sine.
function frontDistance(p, seg, R, out) {
  let best = 4, sum = 0, weight = 0;          // (4: more than any chord on the unit sphere)
  for (let o = 0; o < seg.length; o += SEG) {
    const s = p[0] * seg[o + 6] + p[1] * seg[o + 7] + p[2] * seg[o + 8];
    const perp = Math.sqrt(Math.max(0, 1 - s * s)), lim = seg[o + 9] * perp;
    const da = p[0] * seg[o] + p[1] * seg[o + 1] + p[2] * seg[o + 2];
    const db = p[0] * seg[o + 3] + p[1] * seg[o + 4] + p[2] * seg[o + 5];
    let d2;
    if (da >= lim && db >= lim) d2 = s * s;                       // the foot is on the arc
    else {
      const ax = p[0] - seg[o], ay = p[1] - seg[o + 1], az = p[2] - seg[o + 2];
      const bx = p[0] - seg[o + 3], by = p[1] - seg[o + 4], bz = p[2] - seg[o + 5];
      d2 = Math.min(ax * ax + ay * ay + az * az, bx * bx + by * by + bz * bz);
    }
    if (d2 < best) best = d2;
    // which side, weighted toward the nearest segments: the side of the ONE nearest flips where
    // two segments meet, and a place seventy kilometres away would change its air mass between
    // one snapshot and the next
    const w = 1 / (d2 + 1e-7);
    sum += w * s; weight += w;
  }
  out[0] = 2 * Math.asin(Math.min(1, 0.5 * Math.sqrt(best))) * R;
  out[1] = weight > 0 ? Math.asin(Math.max(-1, Math.min(1, sum / weight))) * R : 0;   // m, signed
  return out;
}

// What every system does at the unit direction p, added up (the plan's "LIFT AND INSTABILITY"
// and "MOISTURE"). R: the world's radius.
export function systemFieldAt(list, p, R, out = makeSystemField()) {
  out.lift = 0; out.nimbo = 0; out.mid = 0; out.high = 0; out.wet = 0; out.dry = 0;
  out.cold = 0; out.behind = 0; out.high0 = 0; out.strength = 0; out.frontDist = 1e9;
  for (const s of list) {
    const dx = p[0] - s.x, dy = p[1] - s.y, dz = p[2] - s.z;
    const dist = 2 * Math.asin(Math.min(1, 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz))) * R;
    if (s.kind === 'high') {
      const m = s.strength * (1 - ss(0.5, 1.15, dist / s.radius));
      out.high0 = Math.max(out.high0, m); out.lift -= 0.2 * m; out.dry = Math.max(out.dry, 0.8 * m);
      continue;
    }
    if (s.kind === 'wave') {
      const m = s.strength * (1 - ss(0.3, 1.1, dist / s.radius));
      out.lift += 0.35 * m; out.wet = Math.max(out.wet, 0.9 * m); out.nimbo = Math.max(out.nimbo, 0.5 * m);
      out.strength = Math.max(out.strength, m);
      continue;
    }
    // a low: its own lift round the centre, gustier wind, and its fronts
    const g = s.strength * (1 - ss(0.2, 1.3, dist / s.radius));
    out.lift += 0.3 * g * (1 + s.occluded);
    // (its own deck is round the centre; the rest of the rain belongs to its fronts)
    out.nimbo = Math.max(out.nimbo, (0.5 + 0.35 * s.occluded) * s.strength * (1 - ss(0.1, 0.7, dist / s.radius)));
    out.strength = Math.max(out.strength, s.strength * (1 - ss(0.6, 2.2, dist / s.radius)));
    if (dist > 3.2 * s.radius) continue;
    frontDistance(p, s.coldSeg, R, _dd);
    const dc = _dd[0], acm = _dd[1] * s.hemi;                          // m, + ahead of the cold front
    const aheadCold = acm >= 0 ? 1 : -1;
    frontDistance(p, s.warmSeg, R, _dd);
    const dw = _dd[0], aheadWarm = _dd[1] * s.hemi > 0 ? -1 : 1;        // + ahead of the warm front
    out.frontDist = Math.min(out.frontDist, dc, dw);
    const live = s.strength;
    // the cold front: a narrow band of hard lift, dry air well behind it, unstable air behind it
    const band = Math.exp(-((dc / 6000) ** 2));
    out.cold = Math.max(out.cold, band * live);
    out.lift += 1.5 * band * live;
    // Which side of the front a place is on, as a share rather than a switch: a front is a few
    // kilometres wide, not a knife edge, and a line that flips a texel from one air mass to the
    // other between two snapshots makes the cover jump. Beyond a few hundred kilometres the side
    // of a front's arc means nothing at all, so both its airs fade out with distance.
    const back = 1 - ss(-SIDE_SOFT, SIDE_SOFT, acm);
    const near = 1 - ss(SIDE_FAR[0], SIDE_FAR[1], dc);
    out.dry = Math.max(out.dry, 0.9 * live * back * near * ss(30000, 90000, dc));
    out.behind = Math.max(out.behind, live * back * ss(20000, 40000, dc) * (1 - ss(90000, 160000, dc)));
    out.nimbo = Math.max(out.nimbo, live * Math.exp(-dc / 10500) * (0.8 - 0.3 * back));
    // the warm front: a shield of high, then mid, then a rain deck in the last 20 km
    if (aheadWarm > 0) {
      out.high = Math.max(out.high, 0.85 * live * ss(140000, 100000, dw) * ss(14000, 42000, dw));
      out.mid = Math.max(out.mid, 0.9 * live * ss(60000, 40000, dw) * ss(6000, 18000, dw));
      out.nimbo = Math.max(out.nimbo, live * (1 - ss(0, 1, (dw - 6000) / 22000)));
      out.lift += 0.25 * live * Math.exp(-dw / 40000);
      out.wet = Math.max(out.wet, 0.8 * live * (1 - ss(40000, 110000, dw)));
    } else {
      // the warm sector: between the fronts, moist and mild
      out.wet = Math.max(out.wet, live * (1 - ss(1.4, 2.6, dist / s.radius)) * (aheadCold > 0 ? 1 : 0.3));
      out.mid = Math.max(out.mid, 0.4 * live * (1 - ss(0.8, 2.0, dist / s.radius)));
    }
  }
  out.lift = clamp(out.lift, -1, 4);
  return out;
}
