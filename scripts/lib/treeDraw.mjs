// Draws a tree mesh (life/treeGeometry.js) into a picture without a browser: a small
// z-buffer, the cut-outs taken from the trees' picture as the game takes them, a light
// in two tones with the crown lit as one round mass, bark furrows on the tubes. Used by
// scripts/tree-preview.mjs. The game's own light, air, colours and wind are not in it.
import { sampleAtlas } from '../../src/life/treeAtlasGen.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// A camera: eye and the point it looks at (metres, the tree's foot at the origin, y up),
// the vertical field of view (degrees), the picture's size. Returns p => [x, y, 1/depth] or null (behind).
export function camera(eye, at, fov, w, h) {
  const f = norm(sub(at, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), k = h / 2 / Math.tan(fov * Math.PI / 360);
  return (p) => { const d = sub(p, eye), z = dot(d, f); if (z < 0.15) return null; return [w / 2 + dot(d, r) / z * k, h / 2 - dot(d, u) / z * k, 1 / z]; };
}
// From the side, the whole tree: `px` pixels a metre, the foot `base` pixels above the cell's bottom.
export function sideView(px, w, h, base = 18) { return (p) => [w / 2 + p[0] * px, h - base - p[1] * px, 1 / (1000 - p[2])]; }

// geo: the mesh; A: the atlas (makeSprays / addImpostors); img: RGB bytes of a picture W
// wide; the cell at (ox, oy), cw by ch; proj: a camera; o: { tall (m), wide (crown width
// number), leaf, trunk (colours 0..1), petal (a colour: the tree is in flower), sun,
// gone (0..1: how much of its leaves is off the tree, taken out as the game's shaders take
// them: life/trees.js, the sprays leaf by leaf, a whole tree's picture clump by clump,
// TREE_THIN), own (the tree's own number), lod (texels a pixel as a power of two, for the clumps) }
export function drawTree(geo, A, img, W, ox, oy, cw, ch, proj, o = {}) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, L = geo.attributes.aLeaf.array, U = geo.attributes.aUv.array, n = P.length / 9;
  const tall = o.tall ?? 1, wide = o.wide ?? 1, sun = norm(o.sun || [-0.5, 0.75, 0.43]), leafC = o.leaf || [0.2, 0.4, 0.17], trunkC = o.trunk || [0.36, 0.28, 0.23];
  const zb = o.zb || new Float32Array(cw * ch).fill(0);
  const gone = o.gone || 0, own = o.own ?? 0.37, clump = 10 * Math.pow(2, Math.ceil(Math.max(0, o.lod || 0))), fr = (x) => x - Math.floor(x);
  for (let t = 0; t < n; t++) {
    const lf = L[t * 3], draw = lf > 0.5 && lf < 2.5 ? 1 - 0.85 * gone : 1;          // (plain leaves draw in to the branches, and are gone past the half)
    if (lf > 0.5 && lf < 2.5 && U[t * 6] < 0 && gone > 0.5) continue;
    const o9 = t * 9, V = [0, 1, 2].map((k) => proj([P[o9 + k * 3] * wide * tall * draw, P[o9 + k * 3 + 1] * tall, P[o9 + k * 3 + 2] * wide * tall * draw]));
    if (!V[0] || !V[1] || !V[2]) continue;
    const [a, b, c] = V, leaf = L[t * 3], card = U[t * 6] >= 0, bark = U[t * 6] < -1.5, nls = [0, 1, 2].map((k) => N[o9 + k * 3] * sun[0] + N[o9 + k * 3 + 1] * sun[1] + N[o9 + k * 3 + 2] * sun[2]);
    const twigC = trunkC.map(() => (trunkC[0] + trunkC[1] + trunkC[2]) / 3 * 0.62), flat = leaf < 0.1 ? trunkC : leaf < 0.5 ? twigC : leaf > 1.5 ? leafC.map((v) => v * 1.3) : leaf > 1.1 ? leafC.map((v) => v * 0.45) : leafC;     // (1.25: the dark inside of a crown)
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(cw - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(ch - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5, su = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, sv = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den, sw = 1 - su - sv;
      if (su < 0 || sv < 0 || sw < 0) continue;
      const iz = su * a[2] + sv * b[2] + sw * c[2], i = y * cw + x;
      if (iz <= zb[i]) continue;
      // (true to perspective: weights by 1/depth)
      const u = su * a[2] / iz, v = sv * b[2] / iz, w = sw * c[2] / iz;
      let col = flat, nl = u * nls[0] + v * nls[1] + w * nls[2], lit;
      if (card) {
        const au = u * U[t * 6] + v * U[t * 6 + 2] + w * U[t * 6 + 4], av = u * U[t * 6 + 1] + v * U[t * 6 + 3] + w * U[t * 6 + 5], s = sampleAtlas(A, au, av);
        if (s[0] < 0.42) continue;
        if (gone > 0 && s[2] <= 0.75 && !(o.petal && s[2] > 0.25)) { const cs = leaf > 3.5 ? clump : 12, h = fr(Math.sin(Math.floor(au * A.W / cs) * 12.9898 + Math.floor(av * A.H / cs) * 78.233 + own * 37) * 43758.5453); if (h < gone * 1.05) continue; }
        const petal = o.petal ? Math.min(1, Math.max(0, s[2] > 0.5 ? 2 - s[2] * 2.2 : s[2] * 2)) : 0;
        if (!o.petal && s[2] > 0.25 && s[2] < 0.75 && A.W > 2048) continue;          // (a petal on a tree not in flower: nothing)
        col = s[2] > 0.75 || (!o.petal && s[2] > 0.5) ? twigC : leafC.map((c, k) => (c * (1 - petal) + (o.petal ? o.petal[k] : 0) * petal) * (0.6 + 0.5 * s[1]) * (leaf > 3.1 && leaf < 3.5 ? 0.5 : 1));     // (3.25: a crown's dark heart)
        lit = 0.5 + 0.6 * Math.min(1, Math.max(0, (nl + 0.25) / 0.9));
      } else if (leaf < 0.5) {
        lit = 0.45 + 0.6 * Math.min(1, Math.max(0, nl + 0.2));
        if (bark) { const U2 = -(u * U[t * 6] + v * U[t * 6 + 2] + w * U[t * 6 + 4]) - 2, fur = Math.floor(U2 / 2), bu = (U2 - 2 * fur) * fur, bv = (u * U[t * 6 + 1] + v * U[t * 6 + 3] + w * U[t * 6 + 5]) * tall, f = Math.abs(((bu + 0.32 * Math.sin(bv * 1.3 + bu)) % 1 + 1) % 1 - 0.5) * 2; lit *= 1 - 0.4 * Math.min(1, Math.max(0, (f - 0.5) / 0.3)); }
      } else lit = leaf > 1.1 && leaf < 1.5 ? 0.5 + 0.5 * Math.min(1, Math.max(0, nl + 0.3)) : nl > 0.12 ? 1 : 0.5;
      zb[i] = iz;
      const q = ((oy + y) * W + ox + x) * 3;
      img[q] = Math.min(255, col[0] * lit * 300); img[q + 1] = Math.min(255, col[1] * lit * 300); img[q + 2] = Math.min(255, col[2] * lit * 300);
    }
  }
  return n;
}

// A pale sky for a cell.
export function sky(img, W, ox, oy, cw, ch) { for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const q = ((oy + y) * W + ox + x) * 3, t = y / ch; img[q] = 232 - 40 * t; img[q + 1] = 226 - 22 * t; img[q + 2] = 205 + 10 * t; } }
