// The season's one rule (src/life/season.js) against its promises. No browser, a second.
//   node scripts/season-test.mjs [--break year|rule|bloom|whole]
// --break puts one fault in to see its check fail (a test that cannot fail is worse than none).
import { getWorld } from '../src/worlds/index.js';
import { SPECIES, bloomOf } from '../src/life/cover.js';
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
  const a = S.seasonAt(day, lat0), b = oldSeason(was, lat0);
  check('... and the leaves there are as they were', Math.abs(a.turned - b.turned) < 1e-9 && Math.abs(a.bare - b.bare) < 1e-9, `turned ${a.turned.toFixed(3)}/${b.turned.toFixed(3)} bare ${a.bare.toFixed(3)}/${b.bare.toFixed(3)}`);
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

// 3. the leaves' rule is the one the trees had (moved, not changed)
{
  let worst = 0;
  for (let day = 0; day < 366; day += 0.5) for (let lat = -80; lat <= 80; lat += 4) {
    const a = S.seasonAt(day, lat), b = oldSeason(day + (brk === 'rule' ? 9 : 0), lat);
    worst = Math.max(worst, Math.abs(a.turned - b.turned), Math.abs(a.bare - b.bare));
  }
  check('the leaves\' season by day and latitude is the rule the trees had', worst < 1e-9, `worst ${worst.toExponential(2)}`);
  let wb = 0;
  for (const sp of SPECIES) if (sp.blossom) for (let day = 0; day < 366; day += 0.5) for (const lat of [-50, 40]) {
    const n = bloomOf(sp, day + (brk === 'bloom' ? 5 : 0), lat), o = oldBloom(sp, day, lat); wb = Math.max(wb, Math.abs(n.open - o.open));
  }
  check('... and the flowering days', wb < 0.01, `worst ${wb.toFixed(4)}`);
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
