# The far grass: an independent review of the code (2026-11-23)

A reviewer that read the code cold, with no browser (branch `ccr-aa39490a-qiw63x` at
8556597; two findings backed by arithmetic replays in Node). Its findings as it gave them,
most severe first; "how sure" is its own word. What was done about each is in
`far-grass-report.md`. Line numbers are of `src/life/grass.js` at that commit.

1. **The grass slides and floats on Haven once the anchor's sphere is not at the ground**
   (`:471`, `:502`, with `:452`, `:137`, `:476-487`). The anchor was put at the camera's
   position and only made afresh 2 000 m away, height included. Table places are sampled
   along directions from the anchor's sphere but drawn at plain metres from the anchor.
   With the sphere D metres above or below the ground, a tuft x metres from the anchor
   stands on height sampled x*D/R away, and at every anchor step (each 200 m of travel) the
   whole field jumps se*D/R sideways in one frame. D is about 1 000 m after any descent
   from high flight, and equals the height difference after flying from the opening ledge
   down to a valley. Certain: R = 250 km, D = 1 000 m gives a 0.80 m jump at a 200 m step
   and tufts 0.92 m from the ground their height came from; Earth gives 0.03 m, which is why
   it never showed. Fix: keep the anchor on the ground's sphere.
2. **The wind's waves jump at every anchor step** (`:510`): `this.phase -= ...` must be
   `+=` (and divided by the wind's length). The wave is K.(q - A) + phase; when A moves by S
   the phase must grow by K.S. As written the bend of every blade and clump and the ground's
   stripes flick to a random phase every 200 m of travel, on every world. Certain.
3. **The clumps are never in the shadow that lies on the ground under them** (`:311-319`,
   `:401`). `grassLit` has the Sun, the slope's own light and the near shadow map (150 m)
   only: no land shadow, and the cloud shade at the traveller for every clump out to 520 m.
   A meadow in a ridge's shadow at low Sun, or under a cloud heap's shadow, is dark ground
   under sunlit clumps; stepping into a cloud's shadow dims all clumps at once. Certain from
   the code; likely to be seen. Fix: the cloud's shade per clump as `farRocks.js` does; the
   land's shadow by a worker job over the tables' places.
4. **Which flowers the ground wears depends on which way the traveller last moved**
   (`:466`, `:558-560`). `_floraSeen` is added to only by entries sampled since the last
   tone update: the newest rows ahead. Their majority becomes `uGrassTone.z` for all ground
   in view. Certain about the mechanism. Fix: keep each mid-table entry's flora and tally
   the whole table.
5. **The ground's grass is laid on ground that has none** (`terrainMaterial.js:514` with
   `grass.js:561-566`). `gw` is the mean share of grass in the 512 m round the traveller
   times `flatW` times distance, with no word from the place itself: flat snow, the strand
   and bare flats within 600 m of a traveller standing in a meadow are painted grass gold,
   and turn back as the traveller walks onto them. Certain about the code path; likely
   visible at the snow line and on shores. Fix: the place's own grass amount through a map
   the shader already reads; as a stopgap, fade by the map's brightness.
6. **On Earth the ground's flower specks are blocky and crawl** (`terrainMaterial.js:521-531`).
   `flNoise(planetPos / 1.3)` needs the place to centimetres; `planetPos` in 32-bit floats
   has 0.5 m steps at Earth's radius (0.02 m on Haven). Certain about the arithmetic. Fix:
   camera-relative metres plus the camera's whole cell and fraction worked out in doubles;
   or scales that are multiples of one length and one snapped origin.
7. **Two costs with no lever** (`governor.js:44-45`, `terrainMaterial.js:521-535`,
   `grass.js:543-548`). (a) The ground shader runs `flowersAt` plus two more noises, up to
   40 integer hashes a pixel, on all grass ground out to 2.5 km and up to 3 000 m over the
   ground; beyond 900 m its share is at most 2 % of the colour. (b) A table place costs 2.8
   to 7.9 microseconds; 300 a frame is 0.8 to 2.4 ms of page work, pinned there in boosted
   flight above about 1 500 m and for 2 s after every map arrival, only to feed a mean.
8. **Entries marked "no grass yet" keep another place's height**, blended into the ground
   height of tufts beside them (`:372`, `:130-134`, `:297-300`): a dotted curtain of clumps
   in the air along the fill's edge for about 45 frames. Possible. Fix: weight each entry's
   height by its amount in `tableAt`.

Found clean: no sampler added to the ground's fragment shader (still 16); tables and the
clump picture go up between frames with mip maps made on the CPU; every switched-off tuft
is thrown out of the picture; no reserved GLSL word or backtick; no grass worker job, so
nothing sent every frame; `busy` ends in screenshot mode; tables are made again when maps
arrive; `setWorld` mutates and resets correctly; every lattice spacing and table cell
divides the 40 m step; nothing in degrees or 111 km; no world-specific code path; both
governor steps thin and undo cleanly.
