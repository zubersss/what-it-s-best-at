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

// The four seasons one can go to: where in a latitude's year (y) each is at its most itself
// (the trees in flower and the first leaves; high summer; the leaves turned and beginning to
// fall; bare branches).
export const SEASONS = Object.freeze({ spring: 0.06, summer: 0.33, autumn: 0.63, winter: 0.86 });
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
