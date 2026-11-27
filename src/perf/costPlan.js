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
  { id: 'sky', label: 'the sky (every pass of it: clouds of every kind, their shadows, the weather maps, fog, the far pass)', parts: ['sky', 'sky-all', 'clouds-all', 'cloud-upper', 'cells-far', 'rain-shafts', 'fog', 'lenses'] },
  { id: 'forest', label: 'the forest (trees near and far)', parts: ['trees', 'far-forest'] },
  { id: 'grass', label: 'grass and flowers', parts: ['grass'] },
  { id: 'shadows', label: 'the shadow maps', parts: ['shadow-maps'] },
  { id: 'ground', label: "the ground's shading", parts: ['ground-shading'] },
  // (what was in no group on the thirteenth results and stood between "every group out" and
  // "nothing drawn": the ground's triangles themselves and the small things)
  // (This group holds the ground's shading too, as the ground is not drawn at all: less the
  // group above, it is the ground's triangles and the small things; the sum of the groups one
  // by one counts the shading twice.)
  { id: 'ground-mesh', label: 'the ground not drawn at all (its shading and its triangles) with leaves, petals, pollen, falls and the lander', parts: ['ground-mesh', 'small-things'] },
  { id: 'rocks', label: 'rocks near and far', parts: ['rocks'] },
  { id: 'figure', label: 'the figure', parts: ['figure'] },
  { id: 'glow', label: 'glow and beams', parts: ['glow'] },
];
// The governor's savings in families, measured as the groups of parts are: each family switched
// on whole, twice, between two measures of everything on. A family that buys nothing need not
// be looked into; one that buys much is, by its "one saving alone" numbers. Every saving but
// the terrain's two is in exactly one (scripts/cost-plan-test.mjs holds the list to that).
export const SAVING_GROUPS = [
  { id: 'grass', label: 'the grass (grass-mid, grass, pollen)', steps: ['grass-mid', 'grass', 'pollen'] },
  { id: 'trees', label: 'the trees and leaves (trees-far, far-trees, tree-leaves, tree-shadows, leaves, leaf-carpet)', steps: ['trees-far', 'far-trees', 'tree-leaves', 'tree-shadows', 'leaves', 'leaf-carpet'] },
  { id: 'sky', label: "the sky's (the eleven cloud, fog and rain savings)", steps: ['cloud-far', 'cloud-upper', 'rain-shafts', 'cloud-shade-rate', 'lenses', 'fog-sheet', 'cloud-shade-coarse', 'clouds', 'cloud-volume', 'cloud-steps', 'rain'] },
  { id: 'shadows', label: 'the shadows (fine-shadows, soft-shadows, contact, far-rock-shadows, air-shadow)', steps: ['fine-shadows', 'soft-shadows', 'contact', 'far-rock-shadows', 'air-shadow'] },
  { id: 'ground', label: "the ground's (detail, far-relief, water, snow-edge)", steps: ['detail', 'far-relief', 'water', 'snow-edge'] },
  { id: 'things', label: 'rocks and the figure (rocks, far-rocks, cloak, figure, dust)', steps: ['rocks', 'far-rocks', 'cloak', 'figure', 'dust'] },
  { id: 'glow', label: 'glow (bloom, sun-beams, edge-glow)', steps: ['bloom', 'sun-beams', 'edge-glow'] },
];
// The order of a view's measures: [what is out (-1 nothing, -2 every saving on, -3 every group out
// at once, >= 0 that saving, <= -10 that part of `parts`, <= -100 that group of `groups`,
// <= -200 that family of `families`), scale]. A part that is a whole group by itself is not
// measured a second time among the parts.
export function costConfigs(steps, parts, groups, held, small, families = []) {
  const c = [[-1, held]];
  // (each group twice, everything on between: on, group, on, group, on)
  for (let k = 0; k < groups.length; k++) c.push([-100 - k, held], [-1, held], [-100 - k, held], [-1, held]);
  c.push([-3, held], [-1, held]);
  for (let k = 0; k < families.length; k++) c.push([-200 - k, held], [-1, held], [-200 - k, held], [-1, held]);
  // (everything on is measured again after every three savings, and each saving set against
  // the measures of it on either side, not against the first)
  steps.forEach((i, k) => { c.push([i, held]); if (k % 3 === 2 || k === steps.length - 1) c.push([-1, held]); });
  // (a part left out is set against "everything on" measured just before it)
  const solo = new Set(groups.filter((g) => g.parts.length === 1).map((g) => g.parts[0]));
  parts.forEach((p, k) => { if (!solo.has(p.id)) c.push([-1, held], [-10 - k, held]); });
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

// How many frames a measure takes (after its warm-up): a group or a family, which are what the
// test is for, more than a part, a part more than one saving by itself.
export const framesFor = (which) => (which >= 0 ? 8 : which <= -10 && which > -100 ? 10 : 12);
