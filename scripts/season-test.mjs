// The season's one rule (src/life/season.js) against its promises. No browser, a second.
//   node scripts/season-test.mjs [--break year|opening|evergreen|far|ground|jump|whole]
// --break puts one fault in to see its check fail (a test that cannot fail is worse than none).
import { getWorld } from '../src/worlds/index.js';
import fs from 'node:fs';
import { SPECIES, bloomOf, treeLook, packed, COLOUR_TOP, canopyYear, floraFor } from '../src/life/cover.js';
import * as S from '../src/life/season.js';

const brk = (() => { const i = process.argv.indexOf('--break'); return i > 0 ? process.argv[i + 1] : ''; })();
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) failed++; };
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

const haven = getWorld('haven'), earth = getWorld('earth');
const hv = brk === 'year' ? { ...haven, year: { days: 48, at: [haven.year.at[0], 200] } } : haven;
const t0 = Date.parse(haven.scene.dateUTC), lat0 = haven.scene.start.lat;
const calendar = (ms) => { const d = new Date(ms); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000; };

// --- what the game drew before the world had a year of its own (trees.js and cover.js as they were)
const oldSeason = (day, lat) => {
  const y = (((day - 80) / 365.25 + (lat < 0 ? 0.5 : 0)) % 1 + 1) % 1, far = sm(25, 38, Math.abs(lat));
  return { turned: sm(0.46, 0.62, y) * (y > 0.4 ? 1 : 0) * far, bare: (y > 0.5 ? sm(0.62, 0.72, y) : 1 - sm(0.02, 0.12, y)) * far };
};
const oldBloom = (sp, day, lat) => {
  const b = sp.blossom, d = (((day + (lat < 0 ? 182.6 : 0)) % 365.25) + 365.25) % 365.25;
  const open = sm(b.from, b.from + 10, d) * (1 - sm(b.to - 12, b.to, d));
  return { open, fall: open > 0 ? Math.max(0.5 * open, sm(b.from + 12, b.to - 10, d) * open) : 0 };
};

// 1. the opening morning: the life's calendar reads what Earth's read on that date
{
  const day = S.lifeDay(hv, t0), was = calendar(t0);
  check('Haven, the scene\'s morning: the calendar reads Earth\'s day', Math.abs(day - was) < 1e-6, `${day.toFixed(4)} against ${was}`);
  let worst = 0;
  for (const sp of SPECIES) if (sp.blossom) for (let own = 0; own <= 1; own += 0.125) {
    const n = bloomOf(sp, day + (own - 0.5) * 8, lat0), o = oldBloom(sp, was + (own - 0.5) * 8, lat0);
    worst = Math.max(worst, Math.abs(n.open - o.open), Math.abs(n.fall - o.fall));
  }
  check('... and the trees in flower', worst < 0.01, `worst difference ${worst.toFixed(4)}`);
}

// 2. a world without a year keeps the date's calendar
{
  let ok = true;
  for (let k = 0; k < 400; k++) { const ms = Date.UTC(2017, 0, 1) + k * 86400000 * 1.37; if (S.lifeDay(earth, ms) !== calendar(ms)) ok = false; }
  check('Earth: the calendar is the date\'s', ok && !earth.year);
}

// 3. the opening morning, tree by tree: every tree that drops its leaves is bare, as it was,
// at any height, early or late; the trees in flower are in flower as they were
{
  const day = Math.floor(S.lifeDay(hv, t0) + 1e-6) + (brk === 'opening' ? 25 : 0), R = haven.radius, tl = {};
  let bare = true, leafy = '', bloom = 0;
  for (const sp of SPECIES) if (sp.fall) for (let alt = 0; alt <= 2400; alt += 200) for (let own = 0; own < 1; own += 0.0625) {
    const la = lat0 * Math.PI / 180, r = R + alt;
    treeLook(sp, day, r * Math.cos(la), 0, r * Math.sin(la), R, own, tl);
    if (tl.gone !== 1) { bare = false; leafy ||= `${sp.name} at ${alt} m, own ${own}: ${tl.gone.toFixed(2)} gone`; }
    if (tl.r !== packed(sp.leaf[0]) || tl.g !== packed(sp.leaf[1])) { bare = false; leafy ||= `${sp.name}: colour`; }
    if (sp.blossom) bloom = Math.max(bloom, Math.abs(tl.open - oldBloom(sp, calendar(t0) + (own - 0.5) * 8, lat0).open));
  }
  check('the opening morning: every tree that drops its leaves stands bare, at any height', bare, leafy);
  check('... and each tree in flower is as far in flower as it was', bloom < 0.01, `worst ${bloom.toFixed(4)}`);
}

