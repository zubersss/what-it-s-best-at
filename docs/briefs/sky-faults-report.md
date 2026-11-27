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

## Fault 2: a storm 64 km off is a pale ghost — IN PROGRESS (three causes found, three cures in)

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
`storm_30km_2_window.png` (cures 2 and 3), `view_storm.png` (all four; being taken).

**Not done**: the anvil is still a sheet of no thickness on the high shell, 9.6 km in radius
over a tower 4.4 km in radius: a plate over a column. Sky B's report said where the cure
belongs (the flare in the cell's own shape, `weather/sky/cellShape.js`, marched with it);
that is a rewrite of the cell's exact chords and is not begun.
