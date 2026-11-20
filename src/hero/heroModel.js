// How the character looks: its parts (built from code, like the lander), their colours
// and the shader that lights them. How it moves is hero.js; the cloth that moves (the
// robe's skirt, the wide sleeves, the long hair) is robe.js.
//
// Local frame of the figure: +Y = toward the head, +Z = chest, +X = its left. Metres.
// Each part carries a colour (aCol), a material index (aMat) and a tangent (aTan, for the
// hair's strands): 0 silk (the robe, trousers, boots), 1 skin, 3 silver embroidery (the
// shoulder pieces, sash, bracers, trims), 4 polished silver and pearls, 5 hair.
//
// The owner's design (reference pictures, 2026-11): a cultivator in a white-silver robe
// of layered silk with a crossed collar, ornate silver shoulder pieces, a wide silver
// sash with strings of pearls and lavender tassels, silver bracers, loose trousers and
// silver-trimmed boots; long straight magenta-purple hair to the hips, two locks framing
// the face; wide sleeves and the long skirt of the outer robe flowing in the wind. Every
// segment is a single mesh (each is drawn twice more into the shadow atlas): details are
// geometry merged into it and coloured per vertex; no textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_PARS } from '../render/lightingGlsl.js';

// Albedos (linear). White silk sits below 0.8 so that sunlit folds keep their shading.
const SILK = [0.74, 0.74, 0.76], SILK_IN = [0.68, 0.68, 0.71], BOOTC = [0.70, 0.70, 0.73];
const SILVER = [0.60, 0.61, 0.64], SILVER_DK = [0.40, 0.41, 0.44], POLISH = [0.82, 0.82, 0.84], PEARL = [0.80, 0.79, 0.82];
const SKIN = [0.60, 0.42, 0.33], LIP = [0.42, 0.20, 0.19], EYE = [0.025, 0.018, 0.016], BROW = [0.07, 0.012, 0.04];
const HAIR = [0.12, 0.008, 0.115], TASSEL = [0.40, 0.40, 0.50], SOLE = [0.30, 0.30, 0.32], DUST = [0.30, 0.26, 0.22];
const SILKM = 0, SKINM = 1, EMB = 3, POL = 4, HAIRM = 5;
const F = [SILK, SILKM], E = [SILVER, EMB], ED = [SILVER_DK, EMB], P = [POLISH, POL], SK = [SKIN, SKINM];

// The strand direction for the hair's highlight: "down" along the surface.
function addTan(g) {
  const n = g.attributes.normal, t = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    let x = -nx * -ny, y = -1 + ny * ny, z = -nz * -ny;            // (0,-1,0) minus its part along the normal
    const l = Math.hypot(x, y, z);
    if (l < 1e-3) { x = 1; y = 0; z = 0; } else { x /= l; y /= l; z /= l; }
    t[i * 3] = x; t[i * 3 + 1] = y; t[i * 3 + 2] = z;
  }
  g.setAttribute('aTan', new THREE.BufferAttribute(t, 3));
  return g;
}

function part(geo, col, mat = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return addTan(g);
}
const capsule = (r, len, col, x, y, z, mat, cap = 3, radial = 8) => { const g = new THREE.CapsuleGeometry(r, len, cap, radial); g.translate(x, y, z); return part(g, col, mat); };
const ball = (r, col, x, y, z, mat, sx = 1, sy = 1, sz = 1, w = 12, h = 9) => { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); g.translate(x, y, z); return part(g, col, mat); };
// A bead: an octahedron with round normals (eight triangles look round at its size).
function bead(r, col, mat, x, y, z) {
  const g = new THREE.OctahedronGeometry(r, 0), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)); n.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l); }
  g.translate(x, y, z);
  return part(g, col, mat);
}

// Collects coloured triangles; each vertex is [position, normal]. Triangles are wound
// counter-clockwise seen from outside (the shader flips the normal on back faces).
class Tris {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; }
  add(a, b, c, col, mat) {
    for (const v of [a, b, c]) { this.p.push(...v[0]); this.n.push(...v[1]); this.c.push(...col); this.m.push(mat); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.m, 1));
    return addTan(g);
  }
}

