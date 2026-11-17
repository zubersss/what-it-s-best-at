// Dynamic resolution: lowers the render scale when frames are over budget, raises it
// when there is headroom. Uses GPU timer queries when the browser exposes them
// (vsync hides headroom from frame deltas); otherwise it probes upward cautiously.
import { CONFIG } from '../config.js';

const STEP = 0.05;

export class DynamicResolution {
  constructor(renderer, fixedScale, targetFps) {
    this.gl = renderer.getContext();
    this.fixed = fixedScale;
    this.scale = fixedScale ?? 1;
    this.budgetMs = 1000 / (targetFps || CONFIG.TARGET_FPS);
    this.avgMs = this.budgetMs;
    this.gpuMs = null;
    this.cooldown = 0;
    this.probeBackoff = 2;        // seconds to wait before trying a higher scale again
    this.lastRaise = 0;
    this.time = 0;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.query = null; this.pending = [];
  }

  beginFrame() {
    if (!this.ext || this.query) return;
    this.query = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
  }

  endFrame() {
    if (!this.ext || !this.query) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.query); this.query = null;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuMs = this.gpuMs === null ? ms : this.gpuMs * 0.9 + ms * 0.1;
      }
      gl.deleteQuery(q); this.pending.shift();
    }
    if (this.pending.length > 8) { for (const q of this.pending) gl.deleteQuery(q); this.pending.length = 0; }
  }

  // dtMs: wall-clock time since the previous frame. Returns the scale to use.
  update(dtMs) {
    if (this.fixed != null) return this.scale;
    const dt = Math.min(dtMs, 250);
    this.time += dt / 1000;
    this.avgMs = this.avgMs * 0.9 + dt * 0.1;
    this.cooldown -= dt / 1000;
    if (this.cooldown > 0) return this.scale;

    const over = this.avgMs > this.budgetMs * 1.12;
    if (over && this.scale > CONFIG.MIN_SCALE) {
      // If we only just raised the scale, raising was a mistake: wait longer next time.
      if (this.time - this.lastRaise < 3) this.probeBackoff = Math.min(60, this.probeBackoff * 2);
      const big = this.avgMs > this.budgetMs * 1.5 ? 2 : 1;
      this.scale = Math.max(CONFIG.MIN_SCALE, this.scale - STEP * big);
      this.cooldown = 0.5;
    } else if (!over && this.scale < 1) {
      let headroom;
      if (this.gpuMs !== null) headroom = this.gpuMs < this.budgetMs * 0.7;
      else headroom = this.avgMs < this.budgetMs * 1.03 && this.time - this.lastRaise > this.probeBackoff;
      if (headroom) {
        this.scale = Math.min(1, this.scale + STEP);
        this.lastRaise = this.time;
        this.cooldown = 1.0;
      }
    }
    return this.scale;
  }
}
