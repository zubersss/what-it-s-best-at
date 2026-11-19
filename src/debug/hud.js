// The HUD and the time-of-day slider. Three states, cycled with H / the HUD button:
// compact (one line: frame rate, render resolution, mode, build), full (everything, plus
// the time slider), off.
export const HUD = { OFF: 0, COMPACT: 1, FULL: 2 };

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.timebar = document.getElementById('timebar');
    this.slider = document.getElementById('time');
    this.timeLabel = document.getElementById('timelabel');
    this.level = HUD.FULL;
    this.accum = 0; this.frames = 0; this.fps = 0; this.ms = 0; this.worstMs = 0;
    this.onTime = null;
    this.slider.addEventListener('input', () => this.onTime?.(parseFloat(this.slider.value)));
    // Keep keyboard focus on the game, not the slider.
    this.slider.addEventListener('change', () => this.slider.blur());
  }

  // The slider spans one solar day of the current world, centred on the scene's start time.
  setTimeRange(halfRangeHours) {
    this.slider.min = String(-halfRangeHours); this.slider.max = String(halfRangeHours);
    this.slider.step = String(halfRangeHours / 1200);
  }

  setLevel(level) {
    this.level = level;
    this.el.classList.toggle('hidden', level === HUD.OFF);
    this.el.classList.toggle('compact', level === HUD.COMPACT);
    this.timebar.classList.toggle('hidden', level !== HUD.FULL);
    this.accum = 1e9;                      // refresh the text on the next frame
  }
  get visible() { return this.level !== HUD.OFF; }

  toggle() { this.setLevel(this.level === HUD.COMPACT ? HUD.FULL : this.level === HUD.FULL ? HUD.OFF : HUD.COMPACT); }

  setTime(hours, label) {
    if (document.activeElement !== this.slider) this.slider.value = String(hours);
    this.timeLabel.textContent = label;
  }

  // Called every frame; refreshes the text four times a second.
  update(dtMs, getStats) {
    this.accum += dtMs; this.frames++;
    this.worstMs = Math.max(this.worstMs, dtMs);
    if (this.accum < 250) return;
    if (this.accum < 1e8) { this.ms = this.accum / this.frames; this.fps = 1000 / this.ms; }
    const worst = this.worstMs;
    this.accum = 0; this.frames = 0; this.worstMs = 0;
    if (this.level === HUD.OFF) return;
    const s = getStats();
    if (this.level === HUD.COMPACT) {
      this.el.textContent = `${this.fps.toFixed(0)} fps · ${(s.viewW * s.viewH / 1e6).toFixed(2)} MP · ${s.modeLabel}${s.hover ? ' · hover' : ''} · build ${s.build}`;
      return;
    }
    const warn = (v, lim) => (v > lim ? '  <-- over budget' : '');
    const lines = [
      `${s.world}   ${s.mode}   ${s.shot ? 'shot=' + s.shot : ''}   build ${s.build}`,
      `fps ${this.fps.toFixed(1)}   frame ${this.ms.toFixed(1)} ms (worst ${worst.toFixed(0)})${s.gpuMs != null ? '   gpu ' + s.gpuMs.toFixed(1) + ' ms' : ''}`,
      `quality    ${s.governor}`,
      `draw calls ${s.calls}${warn(s.calls, s.maxCalls)}`,
      `triangles  ${(s.triangles / 1000).toFixed(0)}k${warn(s.triangles, s.maxTriangles)}`,
      `chunks     ${s.chunksDrawn} drawn / ${s.chunksLoaded} loaded / pool ${s.chunkPool}   queue ${s.queue}`,
      `render     ${s.viewW}x${s.viewH} of ${s.nativeW}x${s.nativeH}   screen ${s.refresh} Hz`,
      `gpu mem    ~${(s.gpuBytes / 1048576).toFixed(0)} MB (estimate)   tex ${s.textures} geo ${s.geometries}`,
      `exposure   ${s.exposure.toExponential(2)}  (EV ${Math.log2(s.exposure).toFixed(1)})`,
      `sun        el ${s.sunEl.toFixed(1)}  az ${s.sunAz.toFixed(1)}`,
      `pos        ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}  alt ${s.alt.toFixed(0)} m  agl ${s.agl.toFixed(1)} m`,
      `view       hdg ${s.heading.toFixed(1)} pitch ${s.pitch.toFixed(1)} fov ${s.fov.toFixed(1)}`,
      `flight     ${s.speed}   nearest ${s.nearest}${s.target ? '   target ' + s.target : ''}`,
      `gravity    ${s.onFoot ? 'on foot' + (s.airborne ? ' (in the air)' : '') : s.hover ? 'off (hover)' : 'pull ' + s.pull.toFixed(2) + ' of top speed'}`,
    ];
    this.el.textContent = lines.join('\n');
  }
}
