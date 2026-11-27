// The plan of the benchmark's cost test (perf/benchmark.js, CostTest): which measures are taken in
// which order, and what each is set against. Apart from the benchmark so that it can be checked
// without a browser (scripts/cost-plan-test.mjs).
//
// The parts in groups, each left out whole and twice over, with "everything on" measured just
// before and just after each time: a baseline that drifts by 30 ms over a test (heat, the
// ground still arriving) hid every single part and saving in the eleventh results; a group is
// large, and set against its own neighbours the drift does not reach it. The two takes are
// printed side by side: a number that does not repeat is not one.
export const GROUPS = [
  { id: 'sky', label: 'the sky (clouds of every kind, their shadows, fog, the far pass)', parts: ['sky', 'clouds-all', 'cloud-upper', 'cells-far', 'rain-shafts', 'fog', 'lenses'] },
  { id: 'forest', label: 'the forest (trees near and far)', parts: ['trees', 'far-forest'] },
  { id: 'grass', label: 'grass and flowers', parts: ['grass'] },
  { id: 'shadows', label: 'the shadow maps', parts: ['shadow-maps'] },
  { id: 'ground', label: "the ground's shading", parts: ['ground-shading'] },
  { id: 'rocks', label: 'rocks near and far', parts: ['rocks'] },
  { id: 'figure', label: 'the figure', parts: ['figure'] },
  { id: 'glow', label: 'glow and beams', parts: ['glow'] },
];
// The order of a view's measures: [what is out (-1 nothing, -2 every saving on, -3 every group out
// at once, >= 0 that saving, <= -10 that part of `parts`, <= -100 that group of `groups`), scale].
export function costConfigs(steps, parts, groups, held, small) {
  const c = [[-1, held]];
  // (each group twice, everything on between: on, group, on, group, on)
  for (let k = 0; k < groups.length; k++) c.push([-100 - k, held], [-1, held], [-100 - k, held], [-1, held]);
  c.push([-3, held], [-1, held]);
  // (everything on is measured again after every three savings, and each saving set against
  // the measures of it on either side, not against the first)
  steps.forEach((i, k) => { c.push([i, held]); if (k % 3 === 2 || k === steps.length - 1) c.push([-1, held]); });
  // (a part left out is set against "everything on" measured just before it)
  parts.forEach((p, k) => c.push([-1, held], [-10 - k, held]));
  c.push([-2, held], [-1, held], [-1, small], [-1, 1]);
  return c;
}
// "Everything on" at config k: between the measures of it on either side.
export function baselineAt(c, ms, k) {
  const n = c.length, held = c[0][1], isOn = (i) => c[i][0] === -1 && c[i][1] === held && !isNaN(ms[i]);
  let a = k, b = k; while (a > 0 && !isOn(a)) a--; while (b < n - 1 && !isOn(b)) b++;
  if (!isOn(b)) b = a; if (!isOn(a)) a = b;
  return a === b ? ms[a] : ms[a] + (ms[b] - ms[a]) * (k - a) / (b - a);
}
