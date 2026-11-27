// The lightning of the storm cells (docs/briefs/clouds-weather-plan.md, "STRIKES"): every flash
// is a hash of its cell and a slot of the clock, so the same storm throws the same strokes on
// every machine, a window split in two gives the same flashes as the whole, and a benchmark meets
// the same storm every time.
//
// Each mature cell gets a chance in every STRIKE_SLOT (0.7 s) of the clock: hash(cell, slot)
// under its flashes a minute x the slot. A share GROUND of them reach the ground, inside the rain
// core, and are drawn from the cloud's base there down to the ground; the rest are inside the
// cloud, between 0.4 and 0.8 of the tower's height. Power 0.6 to 1.4.
//
// Pure: no three, no DOM, no Math.random; nothing of the traveller.
import { hash3 } from '../../terrain/height/noise.js';
import { CELL, cellLife, makeCellLife } from './format.js';
import { latOf, lonOf, offsetDir } from './land.js';

export const STRIKE_SLOT = 0.7;      // s: one chance of a flash per cell per slot
export const STRIKE_GROUND = 0.33;   // the share that reach the ground
const u01 = (a, b, c, seed) => hash3(a, b, c, seed) / 4294967296;

// The strikes in [t0, t1), in time order. rec: the cell records (format.js CELL) of every cell
// alive in that window; place(rec, o, t, out): where cell o is at t (cells.js cellPlace);
// baseAt(lat, lon), groundAt(lat, lon): the cloud's base and the ground there (m above the sea);
// R: the world's radius.
export function strikesIn(rec, t0, t1, place, baseAt, groundAt, R) {
  if (t1 < t0) { const s = t0; t0 = t1; t1 = s; }
  const out = [], life = makeCellLife(), at = [0, 0, 0], foot = [0, 0, 0];
  for (let o = 0; o < rec.length; o += CELL.STRIDE) {
    const born = rec[o + CELL.BORN], m0 = born + rec[o + CELL.GROW], m1 = m0 + rec[o + CELL.MATURE];
    const a = Math.max(t0, m0), b = Math.min(t1, m1);
    if (a >= b) continue;
    const seed = rec[o + CELL.SEED] >>> 0, chance = rec[o + CELL.FLASH] / 60 * STRIKE_SLOT;
    for (let k = Math.floor(a / STRIKE_SLOT) - 1, kEnd = Math.floor(b / STRIKE_SLOT); k <= kEnd; k++) {
      if (u01(seed, k, 0x11, 1) >= chance) continue;
      const t = (k + u01(seed, k, 0x12, 1)) * STRIKE_SLOT;
      if (t < t0 || t >= t1 || t < m0 || t >= m1) continue;
      cellLife(rec, o, t, life); place(rec, o, t, at);
      const ground = u01(seed, k, 0x13, 1) < STRIKE_GROUND;
      const r = (ground ? life.core : 0.6 * life.radius) * Math.sqrt(u01(seed, k, 0x14, 1));
      offsetDir(at, 2 * Math.PI * u01(seed, k, 0x15, 1), r, R, foot);
      const lat = latOf(foot), lon = lonOf(foot), base = baseAt(lat, lon);
      const top = base + life.rise * (rec[o + CELL.TOP] - base);
      let h0, h1;
      if (ground) { h0 = groundAt(lat, lon); h1 = base; }
      else { h0 = h1 = base + (0.4 + 0.4 * u01(seed, k, 0x16, 1)) * Math.max(0, top - base); }
      out.push({ t, cell: rec[o + CELL.ID], ground, x: foot[0], y: foot[1], z: foot[2], h0, h1, power: 0.6 + 0.8 * u01(seed, k, 0x17, 1), seed: hash3(seed, k, 0x18, 1) >>> 0 });
    }
  }
  return out.sort((p, q) => p.t - q.t || p.cell - q.cell);
}
