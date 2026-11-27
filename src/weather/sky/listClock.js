// The field's lists (the live cells, the anvils) asked for every frame without working out a
// whole moment of the weather every frame.
//
// The model keeps a moment per exact t, and the game's t moves on every frame: each frame's ask
// worked out a whole moment (1.6 ms for the cells and 0.8 for the anvils at Haven's storm hour,
// in Node). A ListClock asks the model at moments STEP seconds of the weather clock apart and
// blends each thing's numbers between the two moments around t, by its id. A cell moves some
// 20 m in STEP at the steering's speeds, along an arc 1e-4 of the world's radius: the straight
// blend is the closed form's answer to well under a centimetre, forwards, backwards or jumped.
//
// When the clock runs so fast that neither moment around t has been asked before (a frame
// crosses more than a STEP), t itself is asked once: the cost of the old way, never twice it.
//
// No DOM, no three: runs in Node for scripts/sky-list-test.mjs.

export const LIST_STEP = 2;          // s of the weather clock between the moments asked

// what is never blended (who the thing is, when it was born, what kind it is), by name
const KEEP = new Set(['id', 'seed', 'born', 'site', 'kind', 'phase', 'end', 'topMax', 'rainPeak']);

function blendValue(key, a, b, w) {
  if (typeof a === 'number' && typeof b === 'number' && !KEEP.has(key)) {
    if (key === 'lon') { let d = b - a; d -= 360 * Math.round(d / 360); return a + d * w; }
    return a + (b - a) * w;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((v, i) => (typeof v === 'number' ? v + (b[i] - v) * w : v));
  return w < 0.5 ? a : b;
}

// the list at weight w between list a (its moment) and list b (the next), matched by id; a thing
// in one of them only (born or ended between the two) is taken as that one has it
export function blendLists(a, b, w) {
  if (w <= 0) return a.map((x) => ({ ...x }));
  if (w >= 1) return b.map((x) => ({ ...x }));
  const byId = new Map();
  for (const y of b) byId.set(y.id, y);
  const out = [], seen = new Set();
  for (const x of a) {
    const y = byId.get(x.id);
    if (!y) { out.push({ ...x }); continue; }
    seen.add(x.id);
    const o = {};
    for (const k in x) o[k] = blendValue(k, x[k], y[k], w);
    out.push(o);
  }
  for (const y of b) if (!seen.has(y.id)) out.push({ ...y });
  return out;
}

export class ListClock {
  // ask(t): the model's list at t (fresh objects, or ones not changed by the caller)
  constructor(ask, step = LIST_STEP) { this.ask = ask; this.step = step; this.cache = new Map(); this.asked = 0; }
  _moment(k) {
    let v = this.cache.get(k);
    if (!v) {
      v = this.ask(k * this.step); this.asked++;
      this.cache.set(k, v);
      if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value);
    }
    return v;
  }
  at(t) {
    if (!Number.isFinite(t)) return [];
    const u = t / this.step, k = Math.floor(u), w = u - k;
    if (!this.cache.has(k) && !this.cache.has(k + 1)) {
      // (the clock has run past both: ask t itself, once; the next frame at an ordinary rate
      // finds a moment around it)
      // (a second frame in the same STEP: the clock is ordinary again, the two moments are worth it)
      if (this._lastFast !== k) { this._lastFast = k; this.asked++; return this.ask(t).map((x) => ({ ...x })); }
    }
    return blendLists(this._moment(k), this._moment(k + 1), w);
  }
  clear() { this.cache.clear(); this._lastFast = undefined; }
}
