// How the character looks: its parts (built from code, like the lander), their colours
// and the shader that lights them. How it moves is hero.js.
//
// Local frame of the figure: +Y = toward the head, +Z = chest, +X = its left. Metres.
// Each part carries a colour (aCol) and a material index (aMat): 0 suit fabric, 1 visor,
// 2 cloth (the cloak), 3 hard shell (helmet, life-support pack, chest unit, boots),
// 4 bare metal (the bearings and rings).
//
// A modern EVA suit, simplified: a white hard helmet with a gold sun visor in a dark
// frame and two lamp housings, a neck ring, a slim life-support pack under the cloak, a
// control unit on the chest, bearings at the shoulders, waist, hips, wrists and boot
// tops, grey convolutes at elbows and knees, dark gloves, grey boots with dark soles, red
// bands on the upper arms and thighs (the commander's stripes of the Apollo and ISS
// suits), and dust on the boots that fades up the shins. Each limb segment is a single
// mesh (every mesh is drawn twice more into the shadow atlas), so its bands and rings are
// geometry merged into it and coloured per triangle; no textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_PARS } from '../render/lightingGlsl.js';

// Albedos (linear). Natural, slightly muted: off-white fabric, a brighter glossy shell.
// Under a sunlit exposure everything above about 0.4 reads as white, so the parts meant
// to stand apart from the fabric (gloves, boots, convolutes) sit well below it.
const SUIT = [0.72, 0.71, 0.68], JOINT = [0.38, 0.38, 0.37], SHELL = [0.78, 0.78, 0.76], UNIT = [0.58, 0.58, 0.58];
const BOOT = [0.25, 0.245, 0.235], SOLE = [0.06, 0.06, 0.06], GLOVE = [0.11, 0.11, 0.115], METAL = [0.56, 0.57, 0.59];
const DARK = [0.09, 0.09, 0.10], TRIM = [0.30, 0.30, 0.32], STRIPE = [0.38, 0.075, 0.06], DUST = [0.30, 0.26, 0.22];
const VISOR = [0.80, 0.58, 0.26];          // gold film: its reflectance at normal incidence
const FAB = 0, VIS = 1, HARD = 3, MET = 4;
const F = [SUIT, FAB], M = [METAL, MET], S = [STRIPE, FAB], G = [GLOVE, FAB];

function part(geo, col, mat = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return g;
}
const capsule = (r, len, col, x, y, z, mat, cap = 3, radial = 8) => { const g = new THREE.CapsuleGeometry(r, len, cap, radial); g.translate(x, y, z); return part(g, col, mat); };
const ball = (r, col, x, y, z, mat, sx = 1, sy = 1, sz = 1, w = 12, h = 9) => { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); g.translate(x, y, z); return part(g, col, mat); };

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
    return g;
  }
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

// Bends a box around a vertical axis through (0, ·, z0): the box's x runs along an arc of
// radius rc centred on the angle th0 (0 = +z, PI = the back), its z points outward.
const bendAround = (rc, th0, z0 = 0) => (p, n) => {
  const th = th0 + p[0] / rc, rho = rc + p[2], s = Math.sin(th), c = Math.cos(th);
  const nt = (n[0] * rc) / rho, l = Math.hypot(nt, n[1], n[2]);
  return [[rho * s, p[1], z0 + rho * c], [(nt * c + n[2] * s) / l, n[1] / l, (n[2] * c - nt * s) / l]];
};

// The helmet: a sphere on the neck ring. The visor opening is a rounded rectangle in yaw
// (about +Y, 0 = ahead) and pitch around the helmet's centre.
const HEAD = [0, 0.78, 0], HEAD_R = 0.14;
const onHelmet = (yaw, pitch, rho) => [HEAD[0] + rho * Math.sin(yaw) * Math.cos(pitch), HEAD[1] + rho * Math.sin(pitch), HEAD[2] + rho * Math.cos(yaw) * Math.cos(pitch)];

