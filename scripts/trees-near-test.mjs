// The near trees in motion (no browser; seconds). The review of 2026-11-24 (trees-1 to
// trees-7, docs/briefs/haven-rich-review.md) found what pictures from a standing camera
// cannot show; each check here failed on the code it was written against.
//
//   1. Which make a tree gets (close, near, its cards) is chosen by its distance from the eye,
//      not from where a list was made 25 m back: a walker at 1.4 m/s and a runner at 8 m/s
//      through trees on a grid, at full shapes, at the governor's trees-far fraction and with
//      the close mesh off. Every tree inside the radius is drawn exactly once, every frame.
//      (--old: the rule as it was, to see the check fail.)
//   2. The shadow pass draws a tree's cards whole, whatever angle the eye looks down at
//      (a shadow is the tree seen from the Sun).
//   3. Petals: when the trees' lists are made again from a new anchor, the lying petals stay
//      where they lie and a slot's falling petals stay on their tree; only a tree that has
//      gone hands its slots on. (They all vanished and the falling ones jumped trees.)
//   6. Bark gives way to its own mean where it is finer than the pixels: a pixel's tone is
//      near the average of the bark it covers (it was near-black furrows a pixel apart, which
//      crawl as one moves), and that mean is the one the shader fades to.
//   7. Bark meets itself round every tube: the pattern on the two sides of where the tube's
//      coordinate starts again is the same (it broke along a line down every trunk and limb).
//   5. A lying petal is put on the ground as drawn: the height is asked with its distance
//      from the eye (it was the eye's distance from the planet's centre).
//
// Run: node scripts/trees-near-test.mjs [--old]
import * as THREE from 'three';
import { Petals } from '../src/life/leaves.js';
import { TREE_VERT, BARK } from '../src/life/trees.js';
import { readFileSync } from 'node:fs';
import { REBUILD_M, radii, fineStep, toMake, inFarList, nearCandidates, makeOf, farCut, CUT_IN } from '../src/life/treeLod.js';

const OLD = process.argv.includes('--old');
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); return ok; };