// A flat band along a polyline: pts are [x, y, z], out(p) the direction the band faces at
// a point; w its width. Both sides are drawn (the material is double-sided).
function ribbon(pts, w, col, mat, out, w1 = w) {
  const t = new Tris(), L = pts.length;
  const side = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(L - 1, i + 1)];
    const tg = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], o = out(p);
    const s = [tg[1] * o[2] - tg[2] * o[1], tg[2] * o[0] - tg[0] * o[2], tg[0] * o[1] - tg[1] * o[0]], l = Math.hypot(...s) || 1;
    const ww = (w + (w1 - w) * i / (L - 1)) / 2, ol = Math.hypot(...o) || 1;
    return [[s[0] / l * ww, s[1] / l * ww, s[2] / l * ww], [o[0] / ol, o[1] / ol, o[2] / ol]];
  });
  for (let i = 0; i + 1 < L; i++) {
    const [s0, n0] = side[i], [s1, n1] = side[i + 1], p0 = pts[i], p1 = pts[i + 1];
    const a = [[p0[0] - s0[0], p0[1] - s0[1], p0[2] - s0[2]], n0], b = [[p0[0] + s0[0], p0[1] + s0[1], p0[2] + s0[2]], n0];
    const c = [[p1[0] + s1[0], p1[1] + s1[1], p1[2] + s1[2]], n1], d = [[p1[0] - s1[0], p1[1] - s1[1], p1[2] - s1[2]], n1];
    t.add(a, b, c, col, mat); t.add(a, c, d, col, mat);
  }
  return t.geometry();
}

// A body of revolution about +Y (x = r sin a, z = r cos a) from a profile listed top to
// bottom (the other way round turns it inside out), [r, y, colour, material] per point;
// each segment takes the colour of the point it ends at, so bands and rings have crisp
// edges. Normals are smooth along the profile except at corners sharper than about 50
// degrees, and vertical at the poles.
function lathe(prof, n = 10) {
  const sn = [];
  for (let k = 0; k + 1 < prof.length; k++) {
    const dr = prof[k + 1][0] - prof[k][0], dy = prof[k + 1][1] - prof[k][1], l = Math.hypot(dr, dy);
    sn.push([-dy / l, dr / l]);
  }
  const pointNormal = (k, j) => {       // normal of segment k at its end point j (k or k + 1)
    const a = sn[k], b = sn[j === k ? k - 1 : k + 1];
    if (prof[j][0] < 1e-6) return [0, Math.sign(a[1])];
    if (!b || a[0] * b[0] + a[1] * b[1] < 0.64) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y);
    return [x / l, y / l];
  };
  const t = new Tris();
  const V = (r, y, nn, a) => [[r * Math.sin(a), y, r * Math.cos(a)], [nn[0] * Math.sin(a), nn[1], nn[0] * Math.cos(a)]];
  for (let k = 0; k + 1 < prof.length; k++) {
    const [r0, y0] = prof[k], [r1, y1, col, mat] = prof[k + 1], n0 = pointNormal(k, k), n1 = pointNormal(k, k + 1);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
      const p00 = V(r0, y0, n0, a0), p01 = V(r0, y0, n0, a1), p10 = V(r1, y1, n1, a0), p11 = V(r1, y1, n1, a1);
      if (r1 > 1e-6) t.add(p00, p10, p11, col, mat);
      if (r0 > 1e-6) t.add(p00, p11, p01, col, mat);
    }
  }
  return t.geometry();
}

// A box with rounded edges: half sizes h = [hx, hy, hz], edge radius rad, on a grid whose
// lines along each axis are listed in grid[axis] (from -h to +h, including ±(h - rad) so
// the edges round off; extra lines where colours change). paint(q, axis, side) gives the
// cell centred at q (box frame) its [colour, material]; warp(p, n) optionally bends it.
function roundedBox(h, rad, grid, paint, warp = null) {
  const inner = h.map((v) => v - rad), t = new Tris();
  const vert = (q) => {
    const c = q.map((v, i) => Math.max(-inner[i], Math.min(inner[i], v)));
    const d = q.map((v, i) => v - c[i]), l = Math.hypot(d[0], d[1], d[2]);
    const n = d.map((v) => v / l), p = c.map((v, i) => v + rad * n[i]);
    return warp ? warp(p, n) : [p, n];
  };
  for (let ax = 0; ax < 3; ax++) for (const s of [1, -1]) {
    let u = (ax + 1) % 3, v = (ax + 2) % 3;          // u x v points out of this face
    if (s < 0) [u, v] = [v, u];
    const us = grid[u], vs = grid[v];
    const q = (a, b) => { const r = [0, 0, 0]; r[ax] = s * h[ax]; r[u] = a; r[v] = b; return r; };
    for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
      const [col, mat] = paint(q((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2), ax, s);
      const a = vert(q(us[i], vs[j])), b = vert(q(us[i + 1], vs[j])), c = vert(q(us[i + 1], vs[j + 1])), d = vert(q(us[i], vs[j + 1]));
      t.add(a, b, c, col, mat); t.add(a, c, d, col, mat);
    }
  }
  return t.geometry();
}

