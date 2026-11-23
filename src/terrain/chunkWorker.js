// Worker entry: owns a HeightSource and builds chunks on request.
import { createHeightSource } from './height/heightSource.js';
import { ChunkBuilder } from './chunkBuilder.js';
import { ShadowBaker } from './shadowBake.js';
import { treeBlock, treeTile, TREE_FLOATS } from '../life/treeBlock.js';
import { rockBlock, rockVis } from '../rocks/rockBlock.js';

let hs = null, builder = null, baker = null;

// Whether the land's own shadow lies on each tree of a block or a tile (a mountain between
// it and the Sun): asked on a grid of G x G points over it, at crown height, and read off
// between the points (G 0: asked tree by tree). Trees beyond the shadow maps stood sunlit on hillsides in shade.
function landShadow(b, sun, sunHalf, G) {
  const vis = new Float32Array(b.count);
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
    const grid = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = (i / (G - 1) * 2 - 1) * half, y = (j / (G - 1) * 2 - 1) * half;
      const px = o[0] + e[0] * x + n[0] * y, py = o[1] + e[1] * x + n[1] * y, pz = o[2] + e[2] * x + n[2] * y, l = Math.hypot(px, py, pz);
      const h = hs.height(px / l, py / l, pz / l, 30);
      grid[j * G + i] = baker.visibility(px / l, py / l, pz / l, h + 10, sun[0], sun[1], sun[2], 30, sunHalf);
    }
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
      const fx = ((T[q] * e[0] + T[q + 1] * e[1] + T[q + 2] * e[2]) / half * 0.5 + 0.5) * (G - 1), fy = ((T[q] * n[0] + T[q + 1] * n[1] + T[q + 2] * n[2]) / half * 0.5 + 0.5) * (G - 1);
      const i0 = Math.min(G - 2, Math.max(0, Math.floor(fx))), j0 = Math.min(G - 2, Math.max(0, Math.floor(fy))), tx = Math.min(1, Math.max(0, fx - i0)), ty = Math.min(1, Math.max(0, fy - j0));
      vis[k] = (grid[j0 * G + i0] * (1 - tx) + grid[j0 * G + i0 + 1] * tx) * (1 - ty) + (grid[(j0 + 1) * G + i0] * (1 - tx) + grid[(j0 + 1) * G + i0 + 1] * tx) * ty;
    }
  return vis;
}

self.onmessage = (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      const rasters = m.rasters.map((r) => ({ ...r, data: new Int16Array(r.buffer) }));
      hs = createHeightSource(m.world, rasters);
      baker = new ShadowBaker(hs, m.cfg, m.world);
      builder = new ChunkBuilder(hs, m.cfg, baker);
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'ring') {
      // (no reply: jobs sent after this message are built with the new ring)
      hs.setRing(m.slot, m.raster ? { ...m.raster, data: new Int16Array(m.raster.buffer) } : null);
    } else if (m.type === 'cover') {
      hs.setCover(m.cover ? { ...m.cover, cls: new Uint8Array(m.cover.cls), tall: new Uint8Array(m.cover.tall), closed: new Uint8Array(m.cover.closed) } : null);
    } else if (m.type === 'trees') {
      const b = treeBlock(hs, m.bi, m.bj, m.spacing, m.deg, m.salt), vis = landShadow(b, m.sun, m.sunHalf, 0);
      self.postMessage({ type: 'trees', id: m.id, origin: b.origin, count: b.count, trees: b.trees.buffer, vis: vis.buffer }, [b.trees.buffer, vis.buffer]);
    } else if (m.type === 'rocks') {
      // (the far rocks of one tile, with the land's shadow on each: rocks/farRocks.js)
      const b = rockBlock(hs, m.level, m.li, m.bi, m.bj), vis = rockVis(baker, b.origin, b.off, b.count, m.sun, m.sunHalf);
      self.postMessage({ type: 'rocks', id: m.id, origin: b.origin, count: b.count, bound: b.bound, off: b.off.buffer, quat: b.quat.buffer, scale: b.scale.buffer, shape: b.shape.buffer, misc: b.misc.buffer, seen: b.seen.buffer, vis: vis.buffer }, [b.off.buffer, b.quat.buffer, b.scale.buffer, b.shape.buffer, b.misc.buffer, b.seen.buffer, vis.buffer]);
    } else if (m.type === 'rockvis') {
      const vis = rockVis(baker, m.origin, m.off, m.count, m.sun, m.sunHalf);
      self.postMessage({ type: 'rockvis', id: m.id, vis: vis.buffer }, [vis.buffer]);
    } else if (m.type === 'treeTile') {
      // A square of tree blocks in one job, a band of ranks of it: the far forest.
      const t0 = performance.now();
      const b = treeTile(hs, m.ti, m.tj, m.blocks, m.spacing, m.lo, m.hi);
      // Whether the land's own shadow lies on each tree (a mountain between it and the Sun):
      // asked on a grid over the tile, at crown height, and read off between its points.
      // Far trees are beyond every shadow map, and without this they stood sunlit on
      // hillsides that were in shade.
      const vis = landShadow(b, m.sun, m.sunHalf, 20);
      self.postMessage({ type: 'treeTile', id: m.id, origin: b.origin, count: b.count, ms: performance.now() - t0, trees: b.trees.buffer, vis: vis.buffer }, [b.trees.buffer, vis.buffer]);
    } else if (m.type === 'chunk') {
      const t0 = performance.now();
      const c = builder.build(m.face, m.level, m.ix, m.iy, m.sun, m.sunHalf);
      c.type = 'chunk'; c.id = m.id; c.ms = performance.now() - t0;
      self.postMessage(c, [c.verts.buffer, c.morph.buffer, c.normals.buffer, c.shadow.buffer]);
    } else if (m.type === 'shadow') {
      // Re-bake of an existing chunk after the Sun moved.
      const t0 = performance.now();
      const shadow = baker.bakeChunk(m.face, m.level, m.ix, m.iy, m.sun, m.sunHalf, null);
      self.postMessage({ type: 'shadow', id: m.id, shadow, ms: performance.now() - t0 }, [shadow.buffer]);
    } else if (m.type === 'air') {
      const map = baker.bakeAir(m.center, m.east, m.north, m.extent, m.n, m.sun);
      self.postMessage({ type: 'air', id: m.id, map }, [map.buffer]);
    } else if (m.type === 'points') {
      const vis = baker.bakePoints(m.points, m.sun, m.sunHalf, m.minWL || 0.5);
      self.postMessage({ type: 'points', id: m.id, vis }, [vis.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e?.stack || e) });
  }
};
