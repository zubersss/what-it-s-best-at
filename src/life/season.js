// The year: what time of year it is at a place on a date. One rule, and everything that
// lives by the season asks it (the trees near and far, the ground under them, the leaves in
// the air, the grass, the snow, the weather): written twice, each was different within a day.
//
// The calendar the living things keep is 365.25 "life days" long on every world, counted as
// in the northern half of a world (day 80: its spring equinox; the southern half is half a
// year on). Species say when they flower and turn in those days (life/cover.js). How fast
// that calendar runs is the world's:
//   - a world with no `year` in its file runs on the date itself (Earth: 1 January is day 0);
//   - a world with `year: { days, at: [date, lifeDay] }` goes through the whole calendar in
//     `days` of its own days, and on `date` the calendar reads `lifeDay` (Haven: 48 days,
//     and its scene's morning reads what Earth's calendar read on that date, so the place
//     the game opens at is as it was before it had a year of its own).
// The Sun is not asked: it stays on the body's orbit (worlds/solarSystem.js). On a world
// with a year of its own the life's season and the Sun's height at noon therefore go apart
// (docs/briefs/seasons-report.md, "Where the life's year and the Sun's disagree").
//
// No DOM, no three: this runs on the main thread, in workers and in Node.

export const LIFE_YEAR = 365.25;
const HOUR_MS = 3600000;
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const wrap1 = (x) => ((x % 1) + 1) % 1;

// How long the world's year is, in milliseconds, and one of its days.
export function yearMs(world) {
  const y = world && world.year;
  return y ? y.days * (world.dayHours || 24) * HOUR_MS : LIFE_YEAR * 24 * HOUR_MS;
}
export const dayMs = (world) => ((world && world.dayHours) || 24) * HOUR_MS;

// The day of the life's calendar (0..365.25, as in the northern half) at a moment (ms since
// 1970 UTC).
export function lifeDay(world, ms) {
  const y = world && world.year;
  if (!y) { const d = new Date(ms); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000; }
  const at = y._at || (y._at = [Date.parse(y.at[0]), y.at[1]]);
  return wrap1((ms - at[0]) / yearMs(world) + at[1] / LIFE_YEAR) * LIFE_YEAR;
}

// How far through its own year a latitude is on a life day: 0 at its spring equinox, 0.25 at
// midsummer, 0.5 at the autumn equinox, 0.75 at midwinter.
export const yearAt = (day, lat) => wrap1((day - 80) / LIFE_YEAR + (lat < 0 ? 0.5 : 0));
// The life day as the northern half would count it, at a latitude (what a species' calendar is in).
export const localDay = (day, lat) => wrap1((day + (lat < 0 ? LIFE_YEAR / 2 : 0)) / LIFE_YEAR) * LIFE_YEAR;

// How warm the season is in the northern half, -1 (midwinter) .. 1 (midsummer): what the
// weather's model calls `season` (it took the Sun's declination / 23.44 for it).
export const northSummer = (day) => Math.sin((day - 80) / LIFE_YEAR * 2 * Math.PI);
// ... and at a latitude (the southern half is the other way round)
export const summerAt = (day, lat) => (lat < 0 ? -1 : 1) * northSummer(day);

// The season of the leaves at a latitude on a life day: y (as yearAt), turned (0..1: how far
// the leaves of the trees that drop them have turned), bare (0..1: how far those trees are
// bare), far (0 in the tropics, where no tree keeps the season, 1 from 38 degrees).
export function seasonAt(day, lat) {
  const y = yearAt(day, lat), far = sm(25, 38, Math.abs(lat));
  const bare = (y > 0.5 ? sm(0.62, 0.72, y) : 1 - sm(0.02, 0.12, y)) * far;
  return { y, far, turned: sm(0.46, 0.62, y) * (y > 0.4 ? 1 : 0) * far, bare };
}

