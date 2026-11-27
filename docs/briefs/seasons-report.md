# Seasons on Haven: report (brief: `docs/briefs/seasons.md`; branch `ccr-6f4f9272-seasons`)

Pictures are in `docs/shots/seasons/`. The checks: `node scripts/season-test.mjs` (the
season's rule; `--break <fault>` shows each check fail) beside the trees' own tests.

## Piece 1: a year of its own, and one rule for the season

**What was built.**
- `src/life/season.js` is the one place that says what time of year it is. The living
  things keep a calendar of 365.25 "life days", counted as in the northern half of a world
  (day 80 its spring equinox; the southern half is half a year on), and species say when
  they flower and turn in those days, as before. How fast the calendar runs is the world's:
  a world with no `year` in its file runs on the date (Earth is unchanged, day for day);
  Haven's file now has `year: { days: 48, at: ['2024-09-22T17:00:00Z', 265] }`: one spring
  to the next in 48 of its days, twelve days a season, and on the scene's morning the
  calendar reads what Earth's read on that date. **So the opening morning is the first day
  of spring at the opening place, as it was** (the check holds it there).
- Who asks it: the near trees and through them the far forest and the ground under them
  (`trees.update` gets `app.lifeDay`), the flowering days (`cover.js`, `bloomOf`), the
  leaves in the air (through the trees' season), and the weather's step (`weatherStep`'s
  `day`, which Earth's weather uses for its temperature).
- **The weather's model is not hooked up yet** (it is the sky helper's file):
  `src/weather/sky/model.js` works its season out as the Sun's declination / 23.44 from
  the weather clock (`timeOf`: `season = decl / 23.44`). The function to take instead is
  `northSummer(lifeDay(world, ms))` from `life/season.js` (-1 midwinter .. 1 midsummer in
  the north; `ms` is the date in milliseconds, which is the weather's epoch + t). Until
  then the model's temperature and snowfall follow the Sun's year, not the life's.
- The menu's clock has a "Season" row: the season where the traveller is ("early spring
  here · day 1 of a year of 48") and four buttons, Spring, Summer, Autumn, Winter, each
  moving the date on by whole days (the hour stays) to that season at the place.
  `?season=spring|summer|autumn|winter` (or a point of the place's year, 0..1) does the
  same in the URL, for pictures.

**Where the life's year and the Sun's disagree.** The Sun stays on Haven's orbit (Earth's,
365 days, the same tilt). The life's year is 48 days. At the scene's date the two agree (an
equinox, the first day of spring in the south). Going on from there the leaves run 7.6
times faster than the Sun: 24 days later it is autumn at the opening place while the Sun
has only moved 24 days toward the southern summer (its noon height some 9 degrees more,
the days longer). In "winter" (41 days on) the noon Sun is 15 degrees higher than at the
opening, not lower. After seven and a half life years the two agree again. Nothing in the
light says "winter"; the season is told by the trees, the ground and the snow.

**Pictures** (`haven_ledge_300m_<season>.png`, and the four side by side in
`piece1_four_seasons.png`): the opening view from 300 m up, with the colours the trees
had before piece 2 (cherries in flower in spring, the aspens gold in autumn, bare in
winter; the ground and the snow do not change yet).

**Cost.** None: the same numbers reach the same shaders.

**Shared files touched**: `src/app.js` (the clock's day, the menu's row, `goSeason`),
`src/core/params.js` (`season`), `src/worlds/haven.js` (`year`), `CLAUDE.md` (the switch,
the test).
