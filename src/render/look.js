// A world's look, when it is not the plain physical picture: `look` in its world file.
//
//   look: { paint: 1,            how much of the painted look (0: none)
//           shade: 1.7,          the sky's light on things, against the physical (coloured shade)
//           colour: 1,           how much cleaner surface colours are
//           facets: 0.6,         how much steep rock is lit by its faces (a cut-stone look)
//           shafts: 1,           the Sun's beams through trees and cloud (post.js)
//           grade: { day, low, dusk, night } }   the picture's grade by the Sun's height
//
// A grade: { sat, contrast, tint (0..1: how much of the two tints), shade: [r, g, b] (the
// dark half of the picture is multiplied by it), light: [r, g, b] (the light half) }.
// `day` holds with the Sun 30 degrees up or more, `low` at 8, `dusk` at -2, `night` below
// -10; between them the grades blend. The painted look is for the ground and the air near
// it: from 40 km up it fades to a third by 400 km (a planet from orbit keeps its own face).
//
// The principles are those of the landscape poster: few colours, each time of day its own
// pair of them (the light's and the shade's), the far ground lost in the air layer by layer.
import { G } from './globals.js';

const NEUTRAL = { sat: 1, contrast: 1, tint: 0, shade: [1, 1, 1], light: [1, 1, 1] };
const KEYS = [['night', -10], ['dusk', -2], ['low', 8], ['day', 30]];
const mix = (a, b, t) => a + (b - a) * t;

export class Look {
  constructor() { this.def = null; this.now = { ...NEUTRAL, shade: [1, 1, 1], light: [1, 1, 1] }; }

  setWorld(world) { this.def = world.look || null; if (!this.def) { this.apply(null, 0); G.uHaze.value = 1; } }

  // sunDeg: the Sun's height at the traveller (degrees); altitude (m); uniforms: the
  // composite pass's (post.compositeMat.uniforms).
  update(sunDeg, altitude, uniforms, post) {
    this.uniforms = uniforms;
    // (the Sun's beams: only with the Sun up and low air to shine through)
    if (post) post.shafts = this.def ? (this.def.shafts ?? 0) * Math.min(1, Math.max(0, (sunDeg + 2) / 6)) * Math.min(1, Math.max(0, 1 - (altitude - 8000) / 8000)) : 0;
    const d = this.def;
    // The look's thick low air, seen from above: all of it up to 6 km, down to `spaceHaze`
    // of it (0.45) from 60 km up. (Looking down from 10 km and more one looks through the
    // whole of it: the land lay under a milky veil, and from orbit the globe was a pale
    // ball beside the Earth one sees from Mars.)
    { const hx = Math.min(1, Math.max(0, Math.log10(Math.max(1, altitude) / 6000))); G.uHaze.value = d ? 1 - (1 - (d.spaceHaze ?? 0.45)) * hx * hx * (3 - 2 * hx) : 1; }
    if (!d) { this.apply(null, 0); return; }
    const x = Math.min(1, Math.max(0, (Math.log10(Math.max(1, altitude)) - 4.6) / 1.0)), near = 1 - (1 - 0.33) * x * x * (3 - 2 * x);
    const g = d.grade || {};
    // the two keys the Sun's height lies between
    let a = KEYS[0], b = KEYS[0], t = 0;
    for (let k = 0; k < KEYS.length; k++) { if (sunDeg >= KEYS[k][1]) { a = KEYS[k]; b = KEYS[Math.min(KEYS.length - 1, k + 1)]; } }
    if (b !== a) { t = (sunDeg - a[1]) / (b[1] - a[1]); t = t * t * (3 - 2 * t); }
    const A = { ...NEUTRAL, ...(g[a[0]] || {}) }, B = { ...NEUTRAL, ...(g[b[0]] || {}) }, n = this.now;
    n.sat = mix(A.sat, B.sat, t); n.contrast = mix(A.contrast, B.contrast, t); n.tint = mix(A.tint, B.tint, t);
    for (let k = 0; k < 3; k++) { n.shade[k] = mix(A.shade[k], B.shade[k], t); n.light[k] = mix(A.light[k], B.light[k], t); }
    this.apply(n, (d.paint ?? 1) * near);
  }

  apply(n, paint) {
    const d = this.def;
    G.uPaint.value.set(paint, d?.shade ?? 1, d?.colour ?? 1, d?.facets ?? 0);
    const u = this.uniforms; if (!u) return;
    if (!n || paint <= 0) { u.uGrade.value.set(1, 1, 0, 0); return; }
    // (the grade fades with the painted look itself)
    u.uGrade.value.set(mix(1, n.sat, paint), mix(1, n.contrast, paint), n.tint * paint, 0);
    u.uGradeShade.value.set(n.shade[0], n.shade[1], n.shade[2]); u.uGradeLight.value.set(n.light[0], n.light[1], n.light[2]);
  }
}
