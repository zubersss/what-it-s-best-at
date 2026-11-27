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
  fall from their crowns, more in a gust, and 4 800 lie under and down the wind of them, as
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
- **The petals' carpet** in spring is painted by the same ground block (the petals' own
  slots, thinner), as the earlier report wished.
- The old box of 420 leaves in the wind stays for gales and for a traveller tearing past
  trees, and in autumn adds the leaves of the trees farther off; it now follows how fast
  the place's trees are shedding (it fell all winter from bare trees before).
- The governor's `leaves` step thins all of it to a third, as it did the petals.

**Pictures**: `haven_ledge_grove_ground_lateautumn.png` (the grove from the ground, late in
autumn: half the trees bare, their leaves under them and in the grass).

**Cost.** Points: 480 + 4 800 + 312 more, drawn only near such trees in their season. The
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
  the air is warmer or colder than on that day (10 degrees warmer in summer, 14 colder in winter, at 45 degrees and
  beyond, less toward the equator, the coldest and warmest a fortnight of the life's year
  after the solstices), and the snow follows as a line in height: new snow lies above the
  land's line + 400 m + the season's shift (in midwinter some 1 300 m below the land's own
  snow: the opening place, 1 400 m up, is at its edge), and the land's own snow is gone below its line - 725 m + the shift (in summer
  only the highest ground keeps any). The two margins are why nothing changes on the
  opening morning. **Fresh snow**: where the day's weather has let snow fall in the last
  day and a half at the traveller's place it lies down to the height it fell to, at most
  900 m below the season's line, and that line climbs again by the hour (`snowFell`,
  `snowDrop`; the app asks the weather one moment a frame). The limit is there because the
  weather's cold does not yet know the life's season: unlimited, the high ground was white
  all summer (the first summer picture was).
- The shaders (`render/snowGlsl.js`, one text and two shared uniforms): the ground takes
  the land's own snow off where it is gone (the bare high ground under it) and lays new
  snow, its edge broken by a noise of the place, later on slopes turned toward the
  equator's sky and sooner off them in the thaw, none on steep ground or water; the canopy
  raised beyond the trees, the crowns near and far (what of them looks up), the boulders
  far and the stones near take it by the same text. Both halves of the world have their
  own season: from space the caps of one grow while the other's shrink.
- The grass lies flat under it (piece 5's uniform).

**Pictures**: `haven_ledge_peak_<season>.png` and `piece4_peak_seasons.png` (a 3 700 m peak
23 km west of the opening place, from the air at 2 800 m); `haven_ledge_high_winter.png`,
`..._high_summer.png` and the pair with its difference, `high_summer_winter.png` (the
southern mountains from 150 km up, no clouds: winter's snow over the whole range, summer's
only as the thin lines of the highest crests). Pictures from 700 km were tried and thrown
away: the globe is small in the frame and under cloud.

**Known wrong.** Near by, the land's own painted snow is what it was before this work: its
white is held inside the ground's colour range, so in shade it is a pale grey-lilac, while
new snow is white (`piece4_peak_seasons.png`: the opening day against winter). I left it:
making it white changes the opening view's range. Say so and it is one line in the ground's
`[seasons]` block.

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

**Pictures**: `haven_ledge_<season>_final.png` and `piece5_opening_four_seasons.png` (the
opening view itself, from the ground, in its four seasons: every piece together), and
`haven_ledge_now_final.png` beside the reference `docs/shots/haven_ledge.png` (the opening
morning).

**Not done.** The grass's season is the traveller's latitude's (the grass is only drawn
round the traveller), not each blade's height's.

## Cost

**The ground's shading** (`scripts/ground-cost-run.sh`, software WebGL at the phone's pixel
count, `--dsf 2.2`: a count of work, never a frame rate), pieces 3 to 5 against the shader of
ffa98ac (piece 2), on the opening morning with no season switch:

| view | before | after | | picture against before |
|---|---|---|---|---|
| the opening view | 4 441 ms | 4 529 ms | 102 % | mean 0.08 levels, 0.16 % of pixels over 2 |
| in the north wood | 4 439 ms | 4 296 ms | 97 % | none |
| from 3 km up | 1 944 ms | 1 856 ms | 96 % | 0.86 % of pixels over 2 levels (see below) |
| all three | 10 823 ms | 10 681 ms | 99 % | |

So within what the tool can tell apart (its own runs differ by a few per cent). What runs
on the opening morning, where there is neither new snow nor a carpet: the snow block's test
of the map's paleness and one `asin` for each ground pixel that has the land's colour map
(its two noise reads only where the land is pale or within 700 m under the season's line,
2 150 m and up at the opening); the litter block where a wood's floor is near the eye
(leaves do lie on the first day of spring, a third of autumn's: the two detail reads the
old scatter had, and a loop over eight uniform vectors within 90 m).
**Governor steps** (`governor.js`, pinned in `sky-system-test`): `leaf-carpet` (the per-tree
loop off; the wood's scatter and the lying leaves stay) and `snow-edge` (the line's noise
off; the line stays, plain); the existing `leaves` step thins the falling, lying and kicked
leaves to a third. Neither new step has been measured on the phone.

**From 3 km the opening day did change, and should not have**: with the land's own snow
taken off below its line - 450 m, the lowest of the painted snow patches (the painted line
wanders 600 m by the patch) were bared on the very day they are for. The margin is 725 m
now (`SNOW.GONE_BELOW` 4.5 degrees).

**Uploads.** The lying leaves' buffer (4 800 leaves, 75 KB) went to the GPU whole at every
making of the trees' lists and on each of the 200 frames the leaves take to be laid (found
by the speed helper's count). Now the stretch laid that frame (384 bytes), nothing at rest,
nothing when the list is made again from the same anchor
(`node scripts/leaf-rest-test.mjs`).

**Not measured**: the trees' layers (`scripts/overdraw.mjs`): the shaders draw the same
cut-outs, fewer where a tree is losing leaves; the snow on crowns is one more varying.
The phone itself: a benchmark is the judge.


## The opening morning, before and after (no season switch)

`opening_ground_before_after.png` and `opening_300m_before_after.png`: the base this work
began from (901d9bb) above, this branch below, their difference times four under them
(`haven_ledge_now_before.png`, `haven_ledge_now_final.png`, `haven_ledge_300m_now_before.png`,
`haven_ledge_300m_now_after.png`). From the ground 3.9 % of the pixels differ by more than
8 levels, from 300 m 2.5 %.

What differs, by intent of the seasons:
- trees: the leafless aspens beyond 60 m are thin now as they are near by, and the trees'
  whole pictures take the day's colour (specks over the woods in the 300 m difference);
- the petals lying under the flowering cherries, laid all at once in a picture.

What differs and is not the seasons' (the after build also holds the base's later work,
merged on the way; the before build does not):
- the white sheet over the sea on the left (a fifth of the lower left of both pictures) is
  the sky's morning mist seen from the shore;
- two soft dark lens shapes on the pink mountain. They have a cloud shadow's soft edge, not
  the painted snow's; the season test holds the snow's numbers on this day to the land's
  own. I have not taken the picture that would prove whose they are (the same view with
  `debug=noclouds`): say if it is wanted.
- single pixels in the grass and flowers (the wind's phase and the speed helper's grass
  blocks).

Nothing else moved: the land's colours, the grass's gold, the firs, the sky.
