# Brief C: cloud shadows and the light under them (one shade map fixed to the world, read by everything)

Read `docs/briefs/sky-step0.md` first (what stands, the rules for every package), then
the plan (`docs/briefs/clouds-weather-plan.md`): "5. Shade" in "THE SEVEN PARTS", "4. THE
CLOUD-SHADE ATLAS" under "Rendering and cost", the shadows' paragraphs of each kind of
cloud, and "### C." under "Work packages", which is your job, its files, its checks and its
pictures. Branch `sky-C` from the head of the main session's branch. Report:
`docs/briefs/sky-C-report.md`. Also read `docs/briefs/shadows-governor-10.md`: its files
(`trees.js`, `treeLod.js`, `nearShadow.js`, `rocks.js`, and `farRocks.js` lines 36 and 321)
are not yours.

## The interfaces you build behind (src/sky/skySystem.js; do not edit it)

- **The shade map** is the sky system's `treeShade` part (today `life/treeShade.js`'s
  `TreeShade`; your `src/sky/cloudShade.js` takes its place, and `treeShade.js` becomes the
  thin re-export the plan names, so `trees.js`, `farForest.js` and `grass.js` stay
  untouched). Its interface: `render(renderer, rig, sunDir, wanted, sky)` (before the main
  picture, into its own target; `sky` is the frame: `t`, `noiseT`, `steer`, `field`,
  `cells`), **`groundUniforms(shared, sky)`** (if it is there the sky system calls it in
  place of its own: you write what the ground reads, and the old `tClouds`/`tCloudNoise`/
  `uCloudHeap` path stops), `saving(id, off)`, `live(id)`, `has(id)` for
  `cloud-shade-rate` and `cloud-shade-coarse` (passed by on the ladder until `has` and
  `live` say yes). Hand the main session its constructor line.
- **The probe** (`probe`, today a stand-in): `render(c)` (after the shade map, before the
  march), `pending` (true while a read-back a picture waits for is out: screenshots wait on
  it), and **`value`**: null, or `{ sun, sky }` (0..1) at the traveller (the figure's feet,
  else the camera), 1 to 3 frames late. When it has a value, the sky system writes it into
  `G.uWeather.x` and `.y` (the figure, near rocks, lander, leaves, dust, near grass); while
  it is null those come from `weather.js` (Earth's maps) as before. `saving`, `live`,
  `has`, `partOut` as the stand-in has them.
- The shared rule you build on (`src/sky/skyGlsl.js`, package B's after step 0, signatures
  fixed): `skyShade(p, toSun)` (the atlas's four channels at a point) and
  `skyShadeLight(s, h)` (what a lit thing at height h takes from a texel), with their JS
  twins; the noise read through `skyLowNoise` (the steering and the rise), the field's
  maps through `FIELD_GLSL`, the cells through `CELL_GLSL` and `SKY_UNIFORMS.uCells`.
- The ground: `terrainMaterial.js`'s `CLOUD_OVER_GLSL` and the light at the far ground
  (the plan's lines). Its fragment shader is at 16 of 16 textures today: `tClouds` and
  `tCloudNoise` become `tCloudShade` (15 of 16). `uCloudVol` is a vec4 since step 0 (its w
  the rise); the shared uniforms are declared through the guarded texts only.
  `SkySystem.groundUniforms` leaves alone a ground that no longer has `tClouds` or
  `tCloudNoise`.
- When you land, the main session takes 'clouds' (every cloud shadow off) off the ladder:
  `cloud-shade-coarse` is the saving then, and it keeps the shadows.

## Checks and pictures

The plan's four checks in `node scripts/cloud-shade-test.mjs` (it must fail on today's
`treeShade.js` arithmetic), the headless run (the figure in a heap's shadow, glLimits with
the terrain at 15 of 16, `ground-cost-run.sh` against today's `terrainMaterial.js`), and
the pictures, each before and after, with the new shot `shadeedge`.