// Closed rings of points (all the same length), optionally around a centre point, as one
// indexed strip with smooth normals; rings run outward, points counter-clockwise seen from
// outside.
function ringStrip(rings, centre = null) {
  const n = rings[0].length, pos = [], idx = [], base = centre ? 1 : 0;
  if (centre) pos.push(...centre);
  for (const r of rings) for (const p of r) pos.push(...p);
  if (centre) for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < n; i++) {
    const a = base + k * n + i, b = base + k * n + ((i + 1) % n), c = a + n, d = b + n;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function helmetGeometry() {
  const N = 26, A = 1.24, B = 0.64, C = -0.07, P = 3.2;      // half width (yaw), half height (pitch), centre pitch, squareness
  const edge = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    edge.push([Math.sign(c) * Math.abs(c) ** (2 / P), Math.sign(s) * Math.abs(s) ** (2 / P)]);
  }
  // a ring at scale s of the opening, pushed d radians beyond it, at radius rho
  const ring = (s, d, rho) => edge.map(([u, v]) => onHelmet((A * s + d / 0.92) * u, C + (B * s + d) * v, rho));
  // Visor: a gold film a few millimetres proud of the shell, normals straight out.
  const RV = HEAD_R + 0.0035;
  const visor = ringStrip([0.45, 0.75, 0.92, 1.0].map((s) => ring(s, 0, RV)), onHelmet(0, C, RV));
  const p = visor.attributes.position, nn = visor.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - HEAD[0], y = p.getY(i) - HEAD[1], z = p.getZ(i) - HEAD[2], l = Math.hypot(x, y, z);
    nn.setXYZ(i, x / l, y / l, z / l);
  }
  // Frame round the visor: rises from the visor's edge, a flat top, and sinks into the shell.
  const frame = ringStrip([ring(1, -0.03, RV + 0.0005), ring(1, 0.006, HEAD_R + 0.0065), ring(1, 0.04, HEAD_R + 0.0065), ring(1, 0.07, HEAD_R - 0.0015)]);
  // Lamp housings on either side (no light comes from them: their lenses are dark).
  const lamp = (sx) => {
    const g = roundedBox([0.014, 0.022, 0.042], 0.01, [[-0.014, -0.004, 0.004, 0.014], [-0.022, -0.012, 0.012, 0.022], [-0.042, -0.032, 0.032, 0.042]],
      (q, ax, s) => (ax === 2 && s > 0 ? [DARK, HARD] : [UNIT, HARD]));
    g.translate(sx * 0.149, 0.795, -0.01);
    return g;
  };
  const shell = new THREE.SphereGeometry(HEAD_R, 16, 12);
  shell.translate(...HEAD);
  return [part(shell, SHELL, HARD), part(visor, VISOR, VIS), part(frame, DARK, HARD), lamp(1), lamp(-1)];
}

export function torsoGeometry() {
  // Life-support pack: a slim slab curved round the back, kept inside the cloak's reach
  // (cloak.js holds the cloth 0.215 m from the spine above the hips; the pack's outer face
  // is at 0.203 m and its top edge rounds in below the shoulder pins).
  const pack = roundedBox([0.14, 0.19, 0.045], 0.026,
    [[-0.14, -0.114, -0.07, -0.025, 0.025, 0.07, 0.114, 0.14], [-0.19, -0.164, 0.164, 0.19], [-0.045, -0.019, 0.019, 0.045]],
    () => [SHELL, HARD], bendAround(0.20, Math.PI));
  pack.translate(0, 0.335, 0);
  // Chest control unit: a housing curved a little to the chest, with a dark panel face.
  const unit = roundedBox([0.105, 0.058, 0.028], 0.014,
    [[-0.105, -0.091, -0.068, 0.068, 0.091, 0.105], [-0.058, -0.044, -0.026, 0.026, 0.044, 0.058], [-0.028, -0.014, 0.014, 0.028]],
    (q, ax, s) => (ax === 2 && s > 0 && Math.abs(q[0]) < 0.068 && Math.abs(q[1]) < 0.026 ? [DARK, HARD] : [UNIT, HARD]),
    bendAround(0.30, 0, -0.12));
  unit.translate(0, 0.33, 0);
  // (the soft suit is scaled out round the spine: a pressurised suit is bulky)
  const body = mergeGeometries([
    capsule(0.165, 0.30, SUIT, 0, 0.30, 0, FAB, 4, 12),            // chest
    ball(0.185, SUIT, 0, 0.47, 0.01, FAB, 1.12, 0.8, 0.9),          // shoulders
    ball(0.165, SUIT, 0, 0.04, 0, FAB, 1.0, 0.85, 0.9),             // hips
    lathe([[0.150, 0.148], [0.166, 0.141, ...M], [0.171, 0.132, ...M], [0.171, 0.112, ...M], [0.166, 0.103, ...M], [0.150, 0.096, ...M]], 16),   // waist ring
  ]).scale(1.12, 1, 1.1);
  return mergeGeometries([
    body,
    lathe([[0.097, 0.682], [0.110, 0.676, ...M], [0.121, 0.664, ...M], [0.123, 0.646, ...M], [0.119, 0.632, ...M], [0.104, 0.622, ...M], [0.085, 0.600, ...M]], 14),   // neck ring
    ...helmetGeometry(),
    unit, pack,
    capsule(0.04, 0.42, TRIM, 0, 0.60, -0.175, MET).rotateZ(Math.PI / 2).translate(0.6, 0.6, 0),   // cloak clasp bar across the shoulders
  ]);
}

