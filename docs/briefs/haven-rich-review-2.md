# The second cold review: the trees' and the view from above's second rounds, at 178b732 (2026-11-24)

Six readers, one part each, read the code at b92ace8 cold (no browser; small replays in Node).
Each finding then went to a second reader told to refute it. "Holds" means the second reader
could not; "refuted" means it could (kept here with the reason, for the record).
Builders: prove each finding against the code as it is before fixing it, and where a number can
show it, add a check that fails before the fix.

## trees2 (trees helper)

### trees2-1. Petals: a flowering tree that joins the list when four to seven are already listed gets no slot, so it drops no petals and has no carpet; when the share shrinks, slots are taken off trees that stay

`src/life/leaves.js:277`, medium; check: **holds**

**What goes wrong.** _relist (leaves.js:269-286) first lets each old slot keep its tree, up to most = ceil(SLOTS / k) slots per tree (line 271, 277). Only slots left without an owner go to the trees with the fewest (line 280). When k grows from 4 to 5, 6 or 7, most stays 2 and the old trees already hold all 8 slots, so every slot is kept. The trees that joined get has = 0: no uPetalTree entry, so no falling petals (falling shader: step(0.5, tr.w)) and no lying petals (feet are per slot). They stay that way until a listed tree leaves the 90 m list. The opposite case is k going 1->2, 2->3 or 3->4. There most falls, and each old tree loses its highest slots. Each moved slot hides its 60 lying petals in one frame (put = 0, w = 0) and moves its 80 falling petals to the new crown in one frame. That is the same blink and jump trees-3 reported, now on a share of the carpet.

**What one sees.** Walk from a wood into the meadows or parkland where the cherries and thorns grow, on the opening date (in flower). The number of listed trees in flower climbs one rebuild at a time, and the 5th, 6th and 7th to arrive (often the ones ahead of the walker) stand with no petals falling and no carpet under them. Trees farther off keep two slots each. If the same place is listed fresh (after a world switch), the same trees get 2,2,2,1,1. When a second or third flowering tree comes into the list, a quarter to a third of the carpet under a tree beside the walker vanishes at once, and petals in the air jump to another crown.

**Evidence.** leaves.js:271 most = Math.ceil(SLOTS / k); 277 keeps a slot when has[best] < most; 280 hands out only the slots with owner[s] < 0; 282-285 hide the lying petals of every slot that is not kept. I replayed this with the real Petals class (/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/tree/scripts/petal-slots-replay.mjs), giving trees one at a time. Slots per tree: k=4: 2,2,2,2; k=5: 2,2,2,2,0; k=6: 2,2,2,2,0,0; k=7: 2,2,2,2,0,0,0 (fresh k=7: 2,1,1,1,1,1,1); k=8: 1 each. Going 3->4 gives 3,3,2 -> 2,2,2,2, so slots move off trees that stayed. The test (scripts/trees-near-test.mjs, part 3) checks only 1 -> 4 trees (2,2,2,2) and a relist with k unchanged, so it passes.

**Suggested fix.** After the keep pass, make sure every listed tree has at least one slot. While some tree has 0 and another has more than 1, move one slot from the tree with the most. This gives 2,2,2,1,1 for 4->5, and it moves the fewest slots. Do not hide a moved slot's petals at once. Keep its lying petals where they lie (they are in world coordinates) and re-lay them one by one under the new tree with the put loop. Fade the slot's falling petals out over a second before its uPetalTree changes, for example with a per-slot fade in uPetalTop.z. Extend test part 3 to add trees one at a time 1->8 and require every listed tree to have at least one slot at every step. Include the count of lying petals hidden in one frame under trees that stayed.

**The check.** The defect is real at 178b732, but it shows less than the report says. I replayed it with the real Petals class and with the real Haven trees: treeBlock, bloomOf, day 265, blocks arriving nearest first, and the rule that petals are skipped while reach is 0. Scripts: /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/tree/scripts/mine-petals.mjs, mine-startup.mjs and mine-walk2.mjs.

**How it holds**
- leaves.js:271 sets most = ceil(8/k). Line 277 keeps an old slot while has[best] < most. Line 280 hands out only slots with no owner.
- Once 4 or more trees hold 2 slots each, the list growing to 5, 6 or 7 keeps all 8 slots on the old trees. The new trees get none: no uPetalTree entry, no falling petals, no carpet.
- Replay, adding trees one at a time: k=4 gives 2,2,2,2; k=5 gives 2,2,2,2,0; k=6 gives 2,2,2,2,0,0; k=7 gives 2,2,2,2,0,0,0; k=8 gives 1 each.
- Listed fresh, the same trees get 5: 2,2,2,1,1; 6: 2,2,1,1,1,1; 7: 2,1,1,1,1,1,1.
- Nothing else repairs it. A relist with the same list (Sun sweep, block reply, day change, governor step) keeps the same slots. Only a listed tree leaving the list, or k reaching 8, frees a slot.
- The first review (haven-rich-review.md, trees-3, second look, point 1) asked for slots to be rebalanced so that no tree starves. This fix only does that for k up to 4, so it is incomplete.
- Test part 3 (trees-near-test.mjs:169-173) checks only 1 to 4 trees, so it passes.
- At the opening place itself, start-up leaves 6 trees in flower as 2,2,0,2,0,2. The starved trees are at 76 and 85 m. That lasts as long as the player stays there.

**Why it shows less than claimed**
- New trees join at the edge of the 90 m list.
- Start-up at 150 places within 600 m of the start: 11 places ended with a tree that has no slot. Those trees were 49 to 89 m away, mostly over 58 m.
- Lying petals are not drawn beyond 55 m and fade out from 35 m. Falling petals fade out between 60 and 90 m.
- So most starved trees would show almost nothing anyway.
- Start-up followed by walks at 60 places (48 km in all): 70 starved spells. Only 9 came within 55 m of the walker while starved (closest 24 m, then 35 and 41-54 m), for about 124 m of walking in total.
- The scenario of "the 5th to 7th arrivals ahead of the walker standing bare" is therefore real but rare, and mostly far away.

**Second part: slots taken off trees that stay**
- This holds whenever `most` falls: k going 1→2, 2→3, 3→4, or anything up to 7 going to 8.
- Correction to the report: the share lost is not "a quarter to a third". It is a quarter (2→3), a third (3→4), half (1→2, and a 2-slot tree when k reaches 8), or three quarters (1→4, the very case the test runs).
- In the walks, 60 such moves hit a tree within 40 m of the walker. Each hid 23-60 lying petals in one frame. They are laid again under the other tree within about 10 frames, and that slot's falling petals jump to another crown.
- The first review already raised this residual (second look, point 3). The code comment at leaves.js:225-230 describes it as the chosen behaviour, so it is a known trade-off rather than a new finding.

**Severity: low, not medium.** It is cosmetic, it is mostly at distances where petals are barely drawn, and it is rare during a walk. It costs nothing on the phone.

The fix direction is right:
- After the keep pass, take a slot from the tree with the most until every listed tree has at least one.
- Extend test part 3 to add trees one at a time from 1 to 8, and require every listed tree to have at least one slot at every step.

### trees2-2. The list step uses the height over the ground under the eye as the distance to the nearest tree: beside a rim or a steep wooded side, the trees next to a flier keep their near mesh for up to 25 m

`src/life/treeLod.js:33`, medium; check: **REFUTED**

**What goes wrong.** fineStep = min(25, max(2, max(small, agl)/4, 0.2*speed)). The comment says 'from 40 m up the nearest tree is 40 m off'. But trees.js:490 passes rig.agl, the height over the ground directly under the eye (cameraRig.js:538/552, agl = r - ground). That is not the distance to the nearest tree. Beside a plateau's edge, a canyon rim or a steep valley side, agl can be 60 to 150 m while trees stand 5 to 15 m away at eye height. The step then grows to 15 to 25 m, which is the REBUILD_M pace of the first round. So trees-1 (which the round was meant to fix) comes back there: trees beside the flier stay the near mesh, close meshes stay up to 44 m away, and a band of trees changes make together at each step.

**What one sees.** Take off from the opening ledge, or any wooded rim of Haven's stepped plateaus and canyons, and fly along the edge at tree height with the ground far below. Trees 4 to 15 m off the wing are the plain near mesh (big sprays, no twigs, no flare) and change all at once every 25 m. Far cards come as close as 36 m against a near radius of 60.

**Evidence.** treeLod.js:31-34; trees.js:490 (rig.agl passed in). Replay with treeLod's own functions (/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/tree/scripts/rim-replay.mjs): a wood on a 7 m grid ending at a rim, with the eye 3-4 m out from the rim at tree height. Walking on the rim (agl 1.7): step 5 m, nearest tree not close 15.3 m, 0 % of tree-frames within 15 m not close, close meshes to 24.9 m, nearest card 55.2 m. Flying at 10 m/s with the ground 150 m below: step 25 m, nearest tree not close 4.1 m, 31 % of tree-frames within 15 m not close, close meshes to 44.2 m, nearest card 35.9 m. With the ground 60 m below: step 15 m, 6.6 m, 8 %, 34.3 m, 45.8 m. trees-near-test.mjs part 1 runs only agl = 1.7 on flat ground, so it cannot see this.

**Suggested fix.** Bound the step by the real distance to the nearest tree. In _fine, keep the smallest de2 over the candidates it already scans: this.nearest = Math.sqrt(min de2), with near + REBUILD_M when there is none. Pass that to fineStep in place of rig.agl: step = min(25, max(2, max(small, nearest)/4, 0.2*speed)). It keeps the intended promise (a tree D away can come no nearer than 3D/4 before the next choice) on any ground. Add a case to trees-near-test part 1 where agl is large and the trees stand at eye height.

**The check.** The code is as the reviewer describes, but the case that would make it matter does not occur on Haven. At 178b732, treeLod.js:31-34 sets fineStep = min(25, max(2, max(small, agl)/4, 0.2*speed)). trees.js:490 passes it rig.agl, which is r - ground directly under the eye (cameraRig.js:538 and 550-552). So the comment's claim that "from 40 m up the nearest tree is 40 m off" only holds over level ground.