// ---------------------------------------------------------------------------------------
// The torso: the robe's upper part, the crossed collar, the shoulder pieces, the sash and
// its pearls and tassels, the neck, the head and the hair on it.
const CHEST_RX = 0.158, CHEST_RZ = 0.132;
// a point on the front or back of the chest at (x, y), a few millimetres proud of it
// (above the chest the body narrows into the shoulders and the neck: the section there)
const NECK_R = 0.080;
const chestSect = (y) => { const f = y > 0.46 ? Math.sqrt(Math.max(0, 0.148 ** 2 - (y - 0.46) ** 2)) / 0.148 : 1; return [Math.max(NECK_R, CHEST_RX * f), Math.max(NECK_R, CHEST_RZ * f)]; };
const onChest = (x, y, z0 = 1, lift = 0.006) => { const [rx, rz] = chestSect(y); return [x, y, z0 * (rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) ** 2)) + lift)]; };
const chestOut = (p) => [p[0] / CHEST_RX, 0, p[2] / CHEST_RZ];

function collar() {
  // Right over left: the wearer's left panel crosses to the right hip; the right one meets it.
  const A = [], B = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; A.push(onChest(0.062 - 0.165 * t, 0.615 - 0.44 * t)); }
  for (let i = 0; i <= 8; i++) { const t = i / 8; B.push(onChest(-0.062 + 0.054 * t, 0.615 - 0.17 * t, 1, 0.004)); }
  return [
    ribbon(A, 0.034, SILVER, EMB, chestOut),
    ribbon(B, 0.030, SILVER, EMB, chestOut),
    // the inner collar standing round the neck
    lathe([[0.066, 0.66], [0.072, 0.655, ...F], [0.075, 0.625, ...F], [0.08, 0.605, SILVER, EMB], [0.07, 0.595, SILVER, EMB]], 14),
  ];
}

function shoulderPieces() {
  const out = [];
  for (const s of [1, -1]) {
    const cap = new THREE.SphereGeometry(0.092, 14, 6, 0, Math.PI * 2, 0, 1.25);
    cap.scale(1.2, 0.55, 1.2); cap.rotateZ(-s * 0.5); cap.translate(s * 0.19, 0.505, 0);
    out.push(part(cap, SILVER, EMB));
    // a raised rim and a fringe of silver drops along its outer edge
    for (let k = 0; k < 7; k++) {
      const ph = -1.25 + k * 2.5 / 6, x = s * (0.19 + 0.098 * Math.cos(ph)), z = 0.108 * Math.sin(ph);
      { const d = bead(0.011, POLISH, POL, 0, 0, 0); d.scale(0.8, 1.7, 0.8); d.translate(x + s * 0.004, 0.468 - 0.04 * Math.cos(ph), z); out.push(d); }
    }
  }
  return out;
}

function sash() {
  const s = lathe([[0.150, 0.176], [0.163, 0.170, ...E], [0.168, 0.160, ...E], [0.169, 0.135, ...ED], [0.169, 0.090, ...ED], [0.168, 0.068, ...E], [0.163, 0.058, ...E], [0.150, 0.052, ...E]], 20);
  s.scale(1.0, 1, 0.86);
  const front = roundedBox([0.048, 0.034, 0.011], 0.008, [[-0.048, -0.04, 0.04, 0.048], [-0.034, -0.026, 0.026, 0.034], [-0.011, -0.003, 0.003, 0.011]], () => [POLISH, POL]);
  front.translate(0, 0.112, 0.15);
  const back = roundedBox([0.07, 0.048, 0.011], 0.01, [[-0.07, -0.06, 0.06, 0.07], [-0.048, -0.038, 0.038, 0.048], [-0.011, -0.001, 0.001, 0.011]], () => [SILVER, EMB]);
  back.translate(0, 0.105, -0.15);
  return [s, front, back];
}

