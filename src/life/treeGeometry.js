// The shapes trees have (cover.js, ARCH), each as two meshes: one for trees near the
// traveller and a plain one for those farther off. A tree is one unit tall and stands on
// the origin with +Y up; the shader sizes, turns and places it (trees.js).
// Vertex data: position, normal (crowns: puffed outward, so a few flat faces shade as a
// soft mass), aLeaf (0 on the trunk, 1 on leaves), aSway (how far the wind can move the
// vertex: its height and its distance from the trunk).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise3 } from '../terrain/height/noise.js';

function finish(parts) {
  const geo = mergeGeometries(parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, leaf = new Float32Array(n).fill(p.leaf ? 1 : 0), sway = new Float32Array(n);
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) { const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i)); sway[i] = Math.max(0, y) * Math.max(0, y) * (p.leaf ? 1 + 2.5 * r : 0.6); }
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1)); g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    return g;
  }));
  return geo;
}

// A trunk from the ground to `top`, `r` wide at the foot.
function trunk(top, r, sides = 5, taper = 0.45) {
  const g = new THREE.CylinderGeometry(r * taper, r, top, sides, 1, true);
  g.translate(0, top / 2, 0);
  return { geo: g, leaf: false };
}
// A cone of foliage: its foot at y0, its tip at y1, `r` wide at the foot.
function cone(y0, y1, r, sides = 7, droop = 0.25) {
  const g = new THREE.ConeGeometry(r, y1 - y0, sides, 1, true);
  g.translate(0, (y0 + y1) / 2, 0);
  // normals that lean outward more than the faces do: a soft tier, not a paper cone
  const p = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), l = Math.hypot(x, z) || 1; const v = new THREE.Vector3(x / l, 0.55 - droop, z / l).normalize(); nrm.setXYZ(i, v.x, v.y, v.z); }
  return { geo: g, leaf: true };
}
// A lump of foliage round (cx, cy, cz), radii (rx, ry), a little uneven.
function blob(cx, cy, cz, rx, ry, detail = 1, seed = 0) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3(), nrm = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 0.84 + 0.3 * noise3(v.x * 1.9 + seed * 3.1, v.y * 1.9 - seed, v.z * 1.9 + seed * 1.7);
    nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y * 0.8 + 0.25; nrm[i * 3 + 2] = v.z;
    p.setXYZ(i, cx + v.x * rx * k, cy + v.y * ry * k, cz + v.z * rx * k);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.normalizeNormals();
  return { geo: g, leaf: true };
}
// A palm frond: a bent strip from the crown outward and down.
function frond(turn, len, y) {
  const seg = 3, pos = [], nrm = [], idx = [], c = Math.cos(turn), s = Math.sin(turn), w = len * 0.16;
  for (let k = 0; k <= seg; k++) {
    const t = k / seg, out = len * t, drop = y + len * 0.28 * Math.sin(t * 2.2) - len * 0.5 * t * t, half = w * (1 - 0.7 * t) + 0.01;
    pos.push(c * out - s * half, drop, s * out + c * half, c * out + s * half, drop, s * out - c * half);
    nrm.push(c * 0.3, 0.95, s * 0.3, c * 0.3, 0.95, s * 0.3);
    if (k < seg) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return { geo: g, leaf: true };
}

// One list per shape: [near mesh, far mesh]. (Widths are for a tree whose crown-width
// number is 1; heights are fractions of the tree's height.)
export function makeTreeGeometries() {
  const out = [];
  // 0 conifer: tiers of drooping branches to a point (spruce, fir, larch, redwood)
  out.push([
    finish([trunk(0.5, 0.014), cone(0.12, 0.5, 0.20, 8), cone(0.32, 0.7, 0.155, 8), cone(0.52, 0.86, 0.11, 7), cone(0.7, 1.0, 0.065, 6)]),
    finish([cone(0.1, 0.62, 0.19, 5), cone(0.42, 1.0, 0.11, 5)]),
  ]);
  // 1 pine: a long bare trunk, an open crown of separate masses in the top half (ponderosa, Scots pine)
  out.push([
    finish([trunk(0.86, 0.016, 6), blob(0.07, 0.52, 0.03, 0.15, 0.07, 1, 1), blob(-0.09, 0.62, -0.05, 0.17, 0.08, 1, 2), blob(0.05, 0.71, -0.08, 0.16, 0.08, 0, 3), blob(-0.04, 0.80, 0.07, 0.14, 0.08, 0, 21), blob(0.03, 0.89, 0.0, 0.11, 0.08, 0, 22), blob(0, 0.96, 0.01, 0.06, 0.06, 0, 23)]),
    finish([trunk(0.6, 0.016, 3), blob(0.02, 0.6, 0, 0.16, 0.12, 0, 1), blob(-0.02, 0.84, 0, 0.12, 0.16, 0, 2)]),
  ]);
  // 2 broadleaf: a short trunk and a broad rounded crown of several masses (oak, beech, maple)
  out.push([
    finish([trunk(0.42, 0.018, 6), blob(0, 0.62, 0, 0.30, 0.24, 1, 4), blob(0.17, 0.55, 0.08, 0.20, 0.17, 0, 5), blob(-0.15, 0.58, -0.10, 0.21, 0.17, 0, 6), blob(-0.02, 0.82, 0.03, 0.19, 0.16, 0, 7)]),
    finish([trunk(0.35, 0.018, 3), blob(0, 0.65, 0, 0.30, 0.32, 0, 4)]),
  ]);
  // 3 tropical: a tall straight trunk and a wide shallow crown above everything (kapok, dipterocarp, gum)
  out.push([
    finish([trunk(0.72, 0.018, 6, 0.6), blob(0, 0.84, 0, 0.30, 0.13, 1, 8), blob(0.16, 0.78, -0.08, 0.18, 0.10, 0, 9), blob(-0.14, 0.80, 0.10, 0.19, 0.10, 0, 10)]),
    finish([trunk(0.7, 0.018, 3), blob(0, 0.83, 0, 0.30, 0.15, 0, 8)]),
  ]);
  // 4 umbrella: a forked trunk under a flat-topped crown (acacia, stone pine, koa)
  out.push([
    finish([trunk(0.66, 0.02, 6, 0.5), blob(0, 0.83, 0, 0.42, 0.10, 1, 11), blob(0.2, 0.80, 0.12, 0.24, 0.08, 0, 12), blob(-0.2, 0.80, -0.1, 0.24, 0.08, 0, 13)]),
    finish([trunk(0.66, 0.02, 3), blob(0, 0.83, 0, 0.42, 0.11, 0, 11)]),
  ]);
  // 5 bush: foliage to the ground, wider than tall (juniper, pinyon, sagebrush)
  out.push([
    finish([trunk(0.3, 0.03, 5), blob(0, 0.52, 0, 0.42, 0.44, 1, 14), blob(0.2, 0.36, 0.1, 0.28, 0.28, 0, 15), blob(-0.2, 0.40, -0.12, 0.28, 0.30, 0, 16)]),
    finish([blob(0, 0.48, 0, 0.44, 0.48, 0, 14)]),
  ]);
  // 6 palm: a thin leaning trunk and a crown of fronds
  out.push([
    finish([trunk(0.9, 0.012, 5, 0.75), ...Array.from({ length: 9 }, (_, k) => frond(k / 9 * 6.2831853 + 0.2, 0.34, 0.9))]),
    finish([trunk(0.9, 0.012, 3, 0.75), ...Array.from({ length: 5 }, (_, k) => frond(k / 5 * 6.2831853, 0.34, 0.9))]),
  ]);
  // 7 slender: a pale straight trunk and a narrow light crown (aspen, birch)
  out.push([
    finish([trunk(0.9, 0.009, 5, 0.4), blob(0, 0.62, 0, 0.14, 0.16, 1, 17), blob(0.03, 0.80, 0.02, 0.12, 0.14, 0, 18), blob(-0.02, 0.93, 0, 0.07, 0.08, 0, 19)]),
    finish([trunk(0.6, 0.009, 3), blob(0, 0.74, 0, 0.14, 0.26, 0, 17)]),
  ]);
  return out;
}
