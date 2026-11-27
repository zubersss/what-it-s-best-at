# The sky's known faults: report (helper on `ccr-6f4f9272-sky-faults`, from 2026-11-27)

The brief: `docs/briefs/sky-faults.md`. Pictures: `docs/shots/sky-faults/`. Every picture is of
the default game (no `debug=` switch), from a frozen build, at the reference shape.

## Fault 1: the noon sky over the ranges is empty — CAUSE FOUND AND FIXED

**The cause, in a few lines.** Not the model, not its decoding, not the heights: the model
hands over heaps at noon (`node scripts/sky-above.mjs --t 4`: cloud carved over 18 % of the
120 km round the opening place), and the shared rule draws them. The fault was in how the
field's snapshots sit on the GPU (`src/sky/skyField.js`, `_take`). Three textures hold the
snapshots round the clock; a snapshot's texture was **its position in the list, numbered
again at every arrival**. The first snapshot of a pair was uploaded to texture 0; when the
second arrived it took number 0 and was uploaded over it, and the first, renumbered 1, was
from then on read from a texture nothing had ever been written to (all zeros). So the maps
every shader read were not `mix(older, newer, f)` but **`f x newer`**, f being the clock's
place between two snapshots (they are 120 s apart):

- at the start of every two minutes of the game's clock, f = 0: no cover of any kind, bases
  at sea level: **an empty sky**. Noon in the game (`?t=4`) is such a moment exactly, and so
  is every whole hour. That is the picture in the brief;
- in between, cover and base height both scaled by f: clouds at a fraction of their amount,
  their bases at a fraction of their height (down in the hills), rising and filling over two
  minutes and then gone again at a stroke. `?t=8.25` (the storm view) is f = 0.5: half the
  cover at half the height, and half the high cloud;
- it held in play as in pictures, forwards, backwards and after jumps.

Nothing in Node could see it (Node blends the snapshots' bytes themselves and has no
textures), and the stub's test pattern went the same way (its pictures were taken at hours
where f was not 0).

**The cure.** A snapshot keeps the texture it was uploaded to for as long as it is held (a
free one is given once, at arrival). And the one let go when a fourth arrives is the one
farthest in time from the newcomer, not always the oldest (running the clock backwards, the
oldest was the one just asked for, and its neighbour in the pair was dropped in its place).

**The check** (it fails without the cure: `--break reslot` puts the old numbering back and
three of its five checks fail): `node scripts/sky-slots-test.mjs`. The field is run in Node
with a renderer that only keeps count of which snapshot each texture was last written with
and which textures each blend read: forwards through 13 pairs, backwards through 13, and
after two jumps of the clock, every blend must read the pair's own two snapshots.

**Pictures** (noon, `?t=4`, 1 km over the opening place: `shot=ledge&alt=2513&t=4`):

