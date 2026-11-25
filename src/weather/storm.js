// The storm at the traveller, and the numbers two or more places must agree on. Pure: no three,
// no DOM, no Math.random (docs/briefs/clouds-weather-plan.md, package D).
//
// STORM is written once a frame by weather.js, from what the sky's field says at the traveller,
// and read by the picture: the exposure meter's hold (post.js), the storm grade (render/look.js)
// and the sky greyed under an overcast (sky/skyDome.js). One writer, one reader each; nothing
// here knows anything about where the traveller is looking.
//
// Why a module and not a uniform: the meter and the grade are not shaders, and the sky dome is
// one shader that takes `u` below by reference (as render/globals.js G is taken).

// A smooth step (the engine's everywhere).
const ss = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

export const STORM = {
  light: 1,        // 0.06 .. 1: the share of the day's light the cloud overhead leaves (1: clear sky)
  storm: 0,        // 0 .. 1: the storm darkness overhead (a cell's, from at())
  overcast: 0,     // 0 .. 1: how much of the sky's light the cloud overhead takes (at()'s)
  grade: 0,        // 0 .. 1: how much of the storm grade the picture takes (look.js)
  flash: 0,        // the light of the strokes alight now (0: none): the meter must not chase them
  u: { value: [1, 0, 0, 0] },      // the same for a shader: x light, y storm, z overcast, w grade
};

// Written by weather.js each frame (and zeroed where no weather answers for the world, and under
// ?debug=noclouds).
export function setStorm(light = 1, storm = 0, overcast = 0, grade = 0) {
  STORM.light = light; STORM.storm = storm; STORM.overcast = overcast; STORM.grade = grade;
  STORM.flash = 0;                 // (the strokes set it again, below, where there are any)
  const u = STORM.u.value;
  u[0] = light; u[1] = storm; u[2] = overcast; u[3] = grade;
}

// THE DARKNESS OVERHEAD, as a share of the light left (the plan's D). From the cloud overhead
// alone — never from the Sun at the traveller's feet, so that a heap's shadow passing over the
// figure cannot dim the whole frame. A single heap overhead takes an overcast of about 0.55 and
// leaves almost all of the light; a closed deck leaves about 0.15; a storm cell's base, 0.12,
// which is 1.4 stops of hold at the meter (the plan's "1.2 to 1.4 stops darker than full
// compensation") and no more: at 0.06 the exposure ran into its own floor under a storm.
export function stormLight(here) {
  if (!here) return 1;
  const storm = here.storm > 0 ? here.storm : 0;
  const deck = ss(0.35, 0.95, here.overcast > 0 ? here.overcast : 0);
  return Math.max(0.12, (1 - 0.85 * deck) * (1 - 0.88 * storm));
}

// How much of the storm grade (look.js) the picture takes: a storm overhead, or a rain deck.
export function stormGrade(here) {
  if (!here) return 0;
  const storm = here.storm > 0 ? here.storm : 0;
  return Math.min(1, 0.85 * storm + 0.5 * ss(0.55, 0.95, here.overcast > 0 ? here.overcast : 0));
}

// ---- lightning's own clock ------------------------------------------------------------------

// A stroke flickers: the first stroke, then 2 to 4 return strokes down the same channel over
// 0.2 to 0.5 s, each fainter. seed: 0..1 (the strike's own). Written once here because the
// light on the land (weather.js, uFlash), the cloud lit from inside (its `bolts`) and the
// ribbons themselves (bolt.js) must flicker together.
export const FLASH_CEILING = 18000;     // m above the sea: no stroke is seen or heard from higher

export function boltReturns(seed) {
  const n = 2 + Math.floor(((seed * 7.3) % 1) * 2.999);      // 2 .. 4
  const dur = 0.2 + 0.3 * ((seed * 13.7) % 1);               // s: all of them together
  return { n, dur, life: dur + 0.18 };
}

export function boltFlicker(age, seed) {
  if (age < 0) return 0;
  const { n, dur } = boltReturns(seed);
  let v = 0;
  for (let k = 0; k < n; k++) {
    const x = age - k * dur / n;
    if (x < 0) break;
    // (each return stroke: a hard rise and a quick fall, the later ones fainter)
    const a = (1 - 0.18 * k) * Math.exp(-x / 0.045) * (0.72 + 0.28 * Math.sin(x * 190 + seed * 6));
    if (a > v) v = a;
  }
  return v > 0 ? v : 0;
}