// ---- 1. the makes, by the eye ----------------------------------------------------------
// Trees on a 7 m grid (Haven's spacing), each a little off its point; a flat world (the
// rule is about distances, and 300 m of a 250 km world is flat to a few centimetres).
{
  const RADIUS = 240, trees = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = -70; i <= 70; i++) for (let j = -70; j <= 70; j++) trees.push([i * 7 + (rnd() - 0.5) * 4, j * 7 + (rnd() - 0.5) * 4]);
  const d2 = (t, p) => (t[0] - p[0]) ** 2 + (t[1] - p[1]) ** 2;

  // path: a straight walk, then a bend (the eye at 1.7 m over the ground), at `speed` m/s, 30 frames a second
  const run = (name, fraction, closeOn, speed) => {
    const { close, near } = radii(fraction, closeOn), dt = 1 / 30, agl = 1.7;
    const st = { built: null, fine: null, A: null, farSet: null, closeSet: new Set(), nearSet: new Set(), dirty: true };
    let worstNotClose = 1e9, worstCard = 1e9, farthestClose = 0, missing = 0, twice = 0, frames = 0, wholes = 0, fines = 0, notCloseInside = 0, inside = 0;
    const fine = (p) => {
      st.fine = p; st.closeSet.clear(); st.nearSet.clear(); fines++;
      if (OLD) {          // as it was: the makes by the distance from where the whole list was made
        trees.forEach((t, i) => { const m = makeOf(d2(t, st.A), close, near); if (m === 0) st.closeSet.add(i); else if (m === 1) st.nearSet.add(i); });
        return;
      }
      trees.forEach((t, i) => {
        if (d2(t, st.A) >= nearCandidates(near) ** 2) return;
        const m = makeOf(d2(t, p), close, near);
        if (m === 0) st.closeSet.add(i); else if (m === 1) st.nearSet.add(i);
      });
    };
    const whole = (p) => {
      st.built = p; st.A = p; st.dirty = false; wholes++;
      st.farSet = new Set();
      trees.forEach((t, i) => { const a = d2(t, p); if (a > (RADIUS + REBUILD_M + 5) ** 2) return; if (OLD ? makeOf(a, close, near) === 2 : inFarList(a, near)) st.farSet.add(i); });
      fine(p);
    };
    let p = [-150, -3], heading = 0;
    for (let s = 0; s < 400 / speed; s += dt) {
      if (s > 150 / speed) heading += 0.4 * dt * speed / 20;          // (a bend after 150 m)
      p = [p[0] + Math.cos(heading) * speed * dt, p[1] + Math.sin(heading) * speed * dt];
      const step = OLD ? REBUILD_M : fineStep(fraction, closeOn, agl);
      const make = toMake(st.dirty, st.built ? d2(p, st.built) : 1e12, st.fine ? d2(p, st.fine) : 1e12, step);
      if (OLD ? (st.dirty || !st.built || d2(p, st.built) > REBUILD_M ** 2) : make === 2) whole(p); else if (!OLD && make === 1) fine(p);
      frames++;
      trees.forEach((t, i) => {
        const de = Math.sqrt(d2(t, p));
        if (de > RADIUS - 1) return;
        const c = st.closeSet.has(i), nr = st.nearSet.has(i), f = st.farSet.has(i) && (OLD || !farCut(d2(t, st.fine), near));
        const n = c + nr + f;
        if (n === 0) missing++;
        if (n > 1 && !(Math.abs(Math.sqrt(d2(t, st.fine)) - near) < 2 * CUT_IN)) twice++;
        if (!c && closeOn) worstNotClose = Math.min(worstNotClose, de);
        if (f) worstCard = Math.min(worstCard, de);
        if (c) farthestClose = Math.max(farthestClose, de);
        if (de < close * 0.75) { inside++; if (!c) notCloseInside++; }
      });
    };
    const step = OLD ? REBUILD_M : fineStep(fraction, closeOn, agl);
    const share = inside ? (100 * notCloseInside / inside).toFixed(1) : '-';
    console.log(`${name} (close ${close.toFixed(1)} m, near ${near.toFixed(1)} m, ${speed} m/s, lists every ${step.toFixed(1)} m): ${frames} frames, ${wholes} whole lists, ${fines} choices of makes;`
      + ` nearest tree not close ${closeOn ? worstNotClose.toFixed(1) + ' m' : '-'}, farthest close ${farthestClose.toFixed(1)} m, nearest card ${worstCard.toFixed(1)} m;`
      + ` within ${(close * 0.75).toFixed(0)} m ${share} % not close; drawn by nobody ${missing}, twice ${twice}`);
    const slack = fineStep(fraction, closeOn, agl) + speed / 30 + 0.01;          // (what the rule promises, whatever it did)
    check(missing === 0, `${name}: ${missing} tree-frames inside the radius drawn by nobody`);
    check(twice === 0, `${name}: ${twice} tree-frames drawn twice`);
    if (closeOn) check(worstNotClose >= close - slack, `${name}: a tree ${worstNotClose.toFixed(1)} m from the eye is not the close mesh (close radius ${close.toFixed(1)} m, allowed ${slack.toFixed(1)} m short)`);
    if (closeOn) check(farthestClose <= close + slack, `${name}: a tree ${farthestClose.toFixed(1)} m from the eye is the close mesh (radius ${close.toFixed(1)} m)`);
    check(worstCard >= near - slack, `${name}: a tree ${worstCard.toFixed(1)} m from the eye is its cards (near radius ${near.toFixed(1)} m)`);
  };
  run('walking, full shapes', 1, true, 1.4);
  run('walking, trees-far', 0.66, true, 1.4);
  run('walking, close mesh off', 1, false, 1.4);
  run('running, full shapes', 1, true, 8);
  run('running, trees-far', 0.66, true, 8);
}