The reviewer's numbers come from a replay that is not Haven's ground. It puts a vertical wall 146 m (or 58 m) tall 4 m from a wood, and measures distances in 2-D at the trees' own level. I measured Haven's real height function at 178b732 in Node (loadWorld('haven'), the layers dem + fbm + ridged at the walker's 0.4 m wavelength; scripts in scratchpad/review2/r_trees2/x/). A tree may stand only on land under the tree line with baseSlope < 0.95. Over 47,769 such places, the largest fall of the ground in any of 24 directions is:
- within 3 m: 4.8 m at the 99.9th percentile, 7.9 m at most;
- within 6 m: 9.4 m and 15.7 m;
- within 15 m: 22.3 m and 39.6 m.

Over 60,000 land points, the steepest 10 m fall is 2.27 m a metre at the 99.99th percentile and 3.17 at most. Around the 40 steepest walls found, the worst case for an eye 10 m over a foot where a tree may stand is agl 50.5 m with that foot 15.6 m away (ratio 3.2). So rig.agl is at most about 3 times the distance to the nearest tree's foot at the single worst walls, and about 2 times at the steepest thousandth of places. The reviewer's 'agl 60-150 with trees 4-15 m off' is not possible here. agl 150 needs the nearest tree about 50 m away or more; agl 60 needs it about 18 m away or more.

I replayed the reviewer's rim run with the rule's own functions, in 3-D (the make is chosen by the foot's distance), along a wall falling 3.4 m a metre: steeper than 99.99 % of Haven's land.
- Eye 2 m over the wood, 12 m out (agl 43, step 10.7 m): nearest tree not close 13.5 m, against 15.4 m on level ground; 2 % of tree-frames within 15 m not close (reviewer: 31 %); close meshes reach 28.9 m (24.6 on the flat); nearest card 50.0 m (55).
- Eye 10 m over the wood, 12-16 m out (agl 51-64, step 12.7-16.1 m): no tree within 15 m at all; nearest not close 15.8-18.9 m; nearest card 45-48 m.
- Along walls of 1.5 to 2.6 m a metre, the figures stay within about 1 m of the level-ground promise: 0 % within 15 m not close, cards from 50 m.

So trees-1 does not come back. At the worst spots on the world the close/near boundary moves about 2 m nearer, and the near/card boundary moves from about 55 m to about 45 m. That is unnoticeable in flight.

Two further points:
- In the reviewer's own extreme, the terrain camera's near plane is 0.15 × agl (app.js:1377): 22.5 m at agl 150, 9 m at agl 60. Most of the 'near mesh at 4-15 m' trees would be cut away by that, not drawn as the near mesh.
- Hero flight speed (speedLaw.js flightBase, 0.2 × agl) does not interact with any of this.

The first review's accepted remark, that this does not matter from the air above about 60 m, still holds. Possibly Earth's real cliffs (Yosemite-type walls in 27 m elevation) give larger ratios. I could not check that, because Node sees only bundled maps, and Earth is not this delivery's world. Even there, baseSlope from the coarse map removes trees from the rims of the steepest walls.

Severity if kept: low, a comment's wrong premise. The fix (the nearest de2 already scanned in _fine) would be harmless but buys nothing visible on Haven.

### trees2-3. From above, a far tree's rosette, the only part of it still drawn, lies in the shadow of its own upright cards, which the shadow pass now draws whole: crowns darken inside the shadow map's 120 to 150 m

`src/life/trees.js:97`, medium; check: **REFUTED**

**What goes wrong.** The fix for trees-2 draws the whole-tree cards (aLeaf 4) at full width in the depth pass (TREE_DEPTH, edge = 1), which is right for their shadow on the ground. The colour pass still draws them in by the eye's angle, and when looking down more than about 68 degrees they are gone. The tree is then its rosette (whole(): a horizontal card at y = 0.3 H for a fir, 0.72 H for a pine, 0.68 H for a broadleaf, treeGeometry.js:168-171). The upright cards reach 1.1 H, so they stand above that rosette and cast onto it. The colour pass asks nearShadow at vRel + N*0.45 (trees.js:303), which is still under the cards. So the visible top of each far tree is shaded by foliage that is not drawn. Before this round, from steep angles the cards were drawn in in both passes and the rosette was lit. Far-list trees (60 to 240 m) receive the near shadow only out to uShadowParams.x = 150 m, fading from 120 m (nearShadow.js:240, 260; config.js:40). So the darkening covers a disc round the camera that moves with it.

**What one sees.** From 100 m up, looking down 60 to 90 degrees over a wood (the from-above views), the crowns 60 to 120 m from the camera are 20 to 50 % darker and blotched compared with those past 150 m, with the change across 120 to 150 m. As the traveller flies, the dark disc goes along with them.

**Evidence.** trees.js:97-101 (edge = 1.0 under TREE_DEPTH, the eye's angle otherwise); 323 (depth material defines TREE_DEPTH); 303 (the shadow lookup point); app.js:303 (far-list sets cast themselves); treeGeometry.js:168-171 (cards 0..1.1 H, rosette at y). I replayed the cards' cut-outs from public/data/tree_atlas.png (/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/py/selfshade.py), tracing every covered rosette texel toward the Sun against both cards (cover >= 0.3, the depth pass's cut). Share of the rosette under its own cards, with the Sun at 25/45/65 degrees: fir 35-39 % / 34-39 % / 31-35 %; pine 52-65 % / 52-64 % / 47-52 %; broadleaf 63-75 % / 56-62 % / 33-35 %. Before this round it was 0 % once the cards were fully drawn in. The depth pass keeps about 69 % of leaf pixels (80/256 thrown away), so the rosettes are 20-50 % darkened.

**Suggested fix.** Keep the cards whole for the ground, but do not let them shade the tree's own rosette when it stands in for them. Give the far mesh's rosette its own aLeaf code (for example 3.4, still < 3.5). In the vertex shader, pass vLift = (1 - edge) * (IMP_TALL - y) * iA.w for it (0 otherwise; one float fits in a spare varying component). In the fragment shader, ask nearShadow at vRel + N*0.45 + up*vLift, which is the top of the crown, the part a looker-down sees. Check it with a version of the replay above: rosette shadow under 5 % looked straight down, and unchanged from the side.

**The check.** The mechanism is real at 178b732. TREE_DEPTH sets edge = 1 (trees.js:96-97, 323), so the shadow pass draws the whole-tree cards at full width. Far-list sets cast with their own far mesh (app.js:303; s.cast = s.mesh for lod 2). The colour pass draws the cards in by the eye's angle, and the rosette asks nearShadow at vRel + N*0.45 (trees.js:303), which is under those cards. I re-ran the reviewer's selfshade.py on the atlas at 178b732 and got the same covered shares: fir 31-39 %, pine 47-65 %, broadleaf 33-75 %. Even so, the claim does not hold as a defect of this round, and its picture is overstated.

1) Not new against what the owner has. At the merge base with main (84d5478) the rosette is the same: whole() and the far() parameters are unchanged. The lookup is the same N*0.45, and the cards were whole in both passes. So the rosette sat in exactly this self-shadow there too, under visible card slivers. The 0 % "before" is only the intermediate commit ddd47a1, which carried the trees-2 bug. The fix restores main's shadow; what ddd47a1 changed on purpose is that the slivers are no longer drawn.

2) The size is overstated. Covered share is not brightness. The shaded texels lie on the rosette's side away from the Sun. There the corner normals of the old rule (treeGeometry.js build: a fir's rosette corners point about (0.70, 0.16, 0.70)) already turn from the Sun, and paintLit(nl*0.75+0.25) is 0 for nl < -0.39. I replayed trees.js's painted lighting per covered rosette texel looked straight down: paintLit, through, sky*open and glow, with the shadow at 0.31 visibility where the depth pass's cut and 69 % keep apply. The replay includes the 0.45 m push plus about one texel, a crown width of 0.6 to 1.0, H of 10 to 20 m, and sky/sun from 0.2 to 0.45. Averaged over the rosette, it comes out darker by:
- 5-13 % for the fir shape (Douglas fir and spruce, most of Haven's wood);
- 17-27 % for the pine shape;
- 14-24 % for broadleaf, which barely occurs on Haven.
These are not 20-50 % (/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/rs/lum.py).

3) The scenario's geometry is wrong. At 100 m up no tree is nearer than about 90 m. The cards are fully drawn in only within about 35 m sideways (95-106 m from the eye) and partly out to about 79 m sideways. A rosette shows alone only when the tree is in the far list (at least 60 m away, otherwise the near mesh is drawn whole) and within the shadow's 150 m. That limits it to heights of about 60 to 150 m, at full strength only below about 115 m. The change across 120-150 m falls on trees seen at under 49 degrees, whose cards are whole. That is the near shadow's own reach, which applies to every far-list tree (the crossed cards shade each other and their neighbours) and was the same on main. No rosette under the eye ever stands beside an unshaded one: the far forest's rosettes from above begin at 240 m, beyond the shadow.

4) It is arguably the right look. The cards stand for the crown above the rosette, and the side of a crown away from the Sun is in its own shade.

What is left is a gradual 5-25 % brightening of the woods straight below on climbing through about 115-150 m, which is the near shadow's existing edge and not a regression. The proposed fix would light the rosette's dark side fully and make it flatter than main.

### trees2-4. The rule for what a texel is still differs between the near trees and the far forest: wood takes the opposite thresholds after the merge, and an out-of-flower cherry keeps a petal tint on mixed texels

`src/life/trees.js:234`, low; check: **holds**

**What goes wrong.** (a) trees.js:234 now takes wood = cut.b > 0.75 on every tree. Its comment (228-229) says 'as the far forest takes it'. But at 178b732 farForest.js:247 takes wood = cut.b > (flowers ? 0.75 : 0.5), after farforest-6. Each helper moved to the other's old rule, so the two still disagree, just the other way round: on trees that never flower, texels with blue in (0.5, 0.75] are leaf green inside 240 m and twig brown beyond. (b) Out of flower, line 239 clears petal only when petal > 0.5 (blue > 0.25). Mixed leaf/petal texels with blue in (0, 0.25], from the atlas's coverage-weighted mips and the picture's own edges, keep petal = 2b, which is up to half the pale petal colour. The far forest (inFlower, open = 0) draws them pure leaf. The fix for trees-4 is therefore incomplete.

**What one sees.** (a) On every non-flowering tree, trunk and limb edges in the pictures change from green to brown where the near trees hand over to the far forest, and the line moves with the traveller. (b) With the clock outside the bloom window (ten months of the year), cherries and blackthorns within 240 m have a pale pink-grey speckle on their green crowns, about one texel in seven on their whole-tree cards. Past 240 m the same trees are plain green.

**Evidence.** trees.js:234-239 against farForest.js:244-247 (both at 178b732; commits 04f67d0/e56a47d for the far forest, f373add for the near trees, joined in 616db3a/a2ba606). Measured on public/data/tree_atlas.png with loadAtlas's mip averaging (/tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/py/woodline.py, tint.py). (a) Drawn texels of the non-flowering whole-tree pictures with blue in (0.5, 0.75]: 0.2-3.2 % at mips 0-4 (pine 1.9-3.1 %, slender 1.6-3.2 %). (b) BLOSSOM whole-tree pictures: 12-14 % of drawn non-wood texels at mips 0-1, mean tint 0.30-0.35 (5-9 % at mips 2-3). Blossom spray and roseB: 2-12 % with mean tint about 0.3.

**Suggested fix.** Have one rule in one place, as the lessons ask. Pick one wood threshold (0.75 for flowering trees and 0.5 otherwise, as the far forest now has, since farforest-6 judged it from pictures) and export it as a GLSL snippet used by trees.js, its depth pass and farForest.js. For (b), clear the petal share whenever the flower is not open: `if (h >= vBloom.w) petal = 0.0;` without the `petal > 0.5 &&` condition, and let the winter test treat those texels as leaves.

**The check.** Both halves hold at 178b732. Some of the numbers need correcting (see below).

(a) The near trees and the far forest still use different wood thresholds, now reversed.
- trees.js:234 takes `wood = card ? cut.b > 0.75 : vLeaf < 0.5` on every tree. Its comment at 228-229 says this is "as the far forest takes it", which is false.
- farForest.js:247 takes `wood = cut.b > (flowers ? 0.75 : 0.5)`, with `flowers = vOwn.y > 3.5`. That flag is decoded from iC.w's +256 at line 162 and passed through vOwn at line 214.
- The first review asked for opposite fixes: trees-4 said "0.75 for every tree, as farForest does", and farforest-6 said "use the near trees' rule". Each helper followed its own finding, so after the merge the mismatch is simply reversed.
- On trees that never flower, texels with b in (0.5, 0.75] are now leaf green inside the moving 240 m line and twig colour beyond it.
- I re-ran woodline.py on the atlas at 178b732 (the scratchpad copy is byte-identical). On the eight non-flowering shapes' whole-tree pictures, 0.0-3.2 % of drawn texels flip (pine 1.9-3.1 %, slender 1.6-3.2 %, mips 0-4). This matches the first review's 0.1-3.2 %, which it judged low: sub-pixel to one-pixel fringes, dark against dark.