// Dust from the ground on the lower legs: full below yFull, none above yClean (a smooth
// fade between); dark parts (the soles) take less of it.
function dusty(g, yFull, yClean, amount) {
  const p = g.attributes.position, c = g.attributes.aCol;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - THREE.MathUtils.smoothstep(p.getY(i), yFull, yClean);
    const r = c.getX(i), gg = c.getY(i), b = c.getZ(i), k = amount * t * (r + gg + b < 0.45 ? 0.35 : 1);
    c.setXYZ(i, r + (DUST[0] - r) * k, gg + (DUST[1] - gg) * k, b + (DUST[2] - b) * k);
  }
  return g;
}

const bulk = (k, parts) => mergeGeometries(parts).scale(k, 1, k);

// A limb hangs along -Y from its pivot at the origin, in two pieces: the upper part
// (shoulder or hip to the joint, with the joint's convolute) and the lower part, whose own
// origin is the joint (elbow or knee).
export const ELBOW = 0.29, HAND = 0.31, KNEE = 0.41, ANKLE = 0.45;       // segment lengths (m)
// The limbs are drawn wider than their profiles (LIMB_BULK across, not along): a
// pressurised suit's arms and legs are nearly as thick as a torso seen from the side.
export const ARM_BULK = 1.28, LEG_BULK = 1.22;
export function upperArmGeometry() {
  const R = 0.052;
  return bulk(ARM_BULK, [lathe([
    [0, 0.012], [0.026, 0.005, ...F], [0.045, -0.014, ...F], [R, -0.040, ...F],
    [R, -0.044, ...F], [0.057, -0.049, ...M], [0.057, -0.069, ...M], [R, -0.074, ...M],      // shoulder bearing
    [R, -0.112, ...F], [R, -0.150, ...S],                                                       // red band
    [R, -0.260, ...F], [0.045, -0.286, ...F], [0.026, -0.305, ...F], [0, -0.312, ...F],
  ]), ball(0.056, JOINT, 0, -ELBOW, 0, FAB, 1, 1, 1, 10, 7)]);
}
export function forearmGeometry() {
  const R = 0.047;
  return bulk(ARM_BULK, [lathe([
    [0, 0.017], [0.0235, 0.0107, ...F], [0.0407, -0.0065, ...F], [R, -0.030, ...F],
    [R, -0.185, ...F], [0.051, -0.189, ...M], [0.051, -0.207, ...M], [R, -0.211, ...M],      // wrist ring
    [0.049, -0.214, ...G], [0.052, -0.244, ...G], [0.045, -0.257, ...G], [0, -0.260, ...G],    // glove gauntlet
  ]), ball(0.05, GLOVE, 0, -HAND, 0.004, FAB, 0.62, 1.35, 1.0, 10, 7)]);                       // glove (a mitten: thin across the palm)
}
export function thighGeometry() {
  const R = 0.075;
  return bulk(LEG_BULK, [lathe([
    [0, 0.015], [0.0375, 0.005, ...F], [0.065, -0.0225, ...F], [R, -0.060, ...F],
    [R, -0.072, ...F], [0.080, -0.077, ...M], [0.080, -0.097, ...M], [R, -0.102, ...M],      // hip bearing
    [R, -0.165, ...F], [R, -0.205, ...S],                                                       // red band
    [R, -0.340, ...F], [0.065, -0.3775, ...F], [0.0375, -0.405, ...F], [0, -0.415, ...F],
  ]), ball(0.07, JOINT, 0, -KNEE, 0.005, FAB, 1, 1, 1, 10, 7)]);
}
export function shinGeometry() {
  const R = 0.062, B = [BOOT, HARD];
  const leg = lathe([
    [0, 0.012], [0.031, 0.0037, ...F], [0.0537, -0.019, ...F], [R, -0.050, ...F],
    [R, -0.262, ...F], [0.067, -0.267, ...M], [0.071, -0.271, ...M], [0.071, -0.287, ...M], [0.068, -0.291, ...M],   // boot-top bearing
    [0.066, -0.295, ...B], [0.068, -0.400, ...B], [0.064, -0.455, ...B], [0.030, -0.470, ...B], [0, -0.471, ...B],    // boot shaft
  ]);
  // Foot: a rounded block with a dark sole, level when the figure stands (knee bent 0.06).
  const foot = roundedBox([0.055, 0.036, 0.13], 0.022,
    [[-0.055, -0.033, 0.033, 0.055], [-0.036, -0.014, 0.014, 0.036], [-0.13, -0.108, -0.04, 0.04, 0.108, 0.13]],
    (q) => (q[1] < -0.014 ? [SOLE, FAB] : [BOOT, HARD]));
  foot.translate(0, -0.04, 0.058); foot.rotateX(-0.06); foot.translate(0, -ANKLE, 0);
  return dusty(bulk(LEG_BULK, [leg, foot]), -0.45, -0.05, 0.6);
}

