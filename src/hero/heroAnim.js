// Which of the rigged character's clips play, and how much of each (the clips are the
// owner's, made with the model: Idle, Walk, Run, Sprint, Jump, Hover, Flight, Landing).
// Hero (hero.js) still decides where the figure is, which way it faces and how far it lies
// along its flight; this turns that state into a pose of the skeleton (heroRig.js).
//
// On foot: Idle, Walk, Run and Sprint by the pace, the three gaits kept in step (one shared
// phase, each clip read from where its left foot is furthest forward) and played faster or
// slower with the pace; in the air on foot (a jump, a fall) the Jump clip's rising and
// falling frames by the vertical speed; after a touch-down the Landing clip from its
// contact, more of it the harder the landing. Flying: Hover, and Flight by how much the
// figure flies. The clips move the hips about (a jump rises, the landing falls three
// metres, the flight leans): where the game does that itself the hips are held.
import { HeroRig } from './heroRig.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the pace a clip was made for (m/s, at the figure's size), and how far its speed may be bent
const PACE = { Walk: 1.75, Run: 4.4, Sprint: 8.0 }, BEND = [0.55, 1.7];
const LAND_RATE = 1.7;        // the Landing clip is played this much faster than made (its recovery is 1.7 s long)

export class HeroAnim {
  constructor(rig) {
    this.rig = rig; this.phase = 0; this.time = 0;
    const J = (n) => rig.names.indexOf(n), hips = J('Hips'), left = J('LeftFoot');
    // each gait's phase (0..1) at which the left foot is furthest ahead of the hips
    this.lead = {};
    for (const name of ['Walk', 'Run', 'Sprint']) {
      const c = rig.clips[name]; let best = -1e9, at = 0;
      for (let f = 0; f < c.frames - 1; f++) { rig.sample(name, f / c.fps, rig.pose, true); rig.solve(); const z = rig.world[left * 12 + 11] - rig.world[hips * 12 + 11]; if (z > best) { best = z; at = f; } }
      this.lead[name] = at / (c.frames - 1);
    }
    // the hips as the figure stands (Idle's first frame): held wherever the game moves the body itself
    this.stand = Float32Array.from(rig.sample('Idle', 0, new Float32Array(rig.count * 7)).subarray(0, 7));
    // the Jump clip's top, and the Landing clip's contact (the frame its hips come down to standing height)
    const top = (name) => { const c = rig.clips[name]; let b = -1e9, at = 0; for (let f = 0; f < c.frames; f++) if (c.pos[f * rig.count * 3 + 1] > b) { b = c.pos[f * rig.count * 3 + 1]; at = f; } return at / c.fps; };
    this.jumpTop = top('Jump');
    { const c = rig.clips.Landing; let f = 0; while (f < c.frames - 1 && c.pos[f * rig.count * 3 + 1] > this.stand[1]) f++; this.landAt = Math.max(0, f / c.fps - 0.03); let low = 1e9, lf = f; for (let k = f; k < c.frames; k++) if (c.pos[k * rig.count * 3 + 1] < low) { low = c.pos[k * rig.count * 3 + 1]; lf = k; } let e = lf; while (e < c.frames - 1 && c.pos[e * rig.count * 3 + 1] < this.stand[1] - 0.5) e++; this.landEnd = Math.min(c.duration, e / c.fps + 0.5); }
    // how far each clip's hips are lifted or dropped to put its boots on the game's ground
    // (the skeleton's own units; make-hero-rig measured each clip's ground)
    this.drop = {}; const idle = rig.clips.Idle.ground ?? 0;
    for (const c of Object.values(rig.clips)) this.drop[c.name] = ((idle - (c.ground ?? idle)) / rig.root[5]) / (rig.unit || 1);
    this._layers = []; this._b = new Float32Array(rig.count * 7); this._acc = new Float32Array(rig.count * 7);
    this.w = {};                                   // the weights last used (read by tests and the tools)
  }

