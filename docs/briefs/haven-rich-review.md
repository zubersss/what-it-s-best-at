# The cold review of the rich-and-smooth delivery (2026-11-24)

Six readers, one part each, read the code at b92ace8 cold (no browser; small replays in Node).
Each finding then went to a second reader told to refute it. "Holds" means the second reader
could not; "refuted" means it could (kept here with the reason, for the record).
Builders: prove each finding against the code as it is before fixing it, and where a number can
show it, add a check that fails before the fix.

## trees (trees helper)

### trees-1. Which mesh a tree gets is judged from where the list was made, which can be 25 m behind the eye, and the close radius (20 m) is now smaller than that

`src/life/trees.js:489`, high; check: **holds**

**What goes wrong.** Close, near or far is chosen by `d2`, the tree's distance from the anchor (`A = this.anchor.copy(p)` at build time, lines 460-477). The lists are only made again after the eye has moved REBUILD_M = 25 m (line 449). With CLOSE_M = 20 and NEAR_M = 60 (line 27), no tree near the eye is sure to get the close mesh. A tree 21 m from the anchor stays the near mesh (big 2.5-4 m sprays, no twigs) until the walker is right beside it. Then, at the next rebuild, every tree that crossed a radius changes make in the same frame. The old 42/115 m hid this: every tree within 17 m was always close and every tree within 90 m was always near.

**What one sees.** Walking or flying low through the opening wood, the trees ahead, where the player is looking, are the middle-distance make until they are a few metres away. Every 25 m they all switch to the full skeleton together, and the trees behind fall back. With the governor's trees-far step on (fraction 0.66), trees 15 m away can be two crossed pictures. From the air the ring where full trees turn into rosettes jumps 25 m at each rebuild. This defeats the delivery's main aim, detail for the trees one stands among.

**Evidence.** trees.js:27-28 (CLOSE_M 20, NEAR_M 60, REBUILD_M 25), 449 (rebuild only after 25 m or on dirty), 460-480 (d2 measured from the anchor), 489 (lod from that d2). I replayed it in Node (scratchpad/review/lod.mjs): a walker at 1.4 m/s through trees on a 2 m grid. At full shapes the nearest tree still drawn as the near mesh was 0.0 m from the eye, the nearest far-card tree 35 m away, and close meshes reached 44 m. At fraction 0.66 the nearest far-card tree was 14.9 m away. The report's known problem 2 assumes the change happens at 20 m from the eye, but it happens anywhere from 0 to 45 m.

**Suggested fix.** Choose close or near by distance from the eye. Smallest change: a second, shorter rebuild trigger for the mesh choice, e.g. remake the lists when the eye has moved CLOSE_M * fraction / 4 (5 m) while near trees are drawn, and keep REBUILD_M for the list's reach. Alternative: keep a band of trees in both the close and near lists and cut them in the vertex shader by length(foot) against a radius uniform, the same way the 240 m join is cut.

**The check.** The claim holds; I could not refute it.

How the code works:
- `src/life/trees.js:27-28` sets CLOSE_M = 20, NEAR_M = 60 and REBUILD_M = 25.
- `update()`, line 449: `_build` runs only when `this.dirty` is set or the eye has moved more than REBUILD_M from `builtAt`.
- The only things that set `dirty` are a block's reply, the Sun sweep, a new day, setFraction and the tree-leaves step. A walker in a wood that is already loaded sets none of them, so in practice the lists are remade every 25 m.
- `_build`, lines 460-477: `A = this.anchor.copy(p)`, and `d2` is measured from that anchor.
- Line 489: `lod = d2 < close2 ? 0 : d2 < near2 ? 1 : 2`, from that same `d2`.
- Nothing in the vertex shader re-chooses the mesh. `treeCull` (length(foot) > uTreeRadius) only cuts at the 240 m radius.

So which mesh a tree gets is frozen for up to 25 m of travel. Because 25 m is more than the 20 m close radius, nothing near the eye is sure of the close mesh. Example: a tree 21 m ahead of the anchor is still the near mesh when the walker reaches it.

Before this delivery (42/115) the close mesh was guaranteed within 42-25 = 17 m, and the near mesh within 90 m. Now there is no guarantee at all. With the governor's `trees-far` step on (setFraction(0.66), governor.js:69), the cards begin at 39.6 m from the anchor, which can be 14.6 m from the eye.

My own replay (scratchpad/review/lodv.mjs) used 7 m spacing as on Haven, with a straight walk:
- At full shapes, the nearest tree not drawn close was 0.0 m from the eye.
- The nearest tree drawn as cards was 35 m away, or 15 m at fraction 0.66.
- Close meshes reached 44.5 m from the eye.
- Of the trees within 10 m of the eye, 25 % are not drawn close; within 15 m, 29 %; within 20 m, 39 %. With the old 42/115 it was 0 % within 15 m.
- With a 6 m rebuild step it drops to 0.2 %.

Known problem 2 in docs/briefs/trees-refined-report.md accepts a change of make at about 20 m from the eye. It does not cover trees within a few metres staying the near mesh, or a whole band of trees switching at once every 25 m. So this is not covered by an accepted known problem.

Severity is high. The player sees it in normal play: walking through the opening wood, a quarter of the trees beside the walker are the plain near mesh (2.5-4 m sprays, no twigs, no flare), and every 25 m a band of trees changes make at once. That defeats the delivery's main aim. Still pictures do not show it, because a screenshot builds its lists at the eye.

One part of the scenario is not new: from the air, the ring where near trees become cards jumping by 25 m at each rebuild was already so with 115 m.

### trees-2. The shadow pass collapses the trees' upright cards by the eye's angle, so shadows shrink to small discs in a ring round anyone looking down

`src/life/trees.js:96`, medium; check: **holds**

**What goes wrong.** TREE_VERT, including the new `edge` term and `treeCull = ... || edge <= 0.0` (line 108), is also pasted into the depth material's vertex shader (line 286). `foot` there is relative to the main camera, not the Sun. The near trees cast as their far mesh and the far trees cast as themselves (lines 330-337). Their shadow silhouette is the aLeaf-4 whole-tree cards, which this rule removes when the eye looks down more than 49 degrees, leaving only the rosette lying in the crown.