// Strings of pearls hanging from the sash, with tassels, on the hips (they ride on the
// skirt's top, where it barely moves).
function pearls() {
  const out = [], RX = 0.176, RZ = 0.152, step = 0.024;
  const at = (th, y, extra = 0) => [(RX + extra) * Math.sin(th), y, (RZ + extra) * Math.cos(th)];
  const string = (pts) => {
    let carry = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (let d = carry; d < l; d += step) { const t = d / l; out.push(bead(0.0095, PEARL, POL, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)); carry = d + step - l; }
    }
  };
  const tassel = (p) => {
    const c = new THREE.ConeGeometry(0.017, 0.075, 6, 1, true); c.rotateX(Math.PI); c.translate(p[0], p[1] - 0.045, p[2]);
    out.push(part(c, TASSEL, SILKM), bead(0.012, POLISH, POL, p[0], p[1] - 0.004, p[2]));
  };
  // two swags across the front
  for (const sag of [0.07, 0.13]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12 * 2 - 1; pts.push(at(u * 0.95, 0.05 - sag * (1 - u * u), 0.004 + 0.01 * (1 - u * u))); }
    string(pts);
  }
  // strings down the back from its plate, and one on each hip, each ending in a tassel
  for (const [th, len] of [[Math.PI - 0.22, 0.19], [Math.PI, 0.26], [Math.PI + 0.22, 0.19], [1.25, 0.2], [-1.25, 0.2]]) {
    const top = at(th, 0.055, 0.004), pts = [top];
    for (let i = 1; i <= 4; i++) pts.push(at(th, 0.055 - len * i / 4, 0.004 + 0.006 * i));
    string(pts); tassel(pts[pts.length - 1]);
  }
  return out;
}

const HEAD = [0, 0.765, -0.004];
function head() {
  const [hx, hy, hz] = HEAD;
  const cone = (r, h, col, mat) => { const g = new THREE.ConeGeometry(r, h, 6); g.rotateX(Math.PI / 2 + 0.25); g.translate(0, hy - 0.015, hz + 0.1); return part(g, col, mat); };
  // (brows and eyes are turned round the head's centre, not slid sideways: their outer ends stood off it)
  const brow = (s) => { const g = new THREE.SphereGeometry(0.0062, 6, 3); g.scale(3.6, 0.9, 1.1); g.rotateZ(s * 0.16); g.translate(0, 0.022, 0.100); g.rotateY(s * 0.36); g.translate(hx, hy, hz); return part(g, BROW, SKINM); };
  // hair on the head: the crown, and the back and sides down to the nape, leaving the face
  const cap1 = new THREE.SphereGeometry(0.113, 18, 6, 0, Math.PI * 2, 0, 0.95);
  const cap2 = new THREE.SphereGeometry(0.113, 18, 7, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0.95, 1.15);
  for (const c of [cap1, cap2]) { c.scale(0.94, 1.08, 1.04); c.translate(hx, hy + 0.004, hz - 0.006); }
  // two locks framing the face, falling over the collar to the chest
  const locks = [1, -1].map((s) => ribbon([[s * 0.078, 0.815, 0.055], [s * 0.096, 0.74, 0.07], [s * 0.1, 0.66, 0.09], [s * 0.1, 0.57, 0.13], [s * 0.1, 0.47, 0.146], [s * 0.1, 0.40, 0.148]],
    0.048, HAIR, HAIRM, (p) => [p[0] * 1.2, 0.0, p[2] + 0.05], 0.03));
  return [
    lathe([[0, 0.66], [0.046, 0.655, ...SK], [0.048, 0.60, ...SK], [0, 0.595, ...SK]], 10),          // neck
    ball(0.104, SKIN, hx, hy, hz, SKINM, 0.90, 1.08, 1.0, 14, 10),                                    // skull and brow
    ball(0.075, SKIN, hx, hy - 0.05, hz + 0.024, SKINM, 0.96, 1.0, 1.0, 12, 8),                       // cheeks, jaw and chin
    cone(0.013, 0.036, SKIN, SKINM),                                                                    // nose
    ...[1, -1].map((s) => { const g = new THREE.SphereGeometry(0.0105, 6, 4); g.scale(1.5, 0.72, 0.6); g.translate(0, 0.003, 0.102); g.rotateY(s * 0.34); g.translate(hx, hy, hz); return part(g, EYE, SKINM); }),
    brow(1), brow(-1),
    ball(0.009, LIP, 0, hy - 0.06, hz + 0.094, SKINM, 2.2, 0.7, 0.8, 6, 4),                           // lips
    part(cap1, HAIR, HAIRM), part(cap2, HAIR, HAIRM), ...locks,
  ];
}

