# Haven's sky: clouds and weather (the plan, 2026-11-25)

The owner, with the tenth phone results: "the clouds need a lot of work still: I want them to move like real clouds and be around areas where real clouds will most likely be found, like near the mountains; they should also have multiple different kinds of clouds like in real life, from high altitude ones to low storm-carrying dark clouds; they should move with the wind at different speeds based on the wind speed on a certain day; they should also have actual rain coming out of them when it's time to rain; the thunder clouds should be much darker and stormy looking, with lightning and thunder."

Made by the workflow `clouds-shadows-understand-design`: two readers mapped the clouds and the weather as they are (their maps are at the end), three designers each from an angle (weather first, look first, phone first), and a judge wrote this one plan from them. Each helper builds one work package from this file.

## Haven's sky: each day's weather made by rule, with nine kinds of cloud that move with the wind at their own height, storms that travel, rain, go dark and strike, and one world-fixed cloud-shade map that pays for it

SPINE AND GRAFTS
The spine is the weather-first design:
- a deterministic model of each day, in pure JavaScript, run in a worker;
- snapshots of the whole sky as the one hand-over: the GPU's textures and the CPU's at() decode the same bytes;
- a cloud-shade map fixed to the world, read by everything that is lit;
- a step-0 contract before any helper starts.
Grafted from look-first: each cloud layer's wind is a rigid turning of the whole sky, worked out in closed form from the game clock; the painted storm tones; days the world file can pin; lightning drawn as ribbons.
Grafted from phone-first:
- storm cells as exact shapes, marched by the same function near and far;
- a march that reads at most 4 textures a step, because the fair-weather rule moves into the field;
- a fog sheet mesh and lens meshes;
- a GPU probe read back for the character;
- the 'clouds' saving becomes coarser shadows instead of none;
- the main session keeps app.js, governor.js and benchmark.js.

WHAT THE OWNER WILL SEE
Every day on Haven has its own weather. Only the date, the hour and the place decide it, so it is the same on every run: calm days, breezy days, gales.
- Mornings: white mist lies in the basins below the ledge and burns off.
- From mid-morning: heaps form first over the high ground and the sunny slopes, then line up in rows downwind. They drift at that day's speed in the direction the trees bend, and their shadows slide the same way. Peaks wear caps that stay put while the wind streams through them. The lee clears. The sea stays mostly clear by day.
- Unstable afternoons: some heaps over the ranges tower into storms. Each has a white tower, a flat anvil blown downwind, a slate-indigo base and a grey shaft of rain slanting to the ground. Flashes show inside, strokes reach the ground, and thunder follows after its delay. Flying under one: a dark sky, dark wet land, rain round the traveller, cracks of thunder.
- High cirrus races faster than the heaps and often on another heading.
- A front arrives in order: cirrus, then a grey veil that turns the Sun into a pale disc, then a low grey deck with steady rain.
- Nothing in the sky moves because the traveller moved. Pausing the clock stops the clouds; running it fast time-lapses them.

THE SEVEN PARTS
1. The model (src/weather/sky/, worker plus Node). It decides each place's weather:
   - steering winds for three layers;
   - lows, fronts and highs that travel;
   - humidity with its source over the sea and a dry lee behind ranges;
   - lift on windward slopes;
   - afternoon heating, strongest on proud high ground;
   - fog in basins on calm clear nights;
   - storm cells born at trigger sites, which grow, rain, strike and die;
   - wet ground from the last hours of rain;
   - the ground wind.
2. The field. Every 2 game minutes the worker writes a snapshot of the whole world: two RGBA8 maps of 1024 × 512 (1.5 km a cell) and one small map, plus the cell list. They are uploaded in strips between frames and blended on the GPU. On the CPU, at() decodes the same bytes, so the GPU and the CPU read one writer.
3. Motion. Each layer (low 1.5 km, mid 5 km, high 9 km) has a steering motion M(t): a rigid turning of the whole sky, a closed-form function of the game clock. Its wind is defined as the velocity of that motion. The noise, the travelling systems, the cells and the base of the ground wind therefore agree by construction. A Node replay (scratchpad cloudwf/steer.mjs) shows:
   - 0.5 to 13 m/s at the opening place over 20 days (median 4.6);
   - no vertical part;
   - closed form against a 30 fps frame-by-frame sum: 3 cm apart over 38.8 km in an hour.
4. Nine kinds, each drawn the cheapest way that still reads:
   - heaps, caps, decks and rain decks: the existing volume, reading the field;
   - storm cells: exact shapes marched in the near slices and in two far slices;
   - mid and high layers: two painted shells;
   - valley fog: a sheet whose height is the fog's top;
   - lenticulars: lens meshes.
5. Shade. One cloud-shade map, fixed to the world, is read by the ground, trees, far forest, grass and rocks. The character and the things near it get the same value through a 3-texel probe read back from the GPU. Every shadow agrees, none slides when the traveller moves, and it should cost 2 to 4 ms less than today's 2.7 to 5.5 ms of cloud shadows. That saving pays for the storms.
6. Rain falls out of clouds: shafts marched below raining bases, near and far; the streaks and veil at the eye only where the cloud overhead rains; wet ground per place.
7. Storms are dark and alive:
   - an exact chord toward the Sun through each tower;
   - a slate tint and scud;
   - the meter holds the dark, and a storm grade is blended in;
   - deterministic strokes drawn as ribbons that read without bloom;
   - flashes light their cell from inside;
   - thunder arrives at distance ÷ 343 m/s.

CORRECTIONS TO THE THREE DESIGNS, AGAINST THE CHARTER'S LESSONS
- Weather-first's flow-map drift (offset = local wind × time since the phase began) is speed × clock in form. It costs a wind read, plus a second noise read during crossfades, and can 'breathe'. Phone-first's rotation is set by the wind at the traveller's place, which breaks 'nothing may hang on where the traveller stands'. Both are replaced by the steering motions: an exact integral of the wind, equal to the frame-by-frame sum, needing no read, and running whether or not the volume is drawn.
- Weather-first lays the upper layers at the far plane, which would put a storm tower in front of the mid layer that should veil it. The upper kinds become shells at their true height instead, cut where a tower passes through.
- A far slice laid at its starting distance would paint a storm 35 km off over a ridge 20 km off. The far slices instead write their cloud's own distance as the fragment's depth, and the depth of their solid core. Nothing reads the picture's depth.
- Look-first adds a sampler to every lit material, which risks the phone's 16 textures. The figure, the near rocks (all within 30 m), the lander, the leaves and the dust instead take the shade at their place from the probe: one writer.
- Look-first holds exposure against 'the exposure last held in clear weather', which depends on the path flown. Instead, the meter makes up only part of the darkness given by the overcast at the traveller. The shade at the traveller's feet does not count: a heap's shadow must not dim the frame.
- The cell's shape is needed in GLSL (drawing) and in JS (wet ground, anvils, rain at the eye). It is written once, in cellShape.js, and both forms are generated from it, with a parity test.
- Cells must not appear because the traveller came near. The model never lets more than 8 cells live within 200 km of any place, and the draw list holds every cell whose top can stand above the traveller's horizon.
- weather.js's '111 200 m a degree' and its Math.random go; the temperature model comes from the world file.
- Every governor step thins. At the floor a storm keeps its tower, darkness, shaft, shadows, rain, strokes and thunder.