| | before (afb87ee) | after |
|---|---|---|
| toward 200 degrees, level (the brief's view) | `noon_air_before.png` | `noon_air_after.png` |
| toward 30 degrees, 4 degrees up (where the model has most cloud) | `noon_ne_before.png` | `noon_ne_after.png` |

**What the "after" pictures show that is not yet right** (faults 5's business, now that the
true field is on screen for the first time): the camera at 1 km over the ledge is at the
heaps' base (2 393 m over the sea there), so the view is from just under a slab; the heaps
within the volume's reach are one beige mass with no lit top and no shade side, and toward
the north-east, where the cover is 0.5 to 1, the traveller is inside a grey deck. "Separate
heaps with wide gaps" is not what the rule cuts from a cover over 0.5.

**Cost.** None: the same uploads and the same blend, into the right textures.

**Tools added** (no browser, seconds): `node scripts/sky-scan.mjs --t 4` (the field's numbers
round a place at an hour of the game: heap, sheet, base, thickness, country, mid, high), and
`node scripts/sky-above.mjs --t 4 [--stub fair]` (the low cloud from straight above as the
game cuts it: the cover on the left, the carved cloud on the right). Both take the game's
hour (`?t=`) and work the weather's clock out themselves.

## Fault 3: the pale hard-edged disc in the front's view — GONE WITH FAULT 1

**The cause.** The front's hour (`?t=33`) is a whole hour, so by fault 1 the field the game
drew was empty: no deck, no veil of cloud at all, while the weather at the traveller (worked
out on the CPU, which was right) drew the rain and greyed the picture. What stood on the
skyline was the Sun itself (6.6 degrees up at azimuth 281, the view looks toward 280) through
a sky with no cloud in it and a rain veil over it. With the field as the model makes it, the
rain deck is there (base 2 043 m over the sea at the ledge, top 4 551 m) and the Sun is a warm
glow under and through it.

**Pictures.** Before: `docs/shots/sky/main-front_air-de185f9.png`. After, the same hour and
heading from 190 m over the ledge (`shot=front&alt=1700` on the build of fault 1):
`front_low_after_f1.png`; and the bookmark itself at its new place under fault 4.

Nothing was changed for this fault alone. (The anvil "disc on a stalk" of sky B's report is a
different thing and is under fault 2.)

## Fault 4: the weather views look into hillsides — MOVED, AND A FAULT FOUND ON THE WAY

**What was wrong with each** (sketched with `scripts/peek.mjs`: `docs/shots/sky-faults/peek_before.png`):

| view | was | what it looked at |
|---|---|---|
| mist (key 6) | the ledge, 240 degrees, 14 degrees down | the slope in front of the ledge; and on that morning the model has no mist within 30 km of the ledge over the real ground (see below) |
| storm (key 7) | the ledge, 243 degrees | a ridge across the lower half; the storm stands 64 km off, and on a world 250 km in radius that puts 8.2 km of a 10.3 km tower under the horizon |
| front (key 8) | the ledge, 280 degrees | a slope filling the right 40 % of the view |
| crown (key 9) | 9 km south of the Crown, looking north, 8 degrees up | a hillside |

**Where the weather really is** was asked of the model at the hour the game shows (new tools,
no browser: `scripts/sky-scan.mjs`, and the scratch scripts' findings below), then the place
by `scripts/find-overlook.mjs` (a new switch `--sky` scores a LOW far skyline, where the
default wants mountains in it) and a sketch by `scripts/peek.mjs`.

- **A bookmark may now be a view from the air**: `alt` (m over the sea) in a bookmark, as the
  URL's `alt` (`src/app.js applyBookmark`, generic; `peek.mjs --shot` honours it). Needed
  because the ground that looks at the mist and at the Crown is all wood (2 000 trees of 25 m
  within three blocks of every overlook the search found: `scripts/find-tree.mjs`), and
  because the storm must be seen from 30 km, where no ground looks at it.
- **mist**: the first place tried was the valley 35 km west-south-west of the opening place,
  where the model's fog top stands 80 m over "the ground": the picture showed a lake with no
  mist on it (`mist_lake_no_fog.png`). That ground is the lake's BED: the model's land is the
  elevation map, which holds lake beds, so in every hollow that is a lake the model's fog lies
  under the water. Asked again with the water's surface counted, the mist of that morning
  that lies over ground one can see is in a valley 75 km to the south-west (-58.84, 26.23:
  floor 325 m, the fog's top 470 m an hour after the Sun is up there, 58 km2 of it). The
  view is from the air 4.7 km east of it, the Sun behind. `timeOffsetHours` 0.75.
- **storm**: from the air 30 km north-north-east of the cell (-47.26, 32.06, 2 600 m),
  looking 208 degrees: the whole tower from its base to its top (13 degrees of it), the Sun
  95 degrees to the right (a lit side and a shade side), and no middle or high cloud overhead
  at that place and hour (the mackerel sky over the ledge lay in front of the tower).
- **front**: open ground 1.2 km west of the ledge at 1 623 m, 400 m under
  the deck's base, looking 264 degrees across a valley at the range the deck sits on.
- **crown**: from 14 km east-south-east of the Crown, its lee side (the wind is from the
  south-west at 19 m/s): cloud banked on the windward side and over the top (heap cover 0.8
  to 1.0 and a sheet of 1.0 west of the summit, clear air to the east).

| view | now (`src/worlds/haven.js`) | picture |
|---|---|---|
| mist | -58.5, 28.2, alt 1 500, 250 degrees, 11 down, `t` 0.75 | `view_mist.png` |
| storm | -47.26, 32.06, alt 2 600, 208 degrees, 6 up, fov 40, `t` 8.25 | `view_storm.png` |
| front | -48.5155, 48.6402 (ground, no tree within 37 m), 264 degrees, 9 up, `t` 33 | `view_front.png` |
| crown | 13.909, 71.951, alt 1 950, 297 degrees, 7 up, fov 50, `t` 53 | `view_crown.png` |

**Two faults found on the way: none of the model's fog was ever drawn, for two reasons.**
1. The fog sheet (`src/sky/fogSheet.js`) stood at `max(fog top, country)` and was drawn where
   the fog's top stood ABOVE the country, the ground smoothed over 15 km. The model puts fog
   in hollows: its top is the hollow's floor plus at most 0.4 of the hollow's depth, which is
   below the country by what a hollow is. So "fog over the country" was zero everywhere, on
   every morning (the stub's test pattern, which the sheet was built against, laid its fog
   over the country instead). Cure: the sheet lies at the fog's top itself, a level lake of
   mist, and the depth test cuts it against the real ground (as its own header always said it
   would); the top at a place is the mean over the field's texels that HAVE fog, each taken by
   itself, and the share of them fades the sheet out (a filtered read mixed a basin's top with
   the zero of the texel beside it, and the rim dived to the sea).
2. Its vertex shader could not be compiled: it used the eye's place (`uCamPlanetPos`) without
   declaring it (since abd2292, "The fog's lattice is the world's"). Nothing said so, because
   by (1) nothing ever asked for the sheet to be drawn, and the build does not compile
   shaders. The first picture with (1) cured failed on it (`shots.mjs` reports a shader that
   does not compile).
`scripts/fog-sheet-test.mjs` has both checks (the model's morning must make the sheet ready:
`--break country` puts the old question back and fails; the vertex shader declares what it
uses).

**What the model's mist is, said plainly**: thin, and partly under water. On the scene's
morning, within 80 km of the opening place, fog stands over the real surface (lakes counted
as their water) on 741 km2 of 25 600 at 06:30 and 587 km2 at 07:15, most of it far to the
south-west and along the south coast; none within 30 km of the opening place.
`find-weather --scene` says "mist 267 m deep in the low ground" round the ledge: it measures
against the model's own floor of each hollow (`gmin`), which for a lake is its bed. **Not
done, and a decision for whoever owns package A**: the model's land planes
(`public/data/haven_wxland_1024.u8`, `src/weather/sky/land.js`) should hold the water's
surface where there is a lake, so that mist lies ON lakes (as it does in the world) and not
under them; and its fog could be deeper. Both change the model's weather and its checks.

**Cost**: the fog sheet draws one sheet of 32 768 triangles when fog is in reach (it never
drew before, so this is new on mornings with fog: its governor step `fog-sheet` quarters it,
unchanged); 81 questions of the field every 60 s of the clock or 3 km flown in place of 25.
A bookmark's `alt` costs nothing.

## Fault 2: a storm 64 km off is a pale ghost — FOUR CAUSES, FOUR CURES; THE ANVIL NOT DONE

**The causes**, told apart in one browser session with `scripts/sky-probe.mjs` (the view loaded
once, a part switched off for each picture: `storm_probe_parts.png`, `storm_probe_nohaze.png`):

1. **The world is small.** 64 km off, the ground has dropped 8.2 km under the eye's level
   (d x d / 2R with R = 250 km): of a tower 10.3 km high only the top third stands over the
   far hills, 6 degrees of it under the horizon's own dip. No lighting makes a tower of that.
   The view was moved to 30 km (fault 4): 13 degrees of tower, base to top.
2. **The air.** With the haze switched off (`debug=nohaze`) the tower is there, solid and
   slate. With it, 60 km of Haven's air (as thick by the metre as Earth's, over a path that
   never leaves it) leaves a quarter of its green and a fifteenth of its blue: the tower is
   the horizon's own colour. Cure: a storm tower far off keeps `CELL_HAZE` (0.3) of the air's
   veil from 40 km, all of it within 8 km (`sky/cloudVolume.js`; the layer's own cloud and the
   land take the air whole).
3. **The middle and high cloud in front of it.** A mackerel sky 5 km up crosses every line of
   sight to a tower 30 km off, and the high shell's anvil lies over it: the storm was a column
   of cloudlets. Cure: the mid and high shells are thinned to a fifth on the lines of sight
   that go on into a tower's hull (`sky/upperClouds.js`, `WINDOW`), ending softly at its
   outline; not its own anvil.
4. **Its lit side.** The tower's light asked how much tower lies between a SAMPLE and the Sun;
   a few hundred metres under the surface that is already one or two kilometres, so a tower
   lit from the side had one thin lit edge. Cure: where the hull faces the Sun (its own
   outward direction, from the cell's shape) that length counts for a tenth, and a tower
   beyond the reach is marched in half again as many steps.

**Pictures** (`shot=storm`, 16:15, from 30 km): `storm_60km_ground.png` (the first try, from
open ground 60 km off: the top third over a ridge), `storm_30km_1_haze.png` (cure 2 alone),
`storm_30km_2_window.png` (cures 2 and 3), `view_storm.png` (all four: a sunlit right half, a
slate shade side, the anvil over it, heaps in front).

**Cost**: nothing on a day without a storm. With one: the tower's own steps beyond the reach
half again (12 for 8, on the few pixels its hull covers), one evaluation of the hull's own
direction a step inside a tower (arithmetic, no read), and in the mid and high shells one
chord test a cell (at most 8, arithmetic) on pixels that have cover.

**Not done**: the anvil is still a sheet of no thickness on the high shell, 9.6 km in radius
over a tower 4.4 km in radius: a plate over a column. Sky B's report said where the cure
belongs (the flare in the cell's own shape, `weather/sky/cellShape.js`, marched with it);
that is a rewrite of the cell's exact chords and is not begun.

## Fault 5: from high above the clouds are flat — THE HEAPS REDONE, THE MIDDLE LAYER FROM ABOVE; THE REST LISTED

The critic's words (`haven-rich-critic-2.md`, gap 2): at 3 km "one flat beige-khaki cloud
mass ... no sunlit top, no coloured shade side and no readable edge"; lower, cream cut-outs
in one tone and rows of dashes at the horizon. With fault 1 cured the true field was on
screen for the first time, and that is exactly what it was (`look_high_before.png`).

**What the pictures are made of** (asked before tuning anything, in Node and with the probe):

1. **The slab.** The model's heap cover reaches 0.9 to 1.0 in the middle of every field of
   heaps, and the rule cut the cloud at that cover: seen from above a cover of 0.6 was cloud
   over three quarters of the sky and 0.8 over all of it (the union of every level of a noise
   as deep as the layer: CLAUDE.md's lesson about a grey lid). A heap cover is not a lid; a
   lid is a SHEET, the field's other cover.
2. **The rows of dashes.** The noise the heaps are cut from repeats every 4.2 km on Haven
   (`clouds.volume.scale`). Cut from it alone a field of heaps was crumbs a kilometre wide
   standing in rows 4.2 km apart: `above_rows_before.png` (`node scripts/sky-above.mjs`,
   the low cloud from straight above, 60 km across).
3. **One tone.** A heap's shade side kept 0.64 of the Sun's light in the Sun's own colour, and
   the bright rim round the Sun (the forward lobe) was added to shade and light alike: looked
   at toward the Sun a heap was as bright on its shade side as on its lit side. Beige on
   beige.
4. **Flat far heaps.** Beyond the volume's reach (16 km) the layer was read once, at one
   height, on a sheet: a heap had no top, no side and no underside.
5. **The storm tower** (fault 2) and **the middle cloud seen from above** (below).

**What was changed** (all in the shared rule `sky/skyGlsl.js`, the march `sky/cloudVolume.js`,
the far shell `sky/clouds.js`, the look's numbers now in `sky/cloudLook.js`; the JS twins
changed with the GLSL, and the parity tests pass):

- **Heaps stay heaps** (`CLOUD_RULE.CARVE0/1`): the field's heap cover c is cut at
  k = 0.35 + 0.29 c (eased in from nothing below c = 0.12). Seen from straight above: cloud
  over 12 % of the sky at c = 0.3, 25 % at 0.6, 49 % at 1.0; the one-height reading (the
  shade atlas's, and the far shell's under `cloud-far`) is within 11 points of it (it was 45 %
  against 74 % at 0.6). Sheets are
  untouched: an overcast is still an overcast.
- **The great masses** (`MASS_K`, `MASS_W`): the field's cloud is cut from two readings of
  the noise, its own and one 3.2 times as coarse (repeating every 13.5 km, never in step with
  the first), 0.55 of the coarse one, stretched back to one reading's spread. Masses two to
  five kilometres across with lumps on them, and no rows: `above_masses_after.png`. The
  coarse reading does not rise, so the masses stand while their lumps boil up through them.
  One more read of the noise a step of the march (read once and handed to the look toward
  the Sun): 4 a step where it was 3, the plan's own limit.
- **Two tones** (`CLOUD_LOOK.SHADE` 0.42, `SHADE_TINT` lilac, `UNDER` 0.72): where the Sun
  strikes, its own warm white; the shade side 0.42 of it turned lilac, the flat underside a
  step darker again, and no forward glow in the shade. Decks keep their greys.
- **Far heaps have height** (`sky/clouds.js`): beyond the reach each line of sight is
  followed through the layer at three heights, the one the eye meets first first, each read
  where the sight line itself crosses that height; the first one met gives the tone (top,
  side or underside), with one look toward the Sun as the volume has. Clear sky now ends at
  one read of the field (it was three reads everywhere). Governor step **`cloud-far`**
  (after `pollen`, before `cloud-upper`; pinned in `scripts/sky-system-test.mjs`): one
  height again, flat, the same clouds in the same places.
- **Earth is as it was**: a world without a field keeps its own rule (`skyPlainAt`: the fine
  reading alone, cut at the cover itself), in the march and in the shell.
- **The middle layer from above** (`sky/upperClouds.js`): seen from above a veil of it thin
  enough to see through was a grey film on the country; from above only, it keeps its lumps'
  two tones and what is less than half there is cut to a clean edge. From below it is as it
  was.

**Pictures** (reference shape, the default game; `before` is fault 1's build, so the true
field under the old look):

| view | before | after |
|---|---|---|
| 3 km over the ledge at noon, toward the Sun, 12 down (`alt=4500&heading=30&pitch=-12&t=4`) | `look_high_before.png` | `look_high_after.png`, `look_high_after2.png` (the head) |
| 5.5 km over the ledge, 20 down, 14:00 (`alt=7000&heading=200&pitch=-20&t=6`) | `look_7k_before.png` | `look_7k_after.png` |
| 1.7 km over the ledge toward the afternoon Sun (`alt=3200&heading=300&pitch=2&t=6.5`) | `look_side_before.png` | `look_side_after.png` |
| the brief's noon view (`alt=2513&heading=200&t=4`) | `noon_air_after.png` (fault 1) | `look_noon_after.png` |

**The floor** (`?debug=floor`, every saving on): `look_high_floor.png`.

**Cost** (counts, never a frame rate):
- The march, `node scripts/cloud-cost.mjs --only reads` at the high view on both builds: **4
  reads a step** out of the rise's fade where it was 3 (6 for 5 in the fade), which is the
  plan's own limit and the tool's check; and cloud on **22 861 pixels of the small picture
  where it was 100 935** (separate heaps, not a slab): about a third of the reads at that
  view. A day of decks gains nothing and pays the one read more.
- The far shell: clear sky, one read of the field where it was one and two of the noise; a
  pixel with cloud, one read of the field and eight of the noise (three heights of two, and
  the look toward the Sun) where it was three in all. Governor step `cloud-far` (buys: a
  guess of 1.0 ms until the phone's cost table has it) takes it to two and one.
- The upper shells from above: no more reads (the two tones' second read was already made
  under a veil's edge; it is now made under all of a veil seen from above).
- **Not measured on the phone.** The owner's session should ask for a Haven benchmark in
  Sharp after merging this: the cost table's rows for `cloud-far`, `cloud-volume` and
  `cloud-steps` are the ones to read.

**Not done / known wrong** (in the order I would take them):
1. **Thin tall turrets** were reduced late, not ended (`CLOUD_RULE.TOP_LOW`: a dome's height is taken 0.6
   from the coarse reading; from the lumps' reading a dome stood a kilometre or two tall on a
   foot a few hundred metres wide: the white spike on the near heap in `crown_spike.png`, the
   comb at the left of `look_side_after.png`, which was taken before this). `view_crown.png`
   and `look_high_after2.png` are after it: the spike on the near heap is half as tall and
   still there, and the heaps' tops are broader and lower. The other `look_*_after` pictures
   and `view_storm.png`, `view_mist.png`, `view_front.png` were taken before this last change
   (builds f7 to f9 of the same day); the rule's tests pass on the head.
2. **The near heaps' outline is stepped** at the reference size (`look_noon_after.png`): the
   march's small picture is a quarter of the view each way and the clean cut is made from
   it. It was so before; a white heap on a blue sky shows it more than a beige one on beige.
3. **The anvil** is a sheet on the high shell (fault 2).
4. **The middle layer changes as one climbs through it**: its thin veils are cut away from
   above and kept from below. At the crossing the layer is edge on, but the far part of it
   changes as one rises through 5 km.
5. **The clouds' shadows on the ground from high above are faint**: the shade atlas has them
   (the forest under the big heap in `look_high_after.png` is darker), but the look lifts
   shade from the air (`look.aloft.lift`), which is the ground's shader and shared; not
   touched.
6. **The far heaps' tone from above at noon is white all over**: a top is lit, and from above
   one sees tops; the side and the underside show from beside and below. Not judged yet from
   a low Sun at 10 km and more.
7. **Not looked at in motion.** Every picture here is a standing camera. The rule changes
   are of the kind that cannot slide (no value hangs on the traveller; the three heights are
   read where the sight line crosses them, which is the same world point from anywhere), but
   `npm run stability` and a flight through the hand-over at 16 km have not been run on this
   build: this machine takes two hours for them and they were left for the main session.
8. **The model's fog under lakes** (fault 4) and its thinness.

## Checks

On the head of this branch: `node scripts/sky-slots-test.mjs`, `fog-sheet-test`,
`cloud-volume-test`, `cloud-shade-test`, `sky-system-test`, `sky-list-test`, `sky-steer-test`,
`sky-format-test`, `sky-cell-test`, `weather-test` and `./scripts/build-check.sh` pass.
`sky-model-test` passes when the machine is quiet (a snapshot in 534 ms against 600 allowed);
its timing check fails when a headless browser renders beside it on this machine's four cores
(625 ms), and the model's code is untouched (`git diff` over `src/weather` is empty).
Every picture run checked every shader
against a phone's limits (`scripts/shots.mjs`): none over. `npm run smoke` was not run.

New checks that fail when what they guard is broken: `sky-slots-test --break reslot`,
`fog-sheet-test --break country`.

SKY-FAULTS-DONE (2026-11-27): faults 1 to 4 cured as written above; fault 5's heaps and far
heaps redone and the list of what is left is under it. (Sent before I had read four notes from
the owner's session that were queued while I worked: what they asked is below.)

## After the brief: what the owner's session asked in its notes (2026-11-27, later)

### The mist must be mist, not a plate (`view_mist.png` was a flat white sheet with a ruler's edge)

**What the plate was made of**: one level sheet at the fog's top, as opaque at its rim as in
its middle (it knew nothing of the ground under it: where the ground rose through it the depth
test cut it, a hard line), lit by the Sun whether or not a mountain stood in the way.

**What it is now** (`src/sky/fogSheet.js`):
- **It knows the real surface under it.** Every point of its lattice (129 x 129 over 60 km,
  fixed to the world) asks the page's own height function once what stands there, water
  counted as its surface, and keeps it in a small texture (four bytes a point). The mist's
  depth at a place is its top less that: where a hollow is a lake whose water stands over the
  model's fog, there is none (the model's fog on lake beds is no longer drawn at all).
- **Thin at its edges, thick in its middle**: what it takes of the picture behind it goes by
  the length of mist on the line of sight (63 % in 55 m), so the shore and the water show
  through its rim and its middle is white. Seen from inside it, the same rule: looked up
  through, little; looked along, all of it. No ceiling over one who stands in it.
- **Feathered and broken**: its depth is thinned and thickened by lumps 900 m across that
  drift with the ground wind, and finer wisps take up to 16 m from it: the edge is where the
  ground rises through that, in tongues.
- **A soft top**: its vertices rise and fall with the same lumps, by up to a third of its
  depth (28 m at most).
- **The dawn's colour**: the land's own shadow on it is asked of the same height function (a
  short look toward the Sun from each point of the lattice, 32 points a frame); in a
  mountain's shadow it keeps 0.4 of the Sun's light and is cool, where the low Sun reaches it
  it is warm.
- **Mist lies on water.** The valley of the mist view is a LAKE in the game (the land's maker
  floods every pit; its surface is at 489 m, the model's fog top between 390 and 506 m across
  it: `scripts/sky-probe.mjs --print` asked the running game). The model knows the land's bed
  and not its water, so all but a rim of its mist was under the lake. Where the field has fog
  and the place is water, the mist now stands on the water: nothing at the shore, 34 m over
  water 30 m deep and more.
- **It asks again.** A lake's water reaches the page after its land does: a lattice asked once
  when the page began had the bed for ever (the first three pictures of this piece). The
  surface is asked again in strides through the lattice (32 points a frame); when one has
  changed by more than 2 m or has become water, all of it is asked again at the next frame.
- Checks (`scripts/fog-sheet-test.mjs`): the lattice holds the real surface under each point,
  a lake as its water; a step of the anchor moves what is known and asks only the new column
  (`--break noshift` fails it).

**Cost** (counts): drawn only while the field has fog within 27 km. Then: one sheet of 32 768
triangles (8 192 under the governor's `fog-sheet`), a vertex 4 fetches of the field, one of its
own land and one read of the noise, a pixel of mist 2 reads of the noise. The page's own work:
16 641 questions of the height function the first time fog comes within reach or after a jump
(17 ms on this machine, once; the land's shadow after it spread over 16 frames), 129 a lattice
step (469 m flown), and at most 32 x 6 a frame for the shadow (0.2 ms here). On the phone the
part `fog` of the benchmark's list measures it; it has never been measured (it never drew).

**Pictures**: `mist_plate_before.png` (as it was: a plate on the lake's rim), `mist_rim_only.png`
(feathered and lit by the dawn, still only the rim: the rest under the water),
`view_mist.png` (now: the bookmark, key 6), `mist_shore_blue.png` (eye height on the east
shore before the shade's light and before the mist lay on the water),
`mist_shore_after.png` (the same place now: the mist over the eye is a warm veil with soft
streaks; the water below the eye's level is clear, which is the limit named under it).

**Not done**: standing IN the mist, what lies below the eye's level is not veiled by it (the
sheet is over the eye there; the weather's own veil at the traveller goes by the model's fog
top, which knows nothing of the mist on the water): from the shore the sky is mist and the
water at one's feet is clear; its top's lumps are 469 m apart at the least (the lattice); the
model's fog under lakes is hidden, not moved onto the water (package A's land planes).

### What of the sky is paid every frame, and what was cut

**Found**: the benchmark's row "everything out" hid the four scenes and left every pass the
sky makes into targets of its own running: the field's three blends, the shade map's two
windows and its world strip, the probe (a pass, a read back, a fence and a flush), the march,
its smoothing pass and its gathered pass, and inside the picture six full-screen layers, the
upper shells and the far shell. That is the 13 to 28 ms the eleventh results showed with
"nothing drawn" (the speed helper's GL counts say the same: 8 of the frame's 23 passes).

**The benchmark can now leave each out** (`sky/skySystem.js SKY_PARTS`, `perf/benchmark.js`):
`cloud-march` (the volume: march, two small passes, six layers), `cloud-shell` (the far low
cloud), `sky-field` (the field's uploads and blend), `sky-all` (every pass of the sky), beside
the seven it had; and **"everything" now takes the sky out too**, so that row is again what
measuring costs.

**Cut, with no change to the picture**:
1. **No march under a clear sky.** With no low cloud within the volume's reach (49 places of
   the field, asked every 800 m or 20 s) and no storm cell in the shaders, the march, its two
   small passes and the six layers laid from it are not made at all (they drew nothing, at
   about 1.1 MP of march, as many of smoothing and 13.5 MP of blending on the phone by the
   speed helper's count). The governor's `cloud-steps` and `cloud-volume` are then not live.
   The opening morning is such a sky.
2. **The shade map's two windows only when their picture can have changed**: their lattice has
   stepped, the Sun has moved, or 8 (near) and 24 (middle) frames have gone by for the clouds'
   drift (fewer as the clock runs faster). Standing or walking: 30 and 10 draws in 240 frames
   where there were 240 and 240 (`node scripts/sky-turns-test.mjs`; `--break always` fails).
   Flying 80 m a frame they are drawn every frame, as before.
3. **The probe every fourth frame** in play (its value was eased over frames already).
4. **The field's blend in turns**: one of its three maps a frame, not all three.

**Not cut, and why**: the six layers when there IS cloud near (a layer with nothing in it is
still a full-screen pass: the page cannot know which slices are empty without reading the
march back); the upper shells and the far shell over clear sky (one read of the field a pixel
and a discard; their triangles are 43 600 and 48 000); the passes that begin without a whole
clear (the speed helper's finding: `invalidateFramebuffer` before the partial clears of the
field's, the shade map's and the march's targets is the next thing to try, in `src/sky/`).
None of this is measured on the phone.

### The first morning's sky

At the opening hour the model has no heaps within 30 km, a mackerel sky (middle cloud 0.3) over
the western half and a bank of stratus 15 to 20 km to the north-west: not a lid.
`open_ledge_after.png` is the opening view on this head (`shot=ledge`, nothing else in the
URL): the mackerel sky with blue between, and mist on the lake down in the valley, which the
first morning never had (its lake's mist was under the water). The reference set's
`docs/shots/haven_ledge.png` is the same view before all of this.

## Second list (the owner's session, 2026-11-27 09:45 and 12:10)

**(1) The mist**: done above ("The mist must be mist"); `HELD` in `fogSheet.js` is false (the
owner's session released it on seeing `view_mist.png`). From the shore: `mist_shore_after.png`
showed what "below eye level is not veiled" looks like: a warm lid of mist from the horizon up
and a clear, dark blue lake under it. That is wrong enough to hold: **the sheet is now seen from
above and from its own top only; it fades out as the eye sinks under it and is gone 24 m below
its top** (`FOG_LOOK.UNDER`), so one who stands in the mist sees the place without it rather
than a lid. The cure proper is the weather's veil at the traveller (`weather.js`), which goes
by the model's fog top and knows nothing of the mist on the water. `mist_shore_held.png`.

**(2) Cost.**
- *The passes that begin without a whole clear.* The march's three targets (the small picture,
  its smoothed copy, the gathered one) keep nothing from frame to frame and are cleared in
  part: each is now invalidated when it is bound (`cloudVolume._drop`,
  `gl.invalidateFramebuffer`). The field's three maps and the shade atlas KEEP their picture
  between frames (strips, windows), so they cannot be invalidated: they are bound less
  instead. The field: one map a frame (was three). The shade atlas: not bound at all on a
  frame with nothing to draw into it (standing still, 40 frames of 64; it was bound on
  every one), its world strip every fourth frame, its windows as above
  (`scripts/sky-turns-test.mjs`).
- *What each sky pass draws every frame, and where* (sizes at the phone's 2.25 MP from the
  speed helper's counts, the rest read from the code): the field's blend, one triangle into
  1024 x 512 (or 512 x 256), a sixteenth of its rows; the shade atlas, when bound, up to
  131 000 texels of 4 to 6 reads (two windows) and 32 768 of the world strip; the probe, 3
  texels and a read back, every fourth frame; the march, a quarter of the picture each way
  times six slices (eight with a storm far off), its smoothing pass as many, the gathered
  pass one slice's size at five looks; six full-screen layers; the upper shells 43 600
  triangles, the far shell 48 000, the fog 32 768 when fog is in reach. Under a clear sky
  with no storm the march, its two passes and the six layers are not made.
- *The march, before against now* (`scripts/cloud-cost.mjs --only reads`, both builds):
  **from 3 km** (`alt=4500&heading=30&pitch=-12&t=4`): 3 reads a step on 100 935 pixels of
  the small picture before, 4 a step on 22 861 now: about three tenths of the reads.
  **At the opening view**: the sky within reach is clear at that hour, so the march was made
  and drew nothing before, and is not made now: nothing against one whole march, one
  smoothing pass and six layers. Its governor steps (`cloud-steps`, `cloud-volume`) work as
  they did and are passed by when there is nothing to march.
- *Each part in the benchmark's list*: see "What of the sky is paid every frame" above.

**(3) The stepped outline.** The march's small picture is a quarter of the picture each way at
any resolution, so the steps are four pixels of the picture on the phone as in the reference
pictures (a fifth of a millimetre there). They came from the number the clean edge is cut by:
all the cloud along the line of sight, taken at one place of the small picture, with the
march's grain in it. It is now the weighted mean of five looks (the place and a small pixel
to each side), made in the gathered pass where a pixel is sixteen of the main picture's:
`look_noon_edge_after.png` against `look_noon_after.png`.

**(4) Not done**: the anvil (a flare in the cell's own shape, `cellShape.js`: its exact chords
would be rewritten) and the three frames a camera step apart from 1 km and from the ground.
The second is `npm run stability`'s way and takes this machine about two hours; it should be
run on the merged head by whoever has the machine free, with the clouds' hand-over at 16 km
and a heap's edge in view.

## Third list (the owner's session, 2026-11-27 12:54)

**(1) The veil for mist that stands on water** (`mist_shore_veil.png` against
`mist_shore_after.png`). The fog sheet works out how much mist stands over the eye by the very
rule it is laid by (the field's fog top at the eye, or the water's surface and the mist on it)
and hands the sky system the air's own veil for it (`fogSheet.eyeVeil`, 0.0045 a metre with
14 m of mist overhead: one sees some 250 m), which goes into what every lit thing reads beside
the rain's (`uWeather.w`, `sky/skySystem.js`; not in `weather.js`, which does not know the
sheet: one rule, one writer). Eased on and off. The sheet is seen from inside again (the
second list's fade is taken out): it is the mist over the eye, the veil is the mist in front
of it. From the shore: pale water going into the veil, no horizon. The veil's colour is the
rain veil's (the sky's light), a little cooler than the sheet above the horizon.

**(5) The weather's season is the life's** (`weather/sky/model.js seasonOf`): where the world
keeps a year of its own (the world file's `year`, handed to the producer and its worker as
`opts.year` by `sky/skyField.js`), the model's `season` is `northSummer(lifeDay(...))` of
`life/season.js` instead of the Sun's declination / 23.44. It moves the systems' tracks, the
tropical line and the temperature (so rain against snow); the Sun's height and the day's
length stay the Sun's. For the seasons helper: `at().temp` and `at().snow` are now in the
life's season, so fresh snow needs no 900 m limit against the season's line on that account;
the place to take it out is where that limit is applied (`snowFell` in `life/season.js`, its
caller in `src/app.js`), which is not mine and is not touched. On the scene's own day the two
seasons agree (life day 265 is the equinox), so the opening day's weather is as it was; the
front's and the Crown's days are 0.2 and 0.3 of a season cooler in the north (checked: the
storm, the front's deck and the Crown's bank are where their views look). The scripts that
build the model pass the year too (`sky-scan`, `find-weather`, `sky-model-test`). One limit of
`sky-model-test` was moved from 0.25 to 0.3 and the reason is written beside it (the worst
single texel's change on its chosen calm day; on other days it is 0.4 to 1.0 with either
season).

**(2) The clouds in motion.** In Node (`node scripts/sky-boil-test.mjs`; `--break slide`
fails): the two readings of the noise are in one frame, so sideways the masses and their lumps
go together; upward the lumps rise through the masses at the steering's 0.5 m/s. In 60 s of
the clock at most 5.3 % of a heap's cloud appears or goes in its own frame (cover 0.5; 3.8 %
at full cover): heaps drift whole, their lumps creeping. In the game, `npm run stability`'s
way, two new moves (`haven_heaps_air`, `haven_heaps_ground`): results below when in.

**(2), in the game** (`node scripts/stability.mjs --only haven_heaps_air` and
`haven_heaps_ground`, settled frames one camera step apart, on the build of this list):
- from 3 km among the heaps at noon, two stations (`motion_heaps_air_0.png`, `_1.png`):
  0.11 % and 0.10 % of the pixels change between frames, flicker 0.001 % and 0.003 %. The
  difference picture is thin lines along the heaps' edges (the camera's own step) and one
  small speckled patch inside a near heap at the bottom right of station 0 (the march's
  grain where the eye is close to cloud). Nothing pops.
- from the ground under heaps at noon, one station (`motion_heaps_ground_0.png`; the run said
  "not ready in time" and took what was on screen): 39 % changed and 7.8 % flicker, ALL of
  it in the grass, which waves; the sky's part of the difference picture is black. The
  heaps overhead are steady, white on top and lilac underneath.
- not run: `--streaming` (pops while ground arrives), the hand-over at 16 km in a long
  flight, the shade map's new turns seen on the ground while walking, the mist's veil coming
  on as one walks into it.

**(3)** was cured under the second list. **(4) The anvil: not done.**

SKY-SECOND-DONE (2026-11-27), with the anvil left.
