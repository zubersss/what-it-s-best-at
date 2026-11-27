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

## Piece 2: leaves that turn and fall, seen from every distance

**What was built.**
- `treeSeason(species, day, lat, alt, own)` in `life/season.js` is the one rule for a tree
  that drops its leaves: it buds on its own day (pale yellow-green, then the summer's
  green), turns on its own day through yellow to its species' two autumn colours (a tree
  somewhere between them by its own number; `cover.js` has them for aspen, cottonwood,
  maple, the oaks, beeches, birches, larches, cherry, blackthorn), dulls, drops its leaves
  over a month, stands bare. Autumn comes 8 days earlier for every kilometre up and one for
  every degree toward the pole; spring later by half that; each tree up to a dozen days
  off its neighbours. Between 25 and 38 degrees of latitude the season fades out.
  Evergreens answer their own green on every day.
- **One answer, handed over** (`cover.js`, `treeLook`): the near trees (`trees.js`) and the
  far forest (`farForest.js`) both ask it with the tree's own place and the same whole life
  day, and get the same colour (in the same steps) and the same share of leaves gone. No
  shader works a season out any more (`uSeason.x/.y` are gone from the trees' shaders).
- **A bare tree is bare at every distance.** Before, only the nearest meshes lost their
  leaves; from 60 m (the whole-tree pictures) and in the far forest a bare aspen was a full
  green crown. Now a whole tree's picture loses its leaves clump by clump (`TREE_THIN`:
  blocks of the picture's texels, doubling in size with distance so a clump is never under a
  pixel), near and far by the same text; its wood stays. A tree in flower keeps its crown
  (the blossom), as before.
- **The ground's far canopy** (the forest raised as a whole beyond the trees) takes the
  colour and the share of such trees from the same rule: `canopyYear` works out, for eight
  heights from the sea to the tree line, the mean colour of the leaf-dropping trees of the
  wood there on the day (bare ones as branches) and how much of the wood they are; the
  shader paints that share of the canopy's patches in that colour. It was "one patch in six,
  rust, whenever the place's leaves had turned".
- `paintLeaf` (the painted look's cleaner green) and `farGreen` (the far olive) now leave a
  leaf with more red than green in it alone: through them gold came out olive. Nothing
  changes for a green leaf.
- Looked at alone first: `node scripts/tree-preview.mjs --year 5` draws a species through
  its year at the three distances (`docs/shots/seasons/tree_year_quaking_aspen_1400m.png`).

**The opening morning.** Unchanged in what the rule says (every leaf-dropping tree bare,
the cherries and thorns as far in flower as they were: the check holds both). **One thing
does change in the picture, on purpose**: the bare aspens beyond 60 m, which were drawn as
full green crowns, are now bare there too. They are few at the opening place.

**Pictures**: `haven_ledge_300m_<season>_p2.png` and `piece2_four_seasons.png` (the opening
view from 300 m, new rule); `haven_ledge_grove_150m_autumn.png` (a grove of cherry, thorn
and aspen 45 km from the opening, from 150 m in autumn).

**Cost.** The trees' shaders lose a few operations (the turn is no longer worked out per
pixel) and gain the clump test on cut-out texels of a tree that is losing leaves. The
ground's canopy block gains one mix of two uniform vectors and a `paintLeaf`. The far
forest's tiles with such trees are filled again when the life day changes (every 3 h 9 min
of Haven's clock at its own pace). No new texture anywhere. Not measured on the phone.

**Not done.** From beyond 19 km the forest's colour is the land's colour map, which has no
season: from space the woods do not turn (the snow does: piece 4).