(b) Out of flower, mixed leaf/petal texels keep a petal tint.
- Out of flower, iE.w is bloomOf().open = 0, while iE.rgb is still the petal colour (trees.js:579). So at line 239 `h >= vBloom.w` is always true, but petal is cleared only when it is above 0.5.
- A non-wood texel with b in (0, 0.25] therefore keeps petal = 2b, up to 0.5. Line 277 then mixes that share of the pale petal colour into the leaf.
- These texels exist in the source picture, not only in the mips:
  - treeAtlasGen averages a supersampled wood code (leaf 0, petal 1, wood 2, then halved), so petal/leaf edges already lie between 0 and 0.5 at mip 0.
  - The GPU's bilinear filtering adds a band at every petal edge, including against empty texels: with r ≥ 0.42, b ≥ 0.21.
- The far forest draws these trees as pure leaf. inFlower with k = 0 returns sp.leaf, and the far shader has no petal path. ARCHITECTURE.md also states the intent: "out of flower its petal texels are leaves, near and far alike".

How big (b) is:
- The texel-wise replay (tint.py) reproduces the claim: BLOSSOM whole-tree pictures are 12-14 % tinted at mips 0-1, with mean tint 0.30-0.35.
- My bilinear replay (refute_t2/bilin.py) at the levels actually used fits the game better. Whole-tree cards are drawn only from 60 to 240 m, about lod 1-3 for a 10 m tree on the phone. There the share is 6-11 % of drawn non-wood samples, with mean tint about 0.36. At the 240 m line (mips 3-4) it is 5.5-7 %. So "one texel in seven" is the mip-0 figure; near the line it is about one in fifteen.
- The sprays used near by: the blossom spray is 2.7-7.7 % tinted at mips 0-2, roseB 4.8-11.8 %.
- In colour: a cherry leaf texel at luminance about 0.04 becomes about 0.20 (a warm pink-grey) at tint 0.36. paintColour softens this to about 3.9 times, a clearly visible fleck. On average a crown is roughly a quarter brighter just inside the line than just outside it.

Reachability (b): no clock change is needed. At the opening date (2024-09-22), bloomOf puts every cherry and blackthorn in Haven's northern hemisphere out of flower (day 265 against 62-118 and 55-105). haven.js places species 64 and 65 in every biome mix (lines 125-129), and Haven is small. The opening place at 48.5° south is in flower, which is why the opening pictures do not show it. Any clock change outside the window shows it as well.

A small correction to the fix: the winter test already treats texels with petal ≤ 0.5 as leaves (line 241). Only the `petal > 0.5 &&` condition at line 239 needs to go.

Nothing hides either effect. No brief lists them as accepted: trees-refined-2 job 4 and from-above-2 job 1 both meant to remove them. No test covers the near/far rule. Severity is low: (a) is fringes of a pixel or less, and (b) is a visible speckle on two species within 240 m, plus a brightness step at the moving line. Both fixes are one-liners.

## farforest2 (from-above helper)

### farforest2-1. The far trees' shadow draw now runs on the ground, nearly always for nothing: a tile is gated by the eye's height over its lowest tree, and on Haven nearly every tile reaches down into a valley or the sea

`src/life/farForest.js:486`, medium; check: **holds**

**What goes wrong.** tileShadow(len, tile.low, tile.near) (lines 60-63) measures `over` from the tile's lowest tree, which can be kilometres away from the trees actually in view. On Haven's relief nearly every tile, and every large one, holds ground hundreds of metres below a walker. So air = 1, reach is true, and `shade` (line 493) hands every tile its shadow mesh on foot. That is one more draw call per tile, with all of its uniforms uploaded, and 4-6 vertex runs per held instance, each doing FORM_GLSL and a cloudShade texture read before `a` throws it out. At 8daf8e9 none of this was drawn under 60 m over the ground (air came from rig.agl).

**What one sees.** Standing in the north wood (the 'in the forest' view, 22.983, 129.507, eye 1.7 m): 32 of the 33 drawn tiles get the shadow draw, which is 81 358 instances (about 0.33-0.49 M vertex runs a frame before culling) and up to 32 extra draw calls. Not one of those trees is looked down on steeply enough to cast a shadow (0, by the shader's own angle rule). At the opening place on foot: 26 of 30 tiles and 46 860 instances, for about 2 000 trees that can cast, all in 5 tiles. The cost is paid every frame on foot, in a wood, the place the phone was slowest in the ninth benchmark, and nothing shows for it. The test does not catch it. far-tree-form-test.mjs:65-66 checks 'on the ground no shadows are drawn' on a made-up flat tile (low = R, eye R+2), which passes while the real wood does the opposite. Its 'a metre on' half (line 63-64, b.air === a.air) cannot fail, because air does not depend on `near`.

**Evidence.** farForest.js:60-63 (over = eyeLen - low; reach = near < over*4.77 + 400), 486 (called with tile.low), 493-494 (shade -> s.shadow.visible), 520-522 (low = the lowest foot of every tree in the reply). Replay scratchpad/review2/tree/scripts/rv-ground.mjs: the game's own wantedTiles, treeTile, setMadeCover, tileShadow, MARGIN and fill rule on Haven's real height. North wood: '33 tiles drawn, 32 given the shadow draw, 81358 instances ... trees that can cast: 0'; tile lows there reach sea level, so over is about 1 190 m. Opening place: '26 given the shadow draw, 46860 instances ... can cast: 2018', every shaded tile at air 1.00 except two at 0.04 and 0.27. At 8daf8e9, air = clamp((rig.agl-60)/100) = 0 at 1.7 m, so draw range 18 and no blending.

**Suggested fix.** Gate each tile by how steeply its own trees are seen. _fill already walks every kept tree with eye-relative positions and is redone after 0.1*far3 of travel. Keep tile.maxDown there: the largest `down` to a crown, measured as the shader measures it, against the tile's up. Hand over the shadow draw only when maxDown exceeds SHADOW0 less a margin for the travel since the fill (or corrected by the eye's change of height since then). With that gate, air can go or stay as a fade. Make the test replay real tiles at the north wood and the opening place, as rv-ground.mjs does, and fail when a tile with no tree able to cast is given the draw.

**The check.** The finding holds. I read the code at 178b732 and replayed the game's own rules on Haven's real height function, using wantedTiles, treeTile (the same call the worker makes), tileShadow, MARGIN, CAP and GROW, and the shader's early-out and form arithmetic.

**Why the code does this.** tileShadow (farForest.js:60-63) measures `over` from the tile's lowest tree, which is set at lines 520-522 from every tree in the worker's reply. On Haven's relief that low point is tens to hundreds of metres under a walker even for the tile underfoot. At the north wood the level-0 tile underfoot has its lowest tree 64 m below the eye, so air is 0.005, which is above 0. Larger tiles reach down to sea level, so over is about 1 190 m. That gives air = 1 and reach = true (near < over*4.77+400). So `shade` (line 493) is true and s.shadow.visible is set for nearly every tile on foot. Nothing else blocks it:
- `shown` holds up to 6 km.
- `this.shadows` is false only when the governor's tree-shadows step is taken, and in Sharp with headroom it is not.
- far3 is below 4200 for these tiles.
- Pool and `have` limits do not bite: 33 tiles, against a pool of 40.

In the shader, every vertex past `d < inner` / grow<=0 runs FORM_GLSL (two pow), the uniform-array lookups and cloudShade's textureLod (lines 157-164) before the shadow branch throws it out at `a < 0.004`. At 8daf8e9, and at the benchmarked 6ac24ff, the shadow quad was handed over only when rig.agl was above 60 m, so a walker paid none of this. This is new cost on foot. It is not listed as known or accepted anywhere in docs/ (PROGRESS, ARCHITECTURE, haven-rich-review).

**The reviewer's figures.** Their replay (rv-ground.mjs) reproduces exactly:
- North wood: 33 tiles drawn, 32 given the shadow draw, 81 358 instances, 0 trees able to cast.
- Opening place: 26 tiles, 46 860 instances, 2 018 able to cast.

