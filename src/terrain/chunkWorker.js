// Worker entry: owns a HeightSource and builds chunks on request.
import { createHeightSource } from './height/heightSource.js';
import { ChunkBuilder } from './chunkBuilder.js';
import { ShadowBaker } from './shadowBake.js';
import { treeBlock } from '../life/treeBlock.js';
import { rockBlock, rockVis } from '../rocks/rockBlock.js';

let hs = null, builder = null, baker = null;

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
      const b = treeBlock(hs, m.bi, m.bj, m.spacing, m.deg, m.salt);
      self.postMessage({ type: 'trees', id: m.id, origin: b.origin, count: b.count, trees: b.trees.buffer }, [b.trees.buffer]);
    } else if (m.type === 'rocks') {
      // (the far rocks of one tile, with the land's shadow on each: rocks/farRocks.js)
      const b = rockBlock(hs, m.level, m.li, m.bi, m.bj), vis = rockVis(baker, b.origin, b.off, b.count, m.sun, m.sunHalf);
      self.postMessage({ type: 'rocks', id: m.id, origin: b.origin, count: b.count, bound: b.bound, off: b.off.buffer, quat: b.quat.buffer, scale: b.scale.buffer, shape: b.shape.buffer, misc: b.misc.buffer, vis: vis.buffer }, [b.off.buffer, b.quat.buffer, b.scale.buffer, b.shape.buffer, b.misc.buffer, vis.buffer]);
    } else if (m.type === 'rockvis') {
      const vis = rockVis(baker, m.origin, m.off, m.count, m.sun, m.sunHalf);
      self.postMessage({ type: 'rockvis', id: m.id, vis: vis.buffer }, [vis.buffer]);
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
