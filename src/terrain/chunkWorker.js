// Worker entry: owns a HeightSource and builds chunks on request.
import { createHeightSource } from './height/heightSource.js';
import { ChunkBuilder } from './chunkBuilder.js';

let hs = null, builder = null;

self.onmessage = (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      const rasters = m.rasters.map((r) => ({ ...r, data: new Int16Array(r.buffer) }));
      hs = createHeightSource(m.world, rasters);
      builder = new ChunkBuilder(hs, m.cfg);
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'chunk') {
      const t0 = performance.now();
      const c = builder.build(m.face, m.level, m.ix, m.iy);
      c.type = 'chunk'; c.id = m.id; c.ms = performance.now() - t0;
      self.postMessage(c, [c.positions.buffer, c.attrs.buffer, c.normals.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e?.stack || e) });
  }
};