export function torsoGeometry() {
  const body = mergeGeometries([
    capsule(0.148, 0.32, SILK, 0, 0.30, 0, SILKM, 4, 14).scale(1.07, 1, 0.89),                   // chest (robe)
    ball(0.16, SILK, 0, 0.485, 0.0, SILKM, 1.2, 0.62, 0.84),                                        // shoulders
    ball(0.15, SILK_IN, 0, 0.04, 0, SILKM, 1.02, 0.85, 0.9, 10, 7),                                      // hips
  ]);
  return addTan(mergeGeometries([body, ...collar(), ...shoulderPieces(), ...sash(), ...pearls(), ...head()]));
}

// Dust from the ground on the boots: full below yFull, none above yClean.
function dusty(g, yFull, yClean, amount) {
  const p = g.attributes.position, c = g.attributes.aCol;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - THREE.MathUtils.smoothstep(p.getY(i), yFull, yClean);
    const r = c.getX(i), gg = c.getY(i), b = c.getZ(i), k = amount * t;
    c.setXYZ(i, r + (DUST[0] - r) * k, gg + (DUST[1] - gg) * k, b + (DUST[2] - b) * k);
  }
  return g;
}

// A limb hangs along -Y from its pivot at the origin, in two pieces: the upper part
// (shoulder or hip to the joint) and the lower part, whose own origin is the joint.
export const ELBOW = 0.29, HAND = 0.31, KNEE = 0.41, ANKLE = 0.45;       // segment lengths (m)
export function upperArmGeometry() {
  return mergeGeometries([lathe([
    [0, 0.014], [0.028, 0.006, ...F], [0.046, -0.02, ...F], [0.052, -0.06, ...F], [0.048, -0.25, ...F], [0.04, -0.29, ...F], [0, -0.30, ...F],
  ], 12), ball(0.046, SILK, 0, -ELBOW, 0, SILKM, 1, 1, 1, 10, 7)]);
}
export function forearmGeometry() {
  const hand = [
    ball(0.036, SKIN, 0, -HAND + 0.012, 0.004, SKINM, 0.55, 1.4, 1.0, 10, 7),                       // hand
    ball(0.013, SKIN, 0.024, -0.27, 0.018, SKINM, 0.9, 1.7, 0.9, 6, 5),                              // thumb
  ];
  return mergeGeometries([lathe([
    [0, 0.018], [0.025, 0.01, ...F], [0.042, -0.02, ...F], [0.044, -0.09, ...F],
    [0.047, -0.095, ...P], [0.047, -0.105, ...P], [0.045, -0.11, ...E], [0.041, -0.21, ...E], [0.044, -0.215, ...P], [0.044, -0.225, ...P],   // the silver bracer
    [0.034, -0.235, ...SK], [0.03, -0.25, ...SK], [0, -0.255, ...SK],
  ], 12), ...hand]);
}
export function thighGeometry() {
  return mergeGeometries([lathe([
    [0, 0.016], [0.036, 0.006, ...F], [0.064, -0.03, ...F], [0.072, -0.08, ...F], [0.066, -0.34, ...F], [0.052, -0.39, ...F], [0, -0.41, ...F],
  ], 12), ball(0.058, SILK, 0, -KNEE, 0.005, SILKM, 1, 1, 1, 10, 7)]);
}
export function shinGeometry() {
  const B = [BOOTC, SILKM];
  const leg = lathe([
    [0, 0.012], [0.03, 0.004, ...F], [0.054, -0.03, ...F], [0.064, -0.12, ...F], [0.062, -0.21, ...F],      // trousers, gathered into the boot
    [0.06, -0.215, ...E], [0.06, -0.25, ...E],                                                               // the boot's embroidered top
    [0.056, -0.255, ...B], [0.052, -0.40, ...B], [0.05, -0.455, ...B], [0.028, -0.47, ...B], [0, -0.471, ...B],
  ], 12);
  // Foot: a rounded block with a pale sole, level when the figure stands (knee bent 0.06).
  const foot = roundedBox([0.046, 0.034, 0.125], 0.022,
    [[-0.046, -0.024, 0.024, 0.046], [-0.034, -0.012, 0.012, 0.034], [-0.125, -0.103, -0.04, 0.04, 0.103, 0.125]],
    (q) => (q[1] < -0.012 ? [SOLE, SILKM] : Math.abs(q[2]) > 0.09 ? [SILVER, EMB] : [BOOTC, SILKM]));
  foot.translate(0, -0.04, 0.055); foot.rotateX(-0.06); foot.translate(0, -ANKLE, 0);
  return dusty(addTan(mergeGeometries([leg, foot])), -0.45, -0.12, 0.45);
}