// ---- 2. the shadow pass sees the tree whole ---------------------------------------------
{
  // the shader as the shadow pass compiles it: TREE_DEPTH defined (life/trees.js, depthMaterial)
  const pre = (src, defs) => { const out = []; const stack = [true]; for (const line of src.split('\n')) { const m = line.match(/^#(ifdef|ifndef|else|endif)\s*(\w*)/); if (m) { if (m[1] === 'ifdef') stack.push(stack.at(-1) && defs.has(m[2])); else if (m[1] === 'ifndef') stack.push(stack.at(-1) && !defs.has(m[2])); else if (m[1] === 'else') { const v = stack.pop(); stack.push(stack.at(-1) && !v); } else stack.pop(); continue; } if (stack.at(-1)) out.push(line); } return out.join('\n'); };
  const src = readFileSync(new URL('../src/life/trees.js', import.meta.url), 'utf8');
  const depthDefines = /depthMaterial = new THREE\.ShaderMaterial\(\{[^}]*defines: \{ TREE_DEPTH/.test(src);
  const edge = pre(TREE_VERT, new Set(depthDefines ? ['TREE_DEPTH'] : [])).split('\n').find((l) => /float edge\s*=/.test(l)) || '';
  const byEye = /foot|uAnchorRel/.test(edge);
  console.log(`\nthe shadow pass: the cards' width ${byEye ? 'by the eye\'s angle' : 'whole'} (${edge.trim().slice(0, 60)})`);
  check(!byEye, 'the shadow pass draws the trees\' cards in by the eye\'s angle');
}

// ---- 3 and 5. petals over a making of the lists -------------------------------------------
{
  const R = 250000, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const asked = [];
  const trees = {
    def: {}, reach: 240, anchor: V(R + 2, 0, 0), blooming: [],
    shared: { uTreeEast: { value: V(0, 1, 0) }, uTreeNorth: { value: V(0, 0, 1) }, uTreeUp: { value: V(1, 0, 0) }, uSeason: { value: V(0, 0, 0) }, uAnchorRel: { value: V() }, uTreeWind: { value: new THREE.Vector4(0, 1, 0, 3) } },
    terrain: { radius: R, hs: null, drawnHeight: (d, camDist) => { asked.push(camDist); return 0; } },
  };
  const pet = new Petals(trees), rig = { pos: V(R + 2, 0, 0), agl: 1.7, fov: 60 };
  const feetAbs = [[R, 10, 4], [R, -12, 20], [R, 30, -8]];          // three trees in flower (planet axes, m)
  const listFrom = (A, which) => which.map((k) => ({ x: feetAbs[k][0] - A.x, y: feetAbs[k][1] - A.y, z: feetAbs[k][2] - A.z, tall: 6, wide: 0.5, fall: 0.8, colour: [0.9, 0.7, 0.8] }));
  trees.blooming = listFrom(trees.anchor, [0, 1, 2]);
  for (let f = 0; f < 100; f++) pet.update(rig, 412, 1 / 30);
  const lie = pet.lieGeo.attributes.aLie.array, snap = (A) => Array.from({ length: lie.length / 4 }, (_, i) => [A.x + lie[i * 4], A.y + lie[i * 4 + 1], A.z + lie[i * 4 + 2], lie[i * 4 + 3]]);
  const slotAbs = (A) => pet.uniforms.uPetalTree.value.map((v) => [A.x + v.x, A.y + v.y, A.z + v.z]);
  const before = snap(trees.anchor), slotsBefore = slotAbs(trees.anchor), lying = before.filter((p) => p[3] === 1).length;
  // the lists made again 25 m on: the same trees, listed from a new anchor in another order
  rig.pos = V(R + 2, 25, 0); trees.anchor = rig.pos.clone(); trees.blooming = listFrom(trees.anchor, [2, 0, 1]);
  pet.update(rig, 412, 1 / 30);
  const after = snap(trees.anchor), slotsAfter = slotAbs(trees.anchor);
  let gone = 0, moved = 0, jumped = 0;
  for (let i = 0; i < before.length; i++) { if (before[i][3] !== 1) continue; if (after[i][3] !== 1) gone++; else if (Math.hypot(after[i][0] - before[i][0], after[i][1] - before[i][1], after[i][2] - before[i][2]) > 1e-3) moved++; }
  for (let s = 0; s < slotsBefore.length; s++) if (Math.hypot(...slotsAfter[s].map((v, k) => v - slotsBefore[s][k])) > 1e-3) jumped++;
  console.log(`\npetals: ${lying} lying under three trees; the lists made again 25 m on: ${gone} gone, ${moved} moved; ${jumped} of ${slotsBefore.length} slots on another tree`);
  check(lying > 400 && gone === 0 && moved === 0, `petals: a making of the lists took ${gone} lying petals away and moved ${moved}`);
  check(jumped === 0, `petals: a making of the lists put ${jumped} slots' falling petals on another tree`);
  // one tree out of the list, another in: only its slots change
  const k0 = feetAbs.push([R, -40, -30]) - 1;
  rig.pos = V(R + 2, 50, 0); trees.anchor = rig.pos.clone(); trees.blooming = listFrom(trees.anchor, [0, 2, k0]);
  pet.update(rig, 412, 1 / 30);
  const third = snap(trees.anchor), slotsThird = slotAbs(trees.anchor);
  let keptTree = 0, keptLying = 0, wasLying = 0;
  for (let s = 0; s < 8; s++) {
    const on = (abs) => feetAbs.findIndex((f) => Math.hypot(f[0] - abs[0], f[1] - abs[1], f[2] - abs[2]) < 1e-3);
    const was = on(slotsBefore[s]), now = on(slotsThird[s]);
    if (was !== 1) { if (now === was) keptTree++; for (let i = s; i < third.length; i += 8) if (before[i][3] === 1) { wasLying++; if (third[i][3] === 1) keptLying++; } }
  }
  console.log(`petals: one tree gone and one come: of the slots on the trees that stayed ${keptTree} kept their tree, ${keptLying} of ${wasLying} lying petals kept`);
  check(keptLying === wasLying && keptTree > 0, 'petals: the trees that stayed lost petals when another tree went');
  const far = Math.max(...asked);
  console.log(`petals: the ground asked for with a distance from the eye of at most ${far.toFixed(1)} m`);
  check(far < 200, `petals: the ground's height asked for with a distance of ${far.toFixed(0)} m (the eye's distance from the planet's centre?)`);
}

// ---- 6 and 7. bark ---------------------------------------------------------------------
{
  // BARK (life/trees.js) as written, run in JavaScript: GLSL's functions, a float a number
  const glsl = { floor: Math.floor, sin: Math.sin, abs: Math.abs, max: Math.max, min: Math.min,
    fract: (x) => x - Math.floor(x), mod: (x, y) => x - y * Math.floor(x / y), mix: (a, b, t) => a + (b - a) * t,
    step: (e, x) => (x < e ? 0 : 1), smoothstep: (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
    vec2: (a, b) => [a, b], dot: (a, b) => a[0] * b[0] + a[1] * b[1] };
  const js = BARK.replace(/float (\w+)\(([^)]*)\)\s*\{/g, (_, n, args) => `function ${n}(${args.replace(/float /g, '')}) {`).replace(/\bfloat /g, 'let ');
  const { barkTone, barkMean } = new Function(...Object.keys(glsl), `${js}\nreturn { barkTone, barkMean };`)(...Object.values(glsl));
  const kinds = [['furrowed', 0, 0], ['red plates', 0, 1], ['pale', 1, 0]];
  // 7. the two sides of the seam, along the tube, for every number of furrows a tube has: the
  // share of its length where the tone steps there (a plate's edge may fall on it, as
  // anywhere round the tube, but only at a point)
  let worstSeam = 0, where = '';
  for (const fur of [3, 4, 5, 6, 9, 13, 18, 23, 25]) for (const [kind, pale, red] of kinds) {
    let steps = 0, n = 0;
    for (let bv = 0.0071; bv < 12; bv += 0.013) { n++; if (Math.abs(barkTone(2 * fur + 1e-6, bv, 0, 0, pale, red, 0.37) - barkTone(2 * fur + 1 - 1e-6, bv, 0, 0, pale, red, 0.37)) > 0.02) steps++; }
    if (steps / n > worstSeam) { worstSeam = steps / n; where = `${kind}, ${fur} furrows`; }
  }
  console.log(`\nbark: where a tube's coordinate starts again, the tone steps along ${(100 * worstSeam).toFixed(1)} % of the tube at most${where ? ' (' + where + ')' : ''}`);
  check(worstSeam < 0.01, `bark: the pattern breaks along ${(100 * worstSeam).toFixed(0)} % of a line down the tube (${where})`);
  // 6. a pixel against the bark it covers: furrows a tree of 8 and of 20 m has, seen from 5 to
  // 80 m on the phone (1617 px a metre at a metre, 48 degrees; the governor's floor 0.6 of
  // it), facing and on a flank (foreshortened 0.35); and the mean against barkMean
  let worst = 0, worstAt = '', meanOff = 0, meanAt = '', worstFine = 0, fineAt = '';
  for (const [kind, pale, red] of kinds) {
    // its mean, over the whole pattern
    let sum = 0, n = 0;
    for (const fur of [13, 23]) for (let i = 0; i < 40000; i++) { sum += barkTone(2 * fur + ((i * 0.618034) % 1), ((i * 0.7548777) % 1) * 40, 0, 0, pale, red, 0.37); n++; }
    const off = Math.abs(sum / n - barkMean(pale, red));
    if (off > meanOff) { meanOff = off; meanAt = `${kind}: ${(sum / n).toFixed(3)} against ${barkMean(pale, red).toFixed(3)}`; }
    // the crawl: a pixel's tone as the eye moves by a quarter, a half, three quarters of a
    // pixel, against how much the bark it covers (its average over the pixel) changes then
    for (const [tall, rT] of [[8, 0.012], [20, 0.012]]) for (const dist of [5, 10, 15, 20, 30, 40, 60]) for (const [face, k] of [['facing', 1], ['flank', 0.35]]) for (const scale of [1, 0.6]) {
      const fur = Math.max(3, Math.round(6.2831853 * rT * 20 / 0.09)), circ = 6.2831853 * rT * tall;          // (furrows round, and the tube's girth in metres)
      const pxm = 1617 * scale / dist, fu = fur / circ / (pxm * k), fv = 1 / pxm;          // (a pixel in furrows round and in metres along)
      const box = (u, v) => { let s = 0; const S = 6; for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) s += barkTone(u + ((a + 0.5) / S - 0.5) * fu / fur, v + ((b + 0.5) / S - 0.5) * fv, 0, 0, pale, red, 0.37); return s / (S * S); };
      let crawl = 0, ideal = 0, was = 0, m = 0;
      for (let j = 0; j < 150; j++) {
        const u0 = 2 * fur + 0.05 + ((j * 0.618034) % 0.8) * 0.8, v0 = 1 + ((j * 0.7548777) % 1) * 8, s0 = barkTone(u0, v0, fu, fv, pale, red, 0.37), o0 = barkTone(u0, v0, 0, 0, pale, red, 0.37), b0 = box(u0, v0);
        for (const d of [0.25, 0.5, 0.75]) {
          const u = u0 + d * fu / fur, v = v0 + d * fv;          // (the eye moved diagonally across the bark)
          crawl += Math.abs(barkTone(u, v, fu, fv, pale, red, 0.37) - s0); was += Math.abs(barkTone(u, v, 0, 0, pale, red, 0.37) - o0); ideal += Math.abs(box(u, v) - b0); m++;
        }
      }
      const excess = (crawl - ideal) / m, before = (was - ideal) / m;
      const at = `${kind}, a ${tall} m tree from ${dist} m, ${face}, ${scale === 1 ? 'full size' : 'at the floor'}, ${fu.toFixed(2)} furrows a pixel`;
      if (excess > worst) { worst = excess; worstAt = at; }
      if (before > worstFine) { worstFine = before; fineAt = at; }
    }
  }
  console.log(`bark: a pixel's tone as the eye moves by less than a pixel changes ${worst.toFixed(3)} more than the bark under it does, at most (${worstAt}); unfiltered it was ${worstFine.toFixed(3)} (${fineAt})`);
  console.log(`bark: the pattern's mean against the one it gives way to, the farthest: ${meanAt}`);
  check(worst < 0.06, `bark: a pixel's tone changes ${worst.toFixed(2)} more than the bark under it as the eye moves by less than a pixel (${worstAt}): it crawls`);
  check(meanOff < 0.03, `bark: the pattern's mean is not the one it fades to (${meanAt})`);
}

if (fail.length) { console.log('\nFAILED:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('\nall checks pass');
