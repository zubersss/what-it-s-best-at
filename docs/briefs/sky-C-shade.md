# Brief C: cloud shadows and the light under them (one shade map fixed to the world, read by everything)

You build package C of the sky plan (`docs/briefs/clouds-weather-plan.md`): one cloud-shade
map fixed to the world, drawn before the main picture and read by the ground, the trees, the
far forest, the grass and the rocks; and a probe of three texels read back from the GPU, so
the figure and the things near it are shaded by the same clouds. A makes the field (until it
lands, step 0's stub), B owns the shared shader rule you build on, D makes the rain, the
strokes and the meter's storm hold.

Branch: `ccr-aa39490a-sky-C-shade`, begun from `origin/ccr-aa39490a-qiw63x` (a worktree
begins from `main`: check out that head first). That head holds step 0. If
`src/sky/skySystem.js` is not there, stop and tell the owning session. Report:
`docs/briefs/sky-C-report.md`, beside this file (its headings are there already).

## The owner's words

With the tenth phone results (2026-11-25): "the shadows need a lot of work: they get jumpy when
I'm moving around near them; also the clouds need a lot of work still: I want them to move like
real clouds ... they should move with the wind at different speeds based on the wind speed on
a certain day; ... the thunder clouds should be much darker and stormy looking".

Your part of it: every cloud's shadow fixed to the ground, sliding only with the wind, never
with the traveller; the same shadow on the ground, a tree, a rock and the figure; the land under
a storm dark. The clouds' share of "jumpy shadows" is yours. The Sun's own shadow maps are not:
they belong to `docs/briefs/shadows-governor-10.md`, which is being worked on at the same time.

## Read first

1. `CLAUDE.md`, all of it. These lessons bite here: nothing about a thing may hang on where the
   traveller stands (the trees' shade map slid with the traveller; the base followed the
   country under them); a small world shows every term in x times D over R (a plane 1 km over
   the ground: 0.8 m of error on Haven); a lattice whose cells change width by band cannot be
   indexed across bands; when two places must agree on a rule, one works it out and hands it
   to the other; the terrain's fragment shader is at 16 of 16 textures, and a new map must
   take the place of one; textures are uploaded between frames; a target of one byte a pixel
   read back into a buffer of four fills a quarter of it; a debug switch that hides a thing
   takes away what it does to everything else (`noclouds` and the shadow); what screenshot
   mode waits for must finish in every camera position; a test that moves the camera checks
   that it moved; software WebGL and the ground's cost (`--dsf 2.2`); a sketch tool's answer
   is only as wide as its question.
2. The plan, these sections: "SPINE AND GRAFTS", "WHAT THE OWNER WILL SEE", "THE SEVEN PARTS"
   (5, Shade), "CORRECTIONS TO THE THREE DESIGNS" (the figure through the probe; one writer),
   "STEP 0", "OUT OF SCOPE HERE", "BEHAVIOUR CHANGES TO LIST AT THE CHECKPOINT"; the shadow
   lines of each kind of cloud in "The kinds of cloud" (heaps; the deck's low-top channel A
   that keeps peaks in sunlight; mid takes up to half the Sun, channel G; high at most 15–25 %;
   fog's shade; a cell's exact chord in the shade pass); "DARK STORMS" part 2; under
   "Rendering and cost": "FRAME ORDER" (passes 2 and 3), "4. THE CLOUD-SHADE ATLAS",
   "GOVERNOR", "LIMITS"; "### C." under "Work packages" (your files, checks and pictures);
   "Risks" (the probe's read-back; the merges round `farRocks.js`); the appendix "the clouds as
   they were" (its second paragraph: how the shadows slide today).
3. `docs/briefs/sky-step0.md` (the names that stand, the rules for every package), then the
   tops of `src/sky/skySystem.js`, `src/life/treeShade.js`, `src/sky/skyGlsl.js` (from
   `SKY_FIELD_GLSL` down), `src/weather/sky/cellShape.js`; in
   `src/terrain/terrainMaterial.js` `CLOUD_OVER_GLSL` (about line 37), the vertex shader's
   `vCloud` line (about 211) and the light's cloud lines (about 918); in `src/rocks/farRocks.js`
   `SUN_VERT` (about line 72).
4. `docs/briefs/shadows-governor-10.md`: its files are not yours.
5. `docs/ARCHITECTURE.md`: "Clouds with depth" (the shadows) and "Frame order".

## Step 0 as built (branch `sky0/join`, commit 102eb11): what you build on

- **The shade map** is the sky system's `treeShade` part. Today it is `life/treeShade.js`'s
  `TreeShade` (`new TreeShade(terrain)`): 256 × 256 points 55 m apart on a level plane through
  the ground under the traveller. That plane moves with the traveller: that is the slide. Your
  `src/sky/cloudShade.js` takes its place. Its interface: `render(renderer, rig, sunDir,
  wanted, sky)` (before the main picture, into a target of its own; `sky` is the sky's frame:
  `t`, `noiseT`, `steer`, `rise`, `field`, `cells`); **`groundUniforms?(shared, sky)`** (if it
  is there the sky system calls it in place of its own: you write what the ground reads, and
  the old `tClouds` / `tCloudNoise` / `uCloudHeap` path stops; `SkySystem.groundUniforms`
  leaves alone a ground that has no `tClouds` or `tCloudNoise`); `saving?(id, off)`,
  `live?(id)`, `has?(id)` for `cloud-shade-rate` and `cloud-shade-coarse`. Hand the owning
  session its constructor line.
- **The probe** (`probe`) is a stand-in that draws nothing: `render(c)` (after the shade map,
  before the march), `pending` (true while a read-back a picture waits for is out: screenshot
  mode's `__shotReady` waits on it, through `SkySystem.busy`), and **`value`**: null, or
  `{ sun, sky }` (0..1) at the traveller (the figure's feet, else the camera), 1 to 3 frames
  late. When it has a value the sky system writes it into `G.uWeather.x` and `.y`, read by the
  figure, the near rocks, the lander, the leaves, the dust and the near grass. While it is null
  those come from `weather.js` (D's `sunShade`, `skyShade`). Under `noclouds`: none. It also
  answers `saving`, `live`, `has`, and `partOut` for the benchmark's part `cloud-shade`.
- **The shared rule** (`src/sky/skyGlsl.js`, B's file after step 0; the signatures are fixed):
  `skyShade(p, toSun)` (the shade's four channels at a point), `skyShadeCrisp(x)`,
  `skyShadeLight(s, h)` (what a lit thing at height h takes from a texel), and their JS twins
  `skyShadeJS(maps, noise, u, p, toSun)` (`u.uCloudRise` optional), `skyShadeCrispJS`,
  `skyShadeLightJS`. The noise through `skyLowNoise` (the steering and the rise); the field
  through `FIELD_GLSL` and `tWxA/B/C`; the cells through `CELL_GLSL` and `SKY_UNIFORMS.uCells`
  (the nearest 8). Declare shared uniforms only through the guarded texts
  (`SKY_FIELD_UNIFORMS_GLSL` and the rest), never by a line of your own. What you need changed
  there: ask B through the owning session.
- **The ground today**: its fragment shader reads 16 of 16 textures. `uCloudVol` is a vec4 in
  the ground, `treeShade` and `farRocks` (w the rise's phase), written every frame by
  `SkySystem.clockStep` and `groundUniforms`. The near ground takes the cloud at its vertices
  (`vCloud.xyz`, near tiles only); the far ground works it out per pixel (`cloudOver`: the
  map, the heap rule, a 0.5 × mean-cover path).
- **The governor** (main session's file) has your two steps: `cloud-shade-rate` (the middle
  window every other frame; after `pollen`) and `cloud-shade-coarse` (the near window not
  drawn, readers use the middle one at 220 m: the shadows stay; before `clouds`). They are
  passed by while `has` and `live` say no. `clouds` (every cloud shadow off) stays on the
  ladder until you land; then the owning session removes it and `cloud-shade-coarse` takes
  its place.
- **`debug=noclouds`**: no shadow anywhere, no shade on the figure. Keep it so.
- **Nothing of step 0 has been compiled by a GPU.** Your first headless picture is that test.
  The new GLSL to watch in your files: `skyLowNoise` and the guards in the terrain's vertex and
  fragment shaders, `treeShade` and `farRocks`' `SUN_VERT`.

## The jobs, in this order

1. **The test that fails first.** `scripts/cloud-shade-test.mjs` replays the addressing, the
   snapping, the anchoring and the readers' projection in Node, and exits 1 on any failure.
   Its four checks (below) must fail on today's `treeShade.js` arithmetic: the plan's replay
   had the map off by up to 0.44 while walking, and the ground's shadow edges sliding 3 m per
   10 m walked and 70–150 m per 100 m flown. Push and announce "C-1 pushed <commit>:
   cloud-shade-test fails on treeShade.js (1: off 0.44 ...)", with the lines it printed.
2. **The atlas** (`src/sky/cloudShade.js`): one RGBA8 texture of 1024 × 1024. The world window,
   1024 × 512, latitude and longitude, 1.53 km a texel, a sixteenth of its rows a frame (whole
   above x60). The near window, 256² at 55 m (14 km), and the middle one, 256² at 220 m
   (56 km), both drawn whole every frame, on lattices fixed to the world: tangent frames
   anchored at fixed world points about 20 km and 80 km apart, chosen with hysteresis, each
   window snapped to whole texels. Each texel is a point on the sphere R + 2 500 m. Channels: R
   the raw shade of the low cloud along the Sun's ray (heaps and sheets through `skyShade`, fog
   from field C, the cells' exact chords), G the Sun through mid and high, B the sky light
   left, A the top of the low cloud along that ray. One reader function maps them to sun and
   sky light with the crisp curve; a reader above A takes only G. `treeShade.js` becomes a thin
   re-export of the same names (`TREE_SHADE_UNIFORMS`, `TREE_SHADE_VERT`, `cloudShade(rel)`),
   so `trees.js`, `farForest.js` and `grass.js` stay untouched. Checks 1 to 3 pass.
3. **The readers.** The near ground at its vertices (`vCloud.xyz` = sun, sky, wet: no new
   varying); the far ground per pixel (1–2 reads, against about 4 and the heap rule today);
   the fragment shader from 16 to 15 textures (`tClouds` and `tCloudNoise` become
   `tCloudShade`), its vertex shader at its count (`tCloudShade` and field B in their place);
   the far ground's 0.5 × mean-cover path removed. Trees, far forest and far grass through
   `cloudShade(rel)`. Far rocks: one sampler where there are two (`SUN_VERT` only). Check 4.
4. **The probe**: three texels (the figure's feet, the camera, the lander), read back with
   `readRenderTargetPixelsAsync` as the meter does, synchronously in shot mode; `pending` with
   a time limit; the figure's shade eases, never jumps. Headless: the figure standing in a
   heap's shadow has `uWeather.x` within 0.05 of the atlas at its feet (today 1.0).
5. **Wet per place**: from field B in the ground's vertex shader into `vCloud.z`, in the place
   of `uWeather.z` on the ground (try it under `?debug=sky:storm`).
6. **The savings**: setters for `cloud-shade-rate` and `cloud-shade-coarse` that thin (at the
   coarse step the figure stays shaded), with `live` and `has`; `partOut('cloud-shade')`.
7. **The pictures** (below), each before and after.

## The checks

`node scripts/cloud-shade-test.mjs`, exit non-zero on any failure:

1. With the clock held, a fixed ground point's shade changes by at most 1/255 while the
   traveller walks 0–2 km in 1 m steps and flies 30 km.
2. A re-anchor changes values at fixed places by at most 0.02; a window's edge by at most 0.03,
   with a blend band.
3. Writer and reader agree within 5 m for a point 2 km above the reference sphere with the Sun
   15° up. Readers above the low top get only G.
4. The ground, a crown 30 m up, a far rock and the figure at one spot agree within 0.03.

One headless run: the figure in a heap's shadow (job 4); `glLimits` with the terrain's fragment
shader at 15 of 16 (today 16: it fails) and every changed program within limits;
`scripts/ground-cost-run.sh` against today's `terrainMaterial.js` (`git show
<step-0 commit>:src/terrain/terrainMaterial.js`): fewer reads at all ten views.

## The pictures

From a frozen build, `node scripts/shots.mjs --dist --distdir <build> --world haven --shot
ledge --size 880x412 --dsf 1.25 --out docs/shots/sky --query "..." --suffix _C-<view>
--timeout 1500`. Each one before and after. **From the air first** (three minutes each; one at
the eye in a wood costs twenty):

- the ledge from the air at 2 km (`alt=3513&pitch=-30`); shadows to the horizon from 5 km;
- a storm's shadow and its wet trail from 900 m (`sky:storm` first, A's model when it lands);
- `?debug=floor` at 2 km (the coarse step on: the shadows stay).

Then at the eye: the ledge; the north wood under one shadow's edge; **`shadeedge`**, new: the
figure standing at a cloud shadow's edge, dark with the ground, three frames 5 s apart as the
shadow moves with the wind (take it by query: `lat`, `lon`, `heading`, `pitch`, `t`, `hero=1`,
`heropose=stand`; hand the owning session its bookmark line for `haven.js`). And the stability
walk with the clock held (`npm run stability`, a case of your own in `scripts/stability.mjs`):
no cloud shadow moves between frames.

## Files

Yours: new `src/sky/cloudShade.js` and `scripts/cloud-shade-test.mjs`; `src/life/treeShade.js`
(the thin re-export); in `src/terrain/terrainMaterial.js` only `CLOUD_OVER_GLSL`, the vertex
shader's `vCloud` line, the light's cloud lines and the cloud uniforms in the material's list;
in `src/rocks/farRocks.js` only `SUN_VERT`; `src/render/globals.js` (only if the probe needs a
uniform there); `scripts/stability.mjs` (your case only).

Not yours: `trees.js`, `treeLod.js`, `nearShadow.js`, `rocks.js` and the rest of `farRocks.js`
(the shadows brief's); `farForest.js`, `grass.js` (untouched through the re-export); the
blocks "THE GROUND FROM AFAR" 1 to 3, the flowers and the water in `terrainMaterial.js`;
`src/sky/skyGlsl.js` (B's); `src/app.js`, `src/sky/skySystem.js`, `src/perf/governor.js`,
`src/perf/benchmark.js`, `CLAUDE.md`; step 0's `format.js`, `steer.js`, `cellShape.js`,
`stub.js` (changes through the owning session); `src/worlds/haven.js` (numbers go in your
report); A's, B's and D's files.

## Rules that bite

- Nothing about a shadow may hang on where the traveller stands or looks. The traveller
  decides only which windows are drawn, never a value.
- One writer: the atlas works the shade out once; every reader reads it, the figure through
  the probe. No reader works it out again its own way.
- No world's name in the engine. Every governor step thins, none removes.
- Every new script imports by relative paths, exits non-zero on any failure, and is seen to
  fail once with its fault put in.
- Keep green before every announced push: `./scripts/build-check.sh`,
  `node scripts/sky-system-test.mjs` (79 ok at step 0), `sky-steer-test.mjs` (34),
  `sky-format-test.mjs` (47), `sky-cell-test.mjs` (31), `node scripts/governor-sim.mjs`,
  `node scripts/far-ground-test.mjs`, `node scripts/shadow-fine-rocks-test.mjs`,
  `node scripts/far-tree-shade-test.mjs`, `npm run smoke`, and yours.
- One headless browser at a time on your machine. Long runs detached (`nohup setsid`), from a
  frozen build, writing a line to a log when each step is done.

## Cost

The phone's tenth results are `docs/benchmarks/2026-11-25-haven-e9d4888.txt`: Sharp, 28.5 fps,
0.86 % of frames late; the ledge at 25.9 fps, 3.0 % late, at 1.65 MP (the bottom of the
resolution range: no room). In its cost test the `clouds` saving (every cloud shadow off)
bought 2.7 ms at the ledge, 5.5 ms in the forest and 0.5 ms from the air; on the route the
governor turned "the clouds' shadows on the ground" off at 9.9 s. The plan: that row falls to
about 0.5–1.2 ms, the atlas costing about 160 k texels × 8 reads (0.3–0.6 ms). **That saving
pays for B's storms**: say plainly in your report what your counts show. Not yet measured: the
rise's fades (22 minutes in every 2.3 hours of game time) add one 3-D read per far-ground
pixel; count the ground in a fade and out of one. Every new cost gets a governor step that
thins, never removes: build its setter and send the owning session its id, label and what it
buys, to wire. Counts headless only (`ground-cost-run.sh` at `--dsf 2.2`), never a frame
rate; the phone decides.

## Merging

- Merge `origin/ccr-aa39490a-qiw63x` into your branch before every announced push, build, and
  run the checks.
- The other sky helpers' branches: `ccr-aa39490a-sky-B-clouds` (its changes to the rule reach
  the atlas through `skyGlsl.js`: merge it as soon as it builds), `ccr-aa39490a-sky-A-model`
  (the field: merge it as soon as it builds), `ccr-aa39490a-sky-D-storm`. Push early so B and D
  can merge you.

## What to hand back

- Each job as it lands, pushed and announced to the owning session in one line with the
  commit and the pair ("C-3 pushed abc1234: the ground reads the atlas, 15 of 16 textures;
  ledge pair in docs/shots/sky/"). Messages with `send_message` (its id is in your first
  message), short.
- The constructor lines for the shade map and the probe, the `shadeedge` bookmark line, and
  anything else needed in `skySystem.js` or `app.js`, under "Asked of the main session" in
  your report and in a message.
- Your report (`docs/briefs/sky-C-report.md`), kept as the work goes: what was built; each
  check with its numbers and how it was seen to fail; the pictures (paths); numbers for
  `haven.js`; cost counts (the ground's reads at ten views, before and after); behaviour
  changes for the checkpoint message; what is open.
- When all is done: "C-DONE pushed <commit>".
- Never put a model's name in a commit; end commit messages with the two attribution lines
  your session's instructions give.