  // st: { foot 0..1 (on foot), speed (m/s over the ground), air 0..1 (off the ground while on
  //       foot), vUp (m/s), fly 0..1 (how much it flies), since (s since the last touch-down),
  //       landSpeed (m/s it came down at) }
  update(dt, st) {
    const rig = this.rig, n = rig.count, P = rig.pose, B = this._b;
    this.time += dt;
    const foot = Math.min(1, Math.max(0, st.foot ?? 0)), speed = st.speed || 0, air = Math.min(1, Math.max(0, st.air || 0)), fly = Math.min(1, Math.max(0, st.fly || 0));
    // ---- the gaits ---------------------------------------------------------------------------
    const wWalk0 = ss(0.15, 1.2, speed), wRun0 = ss(2.0, 4.2, speed), wSpr0 = ss(7.0, 13.0, speed);
    const g = { Idle: 1 - wWalk0, Walk: wWalk0 * (1 - wRun0), Run: wRun0 * (1 - wSpr0), Sprint: wSpr0 };
    let rate = 0, gw = 0;
    for (const name of ['Walk', 'Run', 'Sprint']) { if (g[name] <= 0) continue; const k = Math.min(BEND[1], Math.max(BEND[0], speed / PACE[name])); rate += g[name] * k / rig.clips[name].duration; gw += g[name]; }
    if (gw > 0) this.phase = (this.phase + dt * rate / gw) % 1;
    // ---- on foot, in the air, landing ----------------------------------------------------------
    const since = st.since ?? 99, hard = Math.min(1, Math.max(0, ((st.landSpeed || 0) - 1.5) / 6));
    const lt = this.landAt + Math.max(0, since) * LAND_RATE, lEnd = this.landEnd;
    const land = since >= 0 && lt < lEnd ? hard * (1 - ss(lEnd - 0.45, lEnd, lt)) * (1 - ss(0.8, 2.5, speed)) * (1 - air) : 0;
    const jt = this.jumpTop - Math.min(1, Math.max(-1, (st.vUp || 0) / 3.5)) * 0.22;
    const L = this._layers; L.length = 0;
    const add = (name, time, weight, loop, hold) => { if (weight > 1e-3) L.push({ name, time, weight, loop, hold }); };
    const ground = foot * (1 - air) * (1 - land);
    add('Idle', this.time, ground * g.Idle, true, 0);
    for (const name of ['Walk', 'Run', 'Sprint']) add(name, (this.phase + this.lead[name]) * rig.clips[name].duration, ground * g[name], true, 0);
    add('Landing', lt, foot * (1 - air) * land, false, 0);
    add('Jump', jt, foot * air, false, 2);
    // ---- flying -------------------------------------------------------------------------------
    // (Flight is not a loop: it drifts through a flying pose; read there and back)
    add('Hover', this.time, (1 - foot) * (1 - fly), true, 1);
    // (the flying pose: arms stretched ahead, legs trailing, made by rule on the owner's skeleton
    // (scripts/make-hero-rig.mjs, "Superman"; the owner: "the superman animation flying pose
    // instead of mine"): a loop. A file without it flies in the model's own Flight clip, read
    // there and back as before.)
    if (rig.clips.Superman) add('Superman', this.time, (1 - foot) * fly, true, 2);
    else { const fd = rig.clips.Flight.duration, ft = this.time % (2 * fd); add('Flight', ft < fd ? ft : 2 * fd - ft, (1 - foot) * fly, false, 2); }
    // ---- blended ------------------------------------------------------------------------------
    // (hold 1: the hips' place is the standing one, the clip's sway about its own mean kept;
    //  hold 2: the hips' place and turn are the standing ones: the game lays the body along
    //  its flight, and moves it up and down in a jump)
    let total = 0; const A = this._acc; A.fill(0); this.w = {};
    for (const l of L) {
      rig.sample(l.name, l.time, B, l.loop);
      if (l.hold === 0) B[1] += this.drop[l.name];
      if (l.hold === 2) for (let e = 0; e < 7; e++) B[e] = this.stand[e];
      else if (l.hold === 1) { B[0] = this.stand[0]; B[2] = this.stand[2]; }
      for (let j = 0; j < n; j++) {
        const o = j * 7; let dot = 0; if (total > 0) for (let e = 3; e < 7; e++) dot += A[o + e] * B[o + e];
        const s = dot < 0 ? -l.weight : l.weight;
        for (let e = 0; e < 3; e++) A[o + e] += B[o + e] * l.weight;
        for (let e = 3; e < 7; e++) A[o + e] += B[o + e] * s;
      }
      total += l.weight; this.w[l.name] = (this.w[l.name] || 0) + l.weight;
    }
    if (total <= 0) { P.set(rig.rest); } else for (let j = 0; j < n; j++) { const o = j * 7; for (let e = 0; e < 3; e++) P[o + e] = A[o + e] / total; const q = Math.hypot(A[o + 3], A[o + 4], A[o + 5], A[o + 6]) || 1; for (let e = 3; e < 7; e++) P[o + e] = A[o + e] / q; }
    rig.solve();
    return P;
  }
}
export { HeroRig };
