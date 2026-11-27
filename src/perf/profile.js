// Where a frame's own work goes: the frame is cut into named parts by marks, and each
// part's time is averaged over the last second or so. The benchmark prints it per stop
// (a slow frame on the phone is otherwise one number with no address), and the full
// read-out shows it live.
// ('rocks and trees' was one part of 2.5 ms a frame at Haven's stops on the phone, and nobody
// could say whose: it is rocks near by and the lander now, and the far rocks, the trees, the
// far forest, the leaves and the grass each have their own, at the end of the list)
export const PARTS = ['sky and weather', 'steering', 'terrain', 'rocks near by', 'character', 'air', 'shadow map', 'far view', 'ground', 'clouds', 'rain and figure', 'finishing', 'far rocks', 'trees', 'far forest', 'leaves', 'grass'];

export class Profile {
  constructor() {
    const n = PARTS.length;
    this.acc = new Float64Array(n); this.avg = new Float32Array(n); this.total = new Float64Array(n);
    this.frames = 0; this.t = 0;
  }

  begin() { this.t = performance.now(); }

  // The time since the last mark belongs to part `i`.
  mark(i) { const now = performance.now(), d = now - this.t; this.acc[i] += d; this.total[i] += d; this.t = now; }

  end() {
    if (++this.frames < 60) return;
    for (let i = 0; i < this.acc.length; i++) { this.avg[i] = this.acc[i] / this.frames; this.acc[i] = 0; }
    this.frames = 0;
  }

  // "ground 3.1 · terrain 2.4 · ..." (ms a frame, largest first; `from`: totals to take off, `frames`: over how many)
  static text(ms, least = 0.05) {
    return PARTS.map((name, i) => [name, ms[i]]).filter((p) => p[1] >= least).sort((a, b) => b[1] - a[1]).map((p) => `${p[0]} ${p[1].toFixed(1)}`).join(' · ');
  }
}