export const HERO_VERT = /* glsl */`
in vec3 aCol; in float aMat; in vec3 aTan;
out vec3 vRel; out vec3 vN; out vec3 vCol; flat out float vMat; out vec3 vT;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz; vCol = aCol; vMat = aMat;
  vN = normalize(mat3(modelMatrix) * normal);
  vT = mat3(modelMatrix) * aTan;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const HERO_FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uSunVis;
in vec3 vRel; in vec3 vN; in vec3 vCol; flat in float vMat; in vec3 vT;
layout(location = 0) out vec4 fragColor;
// What a glossy surface mirrors in direction R: the sunlit ground below the horizon, the
// sky above it, with a line between them as sharp as 'edge' (both from the sky light).
vec3 mirrored(vec3 R, vec3 up, float edge) {
  vec3 Rs = R + up;
  Rs = dot(Rs, Rs) > 1e-6 ? normalize(Rs) : up;
  return mix(skyLight(Rs, up), skyLight(-up, up), 1.0 - smoothstep(-edge, edge, dot(R, up))) / PI;
}
void main() {
  int m = int(vMat + 0.5);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel), L = uSunDir;
  float NL = dot(N, L), NV = max(dot(N, V), 1e-3), lit = max(NL, 0.0);
  vec3 Esun = directSun(planetPos) * uSunVis * nearShadow(vRel, N);
  vec3 sky = skyLight(N, up) + planetShine(N) + homeShine(N, up);
  vec3 col = vCol * (Esun * lit + sky) / PI;
  vec3 H = normalize(L + V);
  float NH = max(dot(N, H), 0.0), fr = pow(1.0 - NV, 5.0);
  if (m == 0 || m == 2) {
    // silk: a broad satin sheen and a soft glow at grazing angles; through thin cloth
    // (2: the flowing panels and sleeves, not the body under them) a little sunlight
    // comes from behind
    col += vCol * Esun * lit * pow(NH, 14.0) * 0.16;
    col += vCol * sky * pow(1.0 - NV, 2.0) * 0.22 / PI;
    if (m == 2) col += vCol * Esun * max(-NL, 0.0) * 0.2 / PI;
  } else if (m == 1) {
    // skin: light wraps a little past the terminator (it scatters under the surface),
    // warmer there; a faint sheen
    float w = max((NL + 0.3) / 1.3, 0.0);
    col = vCol * (Esun * (w * vec3(1.0, 0.92, 0.88) + vec3(0.06, 0.02, 0.01) * (1.0 - abs(NL)) * smoothstep(-0.3, -0.1, NL)) + sky) / PI;
    col += Esun * lit * pow(NH, 40.0) * 0.025;
  } else if (m == 3) {
    // silver embroidery: thread of metal, rough, so its mirror is soft and its highlight wide
    vec3 Fm = vCol + (1.0 - vCol) * fr;
    col = col * 0.35 + mirrored(reflect(-V, N), up, 0.25) * Fm * 0.5 + Esun * lit * Fm * pow(NH, 22.0) * 0.9;
  } else if (m == 4) {
    // polished silver and pearls: a sharper mirror and highlight
    vec3 Fm = vCol + (1.0 - vCol) * fr;
    col = col * 0.3 + mirrored(reflect(-V, N), up, 0.1) * Fm * 0.7 + Esun * lit * Fm * pow(NH, 70.0) * 2.5;
  } else if (m == 5) {
    // hair: light along the strands (Kajiya-Kay): a white glint, and a second, coloured
    // one shifted toward the tip; wrapped diffuse
    vec3 T = vT - N * dot(vT, N);
    T = dot(T, T) > 1e-6 ? normalize(T) : vec3(0.0, 1.0, 0.0);
    float th1 = dot(normalize(T + N * 0.12), H), th2 = dot(normalize(T - N * 0.18), H);
    float s1 = pow(sqrt(max(0.0, 1.0 - th1 * th1)), 90.0), s2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), 18.0);
    float w = max((NL + 0.35) / 1.35, 0.0);
    col = vCol * (Esun * w + sky) / PI + Esun * w * (vec3(0.02) * s1 + vCol * 0.35 * s2);
  }
  col = aerialPerspective(col, vRel);
  fragColor = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
}`;

// Where the limbs hang from (shoulders, hips), in the body's frame.
export const SHOULDER = [0.20, 0.50, 0], HIP = [0.082, 0.0, 0];