STEP 0, BY THE MAIN SESSION BEFORE ANY HELPER STARTS
The game still looks as it does today, except that the drift is fixed. Step 0 delivers:
- src/weather/sky/format.js: the snapshot's layout and encodings, with the JS decoders and the GLSL decoder strings made from the same constants;
- src/weather/sky/steer.js: the steering motions, complete, with its test (cloudwf/drift.mjs ported: it fails on today's code);
- src/weather/sky/cellShape.js: the cell's footprint and profile, as a JS function and a generated GLSL string;
- src/weather/sky/stub.js: a test-pattern producer with the final API (snapshot(t), at(), cells(t), strikes(t0, t1)) and presets fair, fog, storm and front;
- src/sky/skyGlsl.js version 0;
- src/sky/skySystem.js: the frame order, moved out of app.js lines 1176–1195 and 1356–1400, calling every package's module through fixed interfaces;
- the governor steps, wired to stub setters;
- benchmark cost views that carry an hour, and the PARTS_OUT ids;
- __shotReady waiting on field.busy and the probe;
- the debug switches: debug=sky:<preset>, debug=storm, debug=flash on Haven, and debug=noclouds removing all of it;
- four briefs in docs/briefs/ (sky-A-model.md, sky-B-clouds.md, sky-C-shade.md, sky-D-storm.md), with a report to be written beside each.
(Built on the branch sky0/join: `docs/briefs/sky-step0.md` says what stands, the names that differ from this plan's among it, and what is left; the four briefs and their reports are beside it.)
Helpers start from the session branch head. Branches merge as soon as they build, and the others merge them in. The main session alone edits app.js, skySystem.js, governor.js, benchmark.js and the charter, and moves the look numbers that B and D report into src/worlds/haven.js.

OUT OF SCOPE HERE
The jumps of the Sun's shadow maps, and the governor's hunting, belong to docs/briefs/shadows-governor-10.md (trees.js, treeLod.js, nearShadow.js, rocks.js, governor.js). This plan fixes the clouds' share of 'jumpy shadows':
- the base that followed the traveller;
- the tree-shade map that slid with the traveller;
- the figure and near things left in full Sun inside a cloud's shadow.

BEHAVIOUR CHANGES TO LIST AT THE CHECKPOINT
- Clouds run on the game clock: paused with P, time-lapsed with '.'.
- Clouds move downwind on Earth too.
- Haven's wind changes by day and place: calm days lie flat; on gales the sea whitecaps and leaves tear off; a hovering figure drifts with the wind when the stick is released.
- The 'clouds' saving keeps the shadows, coarser.
- Haven no longer uses haven_clouds_4096.jpg (the file stays on disk).
- The opening morning has mist in the basin below the ledge.
- The character and near things are now shaded by clouds.

## The kinds of cloud

### Fair-weather heaps (cumulus humilis and mediocris)

**Height.** The base is a field of the place and never follows the traveller:
- base = max(country height smoothed over 15 km + condensation level, ground smoothed over 5 km + 600 m);
- the condensation level is 400 + 1 600·(1 − humidity) + 400·afternoon heating m over land, and 300 + 900·(1 − humidity) m over the sea.
That puts bases 0.8–2.4 km over the country: about 2.3–2.9 km above the sea at the opening place, against 2 618 m today.
Tops: base + (600 + 2 400·cover)·dome (today's dome rule), so 0.6–3 km deep.

**Where and when.** Over land, on days with humidity over 0.45.
- Start: about 2 h after sunrise (when the Sun's height 2 h earlier passes 6°).
- First over peaks standing proud of their country, over slopes facing the Sun, and where the wind blows upslope.
- Most numerous from 13 to 16 h local; gone an hour after sunset.
- Two to three times more over ground above 2 km than over lowland.
- In rows 0–12 km downwind of where they form (cloud streets) on windy days.
- Thinned in a range's dry lee and under highs.
- Few over the sea by day; a thin field over it at night.
- Grouped in clusters 10–40 km across: today's fair-weather field and clusters, now carried by the low wind.

**Look.** The painter's heap: hard white tops in the Sun's tone (1.0), a cool lilac-grey shade side (0.64), flat grey bases, clean edges, a dome over the middle. They drift downwind at the day's low-level speed (0.5–14 m/s) and grow and fade in place. Their crisp shadows slide over the land the way the trees bend.

**How drawn.** Near, to 16 km: the volume march. Cover comes from field A.R and the base from A.B. The 64³ noise carves it, read at M_low(t)⁻¹·p/scale − up·rise(t), with a rise of 0.5 m/s in place of today's 'change' term.
Beyond 16 km: the far shell, its vertices pushed to the place's base + 0.3 × the layer's depth.
Shadows: the cloud-shade map.

### Cap, banner and upslope cloud (orographic)

**Height.** Caps: on summits standing 600 m or more over their 15-km country; base at the summit − 300 m; 1–2 km deep.
Upslope cloud: down to 400 m under the sheet base on windward slopes.

**Where and when.** - Where the low wind blows up a slope on moist days, at any hour. The lift is v_low · ∇(ground smoothed over 4 km), and it must exceed 0.4 m/s.
- Caps where humidity is over 0.5 and the crest wind over 8 m/s.
- They stand still over the land: the cover belongs to the mountain while the noise streams through it. So they form on the windward edge and fray off the lee.
- The lee, for 10–20 km, loses up to 80 % of its cover.
- On unstable days, caps grow into towering heaps by early afternoon and set off cells.

**Look.** White hoods on the peaks, smooth upwind and torn downwind. On wet days the windward flank is lost in a grey-white bank with drizzle, while the lee valley is in sun. From 5 km: summits standing through white banks.

**How drawn.** Terms in the model's heap and sheet cover (fields A.R, A.G, base A.B), drawn by the volume and the far shell like other low cloud. Within the volume, a cap whose base is under the rock is drawn over the summit's top only to within a slice: the ground hides it beyond.

### Towering heaps growing into thunderstorms (cumulus congestus to cumulonimbus with an anvil)

**Height.** Base: the heaps' base at the cell's place.
Top: 6.5–11 km above the sea when mature (8 000 + 3 000·instability), rising while it grows, with an overshooting dome 500 m higher.
Anvil: at 8.5–9.5 km, 8–20 km across, blown 10–30 km downwind by the high wind.

**Where and when.** Separate cells, born at trigger sites:
- peaks standing 250 m or more over their 15-km country, at least 5 km apart (the readers' replay counted 8 within 30 km of the opening place);
- points on the sea-breeze line 12 km inland;
- points along cold fronts.
Birth:
- Each site may fire once per 30 game minutes, decided by hash(seed, site, slot).
- The chance is smoothstep(0.45, 0.85, instability) × 0.35, and 1.6 times that over heated or windward high ground.
- Over land, from 13 to 19 h local; on fronts, at any hour.
- No birth within 40 km of a live cell, and never more than 8 alive within 200 km of any place.
Life: grows for 20 min, is mature for 25–40 min, decays for 30 min. Its anvil lingers 40 min as cirrus.
Motion: with the steering halfway between the low and mid layers (M_cell).
Targets: a cell able to make lightning within 40 km of the Crown on 20–40 % of afternoons; on the scene day, one in view of the ledge from 14 to 18 h.

**Look.** - A brilliant white cauliflower tower that rises visibly while it grows: its noise boils at 3–8 m/s.
- A flat anvil with a dark underside.
- A slate-indigo base at 0.08–0.15 of the lit top's light: coloured shade, never black, nearly black-indigo under the core.
- Ragged scud below it, and a grey-blue rain shaft slanting downwind to the ground.
- Flashes inside, lighting it at dusk, and at night from 80 km away.
- Held dark against the exposure meter.

**How drawn.** An exact shape from the cell list: up to 8 cells as shader numbers (centre, radius, base, top, stage, tilt, age). It is a dome tower leaning with the shear, eroded by the noise in the cell's own moving frame.
- The same function is marched in the near slices (0–16 km) and in two far slices (16–40 km and 40–200 km), so the hand-over at 16 km cannot pop.
- The far slices are laid with the cloud's own distance as the fragment's depth, so ridges in front of them hide them. They also write depth where the core is nearly opaque.
- Anvil: drawn by the high shell, from field B.G, which the model paints with the shared cell shape.
- Sunlight inside: an exact chord toward the Sun through the tower.
- Shadow: an exact chord in the shade pass.

### Stratocumulus and stratus deck

**Height.** Base 300–1 200 m over the country (field A.B; the same rule with a lower condensation level). 300–1 200 m thick (A.A), with a flat base and a lumpy, rolled top.

**Where and when.** In moist, stable air:
- over the sea and along coasts under highs;
- in the warm sector;
- at night and in mornings after rain;
- in onshore flow;
- banked against windward slopes when humidity is over 0.8.
Over land it breaks into heaps by late morning, as heating lifts the base; over the sea it lasts.

**Look.** From below: a grey-white quilted sheet with brighter gaps, at 0.5–0.7 of a lit heap. From above: a white rolling floor lit in two tones, with peaks standing out of it in sunlight.

**How drawn.** The volume's sheet profile (a flat base, the top cut by the noise squashed three times vertically), from A.G and A.A; the far shell beyond 16 km. In the shade map, the low-top channel (A) keeps peaks that stand above the deck in sunlight.

### Rain deck (nimbostratus) with scud

**Height.** Base 400–1 000 m over the country. Top = base + 400 + 4 500·smoothstep(1, 6, rain in mm/h), up to 5–6 km, merging into altostratus.

**Where and when.** - In the 20 km ahead of a warm front, round a low's centre and along an occlusion.
- Banked against windward ranges in moist flow.
- Steady rain of 1–8 mm/h for hours, heavier upslope.

**Look.** A dark, almost featureless grey-blue ceiling at 0.3–0.4 of a white cloud's light, darker underneath. Scud races below it with the low wind. Rain curtains and the veil fade the distance, and the ground is wet.

**How drawn.** The sheet profile, thickened from A.A, with sunlight exp(−τ) through the cloud above it (close to nothing). Scud comes from the existing near-wisp noise and the fine noise channel, 100–400 m under the base where rain exceeds 1 mm/h, at no extra read. Rain below the base: marched shafts from field B.B.

### Valley fog and sea fog

**Height.** Valley fog: from the valley floor to a flat top 60–400 m above it (0.4 × the basin's depth below its 15-km country). Sea fog: 100–300 m over the sea. The top is field C.R, in metres above the sea.

**Where and when.** - Valley fog: on calm nights (ground wind under 3 m/s) that are humid (over 0.7) and clear, in basins, valleys and over lakes. Thickest at dawn; burns off from the edges 1–3.5 h after sunrise, lifting into stratus and then heaps.
- Sea fog: on some calm days, by a hash of the day, lasting into the afternoon.
- On the scene morning it fills the basin below the ledge and never reaches the ledge. A test checks it: the opening place stands 300 m or more above every fog top within 2 km.

**Look.** White lakes of mist between dark ridges, their tops gilded in the painter's two tones by the low Sun. Inside: grey and close, with 150–500 m to see.

**How drawn.** src/sky/fogSheet.js: a 129 × 129 grid over 60 km on a lattice fixed to the world.
- Each vertex is lifted to the fog top from field C in the vertex shader.
- Alpha = smoothstep(0, 40 m, top − country height); one noise read gives soft lumps.
- Depth-tested, so ridges cut it crisply.
- From inside: the veil (uWeather.w), from at().
- Its shade on things inside it: the shade map.

### Mid-level patches and veil (altocumulus and altostratus)

**Height.** One layer at 5 000 m above the sea: 700 m over the highest peak, so it need not follow the land. It fades out within ±400 m of the camera's own height.

**Where and when.** - Altostratus 10–45 km ahead of warm fronts, thickening toward the front.
- Altocumulus in the warm sector, ahead of cold fronts, where the air aloft is moist on fair days, and as the evening remains of storms.
- Capped at 0.35 cover except ahead of fronts.
- It moves with the mid steering (1.9 × the low speed + 4 m/s), so it overtakes the heaps.

**Look.** Thin: rows of small rounded cloudlets 300–700 m across (the noise's small cells), each with a lit and a shaded side: a mackerel sky. Thick: a grey-white veil with the Sun a pale disc behind it, and shadows going soft. It catches sunrise and sunset colour.

**How drawn.** The mid shell in src/sky/upperClouds.js: one icosphere draw at R + 5 000 m, depth-tested.
- Cover from field B.R; cloudlets from the noise read in 2-D through M_mid⁻¹.
- 3 reads where it is covered; 1 read and a discard where it is clear.
- Cut where a tower passes through it.
- It takes up to half the Sun (shade map channel G).

### High cloud: cirrus, cirrostratus and anvils

**Height.** One layer at 9 000 m above the sea. The anvils of live cells stand at the same height.

**Where and when.** - The first sign of a low: 40–110 km ahead of its warm front, cirrus at the far edge and cirrostratus nearer.
- Streaks along the jet on windy days (high speed over 25 m/s).
- Anvils downwind of storms, and their remains for an hour after.
- It moves with the high steering at 15–55 m/s, often on another heading than the heaps: the high layer's axis drifts up to 30° from the low layer's.

**Look.** - Fine white brush strokes and hooks stretched along the high wind; alpha at most 0.5; no shade tone.
- A milky veil with a faint 22° halo.
- Gold, then pink, after the land's sunset.
- Anvils: opaque and flat, bright above and dark beneath.

**How drawn.** The high shell in upperClouds.js, at R + 9 000 m.
- Cover from field B.G.
- Streaks from the noise read in a frame stretched 6–8 times along the high wind and warped once, moved by M_high(t).
- Anvils where the cover is above 0.6 (only the model paints that much), shaded darker from below.
- Lit by directSun at its own height, through the existing air model.
- It takes at most 15–25 % of the Sun.

### Lenticular (standing-wave) clouds

**Height.** 1–2 km above the summits (4.5–6.5 km above the sea), in 1–3 stacked plates.

**Where and when.** Downwind of the high summits (600 m or more of prominence; haven_peaks.json), on stable windy days:
- the mid steering over 11 m/s across the ridge;
- mid-level humidity between 0.3 and 0.7.
Crests stand at λ(k + ½) downwind, for k = 0, 1, 2, where λ = 2πU/N and N = 0.011 s⁻¹ (6.3 km at 11 m/s). They stay still over the land and grow and fade over 20–40 game minutes. The 24 September scene day has them over the Crown.

**Look.** Smooth lenses with a clean line between light and shade and a pearly rim, stacked like plates: a poster shape. Pink and gold at dusk.

**How drawn.** src/sky/lenticulars.js: up to 12 flattened lens meshes (32 × 12), lit in two tones from their exact normals, writing depth where solid, with a soft blended rim. They are placed from the model's list, which A posts with each snapshot. Last in B's order; they may be cut if time runs short.

## The weather model

CODE
New code goes in src/weather/sky/: model.js, systems.js, land.js, cells.js, strikes.js and fromMaps.js, plus the worker skyWorker.js. From step 0 come steer.js, format.js, cellShape.js and stub.js.
- It is plain JS with no DOM and no three, so it runs in the worker, on the main thread and in Node, like the height code.
- It is set up from the world file's weather block: numbers and recipe names only.
- Every distance is in metres through world.radius; on Haven a degree is 4 363 m, and the model never counts in degrees.
- It takes no input about the traveller.

INPUTS
haven_wxland_1024.u8 and haven_peaks.json are new outputs of scripts/make-world-maps.mjs. The script must leave every existing output byte for byte the same. The land maps are lossless planes, 1024 × 512 each:
- hC: the ground smoothed over 15 km. Cloud bases and fog stand over it.
- hS: the ground smoothed over 4–5 km, with its gradient. It drives the slope lift and the slope winds.
- prominence = max(0, hS − hC).
- valley depth = max(0, hC − the 2-km mean ground).
- the land mask, and the distance to the coast.
The peak list holds the summits with 600 m or more of prominence (place, height, ridge direction).
Trigger sites are made at load from prominence and the coast.
The Sun comes from src/core/ephemeris.js (pure), giving local solar time and the season.

TIME
The game clock, in seconds since weather.epoch. A snapshot is a pure function snapshot(t): it carries nothing over from one call to the next, so any time, any jump of the clock and running backwards all simply work.
- Snapshots every 120 s of game time.
- When the clock runs fast: max(120 s, |rate| × 0.5 s), computing only the newest time needed.
- The noise's own clock equals the game clock while |rate| ≤ 600. Above that it advances at ±600 × dt, and is set back to the game clock when the rate falls: one re-cut, as at a bookmark.

STEERING: THE WIND OF EACH CLOUD LAYER (steer.js, step 0)
For each layer L (low 1.5 km, mid 5 km, high 9 km) and for cells:
M_L(t) = Rz(ψ(t) + δψ_L(t)) · Rx(φ(t) + δφ_L(t)) · Rz(θ_L(t)).
- θ_L(t) is the exact integral of a signed rate made of smooth knots. Over 12 h knots it is a piecewise cubic whose prefix sums from the epoch are cached, so it is a closed form.
- The tilt φ and azimuth ψ are smooth knot noises over 3–4 days.
- δψ_high adds up to ±30°, so high cloud can run on another heading.
The wind of layer L at a place p is defined as the velocity of that motion, v_L(p) = dM_L/dt · M_L⁻¹ · p, so it is always level.
Speeds:
- low: 0–14 m/s on the great circle 90° from the axis, westerly on about 85 % of days and passing through calm into easterly on the rest;
- mid: 1.9 × |low| + 4 m/s;
- high: 3.4 × |low| + 8 m/s;
- cells: M_cell, the mean of the low and mid rates about the low axis.
A pattern is read at M_L(t)⁻¹·p, so it moves WITH the wind. Today's p/scale + drift moved it at −6.0 m/s east under a wind blowing east, and the 'change' term slid it 25 m/s south and 28 m/s up.
Why one rigid motion per layer: Haven is 1 571 km round, smaller than one of Earth's weather systems, so a single steering flow per layer is not a simplification that shows.
Replay (cloudwf/steer.mjs) at the opening place over 20 days: 0.5–13 m/s, median 4.6; the slow tilt terms add at most 2 m/s; the vertical part is 1e-15 m/s; closed form against a 30 fps frame-by-frame sum, 3 cm apart over 38.8 km in an hour. It is the integral that 'added up frame by frame' asks for, and it holds after jumps of the clock and whether or not anything is drawn.

GROUND WIND (at(), for uWind)
The base is 0.6 × v_low turned 25° by hemisphere. To it:
- × exposure: on crests (1 + 0.5·prominence / 500 m), in valleys (1 − 0.4·valley depth / 300 m);
- × (1 + 0.6·the strength of a nearby low);
- + a slope wind along ∇hS: upslope 2.5 m/s by day, downslope 1.5 m/s at night;
- + a sea breeze within 15 km of the coast: onshore 3.5 m/s at its 15 h peak, offshore 1.5 m/s at night;
- + a gust front: 6–15 m/s outward, 3–8 km ahead of a mature cell's rain;
- × gusts of 1 + g_day·noise(the place carried downwind, time), with g_day from 0.1 to 0.35.
It is a value of the place and the time, never of rig.east.

SYSTEMS (closed form, seeded by slot)
- Lows: one every 18 h on each hemisphere's track at latitude 40–56° (shifted 4° with the season). Radius 70–130 km; life 36–64 h; strength sin(π·age / life)^1.2.
- Fronts as arcs from each low's centre: the cold front at a bearing of 200° turning to 235° (mirrored in the south), 2.2 radii long; the warm front at 110° turning to 70°, 1.4 radii long; the front occludes after 0.6 of the low's life.
- Highs between consecutive lows; tropical waves every 30 h at latitude 8–20°.
- All of them are carried rigidly by M_mid: position(t) = M_mid(t)·M_mid(t_birth)⁻¹·p_birth.
- No system adds a vortex to the cloud winds. Lows only strengthen and gust the ground wind, and bring lift, moisture, cover and rain.

MOISTURE (relative humidity of the low air, per cell)
- The latitude climate of make-world.mjs's rains(): 0.55 + 0.25·exp(−lat² / 200) − 0.2·exp(−(|lat| − 27)² / 90) + 0.12·exp(−(|lat| − 50)² / 200).
- × the day's humidity: 0.85 + 0.3 × a 70-h noise.
- × the source: 1 over the sea; over land 0.6 + 0.4·exp(−fetch / 300 km), stepping 20 × 3 km up v_low to find the coast.
- × the rain shadow exp(−max(0, highest ground upwind within 60 km − hS) / 900 m).
- + 0.12 in a warm sector, + 0.15 under a warm front's shield, − 0.15 more than 30 km behind a cold front, − 0.12 under highs (− 0.25 aloft).

TEMPERATURE (numbers in the world file)
27 − 0.42·max(0, |lat| − 12) − 8·cos(season)·min(1, |lat| / 45) − 6.5 per km of height, ± the daily swing (land +5 by day and −3 at night, sea ±0.5). That gives about 10 °C at the ledge in September and snow above about 3.2 km. Precipitation falls as snow below 1.5 °C.

LIFT AND INSTABILITY
Lift:
- slope lift = v_low · ∇hS;
- cold front: 1.5·exp(−(d / 6 km)²);
- warm-front shield: 0.25·exp(−d / 40 km), 0–90 km ahead;
- inside a low: 0.3·g(d / r); under highs: −0.2.
Instability:
- heating = land × smoothstep(5°, 45°) of the Sun's height 2 h earlier, × (1 − the overcast);
- × (0.5 + 0.8·prominence / 800 m) × humidity^1.5;
- + 0.3 in the cold air 30–120 km behind a cold front; + 0.2 near the season's tropical line;
- − 0.4 under highs; over the sea −0.3 by day and +0.15 at night.

KINDS PER FIELD CELL
- Heap: clamp(1.6·(instability − 0.25)) × smoothstep(0.45, 0.75, humidity), plus 0.6·smoothstep(0.3, 1, lift) × smoothstep(0.55, 0.8, humidity), plus caps (0.6–1 within 1.5 km of a summit with prominence over 600 m, when humidity is over 0.5). Then × today's fair field and clusters, read in JS from cloudNoiseData's channels and carried by M_low. Then carried downwind as the largest upwind value × exp(−distance / (wind × 20 min)): cloud streets. Cut by up to 80 % in the lee where lift is below −0.4.
- Sheet (with a thickness), the largest of:
  - stratus: smoothstep(0.75, 0.95, humidity) × stability;
  - nimbostratus: smoothstep(0.1, 0.6, frontal lift + the low's lift) × smoothstep(0.7, 0.9, humidity);
  - orographic stratus: smoothstep(0.4, 1.2, lift) × smoothstep(0.8, 0.95, humidity).
- Base above the sea: max(hC + condensation level, hS + 600 m). Caps: the summit − 300 m.
- Fog top: valley floor + clamp(0.4 × valley depth, 60, 400) m, on calm, humid, clear nights. It lifts 1–3.5 h after sunrise. Sea fog by a hash of the day.
- Mid: the shield 10–45 km ahead of a warm front, plus moist air aloft (at most 0.35 cover elsewhere), plus the remains of storms.
- High: the shield 40–110 km ahead of a warm front, plus streaks where the high wind exceeds 25 m/s, plus the anvils of live cells (painted with cellShape.js, downwind by v_high × age).
- Rain (mm/h):
  - frontal: 1 + 5 × the nimbostratus part;
  - on slopes: 3·smoothstep(0.5, 1.5, lift)·humidity²;
  - drizzle from thick stratus: 0.2–0.5;
  - none where the base stands more than 2 km over the ground (virga).
  The cells' rain is not in the field: it comes from the cell list, through cellShape.js.
- Wet = Σ over k of rain(t − k × 30 min) × exp(−k × 30 min / 3 h), the cells' rain included, on a 256 × 128 grid of 30-minute slots. Each slot is cached and recomputed whole only after a jump.
- Lenticulars: a list from the peaks where the mid wind across the ridge exceeds 11 m/s, the air is stable and mid humidity is 0.3–0.7.

CELLS (cells.js; their records are posted with each snapshot, their state is a closed form at any t)
- Sites: peaks 250 m or more over their 15-km country and at least 5 km apart; sea-breeze points; points along cold fronts.
- Births: one candidate per site per 30 min by hash(seed, site, slot), with chance smoothstep(0.45, 0.85, instability × humidity) × 0.35 (× 1.6 on heated or windward high ground). Over land 13–19 h local; any hour on fronts.
- The cap: no birth within 40 km of a live cell, and never more than 8 alive within 200 km of any place. Sites are processed in a fixed order, so the result is deterministic.
- Each record: id, seed, birth time, birth point 2–5 km downwind of its site, radius 2.5–5 km, top 6.5–11 km, life phases (grow 20, mature 25–40, decay 30 min), peak rain 15–45 mm/h in a core of 0.6 radius, flash rate 2–12 a minute.
- Position at t: M_cell(t)·M_cell(t_birth)⁻¹·p_birth.

STRIKES (strikes.js)
- For each mature cell and each 0.7 s slot: a flash if hash(cell, slot) < rate × 0.7, at hash2 × 0.7 s into the slot.
- 30–35 % reach the ground, at a place inside the rain core: from the cell's base there (field) to the ground (the height function). The rest are inside the cloud, at 0.4–0.8 of the tower's height. Power 0.6 to 1.4.
- Splitting a window gives the same flashes, so every run and every benchmark meets the same storm.

THE SNAPSHOT (format.js)
- A, 1024 × 512 RGBA8: heap cover, sheet cover, base / 25 m, sheet thickness / 25 m.
- B, 1024 × 512 RGBA8: mid cover, high cover, field rain (60·log2(1 + mm/h)), wet.
- C, 512 × 256 RG8: fog top / 16 m, country height hC / 16 m.
- Plus the cell records and the lens list.
Rows run north to south and columns from longitude 0, as in the elevation map. The arrays are computed, never stored as JPEG, so channels cannot leak into one another.
at(lat, lon, t, height?) decodes the same bytes, blended between the same two snapshots as the GPU, adds the cells through cellShape.js, and returns: ground wind, gust, rain at that height (0 above the base), snow, temperature, overcast, storm darkness, fog density at that height and wet.

DETERMINISM AND THE TRAVELLER
Everything is a function of (seed, date, time, place). Math.random leaves src/weather. The traveller decides only what is evaluated and drawn:
- which cells are listed, and that is every cell whose top can stand above the horizon (within 200 km below 30 km up);
- which shade windows are drawn;
- the march's bounds, which only shorten it.
None of these changes a value.

DATA
Haven's file gains weather: { recipe: 'made', seed, epoch, steering {low:{max, easterly}, mid:{k, add}, high:{k, add, veer}}, systems {...}, moisture {...}, heat {...}, temperature {...}, cells {...}, lightning {...}, fog {...}, lenses {...}, days: { '2024-09-22': {...} } }.
The world file may pin a date's day parameters. The seed is chosen with scripts/find-weather.mjs so that:
- 22 September has mist below the ledge at 07–09 h, heaps on the ranges by noon, and a storm on the western ranges in view of the ledge at 14–18 h;
- 23 September brings a front;
- 24 September is windy, with caps and lenticulars on the Crown.
Bookmarks ('Morning mist', 'Afternoon storm', 'A front coming', 'Wind on the Crown') carry timeOffsetHours.

EARTH
Its recipe is 'maps'. fromMaps.js builds one static snapshot at 2048 × 1024 from its 8 September 2017 maps:
- cover from the cloud map;
- mid cover from tops of 4–7 km;
- high cover from tops over 7 km;
- rain from the rain map;
- cells from the maxima where rain exceeds 3.5 mm/h and tops 7 km.
Its ground wind keeps weather.js's belts and storm vortices, moved into fromMaps.js. Its steering is a westerly set by its file.

## Rain and storms

RAIN COMES OUT OF THE CLOUD ABOVE
Rain belongs to the cloud overhead: the field's rain under decks and on windward slopes, and each cell's core. It is never a map value at the traveller that can rain under a gap.

1. Shafts (B, in the march)
- Before the cloud steps, each ray's stretch below the local base is crossed once.
- Cells: an exact chord through each raining cell's leaning cylinder, with no texture read. Its foot is offset downwind by (v_ground − v_low) × the fall time, with drops falling at 9 m/s.
- The field's rain: 2 looks into field B along the stretch, then one look into the noise stretched 10 times vertically, which scrolls down for the fall streaks.
- Optical depth: 0.00014·rate^0.85 per metre, the same law as today's veil. 20 mm/h is opaque across 6 km; 1 mm/h is a translucent haze.
- Virga: light rain under a base standing more than 2 km over the ground fades out over its lowest 40 %.
- A misty foot fades over the last 300 m above the country height (field C.G).
- Colour: grey-blue sky light (skyLight × 0.7 / π), plus a silver forward glow when the Sun is low behind the shaft.
- Shafts fade out nearer than 600 m. There the streaks and the veil take over.
- Far: the same chords in the far slices, laid at their own distance, so a storm on the horizon shows its shaft and a nearer ridge hides its foot.

2. At the eye (D)
- rain.js keeps its streaks: at most 5 600 in a 26 m box, at least 2 px wide, lit by skyLight, with their own slice from the eye to the terrain's near plane, and none above 3 000 m over the ground.
- The rate is at().rain at the traveller's place and height: the field plus cellShape.js. It is above zero only under a raining base, so flying or walking into a shaft starts the rain at its edge.
- The veil (uWeather.w), the rain sound, the sky dome's grey and the rain's push by the ground wind all follow the same number.
- Snow below 1.5 °C, from the world's own temperature model.
- Wet ground is per place, from field B.A, read at the ground's vertices into vCloud.z. A storm leaves a dark, glossy trail that dries over hours.

DARK STORMS, 'much darker and stormy looking'
1. In the march:
   - The sunlight inside a cell is exp(−σ·chord toward the Sun), mapped to the painter's tones: lit where the chord is under 300 m, down to 0.08–0.15 at the base.
   - The base is pulled toward the world file's storm tint, an indigo slate [0.62, 0.66, 1.0] relative.
   - The light from the ground below is halved.
   - The existing storm patches (0.36–1.61) come from the cell's stage, not from the weather at the traveller.
   - Density is 1.45 times a heap's.
   - Scud hangs to 400 m under the base.
   - Decks darken by their thickness (A.A) to 0.35.
   - Mid and high transmittance is read once per ray: exp(−1.2·mid − 0.35·high).
2. Under a storm the ground and everything on it get the shade map's sun term (about 0.05) and sky term (about 0.3). The figure gets the same through the probe.
3. The exposure meter (post.js, D):
   - It makes up only D^0.55 of the darkness D. D comes from the overcast and storm darkness that at() gives at the traveller, NOT from the Sun at the traveller's feet: a heap's shadow must not dim the frame.
   - A storm at D 0.15 stays about 1.2–1.4 stops darker than full compensation would make it; clear days are unchanged.
   - Strokes write alpha 0, so they cannot own the meter.
4. A storm grade in look.js (saturation 0.82, contrast 1.12, cool shade), blended in by the storminess at the traveller, and the sky dome greyed under overcast.

LIGHTNING
- Strokes come from strikes(t0, t1) over the last frame's window, within 60 km.
- bolt.js is rewritten as ribbons:
  - a pool of 4 strokes, 30–64 pieces each, from a seeded random walk with 12 % branches;
  - quads turned to the eye, at least 2.5 px and 6 m wide, with a white-violet core (1.0, 0.95, 1.2) at about 60 × the Sun's light;
  - a glow ribbon 5 times wider at alpha 0.25, so a stroke reads with bloom off (the governor turns bloom off early);
  - when bloom is on, it adds a halo;
  - built in planet axes and drawn relative to the camera each frame, so a stroke stays put while the traveller moves;
  - 2–4 return strokes over 0.2–0.5 s;
  - drawn after the far sheets and before the near cloud slices, so cloud in front covers its top.
- Every flash, in the cloud or to the ground, lights its own cell from inside, through B's uBolt (up to 2 at once, in the near and far slices). A tower 80 km away flickers at night.
- Near the traveller the sky light rises by today's uFlash = power × 1.3 × sunE / (1 + (d / 3 km)²).
- debug=flash works on Haven (the nearest cell, or the stub storm); debug=storm puts a mature cell 8 km north-east of any place.

THUNDER (audio.js, synthesised; nothing new for docs/ASSETS.md)
- Each strike is queued for t + 3-D distance / 343 s.
- A crack under about 3 km, rolls beyond, nothing past 50 km. Loudness by distance as today.
- A low continuous rumble while a mature cell is within 30 km.
- Strokes hidden behind a mountain are still heard.
- Only below 20 km above the ground.
- Rain hiss and wind sound come from the traveller's numbers; the wind is no longer 0 on Haven.

WIND THAT GOES WITH IT
- uWind is the ground wind at the traveller's place, so trees, grass waves, sea and whitecaps, leaves and pollen follow that day's weather. Whitecaps come at 7–14 m/s; leaves tear off above 9 m/s.
- A gust front rises 6–15 m/s outward before the rain arrives: the grass and trees thrash first.
- A hovering figure drifts with the wind only while the stick is released, on Haven too.
- The robe and hair keep their body-frame breeze, unchanged.

RAINBOW
rainbow.js asks the cells and the field for rain 2–20 km away on the side away from a low Sun, in metres from world.radius. A bow appears after an evening storm.

WHEN IT RAINS
Only where and when the model says so: storms on unstable afternoons over the ranges and along fronts, decks ahead of warm fronts, upslope rain on wet days, drizzle from thick stratus. A fair day stays dry. A test asks for an hour of rain or more at the opening place on 25–55 % of days.

## Rendering and cost

FRAME ORDER (skySystem.js; the tile-GPU rules hold)
Between frames: snapshot strips are uploaded with texSubImage2D, 32 rows of A, B and C at a time (at most about 260 KB a frame, for 16 frames every 2 game minutes). Nothing generates mipmaps on the GPU.

Before post.beginScene, each pass into its own target, made once at its largest size and used in part, cleared first:
1. The field blend: 'now' copies of A, B and C = mix(snapshot k, snapshot k + 1, f), scissored to 1/16 of the rows a frame: about 70 k texels, 2 reads each.
2. The shade atlas: the near and middle windows whole, the world window 1/16 of its rows.
3. The probe: 3 texels (the hero's feet, the camera, the lander), read back with readRenderTargetPixelsAsync as the meter does; read synchronously in shot mode.
4. The march into the small target, then SMOOTH, then ALL.

Inside the main picture:
- the far scene, then the near scene with the ground (reading the shade atlas);
- the far cell sheets: colour, with the fragment's depth set to the cloud's own distance, plus a depth-only pass for cores of alpha 0.6 or more;
- the shells above the camera (high, then mid);
- the far low shell;
- the fog sheet and the lens meshes;
- lightning ribbons;
- the near slices, far to near, as today;
- the shells below the camera;
- the weather scene: streaks, rainbow, pollen;
- the rain's near slice, as today.
Nothing reads the picture's depth as a texture, and nothing leaves the picture between its clear and its last draw. Writing gl_FragDepth turns off early depth only for the far cell sheets, which cover small regions.

1. THE FIELD (A, src/sky/skyField.js)
- Three snapshot slots plus a 'now' copy, A and B at 1024 × 512 RGBA8 and C at 512 × 256 RG8: about 17 MB.
- Worker: 0.4–0.8 s in Node for a snapshot (the weather-first prototype's orographic part takes 279 ms), so about 1–1.6 s of one phone core every 120 s: under 1.5 % of a core.
- Page work at most +0.3 ms, and only during the strip uploads.

2. THE VOLUME (B, cloudVolume.js)
Reads per step, at most 4:
- field A;
- the main noise;
- the fine noise (½);
- the look toward the Sun (½ to 1);
- +1 within 1 km.
Today it is 6–7: map, 2 fair-weather reads, main, fine, the look toward the Sun.
Other reads:
- field B once per ray (the upper layers' transmittance), and twice more only where it rains below the base;
- C once per ray where there are shafts.
Cells cost arithmetic only: at most 2 tested per ray, each marched over its own interval; a cell's own noise frame is read only inside it.
Bounds: the lowest base and highest top within reach, from the CPU copy of the field, snapped to 250 m with hysteresis. They only shorten the march.
Slices: 0, 0.3, 0.9, 2.4, 5, 9, 16 km, then 40 and 200 km for cells only. The small target grows from 0.375 to 0.5 of the view's pixels, but the two far slices are marched and laid only while a cell stands beyond 16 km; otherwise the target is used in part as today.
Textures: about 6–9 for the lighting chunk + noise + A + B + C = 13 of 16 at most.
Estimate: a fair day 1.5–3 ms (today 2.0–3.7); with storms in view 2.5–4.5 ms.

3. SHELLS (B)
- The far low shell: field A in place of the map and the 2 fair-weather reads. Its vertices read the base. It discards near pixels FIRST (today it computes the pixel and then discards it).
- The mid and high shells: one icosphere each (detail 32). 3 reads on a covered pixel, 1 read and a discard where clear; about 11 textures. Estimate 0.3–0.8 ms together with high cloud overhead, about 0.1 ms with none.
- The fog sheet: a 129² grid, 1 read, 0.1–0.3 ms when in view.
- Lenses: at most 12 × 800 triangles.

4. THE CLOUD-SHADE ATLAS (C, src/sky/cloudShade.js; it replaces treeShade's pass and the ground's per-pixel heap rule)
One RGBA8 texture, 1024 × 1024:
- the world window: 1024 × 512, latitude and longitude, 1.53 km a texel, 1/16 of its rows a frame;
- the near window: 256² at 55 m (14 km), redrawn whole every frame;
- the middle window: 256² at 220 m (56 km), redrawn whole every frame.
The near and middle windows lie on lattices fixed to the world: tangent frames anchored at fixed world points about 20 km and 80 km apart, chosen with hysteresis, each window snapped to whole texels. A place lands on the same texel whichever window holds it, and a re-anchor changes values by at most 0.02 (a test).
Each texel is a point on the sphere R + 2 500 m. Its channels:
- R: the raw shade of the low cloud along the Sun's ray through that point (heaps and sheets from the shared rule, fog, the cells' exact chords). Readers apply the crisp curve, so edges stay sharp.
- G: the Sun through the mid and high layers.
- B: the sky light left.
- A: the top of the low cloud along that ray, so a peak above a deck or above fog stays in sunlight.
Cost: about 160 k texels × about 8 reads, an estimated 0.3–0.6 ms.
Readers:
- the near ground at its vertices (vCloud.xyz = sun, sky, wet; no new varying);
- the far ground per pixel (1–2 reads, against about 4 plus the heap rule today);
- trees, far forest and far grass: one read per vertex, through treeShade.js's unchanged cloudShade(rel);
- far rocks: one read per vertex (2 samplers become 1);
- the figure, near rocks (within 30 m), lander, leaves, dust and grass within 30 m: through uWeather.x and .y from the probe, 1–3 frames late.
Textures: the ground's fragment shader goes from 16 to 15 of 16, since tClouds and tCloudNoise become tCloudShade. Its vertex shader keeps its count (tCloudShade and field B in place of tClouds and tCloudNoise).
Estimate: today's 2.7–5.5 ms 'clouds' row falls to about 0.5–1.2 ms. That saving pays for the storms.

5. RAIN, RIBBONS, AUDIO
- Streaks as today (about 0 on the phone).
- Ribbons: at most 4 × 64 quads, no texture.
- Probe and at(): under 0.05 ms of page work a frame.
- Audio runs off the GPU.

TOTALS (estimates; the phone decides; differences under 3 ms are noise)
- Today, clouds and their shadows: 4.7–9.2 ms.
- New, fair day: about 2.5–5 ms.
- New, near or under a storm: about 4–7 ms.
- Page work: at most +0.3 ms during uploads.

GOVERNOR (src/perf/governor.js, main session only; each step thins, none removes)
Group 1:
- 'cloud-steps': near steps 36 → 22, far slices 8 → 5 (kept).
Group 2:
- 'cloud-upper': the shells get one octave and no relief look; the cloudlets become a soft veil.
- 'rain-shafts': no streak read, one look into the field's rain.
- 'cloud-shade-rate': the middle window every other frame.
Group 3:
- 'cloud-shade-coarse' replaces 'clouds', which removed every shadow: the near window is not drawn and readers use the middle one at 220 m. The shadows stay, and the figure stays shaded.
- 'cloud-volume', last: the field's heaps and decks near the traveller go to the shell. Cells are still marched in every slice at 5 steps, with their shafts, darkness, shadows, strokes and thunder.
Group 4:
- 'rain': half the streaks (as today).
There is no step for the field, the probe, lightning or thunder.
At the floor the clouds keep moving, because their motion comes from the clock, not from the volume. Check with ?debug=floor pictures of the storm from 40 km and from under it.

BENCHMARK (src/perf/benchmark.js, main session)
- The route's clock is pinned.
- Cost views carry an hour. New views: 'under the storm' and 'a storm from afar' (from find-weather), and 'in the morning mist'.
- New PARTS_OUT rows: clouds-all, cloud-shade, cloud-upper, cells-far, rain-shafts, fog.
- After the merge, ask the owner for a phone benchmark.

LIMITS
- The phone allows 16 textures per shader and 15 varyings: glLimits checks every new program in smoke and in screenshot runs.
- No GLSL reserved word as a name (sample, filter, patch, input, output, common, active, partition, half).
- No backticks in GLSL comments.
- Small passes lay out their own texels with gl_FragCoord; only HAZE_UV refers to the main view.
- Lit surfaces write alpha 1; clouds write their cover as alpha; ribbons write alpha 0.

## Work packages

### A. The day's weather: the model, systems, cells, strikes and the field

**Files.** New:
- /home/user/what-it-s-best-at/src/weather/sky/model.js
- /home/user/what-it-s-best-at/src/weather/sky/systems.js
- /home/user/what-it-s-best-at/src/weather/sky/land.js
- /home/user/what-it-s-best-at/src/weather/sky/cells.js
- /home/user/what-it-s-best-at/src/weather/sky/strikes.js
- /home/user/what-it-s-best-at/src/weather/sky/fromMaps.js
- /home/user/what-it-s-best-at/src/weather/sky/skyWorker.js
- /home/user/what-it-s-best-at/src/sky/skyField.js (GPU slots, strip uploads between frames, blend pass, CPU copy and at())
- /home/user/what-it-s-best-at/scripts/sky-model-test.mjs
- /home/user/what-it-s-best-at/scripts/sky-map.mjs
- /home/user/what-it-s-best-at/scripts/find-weather.mjs
Edited:
- /home/user/what-it-s-best-at/scripts/make-world-maps.mjs (adds public/data/haven_wxland_1024.u8 and public/data/haven_peaks.json; every existing output stays byte for byte the same)
- /home/user/what-it-s-best-at/src/worlds/haven.js (the weather block, scene bookmarks with times, cost-view times)
- /home/user/what-it-s-best-at/src/worlds/earth.js (weather recipe 'maps' only)
Left alone: steer.js, format.js and cellShape.js (step 0; changes go through the main session).
Report: /home/user/what-it-s-best-at/docs/briefs/sky-A-report.md

**What.** Build the model in weather_model as pure JS that runs in the worker, on the main thread and in Node:
- the land inputs;
- the closed-form lows, fronts, highs and tropical waves, carried by M_mid;
- the day's character (windiness, humidity), with days the world file can pin;
- the ground wind;
- moisture with fetch and rain shadow;
- temperature and snow;
- lift and instability;
- the kinds (heap with caps, streaks, lee and fair clusters; sheet with thickness; base; fog top; mid; high with anvils painted through cellShape.js; field rain; wet from 30-minute slots);
- cells with sites, births under the cap, life and M_cell motion;
- deterministic strikes;
- the lens list.
Then the plumbing and the tools:
- skyWorker computes snapshot(t) ahead of the clock (spacing max(120 s, |rate| × 0.5 s));
- skyField uploads it in 32-row strips between frames into three slots and blends 'now' in 1/16 strips before the main picture;
- at() decodes the same bytes plus the cells;
- fromMaps.js gives Earth one static snapshot, a cell list from its maps, and its belts and vortices as the ground wind;
- choose the seed and the scene days with find-weather.mjs: 22 Sep mist below the ledge, heaps by noon, an afternoon storm in view of the ledge; 23 Sep a front; 24 Sep windy with caps and lenses on the Crown;
- hand the main session the bookmarks and the cost views ('under the storm', 'a storm from afar', 'in the morning mist').
Leave the renderer alone.

**Depends on.** Only step 0: format.js, steer.js, cellShape.js and the stub's API. B, C and D work against the stub until A lands, and merge A's branch as soon as it builds.

**Checks.** `node scripts/sky-model-test.mjs` exits non-zero on any failure. It must also fail when fed a fake producer that wraps today's static haven_clouds map: checks 3, 4 and 7.
1. Determinism: snapshot(t) is byte-identical across two calls and two processes. at() equals a bilinear decode of the bytes within 1/255. The model files import neither three nor the DOM, and there is no Math.random left in src/weather.
2. No traveller input: the field at a fixed place is unchanged after at() has been asked at 200 other places.
3. Mountains, over 20 afternoons a season at 15 h local:
   - low cover on land above 2 000 m is at least 2.5 times that on land below 500 m;
   - windward cover is at least 3 times the lee's on westerly days;
   - the correlation of the 24-h mean low cover with elevation is at least 0.35 (today 0.03, cloudwf/mapstats.py).
4. The day's cycle:
   - heap cover on land at 15 h is at least 3 times that at 07 h;
   - fog at 06 h is at least 3 times that at 14 h;
   - the opening place stands 300 m or more above every fog top within 2 km, at every hour.
5. Motion:
   - lows and fronts move with M_mid within 3° and 5 %;
   - between consecutive snapshots no field cell's cover changes by more than 0.25;
   - a cell's position never moves more than its steering speed × dt + 1 m between frames.
6. Days differ, over 90 days at the opening place:
   - at least 15 % of days have a mean ground wind under 3 m/s, and at least 10 % over 10 m/s;
   - on windy days the high steering speed is at least 2.5 times the low.
7. Rain:
   - an hour of rain or more on 25–55 % of days at the opening place;
   - rain over 0.5 mm/h only where low cover is 0.5 or more, or inside a cell's core, and only where the base stands above the ground.
8. Storms:
   - a lightning-capable cell within 40 km of the Crown on at least 20 % of afternoons;
   - none over land from 03 to 09 h except on fronts;
   - never more than 8 live cells within 200 km of any place;
   - strikes over a split window equal the union of its parts, identical in two processes.
9. Cost: a 1024 × 512 snapshot takes at most 600 ms in Node on this machine.
10. Earth: its rain and ground wind are within 2 % of today's at five places, Irma among them.
11. The scene days hold as described in 'what'.
Pictures to hand back, made without a browser by sky-map.mjs over the shaded relief:
- each kind's cover, the rain, the cells and their strikes, with low and high wind arrows, at 06, 09, 12, 15 and 18 h on the three scene days;
- a 48-frame time-lapse (one frame every 30 min) of the 300 km round the opening place;
- a 7-day meteogram at the opening place (wind by layer, rain, cover by kind, cells within 40 km);
- find-weather's chosen times and places.
When the browser is free, play-profile at ×60 clock on a frozen build: page work at most +0.3 ms, uploads at most 260 KB a frame.

### B. The clouds you see: kinds in the volume, storm cells near and far, rain shafts, upper shells, fog, lenses, the globe

**Files.** Edited:
- /home/user/what-it-s-best-at/src/sky/cloudVolume.js
- /home/user/what-it-s-best-at/src/sky/clouds.js
- /home/user/what-it-s-best-at/src/sky/skyGlsl.js (the one shared shader rule; B owns it after step 0)
- /home/user/what-it-s-best-at/src/sky/bodies.js (Haven's globe wears the field)
- /home/user/what-it-s-best-at/src/sky/cloudNoiseData.js and /home/user/what-it-s-best-at/src/sky/cloudNoiseWorker.js (only if a channel is needed)
- /home/user/what-it-s-best-at/scripts/cloud-cost.mjs
- /home/user/what-it-s-best-at/scripts/stability.mjs (new cases haven_cross and haven_storm_pass)
New:
- /home/user/what-it-s-best-at/src/sky/upperClouds.js
- /home/user/what-it-s-best-at/src/sky/fogSheet.js
- /home/user/what-it-s-best-at/src/sky/lenticulars.js
- /home/user/what-it-s-best-at/scripts/cloud-motion.mjs
Retired: /home/user/what-it-s-best-at/scripts/cloud-field.mjs (its rule moves into A's model; sky-map.mjs replaces it).
Look numbers (heights, tints, darkness, shaft strength) are kept as defaults and listed in the report; the main session moves them into haven.js.
Report: /home/user/what-it-s-best-at/docs/briefs/sky-B-report.md

**What.** 1. The march:
   - read field A at every step (at most 4 reads a step) and take the base per place;
   - delete place(), setGround(), the lift, the 'change' term and the frame drift; the noise comes from steer.js's M_low and rise;
   - bounds from the field within reach, snapped to 250 m with hysteresis;
   - heap and sheet profiles;
   - scud from the existing wisp and fine noises;
   - darkness by τ, and the mid and high transmittance read once per ray from field B;
   - uStorm and uBolt per cell, not from the weather at the traveller.
2. Cells: CELLS_GLSL generated from cellShape.js.
   - Each ray's stretch is the union of the layer's interval and up to 2 cells' intervals, each marched with its own steps and composited in order.
   - Boiling in the cell's own moving frame (no shear at its edge).
   - An exact chord toward the Sun; the slate tint; up to 2 flashes through uBolt (the setter that D calls).
   - Two far slices (16–40 km, 40–200 km), marched and laid only while a cell lies beyond 16 km. Their alpha-weighted mean distance is written beside the colour (a second target or ALL's spare channels) and laid as gl_FragDepth, with a depth-only pass for cores of alpha 0.6 or more.
3. Rain shafts below the base: the cells' chords, 2 looks into the field's rain, a streak read, virga, and a misty foot over field C's country height.
4. Shells:
   - the far low shell from the field, its vertices pushed to the base, discarding near pixels first;
   - the mid and high shells, with cloudlets, streaks along M_high, the halo and anvils;
   - each cut where a tower passes through it, and ordered by the camera's height.
5. The fog sheet, then the lenticulars last (they may be cut).
6. Haven's globe from the field's combined cover.
7. debug=noclouds removes every kind, cell, shaft, fog sheet, lens and anvil; the debug=sky presets work.
8. Expose the governor flags: steps, far steps, upper thin, shafts thin, volume off (cells kept).
Throughout, keep the painted look: few colours, two tones, clean edges, coloured shade.

**Depends on.** Step 0: the stub field's names and layouts, skyGlsl.js version 0, steer.js, cellShape.js and skySystem.js's order. A's model replaces the stub when merged. D calls the uBolt setter fixed in step 0. C imports skyGlsl's shade functions, so keep their signatures and merge C's branch when it builds.

**Checks.** Before any picture:
1. `node scripts/cloud-cost.mjs` counts the march's texture reads per step: at most 4, plus 1 within 1 km. Today it is 6–7, so it fails. The headless work count of march plus lay at --dsf 2.2 on a fair day is no higher than today's.
2. `node scripts/cloud-motion.mjs`, one headless run: two marches 20 s of game time apart, camera fixed, looking up and toward the horizon, their alpha cross-correlated. The shift equals the low steering within 10° and 20 %; today it goes the opposite way at 4–6 times the speed. A high-layer patch moves with M_high.
3. Anchoring:
   - the small target rendered with the camera moved 100 m and 10 km, aimed at the same world point, shows the same cloud there (today the base moves 25–51 m per 100 m flown, cloudwf/lift.mjs);
   - a Node audit finds no uniform other than camera-relative ones that changes with rig.pos.
4. glLimits in `npm run smoke`: the march, shells, fog sheet, lenses and far lay at 16 textures or fewer and 15 varyings or fewer.
5. Stability:
   - haven_climb;
   - haven_cross: 300 m of flight under heaps at 1.5 km, clock held; no cloud moves between frames;
   - haven_storm_pass: a cell crossing 16 km in 5 frames; no step at the hand-over.
6. A ridge at 20 km hides the foot of a cell at 35 km; a cell at 18 km is drawn over a ridge at 30 km.
Pictures, from a frozen build at 880x412 dsf 1.25 (dsf 2.2 for the storm), first from the stub's presets, then from A's model. An early before/after pair first: the ledge at noon. Then:
- the ledge at 08 h (mist, first heaps), at 12 h, and at 16 h (storm on the western ranges), toward the Sun and away;
- 900 m and 2 km over flat country at noon;
- a mature cell from 40 km at 1.5 km up, from 8 km, and from under the anvil; the same cell at night with debug=flash;
- a deck from above with peaks through it, and from below;
- a rain-deck day with shafts;
- altocumulus and cirrus at dusk;
- the Crown on the windy day;
- 30 km up, and Haven from the Moon;
- every storm view again at ?debug=floor;
- ?debug=noclouds;
- a time-lapse strip of 8 frames 10 s apart at ×60 from the ledge.

### C. Cloud shadows and the light under them: one shade map fixed to the world, read by everything

**Files.** New:
- /home/user/what-it-s-best-at/src/sky/cloudShade.js (the atlas pass, the reader GLSL, the 3-texel probe and its read-back)
- /home/user/what-it-s-best-at/scripts/cloud-shade-test.mjs
Edited:
- /home/user/what-it-s-best-at/src/life/treeShade.js (a thin re-export: the same TREE_SHADE_UNIFORMS, TREE_SHADE_VERT and cloudShade(rel) names, so trees.js, farForest.js and grass.js stay untouched)
- /home/user/what-it-s-best-at/src/terrain/terrainMaterial.js (CLOUD_OVER_GLSL and the light at lines 900–920: an atlas read; wet per place from field B in the vertex shader into vCloud.z)
- /home/user/what-it-s-best-at/src/rocks/farRocks.js (SUN_VERT, lines 59–75, only; the shadows brief edits lines 36 and 321)
- /home/user/what-it-s-best-at/src/render/globals.js (the probe feeds uWeather.x and .y)
Left alone (the shadows brief's): trees.js, treeLod.js, nearShadow.js, rocks.js.
Report: /home/user/what-it-s-best-at/docs/briefs/sky-C-report.md

**What.** Build the atlas of rendering_and_cost:
- the world window (latitude and longitude, 1.53 km, 1/16 of its rows a frame);
- the near (55 m) and middle (220 m) windows on lattices fixed to the world: anchored tangent frames chosen with hysteresis, windows snapped to whole texels, both redrawn whole every frame;
- the reference sphere at R + 2 500 m;
- channels: R the raw low shade along the Sun (heaps and sheets through skyGlsl, fog from field C, the cells' exact chords), G the Sun through mid and high, B the sky light left, A the top of the low cloud along the ray;
- one reader function that maps these to sun and sky light, with the crisp curve. Readers above A get only G.
Wire the readers:
- the ground: near at its vertices, far per pixel; 15 of 16 fragment textures;
- trees, far forest and far grass through cloudShade(rel);
- far rocks (1 sampler where today there are 2);
- the figure, near rocks, lander, leaves, dust and grass within 30 m through uWeather.x and .y from the probe (async, synchronous in shot mode; __shotReady waits for it).
Also:
- wet per place replaces uWeather.z on the ground;
- remove the far ground's 0.5 × mean-cover path and tClouds/tCloudNoise from the terrain;
- expose the 'cloud-shade-coarse' and 'cloud-shade-rate' flags.
This package fixes the clouds' part of 'jumpy shadows'.

**Depends on.** Step 0: the field stub's names, skyGlsl.js version 0's shade functions and the cell uniforms, and the probe layout and uWeather semantics. B's changes to the rule reach the atlas through skyGlsl.js imports: merge B's branch as soon as it builds.

**Checks.** `node scripts/cloud-shade-test.mjs` replays the addressing, snapping, anchoring and the readers' projection in Node, and exits non-zero. It fails today against treeShade.js's arithmetic.
1. With the clock held, a fixed ground point's shade changes by at most 1/255 while the traveller walks 0–2 km in 1 m steps and flies 30 km. Today the tree-shade map is off by up to 0.44 (cloudwf/treeshade.mjs), and ground shadow edges slide 3 m per 10 m walked and 70–150 m per 100 m flown (cloudwf/lift2.mjs, lift.mjs).
2. A re-anchor changes values at fixed places by at most 0.02; a window boundary by at most 0.03, with a blend band.
3. Writer and reader agree within 5 m for a point 2 km above the reference sphere with the Sun 15° up. Readers above the low top get only G.
4. The ground, a crown 30 m up, a far rock and the figure at one spot agree within 0.03.
One headless run:
- the figure standing in a heap's shadow has uWeather.x within 0.05 of the atlas value at its feet (today 1.0 inside the shadow);
- glLimits: the terrain fragment shader at 15 of 16 (today 16, so it fails), and every changed program within limits;
- scripts/ground-cost-run.sh against today's terrainMaterial.js: fewer reads at all ten views.
Pictures, each before and after:
- a new shot 'shadeedge': the figure standing at a cloud shadow's edge, dark with the ground, in three frames 5 s apart as the shadow moves with the wind;
- the ledge, and from the air at 2 km;
- the north wood under one shadow edge;
- a storm's shadow and its wet trail from 900 m;
- shadows to the horizon from 5 km;
- the stability walk with the clock held: zero cloud-shadow motion between frames.

### D. Rain, lightning, thunder and wind where the traveller is; storms kept dark

**Files.** Edited:
- /home/user/what-it-s-best-at/src/weather/weather.js (it becomes the reader of at() and strikes(); Earth goes through fromMaps)
- /home/user/what-it-s-best-at/src/weather/rain.js
- /home/user/what-it-s-best-at/src/weather/bolt.js (ribbons)
- /home/user/what-it-s-best-at/src/weather/rainbow.js
- /home/user/what-it-s-best-at/src/audio/audio.js
- /home/user/what-it-s-best-at/src/post/post.js (the storm hold in _meter)
- /home/user/what-it-s-best-at/src/render/look.js (the storm grade)
- /home/user/what-it-s-best-at/src/sky/skyDome.js (grey under overcast)
- /home/user/what-it-s-best-at/src/life/leaves.js and /home/user/what-it-s-best-at/src/life/pollen.js (only if their thresholds need it)
New:
- /home/user/what-it-s-best-at/scripts/weather-test.mjs
- /home/user/what-it-s-best-at/scripts/bolt-test.mjs
Left alone: app.js. skySystem.js calls D's modules through the step-0 interface: uWind, uWeather.w, the strikes, the bolt pass slot and the carry rule.
Report: /home/user/what-it-s-best-at/docs/briefs/sky-D-report.md

**What.** - uWind is at()'s ground wind at the traveller's place, with its gusts and gust fronts; rig.east × 6 m/s is gone.
- Rain and snow at the eye from at(), falling only under a raining base: streaks, veil, sound, push.
- Snow by the world file's temperature.
- Strokes from strikes() over the last frame's window, within 60 km, drawn as pooled ribbons:
  - at least 2.5 px and 6 m wide, plus a glow ribbon;
  - in planet axes, seeded, with 2–4 returns;
  - from the cell's base at its place to the ground;
  - alpha 0;
  - drawn in the bolt pass before the near slices.
- In-cloud flashes are handed to B's uBolt setter; uFlash stays as today.
- Thunder at 3-D distance / 343 s, with a crack, rolls and a continuous rumble while a mature cell is within 30 km.
- Rain and wind sound from the traveller's numbers.
- The meter makes up only D^0.55 of the darkness D from overcast and storm darkness at the traveller (not the Sun at its feet); clear days unchanged.
- The storm grade, blended in by storminess; the sky dome greyed under overcast.
- A rainbow from cells 2–20 km off on the side away from a low Sun.
- Every '111 200 m a degree' replaced by metres from world.radius.
- debug=flash works on Haven.
- The rule for a hovering figure drifting with the wind while the stick is released, applied by skySystem.

**Depends on.** Step 0: the stub's at() and strikes(), the uBolt setter, the bolt pass slot, the probe's uniform names and skySystem's calls. A's model, B's uBolt and C's probe arrive at merges.

**Checks.** `node scripts/weather-test.mjs` and `node scripts/bolt-test.mjs` exit non-zero on any failure, and fail on today's code:
1. Flying 10 km east turns uWind no more than the field does. Today rig.east turns it 3.5° per 10 km, and on Haven it is a constant 6 m/s.
2. Rain at the eye is above zero only where at() rains and the traveller is under the base there.
3. Each thunder arrives at distance / 343 s ± 0.05 s, and an hour of strikes is identical across two runs (today Math.random).
4. Ribbons:
   - a ribbon's half-width is at least 1.25 px at 2, 10 and 40 km at the phone's pixel angle (880x412 at dsf 3.5); today they are 1-pixel lines;
   - a stroke's vertices stay fixed in planet axes while the camera moves at 50 m/s for 0.5 s.
5. No 111200 is left in src/weather. Earth's wind and rain are within 2 % of today's at five places.
6. Meter replay:
   - at darkness 0.15 the exposure is at least 1.2 stops darker than full compensation;
   - clear days stay within ±0.05 stops of today;
   - a heap's shadow passing over the figure moves the exposure by at most 0.05 stops.
7. The wind at the traveller reaches 6 m/s or more, outward, before a raining cell arrives.
In the game (headless): debug=flash on Haven makes a stroke (today none).
Pictures:
- debug=flash at 3 and 20 km, with bloom on and at ?debug=floor;
- streaks under a cell from the ground and from 60 m;
- the storm grade from under the anvil;
- leaves torn off and whitecaps on the windy day;
- a rainbow after an evening storm.
Also a printed thunder log: times, distances, loudness.

## Risks

- Cost is estimated, not measured. The design is paid for by the shade atlas's saving (about 2–4 ms out of today's 2.7–5.5). The new costs are the shells, the far slices, the shafts and the field. If the phone shows less of a saving, the far slices and shafts are thinned before shipping. Ask the owner for a benchmark with the storm and mist stops as soon as the joined build runs. Read the per-part rows, not the frame rate, and believe only differences of 3 ms or more that repeat at every view.
- The steering is one rigid turning per layer, so near the centre of a low the heaps do not swirl round it: they keep the steering's heading while the ground wind there is gustier. Haven is smaller than one of Earth's weather systems, so this should not show; if the owner sees clouds going one way and trees another, the ground wind's turn of 25° is the first number to look at. The axis's two calm ends (calm days somewhere) are intended.
- Far slices: a cell's distance is a mean along each ray. A tower straddling a ridge can show a soft edge where its depth is close to the ridge's. The depth-only pass for cores keeps shells and far heaps behind a tower hidden, but near a tower's soft edge the blending follows the draw order, not the true order. Check the hand-over at 12, 14 and 16 km in haven_storm_pass.
- The tower and the mid layer at 5 km are blended by draw order. Cutting the shell where a tower passes through it hides most of the error. A tower top just above the camera's height can still draw on the wrong side of the shell. Look at the 5 km pictures.
- One rule in several places:
- skyGlsl.js serves the volume, the shells, the atlas and the probe;
- cellShape.js is needed in GLSL and in JS (wet, anvils, rain at the eye);
- format.js decodes in GLSL and in JS.
All three are generated from one source, each with a parity test (one headless run compares the GLSL with the JS at 64 × 64 points within 1/255). A JS copy that is never run (today's cloud-field.mjs) is retired, not left to rot.
- The probe's async read-back arrives 1–3 frames late and may never arrive headless. It is read synchronously in shot mode, __shotReady waits for it with a time limit, and the figure's shade eases instead of jumping.
- The worker on the phone after a jump of the clock needs 1–3 s for two new snapshots. The old field shows meanwhile, crossfading over 2 s. While the clock runs fast, the atlas's world window and the blend strips can tear, so both are drawn whole above ×60. Above ×600 the noise's clock holds and is re-cut once when the rate falls. Check that running backwards and bookmark jumps simply work, as a closed form should.
- The opening view changes: mist in the basin below the ledge, and a base set by rule (about 2.3–2.9 km above the sea, against 2 618 m today). Without find-weather's checks a seed change could open the game in cloud ('fog on a plateau'). Test 4 keeps the ledge 300 m above every fog top within 2 km. Look at the opening place and at Skymere (2 km up) at every bookmark hour before sending.
- The painted look can clutter: nine kinds against 'few colours'. Mid cover is capped at 0.35 except ahead of fronts, cirrus has no shade tone, and the critic judges the sky from the ground, from 900 m and from 2 km, toward the Sun and away, and at --floor.
- Exposure: the storm hold must work with the highlight, coverFrom and globe rules. Ribbons write alpha 0. Check ship, dusk and the storm views after the change, and the hold must never react to a passing heap's shadow.
- Earth changes. Its clouds move to the field through fromMaps (2048 × 1024, cells from its maps), now drift downwind on the game clock, and lose their 13 km tops map to cells. Retake the hurricane, ledge and from-space pictures and run `npm run worlds -- --only earth`. List every change at the checkpoint.
- Texture limits: the march may reach 13 of 16; the shells, fog sheet and far lay about 11; the terrain fragment shader goes down to 15 and its vertex shader stays at its count. A shader over the limit draws nothing on the phone and works headless, so every new program must go through glLimits in smoke and in screenshot runs.
- Merges: four helpers, plus the shadows and governor work, run at once. farRocks.js is touched by C (SUN_VERT) and by the shadows brief (lines 36 and 321); app.js, skySystem.js, governor.js, benchmark.js and haven.js's look numbers stay with the main session; step 0 freezes the interfaces. Give checkers the commit their findings are about, and read helpers' branches and reports, not their transcripts.
- Motion cannot be seen in still pictures or in a helper's standing-camera views. Direction, speed and anchoring are proven by the Node tests (steer, sky-model, cloud-shade, weather) and by cloud-motion.mjs and the stability sequences, each seen to fail on today's code. Before shipping, three cold readers check the drift, the anchoring and the lattice code with small Node replays, as the far-view review did. The owner judges motion on the phone.
- This plan removes only the clouds' share of the owner's 'jumpy shadows'. The Sun's shadow maps are fixed by the shadows-governor-10 brief: the leaf hash re-rolled at every re-centre, the gust phase jumping with the tree list's anchor, the 20 m swap from mesh to cards, the far-tree-shadow saving, rocks missing from the fine tile. Both must land before the owner judges shadows again.

## Appendix: the clouds as they were (reader)

On Haven there is one kind of cloud, in one layer. It is a heap-cloud (cumulus-like) layer whose base sits 1 200 m above "the country" and which is 3 000 m thick, so tops reach at most 4.2 km above the ground. Two things decide where cloud is: (1) a static "day's cloud map" (public/data/haven_clouds_4096.jpg, made by scripts/make-world-maps.mjs from warped noise plus latitude bands, with no terrain input), and (2) where that map is clear, a "fair-weather" field of small heaps in clusters, also made purely from noise (FAIR_GLSL in src/sky/clouds.js). One repeating 64³ Perlin-Worley noise (4.2 km period, made in a worker) cuts that cover into heaps. Within 16 km of the traveller and below 30 km altitude the layer is a ray-marched volume (src/sky/cloudVolume.js). It is marched before the main picture into six small distance slices at a quarter of the view's size each way, smoothed, then laid over the ground as six depth-tested sheets. Beyond 16 km, and whenever the volume is off, a thin shell sphere (src/sky/clouds.js) shows the same heaps at one height, 900 m above the base. Light follows a painter's rule. One look 280 m toward the Sun splits each heap into lit (1.0) and shade (0.64), and only an almost full cover (c > 0.74, on 6.5 % of the world) darkens the base, and then only to sky light. Haven's world file has no `weather` block, so Weather.update returns at once: on Haven there is no rain, no storminess, no lightning, no thunder and no tops map.

Movement: the cover (the map and the fair-weather field) never moves. Only the noise that carves it drifts, and only inside CloudVolume.render. The drift is the wind (on Haven a constant 6 m/s along the traveller's own local east, set in app.js) plus a "change" term of 0.009 noise units a second added to the planet's spin axis (z). A Node replay with the code's own arithmetic shows three faults. First, the pattern moves against the wind (q = p/scale + drift). Second, the "change" term is 37.8 m/s, 6.3 times the wind: at the opening place the clouds run south at 25 m/s and rise through the layer at 28 m/s. Third, everything freezes when the volume is not drawn (the governor's cloud-volume saving, above 30 km, screenshots). The base also follows the traveller. CloudVolume.setGround averages the 383 m elevation map over ±0.4°, which is ±1.75 km on Haven (44 km on Earth). In flight the whole sky's base therefore shifts by up to 25–51 m per 100 m flown, and cloud shadows slide 70–150 m per 100 m at the morning Sun (3 m per 10 m walked at the start). This repeats the "clouds move when I move" lesson and is one cause of jumpy shadows.

Shadows: the ground (terrainMaterial.js cloudOver), the trees, far forest and far grass (through a 256² map, 55 m a point, life/treeShade.js) and the far rocks all follow the sunlight to the shell's single radius. There they read the same map and the same heap rule (HEAP_GLSL), and a full heap leaves 28 % of the Sun. The near ground does this at its vertices (at most 20 m apart), the far ground per pixel. Everything lit through uWeather.x skips it on Haven, where that value is always 1: the character, near rocks, the lander, leaves, dust and grass within 30 m. They stay in full Sun inside a cloud's shadow. The tree-shade map's grid is re-centred on the traveller every frame without snapping, so a tree at a shadow's edge swings by up to 0.44 in light as one moves.

Cost on the phone (benchmark e9d4888, 2.07 MP held; the baseline drifted from 43 to 69 ms, so anything under 3 ms is noise): the volume costs about 2–4 ms (3.7 from the air, down from 9.4 before the ALL pass). The cloud shadows cost 2.7–5.5 ms. The step-count saving is lost in the noise. The governor has three cloud steps: cloud-steps (36 to 22 march steps, group 1), clouds (all cloud shadows off, group 3) and cloud-volume (the flat shell only, the last step). In that run it turned on all three within 12 s and hunted (74 steps), so the phone often showed flat, frozen clouds with no shadows. Earth has the whole weather machine (wind belts and storms, a rain map with a box of rain round the camera, a cloud-top map up to 13 km, storm darkening, lightning strokes as 1-pixel lines, thunder). Haven has none of it, and even on Earth no rain falls visibly from a cloud seen from outside.

**Files.**

- `src/sky/clouds.js`: The far cloud shell (CloudLayer: an icosahedron of detail 48 at R + base + 0.3·thick, one draw call, in nearScene), plus the shared rules FAIR_GLSL (fair-weather cover) and HEAP_GLSL (a heap from the noise), which the volume, the ground, treeShade and farRocks all use. update() copies volume.drift and sets shadow (uCloud) and heap (uCloudHeap) for the ground.
- `src/sky/cloudVolume.js`: The volume near the traveller: the MARCH shader (mapCover, density with a dome profile, the 280 m look toward the Sun, the two-tone light, storm and bolt terms), the SMOOTH, ALL and LAY passes, the six distance slices (SLICE_Z), the drift (render(), lines 408–420), and the base: place() and setGround(), the ±0.4° country height.
- `src/sky/cloudNoiseData.js`: Makes the 64³ RG8 repeating noise: R is the Perlin-Worley masses, G the small cells that eat at edges.
- `src/sky/cloudNoiseWorker.js`: Worker that builds the noise off the main thread.
- `src/worlds/haven.js`: clouds block (map, altitude 3600, cover 0.45, shadow 0.85; volume base 1200, thick 3000, reach 16000, above 30000, scale 4200, dense 3.4, change 0.009, fair 0.44, clear 120). It has NO weather block and no surface.sea.wind.
- `src/worlds/earth.js`: Reference for what Haven lacks: the same clouds block plus weather { rain, tops, cloud, storms } maps of one real day (lines 136–154).
- `src/weather/weather.js`: Wind (belts and storm vortices), squalls, rain rate, storminess, sun and sky shade (uWeather), lightning placement and thunder queue. Returns at once when world.weather is missing, as on Haven.
- `src/weather/rain.js`: Rain and snow streaks in a 26 m box round the camera (5 600 at most), driven only by weather.rain.
- `src/weather/bolt.js`: Ground lightning stroke as THREE.LineSegments (1 px lines), from weather.flash.
- `src/weather/rainbow.js`: Rainbow, from the weather.
- `src/app.js`: Lines 1176–1195: the weather each frame, and on Haven the default wind (uWind = rig.east × 6 m/s), uWeather, rain, bolt, thunder. Lines 1356–1390: cloud order (place, clouds.update, volume.ready/render before the main picture, treeShade, the cloud uniforms handed to the terrain, lay after the near scene, then the weather scene).
- `src/terrain/terrainMaterial.js`: CLOUD_OVER_GLSL / cloudOver (lines 33–56): the ground's cloud shadow, along the Sun to the shell radius, map plus heap. Per vertex on patches up to 12.5 detail tiles, per pixel farther (lines 859–872). Its fragment shader is at 16/16 textures.
- `src/life/treeShade.js`: A 256×256 R8 map of cloud shade, 55 m a point and 14 km wide, re-centred on the ground under the traveller every frame. Read once per vertex by the trees, far forest and far grass (cloudShade).
- `src/life/trees.js`: Near trees: vCloud = cloudShade(...) multiplied into the shadow. Their directSun also carries uWeather.x.
- `src/life/farForest.js`: Far trees: sunLeft × cloudShade (line 180); debug=treeshade.
- `src/life/grass.js`: Grass light table (lines 457–461): far blades use cloudShade, blades within 30 m use uWeather.x (1 on Haven).
- `src/rocks/farRocks.js`: Far rocks work out the cloud shadow themselves in the vertex shader (lines 59–75, HEAP_GLSL).
- `src/render/lightingGlsl.js`: directSun × uWeather.x unless OWN_CLOUD_SHADOW is defined; skyLight × uWeather.y + uFlash; the rain veil (uWeather.w). The hero, near rocks, lander, leaves and dust are lit through this.
- `src/render/globals.js`: Holds the shared uWeather and uFlash uniforms.
- `src/perf/governor.js`: Cloud steps: cloud-steps (line 64), clouds (shadows off, line 96), cloud-volume (line 100), rain (line 122); `live` is cloudVolume.wanted.
- `src/perf/benchmark.js`: Cost test (PARTS_OUT, one saving at a time) that produces the cloud-volume, clouds and cloud-steps rows.
- `src/sky/bodies.js`: Haven's globe seen from space or from the Moon wears the same static cloud map (lines 221–262).
- `src/sky/skyDome.js`: Greys the sky under rain (uWeather.w).
- `src/post/post.js`: Sun beams cut from the picture's alpha (cloud counts as a surface) and an exposure meter that reads alpha: both are readers of what the clouds write.
- `src/audio/audio.js`: thunder(power, dist), and rain sound from weather.rain.
- `scripts/make-world-maps.mjs`: Makes haven_clouds_4096.jpg and _512 (lines 74–92): warped fbm plus latitude belts, static, with no terrain input.
- `scripts/make-world.mjs`: Haven's yearly rainfall (rains(), lines 112–125, wetter on high ground up to 1.5 km), written to haven_rain_720.u8 for the rivers. Nothing reads it for weather.
- `scripts/cloud-field.mjs`: Sketch of the fair-weather field from straight above, without a browser. A JavaScript copy of FAIR_GLSL and HEAP_GLSL that must change with them.
- `scripts/cloud-cost.mjs`: Headless count of the work of the six laying passes.
- `scripts/stability.mjs`: Includes haven_climb (clouds and their shadows while the camera creeps).
- `docs/ARCHITECTURE.md`: Section 'Clouds with depth' (line 990): design notes. It says the base is 'smoothed over a degree' and that 'change' moves the noise 'through its third axis'.
- `docs/benchmarks/2026-11-25-haven-e9d4888.txt`: Newest phone benchmark and the owner's words.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/drift.mjs`: Replay: which way and how fast the cloud pattern moves on Haven (against the wind; 25 m/s south, 28 m/s up).
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/lift.mjs`: Replay: how far the sky's base and the cloud shadows move as the traveller flies on Haven.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/lift2.mjs`: Replay: the same, per 10 m walked at the opening place.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/treeshade.mjs`: Replay: the tree-shade map's error at shadow edges as its grid slides with the traveller.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/mapstats.py`: Cloud-map cover against elevation (land against sea, by height band, correlation).
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/dark.py`: Share of Haven where the cover is high enough for a darkened base.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/field-start.png`: cloud-field.mjs sketch of the fair-weather field over 150 km round the opening place (7.7 % of the country under cloud).

**Facts.**

- Haven: radius 250 km. Its clouds block equals Earth's except the heights: altitude 3600 (used only before the noise exists), cover 0.45, shadow 0.85, volume base 1200, thick 3000, reach 16000, above 30000, scale 4200, dense 3.4, change 0.009, fair 0.44, clear 120. There is no `weather` block.
- Kinds: exactly one, a heap-cloud layer. Base = 1200 m + lift (the country's height); top = base + 3000 m with a dome profile: top = mix(0.36, 1, smoothstep(0, 0.32, n - (1-c)·0.85)) · (0.6 + 0.4c) of the layer, so fair heaps stand about 2.2–2.4 km tall. On Earth only, the weather's tops map deepens the layer to 13 km (thickNow from topNear); on Haven uTops.z = 0 and the thickness stays 3000.
- Shell radius = R + base + 0.3·thick (900 m over the base), re-set every frame from the volume. The volume is drawn to 16 km and below 30 km altitude; the shell fades in over 0.7·16 km to 16 km (uNearFade) and covers everything when the volume is off.
- Noise: a 64³ RG8 3-D texture with RepeatWrapping, period = scale = 4.2 km (66 m a texel). R: Perlin-Worley masses (worley 4/8/16 cells and smooth 4/8/16 per period), so masses are about 1 km. G: worley 8/16/32 cells; lobes at ×5.3 (a 790 m period); wisps at ×19 within 1 km of the eye; 'great soft patches' inside a cloud at ×6 and ×15.
- Placement: cover = max(day's map smoothstep(0.47, 0.89, m), fairCover). fairCover: the field noise at k = R/scale·0.11 = 6.55 (a 38 km repeat) times clusters at 0.2k (a 191 km repeat), capped at 0.5. scripts/cloud-field.mjs gives 7.7 % of the country under heaps round the opening place and 8.6 % round the Crown.
- Day's map (make-world-maps.mjs lines 74–92): 4096×2048 grey JPEG (383 m a pixel) from warped fbm (frequencies 2.6 and 24 on the unit sphere) plus latitude belts (+ at the equator, − at 26°, + at 52°). Static for every date. Mean 0.162. The layer's cover from it is 8.6 % of the world: 0.086 over land, 0.086 over sea; 0.077 on ground under 500 m against 0.101 over 2 500 m. Correlation with elevation 0.03. Cover over 0.74 (where bases begin to darken) on 6.5 % of the world, over 0.97 on 3.6 %. At the opening place the map reads 0.63 (cover 0.32).
- Wind on Haven: Weather.update returns at once without a weather block (windSpeed 0, rain 0, flash null, storminess 0). app.js lines 1184–1185 set uWind = rig.east (the traveller's own local east) × (surface.sea.wind ?? 6) = 6 m/s, constant for every day and place. This is the same wind the grass, trees, waves and cloud drift use.
- Drift (CloudVolume.render lines 408–420): drift += wind · dt · min(20 + 35·storm, speed)/scale; drift.z += dt · change · (1 + 8·storm + 4·squall); every component wrapped mod 1. Time is wall-clock seconds (performance.now, mod 14 400), not the game clock; it is fixed at 3.0 in pictures. The noise is read as p/scale + drift.
- Replay (drift.mjs) at the opening place: the pattern moves east −6.0 m/s (against a wind to the east), north −25.0 m/s and up +28.3 m/s. Matching the noise 60 s apart gives −400 m east, −1 500 m north, +1 750 m up. The 'change' term is 0.009 × 4 200 = 37.8 m/s along the planet's spin axis, 6.3 times the wind.
- The drift advances only inside CloudVolume.render, i.e. only while the volume is drawn. The shell, the ground's cloud shadows, the tree-shade map and the far rocks read volume.drift, so all of them freeze above 30 km, in pictures, and while the governor's cloud-volume saving is on.
- Base lift (CloudVolume.setGround/place): 9 bilinear samples of the 383 m elevation map at ±0.4° round the camera, i.e. ±1 745 m on Haven (±44 km on Earth), recomputed every frame at rig.pos. Replay (lift.mjs): over 30 km of flight the base ranges over 956 to 3 118 m and moves up to 25–51 m per 100 m flown, sliding ground shadows 70–150 m per 100 m at the 19° morning Sun. On foot (lift2.mjs) 10 m north moves the base +1.07 m and the shadows 3 m. Base at the opening place: 2 618 m above the sea, ground 1 470 m.
- Volume lighting: directSun at 0.4 of the ray's stretch; sunward = clamp(0.5 + (d − d_280m_toward_Sun)·2.2 + (y − 0.42)·1.1) chooses 0.64 or 1.0 of the Sun; Henyey-Greenstein phase g 0.72 (0.55) plus a back lobe (0.45); sky light from above (0.45 + 0.55y) and below ((1 − y)·0.5), times 0.55. `above` darkening applies only when cover > 0.74 (smoothstep 0.74 to 0.97), and then a full base gets almost no Sun. uStorm (patches down to ×0.36) and uBolt (in-cloud flash) are driven only by the weather. sigma = 0.012·dense per metre. Aerial perspective at the mean depth.
- Shell lighting: directSun × forward term (0.6 + 0.9·cs⁸; from above 0.45 + 0.8·mu0) × under (from below mix(1, 0.6, cover)); colour 0.86·(sun·0.8 + sky·0.9 + sky·0.25)/π; from below in the painted look the thick middle ×0.8; relief from a noise tap 450 m toward the Sun, 0.6..1.24. The darkest Haven underside is about 0.4 of the lit value. Clean edge smoothstep(0.2, 0.38, cover); 2 detail octaves in the painted look.
- Cloud shadow on the ground (terrainMaterial.js cloudOver): follow the Sun up to the shell radius (one height), read the map plus cloudHeap (fine 0): near, shade = 0.85·smoothstep(0.06, 0.42, heap); far, 0.5·mean cover; sunlight × (1 − 0.85·shade), so a full heap leaves 28 % of the Sun. Patches up to 12.5 detail tiles across (vertices at most 20 m apart) do it at their vertices, farther ground per pixel (about 4 texture reads: map, field, cluster, heap).
- Trees, far forest and far grass read cloud shade from treeShade.js: 256×256 R8, 55 m a point, 14 km wide, re-centred every frame on the ground under the traveller (not snapped), one read per tree vertex. Replay (treeshade.mjs): at shadow edges the map is off from the true value by up to 0.44 (a full shadow is 0.72); 0.23 % of places are off by more than 0.1. Far rocks compute their own in the vertex shader.
- Not cloud-shadowed on Haven: everything lit through uWeather.x without OWN_CLOUD_SHADOW (hero, rocks.js near rocks, lander, leaves, dust) and grass within 30 m (grass.js line 460 mixes uWeather.x near). uWeather.x is fixed at 1 without weather.
- Volume pipeline per frame: march into a half-float RGBA target of 6 slices (0, 300, 900, 2 400, 5 000, 9 000, 16 000 m from the eye), each a quarter of the view each way, so 0.375 × the view's pixels (about 0.97 M at the benchmark's average 2 357×1099). 36 steps a ray become round(36/6) + 1 = 7 a slice (5 with cloud-steps). About 5–6 texture reads a step (map, 2 fair, 1–2 shape, 1 sun look, +1 within 1 km) plus 2 a pixel. Then a 4-tap smooth pass, an ALL pass (6 reads, one slice's size; only in the painted look), and up to 6 LAY sheets (a 24×12 grid, depth-tested, 2 reads a pixel with cloud). Targets are made once at the largest size: fw = ceil(W/4)·3 × fh = ceil(H/4)·2.
- Phone benchmark e9d4888 (Sharp, 28.5 fps average, 2.59 MP average; cost test held at 2.07 MP; baseline drifted 43→69 ms, so under 3 ms is noise): cloud-volume 2.0 (ledge), −1.7 (forest), 3.7 (from the air); cloud-steps 0.7 / −5.2 / −4.0 (noise); clouds (shadows) 2.7 / 5.5 / 0.5. Previous build 6ac24ff: cloud-volume 2.8 / 1.8 / 9.4 (before the ALL pass), clouds 4.0 / −0.4 / 0.8, cloud-steps 0.6 / 3.4 / −1.2. For scale, the ground's shading costs 31.1 (ledge) and 21.6 (air), and a frame with nothing drawn 22.7–26.2.
- Governor cloud steps (src/perf/governor.js): cloud-steps (group 1, buys 3.4; steps 36→22; live while the volume is wanted); clouds (group 3, buys 4.0; clouds.shadows = false removes ALL cloud shadows on ground, trees, grass and rocks); cloud-volume (group 3, last, buys 9.4; the volume off, the shell drawn everywhere); rain (group 4, half the streaks). The layer itself is never switched off. In the benchmark: cloud-steps off at 7.4 s, shadows off at 9.9 s, volume off at 12.3 s, with 74 steps of hunting.
- Earth-only weather machine: wind belts (−7 m/s at 15°, +10 at 45°, −4 at 75°) plus storm vortices; gusts; squalls on 64 s and 151 s cycles; a rain map with shower modulation; storminess from rain, wind and tops; lightning every 2–8 s where the hardest rain within 40 km is over 3.5 mm/h and tops over 7 km (strokes from 900 m; in-cloud flashes 2.5–5.5 km); flashLight; thunder at distance/343 m/s through audio.thunder; rain lit by skyLight; rain veil on land and sky. The bolt is 1-pixel GL lines that rely on bloom.
- Haven's own rainfall (make-world.mjs rains(): latitude bands, +700 mm from 100 to 1 500 m of height, −500 above 1 500 to 3 500 m, noise) is in haven_rain_720.u8. Only the rivers read it; nothing in the weather does.
- From space or the Moon, Haven's globe (sky/bodies.js) wears the static haven_clouds_4096.jpg with its own relief and shadow. Cloud colour [0.8, 0.8, 0.8] (solarSystem.js line 560).
- Texture limits: phones allow 16 per shader. The terrain's fragment shader is full at 16/16 (tClouds and tCloudNoise among them; its vertex shader reads 4 more). Varyings max 15. scripts/lib/glLimits.mjs checks these in smoke and screenshot runs. The march shader carries the lighting chunk's LUTs and froxels (about 6) plus noise, map and tops.
- Cost of the readers per frame: treeShade, a 65 k-pixel pass of about 4 reads; far terrain pixels about 4 reads each for cloudOver; near terrain per vertex; far rocks per vertex. The shell: one draw of a detail-48 icosahedron per frame with up to 4 vnoise octaves (2 in the painted look) and 3–4 noise reads a pixel where the volume matches.

**Gaps.**

- Only one kind of cloud. density() in cloudVolume.js and HEAP_GLSL in clouds.js carve one heap layer (base +0 to 3 000 m) from one 4.2 km noise. The fair-weather heaps are the same noise at the same height. Haven has no high cirrus or cirrostratus, no mid-level altocumulus or altostratus sheet, no low stratus, valley fog or mist, no towering cumulonimbus with an anvil (no tops map: uTops.z = 0, thickNow 3000), and no cap or lenticular clouds over peaks. The owner asked for 'multiple different kinds ... from high altitude ones to low storm-carrying dark clouds'.
- Clouds are not where real clouds form. The day's map (make-world-maps.mjs lines 74–92) is warped noise plus latitude belts, made without the terrain: correlation 0.03 with elevation, the same cover over land and sea (0.086 each), barely more over mountains (0.101 against 0.077). fairCover in FAIR_GLSL is noise only too. Nothing makes cloud from upslope wind, windward ranges, peaks, afternoon heating or a lee, though make-world.mjs already knows wet high ground (rains()). The owner asked for clouds 'around areas where real clouds will be mostly likely found like near the mountains'.
- The cloud fields themselves never move. mapCover() in cloudVolume.js and fairCover() / the map lookup in clouds.js take no wind. Only the carving noise drifts (q = p/scale + uCloudWind), so heaps appear and vanish inside fixed fields rather than travel. The globe from space (bodies.js) and the day's map are static for every date.
- Motion is wrong in direction and speed (CloudVolume.render lines 408–420). First, the drift is added to the noise coordinate, so the pattern moves AGAINST the wind (replay: −6.0 m/s east under a wind to the east, while the rain in rain.js moves with it). Second, `drift.z += dt·change` treats the planet's spin axis as 'up': at change 0.009 × 4 200 m it is 37.8 m/s, 6.3 times Haven's 6 m/s wind. At the opening place the clouds run south at 25 m/s and boil up through the layer at 28 m/s; at the equator it would be a pure 38 m/s north–south slide. Third, every height drifts at one speed (no shear). Fourth, the drift is capped at 20 m/s outside storms.
- Clouds stop moving whenever the volume is not drawn. The drift is integrated only in CloudVolume.render, and clouds.update, the ground, treeShade and farRocks merely copy it. With the governor's cloud-volume saving on (taken at 12.3 s in the owner's benchmark), above 30 km, and in every picture (time fixed at 3.0), the sky and all cloud shadows are frozen. The clock is wall time, so speeding up the game clock does not speed the clouds.
- No wind 'on a certain day': without a weather block, app.js lines 1184–1185 set uWind = rig.east × 6 m/s for every place, date and height. Its direction is the traveller's own east, a quantity of where the traveller stands, not of the world. There are no weather systems, no calm or windy days, and no storms. Earth's weather is also one fixed real date (2017-09-08) whatever the game's date.
- The sky moves when the traveller moves (the lesson 'Nothing about a thing in the world may hang on where the traveller stands', broken again). CloudVolume.setGround smooths the country's height over ±0.4°, which is ±1.75 km on Haven (the lesson 'anything in degrees is a guess about the world's size'). place(rig.pos) re-sets the whole layer's base every frame. The shell radius, its heap slice (up·R_shell/scale), the volume's profile window and the ground's projection height (uCloud.y) all shift with it. Replay: up to 51 m of base per 100 m flown, shadows sliding up to 150 m per 100 m at the morning Sun, and 3 m per 10 m walked. This is a likely part of the owner's 'shadows get jumpy when I'm moving around'.
- No rain comes out of the clouds. On Haven Weather.update returns without a weather block, so Rain, the veil, wet ground and puddles never happen. Even on Earth, rain is a 26 m box of streaks round the camera, driven by a rain map sampled at the traveller (weather.js rainAt, with an `under` test on the tops map), not by the cloud above. Nothing draws rain shafts or curtains under a distant cloud, so one cannot see rain falling from a storm from outside it. The owner asked for 'actual rain coming out of them when its time to rain'.
- Storm clouds are not dark. On Haven uStorm = 0 and uDense is a constant 3.4. Bases darken only where cover > 0.74 (6.5 % of the world) and then only to sky light. Fair heaps' bases get 0.64 of the Sun through the sunward rule. The shell's underside is at most mix(1, 0.6, cover) × 0.8, about 0.4 of the lit value. There is no anvil, no wall of dark cloud and no low ragged scud on Haven. The exposure meter also counts cloud pixels as lit surfaces (alpha), so it would brighten a dark sky back toward middle grey.
- No lightning or thunder on Haven. Weather.flash, flashLight, Bolt, uBolt and audio.thunder all depend on world.weather rain and tops maps (lightning needs tops over 7 km and rain over 3.5 mm/h within 40 km). Where it exists (Earth), the stroke is 1-pixel GL lines (bolt.js LineSegments) that read only through bloom, which the governor turns off early (the 'bloom' step, off at 8.3 s in the benchmark).
- Cloud shadows disagree between the things in a scene. On Haven the character, near rocks (rocks.js), the lander, leaves, dust and grass within 30 m (grass.js line 460) take uWeather.x = 1, so they stay in full Sun inside a cloud's shadow on the ground. The tree-shade map (treeShade.js) is re-centred every frame without snapping, so a tree at a shadow's edge swings by up to 0.44 in light as one moves 55 m. Shadows come from a 2-D slice at the shell's one height, not from the volume's 3-D shapes. The governor's 'clouds' step removes every cloud shadow outright rather than thinning (off at 9.9 s on the phone).
- No 'when it's time to rain': there is no daily or seasonal cycle of cloud (no build-up of afternoon cumulus, nothing passing through), the map is the same on every date, and nothing ties showers to the time of day or the season.

**Constraints.**

- The goal is a steady 30 fps in Sharp on the S23 Ultra, no frame late against 33 ms. Anything that adds cost gets a governor step (src/perf/governor.js, cheapest visual loss first), and the phone's benchmark cost table is the judge, never headless frame rates. Believe only differences over 3 ms that repeat at every view; the baseline drifted 43→69 ms in the last test.
- Governor steps thin; they do not remove what a place is about. A storm must stay a storm at the floor: the lesson 'with the cloud layer and the rain switched off, a hurricane was a calm blue sky'. The layer is never switched off today. Look at ?debug=floor pictures after adding steps. Today's 'clouds' step removes all cloud shadow and 'cloud-volume' leaves a flat, frozen shell: a new design should keep motion and kinds alive at the floor.
- Tile-based GPU rules: nothing reads the main picture's depth as a texture, and nothing is drawn elsewhere between its clear and its last draw. The volume is marched into small targets BEFORE the main picture and laid as depth-tested sheets after the ground. Render targets are made once at the largest size and used in part. Textures are uploaded between frames (renderer.initTexture) with no GPU mip generation mid-pass. Clear before full-screen passes.
- World-anchored: nothing about a cloud may depend on where the traveller stands or looks: base height, slices of distance from the eye (not view depth), the clean edge cut along the whole line of sight, the same clouds far (shell) as near (volume). Heights of clouds are over the country, not the sea (a 1 400 m base was fog on a 2.1 km plateau), but must not follow the traveller. On a 250 km world anything measured in degrees or 'share of frame' is a guess: today's ±0.4° smoothing is ±1.75 km.
- One rule, written once and handed to every reader. FAIR_GLSL and HEAP_GLSL (clouds.js) are used by the volume (cloudVolume.js), the shell, the ground (terrainMaterial.js cloudOver), the tree-shade map (treeShade.js → trees, far forest, far grass) and the far rocks (farRocks.js). weather.js sunShade copies the ground's law for uWeather. scripts/cloud-field.mjs is a JavaScript copy that must change with the GLSL. Change the writer and every reader in the same edit.
- Motion is integrated frame by frame (+= speed·dt, wrapped), never speed × clock (the clouds once slid back and forth). It must keep running when the volume is not drawn, because the shell and all shadow readers take the same drift. Movement is invisible in still pictures and in a helper's standing-camera pictures, so check direction and speed with Node replays or tests that fail when wrong.
- Texture limits: phones allow 16 textures per shader. The terrain fragment shader is at 16/16 (tClouds and tCloudNoise among them), so a new cloud map there must replace one or go through a small pre-pass map like treeShade (read in vertex shaders). Varyings max 15. scripts/lib/glLimits.mjs checks programs in smoke and screenshot runs. GLSL ES 3 reserved words (patch, sample, filter, input, output, common, active, partition, half) must not be used as names; no backticks in GLSL comments.
- Lighting: every lit surface goes through src/render/lightingGlsl.js. directSun carries uWeather.x unless a shader defines OWN_CLOUD_SHADOW (ground, grass table, far rocks, clouds). The hero, near rocks, lander, leaves and dust rely on uWeather.x, so cloud shade at the traveller must be fed there too (on Haven it is 1 today). Rain is lit by skyLight. Everything written to the HDR target is pre-multiplied by uExposure; lit surfaces write alpha 1, sky 0; clouds write their coverage as alpha, which the sun beams and the exposure meter read. A dark storm sky will be metered up unless held at its own level (as uGain does for things that must read white).
- Rain near the eye must be drawn in its own slice from the eye to the terrain's near plane (0.15 × height above ground); rain is drawn after the cloud volume is laid (weatherScene). Rain streaks are at least 2 px wide; one end is wrapped and the other worked out from it.
- Data-driven worlds: cloud kinds, weather, wind by day and storm settings belong in the world file (src/worlds/haven.js) as numbers and recipe names, with only generic engine features (never if (haven)). Earth's weather block and its readers must keep working. Height code under src/terrain/height must stay free of DOM and three, since it runs in workers and Node, if clouds need terrain (orographic) data. Maps are made by scripts (make-world-maps.mjs) and shipped in public/data as one grey picture per map, never several maps packed into one JPEG.
- Screenshot mode must be able to finish everywhere: __shotReady waits for cloudVolume.busy and clouds.loading. Weather is 'quiet' in pictures (settled values, no random lightning; debug=flash forces one). debug=noclouds must remove the clouds AND every shadow they cast. One headless browser at a time on the 4-core machine; from-the-air views take minutes and ground-level wooded views about 20 minutes.
- Judge amount and look from above and from below, at high ground as well as low, from 900 m and 2 km, toward the Sun and away. A cover set on one level of 3-D noise is not the cover of the sky (from below the union of all levels shows). The noise repeats every 4.2 km and was a wallpaper from 30 km until the clusters broke it. The far shell must show the same clouds the volume shows near.
- Cost headroom is thin. On the phone a frame with nothing drawn costs 22.7–26.2 ms in the cost test; the ground's shading 21.6–31.1 ms; the volume about 2–4 ms; cloud shadows about 3–5 ms. Earlier, the volume's laying alone cost 9.4 ms from the air until the ALL pass. More cloud kinds, rain shafts and storms must be paid for there (for example the march's reads a step, or a pre-pass map in place of per-pixel shadow work), and a new benchmark must be asked of the owner after any real added cost.

## Appendix: weather, wind, rain, lightning, thunder as they were (reader)

Weather lives in src/weather/weather.js (class Weather), driven once a frame from App (src/app.js ~1174-1200). A world opts in with a `weather` block of maps of ONE day; only Earth has one (8 September 2017: IMERG rain, MODIS cloud tops, a small cloud map, and a storms.json of ten cyclones incl. Irma, Jose, Katia). Everything is looked up at the traveller's single lat/lon: wind = a climatological zonal-belt formula (trades, westerlies, polar easterlies) plus a vortex round each storm, times a time-only gust wobble; rain = the map's mm/h at that pixel, varied by slow sines and 'squalls' (two beats of ~64 s and ~151 s) and only if the traveller is below the map's cloud top; snow by a rough Earth temperature model; wetness, a rain 'veil', the cloud's shade on the Sun and sky (from the 512 map), 'storminess' (by rain, wind, cloud-top height) and lightning (random strikes where the rain is hard under 7 km+ tops within ~40 km), with thunder queued at distance/343 s. These become shared uniforms: uWind (waves, trees, grass waves, leaves, pollen, cloud drift), G.uWeather (sun shade, sky shade, wet, veil), G.uFlash (lightning light added to every skyLight), plus rain.js (5 600 streaks in a 26 m box round the camera), bolt.js (a 1-pixel GL line stroke), rainbow.js (full-screen bow), and audio.js (synthesised wind, rain hiss and thunder crack/roll; no recordings).

Haven has NO weather block. Weather.update returns at its first line, so on Haven there is no rain, snow, wet ground, squall, storm, lightning (not even debug=flash, whose code sits after the early return), thunder, rainbow, rain or gale sound. The wind on Haven is app.js's fallback: uWind = (rig.east, sea.wind ?? 6) - a constant 6 m/s blowing toward the local east of wherever the traveller is, with no gusts and no day. uWeather stays (1,1,0,0), so the figure, near rocks, lander, dust and leaves are never put in a cloud's shade (the ground, grass, trees and far rocks work out cloud shade themselves). Haven's clouds are one kind (heaps in one layer: base 1 200 m over a smoothed country height, 3 000 m thick, a shell beyond 16 km) cut from a fixed made map (noise plus a latitude belt, nothing to do with the land) and fair-weather fields that are also fixed to the ground.

Cloud motion comes from the cloud volume's noise drift (cloudVolume.js render): drift += uWind.xyz*dt*min(20+35*storm, wind)/scale, and drift.z += dt*change*(1+8*storm+4*squall). The noise is read at p/scale + drift, so every feature moves by -drift*scale: the heaps go AGAINST the wind (trees, grass waves, rain and leaves go with it), and the 'change' term is a translation along the planet's polar axis, which slides clouds toward the south pole at change*scale*cos(lat) - 25 m/s SSW at Haven's opening place and 38 m/s at the equator, four to six times the wind's 6 m/s. The masks that say where cloud is (day map, fair fields, clusters) never move, so no cloud or weather system ever travels across the land. The rain is not tied to visible cloud: it is a per-place map value at the traveller, drawn as a box of streaks round the camera and a uniform grey veil over every line of sight; nothing is seen falling from a cloud a few km away (no shafts or curtains). Storm darkness is a few multipliers (uStorm patches on the base, denser cloud, skyShade down to ~0.28), and the exposure meter (post.js) then brings the frame back to mid-grey; the hurricane reference shot is a pale blue-grey.

**Files.**

- `src/weather/weather.js`: Weather class: setWorld loads a world's one-day maps; update() derives wind (windAt: zonal belts + storm vortices), gusts, squalls, rain/snow, temperature, wetness, veil, sun/sky shade, storminess, topNear, lightning strikes and the thunder queue; heard() hands arrived thunder to audio. Returns at its first line when the world has no `weather` (Haven).
- `src/weather/rain.js`: Rain/snow streaks: 5 600 camera-boxed quads (26 m box, 22 m tall, a third in a 9.4 m box), stateless vertex math, wind push accumulated on the CPU (uBlown), lit by skyLight; count by rate; drawn only below 3 000 m AGL.
- `src/weather/bolt.js`: Ground lightning stroke: THREE.LineSegments (1-pixel lines), up to 96 segments of random walk with branches, glow 400*sunE relying on bloom.
- `src/weather/rainbow.js`: Additive full-screen rainbow when the rain map shows rain 2.5-11 km (Earth metres) on the anti-solar side and the Sun is low.
- `src/audio/audio.js`: All sound, synthesised from one noise buffer: wind (by weather windSpeed, 0 on Haven), rain hiss and body (by rate), thunder() crack and two rolls with echoes; starts on the first tap.
- `src/app.js`: Wiring (lines ~1174-1200): wx.quiet/forceFlash in shot mode, Weather.update, uWind fallback for worlds without weather (rig.east, 6 m/s), G.uWeather/G.uFlash, rain/bolt/rainbow updates, thunder to audio, wind carrying a hovering figure (weather worlds only); 331-341 the weather scene; 1318 audio inputs; 1365 cloudVolume.render(..., uWind, weather); 1392-1400 weather scene drawn after the cloud volume is laid, rain again in a near slice.
- `src/sky/cloudVolume.js`: Cloud volume: drift accumulation from uWind and `change` (lines ~408-420, the sign and polar-axis issues), storm darkening (uStorm), denser cloud in storms, in-cloud lightning light (uBolt), thickness from weather.topNear, base over the country via setGround (3x3 samples at +-0.4 degrees).
- `src/sky/clouds.js`: Cloud shell beyond the volume; FAIR_GLSL/HEAP_GLSL shared by shell, volume, ground and tree shade (fairCover has no drift: fair-weather fields are fixed to the ground).
- `src/render/lightingGlsl.js`: uWeather (sun shade, sky shade, wet, veil), uFlash added to skyLight, directSun multiplied by uWeather.x unless OWN_CLOUD_SHADOW, rainVeil inside aerialPerspective.
- `src/render/globals.js`: Shared uniforms G.uWeather (1,1,0,0 by default) and G.uFlash.
- `src/sky/skyDome.js`: Rain veil over the sky (1 500 m overhead, up to 40 km toward the horizon), darkened by uWeather.y only through the veil.
- `src/terrain/terrainMaterial.js`: Ground: wet darkening and sheen from uWeather.z (one number for all ground), waves/ripples/whitecaps from uWind, cloud shadow from the heaps (cloudOver, uCloudWind); its fragment shader is at 16 of 16 textures.
- `src/water/waves.js`: waveScale(windSpeed): 0.462 at Haven's fixed 6 m/s; whitecaps need 7-14 m/s.
- `src/life/trees.js`: Trees bend toward +uTreeWind (= uWind) with their own time-based gust; cloud shade via treeShade.js.
- `src/life/leaves.js`: Leaves ride uWind downwind; wind-torn leaves only above 9 m/s (never on Haven).
- `src/life/grass.js`: Grass wind waves travel along +uWind (phase decreasing with time).
- `src/life/pollen.js`: Pollen carried by uWind, shaken by gusts (none on Haven), thinned by the rain veil.
- `src/hero/hero.js`: Robe/hair: a breeze in the body's own frame (lines ~355-364), not the weather's wind.
- `src/post/post.js`: Exposure meter (_meter): key / measured luminance with highlight/cover caps and an optional `dim` rule that neither Haven nor Earth sets: a darker storm is metered back toward mid-grey.
- `src/perf/governor.js`: Steps that touch weather/clouds: cloud-steps (3.4), clouds = cloud shadows (4.0), cloud-volume (9.4), bloom (1.1), rain = half the streaks (0.3), leaves (0.3), sun-beams (0.3); none for lightning, rainbow or thunder.
- `src/worlds/haven.js`: Haven: no `weather` block; clouds block (map haven_clouds_4096.jpg, altitude 3600, cover 0.45, shadow 0.85, volume base 1200, thick 3000, reach 16000, above 30000, scale 4200, dense 3.4, change 0.009, fair 0.44, clear 120); sea has no `wind`.
- `src/worlds/earth.js`: Earth: weather block (day 2017-09-08, rain 2048, tops 1024, cloud 512, storms.json), clouds block, cost view 'in the hurricane' at 60 m.
- `public/data/earth_storms.json`: Ten cyclones of the day (lat, lon, rain, peak, wind m/s; three named hurricanes).
- `scripts/fetch-earth-weather.py`: Makes Earth's day maps from NASA GIBS (rain byte = 60*log2(1+mm/h); tops byte = 16*km).
- `scripts/make-world-maps.mjs`: Makes Haven's cloud map (lines 74-92): warped fbm plus a latitude belt; unrelated to terrain or wind.
- `scripts/make-world.mjs`: Haven's yearly rain (rains(), lines 112-125: by latitude, +700 mm up to 1 500 m, -500 mm from 1 500 to 3 500 m), written as haven_rain_720.u8 for the rivers only.
- `docs/ARCHITECTURE.md`: Section 'Weather (src/weather/)' at lines 1057-1095 describes the design above.
- `docs/benchmarks/2026-11-25-haven-e9d4888.txt`: The owner's newest phone run and words; the Haven route has no rain at any stop.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/change.mjs`: Node replay: cloud drift split into east/north/up (the clouds go against the wind; the 'change' term slides them south).
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/base.mjs`: Node replay of cloudVolume.groundAt on Haven's elevation: the one cloud base for the whole sky as the traveller flies.
- `/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/temp.mjs`: Node replay: Weather's temperature at Haven's opening place, and its Earth-sized distances measured on Haven.

**Facts.**

- How wind is set on Haven: no `weather` block, so app.js line 1184-1185 sets uWind = (rig.east, world.surface.sea?.wind ?? 6) = 6 m/s toward the local east of the traveller's own position, every frame; no gusts, no squalls, no change by day or place. Its direction depends on the traveller's longitude: it turns 0.35 degrees per km flown east at 48.5 S (3.5 degrees per 10 km, 17 per 50 km).
- How wind is set on Earth (weather.js windAt): u = -7*g(15,10) + 10*g(45,12) - 4*g(75,10) m/s east and v = -sign(lat)*2*g(15,10) north, where g(c,w) = exp(-((|lat|-c)/w)^2) (trades, westerlies, polar easterlies: climatology, not that day's data). Plus, within 700 km of each storm, a vortex: vmax*(r/rmw)^1.6 inside the eye wall, vmax*(rmw/r)^0.62 outside, fading from 450 to 700 km, rmw 38 km by default, anticlockwise in the north, 34 % inflow outside the eye wall. Gust = 1 + 0.18*sin(0.37t)*sin(0.11t+1.3) + 0.08*sin(1.9t) + 0.4*squall: a function of time only, the same everywhere. windSpeed eases at 0.8/s; uWind.w is at least 1.5 m/s. There is one wind vector for all heights.
- Squalls: hard = clamp((rate-1.5)/9); squall = hard*min(1, 0.75*burst(64 s) + 0.55*burst(151 s)), where burst = (0.5+0.5 sin)^3 is phased by lon*7 and lat*5. Rain now = rate*under*(0.6 + 0.35*sin(0.05t+lon)*sin(0.023t+lat) + 1.5*squall); under = altitude ASL < max(map top, 2500 m).
- Earth's day maps: earth_rain_2048.jpg (byte = 60*log2(1+mm/h), about 20 km a pixel), earth_cloudtop_1024.jpg (byte = 16*km), earth_clouds_512.jpg (cover and shade), earth_storms.json (10 storms; Irma 69 m/s, Jose 67, Katia 44). All are fixed to 8 September 2017 whatever the game's date; storms do not move.
- Storminess = clamp(max(rate/14, (wind-13)/30, (top-7500)/7000))*under, eased at 0.4/s. The cloud volume reads it: uStorm = min(1, sN + 0.4*squall) breaks the lower 60 % of the cloud into patches 0.36 to 1.61 times as bright; density times (1 + 0.45 sN + 0.35 squall); drift speed up to 55 m/s; 'change' up to 13 times. Layer thickness = max(volume.thick, min(13000, weather.topNear) - base); topNear is 0 on Haven, so Haven's clouds are always 3 000 m thick.
- Shade: sunShade = 1 - shadow*smoothstep(0.2, 0.7, the 512 cloud map looked up toward the Sun); skyShade = (1 - 0.6*k(cover, 0.35, 0.8)*min(1, 0.55 + 0.15*rate))*(1 - 0.3*squall); both eased at 1.5/s. The ground shades itself by the drifting heaps (terrainMaterial cloudOver/cloudHeap), so the weather.js comment's 'same law as the ground' no longer holds. On Haven uWeather.x = 1: the hero, near rocks, lander, dust and leaves are never put in a cloud's shade.
- Temperature = 28 - 0.0065*min(alt, 11000) - 0.5*max(0, |lat|-18) - 9*cos(season)*min(1, |lat|/45); share falling as snow = clamp((1.5-T)/3). At Haven's opening place on its scene date this gives 0.0 C and 49 % snow (Node replay), if the model were switched on there.
- Wet ground: rises toward 1 while rain > 0.15 mm/h at (0.08 + 0.05*rain)/s and dries at 0.01/s. It is one number for all ground in view: albedo times (1 - 0.32*wet), plus a sheen of up to 0.7*wet.
- Rain's veil: veil = min(0.0045, 0.00014*(rain + 2*snow)^0.85) per metre. Every lit thing is mixed toward skyLight(up)*0.7/pi by 1 - exp(-distance*veil), the same in every direction (rainVeil inside aerialPerspective); the sky dome likewise, through 1 500 m overhead and at most 40 km toward the horizon.
- Rain drawn (rain.js): 5 600 streaks (22 400 vertices), each a quad turned to the eye. Box 26 m wide and 22 m tall round the camera; a third fall in a 0.36-size box. Count = 5600*sqrt(min(1, rate/6))*share. Drawn only when AGL < 3 000 m and rate > 0.1 mm/h. Falls at 9 m/s (snow 1.4), pushed by 0.5 of the wind (snow 0.8); smear 0.034 s; width max(3.5 mm, 1 pixel x distance) (snow 11 mm); lit by skyLight(up)*1.5/pi. Drawn in weatherScene after the cloud volume is laid, and again from 0.2 m to the terrain near plane (0.15*AGL) without the depth test.
- Lightning (Earth only): a look every (2 to 8 s)*(1 - 0.6*squall), with 10 random samples at 1.5 to 39.5 km ('Earth metres'). best = rain*(tops > 7 km ? 1 : 0.15); chance = clamp((best-3.5)/8). 40 % go to the ground; the light source is at 900 m above SEA LEVEL for a ground stroke, 2.5 to 5.5 km for an in-cloud flash. Power 0.6 to 1.4; life 0.5 s; flicker sin(38*age)*exp(-9*age). flashLight = power*flick*1.3*sunE/(1+(d/3 km)^2), added to every skyLight (uFlash). None above 18 km. Math.random throughout, so it is not deterministic.
- In-cloud flashes light the cloud volume within about 900 m of the flash (uBolt.w = flashLight.z*6); ground strokes do not light their cloud locally. Bolt geometry is built once, camera-relative at the moment of the strike: a 30-step walk down max(200, 900 - ground height) m with 12 % branches; LineSegments are 1 pixel wide on every GL; uBoltGlow = 400*sunE*power*flick, so it reads only through bloom.
- Thunder (audio.js thunder): it arrives at strike time + distance/343 s. loud = min(1, power*1.8/(1 + d/3000))*max(0, 1 - d/50000). A crack (lowpass 2 600 Hz, 0.35 s) under about 3.2 km; a roll (lowpass 140 to 300 Hz, 4 to 9 s) and a second roll (70 Hz, 6 to 10 s) that swell 3 to 5 times. Played only below 20 km AGL; Web Audio starts on the first tap. Rain sound: a highpass 2 200 Hz voice at 0.11*sqrt(rate/9) and a 500 Hz band at 0.10*rate/9. Wind sound: band 260 to 1 160 Hz, gain air*(0.10 + 0.6*blow) with blow = max(speed past/120, weather wind/45); the weather wind reads 0 on Haven.
- Cloud motion (cloudVolume.js lines 411-420): drift += uWind.xyz*dt*min(20 + 35*sN, uWind.w)/scale; drift.z += dt*change*(1 + 8*sN + 4*squall); the shader reads the noise at p/scale + drift (cloudVolume density, clouds.js cloudHeap, the ground's and the trees' shade). A feature therefore moves by -drift*scale. Node replay (scratchpad change.mjs), Haven calm: at the opening place east -6.0, north -25.0, up +28.3 m/s; at the equator east -6, north -37.8; at 70 N north -12.9, up -35.5. On Earth in a storm with a squall the polar-axis term alone is about 457 m/s horizontal.
- Where cloud is: the day map (tCloudMap) and the fair-weather field and clusters (fairCover: noise at up*k + 0.31, no drift) are fixed to the ground. Only the 3-D noise inside them drifts. The noise is a 64^3 RG8 Data3DTexture (R masses, G detail) that repeats every `scale` m (4 200 on Haven).
- The cloud base is one number for the whole sky: volume.base + groundAt(traveller), the mean of 3x3 elevation samples at +-0.4 'degrees'. On Haven a degree is 4 363 m (on Earth 111 km), so the smoothing spans only +-1.7 km. Node replay (scratchpad base.mjs) from the opening place: base 2 618 m; 450 m higher 2 km north, 3 486 m 5 km north; 2 231 m 10 km toward the opening view (heading 222), 1 622 m at 20 km.
- Earth-sized constants: weather.js turns metres into degrees with 111 200 m per degree on 7 lines, and rainbow.js on 1. On Haven that would put the lightning search at 1.55 km instead of 39.5, topNear's search at 2 km instead of 50, a storm vortex's reach at 27 km instead of 700, the eye at 1.5 km instead of 38, and the rainbow's rain looks at 0.43 km instead of 11.
- Clock: Weather.time and the cloud drift run on real seconds (uWave.z = (now/1000) mod 14400; a fixed 3.0 in screenshots), not on the game clock. Speeding up the clock ('.') moves the Sun but neither the weather nor the clouds. In screenshot mode the weather is 'quiet' (settled values, no random strikes); debug=flash forces a stroke 3 km to the north-east, but only on a world with weather.
- Wind takers: waves (waveScale 0.462 at 6 m/s; whitecaps need 7 to 14 m/s), trees (bend 0.004*w*gust, gust from their own clock), grass waves (travel along +wind), leaves (downwind; torn off only above 9 m/s), pollen (gusts = speed above its slow mean: none on Haven), clouds (above), rain (downwind), a hovering figure (carried at 0.5*wind with the stick released, weather worlds only). The robe and hair ignore the weather's wind (hero.js: a breeze in the body's own frame).
- Governor steps that touch weather and clouds, with what each buys on the phone: cloud-steps 3.4 ms (first in the ladder; 36 to 22 march steps), bloom 1.1 (the bolt's glow), clouds = the clouds' shadows on the ground 4.0, cloud-volume 9.4 (from the air, 9th results), rain = half the streaks 0.3 (unmeasurable; the 7th results' note: thinning 1 400 to 560 streaks in a storm saved nothing measurable), leaves 0.3, sun-beams 0.3. Lightning, the bolt, the rainbow and thunder have no step.
- Phone (benchmark e9d4888, Sharp, 30 fps target, 33.4 ms a frame): 28.5 fps on average; page work 7.6 ms on average. In the cost test, savings worth believing (3 ms or more): clouds 5.5 in the forest, far-relief 3.9 and 5.2, cloud-volume 3.7 from the air; with nothing drawn a frame still took 22.7 to 26.2 ms. In this run the governor turned off 'glow around bright things' (bloom) at 8.3 s and 'clouds with depth' at 12.3 s. No stop of the Haven route has rain, a storm or lightning: none of the weather has been measured on the phone on Haven, and on Earth only the 'in the hurricane' cost view ever had rain.
- Texture limits: phones allow 16 textures per fragment shader. The ground's fragment shader is at 16 of 16 (its cloud shadow already reads tClouds and tCloudNoise), so a new per-place weather map on the ground must replace one. scripts/lib/glLimits.mjs checks every program in npm run smoke and in screenshot runs.
- Haven's own weather inputs that exist but are unused by the weather: haven_rain_720.u8 (the year's rain, 3.2*sqrt(mm), 720x360 from longitude -180; wetter up to 1 500 m, drier above; by latitude band) feeds only the rivers. haven_clouds_4096.jpg / _512 is warped fbm plus a latitude belt (make-world-maps.mjs lines 74-92) with no tie to the terrain.

**Gaps.**

- Haven has no weather at all: haven.js has no `weather` block and Weather.update (weather.js line 87) returns before anything is computed. So on the world the owner flies there is no rain, no storm, no lightning (debug=flash cannot force one: forceFlash is past the early return), no thunder, no rain or wind sound, no wet ground and no rainbow. 'Actual rain coming out of them', 'thunder clouds much darker with lightning and thunder': none of it can happen on Haven today.
- Wind 'at different speeds based on the wind speed on a certain day': Haven's wind is app.js's fixed fallback, 6 m/s toward rig.east, with no gusts, no days, no change by place or height. Its direction even hangs on the traveller's longitude (3.5 degrees per 10 km flown east), against the rule 'nothing may hang on where the traveller stands'. Earth's wind is a climatological belt formula plus storm vortices, not that day's wind, with gusts that are a function of time only, the same everywhere.
- Clouds do not 'move like real clouds' or with the wind: (1) a sign error: cloudVolume.js adds the wind to the noise coordinate (q = p/scale + drift), so every heap and its shadow moves upwind while trees, grass waves, rain and leaves move downwind; (2) the 'change' term (drift.z += change*...) is a translation along the planet's polar axis, so heaps slide toward the south pole at change*scale*cos(lat): 25 m/s SSW at Haven's opening place and 38 m/s at the equator, four to six times the 6 m/s wind. What the eye sees of cloud motion is set by latitude, not by the wind.
- No cloud or weather system ever travels: the day map, the fair-weather field and its clusters (fairCover, no drift) are fixed to the ground and only the noise inside them slides. Heaps form at a mask's upwind edge and dissolve at its downwind edge, the far shell (which shows the map itself) never moves, and Earth's storms stand still. Both the rain map and the cloud map are one fixed day.
- One wind for every height: the drift uses the surface uWind (capped at 20 m/s, 55 in a storm) for the only cloud layer there is. Nothing lets high thin cloud race while low cloud crawls, and there is no wind shear, jet or day-to-day variation for the 'multiple kinds from high altitude ones to low storm clouds'.
- Weather knows nothing of mountains: windAt, the rain, storminess and lightning have no terrain term (no orographic lift, cap or banner clouds, lee clearing, valley/slope winds or afternoon convection over peaks). Haven's cloud map is noise plus a latitude belt (make-world-maps.mjs 74-92), and the only rain that knows height (make-world.mjs rains()) feeds just the rivers.
- Rain does not come out of clouds: the rate is the map's value at the traveller's pixel (Earth), with no check against the cloud volume overhead (it rains under a gap, and a visible storm 5 km away shows nothing falling). It is drawn only in a 26 m box round the camera plus one veil applied the same way in every direction, and nothing at all above 3 000 m AGL. There are no rain shafts or curtains from afar (listed as not done since milestone 10), and wet ground is one number for all ground in view.
- Storms are not dark: darkness is uStorm's patches, denser cloud and skyShade, and post.js's meter (key / measured luminance; no `dim` rule on Haven or Earth) brings the frame back toward mid-grey. look.js's grade has no weather input; the sky dome darkens only through the rain veil. docs/shots/earth_hurricane_rain.png shows a pale blue-grey eye wall. On Haven storminess is always 0 and the layer is always 3 000 m thick (topNear 0), so there is no tall or dark cloud at all.
- Lightning is weak where it exists (Earth): the stroke is 1-pixel GL LineSegments (the rain's lesson: one-pixel lines read as scratches on the phone). Its glow depends on bloom, a governor step that was off from 8.3 s in this benchmark. Its top is at 900 m above sea level, not at the cloud base over the country (bolt.js height = max(200, 900 - ground)). Ground strokes do not light their own cloud. The flash's light is one uniform added to every skyLight by its distance from the traveller. The geometry is built camera-relative and rides along with a moving traveller for its 0.5 s. Strikes use Math.random, so a benchmark would never meet the same storm twice.
- Earth-sized assumptions block reuse on Haven: 111 200 m per degree in weather.js (7 lines) and rainbow.js (1), so every distance would be 25 times too short on Haven (lightning search 1.55 km, storm reach 27 km). The temperature model is Earth's (0 C and 49 % snow at Haven's opening place on its date). The cloud base's +-0.4 degree smoothing is +-1.7 km on Haven, so the whole sky's base moves about 450 m in 2 km and about 1 km in 20 km of flight (cloudVolume.setGround; Node replay).
- The weather keeps no clock: squalls, gusts, rain variation and cloud drift run on real seconds (Weather.time, uWave.z). Earth's maps are 8 September 2017 whatever the date, and Haven's date (2024-09-22) selects nothing. There is no 'certain day', and a faster game clock does not move the weather.
- The figure and near things ignore cloud shade on Haven: uWeather.x is 1, so a heap's shadow darkens the ground, grass and trees but not the hero, near rocks, lander, dust or leaves. On Earth their shade comes from the coarse 512 map while the ground's comes from the drifting heaps, so a passing heap's shadow never reaches the figure.
- Wind-driven life is stuck on Haven: at a fixed 6 m/s leaves are never torn off (leaves.js needs more than 9 m/s), pollen never gets a gust, the sea never whitecaps (crests need 7 to 14 m/s; waveScale stays at 0.462) and a hovering figure is never carried. The robe and hair never answer the weather's wind at all (hero.js breeze in the body's frame).

**Constraints.**

- Data-driven worlds: Haven's weather must be a block in src/worlds/haven.js (maps, numbers, recipe names) read by generic engine code. No `if (haven)`. Haven's maps are made by rule in scripts (make-world.mjs, make-world-maps.mjs); nothing is copied from a real map.
- Anything moved by wind is added up frame by frame (+= speed*dt, wrapped), never speed times the clock (clouds and rain once slid about with every gust). New per-height or per-kind drifts must keep this, and must agree in sign with the trees, grass waves, rain and leaves, which all move along +uWind ('where the wind blows to').
- Nothing about the clouds, the wind or the weather may hang on where the traveller stands or looks (the clouds 'moved when I moved' four times). Today Haven's wind direction (rig.east) and the whole sky's cloud base (one groundAt value at the traveller, smoothed over only +-1.7 km on Haven) both break this. Weather must be a field over the world, evaluated per place, not one value at the traveller copied everywhere.
- Distances in degrees are Earth-sized guesses: use world.radius for metres per degree (Haven: 4 363 m a degree; a 4 km latitude band). Heights of things in the air are over the country, not over the sea: a cloud base, a lightning stroke's top and 'under the cloud' tests must use the country's height without following the traveller's ground.
- One rule in one place: the cloud cover/heap rule (HEAP_GLSL/FAIR_GLSL in clouds.js) is shared by the shell, the volume, the ground's cloud shadow, the trees' shade map (treeShade.js), the far forest, the grass and the far rocks. New cloud kinds or moving weather must change it there, or the shadows on the ground will no longer match the clouds above them. weather.sunShade (for the figure and near things) must use the same rule too; today it does not.
- uWind is one shared uniform read by waves, whitecaps, trees, grass waves, leaves, pollen and the cloud drift; changing what it means (or adding wind by height) changes all of them. The figure may only be carried by the wind while the stick is released ('flight must go where it is aimed').
- Nothing leaves the main picture between its clear and its last draw, and its depth is never a texture: the cloud volume is marched before the main picture into its own target, rain, the bolt and the rainbow are drawn in weatherScene after the volume is laid, and rain near the eye gets its own slice from 0.2 m to the terrain near plane (0.15*AGL). Rain shafts or curtains must follow the same pattern: drawn at set depths inside the picture, or before it.
- Rain must be lit by something the scene is not (skyLight above the veil's grey), and anything that must show on the phone must be at least about 2 pixels wide: one-pixel lines (today's bolt) read as scratches.
- The ground's fragment shader is at 16 of 16 textures on the phone: a new per-place weather map (wet patches, rain field, moving cloud field) for the ground must replace an existing one or be packed into one already read (one grey map per byte, never several packed into one JPEG's channels). Run glLimits via npm run smoke.
- Every new feature gets a governor step (cheapest visual loss first), and the last steps must leave the scene what it is: a storm must keep its dark cloud and its rain at the floor (the cloud layer is never switched off). Check with ?debug=floor pictures. 'Without lag' is measured on the phone: rain, lightning and storm darkness have never been measured on Haven, so the benchmark needs a stop with weather (its cost views are in src/worlds/haven.js scene.costViews).
- A scripted benchmark must not depend on the sky: weather in the benchmark and in screenshots must be deterministic (seeded by date and place, not Math.random). Screenshot mode sets wx.quiet (settled values, no random strikes), and anything __shotReady waits for must finish from every camera position.
- Debug switches must remove what a thing does everywhere: debug=noclouds must also take away new cloud kinds' shadows and their rain; debug=flash must work on every world with weather.
- The exposure meter (post.js, key about 0.16 to 0.18 middle grey) undoes darkening: a darker storm must be held dark on purpose (a `dim`-like rule or metering against the clear-day level). Very bright small things (the bolt) can own a brightness-weighted meter: check `ship` and storm views after any change.
- A look tuned in one place is wrong in another: check storms and rain from the ground, from 900 m and 2 km, toward the Sun and away, over low country and on Haven's plateaus (the opening place is about 1 400 m up, peaks to 4 314 m). A cloud base set over the sea is fog on a plateau.
- Sound is synthesised in audio.js from one noise buffer; any recorded sound must have its rights recorded in docs/ASSETS.md (the law). Audio starts only after a tap; thunder needs air (below 20 km AGL).
- Software WebGL headless: one browser at a time on the cloud machine; Node replays (like the scratchpad drift/base/temp scripts) and sketches before pictures; pictures of motion need several frames (the stability test), since a standing camera cannot show drift direction or popping.

