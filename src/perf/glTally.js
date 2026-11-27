// What the page hands the GPU in a frame, counted for the benchmark: draw calls, triangles,
// passes (each target that is drawn into or cleared after another), and the uploads of
// textures and buffers with their bytes, those that fall inside a pass (between two draws
// into the same target) counted apart: a tile-based GPU must write the half-drawn picture
// out for such a one. A count costs nothing to keep and is true on any device, where a
// frame's length on a phone is a whole number of screen refreshes and says little.
// (scripts/gl-count.mjs counts the same in a headless browser, call by call, with names.)
//
// The context's own functions are wrapped for the length of a run only (install .. remove):
// play pays nothing for it.
const COMPS = { 0x1903: 1, 0x8D94: 1, 0x1902: 1, 0x1909: 1, 0x1906: 1, 0x8227: 2, 0x8228: 2, 0x190A: 2, 0x1907: 3, 0x8D98: 3, 0x1908: 4, 0x8D99: 4 };
const TYPE = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x140B: 2, 0x1405: 4, 0x1404: 4, 0x1406: 4 };
const WHOLE = { 0x8363: 2, 0x8033: 2, 0x8034: 2, 0x84FA: 4, 0x8C3B: 4, 0x8C3E: 4, 0x8368: 4, 0x8DAD: 8 };
export const texelBytes = (format, type) => WHOLE[type] || (COMPS[format] || 4) * (TYPE[type] || 1);
// (triangles of a draw call: mode, how many vertices or indices, how many instances)
export const trianglesOf = (mode, count, instances = 1) => (mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0) * instances;

export const TALLY = ['draws', 'tris', 'passes', 'uploads', 'bytes', 'inside', 'insideBytes'];

export class GlTally {
  constructor(gl) {
    this.gl = gl; this.saved = null;
    this.n = new Float64Array(TALLY.length);       // this frame's counts, in TALLY's order
    this._fb = null; this._pass = undefined; this._ops = 0; this._pend = 0; this._pendBytes = 0;
  }

  get installed() { return !!this.saved; }

  install() {
    if (this.saved) return;
    const gl = this.gl, n = this.n, saved = (this.saved = []);
    const wrap = (name, before) => {
      const proto = gl[name]; if (typeof proto !== 'function') return;
      const own = Object.prototype.hasOwnProperty.call(gl, name);
      saved.push([name, own ? proto : null]);
      gl[name] = function (...a) { before(a); return proto.apply(gl, a); };
    };
    // something is drawn or cleared: a new pass if the target is another than the last one's
    const op = () => {
      if (this._fb !== this._pass) { this._pass = this._fb; n[2]++; this._ops = 0; this._pend = 0; this._pendBytes = 0; }
      if (this._pend) { n[5] += this._pend; n[6] += this._pendBytes; this._pend = 0; this._pendBytes = 0; }
      this._ops++;
    };
    const draw = (mode, count, inst) => { op(); n[0]++; n[1] += trianglesOf(mode, count, inst); };
    const up = (bytes) => { n[3]++; n[4] += bytes; if (this._ops > 0 && this._fb === this._pass) { this._pend++; this._pendBytes += bytes; } };
    const dims = (s) => (s ? (s.videoWidth || s.naturalWidth || s.width || 0) * (s.videoHeight || s.naturalHeight || s.height || 0) : 0);
    const len = (s, a) => (!s || typeof s === 'number' ? 0 : a.length > 4 && a[4] ? a[4] * (s.BYTES_PER_ELEMENT || 1) : s.byteLength || 0);
    wrap('bindFramebuffer', (a) => { if (a[0] === 0x8D40 || a[0] === 0x8CA9) this._fb = a[1] || null; });
    wrap('drawArrays', (a) => draw(a[0], a[2], 1));
    wrap('drawElements', (a) => draw(a[0], a[1], 1));
    wrap('drawArraysInstanced', (a) => draw(a[0], a[2], a[3]));
    wrap('drawElementsInstanced', (a) => draw(a[0], a[1], a[4]));
    wrap('drawRangeElements', (a) => draw(a[0], a[3], 1));
    wrap('clear', op);
    wrap('texImage2D', (a) => { if (a.length >= 9) { if (a[8]) up(a[3] * a[4] * texelBytes(a[6], a[7])); } else up(dims(a[5]) * texelBytes(a[3], a[4])); });
    wrap('texSubImage2D', (a) => up(a.length >= 9 ? a[4] * a[5] * texelBytes(a[6], a[7]) : dims(a[6]) * texelBytes(a[4], a[5])));
    wrap('texImage3D', (a) => { if (a[9]) up(a[3] * a[4] * a[5] * texelBytes(a[7], a[8])); });
    wrap('texSubImage3D', (a) => up(a[5] * a[6] * a[7] * texelBytes(a[8], a[9])));
    wrap('bufferData', (a) => { const b = len(a[1], a); if (b) up(b); });
    wrap('bufferSubData', (a) => up(len(a[2], [0, 0, 0, a[3], a[4]])));
  }

  remove() {
    if (!this.saved) return;
    for (const [name, own] of this.saved) { if (own) this.gl[name] = own; else delete this.gl[name]; }
    this.saved = null;
  }

  // The counts since the last call (one frame's, if called once a frame), added to `into`
  // from index `at`; then they begin again.
  take(into, at = 0) {
    const n = this.n;
    if (into) for (let i = 0; i < n.length; i++) into[at + i] += n[i];
    n.fill(0); this._pass = undefined; this._ops = 0; this._pend = 0; this._pendBytes = 0;
  }

  // "23 passes · 85 draw calls · 2.71M triangles · uploads 12 (803 KB), 0.2 of them inside a pass (9 KB)"
  static text(sum, at, frames) {
    const f = Math.max(1, frames), v = (i) => sum[at + i] / f;
    const k = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e4 ? Math.round(x / 1e3) + 'k' : x >= 100 ? String(Math.round(x)) : x.toFixed(1));
    const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
    return `${v(2).toFixed(1)} passes · ${k(v(0))} draw calls · ${k(v(1))} triangles · uploads ${k(v(3))} (${kb(v(4))})${v(5) > 0.005 ? `, ${v(5).toFixed(2)} of them inside a pass (${kb(v(6))})` : ', none inside a pass'}`;
  }
}