// ---- A tree's season -----------------------------------------------------------------------
// What one tree's leaves are doing on a life day: THE rule for every tree that drops its
// leaves, near, far and in the canopy the ground draws. A caller works nothing of this out
// for itself: it hands over the species, the day, where the tree stands and the tree's own
// number, and draws what comes back.
//
// A tree's year, in its hemisphere's own days (d, 0..365.25; spring equinox 80):
//   spring   it buds on day BUD + half of how hard its winter is + a few days of its own, pale
//            yellow-green; the leaves are all out LEAF_OUT days on and deepen to the summer's
//            green over YOUNG days;
//   autumn   it begins to turn on day TURN - how hard its winter is +- a dozen days of its
//            own, through yellow to its species' colour over TURNING days; the leaves begin
//            to come off FALL_FROM days into that and are gone FALL_TO days into it, dulling
//            to brown as they go.
// How hard the winter is (days): ALT_DAYS for every kilometre up, LAT_DAYS for every degree
// toward the pole from 45 (15 degrees at most either way): autumn comes earlier and spring
// later high up and toward the pole. Between 25 and 38 degrees from the equator the season
// fades out: in the tropics no tree keeps it.
// Evergreens (a species whose `fall` is 0) answer their own green on every day.
export const TREE_YEAR = Object.freeze({
  BUD: 87, LEAF_OUT: 22, YOUNG: [10, 45], OWN_BUD: 8, SPRING_HARD: 0.5,
  TURN: 262, TURNING: 26, FALL_FROM: 16, FALL_TO: 48, OWN_TURN: 24, BROWN: [30, 55],
  ALT_DAYS: 8, LAT_DAYS: 1, LAT_FROM: 45, LAT_MOST: 15, HARD_MOST: 35,
  TROPIC: [25, 38],
});
// The colours of autumn where a species names none: by how it falls (life/cover.js: 1 turns
// orange to red, 2 gold), two colours a species, a tree between them by its own number.
const AUTUMN = [null, [[0.40, 0.20, 0.03], [0.30, 0.045, 0.02]], [[0.42, 0.26, 0.03], [0.44, 0.30, 0.035]]];
const YELLOW = [0.40, 0.30, 0.04], BROWN = [0.17, 0.10, 0.035], BUD_GREEN = [0.13, 0.20, 0.04];
const fract = (x) => x - Math.floor(x);

// How hard the winter is at a place, in days (see above), and how much of a season there is
// at its latitude (0 in the tropics .. 1).
export function winterDays(lat, alt) {
  const T = TREE_YEAR, a = Math.abs(lat);
  return Math.min(T.HARD_MOST, Math.max(-T.HARD_MOST, T.ALT_DAYS * Math.max(0, alt) / 1000 + T.LAT_DAYS * Math.min(T.LAT_MOST, Math.max(-T.LAT_MOST, a - T.LAT_FROM))));
}
export const seasonShare = (lat) => sm(TREE_YEAR.TROPIC[0], TREE_YEAR.TROPIC[1], Math.abs(lat));