export const HERO_VERT = /* glsl */`
in vec3 aCol; in float aMat;
out vec3 vRel; out vec3 vN; out vec3 vCol; out float vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz; vCol = aCol; vMat = aMat;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const HERO_FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uSunVis;
in vec3 vRel; in vec3 vN; in vec3 vCol; in float vMat;
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
  vec3 sky = skyLight(N, up) + planetShine(N);
  vec3 col = vCol * (Esun * lit + sky) / PI;
  vec3 H = normalize(L + V);
  float NH = max(dot(N, H), 0.0), fr = pow(1.0 - NV, 5.0);
  if (m == 1) {
    // visor: a gold film over dark glass. It mirrors the scene (ground, horizon, sky) and
    // the Sun as a hard glint, and lets very little through.
    vec3 F = vCol + (1.0 - vCol) * fr;
    col = col * 0.05 + mirrored(reflect(-V, N), up, 0.04) * F + Esun * F * pow(NH, 300.0) * 8.0 * step(0.0, NL);
  } else if (m == 2) {
    // cloth: a little sunlight comes through from behind, soft sheen at grazing angles
    col += vCol * Esun * max(-NL, 0.0) * 0.22 / PI;
    col += vCol * sky * pow(1.0 - NV, 3.0) * 0.35 / PI;
  } else if (m == 3) {
    // hard shell (helmet, pack, boots): painted composite under a clear coat
    float F = 0.04 + 0.96 * fr;
    col = col * (1.0 - F) + mirrored(reflect(-V, N), up, 0.08) * F + Esun * lit * F * pow(NH, 90.0) * 3.9;
  } else if (m == 4) {
    // bare metal (bearings, rings): little diffuse light, a tinted, slightly rough mirror
    vec3 F = vCol + (1.0 - vCol) * fr;
    col = col * 0.3 + mirrored(reflect(-V, N), up, 0.15) * F * 0.7 + Esun * lit * F * pow(NH, 30.0);
  } else {
    col += Esun * lit * pow(NH, 26.0) * 0.045;     // suit fabric highlight
  }
  col = aerialPerspective(col, vRel);
  fragColor = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
}`;

// Where the limbs hang from (shoulders, hips), in the body's frame.
export const SHOULDER = [0.235, 0.50, 0], HIP = [0.095, 0.0, 0];
