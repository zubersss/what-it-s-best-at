// The land's own shadow on trees (a mountain between a tree and the Sun), worked out in
// the terrain workers (terrain/chunkWorker.js) with the shadow baker's rays. No DOM and
// no three: the test (scripts/far-tree-shade-test.mjs) reads the very rule the game uses.
import { TREE_FLOATS } from './treeBlock.js';

// How many points a side the grid over a far tile has: 20 for the smallest (8 blocks,
// 889 m), and finer by half for each size up. (20 a side over a tile of 7 km was a point
// every 370 m, and the trees within that of a shadow's edge stood lit in the shade and
// shaded in the Sun.)
export function tileGrid(blocks) { return Math.round(20 * Math.sqrt(Math.max(1, blocks / 8))); }

// Whether the land's own shadow lies on each tree of a block or a tile (a mountain between
// it and the Sun): asked on a grid of G x G points over it, at crown height, and read off
// between the points (G 0: asked tree by tree). Trees beyond the shadow maps stood sunlit on hillsides in shade.
// ground (optional, with a grid): filled, tree by tree, with how much of the Sun's light the
// ground at its feet takes by the way it slopes (1 facing the Sun, 0 turned from it: the
// painted look's own measure, lightingGlsl.js paintLit). A far tree's shadow is laid on that
// ground: where the slope has no sunlight there is none to take away.
export function landShadow(hs, baker, b, sun, sunHalf, G, ground = null) {
  const vis = new Float32Array(b.count);
  if (ground) ground.fill(1);
  if (!sun || !b.count) { vis.fill(1); return vis; }
  if (!G) {
    // (tree by tree, for the trees one walks among: a grid over a block on a rim read the
    // shadow under the cliff into the trees that stand on top of it, in the Sun)
    const o = b.origin, T = b.trees;
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
      const px = o[0] + T[q], py = o[1] + T[q + 1], pz = o[2] + T[q + 2], l = Math.hypot(px, py, pz);
      vis[k] = baker.visibility(px / l, py / l, pz / l, hs.height(px / l, py / l, pz / l, 10) + Math.max(6, 0.7 * T[q + 3]), sun[0], sun[1], sun[2], 10, sunHalf);
    }
    return vis;
  }
    const o = b.origin, ol = Math.hypot(o[0], o[1], o[2]), u = [o[0] / ol, o[1] / ol, o[2] / ol];
    let e = [-u[1], u[0], 0]; const el = Math.hypot(e[0], e[1]) || 1; e = [e[0] / el, e[1] / el, 0];
    const n = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]];
    const T = b.trees; let half = 1;
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) half = Math.max(half, Math.abs(T[q] * e[0] + T[q + 1] * e[1] + T[q + 2] * e[2]), Math.abs(T[q] * n[0] + T[q + 1] * n[1] + T[q + 2] * n[2]));
    half *= 1.02;
    const grid = new Float32Array(G * G), high = ground ? new Float32Array(G * G) : null;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = (i / (G - 1) * 2 - 1) * half, y = (j / (G - 1) * 2 - 1) * half;
      const px = o[0] + e[0] * x + n[0] * y, py = o[1] + e[1] * x + n[1] * y, pz = o[2] + e[2] * x + n[2] * y, l = Math.hypot(px, py, pz);
      const h = hs.height(px / l, py / l, pz / l, 30);
      grid[j * G + i] = baker.visibility(px / l, py / l, pz / l, h + 10, sun[0], sun[1], sun[2], 30, sunHalf);
      // (the ground's height over the plane through the tile's middle: the ground is (R + h) along
      // this direction, whose share of the tile's up is ol / l. As l + h - ol the world's curve
      // was counted the wrong way round, and the slope tilted by 2x / R: review farforest-5)
      if (high) high[j * G + i] = (hs.radius + h) * ol / l - ol;
    }
    if (high) {
      // the slope's share of the sunlight at every point of the grid, from its neighbours' heights
      const cell = 2 * half / (G - 1), se = sun[0] * e[0] + sun[1] * e[1] + sun[2] * e[2], sn = sun[0] * n[0] + sun[1] * n[1] + sun[2] * n[2], su = sun[0] * u[0] + sun[1] * u[1] + sun[2] * u[2];
      const lit = new Float32Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(G - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(G - 1, j + 1);
        const gx = (high[j * G + i1] - high[j * G + i0]) / ((i1 - i0) * cell), gy = (high[j1 * G + i] - high[j0 * G + i]) / ((j1 - j0) * cell);
        const nl = (-gx * se - gy * sn + su) / Math.hypot(gx, gy, 1), t = Math.min(1, Math.max(0, (nl + 0.04) / 0.38));
        lit[j * G + i] = t * t * (3 - 2 * t);
      }
      high.set(lit);
    }
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
      const fx = ((T[q] * e[0] + T[q + 1] * e[1] + T[q + 2] * e[2]) / half * 0.5 + 0.5) * (G - 1), fy = ((T[q] * n[0] + T[q + 1] * n[1] + T[q + 2] * n[2]) / half * 0.5 + 0.5) * (G - 1);
      const i0 = Math.min(G - 2, Math.max(0, Math.floor(fx))), j0 = Math.min(G - 2, Math.max(0, Math.floor(fy))), tx = Math.min(1, Math.max(0, fx - i0)), ty = Math.min(1, Math.max(0, fy - j0));
      vis[k] = (grid[j0 * G + i0] * (1 - tx) + grid[j0 * G + i0 + 1] * tx) * (1 - ty) + (grid[(j0 + 1) * G + i0] * (1 - tx) + grid[(j0 + 1) * G + i0 + 1] * tx) * ty;
      if (high) ground[k] = (high[j0 * G + i0] * (1 - tx) + high[j0 * G + i0 + 1] * tx) * (1 - ty) + (high[(j0 + 1) * G + i0] * (1 - tx) + high[(j0 + 1) * G + i0 + 1] * tx) * ty;
    }
  return vis;
}