// One tree. sp: its species (life/cover.js: leaf, fall, autumn?); day: the life day; lat
// (degrees), alt (m over the sea): where it stands; own: its own number 0..1. Writes into
// out (and returns it):
//   r, g, b  its leaves' colour (linear albedo, what a species' `leaf` is in summer)
//   gone     0..1: how much of its leaves is off the tree
//   turn     0..1: how far the leaves have turned
//   shed     0..1: how fast leaves are coming off it now (1: at the height of its fall)
//   down     0..1: how much of its leaves lies under it (grows as they fall, goes through
//            the winter, is gone when the new leaves are out)
//   young    0..1: how new its leaves are (1: just out of the bud)
export function treeSeason(sp, day, lat, alt, own, out = {}) {
  const L = sp.leaf;
  out.r = L[0]; out.g = L[1]; out.b = L[2]; out.gone = 0; out.turn = 0; out.shed = 0; out.down = 0; out.young = 0;
  if (!sp.fall) return out;
  const amp = seasonShare(lat);
  if (amp <= 0) return out;
  const T = TREE_YEAR, d = localDay(day, lat), hard = winterDays(lat, alt);
  const b0 = T.BUD + T.SPRING_HARD * hard + T.OWN_BUD * fract(own * 3.71);
  // (the leaves on the ground thin to a third between the first snow's days and the buds)
  const lying = 1 - 0.67 * sm(305, LIFE_YEAR + b0, d >= 180 ? d : d + LIFE_YEAR);
  if (d >= 180) {
    // --- the autumn half of its year
    const a0 = T.TURN - hard + T.OWN_TURN * (fract(own * 5.37) - 0.5), t = sm(a0, a0 + T.TURNING, d) * amp;
    if (t <= 0) return out;
    const A = sp.autumn || AUTUMN[sp.fall], k = sp.fall === 1 || sp.autumn ? sm(0.35, 0.8, fract(own * 7.3)) : fract(own * 7.3);
    const k1 = sm(0, 0.55, t), k2 = sm(0.4, 1, t), k3 = 0.55 * sm(a0 + T.BROWN[0], a0 + T.BROWN[1], d);
    for (let i = 0; i < 3; i++) {
      const peak = A[0][i] + (A[1][i] - A[0][i]) * k, early = peak + (YELLOW[i] - peak) * 0.6;
      let c = L[i] + (early - L[i]) * k1; c += (peak - c) * k2; c += (BROWN[i] - c) * k3;
      out[i === 0 ? 'r' : i === 1 ? 'g' : 'b'] = c;
    }
    const f0 = a0 + T.FALL_FROM, f1 = a0 + T.FALL_TO, x = Math.min(1, Math.max(0, (d - f0) / (f1 - f0)));
    out.turn = t; out.gone = sm(f0, f1, d) * amp; out.shed = 4 * x * (1 - x) * amp; out.down = out.gone * lying;
  } else {
    // --- the spring half: bare until the buds break
    const back = sm(b0, b0 + T.LEAF_OUT, d), young = 1 - sm(b0 + T.YOUNG[0], b0 + T.YOUNG[1], d);
    out.gone = (1 - back) * amp; out.young = young * amp; out.turn = 0;
    // (last year's leaves on the ground: the rest goes as the new leaves come out)
    out.down = lying * (1 - back) * amp;
    // (the buds' pale green comes with the first leaves: a bare tree's colour is its summer's,
    // which only a tree in flower shows, in the leaves of its picture far off)
    const y = out.young * sm(0, 0.15, back);
    out.r = L[0] + (BUD_GREEN[0] - L[0]) * 0.8 * y; out.g = L[1] + (BUD_GREEN[1] - L[1]) * 0.8 * y; out.b = L[2] + (BUD_GREEN[2] - L[2]) * 0.8 * y;
  }
  return out;
}

// The four seasons one can go to: where in a latitude's year (y) each is at its most itself
// (the trees in flower and the first pale leaves; high summer; the leaves turned and the first
// of them falling, a kilometre or so up at 45 degrees: higher and nearer the pole the trees
// are further on, lower they are still green; bare branches).
export const SEASONS = Object.freeze({ spring: 0.07, summer: 0.33, autumn: 0.55, winter: 0.86 });
export const SEASON_NAMES = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
// The season's name at a point of a latitude's year, and how far through it (0..1).
export function seasonName(y) { const q = wrap1(y) * 4, k = Math.floor(q) % 4; return { name: SEASON_NAMES[k], part: q - k }; }
// "early spring", "midsummer", "late autumn": for the clock's read-out
export function seasonLabel(y) {
  const s = seasonName(y);
  return s.part < 1 / 3 ? `early ${s.name}` : s.part < 2 / 3 ? (s.name === 'summer' || s.name === 'winter' ? `mid${s.name}` : `mid-${s.name}`) : `late ${s.name}`;
}

// How long from a moment (ms) until a latitude's year next stands at `target` (a season's
// name, or y as a number 0..1), in milliseconds: a whole number of the world's days, so the
// hour of the day stays what it is, and always forward (asked for the season one is in, the
// answer is the same season a year on, unless it is less than a day away).
export function untilSeason(world, ms, lat, target) {
  const want = typeof target === 'number' ? target : SEASONS[target];
  if (want == null || !Number.isFinite(want)) return 0;
  const year = yearMs(world), dms = dayMs(world);
  // (a world on the date itself keeps whole days as its calendar: asked from noon of the day)
  let d = wrap1(want - yearAt(lifeDay(world, ms), lat)) * year;
  d = Math.round(d / dms) * dms;
  return d >= year ? 0 : d;
}