**Refined figures** (scratchpad/review2/tree/scripts/rv-ground-check.mjs adds CAP, the early-out and three's frustum cull of the shadow mesh by its bounding sphere, at fov 48 and aspect 880/412):
- North wood, at headings 6, 96, 186 and 276: 19-20 of the 32 shadow draws survive the cull. They carry 67-74 k instances, about 0.27-0.30 M vertex runs at 4 per instance. Of these, 0.21-0.23 M pass the early-out and pay the form arithmetic and the texture read. None can cast at any heading.
- Opening place: 12-22 draws in view, 0.11-0.18 M vertex runs. All 2 018 trees that can cast are in about 5 tiles, so the other tiles' draws are waste. Those 2 018 are the farforest-3 overlook case working as meant.

So "up to 32 extra draw calls" is really about 20 after culling. The "0.33-0.49 M before culling" is right as stated; after culling it is about 0.27-0.30 M.

**The test claim.** It is right. far-tree-form-test.mjs line 65 uses a made-up flat tile (low = R, eye R+2), which the real wood never matches. The b.air === a.air half cannot fail, because air does not depend on `near`.

**Severity.** No picture changes; every one of these vertices is thrown out. The cost has two parts:
- GPU: some 0.2-0.3 M vertex runs a frame, each with a texture fetch, plus binning of about 135 k killed triangles. That is likely a few tenths of a millisecond up to about 1 ms.
- Page work: about 20 extra draws, each with its own material and so a full uniform re-upload, including the CELLS arrays.

It is paid every frame on foot, worst in the wood, which was the phone's heaviest view. It is below what the cost test can resolve (3 ms), so no benchmark will flag it, and the test cannot catch it. The earlier review rated "a few tenths of a ms every frame for nothing" as medium. I judge this medium as well, at the low end.

### farforest2-2. The wood rule crossed over: the near trees now take wood at 0.75 on every tree, the far forest at 0.5 on trees that never flower, so trunks change again at the 240 m line

`src/life/farForest.js:247`, medium; check: **holds**

**What goes wrong.** Each helper copied the other's old rule. trees.js:234 (trees-4 fix, f373add) now reads `wood = card ? cut.b > 0.75 : ...`, with the comment 'over 0.75 on every tree, as the far forest takes it: life/farForest.js'. farForest.js:245-247 (farforest-6 fix, e56a47d/04f67d0) now reads `wood = cut.b > (flowers ? 0.75 : 0.5)`, with the comment 'by the near trees' rule, trees.js'. At 8daf8e9 the two rules were the other way round. They still disagree, now in the opposite direction, for every species without blossom.

**What one sees.** All of Haven's conifers and aspens, crossing the line where the near trees end (it moves with the traveller). Inside it, atlas texels with b in (0.5, 0.75] are leaf-green: the quarter-texel band along every trunk and limb edge, and by the first review's atlas count up to 43 % of a fir's wood at lod 2. Outside it the same texels are twig grey-brown. A tree's trunk and limbs become about half a texel thicker and browner as it passes the line. This is the 'moves when I move' kind of line that farforest-6 set out to remove.

**Evidence.** git show 178b732:src/life/trees.js lines 228-234 against git show 178b732:src/life/farForest.js lines 241-247. git show 8daf8e9:src/life/trees.js:183 had `cut.b > (flowers ? 0.75 : 0.5)`, while farForest at 8daf8e9 had 0.75 for all. The near depth pass (trees.js:342-343) also uses 0.75.

**Suggested fix.** Write the rule once and use it in both places (the charter's lesson about two places agreeing on a rule). For example, export the wood cut (or a GLSL isWood(cut, flowers) chunk) from life/farTreeForm.js and use it in trees.js, both passes, and in farForest.js. trees-4 settled on 0.75: petal texels are leaves out of flower. So farForest.js:247 goes back to `cut.b > 0.75`; the flowers flag in vOwn can stay. Add a check, for example in far-tree-form-test, that both shader strings contain the same chunk.

**The check.** The finding holds as written, but I rate it low, not medium.

**The code at 178b732**
- src/life/trees.js:234 reads `wood = card ? cut.b > 0.75 : vLeaf < 0.5` for every tree. Its comment says "over 0.75 on every tree, as the far forest takes it".
- The near depth pass (trees.js:342-343) also uses 0.75.
- src/life/farForest.js:245-247 reads `wood = cut.b > (flowers ? 0.75 : 0.5)`, with the comment "by the near trees' rule, trees.js".
- At 8daf8e9 it was the other way round: trees.js:183 had `(flowers ? 0.75 : 0.5)` and farForest.js:225 had `> 0.75`.

**How it happened**
- haven-rich-review.md raised the same mismatch twice:
  - trees-4 said to move the near trees to 0.75 for every tree.
  - farforest-6 said to move the far forest to the near trees' rule.
- trees-refined-2.md job 4 and from-above-2.md job 1 gave this to two helpers without saying which side should move. Each copied the other's old rule (f373add and e56a47d/04f67d0).
- Nothing at 178b732 lists this as known or accepted. No script compares the two shader strings; the only cut.b hits are the shaders themselves and the trees report's note.

**Nothing hides it**
- In farForest.js:162 and :556 the flowers flag is bit 256 of iC.w, set only when the species has blossom. The rest of iC.w is at most 251, so the decode is exact.
- Every conifer, pine, broadleaf and slender/aspen therefore takes 0.5 beyond the line and 0.75 inside it.
- The far forest starts at d >= uFar.z = tr.reach, which is the near trees' radius. At eye level the near trees draw the same whole-tree cards (lod 2, card = true) from the same atlas at the same mip on the other side of that line. The texels in (0.5, 0.75] are leaf inside the line and wood outside it, now in the opposite direction from 8daf8e9.
- The atlas has not changed since 8daf8e9.

**The numbers reproduce**
I reran the first review's replay (loadAtlas mips weighted by cover, the lod-dependent cut) on the 178b732 atlas. Scratch copy: /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/wood/woodflip.py.
- Conifer (arch 0) at lod 2: 55 of the far rule's 128 wood texels flip. That is the reviewer's 43 %; seen from inside the line, the far side has 75 % more wood (128 against 73).
- Shapes that never flower: 0.1 to 3.2 % of drawn texels flip at lod 0 to 4.
- Bilinear filtering adds a band a quarter of a texel wide on each wood edge, against leaf or empty, so the far rule gives about half a texel more wood.

**Why low**
- At 240 m on the phone a 20 m tree's picture is at lod about 2, roughly one texel per pixel. Per tree that is a few to about 20 pixels, plus sub-pixel fringes, changing from dark green to dark grey-brown as the tree crosses a line that moves with the traveller.
- This is exactly the size of farforest-6, which the first review checked and rated low ("sub-pixel to one-pixel fringes, dark against dark").
- The fixes reversed the direction but did not make it worse. The larger bark-colour mismatch at the same line has been fixed: both sides now use the twig colour.

**One more mismatch at the same line, not in the claim**
- Near card wood takes sky light `open = mix(0.22, 0.6, smoothstep(0.0, 0.5, vY))` (trees.js, the open line after `through`). On a whole-tree card, vY runs from 0 to about 1 up the tree.
- Far wood takes a constant 0.45 (farForest.js, the `open` line).
- So the sky term on a trunk's lower half changes by up to about two times at the line anyway.
- Sharing only the threshold, as suggested, will not make wood invisible at the line. The shared chunk should carry the wood's light terms as well. The rest of the suggested fix is sound: one exported wood rule (0.75 for all, as trees-4 settled), used in both trees.js passes and in farForest.js, and a test that the shader strings contain it.

### farforest2-3. The governor's 'tree-shadows' switch is eased too, so the far shadows stay drawn for about 3.7 s and the benchmark's cost test cannot see what they cost

`src/life/farForest.js:487`, medium; check: **holds**

**What goes wrong.** `wantAir = this.shadows === false ? 0 : sh.air` is passed through the 0.8 s ease. The shadow mesh stays visible while tile.air > 0 (line 493) and is only snapped off when air < 0.01, about 0.8*ln(100) = 3.7 s after the switch. Until then every shadow vertex still runs, and most shadow pixels too, until air*a falls under 0.004. A saving that is meant to act at once acts seconds late.

**What one sees.** The cost test (perf/benchmark.js) switches one saving on, skips 5 frames and measures 16. At 30 fps that is about 0.2-0.7 s after the switch: air is still 0.78 down to 0.42, and every draw and vertex is still there. The far-forest share of 'tree-shadows' therefore reads about zero. The next configuration is then measured while the shadows fade back in. governor.js:66 says this share is 'not yet measured on the phone'. The next benchmark is where it would be measured, and it will report nothing, while finding 1 puts this cost on the ground too. A governor trial of the step also gets its saving seconds late.

**Evidence.** farForest.js:486-489 (the ease, and the snap only within 0.01), 493 (shade needs tile.air > 0). benchmark.js:262 WARM = 5, TAKE = 16; frameDone counts only from frame 6. Arithmetic: exp(-0.2/0.8) = 0.78, exp(-0.7/0.8) = 0.42, and 3.7 s to reach under 0.01.

**Suggested fix.** Apply the switch at once and ease only the part that comes from height. For example, when this.shadows === false set tile.air = 0 and hide s.shadow, and when it comes back on let tile.air rise from 0. Alternatively, test `this.shadows !== false` in `shade` directly.

**The check.** The defect is real at 178b732, though a few of the report's details need correcting.

**How the code behaves**
- Line 486 is `wantAir = this.shadows === false ? 0 : sh.air`. Line 487 eases `tile.air` toward that value with a 0.8 s time constant, and line 488 only snaps it to the target within 0.01.
- Line 493 draws the shadow (`shade = vis && tile.air > 0 && ...`). Nothing else in farForest.js reads `this.shadows`: the shadow mesh's `visible` and `shadowTiles`/`shadowsShown` hang only on `tile.air > 0`.
- In the vertex shader (lines ~162-171), `uTileShadow` only scales `a`. A quad is thrown out only when its total `a` falls under 0.004. Until then every shadow instance's vertices run, and every quad is filled at full size, just fainter.
- So once the governor sets `farForest.shadows = false` (governor.js:67), a tile with `sh.air = 1` keeps its shadow draw for 0.8·ln(100) = 3.7 s. My replay of lines 487-488 gives 3.70 to 3.74 s at frame lengths from 33 to 67 ms.
- Switching back on costs at once: `air` is above 0 on the first frame, so the mesh is drawn immediately. The saving is late; the cost is not.
- The near trees' half of the same step (`trees.shadowsFar`, app.js:303) acts at once. Only the far forest's half is delayed.

**The cost test (benchmark.js)**
- WARM = 5 and TAKE = 16, so the frames measured are k = 6 to 21 after the switch, with a cap of k = 60.
- The governor still paces frames in the cost test, because `paced` is fixed at construction. In Sharp a frame is at least 33 ms. The ninth benchmark's full frames were 55 to 72 ms.
- Replayed `tile.air` while frames are measured (scratchpad review2/ease.mjs):

| Frame length | k = 6 | k = 21 | k = 60 |
|---|---|---|---|
| 33 ms | 0.78 | 0.42 | 0.08 |
| 50 ms | 0.69 | 0.27 | 0.02 |
| 67 ms | 0.61 | 0.17 | 0 |

- The mesh is therefore never hidden during a measurement. Every draw, every vertex and almost every shadow pixel are still paid. The far forest's share of the `tree-shadows` row reads close to nothing. It is not exactly zero, because the trees whose `a` was already near 0.004 do drop out.
- That share is the one governor.js:66 says is "not yet measured on the phone". Since the farforest-3 fix it is drawn on the ground too, wherever valley tiles lie 60 m or more below the eye, as at an overlook like the opening ledge. The next benchmark was going to be its first measurement, and it will misread it.

**Corrections to the report**
- Its 0.78 and 0.42 hold only for 33 ms frames. On the phone's slower cost-test frames, `air` runs from about 0.6–0.7 down to about 0.17–0.27.
- The worry about the next configuration being measured "while the shadows fade back in" does no harm. The meshes never went off, so the next row's cost is unchanged.
- The "the far forest" left-out row, `setFraction(0)`, hides everything at once and so still contains the shadows' cost. The cost is mis-attributed, not lost from the table.

**The governor**
- After a step down the governor waits a 0.7 s cooldown plus a fresh 24-frame window. It judges again about 1.5 s later, or about 2.8 s later for a probe trial (cool 2.0). Both come before 3.7 s.
- In the air above about 384 m on Haven, the near-tree steps are not live, so `tree-shadows` is live only through `farForest.shadowsShown`. There the whole step bites after the trial has looked. The trial either takes further steps it did not need or judges the savings futile and puts them back, while being credited with `buys` 2.7.

**Is it known?**
- Nowhere listed as known or accepted. The first review (farforest-2) suggested easing the height-driven strength. The fix routed the governor's switch through the same ease, which is a side effect nobody noted.

**Fix**
- As the report proposes: apply the switch at once (zero `tile.air` and hide `s.shadow`, or test `this.shadows !== false` in `shade`), and ease only `sh.air`.

**Severity: medium.** Nothing looks wrong in the picture. What breaks is the instrument the ladder is tuned by, at the one measurement it was waiting for, and the step's trial in flight.

### farforest2-4. farforest-7's rosette part was fixed on the wrong mesh: the trees' sphere still leaves out crown tops spread from above, and the added term sits on the shadow sphere, where it never applies

`src/life/farForest.js:572`, low; check: **holds**

**What goes wrong.** The rosette is quad 2, so it is drawn by `geo` (draw range 0-18), whose sphere is still sqrt(bound2) + 20. The fix added `tallest * Math.max(SHADOW_LONG, TOP_MAX * 0.3)` to shadowGeo's sphere (line 576). That mesh draws only the fourth quad, and 5 > 2.4, so the TOP_MAX term never wins there. From above, a closed wood's rosette spreads to wRose (up to TOP_MAX = 8) crown widths, with a half diagonal of sqrt2*g.x*iB.x*wRose*h. The upright cards (wSide*g.z*iB.x*h, up to about 1.2 h for broad crowns) are not covered by the +20 m either.

**What one sees.** From the air, looking down on a closed wood 2-5 km away, turning or flying on. When a tile's sphere leaves the view through a corner-on frustum plane, the tops of its corner trees' crowns vanish with it at the screen's edge, and come back when the sphere re-enters.

**Evidence.** Lines 572 and 576, and quad 2 being the rosette at lines 191-196. Replay scratchpad/review2/tree/scripts/rv-rose.mjs with the real FORM numbers: for a broad crown (g.x 0.45, wide 1.2) in a closed wood seen from above, the half diagonal is 2.7 h at 2 km, 3.8 h at 3 km and 4.8 h at 4 km (53/75/96 m for a 20 m tree), against a 20 m margin. For Haven's conifers (g.x 0.22-0.26, wide 0.6-0.9 x up to 1.2) it is about 1.3-1.9 h at 3-4 km (26-38 m).

**Suggested fix.** Grow the trees' own sphere instead: s.geo.boundingSphere.radius = sqrt(bound2) + 20 + the largest, over the filled trees, of max(sqrt2*g.x*iB.x*TOP_MAX, 1.5*g.z*iB.x) * h. Track that in _fill beside `tallest`. The shadow sphere needs only tallest*SHADOW_LONG.

**The check.** The code part holds at 178b732. The visible effect is much smaller than the report says. On Haven I could not make it happen at all.

**What holds**
- `geometry(0, 18)` is `geo`, which draws quads 0 to 2. Quad 2 (position.x 2) is the rosette.
- `shadowGeo` (`geometry(18, 6)`) draws only quad 3, the shadow.
- Line 572 leaves `geo`'s sphere at sqrt(bound2) + 20.
- Line 576 adds `tallest * max(SHADOW_LONG, TOP_MAX * 0.3)`. That is max(5, 2.4), always 5, so the TOP_MAX term is dead.
- The comment at 573-575 says the rosette's spread is covered, on a mesh that never draws a rosette.
- The first review's check of farforest-7 (haven-rich-review.md:877) noted the rosette. Its fix was put on the wrong mesh, so this is an incomplete fix and may be reported again.
- The meshes keep three's default frustumCulled.

**Wrong or overstated numbers**
1. g.x 0.45 is the umbrella shape (arch 4), which Haven does not grow.
   - Haven's closed woods are conifer (g.x 0.17 to 0.22), pine (0.26) and aspen (0.2).
   - iB.x = S.wide x (0.85 to 1.2): at most 1.08 for these trees.
   - Only cottonwood by water reaches g.x 0.28 to 0.4 with iB.x up to 1.44.
2. The rosette picture (treeAtlasGen.js `rosette`) is sprays 0.85 to 1.1 half-widths long, radiating from the middle. The quad's corners are cut away, so the visible reach is about 1.0 a, not sqrt2 x a.
3. At 4 km seen from above, grow is about 0.80 (the END_ABOVE fade) and was left out. So 4.8 h becomes 3.8 h even for the wrong shape.
4. More important: a point can be culled wrongly only if it lies outside the sphere. Large tiles' spheres are set by their corner trees, so only drawn trees in a corner triangle of about (a - 20)^2 m^2 can poke out. Their tile corner must also line up with a frustum side plane's normal within about sqrt(2(a - 20)/|p|): 5 to 9 degrees.

**Replay** (three's own Frustum: scratchpad/review2/rose/cullrose2.mjs and sweep.mjs)
- Setup:
  - flat closed wood on tiles L1 to L3, with the game's fill rule, bands, keep and margin;
  - grow and FORM_GLSL as in the shader;
  - fov 48, phone aspect 3088 x 1440;
  - 80 camera setups (height 1 to 4.5 km, pitch -25 to -85), each swept through 720 yaws (0.5 degree steps).
- Haven pine (g.x 0.26, wide 0.9), with 22 m trees, and also with 30 m trees at governor share 0.5: 0 of 57,600 frames show any rosette of a culled tile.
- Haven cottonwood size (g.x 0.4, wide 1.2): 2 to 4 frames, at most 9 to 18 px of 3088.
- Sanity check: with the margin set to -40 m the replay does find cases.
- Earth's closed tropical forest (arch 3, g.x 0.37, wide 1.2, 40 m trees, a up to 118 m): 23 of 57,600 frames. These are slivers at the very screen edge, at most 39 px of 3088 (27 px with the round picture's reach at 0.85 a), lasting 0.5 to 1.5 degrees of turn. They lie over a neighbouring tile's crowns and the ground's canopy of the same green.

**Verdict and fix**
A real but nearly invisible pop, worth fixing because the earlier fix is wrong and misleading.
1. Drop the dead TOP_MAX term from the shadow sphere: `tallest * SHADOW_LONG` is enough.
2. Grow `geo`'s sphere by the largest rosette reach of the filled trees:
   - in `_fill`, track max of uRoseGeo[cell].x x iB.x x h x min(TOP_MAX, max(1.5, keep^-0.42)) x about 1.1, where the 1.1 covers the eye moving away by the 10% allowed before a refill;
   - no sqrt2 is needed.

The reviewer's blanket TOP_MAX x sqrt2 term (about 3.2 h, 60 to 120 m) would leave more tiles undrawn-but-submitted off screen for no gain.

### farforest2-5. Each tile reply now works out the lowest tree on the main thread with Math.hypot over every tree

`src/life/farForest.js:521`, low; check: **holds**

**What goes wrong.** The new tile.low loop runs in the worker's reply callback on the main thread: Math.hypot over every tree of the reply (10-12.5k per tile on Haven). V8's Math.hypot is slow. Replies come in bursts: three workers, and every tile is asked again when the Sun moves 1.5 degrees (every 2 s per tile with a fast clock) or when an elevation ring arrives. The worker already holds these trees.

**What one sees.** Arriving at a place, after a Sun step, or in flight with tiles coming in: frames with roughly 0.5-1.5 ms more of the page's own work on the phone for each reply that lands in them. This is the kind of work fewer pixels cannot cure.

**Evidence.** farForest.js:520-522. Tile sizes from scratchpad/review2/tree/scripts/rv-count.mjs: the opening place has 38 tiles and 187 312 trees in replies (largest 12 547); the north wood has 36 tiles and 248 913 trees. Timing from scratchpad/review2/hyp2.mjs, a 16 384-tree tile: Math.hypot 0.60 ms at steady state (3.5 ms on the first call); squared lengths 0.08 ms.

**Suggested fix.** Work `low` out in the worker (chunkWorker's treeTile reply, beside origin and count) and send it as a number. Otherwise take the minimum of x*x+y*y+z*z and one sqrt at the end.

**The check.** The finding holds, at low severity, with some of its numbers corrected.

**What the code does.** At 178b732, farForest.js:519-522 runs inside `job.then` of `_ask`, on the main thread. It calls Math.hypot once for every tree of the reply (`res.count`, up to 12 547 at the opening place). Before this delivery the reply callback did a fixed amount of work: `new Float32Array(res.trees)` only makes a view of the buffer the worker handed over. The loop came in with e56a47d (farforest-2). The first review (haven-rich-review.md:721) had suggested working out `tile.low` inside `_fill`, beside `bound2`. The fix put it in the reply callback instead, where it is a full extra pass over every tree. The worker already visits every tree in `treeTile` when it moves each block's trees onto the tile's origin (treeBlock.js:133). So `low` could be worked out there for almost nothing and sent as a number, as the finding proposes. Taking the minimum of squared lengths and one square root at the end also works.

**Replay.** Script: scratchpad/review2/tree/scripts/rv-hyp3.mjs. It builds the 38 real tiles of Haven's opening place and times the callback's loop exactly as written against the real `FarForest._fill` of the same tile (eye on the ground at the start).
- The largest tile (12 547 trees) takes 0.42 ms for the loop and 0.49 ms for its whole fill.
- A tile 854 m away (11 587 trees) takes 0.39 ms for the loop and 0.08 ms for its fill.
- Over all 38 tiles (187 312 trees): the loops take 6.4 ms, all the fills 4.5 ms.

So the new loop costs more than all the fills put together. Far tiles' fills skip most trees at the rank test; the loop touches every tree. It is also not covered by the two-fills-a-frame cap.

**Timing check.** The reviewer's hyp2.mjs gives 0.65 ms for hypot over 16 384 trees and 0.084 ms with squared lengths, which agrees. The first call (before optimisation) took 1.5–2.3 ms. V8's Math.hypot is a builtin that is not inlined, and it makes a small piece of garbage per call.

**Corrections to the scenario.**
- At most two tree tiles are in the workers at once: 3 workers, and `room = min(3, idle-1) - asked`. So at most about two replies land in a frame.
- On the phone, expect roughly 0.3–0.8 ms per large reply and up to about 1.5 ms in a frame where two land. The "0.5–1.5 ms per reply" overstates it.
- The 2-second re-ask happens only with the clock run fast. At the default (real time, 24-hour day) the Sun moves 1.5° only every 6 minutes. Other triggers re-ask every tile: arriving at a place, flying on to new tiles, and each new ring (`ringSerial`) or cover serial.

**Why it is low.** No frame goes late from this alone at a 33 ms target. But it is pure waste in the page's own work, the kind fewer pixels cannot cure. It lands in exactly the frames that are already busy with streaming, and the fix is one line.

### farforest2-6. The far blossom table is made once a day, at the day's first frame, while the near trees use the current day: far crowns lag the near ones by up to a day at the 240 m line

`src/life/farForest.js:413`, low; check: **REFUTED**

**What goes wrong.** The table is built with `tr.day` on the frame where Math.floor(day) changes (about N.0) and then kept all day. The near trees work their flowering out in _put (trees.js:579) with this.day at every rebuild and re-choice (every 25 m, every Sun sweep, at fine steps), so they use N.f. Before this change the far forest used the day at fill time, close to the near trees. The two now disagree by the fraction of the day.

**What one sees.** During a cherry's or blackthorn's opening or closing days (open changes by up to 0.15 a day, so the far crown tint k = 0.8*open by up to 0.12), with the clock running, late in a game day. The far crowns beyond 240 m show the morning's flowering and the near trees the evening's, meeting at the moving line. This does not apply on the opening date, when the trees are in full flower.

**Evidence.** farForest.js:407-416: the table is rebuilt only on a change of Math.floor(tr.day) or of south, using `tr.day || 0` at that frame. trees.js:403-404 and 579: bloomOf(sp, this.day + (own-0.5)*8, ...) with the continuous day. cover.js:98-102: open = smoothstep over 10 days.

**Suggested fix.** Give both one quantized day. For example, both use Math.floor(day) + 0.5 for flowering (the near trees already rebuild when the day changes), or the far table is rebuilt for the day the near trees last placed with.

**The check.** The claim depends on `day` having a fractional part, and it never does. At 178b732 the only in-game caller, src/app.js:1261, computes it as `(Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86400000` from `this.clock`, which is a Date (app.js:445). That uses the UTC date and drops the time of day, so it is always a whole day of the year. I checked this in Node: 00:00:01Z, 13:37Z and 23:59:59Z on 2026-11-24 all give exactly 327, and 2026-04-01T18:00Z gives 90.

Within a day, then, `tr.day` is the same integer N on every frame. Both sides use that same integer:
- The far table: farForest.js:413 calls `inFlower(sp, tr.day, own, south)`, which evaluates `bloomOf(sp, N + (own-0.5)*8, ...)`.
- The near trees: trees.js:579 and :531 call `bloomOf(sp, this.day + (own-0.5)*8, lat)` with this.day = N.
- The change of day: trees.js:403 marks the near trees dirty on `Math.floor(day)` changing, and farForest.js:407 rebuilds the table on the same condition in the same frame.
- Order within a frame: app.js:1262-1263 calls trees.update(rig, day) before farForest.update(rig), so `tr.day` is already current when the table is built, including on the first frame.

There is no "N.0 against N.f" difference and no lag. This also holds with the clock run fast or backwards, because the day still changes only in whole steps and both sides follow it in the same frame. The hemisphere also agrees: the far table's `south = anchor.z < 0` is the same test as the near trees' `lat < 0`, since both are taken from the same anchor.

What remains is a difference that exists by design: the far table rounds each tree's own number to 1/64, which is 1/8 of a day of flowering. That is the documented quantization (OWN_STEPS), not the defect claimed.

## groundfar2 (from-above helper)

### groundfar2-1. The steppe's shrubs and bare soil are one 16 x 16 texel picture tiled every 21.3 m and every 91.4 m: from the air they form a regular lattice

`src/terrain/terrainMaterial.js:401`, high; check: **holds**

**What goes wrong.** Shrubs (line 401) and bare soil (line 398) come from one read of the detail texture's b channel at mip level 4. tDetail is 256 x 256 (terrain.js:25, makeDetailTexture(256)), so level 4 is a 16 x 16 picture. Read at vDetailUv*3.0, that picture repeats every 64/3 = 21.3 m; read at *0.7, every 91.4 m. Both repeats run along the cube face's axes. Nothing varies from one repeat to the next: every 21.3 m square holds the same shrubs in the same places. That is the 'cloth woven in squares' the crowns() comment describes (lines 302-305) and that this round set out to remove from the canopy. The fall-back means are also wrong: shrub = 0.106 and bare = 0.21 (lines 397 and 400), but the patterns average 0.073 and 0.178. Where a pattern fades to its 'mean', the land turns about 2.3 % darker and 1.6 % browner, which goes against the comment's own rule that the land's tone does not change with height.

**What one sees.** Flying 300 to 700 m over any grassland on Haven (the steppe, the opening place's meadows), looking 30 to 60 degrees down on the phone. kS is near 1 over most of the view: at 500 m up and 45 degrees down a pixel is about 0.5 m and fw is 0.019 to 0.027. One sees the same cluster of nine dark shrubs, 2 to 6 px each, repeated on a perfect square grid, 30 to 60 times across the picture. The bare-soil patches make a coarser grid of the same kind out to 3 or 4 km. At the reference shape (880x412, dsf 1.25) kS is 0 at 1000 m, so the helper's pictures cannot show the shrub lattice.

**Evidence.** Lines 398 and 401 read at a fixed level 4. surfaceTextures.js:27-60 makes the texture. Replay /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/steppe.mjs rebuilds it with the same fbm, hash and mip rounding. It finds 9 shrub blobs in each 21.3 m repeat, identical in every repeat (its ASCII map shows the lattice over 3 x 3 repeats), and the same repeat for bare soil over 2 x 2 repeats of 91.4 m. The area means are shrub 0.0726 against the constant 0.106, and bare 0.178 against 0.21.

**Suggested fix.** Place shrubs and bare patches by a hash of a cell keyed modulo cells*DETAIL_PERIOD, as crowns() does, so the pattern differs across the 16-tile block. For example, shrubs from crowns(vDetailUv + 0.37, 24.0) keeping one cell in ten, and bare patches from a 6-per-tile lattice whose keep follows the dryness. At the least, combine two reads at different scales that are each a whole number of cycles per 16 tiles (x3 and x43/16), so the repeat becomes 1 km. Then work out the mean constants from the texture in a Node check like steppe.mjs.

**The check.** The finding holds. I checked it at 178b732.

**The code.** In terrainMaterial.js:
- Line 401 reads the shrubs with `textureLod(tDetail, vDetailUv*3.0+0.37, 4.0).b`.
- Line 398 reads bare soil the same way at `*0.7+0.13`.
- tDetail is 256 px wide (terrain.js:25), so level 4 is 16 x 16 texels, wrapped with RepeatWrapping.
- An explicit lod turns off anisotropic filtering, so each read is a bilinear lookup in one 16 x 16 picture.
- Nothing in either mask depends on place except vDetailUv. kS, kB and `beyond` change slowly across the screen.
- So the shrub mask repeats exactly every 64/3 = 21.33 m along the cube face's axes, and the bare mask every 91.4 m.
- The x3 read makes 48 whole cycles per 16-tile block, so even the chunk offsets kept modulo 16 tiles do not break the repeat.

**The replay.** I checked steppe.mjs against the source. hash3, pnoise2, fbm2, the byte packing and the mip rounding all match makeDetailTexture. It gives 9 shrub blobs per repeat, identical in every repeat, and the bare-soil lattice it describes.

**Nothing hides it.**
- farGrassColour is reached through gw (line 719). On grassland gw is about 1: the grass tone's amount is min(1, am*1.25), its strength is 1 below 1500 m above the ground, and gw fades only between 600 and 2500 m from the eye.
- gc does not use the colour map. Within about 600 m the ground is one even grass tone, so the lattice is the main texture in view.
- Blades stop above 80 m and clumps above 220 m above the ground, so nothing covers the ground from 300 m up.
- No governor step touches these reads.
- The shrubs have no dryness factor, so the lattice is on green meadows too, not only on the steppe.
- Contrast: at 0.7 mix toward (0.045, 0.055, 0.03), a shrub is about 0.53 of gold grass's luma and 0.62 of green grass's.

**Where it shows.** I modelled a flat-ground pinhole camera (vis.mjs in refute_steppe/) with the game's default fov of 48 degrees and the phone's native 1440 rows.
- Looking 45 to 60 degrees down from 500 to 700 m, kS x beyond x gw is above 0.5 on 66 to 100 % of the ground rows. It is about 1 at the centre.
- At 500 m and 45 degrees down, fw at the centre is 0.0165 to 0.0233; the finding said 0.019 to 0.027, close enough.
- One repeat there is about 49 x 34 px. Each shrub is 3 to 9 px. There are about 60 repeats across a row.
- At the governor's floor (0.6 of native, 864 rows) it shrinks to a band, but stays on a third to most of the view at 45 to 60 degrees down.
- At the reference picture size kS x beyond is about 0, so no headless picture shows it.
- The steppe code (07fba80) came after the helper's after pictures (892ae08), so no picture of it exists. No brief or report lists it as known; from-above-report.md item 6 says "Untouched".

**Numbers I correct.**
- The area means do replay: shrub 0.0726 against the constant 0.106, bare 0.178 against 0.21.
- The tone effect is overstated and does not matter. In luma, the wrong shrub mean darkens the fallback by 1.6 % on gold grass and 1.3 % on green, not 2.3 %. The wrong bare mean lightens it by about 1.3 % on dry ground. The two nearly cancel.

**A related defect the finding missed.**
- The bare read at x0.7 is 11.2 cycles per 16-tile block, a fraction, so it breaks the rule that such patterns must repeat a whole number of times (CLAUDE.md lesson; DETAIL_PERIOD note).
- Each chunk's offset is `frac16(a0*K)` (terrain.js:599), so neighbouring chunks across a 1024 m line differ by 16 tiles in vDetailUv.
- There, the bare patches are cut and moved by 0.2 of a repeat (18 m) along chunk edges.
- They also jump over a whole child patch when the land's detail changes and a patch splits into finer ones there.
- The shore phase at x0.37 and the foam at x1.3 (5.92 and 20.8 cycles) have the same seam.
- Any fix should use scales that repeat a whole number of times per 16 tiles. The reviewer's x43/16 does.

**Severity: high.** It is a perfectly regular wallpaper of dark dots over all grassland seen from 300 to 700 m on the phone in Sharp, the default mode. That is the view the owner asked to be perfect, and this delivery added it. No picture has confirmed it yet.

### groundfar2-2. Bare soil is read at 0.7 cycles a tile (11.2 per DETAIL_PERIOD): its pattern breaks along nearly every patch edge

`src/terrain/terrainMaterial.js:398`, high; check: **holds**

**What goes wrong.** Each patch knows its detail-tile offset only modulo DETAIL_PERIOD = 16 tiles (terrain.js:597-600; terrainMaterial.js:995-998 says that only patterns with a whole number of cycles per tile are safe). Two neighbouring patches can see the same edge at detail coordinates 16n apart. At 0.7 cycles a tile, the pattern's phase on the two sides then differs by 11.2n cycles, which is 0.2, 0.4, 0.6 or 0.8 of a repeat. Across that edge the bare-soil patches are cut and shifted by 18 to 73 m. This is the CLAUDE.md lesson about a whole number of cycles per tile. The other new reads are safe: x3, x61, crowns(..., 1.5) (24 cells per 16 tiles), and the warp sin(2 pi (u+v)).

**What one sees.** Over dry grass, where smoothstep(0.2, 0.8, dry) > 0, from 500 m to about 4 km up (kB > 0 while a pixel is under about 3 to 6 m). Straight lines run across the steppe along the ground patches' edges, kilometres apart, where the brown patches stop and others begin. As one flies, the patches split and merge, so the lines jump to new places. That is a pop that moves with the traveller.

**Evidence.** Line 398 reads textureLod(tDetail, vDetailUv * 0.7 + 0.13, 4.0). Replay /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/seams.mjs uses terrain.js's frac() and K for Haven (R 250 km, 64 m tiles). At 0.7 cycles a tile, every edge of patches 1.5 to 12 km wide is broken (255/255, 127/127, 62/63, 31/31). Of the 0.77 km patches 382/511 edges are broken, and of the 0.38 km patches 383/1023. At 1.5, 3 and 61 cycles a tile no edge is broken.

**Suggested fix.** Use a scale with a whole number of cycles per 16 tiles, for example vDetailUv * 0.6875 (11/16) or * 0.75. Better, fold it into the per-cell placement suggested for the lattice finding. Add a Node check that fails for any detail-space scale s where s*DETAIL_PERIOD is not a whole number.

**The check.** The defect is real. It is new in this delivery: commit 07fba80 added line 398, and nothing in from-above-report.md, PROGRESS.md or haven-rich-review.md lists it.

How it holds at 178b732:
- The vertex shader sets vDetailUv = aI2.xy + aGrid * aI2.z (terrainMaterial.js:113).
- terrain.js:597-600 sets aI2.xy to frac16(a0*K), frac16(b0*K).
- So each patch draws the world's detail pattern shifted by 16*floor(a0K/16) tiles. A read at s = 0.7 cycles a tile is then shifted by 11.2*m, which is 0.2*m of a repeat (5 distinct shifts). Two patches whose start bands differ by n not a multiple of 5 disagree at their shared edge.
- Line 398 reads textureLod(tDetail, vDetailUv * 0.7 + 0.13, 4.0).b. The texture is RepeatWrapping (surfaceTextures.js:61). No colour crossfade between parent and child exists: s.fade only morphs the geometry and normals.
- The result reaches the picture: line 761 does albedo = mix(albedo, gc, gw).

The reviewer's seams.mjs reproduces exactly: 255/255 edges broken at L8 (1.53 km), 382/511 at 0.77 km, 383/1023 at 0.38 km. The 1.5, 3 and 61 cycle reads break no edge.

My own replay of the real mask (review2/bare/bare.mjs, blobs.mjs; fbm2 copied, 256 px texture taken down to level 4, which is 16 texels per 91.4 m repeat):
- About 7 soil patches per repeat, median 14 m across, up to 30 m, covering 18%.
- Across a broken edge the shift is 18.3, 36.6, 54.9 or 73.1 m. About 31-33% of the edge's length shows a soil patch cut by a straight line.
- At dry 0.7 a patch is about 40% brighter than the gold grass around it, so these are visible features.

It is also a pop (split.mjs): when a patch splits, the soil pattern moves in 61% of the children of a 1.53 km patch, 34% at 0.77 km and 18% at 0.38 km. Flying at about 1 km, the 1.53 to 0.77 km splits happen at about 1.45 km from the eye, where kB is about 1 on the phone.

Corrections to the claim:
- The height range is not "500 m to about 4 km up". The ground's grass paint fades out between 1.5 and 3 km above the ground (grass.js:790, kg). It fades with distance from 600 to 2500 m (gw, GRASS_FAR). Beyond 250-500 m from the eye it is drawn at all (`beyond`). So the effect shows from about 10-30 m up, wherever ground 250 m or more away has pixels under about 2-4 m, up to about 3 km. It is strongest within about 1.5 km of the eye.
- The lines are 0.2 to 1.5 km apart, not kilometres apart.
- The comment cited as terrainMaterial.js:995-998 is at lines 994-998.

Severity: medium rather than high. The contrast is moderate (a 40-50% mix toward soil, times dry and gw) and the effect is confined to dry grass near the eye. It is still a visible straight seam and a moving pop of exactly the kind the CLAUDE.md lesson names, and the fix is one number (0.6875 or 0.75).

Side note: the older reads at vDetailUv*0.37 (line 790, the shoreline) and *1.3 (line 831, foam) also fail the 16-tile rule. A check over every scale, as the reviewer suggests, would catch them too.

### groundfar2-3. The steppe's pattern and its mean tone are faded in by distance from the eye: a plain disc under the traveller from 220 to 500 m up, and a tone ring at 250-500 m

`src/terrain/terrainMaterial.js:391`, medium; check: **holds**

**What goes wrong.** beyond = smoothstep(250, 500, length(vRel)) multiplies both the patterns and their means (lines 399, 402, 405). It is meant to hand over to the blades and clumps. But those go by height: blades fade out between 45 and 90 m up and clumps between 121 and 220 m (grass.js:789; haven.js:120, below 90, mid 220). Above 220 m nothing is drawn over the ground, yet the shrubs, bare soil and tussocks, and even their mean darkening, are still held off within 250 to 500 m of the eye. Second, how much bare soil shows anywhere is smoothstep(0.2, 0.8, dry), where dry is uGrassTone.x. That value is the dryness of the grass table round the traveller (grass.js:883), and it is held at its last value above 220 m. So whether the whole land's bare patches show depends on the grass where the traveller is or took off, not on the place itself.

**What one sees.** At 300 m over the steppe, looking down: beyond is 0.10 under the traveller and 0.30 at the centre of the helper's own steppe_300_p60 view (346 m). The ground under and ahead of the traveller is plain ochre with no shrubs or bare patches, inside a soft disc about 300 m across that moves with them. The pattern only appears toward the top of the picture. At any height the land's mean tone shifts between 250 and 500 m from the eye, up to 7.4 % darker (shrubs 0.7 x 0.106) and 10.5 % browner (bare soil). From 50 m up that is a soft band about 130 px tall on the phone that follows the eye. Walking or flying low from green grass into gold grass makes the bare patches fade in across the whole visible land at once.

**Evidence.** Line 391 defines beyond. Lines 399, 402 and 405 multiply by it. Line 392 returns before even the means are applied. grass.js:787-789 sets kb and kc by rig.agl. grass.js:845-846 holds the middle table above the clumps' height, and grass.js:883 sets tone.x = dry, which is read as `dry` at line 725 (farGrassColour(uGrassTone.x, d1.g)). The from-above views are steppe_300_p60 and steppe_1000_p60 (from-above-report.md:161-162).

**Suggested fix.** Tie the near hand-over to what is actually drawn. Pass the clumps' keep (grass.js kc) to the ground in a uniform and use near = (1 - smoothstep(250, 500, d)) * kc. Apply the means everywhere, and fade only the patterns' contrast toward their mean near the eye. Take the bare share from the place (the map's colour or land-cover class there, e.g. the warmth of mapTint) instead of from uGrassTone.x.

**The check.** The main part holds at 178b732, but its scope is narrower than the report says. The second part is already a known, listed problem.

**What holds.** In src/terrain/terrainMaterial.js:
- Line 391 sets `beyond = smoothstep(250, 500, length(vRel))`.
- Line 392 returns plain `c` when `beyond <= 0`.
- Lines 399, 402 and 405 multiply the bare soil, the shrubs (including their means 0.21 and 0.106) and the tussocks by `beyond`.

The comment at line 390 says this hand-over is meant for "under the blades". The things it hands over to go by height. In grass.js:788, with haven.js:120 (below 90, mid 220):
- blades: kb = 1 - smoothstep(45, 90, agl)
- clumps: kc = 1 - smoothstep(121, 220, agl)

Nothing ties `beyond` to kc. The clumps' horizontal reach (the RINGS 'farthest' ring, out 320 to 545 m) explains the 250 to 500 m numbers, but only while clumps are drawn.

I replayed the arithmetic in /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/beyond.mjs:

| Height | kc | beyond at nadir | Radius with less than 1/3 of the pattern | Radius with less than half |
|---|---|---|---|---|
| 220 m | 0 | 0 | 267 m | 304 m |
| 300 m | 0 | 0.104 | 173 m | 225 m |
| 400 m | 0 | 0.65 | none | none |

Above 500 m the fade is gone. In the brief's own steppe_300_p60 view (the ledge bookmark, fov 60, so the bottom edge looks straight down), beyond is 0.10 at the bottom, 0.33 at the centre and 1.0 at the top. The report's 0.30 for the centre is close.

At 180 to 220 m (kc 0.36 to 0), looking 35 degrees down with the game's fov 48, beyond is 0 at the bottom and 0.16 to 0.55 at the centre. So the near half of the picture has thinned clumps or none, and no pattern either.

On the phone at 300 m a pixel is about 0.2 m, so kS = kB = 1. Shrubs would be 7 to 18 px dark spots at 70 % darkening. Near the traveller they fade to under a tenth of that. The fade goes by distance from the eye, so shrubs fade away as the traveller flies over them. That is the "moves when I move" fault the charter's lessons forbid.

It is also the very view that item 6 of from-above-look.md complains of ("At 300 m looking down it is one flat yellow"). No steppe picture was taken after commit 07fba80 added this code; the only steppe "after" pictures are from 892ae08, earlier that day. So nothing has checked it.

The fix the report suggests is right, and it is cheap: fold kc into `beyond` through a uniform. grass.js already computes kc as keepClumps.

**Corrections.**
- **The "tone ring at any height" is overstated.**
  - Above 500 m there is none.
  - Below about 120 m the 250 to 500 m band lies under the clumps, which reach out to 545 m. That is the intended hand-over, not a defect.
  - "7.4 % darker, 10.5 % browner" are mix fractions, not the change one sees. For gold grass (dry 1, 0.62 up the blade), the bare-soil mean lightens luminance by 8.6 % and the shrub mean darkens it. The net is +2.9 % luminance with a slight shift toward pale brown, spread over a smooth gradient. That is invisible in practice.
  - The 130 px band at 50 m is 174 px at the game's fov 48, and it lies under the clumps.
- **The bare share taken from uGrassTone.x is a known, accepted problem.** The base grass colour already takes the same `dry` (grassColour(dry)). docs/PROGRESS.md lists this twice: under "Left for later, known" ("the ground's grass colour, share and flower kinds within about a kilometre are those of the 500 m round the traveller ... flying from steppe into meadows the tone of the near land drifts") and as known problem 2. The bare patches only ride that mechanism, so this part should not be reported again.

**Severity: medium**, for the near-eye fade only. It applies only over grass, only from about 150 to 450 m up, and mostly when looking steeply down. The fade is soft, with no edge. But it defeats the new feature in its own target view, it moves with the traveller, and it has not been looked at.

### groundfar2-4. crowns(): with empty cells and smaller crowns, the 2 x 2 search now gives the wrong crown in 1.7 % of the canopy, cut along lattice lines, and the gaps are steep walls

`src/terrain/terrainMaterial.js:326`, medium; check: **REFUTED**

**What goes wrong.** The comment's bound (lines 312-314: no crown outside the block can reach the point) is true only where hgt > 0. In a gap, best is the argmax of negative hgt and returns that crown's tilt d/(r*r) and its number w (line 326). A crown outside the 2 x 2 block can have a higher (less negative) hgt than any crown inside it. With one cell in ten empty (line 323) and radii down to 0.3, this now happens 20 times as often as before the diff. The result is that the gap's shade (farCrownShade at z = 0 is 0.4*(0.76+0.48w); the clumps' is 0.48*(0.8+0.4w)) and its tilt jump along the block's lattice lines. The tilt in a gap also grows without bound (|d|/r^2 up to about 13), so the gaps, the empty cells above all, are drawn as steep-walled troughs.

**What one sees.** A wood at the phone's density from 300 m to 3 km up (crowns 8 a tile, stands 3, clumps 1.5). In the dark gaps, and above all in the empty cells, short straight edges run along the slightly bent lattice where the gap's shade and light jump. These are pieces of the net this round removed. In a low Sun the sunward wall of each gap is lit almost as brightly as a crown top (0.4 x 1.0 against 1.18 x 0.5 for the Sun at 30 degrees), so the empty cells read as lit pits instead of dark holes.

**Evidence.** Replays are in /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/. crowns.mjs is a line-for-line port of lines 315-329, and of the 8daf8e9 version for comparison. crowns-block.mjs: the 2x2 and 4x4 searches pick different crowns at 1.61 % of points for clumps and 1.72 % for crowns, against 0.08 % before the diff, all in gaps. crowns-line.mjs: steps on lattice lines with no change in the true nearest crown have a median relative colour step of 15.5 % (90th percentile 40 %) and a median step in sunlit N.L of 0.66 (90th percentile 0.96). tilt.mjs: gaps grew from 28 % to 40 % of the canopy. The share of the crowns' normals tilted past 45 degrees went from 2.1 % to 9.9 %, the stands' from 0 to 1.6 %, and the clumps' is 4.9 %. The largest gap tilt for clumps is 3.8, which is 75 degrees.

**Suggested fix.** Fade the gap's values to neutral as hgt falls below 0: best = vec4(d / (r * r) * smoothstep(-0.8, 0.0, hgt), max(hgt, 0.0), mix(0.5, w, smoothstep(-0.3, 0.0, hgt))). In crowns-fade.mjs this brings the false N.L steps to a median of 0.000 (90th percentile 0.05) and bounds the gap walls. Or search 3 x 3 cells centred on floor(p): crowns3.mjs shows 0.015 % disagreement with 5 x 5, at 2.25 times the hashes.

**The check.** The arithmetic is right, but nothing comes of it in the picture. The steep-wall and lit-pit part does not come from the 2 x 2 search at all.

What holds. At 178b732, crowns() (terrainMaterial.js 315-329) searches the 2 x 2 cells around floor(p - 0.5). The comment's bound (312-314) is only about points inside a crown (hgt > 0). In a gap the result is the neighbour with the highest negative hgt among those 4 cells, and that can be the wrong neighbour. I re-ran the reviewer's replays and the numbers reproduce:
- wrong pick: 1.61 % of points (clumps) and 1.72 % (crowns), against 0.08 % before the diff. None of them is inside a crown.
- gaps: 28 % of the canopy before, 39.8 % now.
- normals tilted past 45 degrees (crowns): 2.1 % before, 9.9 % now.
- docs/briefs does not list this as known.

Why it does not matter:

1. The false seams are few and short, among many real ones. My replay is /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/v/seg.mjs.
   - The false seams on lattice lines come to about 0.125 cell-lengths of seam per cell, counting both directions.
   - The correct (5 x 5) search already has about 1.45 cell-lengths of seam per cell in the gaps, where the nearest crown changes. So the false seams add about 8 %.
   - They come in short, scattered pieces: median 0.3 cell (about 2.4 m), 90th percentile 1 cell, about 0.3 pieces per cell. They do not join into lines across cells.
   - The jump across a false seam is the same kind and size as across a real one: both sides are gap (z = 0), w changes, and the tilt flips.
   - Real seams between crowns of similar size are straight bisectors that run roughly along the lattice too. A false seam is only an edge between facets moved to another place, inside a gap that is already a mosaic of facets.

2. A CPU sketch of the best case shows no difference. Setup: the crown and stand layers combined as main() does at 688-700, painted two-tone light (paintLit), Sun at 30 degrees, straight down from 300 m at the phone's native density (36 px per 8 m crown cell, 96 px per stand cell). Files:
   - review2/v/combo_a.png: as shipped.
   - review2/v/combo_b.png: exact search.
   - review2/v/combo_c.png: the difference, times 4.
   - review2/v/crop_a.png and crop_b.png: the crown layer alone, enlarged.

   Side by side, a and b cannot be told apart. The difference is scattered small slivers with no lattice in it, so this is not "pieces of the net". Elsewhere it is smaller still:
   - in oblique flight views a crown cell is fewer pixels;
   - once kc fades (pixels over 1.6 m) a seam is 1 to 4 px;
   - clumps at full strength are 4 to 8 px per cell;
   - from 3 km up a crown cell is about 4 px;
   - the far trees (full density out to 450 m) cover part of the canopy.

3. The steep walls and lit pits are not caused by the search. The exact search gives the same troughs. The gap tilt d/(r*r) keeps growing past a crown's edge by the unchanged design, and it did before the diff too (largest gap tilt step 11.5 before). The diff only made gaps more common, which is what the brief asked for.

   The brightness figure is also wrong because it leaves out paintLit. With the Sun at 30 degrees:
   - a crown top is 1.18 x paintLit(0.5)/(1/pi), which is about 1.18 x 0.70 = 0.82;
   - the sunlit wall of a gap is at most 0.4 x 0.98, which is about 0.39;
   - so the gap wall is about 48 % of a crown top, not "almost as bright". The far wall gets only sky light.

   With two-tone light, a tilt beyond tan(Sun elevation) changes only the lit side, between 0.62 and 1.0. The relief light clamps slopeL to between 0.4 and 1.6.

Remaining nit. The comment overstates what the 2 x 2 block guarantees: it holds inside a crown only, not in a gap. The reviewer's fade (bring the gap's tilt and w to neutral as hgt goes below 0) is cheap and harmless if wanted. It is not a defect worth a fix before shipping.

### groundfar2-5. The crowns', stands' and new clumps' shading darkens the wood on average and fades back to 1, not to its mean: the wood's tone depends on how far off it is, with a darker disc of forest under a high traveller

`src/terrain/terrainMaterial.js:708`, low; check: **holds**

**What goes wrong.** Shade factors average 0.843 for clumps, 0.765 for crowns (0.872 before the diff) and 0.886 for stands (0.948 before). Each fades to 1, not to its mean, as it goes under a pixel or past 40 km. So a closed wood's mean tone goes 0.68 (crowns and stands) to 0.75 to 0.84 (clumps) to 1.0 with the footprint, where before the diff it went 0.83 to 0.95 to 1.0. Beyond ownC (19 km) the canopy is the map's own colour (line 702), but line 708 still multiplies it by the clumps' factor out to 20-40 km. The wood's broken edge also subtracts 0.45 where the clumps' mean height is 0.317 (line 668). At vShell 0.5 the mean shellW is 0.35, so soft edges move inward as kz comes in.

**What one sees.** From 15 to 20 km up (on the phone fwC is about 0.34 at the nadir, so kz is about 1), every wood within about 20 km is about 16 % darker than the same kind of wood past 40 km. The result is a darker disc of forest about 30 km across that travels with the traveller. Climbing from 20 to 40 km, the woods below brighten by about a fifth. Lower down, the canopy brightens toward the horizon by footprint more than before.

**Evidence.** Replay /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/crowns-test.mjs gives the means above (clumps 0.843; crowns 0.765 against 0.872; stands 0.886 against 0.948). edge.mjs gives a mean cz.z of 0.317, and a mean shellW at kz = 1 of 0.35 at vShell 0.5 and 0.18 at 0.35. Code: line 661 fades kz by fwC 0.3 to 0.9 and by distance 20 to 40 km; lines 681 and 702 hand over to the map colour by 19 km; line 708 multiplies regardless; farCrownShade is at line 377.

**Suggested fix.** Divide each shade factor by its area mean, measured in Node as crowns-test.mjs does (for example, the clumps' (0.48 + 0.8*s)*(0.8 + 0.4w) / 0.843), so the mean is 1 at every footprint. At line 668 use the clumps' mean height (about 0.32) in place of 0.45, so a soft edge keeps its share of canopy.

**The check.** The finding holds at 178b732, but it is smaller than described and hard to see. I read the code with `git show 178b732:src/terrain/terrainMaterial.js`.

**What the code does**
- Lines 380-381 (farCrownShade), line 708 (the clumps), lines 693 and 699 (the stands and crowns) all fade their factor to 1 with `mix(1.0, f, k)`.
- kz fades with fwC from 0.3 to 0.9 and with distance from 20 to 40 km (line 661).
- ownC already hands the colour over to the map's by 19 km (line 702). Line 708 still applies the clumps there. The comment at lines 705-706 says this is meant, so only the mean is wrong.
- The crowns() replay matches the shader at both commits, including the old one at e56a47d: jitter 0.62, r = 0.36 + 0.28h, w = h.z.

**The averages are right**
- I ran crowns-test.mjs and edge.mjs again and got the reviewer's numbers.
- Clumps average 0.843. Crowns average 0.765, against 0.872 before. Stands average 0.886, against 0.948 before.
- The mean clump height is 0.317. At vShell 0.5, the mean shellW is 0.35 at kz = 1.

**Corrections from the phone replay**
I replayed kz at the phone's density (48 degrees over 1440 px) in /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/disc-check.mjs.
- Straight down from 15 km, kz is 0.91 to 1.0. From 20 km it is only 0.63 to 0.94. So the woods below are 10 to 16 % darker, not a flat 16 %.
- The disc is gone at about 20 km along the ground from 15 km up. That makes it 30 to 40 km across.
- Climbing from 20 to 40 km brightens the albedo by 11 to 17 %, not a fifth. Most of that happens by 30 km, through fwC; the 20-40 km distance fade adds little.
- One thing the reviewer did not mention: fwC is fwidth(u) + fwidth(v), so it changes with how the tile axes lie on screen, by up to 1.41 times. Turning the view therefore changes the strength. From 20 km, straight down, f is 0.852 at one heading and 0.901 at another.

**How much shows in the picture**
- The haze carries most of a pixel's value. Forest pixels in the shots are almost neutral grey, about 100-130 in sRGB.
- In the delivery's own 3 km, 60-degrees-down pictures (r2before against after2), the forest's green pixels are 3 to 7 % darker in sRGB in the rows where the clumps act. In the top rows the change is 0.
- At 10 km, the headless pictures at 660x309 show no change at all, because fwC is above 0.9 there. So the phone's case has never been seen in a picture.
- The change is a smooth gradient with no edge, and it runs the same way as the haze's own near-to-far brightening. That is why it reads as more aerial perspective rather than as a ring, and why it is only low.

**Why it is still a defect**
- `docs/briefs/from-above-look.md` ("One green") says the canopy is darker only inside the far trees' reach (the gaps between crowns). Beyond that reach it should be the trees' mean. The clumps are meant to stand in for the trees beyond their reach, yet they fade from 0.843 to 1.
- farGrassColour, written by the same helper, does fade to the mean, "so that the land's tone does not change with height". The first review asked the same of the bark (fade to its mean of 0.67, not to 1).
- No report or brief lists this as known.

**The broken edge (line 668)**
This holds, but it does not matter. With 0.45 in place of 0.317, the edge moves inward by about 6 % of the cover map's soft step. That is a few metres to about 12 m, a pixel or two at the heights where kz is on.

**Fix**
Fade each factor to its mean, `mix(mean, f, k)`, or divide by the mean, and judge it by a picture. Either way the near or the far tone changes. Dividing the clumps alone by 0.843 makes their sunlit tops about 1.8 times the base colour.

### groundfar2-6. The tussock grain cannot show: the whole texture is squeezed into 1.05 m and read at mip 5 to 6, which gives about +-1 %, for a read inside two branches

`src/terrain/terrainMaterial.js:405`, low; check: **holds**

**What goes wrong.** vDetailUv * 61.0 repeats the whole 256 x 256 texture every 1.05 m, not a grain a metre across. kT > 0 needs a pixel under about 0.38 m, and beyond > 0 needs the place to be at least 250 m from the eye. There the sampler is at 31 to 94 texels per pixel, which is mip 5 to 6.5 (about 4 with anisotropy), and the g channel is nearly flat. The read is also a texture() with implicit derivatives, inside `if (kT > 0.0)`, after an early return, inside the caller's `if (gw > 0.0)`. Its weight is zero at those edges, so that part is harmless, but the read buys nothing.

**What one sees.** Over grass 250 to 600 m from the eye, looking down from a few hundred metres. The 'light and dark' grain is under 1 % and cannot be seen, while each pixel in that band pays an anisotropic trilinear read.

**Evidence.** Replay /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/review2/steppe.mjs measures max |g - 0.5| by level: lod 4 0.069 (colour +-2.1 %), lod 5 0.037 (+-1.1 %), lod 6 0.018 (+-0.5 %), lod 7 0.006. The rms values are a third of those.

**Suggested fix.** Remove the read. If a grain a metre across is wanted, read where a metre is a feature of the texture, for example the b channel at vDetailUv * 16.0 (its base blobs are then about 1 m; this is a whole number of cycles per tile). Show it only where it covers two pixels or more, with textureGrad from derivatives taken outside the branches.

**The check.** The claim holds at 178b732, and the effect is even smaller than the reviewer says.

**The code.** Line 405 of src/terrain/terrainMaterial.js reads `texture(tDetail, vDetailUv * 61.0 + 0.71).g`. vDetailUv is in 64 m tiles (DETAIL_TILE = 64), so the whole 256 x 256 texture repeats every 1.049 m and a texel is 4.1 mm. The g channel (surfaceTextures.js) is the slope of an fbm whose lowest octave has 4 cells per repeat. Its largest feature is therefore about 26 cm, never "a grain a metre across".

**The replay.** I ran the real makeDetailTexture from 178b732 with box mips (scratchpad/review2/refute_tussock/run.mjs).
- Max |g - 0.5| by level: lod 4 0.068, lod 5 0.041, lod 6 0.016, lod 7 0.005.
- RMS by level: lod 4 0.027, lod 5 0.018, lod 6 0.008.
- These agree with the reviewer's numbers.

**The gates.** kT > 0 needs fw < 0.012: a pixel under 0.38 m with the texture's axes along the screen's, under 0.27 m at 45 degrees. beyond > 0 needs more than 250 m from the eye.

**The phone's own view** (48 degree field, native 1440 rows): a pixel is 0.155 m at 250 m and 0.37 m at 600 m. That is 38 to 93 texels a pixel, mip 5.2 to 6.5. I then weighted the grain by 0.3 x kT x beyond:
- The visible change peaks at about 400 m looking straight down: 0.05 % RMS, 0.17 % at most. That is below one 8-bit step.
- Looking 40 to 60 degrees down, or at a lower resolution, it is smaller still.
- In the brief's own steppe_300_p60 view (centre about 346 m away), kT x beyond is about 0.2, and the grain is about 0.03 % RMS.

So the reviewer's "about ±1 %" overstates it, because it leaves out the kT x beyond weights.

**Corrections to the report:**
- "About 4 with anisotropy" is wrong. Seen straight down the footprint is round, so anisotropy does not lower the mip. Where the footprint is long, fw grows and kT reaches zero first. The mip stays 5 to 6.5.
- With telephoto the grain does show a little. Holding Z (7.5 degrees) gives about 0.7 % RMS and 2.4 % at most, 400 to 700 m away. The narrowest zoom (1.5 degrees) gives about 1.4 % RMS and 5 % at most. Even then it is noise a few centimetres across, repeating every 1.05 m, not tussocks.

**Cost.** The read is at mip 5 to 6, which is 8 x 8 or 4 x 4 texels and always in cache, so it is cheap. The problem is mainly that the tussock grain the comment and the from-above report promise for "the steppe from above" does not exist in the game.

**Prior notes.** No report or review lists this as known.

**Severity: low.** Nothing visible goes wrong and the cost is small. The read buys nothing on the phone's normal view, so it should be removed or rebuilt at a scale the texture really has, as the reviewer's fix suggests.