// 3b. evergreens never turn; in the tropics no tree keeps the season
{
  const tl = {}, R = haven.radius; let ok = true, tropic = true, n = 0;
  for (const sp0 of SPECIES) {
    const sp = brk === 'evergreen' && sp0.name === 'Engelmann spruce' ? { ...sp0, fall: 1 } : sp0;
    for (let day = 0; day < 366; day += 3) for (const lat of [-60, -48.5, 10, 45]) for (const alt of [0, 1500]) {
      const la = lat * Math.PI / 180, r = R + alt;
      treeLook(sp, day, r * Math.cos(la), 0, r * Math.sin(la), R, 0.37, tl);
      const same = tl.gone === 0 && tl.thin === 0 && tl.r === (sp.fall ? packed(sp.leaf[0]) : sp.leaf[0]) && tl.g === (sp.fall ? packed(sp.leaf[1]) : sp.leaf[1]);
      if (!sp0.fall) { n++; if (!same) ok = false; } else if (lat === 10 && !same) tropic = false;
    }
  }
  check('evergreens are their own green on every day, anywhere', ok && n > 1000, `${n} asked`);
  check('ten degrees from the equator no tree turns or stands bare', tropic);
}

// 3c. one answer near, far and in the ground
{
  // (a) the near trees and the far forest ask treeLook and nothing else about the season
  const near = fs.readFileSync(new URL('../src/life/trees.js', import.meta.url), 'utf8'), far = fs.readFileSync(new URL('../src/life/farForest.js', import.meta.url), 'utf8'), ground = fs.readFileSync(new URL('../src/terrain/terrainMaterial.js', import.meta.url), 'utf8');
  const own = (src) => /uSeason\.[xy]|bloomOf\(sp, (this\.day|tr\.day)|smoothstep\([^)]*\) \* far\b/.test(src.replace(/uSeason\.value/g, ''));
  check('the near trees ask the one rule (treeLook) and have no season rule of their own', /treeLook\(sp, this\.seasonDay,/.test(near) && !/uSeason\.[xy]/.test(near.replace(/shared\.uSeason/g, '')), '');
  check('the far forest asks the same, with the near trees\' day', /treeLook\(sp, day,/.test(far) && /this\.seasonDay = tr\.seasonDay/.test(far) && !own(far));
  check('the ground reads the canopy\'s table and no season of its own in the far canopy', /uCanopyYear\[i\]/.test(ground) && !/farCanopyColour\([^)]*uLitter/.test(ground));
  // (b) what the far forest packs is what the near trees are handed, to a step of the packing
  const src = far.match(/function packLook\(sp, tl\) \{[\s\S]*?\n\}/)[0], b8src = far.match(/const b8 = .*;/)[0];
  const packLook = new Function('COLOUR_TOP', `${b8src}\n${src}\nreturn packLook;`)(COLOUR_TOP);
  let worst = 0, thin = 0; const tl = {}, R = haven.radius;
  for (const sp of SPECIES) if (sp.fall && !sp.blossom) for (let day = 0; day < 366; day += 2) for (let own = 0.03; own < 1; own += 0.11) {
    const la = -48.5 * Math.PI / 180, r = R + 900;
    treeLook(sp, day + (brk === 'far' ? 0 : 0), r * Math.cos(la), 0, r * Math.sin(la), R, own, tl);
    const nearC = [tl.r, tl.g, tl.b], nearGone = tl.gone;
    if (brk === 'far') treeLook(sp, day + 6, r * Math.cos(la), 0, r * Math.sin(la), R, own, tl);
    const p = packLook(sp, tl), farC = [Math.floor(p / 65536), Math.floor(p / 256) % 256, p % 256].map((v) => v * COLOUR_TOP / 255);
    for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(farC[i] - nearC[i]));
    thin = Math.max(thin, Math.abs(Math.round(tl.thin * 255) / 255 - nearGone));
  }
  check('a tree\'s leaves are one colour near and far, and as much of them is gone', worst < 0.002 && thin < 0.003, `colour ${worst.toFixed(4)}, gone ${thin.toFixed(4)}`);
  // (c) the ground's canopy: its colour at a height is the mean of the trees that stand there
  let cw = 0, shareOff = 0; const year = new Float32Array(32);
  for (const dayN of [20, 100, 115, 200, 262, 280, 300]) {
    const cy = canopyYear(haven, dayN, 45, 50, year), line = cy.step * 7;
    for (let i = 0; i < 8; i++) {
      const h = i * cy.step, sum = [0, 0, 0]; let share = 0, all = 0;
      for (const [cls, part] of [[1, 0.7], [8, 0.3]]) {
        const list = floraFor(haven.life.flora, cls, h / line, false), total = list.reduce((a, e) => a + e[1], 0);
        for (const e of list) {
          const sp = SPECIES[e[0]]; all += part * e[1] / total; if (!sp.fall) continue;
          for (let k = 0; k < 400; k++) {
            const o = S.treeSeason(sp, dayN + (brk === 'ground' ? 12 : 0), 45, h, (k + 0.5) / 400), w = part * e[1] / total / 400; share += w;
            sum[0] += w * (o.r + (0.11 - o.r) * o.gone); sum[1] += w * (o.g + (0.085 - o.g) * o.gone); sum[2] += w * (o.b + (0.06 - o.b) * o.gone);
          }
        }
      }
      if (share / all < 0.004) { if (year[i * 4 + 3] < 2) shareOff = 1; continue; }
      for (let c = 0; c < 3; c++) cw = Math.max(cw, Math.abs(sum[c] / share - year[i * 4 + c]));
      if (year[i * 4 + 3] > 2) shareOff = 1;
    }
  }
  check('the ground\'s far canopy is the colour of the trees that stand there, at every height', cw < 0.035 && !shareOff, `worst ${cw.toFixed(4)}`);
}

// 3d. earlier high up and toward the pole, each tree a little off its neighbours, and no jumps
{
  const sp = SPECIES[5]; let high = true, pole = true, spread = 0, jump = 0, where = '';
  for (let day = 0; day < 366; day += 1) {
    const lo = S.treeSeason(sp, day, 45, 200, 0.5, {}), hi = S.treeSeason(sp, day, 45, 2200, 0.5, {}), po = S.treeSeason(sp, day, 58, 200, 0.5, {});
    if (S.localDay(day, 45) >= 180) { if (hi.turn < lo.turn - 1e-9 || hi.gone < lo.gone - 1e-9) high = false; if (po.turn < lo.turn - 1e-9) pole = false; }
    else { if (hi.gone < lo.gone - 1e-9) high = false; if (po.gone < lo.gone - 1e-9) pole = false; }
    let mn = 1, mx = 0; for (let own = 0.05; own < 1; own += 0.1) { const o = S.treeSeason(sp, day, 45, 1000, own, {}); mn = Math.min(mn, o.turn); mx = Math.max(mx, o.turn); }
    spread = Math.max(spread, mx - mn);
  }
  for (const spk of SPECIES) if (spk.fall) for (const alt of [0, 1400, 3000]) for (const own of [0.1, 0.5, 0.9]) {
    let prev = null;
    for (let k = 0; k <= 366 * 4; k++) {
      const day = (k / 4 + (brk === 'jump' && k > 700 ? 9 : 0)) % 365.25, o = S.treeSeason(spk, day, -48.5, alt, own, {});
      if (prev) { const dj = Math.max(Math.abs(o.gone - prev.gone), Math.abs(o.down - prev.down), Math.abs(o.r - prev.r) * 3 * (1 - Math.min(o.gone, prev.gone)), Math.abs(o.g - prev.g) * 3 * (1 - Math.min(o.gone, prev.gone))); if (dj > jump) { jump = dj; where = `${spk.name}, ${alt} m, day ${day.toFixed(2)}`; } }
      prev = { ...o };
    }
  }
  check('autumn comes earlier and spring later high up', high);
  check('... and toward the pole', pole);
  check('each tree turns a little before or after its neighbours', spread > 0.5, `spread ${spread.toFixed(2)}`);
  check('a tree\'s year has no jump in it (leaves, colour, the leaves on the ground)', jump < 0.05, `largest step in a quarter day ${jump.toFixed(3)}: ${where}`);
}

// 4. the year: its length, both halves half a year apart, the model's summer
{
  const yr = S.yearMs(hv), d1 = S.lifeDay(hv, t0 + 1234567), d2 = S.lifeDay(hv, t0 + 1234567 + yr);
  check('Haven\'s year is 48 of its days and comes round', yr === 48 * 24 * 3600e3 && Math.abs(d1 - d2) < 1e-6);
  let ok = true, mono = true, prev = null;
  for (let k = 0; k < 480; k++) {
    const ms = t0 + k * yr / 480, day = S.lifeDay(hv, ms);
    if (Math.abs(((S.yearAt(day, 40) - S.yearAt(day, -40)) % 1 + 1) % 1 - 0.5) > 1e-9) ok = false;
    if (Math.abs(S.summerAt(day, 40) + S.summerAt(day, -40)) > 1e-9) ok = false;
    if (prev != null) { const step = ((day - prev) % 365.25 + 365.25) % 365.25; if (Math.abs(step - 365.25 / 480) > 1e-6) mono = false; }
    prev = day;
  }
  check('north and south are half a year apart', ok);
  check('the calendar runs evenly through the year', mono);
  check('midsummer is the warmest, midwinter the coldest', Math.abs(S.northSummer(80 + 365.25 / 4) - 1) < 1e-9 && Math.abs(S.northSummer(80 + 365.25 * 0.75) + 1) < 1e-9);
}

// 5. going to a season: whole days, forward, and it is that season there
for (const w of [hv, earth]) for (const lat of [lat0, 45]) {
  let ok = true, detail = '';
  for (const n of S.SEASON_NAMES) {
    let d = S.untilSeason(w, t0, lat, n); if (brk === 'whole') d += 3600e3;
    const y = S.yearAt(S.lifeDay(w, t0 + d), lat), off = Math.abs(((y - S.SEASONS[n] + 0.5) % 1 + 1) % 1 - 0.5) * S.yearMs(w) / S.dayMs(w);
    if (d < 0 || d >= S.yearMs(w) || d % S.dayMs(w) !== 0 || off > 1.01 || S.seasonName(y).name !== n) { ok = false; detail += ` ${n}: ${d / S.dayMs(w)} days, ${off.toFixed(2)} days off`; }
  }
  check(`${w.id} at ${lat}: each season is a whole number of days on, and is that season`, ok, detail);
}

console.log(failed ? `\n${failed} FAILED` : '\nseason: all checks passed');
process.exit(failed ? 1 : 0);