**What one sees.** Flying 40 m over a wood, or looking down from a ridge, every tree within about 30 m along the ground (in the near or far list) loses its long shadow. It casts only the small disc of its rosette (a fir's is 0.2 tree heights wide, at 0.3 of its height), while beyond that ring trees keep full shadows. The ring moves with the traveller, and shadows shrink and grow as he climbs and sinks: the owner sees it 'move when I move'. The near-mesh trees are drawn whole above their disc shadows.

**Evidence.** trees.js:96 (edge from dot(-normalize(foot + up*0.7h), up)), 108 (treeCull), 286-292 (depth vertex shader = TREE_VERT; gl_Position thrown out on treeCull), 330-337 (casters). nearShadow.js renders the casters with the same shared uniforms (uAnchorRel is camera-relative) and places the orthographic camera relative to the camera. EDGE0/EDGE1 are 0.75/0.93 (farTreeForm.js:34).

**Suggested fix.** Leave the cards whole in the shadow pass, because a shadow is the tree seen from the Sun: add `#define TREE_DEPTH` to the depth material and use `edge = 1.0` under it in TREE_VERT. Alternatively, collapse the cards by the Sun's elevation instead of the eye's.

**The check.** The defect holds. The lines that produce it:

- **trees.js:96** (new in this delivery, commit ddd47a1). `edge` is computed only for `aLeaf > 3.5` (the whole-tree upright cards) as `1 - smoothstep(0.75, 0.93, dot(-normalize(foot + uTreeUp*0.7h), uTreeUp))`. `foot = uAnchorRel + iA.xyz` (line 86), and `uAnchorRel = anchor - rig.pos` (line 452), so the angle is the main eye's.
- **Line 97** (`p.xz *= ... * edge`) narrows those cards, and **line 108** (`treeCull = ... || edge <= 0.0`) throws them out completely.
- **Lines 284-292.** The depth material's vertex shader is `${TREE_VERT}` with the same `this.shared` uniforms and no define to tell it apart. Its `gl_Position` is thrown out when `treeCull` is set.
- **nearShadow.js render().** It places its orthographic camera relative to the main camera (`cam.position = lx*u.x + ly*u.y + lz*D`) and draws each caster with `c.depthMaterial`, so `foot` in that pass is still measured from the eye, not the Sun.

Which meshes cast (lines 325-337 and app.js:303):
- Close trees cast as the near mesh, which has no aLeaf-4 cards, so they are untouched.
- Near trees (20-60 m) cast as the far mesh. treeGeometry.js `make` maps lod 2 to `whole()`: two upright cards with aLeaf 4 and a rosette with aLeaf 3. So these trees are drawn whole in the main pass as skeleton and sprays, but cast through the collapsing cards.
- Far-list trees cast as themselves.
- The rosette has `edge = 1`, so it is the only shadow left.

The far forest's shadow quads draw only beyond the near radius, so nothing else stands in for these shadows.

Replay of the shader's arithmetic, with the crown at 0.7 of the tree's height. Each figure is the card width left at that horizontal distance from the point under the eye:

| Height over ground, tree height | 0-10 m | 15 m | 20 m | 25 m | 30 m | 40 m | 60 m | 80 m |
|---|---|---|---|---|---|---|---|---|
| 40 m, 20 m trees | 0 | 0.29 | 0.86 | 1 | 1 | 1 | 1 | 1 |
| 40 m, 10 m trees | 0 | 0.03 | 0.37 | 0.83 | 1 | 1 | 1 | 1 |
| 100 m, 20 m trees | 0 | 0 | 0 | 0 | 0 | 0.05 | 0.66 | 1 |

So there is a ring round the point under the eye where each tree's shadow is only its rosette disc, and thin slivers just outside it. The ring widens and shrinks as the traveller climbs and sinks. That is the "move when I move" failure the hard-won lessons forbid, and a shadow is the tree seen from the Sun, never from the eye.

Neither docs/briefs/trees-refined.md nor trees-refined-report.md lists this as known or accepted. Known problem 4 there is about crowns from above, not this.

Why medium and not high: in level cruise the bottom of the screen is at about 40 degrees down, where trees keep their cards, and on foot the crowns are above the eye (edge = 1). The ring shows when looking down steeply from the air or from a ridge, as in the from-above views (100 m up, 60 degrees down: the middle of the picture has its cards at about 58 % width, the bottom none). It costs nothing on the phone.

### trees-3. Petals: every rebuild of the tree lists clears the lying petals and moves falling petals to other trees

`src/life/leaves.js:216`, medium; check: **holds**

**What goes wrong.** `Trees._build` makes a new `blooming` array every time (trees.js:484, 500). Petals checks it by identity (`this.serial !== list`). On every build it hides all 480 lying petals (line 225) and puts them back 6 a frame. It also gives slot s to `list[s % list.length]` of a list sorted by distance from the new anchor (lines 219-222), so a slot's airborne petals (`rel = uAnchorRel + tr.xyz + ...`) jump to another tree whenever the order or the number of nearby flowering trees changes. `this.abs` and `this.put` are written but never read: the re-anchoring they were meant for is missing.

**What one sees.** In the opening place's parkland (about one tree in six is a cherry or blackthorn), the lists are rebuilt every 25 m of walking, at every tree block arrival or Sun sweep, every game day and every governor tree step. Each time, the carpet of petals under every flowering tree vanishes at once and creeps back over 80 frames (2.7 s in Sharp, 1.3 s in Smooth), and petals in mid-air jump from one crown to another.

**Evidence.** trees.js:363 (dirty each day), 444 (dirty on block reply), 449 (25 m), 484/500 (new array each build). leaves.js:216-226 (reset on identity), 225 (all lying petals hidden), 228-246 (PER_FRAME = 6), 220 and 224 (slot assignment by list[s % list.length]).

**Suggested fix.** Key each slot by its tree's foot in the world (A + t.xyz). Keep a slot and its lying petals while that tree is still in the list, only re-expressing `lie = abs - A` for the new anchor (what `this.abs` was kept for). Clear and re-place only the slots whose tree has changed.

**The check.** The defect is real. I read the lines below and found nothing that prevents it, and neither brief lists it as known.

How it happens:
- `src/life/trees.js:484` makes a new `const blooming = []` in every `_build`, and line 500 assigns it to `this.blooming`. Nothing reuses the old array.
- `_build` runs from line 449 whenever `this.dirty` is set or the traveller is more than `REBUILD_M` = 25 m (line 28) from where the lists were last built. `dirty` is set:
  - at every new game day (line 363),
  - at every block reply that is not for the Sun (line 444),
  - when a Sun sweep is all in (line 429; a sweep happens when the Sun has moved about 1.5 degrees, roughly every 6 minutes at real time),
  - at every governor tree step (`setFraction`, line 515),
  - when the atlas arrives (line 136).
- Every `_build` also moves the anchor to the camera (line 460).
- In `src/life/leaves.js`, `update` runs after `trees.update` in the same frame (app.js 1262, 1270). It reads `list = tr.blooming`, and line 216 compares `this.serial !== list` by identity, so this branch runs after every `_build`. In it:
  - line 217: `put.fill(0)` and `next = 0`;
  - line 225: `w = 0` for all 480 lying petals, so every lying petal under every flowering tree disappears in the same frame;
  - lines 231-249: they are put back at most `PER_FRAME` = 6 a frame (and fewer when `drawnHeight` returns null), in index order spread round-robin over the 8 slots. That is 480 / 6 = 80 frames: 2.7 s at 30 fps (Sharp, the default) or 1.3 s at 60. The carpet grows back under every tree at once.
- At the opening date `bloomOf` gives `fall >= 0.5 * open`, so `step(aSeed.z, fall * 1.3)` shows at least 65 % of the lying petals. At about 10 m a 9-14 cm petal is roughly 12 px wide, so the carpet is clearly visible and so is its blink.

Falling petals:
- Lines 219-221 give slot s the tree `list[s % list.length]`, where `blooming` is in nearest-first order from the new anchor (the list is sorted by `d2` at trees.js 483 and pushed in that order at 497).
- A falling petal has no state of its own. Its position is `uAnchorRel + uPetalTree[s].xyz + f(clock, seed)` (leaves.js 181), and a petal lives 8 to 14 s.
- So whenever the number of flowering trees within 90 m changes (for example 3 to 4 remaps slots 3 to 6), or two trees swap places in the distance order after a 25 m move, every petal in the air from a remapped slot jumps to another crown in one frame.
- When standing still the order holds and the falling petals stay put, but the lying-carpet reset still happens at every rebuild.

Unused fields: `this.abs` (line 247) and `this.put` (lines 217, 247) are written but read nowhere, and neither is `this.anchor` (lines 198, 226). The re-anchoring they were kept for was never written, so a full reset is the only way the code deals with an anchor move.

Briefs: `docs/briefs/trees-refined-report.md` lists only these petal problems: a still scatter, lying petals sitting on the land class's grass tips, and a ground-drawn carpet being better. The blink and the jumps are not listed. This is the "moves when I move" kind of defect in the hard-won lessons. A walker among the opening place's cherries sees every carpet vanish and grow back every 25 m and at each block arrival.

### trees-4. A flowering tree out of flower keeps only a quarter of its foliage near by, while the far forest draws it full: the same tree changes at 240 m for ten months of the year

`src/life/trees.js:188`, medium; check: **holds**

**What goes wrong.** Out of flower `vBloom.w = bloomOf(...).open = 0`, so `h >= vBloom.w` discards every petal texel, and the depth pass does the same (line 304). Petals cover three quarters of the blossom spray and of the BLOSSOM shape's whole-tree pictures. The far forest (farForest.js:225) has no such test: it draws those texels as leaves in the leaf colour (`inFlower` returns sp.leaf out of flower). There is a second disagreement between the near and far rules: trees.js:183 takes wood as `cut.b > 0.5` for trees that never flower, while farForest now takes `> 0.75` for every tree.

**What one sees.** Move the clock outside day 62-118 (cherry) or 55-105 (blackthorn), shifted half a year in the south. That is most of the year, and the owner asked for the seasons. The cherries and thorns in the meadows and the opening parkland are then a sparse lace of twigs with a few leaves, with thin shadows to match, not the 'small round-leaved trees' the report describes. At 240 m the same tree becomes a full green crown. On every other tree, texels where twig and leaf are mixed (0.5 < b <= 0.75) change from twig-brown to leaf-green at the same line.

**Evidence.** I measured public/data/tree_atlas.png. The blossom spray covers 22.1 % of its cell, 5.9 % without its petal texels; an ordinary leaf spray covers 23 %. roseB drops from 32 % to 7.7 %. The BLOSSOM whole-tree pictures are 73-74 % petal texels. The other shapes' pictures have 1-2 % of covered texels with b in (0.5, 0.75]. Code: trees.js:183, 188, 303-305; cover.js bloomOf (open 0 out of flower); farForest.js:66, 225.

**Suggested fix.** Out of flower, shade a petal texel as a leaf (petal = 0) instead of discarding it, and let the winter test treat it as a leaf. Do the same in the depth pass. That matches what farForest already does. Take wood as `cut.b > 0.75` for every tree in both trees.js passes, as farForest does.

**The check.** The main claim holds; I checked the code as it stands and the atlas itself.

Near trees (src/life/trees.js):
- Line 497 writes iE.w = bloomOf(...).open. In cover.js:98-104, open = sm(from, from+10, d) * (1 - sm(to-12, to, d)), which is exactly 0 outside [from, to]. That is days 62-118 for the cherry and 55-105 for the thorn, half a year later in the south.
- Line 183 takes wood as cut.b > 0.75 on a flowering tree. Line 184 makes every non-wood texel with b > 0.25 a petal.
- Line 188: `if (petal > 0.5 && h >= vBloom.w) discard;`. Since h = fract(..) >= 0 always, every petal texel is thrown away out of flower, on every card: the spray cards, roseB, and the whole-tree pictures of the near trees' far mesh. The winter test at line 190 is skipped for petal texels anyway.
- The depth pass does the same (lines 303-304: `petal && vBloom.x < 0.5` discards), so the near shadows are thin as well.

Far forest (farForest.js):
- Line 225 takes wood = cut.b > 0.75 and nothing else, so those texels are drawn as leaf.
- Line 491 gives the colour inFlower(...), and line 66 returns sp.leaf when open = 0.
- The far forest therefore draws the whole petal area as a green crown. The hand-over is at uFar.z = 240 m (trees.js:129, farForest.js:102/138).

Atlas measured (public/data/tree_atlas.png, my own count):
- Blossom spray: 22.1 % covered, 5.85 % without petal texels. An ordinary leaf spray is 23 %.
- roseB: 32.1 % covered, 7.7 % without petals.
- BLOSSOM whole-tree pictures: 27-38 % covered, 7.5-9.9 % kept out of flower.
- Replaying loadAtlas's mip averaging (weighted by coverage, so petals stay at b about 0.5) at the mip levels used near 240 m (lod 2-4), the near out-of-flower picture keeps only 11-16 % of what the far forest draws. Example: imp8.0 at lod3 draws 5.1 % against 38.2 %. So a cherry or thorn grows six- to eight-fold in cover as it crosses the line. The line moves with the traveller, so in flight trees cross it all the time.

Who sees it: Haven places these species in its meadows, parkland, by water and at the opening place (haven.js:125-129). The opening date (2024-09-22 at 48 S) is inside the bloom window, so it only appears after the clock is moved: the menu's date or "today" (24 Nov falls outside both windows), or a fast clock. That is ten months of the year, and the owner asked for seasons.

Not listed as known:
- The report says the opposite ("Out of flower they are small round-leaved trees"), and the comment at treeGeometry.js:459-462 says the same. Neither matches the atlas: BLOSSOM in treeAtlasGen.js has 'a few young leaves among the flowers'.
- Known problem 6 covers only the far forest's dusty pink colour, not its cover.

Second point (wood threshold), real but minor:
- Before this change both near and far used 0.5. The far forest now uses 0.75 for every tree, while trees.js:183 keeps 0.5 for trees that never flower.
- The texels in (0.5, 0.75] on non-flowering pictures are 0.02-0.57 % of a cell (about 0.5-2 % of covered texels), at twig edges, below a pixel at 240 m.
- Near and far wood colours already differ (twigC against vTrunkC*0.6).
- That part alone would be low.

Severity: medium. It is seen whenever the clock is outside the bloom window, as sparse cherries and thorns with thin shadows near by and a pop to a full crown at the 240 m line. At the opening date it is not seen.

### trees-5. Lying petals are put on the ground at the wrong height: drawnHeight is given the camera's distance from the planet's centre

`src/life/leaves.js:240`, low; check: **holds**

**What goes wrong.** `terrain.drawnHeight(d, camDist)` expects camDist to be the distance from the camera to the point. The ground shader morphs by length(rel) (terrainMaterial.js:106), and app.js:649 passes `r.pos.distanceTo(p)`. Petals passes `rig.pos.length()`, about 250 km on Haven, so `k = 1`. The height returned is the parent chunk's surface, fully morphed, while the ground drawn within the 55 m where lying petals show is not morphed at all.

**What one sees.** On bare ground (petals lifted only 3 cm), petals float above the ground or sink into it wherever the finest chunk differs from its parent's interpolation (its odd vertices): decimetres on uneven ground. On grass the error adds to the lift that is meant to rest them on the blade tips.

**Evidence.** leaves.js:240; terrain.js:172-192 (k = clamp((camDist / morphX - 0.72) / 0.24), so camDist far above morphX gives k = 1); terrainMaterial.js:106; app.js:649.

**Suggested fix.** Pass the petal's distance from the eye: `this.terrain.drawnHeight(d, Math.hypot(x - rig.pos.x, y - rig.pos.y, z - rig.pos.z))`.

**The check.** The wrong argument is real, but the reviewer has the size wrong: the error is centimetres, not decimetres.

The lines:
- src/life/leaves.js:240 (new in this delivery) calls `this.terrain.drawnHeight(d, rig.pos.length())`. rig.pos is measured from the planet's centre (app.js:647 takes p.length() of the same vector to get a direction), so this passes about 251 km.
- terrain.js:167-192 says camDist means "metres from the camera". It computes k = max(clamp((camDist/morphX - 0.72)/0.24), fade).
- For the finest patches on Haven (maxLevel 14, edge 23.97 m), terrain.js:280 gives morphX = splitIn × parent edge = 0.95 × 47.9 ≈ 45.5 m on the ground. So k = 1 every time.
- The ground shader (terrainMaterial.js:106) uses k = 0 within about 33 m of the eye and k = 1 only beyond about 44 m.
- Lying petals show out to 55 m and fade out from 35 m (leaves.js:94/193).
- So inside about 33 m, where petals are actually seen, each petal is placed on the parent patch's surface (hv + morph) while the ground is drawn at hv. The error is the morph value at that spot.
- Nothing else hides this. The petals are put down again whenever trees.js remakes the blooming list (every 25 m of travel, REBUILD_M), always with k = 1. The brief's report lists the grass-tip floating as known (Known problems 3), but not this.

How big it is: I rebuilt finest-level Haven patches in Node with the real ChunkBuilder at 13 places around the opening site (scratch script morph.mjs in the review scratchpad). |morph| per vertex:
- median 0.8 cm
- 90th percentile 3.4 cm
- 99th percentile 8.4 cm
- largest 28.5 cm, at single vertices

So on bare ground, where petals are lifted 3 cm, about one petal in ten near the player sits a few centimetres high or low. The rare worst spot is about a hand's width off. A petal is a point sprite 9-14 cm wide drawn at one depth, so one that has sunk is clipped along its bottom, not hidden. One that floats a few centimetres is hard to see at grazing angles. On grass the error adds about a centimetre to a lift of 12-55 cm and is lost in the known grass-tip problem.

The claim "decimetres on uneven ground" does not hold, and nothing costs frame time (six calls a frame either way). The code is still against drawnHeight's stated contract, and the two-line fix is free. Severity low.

### trees-6. Bark furrows are unfiltered, near black and 2 to 9 cm apart: they alias on trunk flanks and on farther trunks

`src/life/trees.js:252`, low; check: **holds**

**What goes wrong.** The new bark rule darkens furrows by 0.86 and fades only by distance (`near = 1 - smoothstep(30, 70, dW)`), with nothing based on how many furrows fall on a pixel. The furrow spacing scales with the tree: 0.09 m x height / 20 (treeGeometry.js:45). On the phone a metre covers 1247/d pixels at full size, and about 0.6 of that at the governor's floor.

**What one sees.** For a 20 m tree a furrow is 2.8 px wide at 40 m (near = 0.84) and 2.2 px at 50 m; at the floor resolution it is 1.7 px at 40 m. On a 6 m blackthorn it is 2.2 px at 15 m with near = 1. On every trunk's flanks the furrows are foreshortened by |N·V| (0.3-0.5 there), so they fall under 2 px from 15-25 m on any tree. Walking through a wood, trunk sides and farther trunks shimmer and crawl. No stability run was made on these trees (report, known problem 2).

**Evidence.** trees.js:247-260 (bark block: no fwidth or footprint), treeGeometry.js:45 (furrows(r)), the report's own 416 px a metre at 3 m (1247/d).

**Suggested fix.** Before any branch, at the top of main, take `float bw = fwidth(vUv.x)` (furrows per pixel) and multiply `near` by `1.0 - smoothstep(0.25, 0.5, bw)`. Do the same for the pale trunks' bands, using the footprint of bv * 9.0.

**The check.** The defect holds, though the reviewer's distances are about 30 % too short.

What I read:
- src/life/trees.js:247-260 is new in this delivery (the diff against origin/main). The bark block is gated by `vUv.x < -1.5 && dW < 70.0`. Its only fade is `near = 1.0 - smoothstep(30.0, 70.0, dW)`, which is 1.00 at 30 m, 0.84 at 40 m, 0.50 at 50 m and 0.16 at 60 m.
- In that block, `bu` is in furrows. `furrow = smoothstep(0.45, 0.8, f)` (f a triangle wave), and `rough = 1 - 0.86*furrow`, so a furrow is 0.14 of the ridge.
- Nothing reads a pixel footprint. The same shader already uses dFdx/dFdy for the atlas cut at line ~177, so it would be easy to add.
- The renderer has no anti-aliasing: `antialias: false` (app.js:107, main.js:18), and there is no TAA or FXAA pass anywhere in src.
- treeGeometry.js:45: `furrows(r) = round(TAU*r*20/0.09)`, applied per tube to every mesh level. The close mesh uses bole() and the 20-60 m near mesh uses trunk(); both go through tube() with bark uvs and the same material.

My replay of the geometry (scratch: /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/bark.mjs):
- At the trunk's base the furrow period is 0.43 % of tree height on every close mesh and 0.5-0.77 % on the near meshes.
- The furrow count is fixed by the lower radius, so the period shrinks with the taper. On a fir it is about half the base value at 0.62 of the height.
- The wander term makes it locally up to 1.75 times denser: d wob / d bu = 1 + 0.63 cos + 0.12 cos, maximum 1.75 (mean.mjs).

Correction to the reviewer's numbers: 1247/d assumes a 60-degree lens. CONFIG.DEFAULT_FOV is 48 degrees vertical, which gives 1440/(2 tan 24°) = 1617/d pixels a metre at native size. At the governor's 1.6 MP floor (sqrt(1.6/4.45) = 0.6 linear) it is about 970/d.

With the correct numbers, the base furrows reach a 2-pixel period at:
- 4 m trees: 14-25 m native, 8-15 m at the floor.
- 8 m trees: 28-50 m native, 17-30 m at the floor.
- 15-22 m trees: 53-138 m native, 32-83 m at the floor.

So the 2-pixel distance falls inside the full-contrast zone (near = 1 up to 30 m) in several places:
- Haven's small flowering and dry-country trees: blackthorn (65) and cherry (64) at the opening place and by water, and juniper and pinyon in the meadows. Their heights are about 3-8 m.
- The upper trunks of every tree, at about half the distances above.
- The flanks of every trunk. On an 8-sided bole, the outer facets compress the furrows by about 0.38.
- Mid-size trees at the floor resolution.

The wander makes all of this up to 1.75 times worse in places. With no anti-aliasing, a near-black, wavy line pattern at a period of 2 pixels or less makes moiré that crawls as the camera moves. That is the shimmer that step 4 of CLAUDE.md asks to be fixed.

None of the brief or report lists this as known or accepted. Known problem 2 only says that no stability run was made, and it concerns the switch from the close mesh to the near mesh.

Severity: medium. Trunks are a small part of the picture and it costs no frame time, but it is seen in motion on small trees near the start and on trunk flanks.

One flaw in the reviewer's fix: it fades the pattern to 1.0. The pattern's mean is 0.67 (0.80 on red bark), as replayed from the shader's own arithmetic. Fading to 1.0 would therefore brighten a trunk by about 1.5 times wherever furrows are dense. That is the flanks, which undoes the "darker toward its edges" rule, and the upper trunks. The pattern must fade to its mean instead.

### trees-7. The bark pattern breaks along a vertical seam on every trunk and limb

`src/life/trees.js:252`, low; check: **holds**

**What goes wrong.** A tube's bark coordinate runs from 0 to `fur` round it (treeGeometry.js:68: -2 - k/sides*fur, k = 0..sides), and the two sides of the seam have bu = 0 and bu = fur. The whole furrow count is periodic, but the wobble terms `sin(bv*1.7 + bu*2.1)` and `0.12*sin(bv*5.3 + bu)` are not. Neither are the column hash `floor(wob)`, the pale bands `fract(bu*0.31 + ...)` or the scars `fract(bu*0.2 + bh)`.

**What one sees.** Within 70 m, each trunk and limb has a line down one side, facing a random way, where furrows are out of step. On pines a plate is split into two halves of different tones, and on birch and aspen the bands are cut.

**Evidence.** Replay (scratchpad/review/seam2.mjs): with 5 to 14 furrows (limbs, oak boles) the furrow phase across the seam differs by up to 0.8 of a furrow (0.26 at a fir's 18). The seam runs through a plate's face along 46 % of its length, so it splits plates into two tones there.

**Suggested fix.** Make every term periodic over one turn. Wobble with whole cycles per furrow (`sin(bv*1.7 + bu*6.2831853)` and `sin(bv*5.3 + bu*6.2831853)`), and give the bands and scars whole cycles too. Hash the column modulo the furrow count, which the geometry then has to hand over, e.g. in the integer part of aUv.x.

**The check.** The defect is real. Nothing in the current code hides it, and neither trees-refined.md nor trees-refined-report.md lists it as known or accepted.

Lines that cause it:
- src/life/treeGeometry.js:56-68 (`tube`): the ring runs k = 0..sides and the seam vertex is written twice, with uv.x = -2 at k=0 and uv.x = -2 - fur at k=sides. Here fur = furrows(r) = max(3, round(TAU*r*20/0.09)). Each corner carries its own uv into aUv (build, line 195), and trees.js:152 passes vUv = aUv unchanged.
- src/life/trees.js:250-258 sets bu = -vUv.x - 2, which runs from 0 to fur round the tube, with a hard break on the seam edge. None of the following repeats when bu goes up by fur:
  - wob = bu + 0.3*sin(bv*1.7 + bu*2.1) + 0.12*sin(bv*5.3 + bu): the phase steps by 2.1*fur and fur.
  - col = floor(wob) is hashed raw. One side of the seam uses hash(c + fur) and the other hash(c). That moves the ridge breaks (`row`) and changes the plate tone (`plate`).
  - The bands fract(bu*0.31 + ...) and scars fract(bu*0.2 + bh) do not repeat over one turn either.

Replay of the code's own arithmetic (scratchpad/review/seamcheck.mjs):
- Furrow counts: 23 (fir and pine boles), 25 (oak bole), 18 (aspen bole), 13 (near-mesh trunk), 6 (limbs), 3 (twigs).
- On the boles the furrow phase across the seam reaches the full half-furrow wrap.
- The seam crosses a ridge's face along 50-79 % of the length. There the ridge is cut by a straight line, with a different break height and tone on each side.
- On limbs the phase nearly lines up (6*2.1 is close to 4π), but the column hash still differs. So every tube has the seam.

Who sees it: per-tree yaw (trees.js:98) points the seam a random way. It is at full strength to 30 m and fades out by 70 m (`near`). The furrows are drawn near black (0.86) and ~9 cm wide, so at walking distance (125-416 px/m) a straight edge where furrows don't meet shows on about half the trunks facing the player. It costs no frame time.

The reviewer's own fix is wrong for the wobble. With sin(bv*1.7 + bu*2π) + 0.12*sin(bv*5.3 + bu*2π), the slope of wob in bu is at least 1 - 0.3*2π - 0.12*2π = -1.64. So wob is non-monotonic: furrows fold into triple lines, and every furrow wanders in lockstep with its neighbours.

## grass (grass helper)

### grass-1. With a grass saving on, a different half of the grass is drawn after every anchor step: the field jumps every 40 to 80 m

`src/life/grass.js:124`, high; check: **holds**

**What goes wrong.** latticeCell() gives instance c the cell whose index counted from the anchor is congruent to c modulo GRID. The governor's savings (setFraction / setMidShare, lines 574-576) draw only the first half of the scrambled instances, so the drawn half is a fixed pattern measured from the anchor, not from the ground. The anchor moves in 40 m steps (lines 705-711), so after each step a different set of ground cells is drawn. This happens wherever BOX is not a divisor of the step, which is every lattice except the 'near' ring (BOX 40 m). The mechanism is older (the cards had it), but it now covers five of the six rings and both flower lattices.

**What one sees.** On the phone with 'grass-mid' on (the third rung of the ladder, which claims 5 ms) or 'grass' on, walking or flying: at every anchor step (once the traveller is 60 m from the anchor, i.e. every 40-80 m of travel) this share of drawn cells is swapped for other cells in one frame: feet 67 %, nearer 49 %, mid 53 %, far 18 %, farthest 62 %, near flowers 50 %, far flowers 89 %. The whole field round the traveller jumps. No headless test shows it, because nothing is thinned there.

**Evidence.** Read grass.js 121-127 (latticeCell), 574-576, 705-711 and 723, and governor.js 67 and 81. Replay of latticeCell in integer cells with half the instances, before and after a 40 m anchor step: /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/govstep2.mjs printed the shares above (near ring 0 %). The same replay with the fix below printed 0 % for every lattice.

**Suggested fix.** Count each lattice from the ground. Give each field a uniform uBoxShift = mod(origin, BOX) per axis, set next to f.lat at line 723, and in latticeCell use rc = mod((c + 0.5) * SPACING - uGrassCam.xy - uBoxShift, BOX) - 0.5 * BOX. The 'own' line does not change.

**The check.** The defect is real. I could not refute it.

How it happens:
- src/life/grass.js:122-124 (latticeCell): instance i draws lattice index c = scramble(i) at rc = mod((c+0.5)*SPACING - uGrassCam.xy, BOX) - BOX/2. uGrassCam is measured from the anchor (line 718).
- Line 125 gives the ground cell as own = c + k*GRID + origin/SPACING. So instance c always lands on ground cells congruent to c + origin/SPACING, modulo GRID.
- setFraction / setMidShare (lines 574, 576) cut geo.instanceCount to half. gl_InstanceID then only runs over [0, N/2), so the drawn set D of lattice indices is fixed against the anchor.
- _anchorStep (line 703) moves origin by se, sn: multiples of SNAP = 40 m, and 80 m on an axis once ce >= 60. The drawn ground cells are then D shifted by S/SPACING cells modulo GRID, a different set unless BOX divides S.
- BOX per lattice: feet 12, near 40, nearer 80, mid 150, far 400, farthest 1100, flowers 32 and 102.4. Only 'near' divides 40; 'nearer' divides 80 but not 40.

The trigger is a real ladder position: governor.js:67 'grass-mid' (the third rung, setMidShare(0.5)) and :81 'grass' (setFraction(0.5)). The step itself happens every 40 to 80 m of travel (RENEW 60, line 705).

My replay (scratchpad/review/govstep-verify.mjs, written independently of the reviewer's) builds the exact scrambled half and shifts it. Share of drawn cells that change:

| Lattice | 40 m east | 80 m | 40 m diagonal |
|---|---|---|---|
| feet | 67 % | 67 % | 44 % |
| near | 0 % | 0 % | 0 % |
| nearer | 49 % | 0 % | 51 % |
| mid | 53 % | 81 % | 15 % |
| far | 18 % | 32 % | 18 % |
| farthest | 62 % | 76 % | 69 % |
| near flowers | 50 % | 79 % | 16 % |
| far flowers | 89 % | 8 % | 72 % |

This matches the reviewer's numbers.

Nothing else prevents it:
- Each blade's hashes are keyed to the ground cell, so a drawn cell looks the same every time. But which cells are drawn changes in one frame.
- The LAYERS cap and the widening under grass-mid (uGrassKeep.w) apply to whatever is drawn; they do not hide the swap.
- Nothing else reads gl_InstanceID (only line 122).
- It breaks the file's own promise (header, lines 20-23: "a move of the anchor changes nothing that is drawn") and the brief's rule that nothing may depend on where the traveller stands.

It is not listed in grass-rich.md or grass-rich-report.md. Their open problem is the per-frame crawl in low flight with nothing thinned. This one is separate and only happens with a saving on, so no headless picture shows it.

It is pre-existing: origin/main's lattices (BOX 25.6, 72, 43.2, 160, 400, 1100) all had it. The delivery keeps it on 7 of 8 lattices, including the three far rings that grass-mid thins.

Severity: medium. Players see it only while a grass saving is on, but grass-mid is high on the phone's ladder. Then the field round the traveller re-deals a large share of its blades (up to some 90 % in one lattice) in one frame, every 40 to 80 m of walking or low flight.

### grass-2. Cause of the open problem (far blades shimmering in low flight): flowered and contrasting blades at pixel size, which the 0.6 px floor never reaches

`src/life/grass.js:264`, medium; check: **REFUTED**

**What goes wrong.** The far rings replaced mip-mapped (pre-filtered) cards with unfiltered opaque triangles. In low flight these are 1-3 px tall and 1.3-6 px wide at the foot. Each blade still carries per-blade colour contrast. (a) In a meadow, about half the blades have the full petal colour on their upper part: an on/off choice per blade (lines 264-265), e.g. poppy red 0.70 or cornflower blue 0.70 against grass at about 0.2. (b) The dark foot and pale tip are only partly pulled to 0.62. (c) Per-blade shade and dry jitter. (d) The glow toward the Sun on the tip (line 270). The result is colour noise at the pixel scale. A 0.5 m step moves a blade 0.3-2.8 px, so each pixel lands on a different blade in each frame, and the difference picture is red everywhere. The floor wide = max(wide, 0.6 px) (line 228) almost never applies to these rings: in that view their half width is already 0.64-3.2 px. Only the thinnest mid-ring blades at 64-70 m are under it (0.56 px), where that ring is fading out. That is why station 2 gave exactly the same numbers before and after the floor. A second, smaller cause: the from-above cut at line 204 is a hard per-blade threshold that moves with the camera's height and distance, and the 1 px cut at line 231 is another.

**What one sees.** Stability move haven_grass_flight: 40 m over the flower meadow, pitch -8, fov 48, 1100x515 canvas. The far ring at 100 m: a pixel is 0.18 m, half width 0.71-1.50 px, about 2.6 px tall seen, and about 51 % of blades flowered (many 0.9, rise 0.37). A step moves it 1.1 px. At 40-60 m up, 0.7-1.6 % of the blades in a ring also pop in or out whole at each 0.5 m step.

**Evidence.** Read lines 200-233 and 247-271. Pixel sizes: /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/sizes.mjs (replay of WIDE, GROW, TALL and the rise rule at the stability view). Pops: pops.mjs in the same folder (line 204's cut and line 264's flower step for blades ahead under a 0.5 m step: mid 1.06 %, far 0.68 % at 40 m; far 1.59 % at 60 m).

**Suggested fix.** Pre-filter by pixel size, as the cards' mip maps did. Let px = min(2.0 * wide, tall) * abs(projectionMatrix[1][1]) * uGrassView / cc.w and s = smoothstep(3.0, 1.0, px). As s rises, replace the per-blade flower choice with the drift's share applied to every blade (mix(alb, petalColour(kind, 0.5), (0.3 + 0.7 * y) * threshold)). Pull tone to 0.62 and shade to 1, drop the per-blade dry jitter, and replace the glow by its mean, all by s. Turn line 204 into a fade folded into keep: keep *= clamp((hash - q) / 0.12, 0.0, 1.0), with q = square * smoothstep(40.0, 90.0, dist) * 1.02.

**The check.** I read src/life/grass.js lines 55-62 (rings), 168-272 (BLADE_VERT), 686-735 (update); src/app.js:399-411; src/worlds/haven.js:162; scripts/stability.mjs (the move, the `move()` helper and the changed/flicker measure); scripts/lib/browser.mjs:20; and the report's Stability section with docs/shots/stability/report.json. I also reran the numbers in Node with the world's height function (scratchpad/review/v_stations.mjs and v_sizes.mjs). The finding's two main premises are wrong.

1. The field of view is 60, not 48. The move loads `shot=ledge` with no `fov` in its query, and app.js:411 sets `fov = p.fov ?? b.fov`. Haven's ledge bookmark has `fov: 60` (haven.js:162). With fov 60 at 1100x515, a far-ring blade at 100 m seen from 40 m up has a half width of 0.55-1.16 px, not 0.71-1.50. The 0.6 px floor at line 228 does apply: at station 0 it catches about 38 % of the nearer ring's blades, 29 % of the mid ring's and 12 % of the far ring's (21 m up: 28/23/10 %; 3.6 m up: 18/18/8 %). The report's own numbers show the floor changed the picture: station 0 went from 7.9 to 10.45 % changed when the floor was added. So the claim that the floor never reaches these blades is false, and so is the reviewer's explanation of why station 2's numbers stayed the same.

2. The 36.2 % changed / 8.8 % flicker behind the open problem is station 2, which is 3.6 m above the ground, not 40 m. The move is `fwd: 0.5` along a forward vector pitched 8 degrees down, with a stride of 250 steps. That is 124 m per station and 17.4 m lower each time. The ground there is level, 1468.4 to 1469.5 m, so the stations sit at 39.6, 21.0 and 3.6 m. At 3.6 m:
   - Flowered blades exist only in the FAR rings beyond 38 m (line 264, `smoothstep(38, 52, dist)`). They lie within 5.4 degrees of the horizon, at most about 9 % of the picture.
   - The lower half of the picture is ground within 25 m: the near and nearer rings. Those rings have no flower step and no cuts at lines 204 or 231, which are all `#ifdef FAR`.
   - A 0.5 m step at 3.6 m moves ground 10 m ahead by about 8 px and ground 5 m ahead by about 23 px. That is 17 times the angular motion of a walk step, and the walk moves already measure 27-33 % changed and 6.6-8 % flicker. Station 2's figures are this ordinary near-field parallax; colour noise in the far rings cannot produce them.

3. The finding's own scenario, 40 m up, is station 0. There the ground starts at 51 m, so the whole ground is far-ring blades, many of them flowered: about 63 % of the picture. The measured flicker is 1.2 %, the lowest of any grass move. Changed is 10.45 %, roughly one ground pixel in six, not "red everywhere". The step moves that ground by 0.2-2.4 px, so the change fits plain parallax of a detailed surface.

What survives is minor. The hard per-blade switches do flip about 1 % of far blades whole per 0.5 m step, because their thresholds move with rise and distance:
   - the from-above cut at line 204;
   - the under-a-pixel cut at line 231;
   - the flower on/off at line 264.
The cuts at lines 204 and 231 are not new: main had the same per-clump cuts at grass.js:299 and :306. The measured flicker at 40 m is 1.2 %. That is low severity and not the cause of the open problem as reported.

### grass-3. Far blades start to flower on a hard circle 45 m from the eye

`src/life/grass.js:264`, medium; check: **holds**

**What goes wrong.** flowered = step(0.5, kind) * step(hash, threshold) * smoothstep(38.0, 52.0, dist), followed by `if (flowered > 0.5)`. The smoothstep is meant as a cross-fade, but after the > 0.5 test it becomes a hard limit at dist = 45 m. Inside 45 m no far blade flowers. Beyond it, the full share does at once (about half the blades in a rich meadow). The single flowers fade out over 38-50 m by their own numbers, so there are fewer flowers at 38-45 m and then a jump in colour at 45 m.

**What one sees.** At eye height in a flower meadow (the meadow walk): an arc where the colour jumps, about 22 px under the horizon at the reference shape (about 60 px on the phone), centred on the traveller and moving with them. Blades that cross it flip between grass and petal colour while walking. From a hillside facing the eye it is a full curved line.

**Evidence.** Read lines 262-265 and the FLOWERS table (line 69: the far single flowers go out over 38-50 m). The cards this replaced (origin/main) had no distance factor on their flowers, so the line is new.

**Suggested fix.** Put the distance into the threshold, not into the result: flowered = step(0.5, kind) * step(hash2(cell + 5.1 + aBlade).x, threshold * smoothstep(38.0, 52.0, dist)). Blades then start to flower one by one across 38-52 m.

**The check.** The defect holds. I read src/life/grass.js at HEAD (bd66c52; the file is the same as b92ace8 and has no local changes).

Line 264 (BLADE_VERT, inside #ifdef FAR) is `flowered = step(0.5, kind) * step(hash2(cell + 5.1 + aBlade).x, <threshold>) * smoothstep(38.0, 52.0, dist);` and line 265 is `if (flowered > 0.5) { alb = mix(alb, petalColour(..), 0.3 + 0.7*y); skyShare = 1.0; }`. The first two factors are each 0 or 1, so `flowered > 0.5` comes down to `smoothstep(38,52,dist) > 0.5`, which is exactly dist > 45 m. `dist` is length(foot2), the horizontal distance from the camera, so the edge is a circle round the traveller that moves with them.

Only the 'mid' ring is affected. It is the one far ring there (in [30,39], out [55,74], far: true, so FAR is defined at line 544). The 'far' ring starts at 55 m, where the smoothstep is already 1.

The single flowers that should hand over to these blades are the second FLOWERS entry (line 69, out [38, 50]). They are kept by keepOf(1 - smoothstep(38,50,dist), h.x) at line 302.

I replayed the arithmetic in Node (scratchpad/review/flowered.mjs). The case is a rich meadow with a non-pale kind at eye height, so the blade threshold is about 0.7. Kept single flowers fall from 0.98 at 40 m to 0.50 at 44 m, 0.37 at 44.9 m and 0.34 at 45.1 m. In the same span the share of flowered blades goes from 0.00 at 44.9 m to 0.70 at 45.1 m. So the flowers thin out toward 45 m and then their colour jumps back at once. Blades crossing 45 m as the traveller walks change between grass and petal colour in one frame.

Nothing else hides the edge:
- The 'square' cull (line 203) is about 0 at eye height.
- The layer cap keeps up to 5 blades deep. Those are exactly the blades in front, so roughly 70% of the visible blade tops beyond 45 m take the petal colour.
- In low flight the same circle lies on the ground round the point under the camera, though there it is weakened by (1 - 0.5*rise).

The code on origin/main has no distance term on its flowers. Its vFlower.a was a continuous weight blended into the card's colour, not tested against 0.5, so the line is new in this delivery.

docs/briefs/grass-rich-report.md does not list it. Its known problems are the shimmer in low flight, phone cost, colour blocks from 20 m, an even olive from 30 m, pollen, glints, the shadow table, Earth and the preview script. Its stability note says "no ring, pop or line" was seen in strips of frames one step apart. That is not a test for a fixed edge in colour density, and it does not change what the code does.

This is not the cause of the far-blade shimmer in flight, which the report attributes to the 'far' and 'farthest' rings at 20 to 60 m up.

Severity is medium: it is seen in flower meadows, which are this delivery's main feature but not everywhere.

One small side note: in hash2(cell + 5.1 + aBlade) a scalar is added to both coordinates, so blade k of cell c draws the same number as blade k-1 of cell c+(1,1). That is a mild diagonal correlation and does not matter for this finding.

### grass-4. Thin-land tussocks are re-rolled whenever the anchor crosses a 2560 m line

`src/life/grass.js:192`, medium; check: **holds**

**What goes wrong.** The near rings' tussock number is own = hash2(floor((at + uGrassLie) * 2.0) + 3.3).x, with uGrassLie = origin mod PERIOD (line 722). at + uGrassLie equals the ground position minus 2560 * floor(origin / 2560), so it jumps by 2560 m for the same ground when the anchor's origin crosses a multiple of PERIOD. lieAt is periodic in PERIOD and does not mind. This hash is not periodic, so every tussock gets a new number.

**What one sees.** Walking or flying low over thin land (scrub, wood edges, scree: any amount under about 0.46, so dens < 1): once for every 2.56 km travelled east-west or north-south, about half the tussocks within 39 m appear or vanish in one frame, at an anchor step.

**Evidence.** Read lines 188-194 and 722. Replay of the shader's hash in float32 for a 40 x 40 m patch at dens 0.5: /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/tussock.mjs. Crossing 2560 m changed 3195 of 6400 tussocks (50 %); an ordinary step (1520 to 1560 m) changed 0.

**Suggested fix.** Make it periodic in PERIOD: float own = hash2(mod(floor((at + uGrassLie) * 2.0), ${2 * PERIOD}.0) + 3.3).x.

**The check.** The defect is real. I could not refute it.

How it happens:
- src/life/grass.js:192 (near rings only, the #else branch of FAR) sets `own = hash2(floor((at + uGrassLie) * 2.0) + 3.3).x`.
  - `at = foot2 + uGrassCam.xy` (line 171) is measured from the anchor.
  - Line 722 sets uGrassLie to `mod(origin, PERIOD)`, with PERIOD = 2560.
- `origin` gets += se/sn at every 40 m anchor step (line 674). It is reset to [0,0] only in `_anchorAfresh` (line 658). That runs the first time and after a jump of more than 2000 m. The anchor follows the traveller from 60 m away (RENEW), so in ordinary travel it is never made afresh, and `origin` keeps growing across multiples of 2560.
- At the step where origin goes from 2520 to 2560, uGrassLie drops from 2520 to 0. For the same ground, `at + uGrassLie` therefore falls by 2560 and the floored cell index by 5120.
- hash2 is not periodic in 5120 (5120 * 0.1031 = 527.872, not a whole number), so every tussock gets a new number.

What else I checked:
- lieAt (line 133) has whole-number wave counts in PERIOD, so it is unaffected.
- The blade lattice itself (`latticeCell`, line 125, with uLatOrigin = round(origin/spacing) mod 4096 at line 723) gives the same number to the same ground at every step. This hash is the only thing that changes.
- The far rings use `hb.y`, which is tied to the anchor-independent lattice, so they are unaffected.
- Nothing else reads uGrassLie.
- The tussock code is new in this delivery (`git diff origin/main...HEAD`).
- It is not among the known and accepted problems. docs/briefs/grass-rich.md:76 says that nothing about the grass may hang on anchor steps.
- It is not the brief's open problem (far blades shimmering in low flight). That is the far rings, and this is a pop in the near rings at a single frame.

My own float32 replay (/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/tus2.mjs), on a 40 x 40 m patch at density 0.5:

| Anchor step | Tussocks changed |
|---|---|
| 2520 to 2560 | 3128 of 6400 |
| -40 to 0 | 3128 of 6400 |
| 1520 to 1560 | 0 of 6400 |
| Any of these, with the proposed fix | 0 of 6400 |

When it shows:
- Only where dens < 1, that is the table's grass g.g < about 0.458 (scrub, wood edges, scree). On fully grassed land `own` < 1 <= dens always holds, so nothing changes.
- Only within the near rings (out to 39 m), and only while blades are drawn (agl under about 80 m).
- Both the presence test and the fade `clamp((dens - own)/0.12)` change, so about half the tussocks pop in or out, and the rest change height, in one frame.
- It happens once per 2.56 km per axis of travel. On foot that is rare. In low flight at tens of m/s it comes every minute or two whenever the ground is thin.
- So it is seen sometimes and costs nothing per frame: medium.

### grass-5. The light table works out all three numbers in every pixel and keeps one: three times the lighting work

`src/life/grass.js:447`, medium; check: **holds**

**What goes wrong.** LIGHT_FRAG's main() computes the table entry, the slope light, the cloud and land shade, directSun, nearShadow (up to 12 shadow-map taps), skyLight, and aerialPerspective twice (two froxel lookups of 6 reads each) in every one of the 288 x 576 pixels. It then writes only sun*through, sky*through or air, depending on the third the pixel is in. Each place's full lighting is therefore evaluated three times: 165,888 pixels where 55,296 would do. The report's cost estimate counts it once.

**What one sees.** Every frame at eye height and in low flight (whenever grass is drawn), on the phone. The froxel and shadow reads are the expensive part, and two thirds of them are thrown away.

**Evidence.** Read lines 423-447 (the select at 447 comes after everything is computed) and lines 513-518 and 679-684. lightingGlsl.js:274 shows aerialPerspective(c, rel) = rainVeil(hazeOverGround(c, rel, 1)), which is affine in c, so one evaluation gives both air and through.

**Suggested fix.** Branch on `third` before the work. It is constant over every 2x2 quad, because the boundaries at x = 96 and 192 are even. The sun third needs directSun, nearShadow and the shades; the sky third needs skyLight; the air third needs only the air. Alternatively, draw a 96-wide pass into three colour attachments. In either case, take air and through from one haze evaluation (hazeAffine plus the rain veil, or a single aerialPerspective with through = T) instead of two.

**The check.** The waste is real. It costs a little GPU time every frame and changes nothing the player sees.

What the code does:
- LIGHT_FRAG (src/life/grass.js:420-448) works out everything for every pixel before it chooses:
  - the place, from `third` and `row` (lines 424-426);
  - the ground table, `tableAt`, which is 4 texelFetches (line 427);
  - the slope light (433-435);
  - the cloud shade and the land shade, one read each (439);
  - `directSun` (2 reads), `nearShadow` and `skyLight` (440);
  - `aerialPerspective` twice (444). Each call goes through `froxelHaze` (lightingGlsl.js:150-163), which makes 6 froxel reads (A, B and C at two depths). In rain, `rainVeil` adds a `skyLight` to each call.
- `nearShadow` (nearShadow.js:238-262) takes 4 taps in the fine tile, 8 where the fine and coarse tiles hand over, and 4 more in the character's tile, so up to 12.
- Only at line 447 does `third` pick `sun*through`, `sky*through` or `air`.
- The target is LIGHT_N*3 x LIGHT_N*RINGS.length = 288 x 576 (line 515, LIGHT_N = 96, 6 rings). That is 165,888 pixels for 55,296 places.

Nothing prevents the waste:
- `third` is per pixel, so the shader compiler cannot know a branch on it would be the same for every pixel of a 2x2 quad.
- Several of these reads use implicit-derivative `texture()`, including the sampler2DShadow. A compiler will not move those into a branch that may differ between pixels, so the select at line 447 is flattened and all three lightings run.
- `renderLight` runs every frame whenever grass is shown (app.js:1368, grass.js:679-684). That is below about 3 km over the ground.
- Neither docs/briefs/grass-rich.md nor grass-rich-report.md lists it as a known problem.

The haze half of the reviewer's fix is correct:
- aerialPerspective(c, rel) = rainVeil(hazeOverGround(c, rel, 1), rel) is affine in c.
- With rho = 1 the Lg term is zero.
- `hazeAffine` (lightingGlsl.js:247-264) follows the same steps for an eye inside the air: pathA 0, the same pathB, the uHaze mix and the rain veil. It returns exactly through = T and air = L0.
- Grass is hidden above 3000 m over the ground, so the eye is always inside the air when this pass runs.

One part of the claim is wrong. The report (lines 172-174) does not under-count. It says "288 x 576 pixels ... each running the full lighting once (165 888 pixels)", and that is the true cost. It just does not say that two thirds of it is thrown away.

How much it costs (an estimate, not a measurement):
- The phone's cost table (PROGRESS.md line 32) gives the ground's shading as 17.4 ms at 2.07 MP. Those are cost-test times, about 2.4 times a frame in play, and they include the ground's vertex work. That puts a comparably heavy pixel at no more than about 3.5 ns in play.
- So the whole pass is roughly 0.3 to 0.6 ms a frame on the phone. Branching saves roughly half of it; drawing each place once saves about three quarters. That is a few tenths of a millisecond against a 33 ms frame.
- It is paid every frame grass is drawn, and the fix is cheap. Severity is medium: a modest, steady cost the player never sees. It is not high.

The far blades' shimmer in low flight (the report's open problem) is not caused by this. The output is the same either way. `lightAt` clamps its lookups to [0.5/96, 1 - 0.5/96], so the three thirds and the six rows do not bleed into each other.

### grass-6. The light table is drawn every frame from 220 m to 3 km, where no blade reads it

`src/life/grass.js:680`, low; check: **holds**

**What goes wrong.** renderLight() only checks this.mesh.visible. update() sets mesh.visible = true whenever the ground's own grass colour is wanted (kg > 0, up to 3000 m: lines 693-696 and 784), even when keepBlades and keepClumps are both 0 and every field and clump mesh is hidden. From 90 m to 220 m only the far rings read it, but all six rows are lit, including the three near rows that serve the near rings, the near flowers and the pollen.

**What one sees.** Flying 220 m to 3 km over grassland, a common height: a full-lighting pass of 165,888 pixels (with nearShadow, two haze lookups, cloud and land shade) and a render-target switch every frame for nothing. Between 90 and 220 m, half of it is wasted. No governor step reduces this pass.

**Evidence.** Read lines 679-684, 689-696, 736-737 and 784, and app.js 1366-1368.

**Suggested fix.** In renderLight: if (!this.mesh.visible || (this.keepBlades <= 0 && this.keepClumps <= 0)) return. When only clumps are drawn, set the viewport or scissor to rows 3-5 (y >= 3 * LIGHT_N).

**The check.** The defect is real, and nothing in the code prevents it.

The pass:
- src/life/grass.js:679-684: renderLight() returns early only when !this.mesh.visible. Otherwise it calls renderPass(renderer, this.lightMat, this.light).
- src/render/fullscreen.js:32-38: renderPass switches the render target, clears it and draws the whole of it.
- The target (grass.js:515) is LIGHT_N*3 x LIGHT_N*RINGS.length, which is 288 x 576 = 165,888 half-float pixels.
- Every pixel runs LIGHT_FRAG (lines 418-446): a table read, nearShadow, cloudShade, the land-shade texture, directSun, skyLight and two aerialPerspective calls with HAZE_UV.

When it runs:
- In update() (lines 693-696), kb = 1 - smoothstep(45, 90, agl), kc = 1 - smoothstep(121, 220, agl) (haven.js:120 sets below 90 and mid 220), and kg = 1 - smoothstep(1500, 3000, agl).
- show depends only on kg > 0, coverSerial and fraction > 0. Every frame with show true ends with this.mesh.visible = true (line 784).
- The fields are hidden when kb is 0 and the clumps when kc is 0 (lines 736-737). So from 220 m to 3000 m the Group is visible while every mesh in it is hidden.
- app.js:1271 runs grass.update before the unconditional grass.renderLight at app.js:1368, so the pass runs every frame of that band.

Who reads the table:
- Only the grass ring and flower materials (tLight, line 532) and pollen (pollen.js:29, row 2). A grep of src/ and scripts/ finds no other reader; the terrain does not read it.
- Pollen's target amount is keepBlades x ... (pollen.js update). It is drawn only while that eases out, a few seconds after one climbs past 90 m.
- So from 220 m to 3 km nothing reads the table. The only exception is a pollen tail when climbing from under 90 m to over 220 m in about 7 s, and those motes are sub-pixel and dimmed (dim = px squared over drawn squared x 6 is about 0.05).
- From 90 m to 220 m only the clumps draw. They read rows 3-5 (lightU[3..5]). Rows 0-2 serve the near rings, flowers[0] (light 1) and pollen, and all of those are hidden or fading. (flowers[1] reads row 3 but is a field, hidden with kb.)

Known and accepted?
- grass-rich-report.md:172 describes the pass as "one extra pass of 288 x 576 pixels a frame" in the context of drawing grass.
- Neither the report nor grass-rich.md says it also runs, unread, all the way to 3 km. Its open problem (far blades shimmering) is unrelated.
- No governor step touches the pass: governor.js has only 'grass' and 'grass-mid', which change instance counts.

Severity: medium. Nobody sees it. The cost is a small render pass of about 0.17 Mpx of full lighting plus a target switch and clear, likely a few tenths of a millisecond on the phone. It is paid every frame at common flight heights (220 m to 3 km), for nothing. It happens before the main picture is begun, so it does not split the main pass.

The reviewer's fix is right:
- Skipping on the descent is safe: update() runs before renderLight in the same frame, so the frame in which kc or kb first rises re-lights the table before any mesh draws.
- The pollen tail would read the last table, which is lit for the same place, so that is harmless.

### grass-7. Pixel sizes use the canvas's height, not the height the picture is drawn at

`src/life/grass.js:733`, low; check: **holds**

**What goes wrong.** uGrassView = 0.5 * renderer.getDrawingBufferSize().y. The scene is drawn at post.viewH = post.height * governor.scale. The canvas is resized only in coarse steps (CANVAS_STEPS, held 3 s on the way down) and is kept at full size by the cost test's 'full' hold. So uGrassView is 1.0-1.21 times the real half-height in steady play, and up to about 1.47 times in the cost test and during holds. pollen.js:73 sizes gl_PointSize (which is in render-target pixels) from it. The blade width floor (line 228) and the 1 px cut (line 231) misjudge the pixel by the same ratio. Other modules (rain, leaves, petals, sun, bodies) use post.viewH.

**What one sees.** On the phone as the governor steps resolution: pollen motes come out up to 21 % larger and 46 % brighter than intended (up to 47 % and 2.2 times in the cost test), changing in a sawtooth with each resolution step. The anti-crawl floor drops to about 0.5 px.

**Evidence.** Read grass.js 228, 231 and 733, pollen.js 73-74, post.js 262-269, and app.js 588-631 and 1286-1288 (fitCanvas, CANVAS_STEPS).

**Suggested fix.** Pass post.viewH into Grass.update, as leaves.update(rig, post.viewH) does, and set S.uGrassView.value = 0.5 * viewH.

**The check.** The defect is real. I could not refute it.

1. src/life/grass.js:733 sets `S.uGrassView.value = 0.5 * renderer.getDrawingBufferSize(..).y`. In three.js, getDrawingBufferSize returns `_height * _pixelRatio` (node_modules/three/src/renderers/WebGLRenderer.js:713). The pixel ratio is set to 1 (app.js:598), and `_height` is whatever App.fitCanvas last gave `renderer.setSize`, which is `post.height * sqrt(canvasArea)` (app.js:625). So the value is the canvas's height, not the picture's. The uniform's own comment (grass.js:104) says "the picture's height (pixels), halved".

2. The grass (nearScene) and the pollen (weatherScene, plus the near slice at app.js:1402-1404) are drawn into post.scene, whose viewport is `viewH = round(height * scale)` (post.js:267-268). `gl_PointSize` and the clip-to-pixel factor H/2 are therefore in viewH pixels.

3. fitCanvas picks the smallest of CANVAS_STEPS [1, .5997, .3596, .2157] that is at least 0.98 of scale squared. On the phone, maxResLevel = round(log(1.6/4.45)/log .88) = 8. I replayed the ratio canvasH/viewH by level: 1.000, 1.066, 1.136, 1.211, 1.000, 1.066, 1.136, 1.211, 1.000. That is a sawtooth, worst at levels 3 and 7. It is larger while a step down is held for 3 s (app.js:623). In the cost test, `canvasHold='full'` with held = sqrt(2.07e6/4.45e6) = 0.682 gives 1.466 (benchmark.js:262, 294 and 308), and the 'small' line gives 2.11.

4. What this does:
   - pollen.js:73: `px` is too large by the ratio r. Above 1.5 px, `drawn = px`, so a mote is r times wider and gets r squared of the energy (dim stays at 1). Under the clamp, `dim ~ 6 px^2/2.25` is also too large by r squared. So motes come out 7-21 % larger and up to 46 % brighter as the governor steps.
   - grass.js:228: the width floor is 0.6/r px, so about 0.50 px at levels 3 and 7.
   - grass.js:231: the far 1 px cut falls at 1/r, about 0.83 px.
   Leaves, petals, rain, sun, bodies, stars and dust all use post.viewH. The grass and pollen are the odd ones out.

5. A second error the reviewer missed: grass.update runs at app.js:1271, before `post.setScale(this.photoWanted ? 1 : governor.scale)` and fitCanvas (1286-1287). On a photo frame the picture jumps to full scale, but uGrassView still holds the previous canvas size. On the phone at level 8 that is 0.6 times the true value, so the photo's pollen comes out 40 % smaller and the far cut falls at 1.67 px. The reviewer's fix (passing the post.viewH of the moment into Grass.update) keeps this one-frame error, because post.viewH is not updated until setScale.

6. Not covered by the briefs: grass-rich-report.md lists only the shimmer in low flight. This defect weakens the width floor meant against that shimmer on the phone at levels 1-3 and 5-7, but it is not the cause of the headless shimmer. Headless runs draw at full scale with a full canvas, where r = 1.

7. When it came in: the use in the 1.5 px cut existed on origin/main. The pollen and the width floor are new in this delivery.

Severity is low. Every effect is sub-pixel or a 7-21 % size change on small, sparse motes. It would hardly be noticed without a side-by-side, and the cost is about neutral (a few more sub-pixel far blades kept, slightly thinner blades).

### grass-8. Every pollen mote jumps once an hour when its clock wraps

`src/life/pollen.js:123`, low; check: **holds**

**What goes wrong.** this.time = mod(this.time + dt, 3600) feeds wander = (sin(t*0.7 + ..), cos(t*0.53 + ..), sin(t*0.9 + ..)) (line 65). At the wrap, the arguments jump by 2520, 1908 and 3240 rad, which are 0.45, 4.21 and 4.15 rad modulo 2 pi, so every mote moves in one frame.

**What one sees.** After an hour of play in a meadow: all motes twitch at once, by up to 0.10, 0.38 and 0.23 m for pollen and twice that for seeds. Within the 10 m box round the eye this is visible.

**Evidence.** Read pollen.js 62-66 and 119-126. Worked out the jumps from the three frequencies at t = 3600 s.

**Suggested fix.** Keep three phases, each added up frame by frame and wrapped at 2 pi (phase_i = mod(phase_i + w_i * dt, 2 pi)). Pass them in as a vec3 and use sin(phase.x + aSeed.x * 40.0) and so on.

**The check.** The defect is real and nothing else prevents it. src/life/pollen.js:123 wraps the clock with `this.time = mod(this.time + dt, 3600)`, and line 125 passes it to the shader as uAir.w. Line 62 reads it as `t = uAir.w`, and line 65 uses it as `wander = vec3(sin(t*0.7 + ..), cos(t*0.53 + ..), sin(t*0.9 + ..)*0.6) * (seed ? 0.5 : 0.22)`. Line 66 adds wander straight into the mote's place. The edge fade on line 68 does not depend on wander, so every mote drawn is hit.

dt is the real frame time (app.js:1142, capped at 0.1 s, passed in at app.js:1272), so the wrap comes after 3600 s of play. The clock only runs while the pollen is drawn (line 117 returns first otherwise), so that means 3600 s of play with pollen in the air: daylight over flowers. Over a long session that is easily reached.

I replayed the arithmetic in Node. At t = 3600 the arguments jump by 0.443, 4.195 and 4.160 rad modulo 2 pi. For pollen that moves a mote by up to 0.097 m east, 0.380 m north and 0.231 m up, and seeds move 2.27 times as far. All motes move together in one frame. The ones in the 10 m box round the eye are a few metres away, so a 0.38 m jump is several degrees: a visible twitch.

The other wrap does not have this problem. air[2] wraps at TALL (line 122), and on line 62 it is multiplied by 1/TALL or 2/TALL inside a fract(), so its jump is a whole number and does not show. Neither brief lists the problem: docs/briefs/grass-rich.md and grass-rich-report.md say nothing about the wander clock, and their one known problem is the far-blade shimmer.

Severity is low. It is a one-frame twitch of the motes near the eye, once per hour of pollen time, and it costs nothing per frame.

The reviewer's fix (three phases kept on the CPU) works, but there is a simpler one. The three speeds are 70, 53 and 90 hundredths of a radian per second, so all three repeat together every 200 pi s (628.3 s): 70, 53 and 90 whole turns. Wrapping the clock at that period is seamless. In the replay the jump at the wrap is 0, and the float32 rounding of 200 pi leaves an error under 2e-5 rad.

## farforest (from-above helper)

### farforest-1. Tree shadows are drawn in the trees' own draw and write depth: overlaps don't multiply, and they hide the lower parts of trees

`src/life/farForest.js:290`, medium; check: **holds**

**What goes wrong.** The fourth quad (the shadow) is in the same instanced draw and material as the cards. The material leaves depthWrite at its default (true) and the depth test is LessEqual. (1) Overlapping shadows: a later quad lands only where it is at least as near as every quad already drawn there. shadowAlpha() assumes every overlapping shadow multiplies (dens*keep*area/SITE_M2 layers coming to SHADOW_DARK), but on average only about ln N of N layers land. Which ones land depends on the ground's slope against the worker's row order. (2) Each shadow quad lies 0.4 + 0.0015*d m over its foot (1.9 m at 1 km, 4.9 m at 3 km, 6.4 m at 4 km) and writes depth wherever its cut-out passes. The later card of any tree standing in that shadow loses everything below the quad's plane, even when the shadow's alpha is only 0.004.

**What one sees.** From the air at a low Sun, looking 20 to 50 degrees down. At a wood's edge the shadows come out about 0.10 dark where 0.49 is meant, and darker on slopes that rise in the tiles' row order than on slopes that fall. Trees 1 to 4 km off lose their trunks and lower crowns where a neighbour's shadow lies. The bottoms pop away when a shadow quad starts being drawn (a >= 0.004), and come back when the governor's tree-shadows step goes off: a pop with no shadow to see.

**Evidence.** Lines 290-296: no depthWrite:false, and blending is the only per-quad difference. Lines 149-165: the shadow quad is lifted by 0.4 + 0.0015*d and thrown out only when a < 0.004. Line 224: the shadow fragment returns black with alpha, no gl_FragDepth. Replay /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/overlap.mjs, the code's own shadowAlpha with planes drawn in random height order: dens 1, keep 1, 1200 m2: 24 layers of 0.028 are meant to give 0.49 dark; 3.7 land, 0.10 dark. dens 0.8, keep 0.5: meant 0.51, drawn 0.18. far-tree-form-test checks the formula only, so it cannot see this.

**Suggested fix.** Draw the shadows as a second mesh per pool slot. It shares the slot's instanced attributes, uses index range 18..24 (its own geometry or drawRange start 18, count 6) and a material with depthWrite:false and CustomBlending, and gets a renderOrder just below its tile's trees, so trees overwrite it and nothing is cut. The trees' material then stays NoBlending always. This adds one draw call per tile, only in the air; the shadows can then be thinned where dens*keep*area/SITE_M2 is large, if their fill turns out to cost.

**The check.** The finding holds. I read the code at bd66c52.

- src/life/farForest.js:290-298: the material is one ShaderMaterial per slot. It sets blending and blend factors but not depthWrite, depthTest or depthFunc. In three 0.187, Material.js:211/220/231 make those LessEqualDepth, true and true. WebGLState.js:765 applies CustomBlending even with transparent=false, so update() (l.359-360) switches blending on and depth writes stay on.
- l.91 and l.284/434: the shadow is index range 18..24 of the same geometry. The draw order is therefore, per instance: card, card, rosette, shadow, then the next tree. The GL standard requires depth testing and blending to happen in primitive order inside an instanced draw.
- l.160: each shadow quad is a level plane at the tree's foot + up*(0.4+0.0015 d). That is 1.9 m at 1 km, 4.9 m at 3 km and 6.4 m at 4 km.
- l.155-156: the quad is thrown out only when a < 0.004. vShadowA = a*shadowAlpha can be far smaller than that and the quad is still drawn.
- l.224: every shadow fragment that survives the cut-out writes depth. Nothing writes gl_FragDepth.

(1) Overlapping shadows do not multiply. Seen from above, a higher plane is nearer. A shadow quad lands only where it is at least as near as every quad already drawn at that pixel, and the planes never lie at the same depth because foot height and 0.0015 d differ. shadowAlpha (farTreeForm.js:72-75) assumes all dens*keep*area/SITE_M2 layers multiply to SHADOW_DARK. treeBlock.treeTile (l.43-55) gives the trees block by block in row order, so draw order follows position:
- on ground rising in row order, all layers land (about 0.5 dark);
- on ground falling in row order, only one lands (0.03 to 0.1);
- on uneven ground, about H_N of N land.

I ran the reviewer's replay (overlap.mjs) and got its numbers: 24 deep gives 0.10 where 0.49 is meant; dens 0.8, keep 0.5 gives 0.18 where 0.51 is meant; 6 deep gives 0.24. A lone tree (N <= 1) still gets the full 0.5, so a wood's edge, which is where the report says these shadows show, is much fainter than a lone tree. from-above-report.md item 4 states "the lot come to half". The briefs do not list this as known or accepted, and far-tree-form-test only checks the formula.

(2) Shadows cut the trees drawn after them. Any later tree whose lower part lies behind a neighbour's shadow plane loses that part wherever the neighbour's cut-out passes, even when the shadow's alpha is tiny. The same happens across tiles: a nearer tile's shadows cut a farther tile's trees. It is worse than the reviewer says on a slope that falls along the shadow. The quad is laid level, so its far end floats slope*length above the ground. With the Sun at 30 degrees and a 15-degree slope facing away from it, an 18 m tree's 31 m shadow ends about 8 m up. treeLandShade.js gives that slope lit 0.86, so the quad is drawn. A tree downhill inside that shadow loses several metres of its trunk and lower crown, not 1.9.

Inside woods the canopy the ground raises (terrainMaterial.js:120-150, uShell from r*0.62) hides both the quads and the tree bottoms. Both effects therefore show at wood edges and among scattered trees, which is exactly where the shadows are meant to be seen.

There are pops at the a = 0.004 threshold: the ring where down passes 0.30, and out at 4.2 km, where a ~0.02 shadow still writes depth 6 m up. When the governor's tree-shadows step turns the shadows off, the cuts and the shadows go together, so that part is not a pop without a shadow.

Severity is medium. It shows from the air at a low Sun as faint or patchy edge shadows and cut tree bottoms, and costs no frame time. The established pattern in this codebase (farRocks.js:163-165, 258-261) is a separate shadow mesh with depthWrite:false.

### farforest-2. Shadow strength follows the ground under the traveller: every far shadow pops on or off at a rim or ridge

`src/life/farForest.js:357`, medium; check: **holds**

**What goes wrong.** uShadow.x (which multiplies every far tree's shadow alpha) and the switch to blending are a smoothstep of rig.agl between 60 and 160 m. rig.agl is the height over the ground directly below the camera, and it jumps at any edge. The trees whose shadows are seen lie elsewhere, often far below, so their shadows' strength does not follow their own view at all.

**What one sees.** Flying level at 70 m over a plateau rim or ridge, looking down into a valley of trees seen 25 to 35 degrees down. On the rim every valley shadow is at 2.8 %; one metre further, over the drop (agl 670 m), all of them are at 100 % in a single frame, and they vanish again flying back. Standing at an overlook (agl 1.7 m) the valley trees seen steeply from above have no shadows at all. The same pop happens on Haven's stepped plateaus and canyon edges.

**Evidence.** Line 357: air = clamp((rig.agl - 60) / 100), then smoothstep; line 358: uShadow.x = shadows; line 155: a = wShadow * uShadow.x * ... . cameraRig.js 538/552: agl = r - ground at the camera's own place. Replay rim.mjs in the scratchpad's review folder: uShadow.x on the rim at 70 m: 0.028; one metre on, over the valley at 670 m: 1.000.

**Suggested fix.** Ease the value over time instead of taking it frame by frame, for example this._air += (target - this._air) * (1 - Math.exp(-dt / 0.8)), with blending on while _air > 0. Better still, take the height from the trees' side (the eye over the lowest ground of the tiles near by, see the next finding), so a rim is not a switch.

**The check.** The cause is real but the reviewer overstates what it does. There is no pop. Shadows fade in or out over at least 25 frames.

What holds:
- src/life/farForest.js:357 sets `air = clamp((rig.agl - 60) / 100)` and smoothsteps it. Line 358 writes the result to `uShadow.x`. Line 155 multiplies every far tree's shadow alpha by `uShadow.x`.
- src/controls/cameraRig.js:552 measures `rig.agl` in flight as `r - ground` at the camera's own place.
- So the strength of every far tree's shadow follows the ground under the traveller, not the tree's own view. In the band from 60 to 160 m up, the valley trees' shadows change as the traveller crosses a rim or flies over rolling ground. That is the "moves when I move" kind of defect that CLAUDE.md and the brief's rule ("nothing about a tree may hang on where the traveller stands") warn against.

What does not hold:
- "One metre further, agl 670, in a single frame" cannot happen. The ground is continuous: a DEM with 383 m cells, interpolated, plus noise of 260 m at most. The reviewer's rim.mjs does not replay terrain; it assumes the step from 70 to 670 m.
- On the elevation map, 1.3 % of land cells are steeper than 45 degrees, 0.27 % steeper than 60, and 0.01 % steeper than 75. The steepest is a 1 441 m step over a 203 m cell (82 degrees) near lat 59.7, lon 286.7.
- I replayed level flight at 70 m with the game's own speed law (speedLaw.js) and `height()`, at 30 frames a second (scratchpad review/rim2.mjs and rim3.mjs):
  - Steepest 150 m drop within 8 km of the start (64 degrees): shadows go from 5 % to 95 % in 2.5 s at cruise and 0.83 s at boost.
  - The 77-degree wall near the map's steepest spot: 3.7 s at cruise, 1.3 s (38 frames) at boost.
  - Steepest drop near the opening place: 13.7 s at cruise, 4.6 s at boost.
  - In every case `uShadow.x` changes by at most 0.055 in one frame.
- The overlook case (standing, valley trees with no shadows) is a choice the report documents and accepts. from-above-report.md says "On the ground nothing is added: the shadow's quad is not handed over under 60 m, the blending is off", and its behaviour changes say "Far trees have shadows on open ground when one flies (from 60 m up)". This follows the brief's rule that nothing may add cost on the ground.
- What is visible is further limited by known problem 2 in the report: the shadows are hidden under the raised canopy almost everywhere a wood is, and show only on open ground and at wood edges.

What remains: in the 60 to 160 m band, the shadows on open ground in view fade over about 1 to 4 s at boost after the traveller crosses steep ground, and drift slowly over rolling ground. A player can see this, but rarely, so the severity is low. It costs nothing on the phone.

The reviewer's fix is not enough. Easing `uShadow.x` over time only slows the fade; the strength still follows the ground under the traveller.

### farforest-3. Shadow quads are handed over by tile with a reach worked from rig.agl: valley trees' shadows are missing, then appear a whole tile at once

`src/life/farForest.js:434`, medium; check: **holds**

**What goes wrong.** A tile gets its fourth quad only when tile.near < rig.agl * SHADOW_REACH + 400. That treats the eye's height over the ground underfoot as its height over the tile's trees. Where the tile's ground is lower than the ground under the traveller (by more than about 0.5*agl + 126 m), its trees are already looked down on at more than 17 degrees (wShadow > 0, up to 1) while the tile gets no quad. When tile.near crosses the line, every shadow of a tile 0.9 to 7 km wide appears in one frame.

**What one sees.** 150 m over a rim with a valley 600 m below: the line is 1 115 m out. A valley tree 1 200 m out is looked down at down = 0.52, so wShadow = 1.00, but its tile gets no shadow quad; at 1 500 m wShadow is 0.80, also missing. Flying 5 m toward the valley puts the tile inside the line and all its shadows pop on together. Moving out over the valley (agl 750) moves the line to 3 977 m, and every tile in between pops on at once.

**Evidence.** Line 434: tile.near < Math.max(0, rig.agl) * SHADOW_REACH + 400; lines 52-55: SHADOW_REACH = 1.5*sqrt(1/SHADOW0^2 - 1) = 4.77. Line 132: the shader's down is measured to the tree's own crown. Replay rim.mjs in the scratchpad's review folder (the numbers above).

**Suggested fix.** In _fill, record the tile's lowest foot radius (tile.low = min |origin + T[q..q+2]|, beside bound2). In update, use the eye's height over that ground, Math.max(0, len - tile.low), in place of rig.agl in the hand-over test (len is already computed).

**The check.** The defect is real.

What the code does:
- src/life/farForest.js:434 hands a tile its shadow quad (draw range 24 instead of 18) only when `tile.near < Math.max(0, rig.agl) * SHADOW_REACH + 400`. Here `tile.near` is the distance along the ground to the tile's nearest ground (farTiles.js, `wantedTiles`).
- SHADOW_REACH is 4.77 (lines 52-55). `rig.agl` is the height over the ground directly under the eye (cameraRig.js:538/552: `r - ground`).
- In the shader, a tree's shadow strength comes from its own angle: line 132 measures `down` to the tree's own crown, `wShadow = smoothstep(0.30, 0.50, down)` (farTreeForm.js), and line 155 multiplies it into `a`. Nothing fades a shadow in at the hand-over line.
- So once the line passes a tile's near edge, every tree in that tile with wShadow above zero gets its shadow in the same frame.
- A tree x metres out, with the eye H metres above its crown, has wShadow above zero when x is under about 3.18 × H. The line is 4.77 × agl + 400. The test therefore leaves shadows out whenever the tile's ground is lower than the ground underfoot by more than about 0.5 × agl + 126 m, exactly as the finder says.

Checking the finder's numbers: at 150 m up the line is 1 115 m out. A tree 1 200 m out and 600 m lower has down 0.52 and wShadow 1.0, with no quad.

Replay on Haven's real ground, at the opening place (scratch file review/rimv.mjs: Haven's elevation, curvature included):
- Hovering 150 m up, line 1 115 m: heading 180 has trees at 1.2–2.0 km (316–609 m lower) with wShadow 0.17–0.31; heading 222 (the opening view's heading) has 0.08–0.13 at 1.4–1.8 km. None of them gets a quad.
- 300 m up, line 1 831 m: at 2.0 km heading 180, wShadow is 0.60.
- These shadows switch on all at once when a small move or a change in height brings the line past the tile's edge. They switch off again when the ground rises under the traveller and the line moves back in. A tile here is 0.9 to 7 km across.

Nothing else hides this. The air factor is about 0.97 at 150 m. The distance fade only starts at 1.6 km. The briefs do not accept it: from-above-report.md says the tile test "with room for falling ground" leaves "the picture the same". That claim was checked only at ledge_300_p20 and wood_300_p60. In the morning light of those views the valley's trees are shaded by the land, so their shadows are switched off anyway (smoothstep on sunLeft). The pop is not in the report's known problems.

What limits how visible it is: shadows show only on open ground and at the edges of woods (known problem 2), and only on sunlit valley ground. A 26 m shadow at 2 km is still about 10 × 34 px on the phone, at up to half darkness × wShadow. Flight over Haven's ranges is exactly where the line keeps moving, so a whole tile's shadows appearing or vanishing will be seen sometimes. I judge it medium. It is not a cost every frame.

### farforest-4. The ground's far canopy takes Haven's leaf colour on every world, and Earth's lost its map tint

`src/terrain/terrainMaterial.js:341`, medium; check: **REFUTED**

**What goes wrong.** farCanopyColour now builds every world's far canopy from the constant vec3(0.045, 0.085, 0.03) * 0.61. The report calls that 'Haven's leaf' (its species are all near it). It also drops the 60 % of the land's colour map the canopy used to take. That is a value for one world written into the shared ground shader, and it changes Earth.

**What one sees.** On Earth (the same far forest and canopy: earth.js line 146 has far, and canopyTall comes from the land-cover ring), every wood within 19 km of the eye (ownC) is now one ponderosa olive. Before, it carried the real map's regional colour: boreal against hardwood, a tropical forest against a dry woodland. The far trees standing on it keep their own species' greens, so the 'two forests in two colours' problem comes back on Earth. The report lists it as no change on the ground.

**Evidence.** terrainMaterial.js 340-343: leaf = vec3(0.045, 0.085, 0.03) * 0.61, then paintLeaf and farGreen, with the tint argument unused. origin/main line 475: leaves = vec3(0.040, 0.078, 0.028) * mix(vec3(1.0), mapTint, 0.6). from-above-report.md: 'Haven's are all near 0.045, 0.085, 0.03'.

**Suggested fix.** Make both numbers world data: a canopy leaf albedo (from the world file, or the mean leaf of its flora worked out in setWorld) in a uniform, and a share of the map's tint (Haven 0, Earth 0.6 as before), applied as leaves *= mix(vec3(1.0), tint, uCanopyTint).

**The check.** The reviewer reads the code correctly. At terrainMaterial.js:340-343 farCanopyColour ignores its tint argument and builds the canopy from vec3(0.045, 0.085, 0.03) * 0.61, then paintLeaf, then farGreen. On origin/main (line 475) the canopy was vec3(0.040, 0.078, 0.028) * mix(1, mapTint, 0.6). Earth gets this branch: earth.js has life.trees.far, app.js:1268 sets uShell.z = 1 for any world with trees, and canopyTall comes from the land-cover ring. What does not hold up is the claim that this is a defect, and the scenario given for it.

1) It was decided and written down, with the cost named. from-above-look.md:89-96 sets out the choice: "either the canopy drops the map's tint for the trees' green, or the trees must take the map's tint ... The first is one line in the ground", and notes the constant is Haven's. PROGRESS.md:96 records the decision: "Decided: one forest, one green". from-above-report.md:33-35 says it was done ("none of the map's tint"). The same report lists Earth as known problem 7 ("Earth has the same far forest: only Haven was looked at") and, at line 31, names Earth's hardwood forests as affected. That meets the brief's "known and accepted" test.

2) The regional colour the scenario says was lost was hardly there. I sampled Earth's own map (public/data/earth_day_4096.jpg, linearised, divided by the world file's mean) and ran it through the old formula. Siberian taiga, Canadian boreal, Amazon, Congo, New England and the Pacific Northwest all come out at the same canopy, about (0.017, 0.036, 0.012), within about 5 %. The map's closed forests are all one dark green, and the formula's 0.4 floor squeezes what difference there is. Where albedoRange applies (farW < 1), every dark forest goes to a near-grey tint of about 0.39 before the mix, so even that small difference fades. Only open woodland differed (Kaibab about (0.028, 0.049, 0.014), Miombo), and that difference is the soil between the trees showing in the map. Soil colour on a canopy of crowns is the gold canopy this change set out to remove.

3) "Two forests in two colours comes back on Earth" is wrong. Earth never had them matched: before this change its canopy was map-tinted while the far trees (farForest.js:491) had species colours. The constant is not Haven-only either. It is species 0 in the shared table (cover.js:26), ponderosa pine, the tree of Earth's opening place on the South Rim. The old code also had one fixed leaf in the shared shader. Past 1.3 km, farGreen moves trees and canopy alike 70 % toward one olive. Close in, regional colour is still carried by the far trees standing on the canopy, which take their species from speciesFor(lat, lon). From 3 to 19 km the canopy fades back into the map's own colour, as before.

What is left is a small, documented change to Earth's canopy within 3 km: about 20 % brighter for closed forest, with a fixed hue. Earth is no longer where the work goes and was flagged as not looked at. This does not meet the bar for a defect.

### farforest-5. The slope light of far trees' ground has the world's curve the wrong way round

`src/life/treeLandShade.js:45`, low; check: **holds**

**What goes wrong.** The height over the tile's middle plane is taken as l + h - ol, where l = |o + e x + n y| is about ol + s^2/(2R). That adds +s^2/2R where the ground drops by s^2/2R, so the slope worked out from it is tilted by 2x/R the wrong way. On Haven (R = 250 km) that is 1.6 degrees at the edge of a 7 km tile. The error changes sign from one tile to the next, so at a seam between two big tiles the slope jumps by 4x/R.

**What one sees.** Low morning or evening Sun (the opening place's first morning), shadows drawn from the air. The shadows' strength (groundQ/15) steps along straight seams of the 3.6 and 7.1 km tiles, kilometres long. Beyond about 1.8 km only trees from those tiles stand. At a 6 degree Sun, on level ground, the 7 km tile's edge reads 0.274 against a true 0.376, and the seam's two sides differ by about 0.2 (shadows about 1.5 times darker on one side). The error is negligible on Earth.

**Evidence.** Replay curv.mjs in the scratchpad's review folder, the real landShadow on a round world with no relief, Sun 6 degrees up from the east. Lit at x = -3487, 0, +3487 m of a 64-block tile: 0.376, 0.324, 0.274, where level ground there takes 0.273, 0.324, 0.376. With the fix (curv2.mjs) it matches to 0.001 for every tile size.

**Suggested fix.** high[j*G+i] = (hs.radius + h) * ol / l - ol (the ground's height over the plane through the tile's middle).

**The check.** The finding holds. The briefs that would excuse it do not: from-above.md, from-above-look.md and from-above-report.md say nothing about it. from-above-2.md:24 and haven-rich-review.md:649 list it as farforest-5, "not yet checked", which is a fix still to make, not an accepted problem.

Lines read:
- src/life/treeLandShade.js:33-35. The frame is the tile's middle: u = o/|o|, with e and n tangent there.
- :42-45. p = o + e x + n y and l = |p| = sqrt(ol² + s²), which is about ol + s²/2ol. h = hs.height(p/l) is the elevation over R, and high = l + h - ol, which is about h + s²/2R.
- :49-55. The normal comes from the gradient of high and is dotted with the Sun's direction in that one middle frame (se, sn, su).

Where o is: treeBlock.js:124 puts o at dm·(R + hM), the tile's middle on the ground. A ground point is (R+h)·p/l, and since p·u = ol, its height over the plane through o is (R+h)·ol/l - ol, which is about h - hM - s²/2R. So the code adds +s²/2R where the ground falls by s²/2R. Its normal leans by -x/R where the true one leans by +x/R, an error of 2x/R. The comment ("the world's curve is the same for neighbours") is wrong because the slope of s²/2R is x/R, not zero.

My own replay, with the real landShadow, a level world of R = 250 km, baker visibility 1, Sun 6° up from the east:
(/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/mycurv.mjs and myseam.mjs)

| Tile | Code, west / middle / east edge | True |
|---|---|---|
| 64 blocks, edges ±3555 m | 0.377 / 0.324 / 0.273 | 0.272 / 0.324 / 0.377 |
| 32 blocks | 0.350 / 0.324 / 0.298 | 0.298 / 0.324 / 0.350 |

At the seam between two 64-block tiles, trees on either side of the shared edge read 0.224 (3 of 15 steps) and 0.432 (6 of 15). The truth is 0.324 on both sides. So the shadows are about twice as strong on one side of a straight seam, with a sawtooth ramp across each tile.

The fix (mycurv2.mjs) matches the truth to 0.001 for 8, 16, 32 and 64 blocks.

Where the player can see it:
- farForest.js:491 packs lit into groundQ, and :155 multiplies the shadow's alpha by groundQ/15.
- farForest.js:376 makes far3 the nearest 3D distance, so :434 does hand shadow quads to the 3.6 and 7.1 km tiles within 4.2 km.
- Haven's far forest is full 450, radius 5600. Level 2 reaches 3.9 km, so beyond about 1.95 km only level 2 and 3 trees stand. From 1.5 km up, about 70% of the trees straight below come from those two levels.

Why low, not higher:
- Shadows fade between 1.6 and 4.2 km, and smoothstep(0.03, 0.14, sunUp) weakens them at the lowest Suns.
- On level ground lit saturates at 1 once the Sun is above about 20°. Above that the error shows only on slopes turned partly from the Sun, where the ground varies anyway.
- At 1–1.6 km the trees of the small tiles (errors ±0.2° and ±0.4°) are mixed in and break up the line.

So it shows at a low morning or evening Sun from the air: a straight line, kilometres long, where far shadows step in strength. There is no cost per frame.

### farforest-6. Far trees take wood at cut.b > 0.75 for every species; near trees take 0.5 unless the tree flowers, so trunks change at the 240 m line

`src/life/farForest.js:225`, low; check: **holds**

**What goes wrong.** The near trees' card path is wood = cut.b > (flowers ? 0.75 : 0.5) (trees.js 183). The far forest now uses 0.75 for all trees. For every species without flowers (all of Haven's conifers and aspens, most of Earth's), atlas texels with b in (0.5, 0.75] are bark inside the near trees' reach and green leaf just outside it. Those texels are trunk and branch edges at mip 0, and more of them at mips 1 and 2.

**What one sees.** Walking or flying low near a wood: each tree crossing the near trees' line (which moves with the traveller) has its trunk edges and thin branches change from bark to leaf colour, so trunks thin and go green beyond 240 m. That is the line the comment at farForest.js 202-204 says must show nothing.

**Evidence.** farForest.js 225 against trees.js 183. Atlas public/data/tree_atlas.png, the wood channel over covered texels: 89 010 solid wood (> 191) and 12 831 wood edges at 130..191 at mip 0 (petals sit at exactly 128). Averaged to mip 1, 18 609 above 0.75 against 30 961 in (0.5, 0.75].

**Suggested fix.** Carry 'flowers' per instance (for example iB.w + 2 when sp.blossom, decoded with a floor) into a varying, and use the near trees' rule: wood = cut.b > (flowers ? 0.75 : 0.5).

**The check.** The finding holds, but its effect is small.

Code as it stands:
- src/life/trees.js:183 has `bool flowers = vBloom.w >= 0.0, wood = card ? cut.b > (flowers ? 0.75 : 0.5) : vLeaf < 0.5;`. trees.js:497 writes iE.w = bloomOf().open (0 or more) only for a species with sp.blossom, and -1 for every other species. So a species that never flowers takes wood at b > 0.5.
- src/life/farForest.js:225 has `bool wood = cut.b > 0.75;` for every tree. At origin/main both files used 0.5, so this delivery made them disagree.
- Beyond uFar.z (240 m) the near trees draw their far mesh (lod 2, trees.js:489). The far forest draws the same whole-tree pictures (uRectTree / uRectRose). So one atlas texel with b in (0.5, 0.75] is bark on one side of the moving 240 m line and leaf on the other.

Nothing hides it. The far forest carries no per-tree flowers flag: iB.w is `own` (farForest.js:490) and vOwn.y is `fall`. The briefs do not list it as accepted. from-above-2.md job 1 and trees-refined-2.md job 4 list it as a finding still to fix, and haven-rich-review.md trees-4 rates this part "real but minor".

I replayed it in /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/woodflip.py. It decodes public/data/tree_atlas.png, builds loadAtlas's mips (g and b weighted by cover) and applies the lod-dependent cut at 0.42 down to 0.16. On the whole-tree pictures of the shapes that never flower (arch 0-7):
- 0.1 to 3.2 % of drawn texels flip, at every lod from 0 to 4.
- As a share of the near rule's wood, the flips are 1 to 4 % for arch 3, 4 and 6, 13 to 26 % for arch 1, 2, 5 and 7, and up to 43 % for the conifer arch 0 at lod 2 (55 of 128 texels).
- Bilinear filtering adds to this. Every wood edge, against leaf or against an empty texel (r = b = 0), has a band a quarter of a texel wide where b is in (0.5, 0.75]. So in the far rule every trunk and branch is about half a texel narrower.

The reviewer's own evidence is inflated. Their mip-1 count over the whole atlas ("30 961 in (0.5, 0.75]") is mostly petals: the BLOSSOM shape and the blossom and roseB sprays, where b is about 0.5. Flowering trees take 0.75 on both sides, so those texels do not matter here.

How big it looks at the line: a 20 m tree's picture is 512 texels over 22 m, about 23 texels a metre. At 240 m on the phone that is about 5 pixels a metre, so lod is about 2 and a texel is about a pixel. Per tree, a few to some twenty edge pixels go from dark twig-brown to dark green, and a 2 to 3 px trunk loses about half a pixel. That shows at a line that moves with the traveller (the "move when I move" kind of defect), but it is hard to see.

A larger mismatch at the same line, from the same delivery: near card wood is `twigC = mix(vTrunkC, grey(vTrunkC)*(1.06,1,0.9), 0.75)*0.4` (trees.js:234-237). Far wood is `vTrunkC * 0.6` (farForest.js:243). At origin/main both were vTrunkC * 0.6. So every bark pixel already changes brightness (about 1.5 times) and saturation at 240 m. Fixing only the threshold leaves the trunks changing at the line anyway.

Severity is low: sub-pixel to one-pixel fringes, dark against dark, no cost.

### farforest-7. A tile's bounding sphere does not cover its trees' shadows, so frustum culling cuts them at the screen edge

`src/life/farForest.js:505`, low; check: **holds**

**What goes wrong.** The sphere's radius is max sqrt(|foot|^2 + h^2) + 20 m. A shadow quad reaches up to SHADOW_LONG (5) tree heights from its foot (100 m for a 20 m tree at a low Sun), so the shadows of trees near a tile's corners stick out of the sphere by up to about 80 m. three culls the whole tile, shadows included, as soon as the sphere leaves the view.

**What one sees.** From the air at a low Sun, turning the head: shadows near the screen's edge, cast toward the view by trees just off it, appear and disappear with their tile. That is a pop tied to where the camera looks.

**Evidence.** Line 505: radius = Math.sqrt(bound2) + 20, where bound2 is computed only from feet and heights (line 492). Line 158: longM = g.w * iA.w * grow * stretch, with stretch up to SHADOW_LONG = 5.0.

**Suggested fix.** Track the tile's tallest tree in _fill and add SHADOW_LONG * maxHeight (or TOP_MAX * 0.3 * maxHeight, whichever is larger) to the radius.

**The check.** The finding holds. I read src/life/farForest.js as it stands at HEAD and replayed the geometry with three's own Frustum.

What the code does:
- `_fill` (lines 492-493 and 505) sets each tile's sphere from the filled trees only: radius = max sqrt(x^2+y^2+z^2+h^2) + 20, centred on the tile's origin. That origin is the middle of the tile (treeBlock.js:124), and `s.mesh.position` is set to it each frame (line 427).
- The meshes keep three's default `frustumCulled = true`. Nothing in src turns that off for them.
- three 0.187 `Frustum.intersectsObject` uses `geometry.boundingSphere` times `matrixWorld` for a plain Mesh, and `renderer.render(this.nearScene, rig.camera)` culls against the rig camera, which sits at the origin.
- The shadow quad (lines 149-165) runs from the foot out to `along * longM`, with longM = g.w * h * grow * min(len/max(sunUp, 0.12), SHADOW_LONG = 5). That is up to 5 tree heights, and it is drawn whenever down > 0.3, sunUp > 0.03 and d < 4200, for tiles passing the test at line 434.
- So a tree near a corner of the tile (about 629 m from the middle for a level-0 tile of 889 m) can throw its shadow up to 5h - 20 m past the sphere. When the sphere is wholly outside one frustum plane, the whole tile is skipped, shadows included.

Nothing else prevents it, and the briefs do not accept it as known. It is farforest-7 in docs/briefs/haven-rich-review.md, marked "not yet checked", and from-above-2.md lists it as a job still to fix.

The replay (scratchpad review/cull.mjs and cull2.mjs) uses a flat 7 x 7 tile grid of 20-25 m trees, the game's keep/margin fill rule, fov 48, aspect 880/412, the Sun 9-10 degrees up, and a yaw sweep at several heights and pitches:
- In 37 of 192 setups, a culled tile has shadow samples with shader weight a >= 0.3 inside the view.
- They reach up to 124 px into a picture 412 px tall, and 40-90 px is common.
- The deepest cases come from looking steeply down. At pitch -60 the bottom frustum plane is nearly vertical (its inward normal is about 0.994 horizontal). A tile behind and below the traveller is then culled while its corner trees' shadows, cast forward by a Sun at the back, still lie well inside the bottom of the picture.

So the pop happens both when turning the head and in plain forward flight, as each tile behind passes out of the bottom plane. How much shows:
- Each shadow is pale in a closed wood (shadowAlpha splits SHADOW_DARK among overlapping shadows), so there a wedge beyond the tile's corner loses part of its darkening.
- At a wood's edge or for lone trees on open ground (alpha about 0.3-0.45), whole crown shadows appear and vanish.
- It needs the Sun below about 30 degrees and a traveller above 60 m. That is common in the views from high above that this delivery is about, so I rate it medium rather than low.

The same sphere also leaves out the rosette. Far off it spreads to TOP_MAX (8) crown widths, about g.x * iB.x * 8 * h, which is several tree heights. So far tiles' crown tops can be cut at the screen edge the same way.

### farforest-8. inFlower allocates per tree on every fill, and the far trees' blossom is not refreshed when the day changes

`src/life/farForest.js:491`, low; check: **holds**

**What goes wrong.** For every tree of a flowering species (cherry and blackthorn: 15 to 27 % of Haven's meadow, parkland and riverside trees), each _fill calls bloomOf (a new object) and sp.leaf.map (a new array and closure), all year round. That happens for up to two tiles of up to 12 288 trees a frame while flying. The colour is also packed only at fill time, while the near trees rebuild when Math.floor(day) changes (trees.js 363). Far tiles are refilled only on movement, on a 1.5 degree Sun move, or on a serial change.

**What one sees.** Flying over Haven's parkland: thousands of short-lived objects a frame, in a path that runs nearly every frame of flight. With the clock stopped and a date set a few days away (the Sun moves less than 1.5 degrees), the near trees show the new day's flowers and the far trees the old day's, meeting at the 240 m line, until the traveller moves.

**Evidence.** Line 66: inFlower returns sp.leaf.map(...) after bloomOf(...), which returns { open, fall } (cover.js 98-103). Line 491: called for every sp.blossom tree in _fill. A grep shows no 'day' anywhere in update(), and setFraction is the only thing besides movement and staleness that nulls fillEye.

**Suggested fix.** Work out the packed colour once per species and per own-step (for example 16 steps of own) when Math.floor(this.trees.day) changes, into a small table read in _fill. In update, null every tile's fillEye when the day changes, as setFraction does.

**The check.** Both halves hold as the code stands, but the effect is small.

1. Allocation (farForest.js:66 and :491). In `_fill`, every kept tree whose species has `blossom` calls `inFlower(sp, this.trees.day, T[q+7], ...)`, all year round. `inFlower` calls `bloomOf` (cover.js:98-103), which returns a new `{open, fall}`, and then `sp.leaf.map(...)`, which makes a new array and closure. On Haven that is species 64 and 65: haven.js:125-129 gives them 17-27 % of the mix beside water, in meadows and in parkland, and none in the forest classes. `_fill` runs at most twice a frame (update(), `fills < 2`), and in flight a tile is filled again after a move of 0.1*max(far3, 450) m, so fills come nearly every frame.

   I replayed it in Node (scratchpad review/inflower-bench.mjs, gc.mjs):
   - The allocations are real. V8 does not remove them: 1 960 young-generation collections for 12 M calls, about 170 bytes of garbage a call. `pack`'s own closure is optimised away (1 collection).
   - Time: about 150 ns per flowering tree. A full 12 288-tree fill with 25 % flowering took 0.85 ms against 0.40 ms without `inFlower`.
   - In practice: parkland tiles are sparse (cover density 0.22-0.55), so a fill there holds a few hundred to about 1 500 flowering trees. That is roughly 0.1-0.4 ms of page work in a flight frame over flowering country, nothing over forest, plus some collector pressure. A modest CPU cost, not GPU time and not every frame everywhere.

2. Blossom not refreshed when the day changes. `trees.update` rebuilds on `Math.floor(day)` (trees.js:363). `FarForest.update` reads no day: `fillEye` is cleared only by `setFraction`, a new slot or a worker reply, and a tile goes stale only on a serial change or a Sun move of more than 1.494 degrees (`dot < 0.99966`). Nothing in src/ outside farForest.js touches `fillEye`, and app.js `setDate` does not tell the far forest.
   - The date field sets 12:00 UTC (menu.js:61). Replaying Haven's ephemeris: a jump of 1 day moves the Sun 0.40 degrees, 3 days 1.20 degrees, and 2025-04-10 to 04-13 moves it 1.14 degrees. So a few days' jump with the clock stopped leaves every far tile as it was.
   - In the flowering ramps the colour step is large. For a cherry over days 63 to 66 the packed far crown goes from [26,45,13] to [47,48,29]; for a blackthorn over 56 to 59, from [22,39,15] to [46,57,37].
   - So the near trees show the new day and the far trees the old one, meeting at the 240 m line, until the traveller moves about 45 m (the tiles at that line) or the Sun moves 1.5 degrees. With the clock running at real time, crossing midnight UTC heals in about 6 minutes. A fast clock heals within about 2 s through staleness.

It is not listed as known and accepted in from-above.md, from-above-look.md or from-above-report.md. from-above-2.md only lists it as an open finding to fix, and haven-rich-review.md farforest-8 marks it "not yet checked", rated low.

Severity low: the stale blossom needs a stopped clock, a date jump of a few days in one of the roughly 10-day opening or closing windows, and a traveller standing still. The allocation is a fraction of a millisecond of page work in flight over flowering country.

## ground (owning session)

### ground-1. Daisies lost their thinning on the far ground: drifts of kind 1 now tint the land 2.5 times as strongly

`src/terrain/terrainMaterial.js:694`, medium; check: **holds**

**What goes wrong.** Commit 772b169 removed the ground's own `fk *= (fw.x < 1.5 ? 0.4 : 1.0)`, which thinned daisies (kind 1, the pale kind the ground knew about), on the grounds that "flowersAt thins them itself". But the GLSL rule thins only `kind > 1 && KIND_PALE[kind] > 0.5` (grassRules.js:213). The grass helper wrote it that way because at the time the ground still thinned kind 1 itself. So kind 1 is now thinned nowhere: the daisy tint on the far ground is x1.0 where it was x0.4. Neither report lists this; the commit says the thinning moved, not that it changed.

**What one sees.** Any meadow led by daisies, seen from 30 to 900 m: Haven's steppe (class 10, daisy leads one patch in six), and on Earth the mixed, steppe, crop and farm floras. The flower tint there is 2.5 times as strong, the white patch from the air that the old comment warned reads as snow or stone. The other pale kinds (ox-eye daisy, clover, cow parsley, yarrow and the rest) are still thinned by the rule's 0.45, so daisies alone stand out whiter than any other pale flower.

**Evidence.** origin/main terrainMaterial.js:546 had `... smoothstep(1.6, 5.0, fpx)) * (fw.x < 1.5 ? 0.4 : 1.0);`. HEAD line 694 has only a comment, and line 696 applies `fk * GRASS_FLOWER_SHARE` with no kind factor. grassRules.js:213 returns `min(0.9, many) * (kind > 1 && KIND_PALE[kind] > 0.5 ? 0.45 : 1.0)`, and KINDS[1] is 'daisy' with pale = true. The GLSL flowersAt has one caller, the ground (terrainMaterial.js:675), so nothing else depended on the `kind > 1` exception. `git show 772b169` shows the removal and the commit message "the pale flowers' thinning is the rule's own now".

**Suggested fix.** Put back `fk *= (fw.x < 1.5 ? 0.4 : 1.0);` just before the existing `fk *= (1.0 - 0.6 * clamp(dot(V, up)...` line in terrainMaterial.js. That gives exactly the old picture for daisies and leaves the rule's 0.45 for the new pale kinds. Alternatively, drop `kind > 1 &&` in grassRules.js:213, but that thins `many` rather than `fk`, so it is not the old picture.

**The check.** The claim holds for the committed branch. Nothing I read refutes it.

1. Before this delivery: origin/main terrainMaterial.js:546 ended the fk line with `* (fw.x < 1.5 ? 0.4 : 1.0)`, so daisies (kind 1) were thinned to 0.4.

2. Commit 772b169 removed that factor. The comment that replaced it says "flowersAt thins them itself". But grassRules.js at 772b169 (line 207) already read `min(0.9, many) * (kind > 1 && KIND_PALE[kind] > 0.5 ? 0.45 : 1.0)`, so kind 1 was already excluded from the rule's own thinning. The grass helper added that rule in 0e0036f, which comes before 772b169, and it skipped kind 1 because the ground was thinning it.

3. Committed HEAD (22dd61e): `git show HEAD:src/terrain/terrainMaterial.js` line 694 is only the comment, and grassRules.js:213 still has `kind > 1 &&`.
   - KINDS[1] is `K('daisy', ..., true)`, and the last argument is `pale`, so KIND_PALE[1] = 1.0.
   - The GLSL flowersAt's only caller is the ground (terrainMaterial.js:680). grass.js:607 calls the JS twin, which has no pale thinning at all, so nothing else depended on the exception.
   - Result: daisies are thinned nowhere.

4. How much it shows: GRASS_FLOWER_SHARE is 0.5 (GRASS_GROUND.flowers).
   - Where single specks are seen (speck = 1), the blend toward the daisy's near-white (0.82, 0.82, 0.76) rises from 0.2 to 0.5.
   - In the far mean (fk = 0.2 * dens, up to 0.18), it rises from about 0.036 to 0.09.
   - That is the 2.5x the reviewer gives.
   - Daisy leads patches on Haven's steppe and in Earth's mixed, steppe, crop and farm floras (grassRules.js lines 67, 72, 74, 75).
   - The other pale kinds keep the rule's 0.45, so daisy patches alone come out whiter: the "white patch from the air reads as snow or stone" the old comment warns about.

5. Neither phone-speed.md nor phone-speed-report.md mentions it, and grass-rich-report.md does not accept it either.

One more thing: the working tree has an uncommitted edit to terrainMaterial.js, at lines 699-701, that puts back exactly `fk *= (fw.x < 1.5 ? 0.4 : 1.0);`. Its comment reads "all but the daisy, kind 1, whose thinning is the ground's own, as it was". That is someone's fix in progress. It is not on the branch yet, so the defect stands until it is committed.

Severity is medium. The change is easy to see in daisy-led meadows within about 600 m (fk fades from 150 m and is gone at 900 m), where daisies now stand out whiter than every other pale flower. It costs no frame time.

### ground-2. The benchmark row for the ground's shading can no longer see the shading that moved to the vertices

`src/terrain/terrainMaterial.js:180`, medium; check: **holds**

**What goes wrong.** The cost test measures the ground's shading as the frame with `uPlain` 0 against the frame with `uPlain` 1 (benchmark.js:278, commented "its triangles are still drawn, its shading is not"). `uPlain` exists only in the fragment shader. The work this delivery moved out of the pixels now runs in the vertex shader whatever `uPlain` says: `directSun` (2 reads), `hazeAffine` (6 froxel reads, a pow, square roots, the rain veil), `cloudOver` on the near patches (atan, acos, one 2-D and up to three 3-D reads) and three flNoise noises within 1 100 m. So it now sits in the flat-tone baseline. The row will fall by the cost of that moved work even if the frame got no cheaper. The report names this row as job 1's verdict and predicts 17.4 falling to 10-13 ms. On a binning GPU like the phone's, the vertex shader can also run more than once per frame, which makes the hidden part larger.

**What one sees.** The owner's next Haven benchmark: "the ground's shading" reads lower and is taken as proof that the tiers worked, while the vertex work (about 225 000 vertices a frame, 8 to 14 texture reads each near the traveller) is counted under nothing. Governor `buys` figures and later cuts are then tuned from a row that cannot see part of the cost. This is the CLAUDE.md lesson that a cost table is only as good as its baseline.

**Evidence.** terrainMaterial.js:292 declares `uniform float uPlain` in FRAG only; line 370 returns early on it. VERT lines 180-192 run directSun, cloudOver, flNoise/flowerMeadow/flowerHill and hazeAffine with no check of uPlain. perf/benchmark.js:278 toggles only `app.terrain.shared.uPlain`. The report itself notes that the flat-tone time rose by about a tenth on the proxy and that the vertex shader's cost grew.

**Suggested fix.** Declare `uniform float uPlain;` in VERT (it is already in the shared uniforms) and wrap the per-vertex light, air, cloud, gust and flower block in `if (uPlain < 0.5) { ... }`, keeping the defaults when it is skipped. The fragment shader ignores those values in flat-tone mode anyway, so the picture is unchanged and the row again measures all of the ground's shading.

**The check.** The defect is real in the committed branch. At HEAD (22dd61e), `git show HEAD:src/terrain/terrainMaterial.js` declares `uniform float uPlain` only in FRAG (line 292), and FRAG returns early on it (line 370). VERT lines 180-192 call `directSun`, `cloudOver` (on patches of 12.5 tiles or fewer), `flNoise`, `flowerMeadow`, `flowerHill` and `hazeAffine` with no check of uPlain.

At origin/main (6ac24ff) none of this work was in the vertex shader. `directSun` was called at frag lines 675, 686 and 695, and the gust noise and `flNoise` at 526 and 542-543, all after the frag's `uPlain` return at line 270. So the ninth benchmark's 17.4 ms "the ground's shading" row counted this work. At HEAD it falls into the flat-tone baseline.

`perf/benchmark.js:278` still toggles only `app.terrain.shared.uPlain`, and its comment ("its triangles are still drawn, its shading is not") is no longer true. Nothing in the reports accepts this. `phone-speed-report.md` says the flat-tone time rose by about a tenth and that the vertex shader's cost grew (line 483). Yet its prediction table (line 402) counts "the air and the Sun at the vertices" as part of the expected fall from 17.4 to 10-13 ms, and line 9 calls that row "job 1's verdict". So at HEAD the row would fall by the moved cost even if the frame got no cheaper, which is the scenario the finding describes.

It costs the player nothing on screen and no frame time. It corrupts the one measurement this delivery is to be judged by.

The working tree already holds an uncommitted edit (file modified 20:51:47, the HEAD commit at 20:52:11 does not include it) that does what the finding asks:
- line 87 declares `uniform float uPlain;` in VERT;
- lines 181-187 set the defaults (`vSun` 0, haze T=1 L=G=0, `vCloud` (0,0,0,0.5), `vFlowerFields` (0,0.5)), then `if (uPlain > 0.5) return;` after `gl_Position` and `vHMS` are written, before the per-vertex light, cloud, gust, flower and air.

I checked that edit. With uPlain 0 the values are the same as before, so the picture does not change. The geometry (morph, shell, tide, waves) still runs, so the flat-tone triangles stay where they were and the flat-tone baseline is again comparable with the ninth results. No other included GLSL declares uPlain, so there is no redeclaration. The vertex and fragment shaders already share other uniforms (uSea, uWind, uWave, uTide, uGrassTone) under the same three.js precision prefix. The return comes from a uniform, so the phone's GPU skips the block. Software WebGL may not skip it, which matters only for the proxy, not the phone. Until that edit is committed, the finding holds for the build that would ship.

## governor (owning session)

### governor-1. A trickle of the device's own late frames now sets off a minute-long trial that switches off every large saving, the cloud volume included, at full resolution

`src/perf/governor.js:523`, high; check: **not yet checked**

**What goes wrong.** The new hand-off branch fires on `futile || notPixels`. A trial started by the probe path (`d.probe`: a few frames late, too few to trip the window) that fewer pixels do not cure is therefore not given the old verdict. That verdict learned `bg` (the device's own share) and set 30 s of immunity. Instead the branch sets `immune = 0` and `_featFirst = true`. The next probe starts a savings trial at the standing size. Probe trials take one stride per decision (`cool = 2.0`). For m0 < 0.6, `futile` cannot fire while `_bigLeft()` is true, and `_bigLeft()` counts `clouds`, `far-relief` and `cloud-volume`, which all have buys of 2.5 or more. So the trial walks the whole ladder, then resolution, before anything comes back. The report gives this price as 'some six seconds'. That is true of the trigger path; this path takes about a minute.

**What one sees.** Sharp (now the default) at native size on a phone with its own steady 4 to 7 % of late frames. The ninth results already say this: 'late frames taken as the device's own: 4.4 %'. lateEMA sits just over tol (bg starts at 0 away from the floor), so overTime passes 6 s and a probe trial starts. Two resolution steps cure nothing, the hand-off happens, and between about 30 s and 90 s the player sees coarser clouds, then no far tree shadows, thinner grass, simpler tree shapes and no close-up leaves. The clouds lose their depth, the far relief goes, and the terrain patches drop to 0.64 and are built again afterwards. Resolution then falls to 3.03 MP before everything is put back. It comes back after a mode toggle, which sets lateEMA to 0 and so bg to 0. Smooth does the same thing: 39 s to 81 s in the replay.

**Evidence.** Read governor.js lines 464, 512-537 (resTrial, futile, notPixels, the hand-off at 523, dip creation with probe:!trigger), 304-313 (_bigLeft counts every step with buys >= STRIDE_MS, group 3 included) and 593 (featNow). Replay /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review/sim6.mjs: Sharp, frames fit at any size, 1 in 15 late whatever is drawn. Current code: resolution trial 19-23 s, then 15 savings off one by one from 29.9 s to 72.4 s (cloud-volume off 28 s, far-relief 35 s, terrain-1 44 s), resolution down to 3.03 MP, everything back at 89.9-103.9 s. origin/main's governor on the same input (sim6old.mjs): two resolution steps, back at 23.3 s, nothing else.

**Suggested fix.** Hand off to the savings only for trials started by a trigger. On line 523 add `!d.probe`: `if ((futile || notPixels) && resTrial && !d.probe && !this._featFirst && this._bigLeft())`. A probe trial that cured nothing then takes the `futile` branch again, learning bg with immunity, as before. With this change `npm run govsim` passes every case (gov-fix3.js / govsim-fix3.mjs in the scratch folder), and sim6 gives the old two-step result in both modes.

### governor-2. Sharp only: a saving that comes back with no late frames at all is taken back by a stale lateEMA, kept as 'needed' and left off for a minute

`src/perf/governor.js:433`, medium; check: **not yet checked**

**What goes wrong.** overTime grows while `lateEMA > tol + 0.01`. lateEMA is an average over 200 frames, which is 6.7 s at 30 fps. After the early late frames of a trial at native size (Sharp starts there with everything on), lateEMA stays above tol for some 15 s after the frames are on time again. So overTime passes 6 s, a probe decision comes up, and `tookBack` (sinceUp < 12) runs `_takeBack()` on the saving that just came back, with no late frame since. In the single-step case it also goes into `_alone` ('what the frames need') and to the end of the line, with holdUp doubled. Before this delivery, savings came back only at the floor, where overTime never grows; now they come back above it (trials at the standing size), so this path is new for savings. At 60 fps the average decays twice as fast and it does not happen.

**What one sees.** Sharp at Haven's opening view (frames 38-42 ms at native; grass-mid cures them). The savings trial at native ends at about 7 s, and the one-at-a-time returns begin. `cloud-steps` (which buys nothing here) comes back at 13.0 s. Every frame after that takes 33.6 ms, none late, yet it goes off again at 14.2 s ('off: coarser clouds near you') and stays off until 75 s. It ends in `_alone`. The player sees the coarser clouds near them for a minute for nothing, and the climb back to everything on is slowed by the doubled holdUp.

**Evidence.** Lines 428-433 (lateEMA, tol, overTime), 464 (probe = overTime > 6), 468 and 487 (tookBack, sinceUp < 12 on a probe), 626-634 (_takeBack, _alone.add). Replay scratchpad/review/sim2.mjs prints at 13.97 s 'back on: coarser clouds near you', then every frame dt 33.6 ms with no late frame; at 15.01 s lateEMA 0.102, overTime 6.3; at 15.18 s 'off: coarser clouds near you'. sim3.mjs (Sharp, only grass-mid cures): cloud-steps off for 70 of 240 s, and the end state has alone = cloud-steps, grass-mid. The same input in Smooth: cloud-steps off for 9 s, not in `_alone`.

**Suggested fix.** Let overTime grow only while the late frames are recent, adding `this.lateFast > tol` on line 433: `if (this.lateEMA > tol + 0.01 && this.lateFast > tol && this.resLevel < this.maxResLevel && this._filled >= WINDOW) this.overTime += dt; else this.overTime = 0;`. With this change, sim3 in Sharp gives cloud-steps off 9 s and alone = grass-mid only, and `npm run govsim` passes every case (gov-fix.js / govsim-fix.mjs).

### governor-3. The tree steps stay 'live' in the air after taking off from a wood: trees.count is never cleared when the near trees stop being drawn

`src/perf/governor.js:57`, medium; check: **not yet checked**

**What goes wrong.** `nearTrees` asks `trees.count > 0 && !trees.hidden`. Trees.update (src/life/trees.js line 375 onwards) only sets `reach = 0` and hides the meshes once the traveller is above `min(below, radius*ASK_ABOVE)`, which is 384 m on Haven, and then returns. `count` keeps the value from the last `_build`. So from 384 m to 6 km, `trees-far`, `tree-leaves` and `tree-shadows` count as live where nothing of them is drawn. Exactly what `live` was added to stop: from the air a trial spends whole strides on `trees-far` (7.0) and `tree-leaves` (11.5) for nothing. `_bigLeft()` stays true until they are taken, so the verdict waits for them too, and `trees.dirty` and thinner trees are left for when the traveller lands. The govsim case 'from the air' passes because it models `trees: { count: 0 }`, a state the game does not report after leaving a wood.

**What one sees.** Start at Haven's opening view (pines nearby, so trees.count > 0), take off and fly to 2-5 km, where the phone's cost is the cloud volume (9.4 ms). On a late-frame trial the governor switches off 'the trees' full shapes to two thirds of their distance' and 'every leaf on the nearest trees' before it reaches `cloud-volume`. Two of the trial's strides buy nothing, and the player lands back in the wood with those savings on until they come back.

**Evidence.** governor.js line 57, and the steps at 65, 69 and 74 that use it. trees.js lines 374-388: `show` false sets reach to 0, hides the meshes and returns before `_build`. `count` is reset only in setWorld (line 354). Haven: trees.radius 240, below 1500, ASK_ABOVE 1.6. Replay scratchpad/review/sim4.mjs (Sharp, in the air, trees {count:180, reach:0}, only cloud-volume cures): 'switched off at some time: cloud-steps, tree-shadows, trees-far, far-trees, tree-leaves, ...'. With the fix (sim4fix.mjs), trees-far and tree-leaves are never switched off.

**Suggested fix.** Use the trees' reach, which is 0 whenever none are drawn (app.js line 1366 already uses it this way): `const nearTrees = (app) => (app.trees?.count ?? 0) > 0 && app.trees.reach > 0 && !app.trees.hidden;`. Or set `this.count = 0` in Trees.update when `!show`. Then give the govsim 'from the air' case `trees: { count: 200, reach: 0 }` so it fails before the fix. govsim passes with this change combined with the two fixes above (gov-fix13.js).

## wiring (see each)

### wiring-1. Fallen petals all vanish and fill back in a few at a time whenever the trees' lists are rebuilt (every 25 m), and falling petals jump to other trees

`src/life/leaves.js:216`, medium; check: **not yet checked**

**What goes wrong.** Petals.update clears every lying petal when `tr.blooming` is a different array (`this.serial !== list`). Then it puts them back down at PER_FRAME = 6 a frame. Trees._build makes a new `blooming` array on every rebuild (trees.js:484 and :500). A rebuild happens whenever the traveller has moved REBUILD_M = 25 m (trees.js:28 and :449) and whenever `dirty` is set. `this.abs` and `this.put` were meant to carry the placed petals over a rebuild: they are written (leaves.js:247) but nothing ever reads them. The slots are also reassigned as `list[s % list.length]` from a list sorted nearest-first from the new anchor, so a slot can come to name a different tree.

**What one sees.** Walk, run or fly below 150 m through flowering trees. Every 25 m all 480 fallen petals under the trees disappear at once and come back 6 a frame over 80 frames (2.7 s at 30 fps). Whenever the nearest-first order of the flowering trees changes, or how many there are, every petal in the air in a reassigned slot jumps to another tree. Flying at 20 m/s there is a rebuild every 1.25 s, so the carpet never fills. It changes as the traveller moves.

**Evidence.** leaves.js:216-226: `if (this.serial !== list) { this.serial = list; this.put.fill(0); this.next = 0; ... const t = list.length ? list[s % list.length] : null; ... for (let i = 0; i < LYING; i++) lie.array[i * 4 + 3] = 0;`. The lying shader's `place(rel, aLie.w * ...)` with w = 0 puts the vertex out of the picture. leaves.js:229 refills 6 a frame. A search for `this.put` and `this.abs` finds only writes. trees.js:449 `if (this.dirty || this.builtAt.distanceToSquared(p) > REBUILD_M * REBUILD_M) this._build(...)`; trees.js:484 `const blooming = []`.

**Suggested fix.** On a list change, match each new tree to an old one by its absolute foot (A + t.xyz, within about 0.5 m). Keep each slot on the same tree. For lying petals whose tree is still in the list, rewrite aLie.xyz = abs - A_new from the stored `this.abs` and leave w at 1. Clear and place again only the petals whose tree has left the list.

### wiring-2. Fallen petals are placed on the coarse parent ground, not the ground as drawn: the camera's distance from the planet's centre is passed as the distance from the camera

`src/life/leaves.js:240`, low; check: **not yet checked**

**What goes wrong.** `this.terrain.drawnHeight(d, rig.pos.length())`: drawnHeight's second argument is the distance from the camera to that point (terrain.js:166-172). It picks the morph `k = clamp((camDist / morphX - 0.72) / 0.24)` (terrain.js:187-188). rig.pos.length() is about the planet's radius (250 000 m on Haven, 6.4e6 on Earth), so k = 1 on every patch and each petal sits on the parent level's interpolated surface. Within 55 m the ground is drawn with k near 0, its own vertices (the terrain vertex shader uses length(rel)/morphX, terrainMaterial.js:106).

**What one sees.** Under a flowering tree on bare or thinly grassed ground, a petal is lifted only 3 cm (leaves.js:245). Wherever a fine patch's own vertex differs from its parent's interpolation, petals hang above the drawn ground or are buried under it. They are kept at the wrong height until the next rebuild places them on the same wrong surface again.

**Evidence.** leaves.js:240 `const g = this.terrain.drawnHeight(d, rig.pos.length());`. terrain.js:188 `const k = Math.max(Math.min(1, Math.max(0, (camDist / s.morphX - m0) / (0.96 - m0))), s.fade);`. The other callers pass a distance from the camera: app.js:649 `drawnHeight(d, r.pos.distanceTo(p))` and the rig's groundAt(d, dist).

**Suggested fix.** Pass the petal's distance from the camera: `this.terrain.drawnHeight(d, Math.hypot(x - rig.pos.x, y - rig.pos.y, z - rig.pos.z))`, using the x, y, z already worked out just above.

### wiring-3. The grass light pass is drawn every frame from 220 m to 3 km up, where nothing reads it

`src/app.js:1368`, low; check: **not yet checked**

**What goes wrong.** app.js calls `this.grass.renderLight(renderer, rig.camera)` every frame. Grass.renderLight returns early only when `!this.mesh.visible`. Grass.update keeps the group visible up to 3 km (kg = 1 - smoothstep(1500, 3000, agl), grass.js:693-696 and :784) so that the ground keeps its grass tone. But the blade fields show only while keepBlades > 0 (90 m on Haven and Earth), the clumps only while keepClumps > 0 (220 m), and the pollen needs keepBlades > 0 (pollen.js:109). Only those three read tLight (grass.js:532, pollen.js:29).

**What one sees.** Flying over Haven or Earth between about 220 m and 3 km, the usual cruising band, every frame still draws a 288 x 576 target (LIGHT_N 96 x 3 by 6 rings: 166 000 texels). Each texel does the table read, the cloud shade and the land's shade, the near-shadow taps, directSun, skyLight and two aerialPerspective calls. It is a separate render pass before the main picture on the phone's tiled GPU, and nothing reads the result. The benchmark's from-the-air stop (5 km) never shows it.

**Evidence.** grass.js:679-683 `renderLight(renderer, camera) { if (!this.mesh.visible) return; ... renderPass(renderer, this.lightMat, this.light); }`. grass.js:693-695 (kb, kc, kg). grass.js:746-747 `f.mesh.visible = kb > 0` and `kc > 0 && this.midShare > 0`. haven.js:120 `grass: { below: 90, mid: 220 }`. A search for tLight and grass.light finds only the grass fields and pollen.

**Suggested fix.** In Grass.renderLight return when `!this.mesh.visible || (this.keepBlades <= 0 && this.keepClumps <= 0)`, or gate the call in app.js the same way.

