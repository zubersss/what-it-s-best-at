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

## Piece 3: leaves that pile up

**What was built.**
- The rule says how much of a tree's leaves lies under it (`treeSeason`'s `down`: it grows
  as they fall, thins to a third through the winter, the rest goes as the new leaves come
  out), in what colour (the colour they fell in, going brown) and how fast they are coming
  off now (`shed`).
- **In the air, from the trees that are shedding** (`leaves.js`, `TreeLeaves`): the petals'
  machine made general (`Shed`: a pool of points in eight slots, each slot one of the
  nearest trees; a falling one is one sum in the vertex shader, a lying one is put on the
  ground as drawn). `Trees.shedding` lists the nearest trees the rule says are dropping
  leaves or have leaves under them, with each tree's leaf colour of the day; 480 leaves
  fall from their crowns, more in a gust, and 1 600 lie under and down the wind of them, as
  many as the rule says lie. The petals in spring are the same machine with other numbers.
- **On the ground** (`terrainMaterial.js`, the `[seasons]` litter block, which replaces the
  old scatter): a wood's floor carries the leaves of its height and day (`uLitterYear`,
  from `canopyYear`: colour and amount, a wood with one leaf-dropping tree in three is
  carpeted when they are bare), thicker along the wood's edge; and under and down the wind
  of each of the eight nearest trees that have dropped theirs (`uLeafTree`: the lying
  leaves' own slots), in that tree's colour, thickest against its trunk. Thin is a
  scatter, much is a carpet.
- **Kicked up** (`leaves.js`, `Kicked`): running on foot, or flying within two metres of
  the ground, through leaves that lie (the same amounts the ground draws: `lyingAt`) throws
  bursts of them up behind, in their colour: 12 bursts of 26 points, each leaf one sum from
  the burst's place, moment and the traveller's velocity.
- The old box of 420 leaves in the wind stays for gales and for a traveller tearing past
  trees, and in autumn adds the leaves of the trees farther off; it now follows how fast
  the place's trees are shedding (it fell all winter from bare trees before).
- The governor's `leaves` step thins all of it to a third, as it did the petals.

**Pictures**: `haven_ledge_grove_ground_autumn.png` and `..._lateautumn.png` (the grove from
the ground: the trees turned, then bare with their leaves under them).

**Cost.** Points: 480 + 1 600 + 312 more, drawn only near such trees in their season. The
ground: the litter block reads the detail tile twice as before, now only where leaves lie
within reach of the eye; it gains a loop over eight uniform vectors within 90 m and one
mix of two. See "Cost" at the end.

**Not done.** Leaves do not gather against rocks, and "deeper in hollows" is only "not on
steep ground": the ground's shader has no measure of a hollow that is cheap. A lone tree
on open ground with no canopy in the land's map has its lying leaves as points but no
carpet painted under it.

## Piece 4: snow that comes and goes

**What was built.**
- The rule (`season.js`, "Snow that comes and goes"): the snow painted into the land's
  colour is the land's own, and is what lies on the first day of spring. Through the year
  the air is warmer or colder than on that day (10 degrees either way at 45 degrees and
  beyond, less toward the equator, the coldest and warmest a fortnight of the life's year
  after the solstices), and the snow follows as a line in height: new snow lies above the
  land's line + 400 m + the season's shift (in midwinter some 800 m below the land's own
  snow), and the land's own snow is gone below its line - 450 m + the shift (in summer
  only the highest ground keeps any). The two margins are why nothing changes on the
  opening morning. **Fresh snow**: where the day's weather has let snow fall in the last
  day and a half at the traveller's place it lies down to the height it fell to, and that
  line climbs again by the hour (`snowFell`; the app asks the weather one moment a frame).
- The shaders (`render/snowGlsl.js`, one text and two shared uniforms): the ground takes
  the land's own snow off where it is gone (the bare high ground under it) and lays new
  snow, its edge broken by a noise of the place, later on slopes turned toward the
  equator's sky and sooner off them in the thaw, none on steep ground or water; the canopy
  raised beyond the trees, the crowns near and far (what of them looks up), the boulders
  far and the stones near take it by the same text. Both halves of the world have their
  own season: from space the caps of one grow while the other's shrink.
- The grass lies flat under it (piece 5's uniform).

**Pictures**: `piece4_snow_<season>.png` (a range across the snow line), and from space.

**Not done.** The weather's model still has the Sun's season, not the life's (it is the sky
helper's file: see piece 1): it will let snow fall in the Sun's winter. Fresh snow's line is
one number for the whole view, asked at the traveller's place. Lakes do not freeze. Trees
and grass that the land's own snow keeps off (its class is "snow") do not come back when it
is gone in summer: the ground there is bare.

## Piece 5: grass and flowers by the season

**What was built.**
- `grassSeason` (fresh, dry, brown, beaten flat) goes into `grassColour` itself
  (`grassRules.js`), which the blades, the clumps and the ground painted as grass all call:
  fresh green from early spring, gold on top of the land's dryness in late summer, brown
  and beaten down (the blades 45 % shorter) through autumn and winter, flat under snow.
  On the first days of spring it is nothing: the grass is what the land's dryness says.
- **Flowers by kind in their weeks**: every kind has its days (`grassRules.js`, `DAYS`);
  `kindsShut` hands the shaders how far each is from being out. The single flowers come out
  and go one by one, the flowering blades and the ground's tint by the same share. All
  kinds are out by the first days of spring (the opening morning is unchanged), primrose
  and bluebell are over by early summer, lupin and cow parsley by high summer, fireweed,
  yarrow and thistle last into autumn; then the meadow is grass until late winter.
- Pollen by how much of the flowers is out.

**Pictures**: `piece5_meadow_<season>.png`.

**Not done.** The grass's season is the traveller's latitude's (the grass is only drawn
round the traveller), not each blade's height's.
