# Progress

What exists, what was decided and why, what is wrong, and a short log. The plan of record
is `docs/ROADMAP.md`; the rules are in `CLAUDE.md`. Update this file in every commit that
changes behaviour.

## Where things stand (read this first)

### Sent 2026-11-25 07:10: the second link of the rich-and-smooth work (read this first)

The owner, after the tenth results, asked for clouds and weather and said the shadows jump;
earlier the same night: "Give me a playable link to test what's been added so far but
continue working". This link carries the third round (trees T3, from above A4 and A5, the
air from above, flowers F-DONE), the fixes of the shadows that jump and of the governor's
hunting (`docs/briefs/shadows-governor-10.md`), and the sky's step 0 (the clouds drift
downwind at the day's speed on the game clock; nothing else of the sky yet). Asked: a Haven
benchmark in Sharp. Not seen in motion yet: the shadows' walk before and after (the trees
helper's machine, "WALK"). The visual critic on the final pictures:
`docs/briefs/haven-rich-critic-2.md` (the wood from 90 m to 1 km a bubbly texture and the
blossom from above stickers; clouds at 3 km flat and dashed, the mountain a smooth dome;
the tree close-ups badly framed; water from the air oily or paint-bucket blue; grass and
flowers at eye height too even). **Next**: the sky's four packages (helpers running:
`docs/briefs/sky-*.md`), and a fourth round on the critic's gaps 1, 3, 4 and the mountains.
Sent as PR #36, main at 607ddca. Since: the fourteenth final picture and the final tests on
5ab3400 (smoke, foot, shadowturns pass); **sky A merged** (fd6ce5c: the day's weather by
rule; nothing on screen changes until B's clouds land, since the field is drawn only under
`debug=sky:*` until then); the **fourth round** handed out (`docs/briefs/round4.md`: trees
T4, from above A6, air L4, flowers F4). The sky helpers may edit `skySystem.js`, `haven.js`'s
hours and add their own governor steps on their branches (marked "(sky X)", tests passing):
waiting on this session cost them hours; clashes are resolved at the merge.

### In hand: Haven rich and smooth (the owner's ninth phone results)

*2026-11-24. The owner ran the Haven benchmark on build 6ac24ff and wrote: "this was a
good job it looks a lot better but I need it perfect from a distance, specially when I'm
flying high above it, and also the grass should be a lot denser in the areas that have
it, and the flowers should be more diverse and abundant in certain areas and biomes,
different flowers of different sizes that release pollen into the air that makes it
beautiful, and trees with flower petals that bloom and ride the wind, and the trees
should really be refined: the trunks and the leaves still don't look anything like the
references when it comes to level of detail, specially the leaves and branches. Try as
hard as you can, I gave you any access you need to accomplish this."*

**What the phone said** (Smooth, 60 aimed at; the whole text is in the session's
transcript, the numbers that matter here):
- Haven 31.3 fps, the Moon 48.4; late frames at Haven's stops 25 to 52 %; the picture at
  the floor (1.60 MP, 36 % of native) nearly throughout; four times the governor "put
  quality back after steps that cured nothing".
- The page's own work 7 to 10 ms a frame on Haven (a frame has 16.8): **the character
  2.2 to 3.1 ms at every stop on both worlds**, the ground 1.2 to 2.0, rocks and trees
  0.7 to 1.7, terrain 0.7 to 1.2.
- What each thing costs (ms a frame until drawn, picture held at 2.07 MP; the measuring
  itself is some 20 ms of each figure):
  - opening view: everything on 64.5, every saving on 40.5, nothing drawn 21.7. Left out:
    **the ground's shading 17.4**, **grass 11.7**, the far forest 4.6, the shadow maps
    3.3, the figure 2.1, trees 0.8. One saving alone: grass-mid 5.0, clouds 4.0,
    far-trees 3.6, far-relief 3.5, cloud-volume 2.8; every other under 1.2.
  - in the forest: everything on 72.2 (104 at native: the forest is pixels), every saving
    on 48.4. Left out: **trees 21.2**, **the far forest 10.7**, the shadow maps 7.3,
    grass 5.9, the ground's shading 3.7. One saving: tree-leaves 11.5, trees-far 7.0,
    cloud-steps 3.4, tree-shadows 2.7.
  - from the air: everything on 55.5, every saving on 43.9. Left out: **the ground's
    shading 18.1**. One saving: cloud-volume 9.4, far-relief 2.1.
- Read: (1) the ground's fragment shader is the largest cost wherever the ground shows,
  and no saving touches it; (2) the first eight or so steps of the governor's ladder buy
  nothing on this phone (each under 1 ms), so its trials end before they reach a step
  that does, and the picture sits at the floor for nothing; (3) near trees and their
  leaves are what a forest costs; (4) the grass is dear for what it shows; (5) the
  character's 2 to 3 ms of page work is paid everywhere.

**The owner, an hour later (2026-11-24): "We can do 30 fps if the game looks much more
beautiful as well which I would like more."** So the aim on the phone is a steady 30 with
a sharp, rich picture, not 60: Sharp becomes the default mode (`CLAUDE.md`, "Resolution
and the governor"), a frame has 33 ms, and what the speed work frees is spent on beauty
and on resolution. The helpers were told (the briefs' "cost less than today" becomes "a
steady 30 at a sharp picture; spend what is freed on the look"); the next benchmark is
asked for in Sharp.

**The plan** (one delivery; the helpers again, on the owner's word):
1. and 2. *Helper, speed* (`docs/briefs/phone-speed.md`; the phone's whole text is
   `docs/benchmarks/2026-11-24-haven-6ac24ff.txt`): the ground's shader several times
   cheaper and looking the same (it owns `terrainMaterial.js` for this delivery), the
   governor's ladder by what a step buys, the character's page work, the cloud volume
   from the air. (First meant to be done here; given to a helper with a machine of its
   own so that this session keeps its room for merging, reviewing and deciding.) What the
   land needs from the ground's shader when seen from above (the forest beyond the far
   trees, no ring) is passed to it from the "from above" helper's list.
3. *Helper, trees* (`docs/briefs/trees-refined.md`): the near trees at the references'
   level of detail (limbs, twigs, finely cut leaves), blossom and petals on the wind,
   for less than a forest costs today.
4. *Helper, grass* (`docs/briefs/grass-rich.md`): denser grass for less, flowers of more
   kinds and sizes and abundant by place, pollen in the air.
5. *Helper, from above* (`docs/briefs/from-above.md`): the far forest seen from high
   above (a card on edge is nothing from above), pictures from 300 m to 30 km, no line or
   ring.
6. Merge as they push, review their code cold as before, final pictures and tests, a
   new Haven benchmark asked for.

**The helpers** (started 2026-11-24 06:12 UTC; sessions of the same account, reached with
`send_message`; never `list_events`; look at their work with `git fetch origin <branch>`):
trees `session_01XG1DZ6z4HnMC6bjsyXexux`, branch `ccr-aa39490a-trees-refined`; grass
`session_01XG1DZ7F3Rxaid46abwPs1f`, branch `ccr-aa39490a-grass-rich`; from above
`session_01XG1DZ4yJLFGhdSyRj3Cexf`, branch `ccr-aa39490a-from-above`; speed
`session_01XG1DZ38BpdeY4LvbUGcmCq`, branch `ccr-aa39490a-phone-speed` (announces
"S-EARLY", then "S1" to "S4"). Each announces an
early push ("T-EARLY", "G-EARLY", "A-LOOK") and writes a report beside its brief.

**08:00, first results** (2026-11-24):
- *Trees*: two sheets and the first game pictures (`docs/shots/trees-refined/` on its
  branch): a whole skeleton, bark, fir boughs as fans of fronds, pine needles in tufts,
  leaves in tones, a flowering tree with petals; close trees 2.5 to 3.5 thousand triangles,
  and the near trees' count at the forest view fell from 265k to 143k. Sent back: no solid
  dark lumps (done), bark too pale. Not merged here yet: to be merged when the wood from
  inside has been seen.
- *From above*: its list is `docs/briefs/from-above-look.md` on its branch, with 29
  pictures. The worst: **two forests over one another in two colours** (the ground's
  raised canopy is gold domes, the far trees on it green), from above the far trees are
  specks and crosses (crowns cover 23 % of a closed wood at 1 km), from 3 km a wood is a
  smooth blot, the steppe an even ochre. Decided: one forest, one green (the canopy takes
  the trees' colour by a rule the far forest exports). **Order of work in
  `terrainMaterial.js`**: the speed helper cuts it into tiers first and marks a block "the
  ground from afar" (announced as "S1a"); when that is merged here, tell the from-above
  helper, who then changes the far look inside that block. Until then it works on the
  trees' side.
- *Grass*, *speed*: no push yet at 08:00.

**09:40** (2026-11-24): the joined head is a1e621c and holds all of this, building, with
`govsim`, `far-trees-test` and the cloth check passing:
- *Speed*, "S-EARLY" and "S1a": the ground's shader in tiers (a far gentle pixel read 24
  textures and ran an eight-raster loop, now 10 to 11 and no loop; near grass 30 to 34,
  now 11 to 15; pictures within 1 to 3 levels of 255), the gusts and the near cloud shade
  at the vertices, the governor's new ladder (steps carry what they buy and whether they
  are live; a trial goes on to the proven steps), the cloth rewritten with the same
  motion at half the work, the cloud volume's laying worked out once a frame. Its
  measure is a count of work on software WebGL (`scripts/ground-cost-run.sh`), said as
  such; report `docs/briefs/phone-speed-report.md`. Still to come from it: Sharp as the
  default, cheaper noise, the ten-view table.
- *Trees*, merged at "T-WOOD": the wood from inside (`docs/shots/trees-refined/wood_after.png`)
  is the best picture the game has had. Owed: the old build's layers per pixel beside
  the new (10.5 over the whole forest view, an upper bound), the blossom tree with petals,
  the opening view, the 240 m line, near trees from 100 m up, the report.
- *Grass*, merged: all blades (no cut-out cards), six rings to 545 m, lit from a table
  drawn once a frame; layers per grass pixel 6.9 to about 4 on the steppe, 4.7 to 4.6
  with flowers at the opening view; 26 flowers in six habits, meadows by place
  (`scripts/find-meadow.mjs`), pollen (`src/life/pollen.js`, a governor step). Sent back:
  the opening brow's yellow heads (flat discs, one size), more than one kind in the first
  view, seed stalks and colour by place. Owed: its full set with numbers, the report.
- *From above*: told at 09:40 that the far look in `terrainMaterial.js` is theirs inside
  the marked blocks ("THE GROUND FROM AFAR, 1 to 3"); working on the trees' side until
  then (crowns from above, no crosses, shadows).
- This machine restarts when the session sleeps between turns: a picture run started
  detached is lost then. Pictures here only while a turn is waiting on them.

**19:45** (2026-11-24): the joined head is b92ace8 (builds; govsim, far-trees-test,
far-tree-form-test, flower-rule-test, the grass anchor replay, the cloth check and rocks
pass). Merged since 09:40: the speed helper's second round (flowers on the ground at the
vertices, shadow tiles in turns at 30 a second: in Sharp they had been drawn whole every
frame), the far forest from above (crown tops lit as domes, a shadow beside each far
tree, no crosses; and one forest in one green: the canopy's gold was the season turning
evergreens), the trees' final pictures and report (`docs/briefs/trees-refined-report.md`:
16 % fewer layers in a wood than before, 100k fewer triangles), the grass's final set and
report (`docs/briefs/grass-rich-report.md`: half the rasterised layers, 1.43 M triangles
handed over on the steppe, against 0.61 M). **All four helpers' turns ended in an error
between 13:20 and 15:20** (a platform fault); each was sent its remaining job at 19:40:
from above, items 2 to 4 (domes, grain from 3 to 30 km, the steppe) and ADONE; speed, the
Haven benchmark end to end again; grass, the shimmer of far blades in low flight (its
open problem); trees, two proof pictures from above and TDONE. The owner switched this
session to another model and turned on multi-agent workflows ("ultracode"): a cold
review of all of this delivery's code, every finding checked by a skeptic, is running
(workflow `review-haven-rich`; results to be handed to the helpers or fixed here).
Still to do after: the visual critic on the final pictures, the final tests here, the
pull request, the checkpoint asking for a Haven benchmark in Sharp. Only the
speed helper may edit `terrainMaterial.js`.

**20:50** (2026-11-24): the helpers' errors were their model's weekly limit (it resets
28 November), not a fault: they cannot go on. Two new helpers on this session's model
took over from the repository's briefs: **trees** (`session_01XG1DZ4JBNV4DZkAnD1YRtX`,
`docs/briefs/trees-refined-2.md`: the review's seven tree findings, bark in motion, the
owed pictures) and **from above** (`session_01XG1DZ33bk1c9DExN4K4Gys`,
`from-above-2.md`: the review's far-forest findings, the ground's far look items 2 to 4,
the after set; it owns the blocks "THE GROUND FROM AFAR" of `terrainMaterial.js`, this
session the rest of that file). Grass, governor and ground are fixed here: workflow
`fix-grass-findings` (three fixers in worktrees, `fix/grass-*` branches, each checked by
a cold reader, no browser), then the governor's and the ground's findings once the review
has checked them. The review's findings: `docs/briefs/haven-rich-review.md` (made from
its journal by `scratchpad/tools/review_md.py`). Its check refuted the grass's "open
problem": the shimmer measured at station 2 is 3.6 m over the ground, ordinary near
parallax. The speed helper's last job (the Haven benchmark end to end, headless) runs
here, detached, on a frozen build of 41705a3 (`scratchpad/haven_bench.log`).

**22:15** (2026-11-24): head 7888455 (builds; every check without a browser passes; the
opening view draws on the merged shaders). Done since 20:50:
- the review is complete (`docs/briefs/haven-rich-review.md`): 31 findings, 26 held, 2
  refuted (the grass's "open problem" was ordinary near parallax at 3.6 m; the canopy's
  one green was a recorded decision), 3 fixed here before their check;
- **grass** (three fixers in worktrees, each checked cold): a thinned field and the
  tussocks fixed to the ground (they jumped at every anchor step with a saving on, and at
  the 2 560 m line); the near ring's cells read at their middles (an odd grid read them on
  their edges: a shimmer in the near grass, found by the fixer); far blades flower by a
  fade over the single flowers' own stretch (a circle at 45 m before); pixel sizes by the
  drawn picture; pollen's clock wraps without a jump; the light table works out only
  what a pixel keeps and only the rows something reads. New checks: `grass-place-test`,
  `grass-flowers-pixels-test`, `grass-light-test`;
- **governor**: a probe trial that cured nothing no longer hands over to a minute of
  savings; a saving that came back clean in Sharp is not taken back by a stale average;
  the tree steps are not live in the air (three govsim cases, each failing before);
- **ground**: the daisies' far thinning back; the vertex shading skipped in the
  benchmark's flat tone, so its row sees all of the ground's shading;
- **trees** (new helper): the make by the eye's distance (close and near lists every few
  metres, `treeLod.js`), shadows from whole cards, petals kept over a relist and on the
  drawn ground, out of flower petal texels are leaves, bark seamless and filtered;
- **from above** (new helper): the far forest's findings (shadows a draw of their own,
  strength by the tile's lowest tree, eased; curve; wood; bounds; blossom by day), the
  ground's far look: domes varied, clumps and a broken edge from 3 km, the steppe;
- the Haven benchmark ran end to end headless on 41705a3: names Sharp, every stop, the
  cost test at all three views, every shader within a phone's limits, no error.
Left: the two helpers' pictures and reports (T2-DONE, A2-DONE), then the final frozen
build: `scratchpad/final10.sh` (pictures and tests), the visual critic
(`scratchpad/critic_wf.js`), notes, pull request, checkpoint.

**23:30** (2026-11-24): from above done (A2-DONE, merged); a second cold review of both
helpers' second rounds (`haven-rich-review-2.md`: 14 of 16 held, two high on the new
steppe from above: a lattice, seams) went back to them. Then the visual critic on the
pictures so far (`docs/briefs/haven-rich-critic.md`), five gaps, three of them from above:
near trees from 90 to 300 m flat stickers and pale scraps; a teal veil and near-black shade
over everything from the air; bare land from above a blurred map (a seam under a plateau,
a river of beads, pepper, flies for rocks); then the blossom tree a jumble of cards, and
one kind of flower at one size in any view. That is not "perfect from a distance": a third
round, four helpers on machines of their own: **trees** (`session_01XG1DZ4JBNV4DZkAnD1YRtX`,
T3: near crowns from above, the cherry), **from above** (`session_01XG1DZ33bk1c9DExN4K4Gys`,
A4: the far canopy, the steppe from above, the forest's edge), **the air and bare land from
above** (`session_01XG1DZ4zdTCXDoaErSrFzxg`, `air-from-above.md`, branch
`ccr-aa39490a-air-above`), **flowers** (`session_01XG1DZ6RaRhrHVsk7KKy5hp`, `flowers-3.md`,
branch `ccr-aa39490a-flowers-3`). `terrainMaterial.js` is shared out by block: FAR 1 and 2
and the helpers above `main` from above's, FAR 3 and the water the air helper's, the
flowers' block the flowers helper's. Then the critic again on the new pictures, the final
run, the pull request.

**23:40**: the owner asked for a playable link of what was in so far: PR #35, main at
e9d4888 (the interim build; its checkpoint text is in the session's transcript).

**00:05 (2026-11-25), the owner's tenth phone results** (build e9d4888, Sharp; whole
text in `docs/benchmarks/2026-11-25-haven-e9d4888.txt`):
- **28.5 fps, 0.86 % late frames** against 33 ms (the ninth: 31 fps in Smooth with 25 to
  52 % late). Haven 28.3, flight 29.0, the Moon 28.3. Page work 7.6 ms (the character
  1.3 to 2.0).
- Haven sat at **1.60 to 1.65 MP** (36 % of native) at every stop; the Moon at 3.44.
- The governor **hunted**: 74 steps (savings off 30, back on 24), five savings put back at
  18.3 s and off again at 18.9 s; "late frames taken as the device's own" 7.0 %.
- Cost table (2.07 MP; the measuring alone some 23 to 26 ms): **the ground's shading 31.1 at
  the opening view and 21.6 from the air** (now with its vertex work counted, ground-2);
  the far forest 5.9; savings that buy at more than one view: far-relief 3.9 and 5.2,
  far-rock-shadows 3.0 and 4.1, clouds 2.7 and 5.5; cloud-volume 3.7 from the air. The rest
  is noise (signs change between views).
- The owner: the shadows "get jumpy when I'm moving around near them"; the clouds must move
  like real clouds, form where real ones do (near mountains), be of many kinds from high
  thin ones to dark storm clouds, move with the day's wind at its speed, rain where it
  rains, and storms be dark with lightning and thunder; "as many agents as you need".
- Begun: workflow `clouds-shadows-understand-design` (readers of the clouds, the weather
  and the shadows, a reader of the governor in this benchmark, three designers from three
  angles and a judge); its plan becomes the cloud helpers' briefs.

**01:45**: the machine restarted twice in the night (at 23:53 and about 01:15): workflows
were resumed from their journals (`resumeFromRunId`), detached picture runs started again.
Merged since 00:05: the air from above (first landing: haze and the forest's air thinned by
how steeply one looks down, the shade in more sky light, the seam under the plateau, far
rocks not specks from above), from above A4 (crowns lit as domes, cherries pink far off,
no ghosts, wood edges into crowns, grassland varied from the air), the trees' third round
(crown tops as pictures of their own, the cherry rebuilt on a skeleton), the flowers'
first landing (a leading kind with companions, bowls and spikes in space, meadows as soft
drifts from the air), and `fix/shadow-tiles` (rocks in the fine tile by its reach along the
Sun, the lattice turned about the eye, one Sun for the land's baked shadow). Waiting on
their cold checks: `fix/shadow-trees` (the leaf flecks re-rolled at every tile re-centre,
every tree lurching at a rebuild, the shadow's mesh switching at 20 m) and `fix/governor10`
(Haven no longer at the floor in Sharp; the dead first steps last; jumps close trials; the
benchmark starts fresh). Why: `docs/briefs/shadows-governor-10.md`.
**The sky**: the plan is `docs/briefs/clouds-weather-plan.md`. Its step 0 (the shared
contract: steering motions, snapshot format, cell shape, a stub producer, `skyGlsl.js`
v0, `skySystem.js` out of `app.js`, debug switches) is being built by workflow `sky-step0`,
which also drafts the four helpers' briefs (`sky-A-model.md` to `sky-D-storm.md`). Then
four helpers, one package each. Meanwhile the third round finishes (flowers' final set,
the air helper's L-DONE, from above's steppe A5) and goes to the owner as the next link
with the shadow and governor fixes.

**04:05**: the third round is done and merged (head 5ab3400): from above A5 (the steppe
from the air), the air L-DONE (shade in cool sky light, rivers not beads, the water's
patterns whole), flowers F-DONE (companions, bowls and spikes in space, drifts from the
air), and the shadow and governor fixes (`fix/shadow-tiles`, `fix/shadow-trees` with its
repair, `fix/governor10` with its repair, and the remedy that keeps the flecks' hash when
the lattice turns: f55d3f5; `npm run treeshadows`). The machine here restarted four times
since midnight (each about two hours apart): long runs here go in resumable halves; the
final pictures and tests of the combined delivery were handed to the air helper's machine
(`docs/shots/final-11/`, "FINAL pushed"). Here: the wood walk before and after
(`scratchpad/stab_wood.sh`, resumable) and the sky's step 0 (workflow `sky-step0`, resumed
at its repair). Then the visual critic on final-11, the pull request and the checkpoint.

**04:55**: the sky's step 0 is merged (9a2566e, with the ladder as `fix/governor10` set it;
f3a1eb7: `sky-system-test` passes): the clouds now move downwind at the day's speed on
the game clock; nothing else meant to change. Its shaders were never compiled in a browser
before this: a check runs here (`scratchpad/chk30.log`: Haven, Earth, Mars, smoke with
the phone's limits, foot, shadowturns), and sky B's first job (B0) is the same in motion
on its machine. The four sky helpers, one package each from `docs/briefs/sky-*.md`:
**A** the model `session_01XG1DZ3LJarZ4Xp1BZfo9EQ` (`ccr-aa39490a-sky-A-model`), **B** the
clouds you see `session_01XG1DZ4dvGuRkSZEW9gJK62` (`-sky-B-clouds`), **C** the cloud shade
map `session_01XG1DZ4vi4qHWPcoM4xEPp3` (`-sky-C-shade`), **D** rain, lightning, thunder,
wind `session_01XG1DZ3taJ647KGr2i5bpe8` (`-sky-D-storm`). The owning session alone edits
`app.js`, `skySystem.js`, `governor.js`, `benchmark.js`, the charter and haven's look
numbers; it merges A first when it builds, then the others. The wood walk (shadows in
motion, before and after) went to the trees helper's machine ("WALK pushed").

### The far view sent: trees, grass and rock as far as one can see

*2026-11-24. Merged as pull request #34; the phone link shows build 6ac24ff (this line was
written after the merge and is on the session branch until the next delivery carries it).
The Haven benchmark test was still measuring its second and third cost views on the final
build when this was merged (its lap, its flight to the Moon and every switch at the
opening view had passed): its log is `scratchpad/fin14.smokeh.log`. The owner, having flown Haven: "I need you to make it so I can see at least a mile in
the ground worth of stuff. I want the trees and the grass rendered in further than I can
see ... use as many agents as you want or need. This is a big ask and I need it to work
really well." What was built and how is in "The far view: what was built" below.*

- **Asked of the owner**: a Haven benchmark in Smooth (nothing of this is measured on the
  phone, and all of it costs: about twice the triangles in the opening view). Still owed
  from before: the Earth benchmark asked with the seventh painted delivery; a word on the
  four proposed biomes (red-rock canyon desert, broadleaf valley of lakes, tropical islands
  with a lagoon, high snow peaks with fjords).
- **Next** (on "continue"): delivery 2 of milestone 12, the look on the ground
  (`docs/ROADMAP.md`). With pasted benchmark results: read the cost table first (the rows
  `far-trees`, `grass-mid`, `far-rocks`, `far-rock-shadows`, `trees`), then tune.
- **Known problems, most visible first**: 
  1. nothing is measured on the phone; the opening view hands the GPU 1.70 million
     triangles (0.95 before), and with every saving on 0.96;
  2. the grass's tone near the traveller is that of the 500 m round them, not of each
     place (it drifts flying from steppe into meadows);
  3. a few far tufts stand gold in a mountain's shadow (their shade comes from 40 m cells);
  4. far rocks on wooded hills can be swapped in fast flight when the land-cover picture
     arrives (the review's finding 7, left open); a talus block grows in at 310 m;
  5. nothing was seen in motion on this machine: single far tufts come and go along a
     slope, and any pop at the hand-over lines is unproved either way;
  6. Earth has the far forest and the far grass too, and no dusting of flowers on its
     ground; only its opening view was looked at.
- **The helper sessions** are finished and can be archived: trees
  `session_01XG1DZ585vPB1kCXuxRvUFx`, grass `session_01XG1DZ6vKJWJCvxUHNSpiWP`, rocks
  `session_01XG1DZ2zUUUfqwHvcWRJQNF`; their branches (`ccr-aa39490a-far-forest`,
  `-far-grass`, `-far-rocks`) are merged whole.

### Milestone 12, a small living world: delivery 1 sent

*2026-11-23. Merged as pull request #33; the phone link shows build 9f98744 (this line was
written after the merge and is on the session branch until the next delivery carries
it). The owner's new direction is in `CLAUDE.md`, "What this game is"; the plan in
`docs/ROADMAP.md`, "12. A small living world"; how a made world is built in
`docs/ARCHITECTURE.md`, "A made world"; what was built and tried under "Milestone 12,
delivery 1" below.*

- **How it came about**: after the seventh painted delivery the owner asked whether a
  smaller world would give more depth, then "what if I don't care for the real sized
  maps or any of the things to do with it being a explorer", then, with five reference
  pictures (the stylised landscape game again; not in the repository): "simply flying
  somewhere beautiful ... a living world ... 5 of the most beautiful [biomes] on earth
  including this one ... tell me what it would take ... idc if you have to do a full
  restart". Answered: no restart; eight deliveries; where "as close as possible" stops.
- **Delivered**: Haven, a made world 250 km in radius, where the game now opens. Its
  land, lakes, rivers, forest, clouds and tide; flyable from space to the ground.
  Pictures: `docs/shots/haven/` (the opening view, sunrise, evening; 1, 9, 60, 300 and
  3 000 km; 9 km with every saving on).
- **Asked of the owner**: a **Haven benchmark in Smooth** (the new button on the start
  screen); whether the four proposed biomes are the ones wanted (red-rock canyon desert,
  a broadleaf valley of lakes, tropical islands with a lagoon, high snow peaks with
  fjords); what feels wrong in flight on a world this small.
- **Still owed from before**: the Earth benchmark asked for with the seventh painted
  delivery has not come. Any benchmark that comes says whether the governor's new rules
  hold on the phone: tune from it first.
- **What to do next, in order:**
  1. With a Haven benchmark: read "late frames taken as the device's own" and where the
     resolution settled, then the cost table at the three views (the opening place, in
     the forest, from the air). If the ground's shading is what is slow, Haven needs
     none of Earth's map-tile blocks in the ground's shader except the colour ring:
     compile the rest out per world.
  2. With a complaint about a look: reproduce it in a picture (from the air first:
     three minutes; the ground: twenty), fix, show before and after.
  3. Then delivery 2 of the roadmap: the look on the ground (big faceted rock, ridge
     behind ridge with trees on the skyline, mist over water, light shafts).
- **Known to be weak in delivery 1**: one biome everywhere (dry belts are golden and
  nearly treeless); no weather yet (no rain, wind only as the grass's own); rivers from
  the air are pale broken lines (their banks are drawn as dry sand; delivery 3); small
  clouds are a stipple from 300 km at the test size; the first load is 21 MB; the
  opening view looks along a brow and the valley below it is not in the picture; the
  caps are open sea; flight speeds near a world this small are untried by a person.

### The seventh painted delivery (Earth from space to landing; the governor)

*2026-11-23, after the owner's eighth phone results (the three-minute benchmark of build
f300e6f) and the words "it looks horrible and unrendered ... in space before I've landed".
All of it is under "The owner's eighth phone results and the seventh painted delivery".
Merged as pull request #32; the phone link shows build d622d38. (This line was written
after the merge and is on the session branch only until the next delivery carries it.)*

- **Why the phone's picture was "unrendered"**: the governor sat at its floor (one million
  pixels, every saving on) for whole sessions. One frame in fifteen is late on that phone
  whatever is drawn; it stepped down for them and could never step up. It is rewritten
  where it decides (late frames of the device's own; a step down is a trial that is put
  back if it cures nothing; floor 1.6 MP). **Not measured on the phone.**
- **What a traveller coming in from space saw**, reproduced with `?debug=floor`: a pale
  ball with no cloud; a flat map under a flat picture of clouds; one green carpet for a
  forest. **Now**: a blue globe with the day's clouds; less haze from above; a relief
  light; white clouds in clusters with a lit side, a clean edge and their own shadows on
  the ground, from any height; the land's colour sharp over the whole view; a canopy of
  uneven crowns and a ring of far trees. Pictures: `docs/shots/approach/` (`before_*` as
  the phone drew it, `after_*`, `pair_*`: 20 000, 2 000, 400, 100, 30 and 10 km, among
  the clouds, the forest).
- **Asked of the owner**: an **Earth benchmark in Smooth** (new cost: cloud shadows from
  the heaps and the crowns in the ground's shader on Earth, the far trees; and more
  pixels, since the floor is higher). Read first the line "late frames taken as the
  device's own" and how often quality was put back.
- **The owner asked** (a question, "for now", while this was being finished): would a
  smaller world, built differently from the start, give more depth on the way in
  (mountains, plateaus, the curve)? **Answered**: no restart; what hid the depth was the
  floor, the haze and clouds without shadows. A smaller planet would show peaks against
  the curve but gives up real places at real size (the canyon a slot, the maps no longer
  fitting). **Offered, not built**: relief two or three times taller seen from high up,
  easing to true height on the way down (the ground's vertices carry their height:
  a factor by the eye's height in the vertex shader; the baked shadows would not follow).
  Do nothing on this unless the owner asks.
- **What to do next, in order:**
  1. With the benchmark: if the governor now holds well above 1.6 MP with everything on,
     the diagnosis was right. If Earth is slow in earnest (late frames that fewer pixels
     do cure), the ground's shader is the place: "the ground's shading" was 18.7 of 44 ms
     on Mars. Cut it by compiling Earth's blocks out of other worlds, then by what can
     move to the vertex.
  2. With a complaint about the look from the air: take the whole approach again
     (`debug=floor` and without), name what is wrong at each height, then fix.
  3. Known to be weak: at a phone's pixel the crowns are small from 700 m (an uneven
     canopy, not yet trees one could count); the far trees reach 2 km only; the night
     side of the home world from space has no city lights (the far globe has them);
     clouds from 4 000 to 18 000 km thin out as one comes nearer (from the day's whole
     map to the heaps' cover); inside a cluster the heaps still stand in short rows (the
     noise repeats every 4.2 km: a larger noise, or two blended, would end it, at a
     cost in the cloud volume); where a heap is a pixel or two (from 400 km at the test
     size, from some 2 000 km on the phone) a field is a stipple before it becomes a
     veil; right under a cluster's base the sky is one cream lid; the ground's shader
     has no texture to spare (16 of 16); the stability test has one Earth move.
  4. Then the rest of milestone 11.

### The sixth painted delivery (the delivery before: speed, far things, water, storms, trees)

*2026-11-22, after the owner's seventh phone results (Earth benchmark of build ef3201a)
and a list. The whole of it is under "The owner's seventh phone results and the sixth
painted delivery" below; this is the short of it.*

- **The phone said**: Earth 48.3 fps at the floor resolution with every saving on; nearly
  half a frame paid with nothing drawn at all. Three things were found and changed (the
  last pass at the picture's size, the shadow tiles drawn in turns and trees casting as
  simpler meshes, the ground drawn last). **None of it is measured on the phone.**
- **The owner asked for**: speed; far things that look good; the ground loaded when high
  in the sky; waves and tide; much denser rain; clouds that change like a real storm;
  trees closer to the references. All seven have something in this delivery.
- **Tested** on the build that was merged: the build check, `npm run smoke` (every check;
  every shader within the phone's limits), `npm run shadowturns`, `npm run govsim`,
  `npm run lakes`; pictures of the hurricane, the beach, the open sea, the forest from
  inside and from above, the opening view, from 12 and 40 km, and the Moon with the canvas
  made smaller. **Not run**: the stability test, the full reference set.
- **Asked of the owner**: an **Earth benchmark in Smooth**. Its cost test now leaves
  whole parts out against fresh baselines: read "the shadow maps", "the ground's
  shading", "the last pass at the picture's size" and "nothing drawn" first.
- **What to do next, in order:**
  1. With the benchmark: if Earth holds 60 at more than the floor resolution, the cure
     held; give the phone back what the governor took (it steps up by itself). If late
     frames come in a rhythm of four, it is the wide shadow tile's turn (see the seventh
     results). If "the ground's shading" is the largest part left, cut the ground's
     shader: compile Earth's blocks out of the other worlds', and look for what can be
     done per vertex.
  2. With a complaint about a look: reproduce it in a picture, fix, show before and after.
  3. Known to be weak (not done): the far forest is still a raised, flat-shaded canopy
     with no tree shapes on its skyline (a ring of whole-tree cards beyond the trees
     would give them; it is fill the phone must first have room for); the tide's beach is
     a narrow band on steep shores; the storm's clouds were seen in still pictures only
     (how they move and turn over was not seen); rain was not seen in motion; the cut-out
     trees and the shadow turns were not run through the stability test; winter trees.
  4. Then the rest of milestone 11 (the list under the fifth pass below still holds).

### The trees' fifth pass (the delivery before; kept for what it says of the trees)

*Written 2026-11-22 at the owner's request ("write a handoff so the next session knows
exactly what you're doing"). The fifth pass is merged and live; this block says what it
is, what is weak, and what to do next.*

**What the owner said** (twice, the second time word for word the same): *"Make them look
even better, the trees still don't look anywhere near the reference. I want an almost
perfect replication of the reference."* The references are the nine pictures of the
stylised landscape game (not in the repository; described under "Milestone 11 plan").
What their trees are, looked at again: finely cut foliage (needle sprays, leafy twigs,
each needle and leaf drawn), on a skeleton of trunk and limbs that can be seen; a crown
shaded smoothly as one round mass, dark toward the trunk and the under side, light
toward the Sun, glowing where the Sun is behind it; and far trees as flat dark
silhouettes in layers, each lighter and bluer with distance. Low-polygon lumps and loose
triangles (the fourth delivery, live as build 9d6e42e) are a different style altogether:
no tuning of them gets there.

**What was built:**
- `src/life/treeAtlasLayout.js`: where things are in the trees' picture (2048 x 1024:
  twelve sprays of 256 on the left, 8 shapes x 3 variants of whole trees on the right).
- `src/life/treeAtlasGen.js`: draws that picture by rule, in plain JavaScript (runs in
  Node, no canvas, no outside artwork): `fir` (a hanging bough from the side), `firTop`
  (a bough from above), `burst` (a pine's needles), `leafy` (twigs of leaves, by leaf
  size and shape), `tuft`, `rosette` (a crown from straight above), and `addImpostors`
  (every shape seen whole, rasterised from its own near mesh with the sprays cut out).
  Three bytes a pixel: cover (the cut-out), tone (each needle and leaf lighter or
  darker), wood.
- `scripts/make-tree-atlas.mjs` writes it to `public/data/tree_atlas.png` (run it again
  after changing a spray or a tree shape; `--look file.png` writes a picture for the
  eye). `scripts/lib/png.mjs`: a PNG writer.
- `src/life/treeGeometry.js`, rewritten: trunk and limbs as tubes; foliage as cards
  (`plate`, `card`, `bunch`) with texture coordinates `aUv` (-1 on plain faces); `aLeaf`
  3 = a card of foliage, 4 = a whole tree's card; normals smooth over the whole crown
  (from the crown's middle `s.mid` and the bunch's middle), so a tree is lit as one round
  mass whatever way its cards face. Far mesh = `whole()`: two crossed cards of the
  tree's silhouette and a rosette lying in its crown: 6 triangles.
- `src/life/trees.js`: loads the picture (`tTreeAtlas`, mip maps, uploaded with
  `initTexture`; no tree is drawn until it has come); fragment shader cuts cards out
  first (`discard` under 0.42 cover, lower far off so trees do not thin), takes each
  needle's tone from the picture, adds light through the foliage when one looks toward
  the Sun; the shadow pass cuts the same way. `CLOSE_M` 42, `NEAR_M` 115.
- `scripts/tree-preview.mjs` draws every shape at its three distances with the cut-outs
  applied, without a browser, in two seconds: **use it for every change to a shape**.
- Triangles a tree are now 150 to 420 close, 100 to 260 near, 6 far (they were up to
  2 200, 800, 380): much less geometry, more cut-out pixels. Not measured on the phone.

**Delivered** (the fifth painted delivery): all of the above, merged and live. Tested:
build check, `npm run smoke` (16 checks, every shader within the phone's limits),
pictures in the game of the spruce forest, the hardwood forest, the forest from the air
and over the tree tops to the horizon, the opening view; the tree sheets. A closed
forest's trees are 166 000 triangles (they were 620 000 at the fourth delivery).
Reference pictures: `docs/shots/earth_forest_spruce.png`, `_hardwood`, `_air`, `_tops`,
`trees_sheet_1.png`, `_2.png`.

**Asked of the owner:** how the trees look now against the references, and an **Earth
benchmark in Smooth** (cut-out foliage is new cost on the phone: many cards over each
other, each cut by a `discard`; nothing of it is measured).

**What to do next, in order:**
1. With a benchmark: read it first. If forests are slow, the cards are the suspect:
   fewer cards in a bunch (`bunches(... n ...)` in `treeGeometry.js`), `CLOSE_M` and
   `NEAR_M` down (`trees.js`), the governor's `tree-leaves` and `trees-far` steps.
2. With "still not like the reference": put the owner's nine pictures beside ours and
   name the difference before changing anything. What is known to be weak:
   - the hardwood canopy seen from under is evenly bright (the references' grove has deep
     shade among the leaves and bright flecks);
   - leaves very near the camera are soft (the sprays are 256 pixels: a larger picture,
     or a second, finer one for the close mesh);
   - far trees are their near mesh's silhouette with its light baked flat: the
     references' far forest is flat dark shapes in layers, each lighter and bluer with
     distance (the air does some of this; the trees' own tone could do more);
   - conifers could be darker and bluer, with the trunk nearly black against them;
   - only the fir, the pine, the hardwood and the aspen were seen in the game; the
     tropical tree, the acacia, the bush and the palm only in the preview;
   - winter: cards shrink to the trunk, and the far silhouette keeps its leaves;
   - the stability test was not run on the cut-outs (they may shimmer in motion).
3. Then the rest of milestone 11 (see below).

- **The goal** (owner, 2026-11-20): the best possible product a Samsung Galaxy S23 Ultra
  runs without lag (`CLAUDE.md`, "The one goal"). Helpers: workflows only for the most
  challenging parts.
- **The owner's last word** (with Smooth and Sharp benchmarks of build fa0c4c9): hyper
  focus on Earth and its physics: rivers and seas, clouds to fly through, forests of the
  real trees, wind in them and falling leaves, rain, thunder and lightning, hurricanes
  and the other weather, and beautiful.
- **Delivered**: milestone 10, five stages, merged; `checkpoint sent`. What each stage
  contains and what it does not is under "Milestone 10, stages 1 and 2", "stages 3 to
  5" and "Milestone 10 review" below. The lakes and rivers were put right at the very
  end (the review's follow-up: the real lakes were not being drawn and false ones were);
  `npm run lakes` now holds them to the real ones.
- **The owner changed the art direction** (2026-11-21, after a review of the look, with
  nine reference pictures): the painted look, Earth and its forests first. Milestone 11.
  See "Milestone 11 plan" and "first delivery" below, and `CLAUDE.md`, "Choices in force".
- **The phone's word on the second delivery** (build c51fae1: an Earth benchmark and a
  list): **56.8 fps** (from 15.2): the frame-rate cure held. The owner then asked for
  clouds that are denser, better and keep their place when one moves, better leaves on
  the trees, and the ground loaded before one gets there. All of it is under "The
  owner's sixth phone results and the third painted delivery". **Third delivery sent.**
- **Then** (no benchmark, a complaint): "the trees still look bad", closer to the
  references, and more and better clouds. **Fourth delivery sent**: the tree shapes
  rebuilt from their skeletons at all three distances, a fuller sky of lobed, domed heaps.
  See "The fourth painted delivery".
- **Asked of the owner**: an Earth benchmark in Smooth (the trees have many more
  triangles far off, the load-ahead builds more ground: neither is measured), and how the
  trees and clouds look now.
- **What to do next**: with the benchmark, tune from it first. With a complaint,
  reproduce it in a picture, fix, show before and after. Then: Earth's resolution on
  the phone (1.3 MP of 4.45: the ground shader is where the time is; compile Earth's
  blocks out of other worlds' shaders, and look for what the ground can do per vertex);
  the cost test's baseline (see the sixth results); milestone 11's rest: water in the
  same hand, the character, night and orbit, and the other worlds one at a time (give
  each a `look` block and its air). Older open items: a swimming stroke, rain shafts,
  moving weather, Mars' costly pixel, lakes with islands finer than a cell, the Caspian
  28 m too high, far rivers over filled hollows. Still open: whether a 3D model file of
  the character exists.
- **How to work here** (all in CLAUDE.md): develop on the session's own branch, open a
  pull request into `main` and merge it yourself (through `gh api`); the phone link
  updates a minute later and shows the build's commit. Run `./scripts/build-check.sh`
  before every merge, one headless browser at a time, and the checks listed under "Run
  and test". Earth pictures need the map mirror's cache (`/root/mapcache/ext`, filled on
  first use) and `--timeout 600`.
- **Choosing a view without the browser**: `node scripts/peek.mjs` sketches what a
  camera sees from a place in seconds (bundled maps only).

## What exists today

- **Mars**: real NASA MOLA elevation and Viking colour over the whole planet. The main
  site is Coprates Chasma (Valles Marineris) at 2014-01-31 09:29 UTC, about 20 minutes
  before local sunset, with five views: ledge, sun, wall, ship, dusk. Two more places with
  their own sharper elevation: the summit caldera of Olympus Mons and Gale crater.
- **The Moon**: real elevation (LOLA for the globe, SLDEM2015 for the sites) and real
  brightness (Clementine). The main site is Hadley Rille and the Apollo 15 landing site on
  1971-08-01 13:00 UTC, the second day of that mission: five views (the canyon from its
  bend, sunrise over the Apennines, Mount Hadley, the lander with Hadley Delta behind,
  night under the Earth). Two more places: Tycho and the Taurus-Littrow valley (Apollo 17).
- **Dust**: the character throws up dust when it touches down, takes off or skims the
  ground; low clean arcs on the airless Moon, a lingering cloud on Mars.
- **The character**: the owner's design, a figure in a white-silver robe with long
  magenta-purple hair; the robe's skirt, the wide sleeves and the hair are simulated cloth
  that flows in the wind and in flight. Flight speed grows
  with distance from the nearest surface, so one stick covers hovering, orbit and the
  crossing between worlds; the engine hands over from one world to the other in flight.
- **Engine**: cube-sphere terrain with worker-built chunks and baked Sun shadows, a
  lookup-table atmosphere, the true sky (9 096 catalogue stars, Sun, planets and moons
  from an ephemeris checked against JPL Horizons), a lander, rocks, HDR with
  auto-exposure, AgX, bloom, dither.
- **Start screen** with Play, a 3-minute benchmark, a 10-minute soak test and the
  Smooth / Sharp switch; a results screen with a Copy button; the commit the page was
  built from on the start screen and in the HUD.
- **The governor**: renders at the canvas's native pixel size when it can, lowers
  resolution first (down to about 1 M pixels), then features in a fixed order, and paces
  frames evenly to the 60 or 30 fps target.
- **Phone link**: GitHub Pages, deployed by GitHub Actions on every push to `main`.
- **Tools**: the reference screenshot set (`npm run shots:all`), the stability test
  (`npm run stability`), a scripted Mars→Moon flight test (`npm run flight`) and a
  headless check of the start screen, modes and a full benchmark (`npm run smoke`).

## Milestone 1 plan — phone link and measurement

1. Save the charter (`CLAUDE.md`) and roadmap; remove the rules it replaces.
2. GitHub Pages through GitHub Actions, deployed from `main`; Claude merges its own pull
   requests so the link follows every push. Build stamped with the commit hash.
3. Start screen (Play, Benchmark, Soak, Smooth/Sharp) showing the commit hash; hash in
   the HUD.
4. The governor: native-resolution ceiling, about 1 M pixel floor, resolution first, then
   features in a fixed order, hysteresis; frame pacing for a steady 60 or 30.
5. Benchmark: scripted 3-minute route (Mars bookmarks → flight to the Moon → lunar
   bookmarks), 10-minute soak, results screen with Copy.
6. Reference screenshots, stability test, independent critic, docs, checkpoint.

Status: all six done; waiting for the owner's first benchmark results from the phone.

## The owner's first phone results (milestone 1 build, Galaxy S23 Ultra)

Four runs on build b236727, screen 823×384 CSS px at pixel ratio 3.75 (3088×1440),
Adreno 740.

| Run | fps | 1 % low | Resolution | Steps |
| --- | --- | --- | --- | --- |
| Benchmark, Smooth | 59.8 | 45.1 | average 4.22 MP, native after the 23 s climb from the old 2.35 MP start | 3 down, 8 up |
| Benchmark, Sharp | 30.0 | 29.2 | native 4.45 MP throughout | none |
| Soak 10 min, Smooth | 59.4 | 30.2 | average 4.35 MP; 58.7–60.0 fps every minute | 7 down, 12 up |
| Soak 10 min, Sharp | 30.0 | 28.7 | native throughout | none |

No hitch over 100 ms in any run but one (a bookmark jump); worst frame 50 ms; no sign of
heat throttling in ten minutes; 155 draw calls, 498k triangles, about 175 MB. Refresh
reads 120 Hz in Smooth and 60 Hz in Sharp (the panel follows the frame rate).
Lunar chunks took 87–117 ms each on the phone, Martian ones 29–37 ms.

What was changed because of them:

- **Both modes start at native.** The phone holds it at 60 fps; the old head start cost
  23 seconds of needless climbing.
- **Dips were terrain loading, not resolution** (they cluster in the flight and arrival
  part of each lap). Finished chunks are now uploaded about one per 60th of a second of
  frame time instead of all at once; the three frames after an upload count as "soft"
  for the governor as well; and a level that has held for 20 s is remembered, so the way
  back from a dip is one jump instead of a climb.
- The results text gains the share of late frames.
- **Headroom**: Sharp never leaves native and Smooth nearly never does, so the phone has
  room for an expensive effect behind a governor step. Anti-aliasing is the first
  candidate (thin bright features shimmer). To be confirmed on the milestone 2 build,
  which costs more per frame.

## The owner's second phone results (after milestone 4, Galaxy S23 Ultra)

One run, Smooth, build 6694574 (180 terrain patches, the robed character): **56.6 fps, 1 %
low 21.6, 5.3 % late frames**, resolution 3.61 MP on average with dips to 1.60 MP, 29
resolution steps and no feature step, 197 draw calls, 631 thousand triangles, 237 MB;
1301 Martian patches built at 45 ms and 1832 lunar at 58 ms. The milestone 1 build held
59.8 fps and a 1 % low of 45 at native.

What the log showed: at the Mars `dusk` stop the governor took eight resolution steps in
ten seconds, down to 1.60 MP, and the frames stayed late the whole stop: pixels were not
what was slow. The same on the Moon's stops with a time jump. The likely cause is the
work per frame: half again as many draw calls and patches arriving after every jump,
all shadows re-baked after a jump of the clock.

What was changed:

- **The governor tells slow work from slow pixels.** The app measures the page's own
  work per frame; when it fills more than 0.6 of the frame, late frames no longer lower
  resolution: terrain patches go instead (x0.8, x0.64, back after 15 clean seconds).
  When only frames with arriving terrain are late, terrain is let in more slowly (one
  patch a frame, then one every other frame) before anything else.
- **Smooth draws 0.8 of the patch cap** (144); Sharp, with twice the time, all 180.
- Shadow re-bakes count as arriving terrain (they were invisible to the governor).
- **The benchmark now reports** the page's own work per frame, every stop of the route
  on its own line, the shadows re-baked and the patch cap at the end: the next results
  will say where the time goes.
- Checked in the governor simulation (two new phone-like cases: ten seconds of slow work
  that fewer patches cure, and that nothing cures: resolution stays native in both).

Not known until the next benchmark: whether Smooth is steady again.

## The owner's third phone results (after milestone 5, build 27e1973)

Two runs. **Sharp** (30 fps): 29.7 fps, 1 % low 17.4, 1.9 % late, 4.32 MP on average, the
page's own work 9.8 ms of 33 ms: steady. **Smooth** (60 fps): **49.1 fps, 1 % low 12.3,
12.9 % late**, 2.39 MP on average with dips to 0.96 MP, own work 7.2 ms of 16.8 ms. The
changes made after the second results had made Smooth worse, not better.

What the numbers said (the stops are in the results, line by line):

- Stops that look at the sky (Mars `sun` and `dusk`, the Moon's `dusk`) held 60 fps.
  Stops that look at ground were late in step with how much new ground arrives there, at
  any resolution: 13 % late at 1.14 MP (Mars `ship`), 17 % at 1.50 MP (Moon `ledge`).
- At the Moon's `wall` and `ship` the picture was at full size, **49 % of the frames were
  late for 24 seconds and the governor did nothing**. That is the pace lever's signature:
  at its slowest setting one patch is uploaded every other frame, and every frame with
  an upload came late.
- So the cost was per frame with an upload, not per patch, and spreading the uploads out
  (the "fix" after the second results) multiplied the late frames. The first run after
  milestone 4, which uploaded several patches in one frame, had 5 % late.

Why a frame with an upload is late (not measurable from here; the reasoning, and what
the next benchmark will confirm or refute): three uploads a changed texture at the draw
call that first uses it, which is in the middle of the scene's render pass, and asks the
GPU to build its mip maps there. A phone's GPU draws in tiles: to run that second job it
must write the half-drawn picture out and read it back afterwards, at a cost that grows
with the picture's size. That matches every line above.

What was changed:

- **The ground is one draw call.** All chunks share four texture arrays (vertices, morph
  heights, normal maps with their mip maps, baked shadows), one layer per pool slot, and
  one instanced mesh draws every visible chunk; an instance is sixteen numbers
  (`src/terrain/chunkPool.js`, the vertex shader's notes in `terrainMaterial.js`). The
  480 meshes, materials and pairs of textures are gone. Draw calls at the Mars ledge:
  156 before, 20 after. The page's own work per frame in the headless profile
  (`scratch/prof.mjs`, software GL, so only the ratio means anything): 5.5 ms before,
  2.8 ms after; drawing the ground went from 2.67 ms to 0.10 ms.
- **New ground reaches the GPU between frames**, at the start of a frame's work and
  before any of its drawing, with plain WebGL calls into one layer of each array. The
  worker makes the normal map's mip maps (a box filter by area, as the GPU's own); the
  GPU is never asked to build any. Re-baked shadows wait for the same moment.
- **The governor**: a third of all frames late is acted on whatever their kind (the bar
  for frames with terrain arriving was 0.6, which is how half the frames stayed late
  for 24 seconds); when terrain is already let in at its slowest pace the patches go
  next, then pixels. Shadow re-bakes no longer count as arriving terrain (they made
  every frame after a clock jump "soft").
- **The benchmark reports** how many frames took in new terrain and how many of those
  were late against the rest, and how many screen refreshes the frames took.
- The picture is unchanged: `ledge` and `wall` on Mars differ from the reference by a
  mean of 0.03 and 0.00 of 255.
- Smooth still draws 0.8 of the patch cap. With one draw call a patch costs the page
  almost nothing, so this can probably go back to all 180: decide from the next results
  (one change at a time; the phone is the judge).

## Milestone 11 plan: the painted look

**The owner's word** (after a review of the look, with nine pictures of a stylised
landscape game as reference): change the direction to that style, "full permission to go
back and change everything", starting with Earth and the forests.

**What is taken from the references, and what is not.** Taken: the principles, which are
those of the landscape poster. Few colours, each time of day a pair of them (the light's
and the shade's); shade that is coloured, never black; the far ground lost in the air
layer by layer, each ridge a flat shape a step nearer the sky; trees, rocks and grass
drawn as bold shapes known by their outline; a big soft Sun. Not taken: that game's
artwork, its palettes picture for picture, its places or its interface. The reference
pictures are not in the repository and nothing is traced from them. Our places stay the
real ones (elevation, land cover, species, weather, the sky's geometry); only how they
are drawn changes. The owner's character was always the fantastical thing in the
picture; now the picture meets it halfway.

**How, in this engine** (all generic and data-driven: a world's `look` block and its
existing numbers; a world without `look` is drawn as before, so the other worlds change
one at a time):

1. *Air*: the look's haze is real scattering, only much more of it and low: Earth's
   `atmosphere.dust` becomes a blue layer 2 km deep (it was a clear day's grey haze, a
   tenth as strong). Every table of the sky follows from it, so far ground fades to the
   colour the sky really has at the horizon, and a low Sun goes red through it.
2. *Light*: `paintLit` (two tones with a soft edge) in place of the cosine on the ground,
   rocks, trees and grass; `skyLight` stronger and more saturated under the look, so
   shade takes the sky's colour. `paintColour`: surface colours cleaner and nearer the
   middle. Less grain in the ground (`detailStrength`).
3. *Grade* (`render/look.js`, in the composite pass): saturation, contrast and two tints
   (the dark half of the picture, the light half), keyed by the Sun's height: day, low,
   dusk, night. Fades from 40 km up: a planet from orbit keeps its own face.
4. *Forest*: tree shapes rebuilt (`treeGeometry.js`): skirts of boughs, tufts, cut lumps,
   every face flat. Grass (`life/grass.js`): a lattice of tufts fixed to the ground that
   wraps round the camera, the ground under it from a small table kept on the CPU.
   Rocks lit by their faces, and larger.
5. Then: clouds and the Sun's glow, water, light shafts; the governor's steps; the other
   worlds.

**Cost**: the look is cheaper per pixel than what it replaces where it replaces it; the
grass is new work (124 000 triangles when all of it is drawn) and has a governor step.
Not measured on the phone.

## Milestone 11, first delivery: what was built

Earth in the painted look, and its forests. Seen in pictures (660 x 309, the test
machine): the South Rim at dawn, at dusk, a spruce and aspen forest on the Kaibab
Plateau, a hardwood forest in Vermont at a low Sun, the forest from the air.

- **Air, light, grade**: as planned. Tuned by looking: the sky's light on things 1.35
  times the physical and turned a little toward green-blue (at 1.7 and plain blue, trunks
  and shade were lavender); colour cleaning 0.7; `paintColour` is not applied to the
  grass (its colours are chosen already, and came out lemon).
- **Trees**: all eight shapes rebuilt from flat faces. A spruce as cones of boughs was a
  stack of paper cones from below; it is now eleven plates of boughs that hang at their
  tips. Broadleaf crowns are twelve small lumps (seven large ones were blocks overhead).
  Leaf bunches as a three-tone pattern on every crown. Pale trunks carry dark scars.
- **Grass**: `life/grass.js`. 166 000 triangles when all of it is drawn; governor step
  `grass` (half the tufts).
- **The Sun's beams**: with the bloom step. The Sun's own disc is kept out of the sum
  (it showed as dots).
- **Clouds**: two octaves, a clean edge, two tones under the look.
- **The opening place** moved 900 m west along the South Rim to level, wooded ground at
  the edge (`scripts/find-vista.mjs`, new: level ground with the land falling away
  ahead, from the streamed elevation), and to 06:18 local time: the canyon at dawn
  through the trees. The old place was a bare spur.
- **Rocks**: lit by their faces, up to 2.6 m.

**Not done, or weak**
- The other fourteen worlds are still in the physical look. Mars and the Moon next.
- The character is not restyled; it is lit by the same new light on Earth.
- Trees: every tree of a kind is the same mesh turned; the fork of a broadleaf trunk
  shows as a row of Ys from below. Bushes (juniper, pinyon) are plain lumps up close.
- Ground: still the map's colours cleaned, with no drawn paths, flowers or fallen logs.
  Steep rock is not faceted (`facets` is carried but unused).
- Water, the cloud volume, rain and the far forest are not restyled (only lit by the new
  light and graded).
- Night and the views from orbit were not looked at in the new look.
- Nothing is measured on the phone. The grass is the one new cost.

## The fourth painted delivery: trees from their skeletons, a fuller sky

*The owner, after the third delivery: "Refine it even further, the trees still look bad to
me, making them look closer to the references, and also increase the density of clouds
and still make it look better." No benchmark came with it.*

**Trees: what was wrong, seen side by side with the references.** In the references a
tree is a skeleton that can be seen (trunk, limbs, twigs) with its foliage in separate
bunches at the limbs' ends and sky between them; firs are tiers of ragged boughs, pines
bare bent trunks with round sprays of needles, aspens white poles with small round
leaves on thin branches. Ours were stacks of flat plates and solid lumps with loose
triangles stuck on, and **beyond 80 m (most of the trees in any view) three plates on a
stick or one floating lump**: that, more than anything close by, was "the trees look bad".
- `scripts/tree-preview.mjs` (new): every shape at its three distances drawn without a
  browser in seconds (a small z-buffer and a PNG writer). The far meshes were first *seen*
  there; a forest picture takes ten minutes and never shows one tree alone.
- `life/treeGeometry.js` rebuilt: one builder a shape, called at three qualities with the
  same random numbers for the skeleton (so the three are the same tree) and others for
  the leaves. New pieces: `frond` (a fir's bough: a blade with needles down both sides
  that rises a little and hangs), `spray` (a pine's bunch of needles: a spiky ball round
  a small dark heart), `cluster` (a ball of single leaves at several depths round a dark
  heart; close by each leaf has a leaf's shape, an aspen's nearly round), `trunk` (through
  several points: trunks bend). All eight shapes have limbs; far off the bunches are lumps
  in the same places and firs a stack of jagged skirts with the same outline.
- Triangles a tree (close / near / far): fir 1 300 / 740 / 100, pine 1 150 / 400 / 190,
  broadleaf 2 200 / 810 / 380, tropical 780 / 330 / 190, acacia 730 / 320 / 210, bush
  720 / 290 / 150, palm 330 / 160 / 36, aspen 1 000 / 230 / 100. **The far meshes are
  two to eight times what they were**, and they are the many: watch the triangle count
  and the tree lines of the next benchmark (`trees-far` and `tree-leaves` are the steps).
- In the shader a leaf or a bough seen from its under side is a third darker: a fir's
  tiers are light above and dark beneath, which is what makes them tiers.

**Clouds.** More of them, and each a better shape.
- Smaller cells of the noise push the outline in and out before the density is cut (the
  shell does the same): rounded lobes instead of one smooth curve.
- A heap stands tallest over its middle and low at its edges (`top` in `density`): with
  one height for all, a full sky was a flat-topped deck from above.
- Two tones with a clean line between them, the shade a light one (0.64 of the light);
  less of the sky's blue in the shade; the far shell as bright as the volume.
- More and smaller heaps (`scale` 4 200 m, `fair` 0.44, never more than 0.5 from the
  fair-weather rule); only a cover that is nearly whole darkens what is under it.
- **The number that misled**: the cover asked for is of one level of the noise; a column
  3.6 km tall goes through most of a period of it, and the sky seen from below is the
  union of all its levels. A setting that should have been 60 % cover was a grey lid.
  It took three pictures from below and one from above to see it.

**Not done, or weak.** Trees: the far forest from the air is still a field of lumps; the
close fir's blades are large flat faces when the camera is among the boughs; no picture
of the tropical, acacia and palm shapes in the game (only in the preview). Clouds: seen
from below toward the Sun they are one cream tone; the far shell is flatter and dimmer
than the volume it continues. Nothing here was measured on the phone.

## The far view (milestone 12, after delivery 1): what was built

*2026-11-23. The owner, an hour after Haven went out: "I need you to make it so I can see
at least a mile in the ground worth of stuff. I want the trees and the grass rendered in
further than I can see ... use as many agents as you want or need."*

**What was there**: grass blades ended 36 m from the traveller; every tree was drawn to
240 m, then one in eighteen (other trees, on another lattice) to 2 km; not one stone
beyond 110 m.

**How it was done**: three helper sessions on machines of their own (pictures are what is
slow here), one part each, from a brief in `docs/briefs/`; each wrote a report beside its
brief, and this session merged their branches as they pushed. Then three independent
reviewers read the code cold (`docs/briefs/far-*-review.md`): 24 findings, nearly all true,
each handed back to its builder with "prove it against the real code first". The reports
say finding by finding what was done.

- **Trees** (`src/life/farForest.js`, `farTiles.js`, `treeShade.js`; `groves.js` is gone;
  `docs/briefs/far-forest-report.md`). The same trees near and far, to 5.6 km: every tree
  site has a rank; tiles of blocks (four sizes, a fixed pool of 40 x 12 288 instances,
  23.6 MB) are worked out in one worker job at a band of ranks and thinned per tree in the
  vertex shader by rank against distance (full to 450 m), growing in as one comes nearer;
  a clean hand-over at 240 m to the near trees, which reach only as far as their blocks
  have come. The land's shadow on far trees per tile and on near trees tree by tree; the
  clouds' shadow from a small map drawn once a frame before the main picture
  (`treeShade.js`: the grass's far clumps read it too). From the review: tiles are rows of
  blocks over a span of longitude (blocks taken by column across two latitude bands left
  strips with no far trees: a third of the blocks at one level at the north wood); the cap
  doubled; trees at the 240 m line no longer drawn by nobody; the far forest still asked
  for with the clock run fast; fills two a frame.
- **Grass** (`src/life/grass.js`, `grassRules.js`; `docs/briefs/far-grass-report.md`).
  Blades near; clump cards on three coarser lattices to 545 m reading wrapped tables of
  the ground (128 x 128 at 4 m and at 10 m, anchored on the ground's own sphere and moved
  in whole steps); beyond and under them the ground's shader wears the same grass: its
  colour, gusts of wind in patches, a dusting of flowers to 900 m, fading into the map's
  colour by 2.5 km. No new texture in the ground's shader (it is full). One slope rule
  for where grass stands and where the ground is painted (`GRASS_GROUND.slope`). Clumps
  take the clouds' shadow and the land's cast shadow (a 36 x 36 table from one worker
  job); a clump looked at squarely from beyond 60 m is not drawn (on a hillside facing
  the eye the field was a brickwork of dashes). From the review: the anchor lay at the
  traveller's height, so on Haven the whole field slid 0.8 m sideways every 200 m of
  flight; the waves' phase flicked at every step (a sign); the ground's flowers flipped
  with the way one last walked.
- **Rock** (`src/rocks/farRocks.js`, `rockBlock.js`; `docs/briefs/far-rocks-report.md`).
  The land's own boulders and outcrops, 0.7 to 20 m, by a rule of the land (talus on and
  under steep ground, erratics in clusters, few in forest, none in water), in tiles from a
  fixed pool, a tile handing the GPU only what can be seen from where the traveller is;
  shadow patches on the ground beyond the shadow map, one small caster mesh inside it; the
  traveller stands on the large ones, on the very mesh that is drawn. From the review:
  flight's speed no longer dips over a tor (`rig.agl` is the height over the land,
  `rig.floor` over what one would stand on); shadows whichever world the page opened on;
  no tile cut by a cap; a shadow ray for each tile's first thousand rocks.
- **Haven itself**: no bench layer (level streaks over every mountain side: three wrong
  guesses before a picture said which); the painted look's stretches of lighter and
  darker ground sized by the world's radius; snow in larger patches with bare ribs; the
  opening place moved 66 m and turned 13 degrees (the pine beside the first spot laid its
  shadow over the whole foreground).
- **Tools**: `scripts/parts-out.mjs` (who draws that?), `tree-shadows-at.mjs`,
  `far-trees-test.mjs`, `far-forest-clock.mjs`, `grass-anchor-replay.mjs`,
  `rig-over-rock.mjs`, `rock-field.mjs`, `check-scripts.mjs`.

**Governor**: new steps `far-rock-shadows`, `far-rocks`, `grass-mid`; `far-trees` thins
and shortens the far forest; `trees-far` now brings the trees' full shapes nearer (it used
to shorten their radius, which only moved the hand-over).

**Tested** (on the final frozen build, a1fa9bd and later): `./scripts/build-check.sh`; `npm run smoke` (on Mars: 16 checks; 22 shaders, every one
within a phone's limits, the ground's at 16 of 16 textures); `npm run foot`;
`npm run shadowturns`; without a browser `govsim`, `lakes`, `check-ephemeris`,
`transfer`, `far-trees-test`, `far-forest-clock`, `npm run rocks`, `rig-over-rock`,
`grass-anchor-replay`. `node scripts/smoke.mjs --haven` (the Haven benchmark as the owner will run it): the start screen, the three-minute lap with the flight to the Moon, and every switch of the cost test at the opening view, without an error; its other two views (in the forest, from the air) were still being measured when this was merged, and on the build of four hours earlier the forest view had got through 50 of its 59 measures before the run was stopped for time.
Pictures on that build (`scratchpad/fin14`; the helpers' own are in `docs/shots/far-*`):
the opening view (158 draw calls, 1.70 M triangles handed over; 111 and 0.95 M before),
87 m over it (144, 1.59 M), the steppe at eye
height (68, 1.19 M), the steep rocky place from 100 m (71, 1.28 M), the opening view with
every saving on (79, 0.96 M), Earth's opening view (138, 1.71 M: the same scene as before).
The hillside that had hatched was looked at at a phone's pixel density (a lens of 21.4
degrees at 309 pixels). The helpers' stability moves: a walk at a wood (the same numbers
as the branch as found), a walk on the steppe, a walk among rocks (flicker 0.03 %).
**Not run**: the full reference set, `flight`, `target`, `worlds`, any stability move on
the final build. Nothing was seen in motion.

**Left for later, known**:
- The ground's grass colour, share and flower kinds within about a kilometre are those of
  the 500 m round the traveller (`uGrassTone`), not of the place: flying from steppe into
  meadows the tone of the near land drifts. The cure is the place's own share and dryness
  in a map the ground's shader already reads (it is full at 16 textures).
- On worlds over 840 km in radius (Earth) the ground gets no dusting of flowers (a 32-bit
  float cannot place a speck there); blades and clumps keep theirs.
- The land's cast shadow on clumps comes from 40 m cells: a soft edge up to 40 m off the
  ground's own shadow; the nearest blades (to 34 m) have the near shadow map only.
- Single far clumps appear and go as one flies along a slope (dropped by chance when
  looked at squarely); not seen moving.
- Nothing was seen in motion on this machine (the stability test's settled frames cannot
  tell a small pop from the wind in the grass: it would need the clock stopped).
- `weather/weather.js` and `rainbow.js` still take 111 200 m for a degree.
- A few valleys of the made world are straight trenches (the maker's flow lines run in
  eight directions): for the water delivery.

## Milestone 12, delivery 1: the plan

**What is to be delivered**: a small made-up world, `haven`, flyable from space to its
ground, with depth all the way in: the curve, mountains on the limb, plateaus, canyons, a
sea, rivers and lakes that follow the land, and the first biome (mountain pine forest).

**Decisions** (Claude's; the reasons in a line each):
- **Size: 250 km in radius.** The horizon is 0.9 km off at eye level, 22 km from 1 km
  up, and dips 22 degrees from 20 km up; a 4 km peak is a degree tall on the limb from
  100 km. Smaller (100 km) and nothing is far enough off for ridge behind ridge from the
  ground; larger and the curve needs height again.
- **Not a restart.** The made world is "an Earth whose maps are made up": the same tile
  rings, hydrology, land cover, trees, grass, clouds and weather, fed by a maker instead
  of map services. So everything Earth learned (lakes, rivers, canopy, far trees, the
  governor's steps) serves it from the first day.
- **Baked large shapes, ruled small ones.** `scripts/make-world.mjs` makes the whole
  planet's elevation offline at some 380 m a cell, with real drainage (valleys cut by
  the water that would run there, hollows that fill), and its colour, slope, rain, water
  and cloud maps; they ship in `public/data/`. Finer ground is made where the traveller
  is, by rule, in the tile worker (a `made` source beside the map services): the baked
  map with deterministic detail down to the ring's cell, the hydrology on top.
- **Its own body in the sky**: on Earth's orbit, half a year from Earth (the same Sun,
  the same air numbers hold), with a small moon for the tide. Nothing real is replaced.
- **Lakes from the flood** on the made world (its hollows are real hollows; on Earth they
  are read from level stretches of the elevation).

**Order of work**: (1) the maker and its maps, judged in top-down relief and CPU
sketches; (2) the world file, the sky body, the made tiles; a first picture from the
game; (3) the start site, chosen by script for ridge behind ridge over water; (4) the
approach in pictures, full and with every saving on; the air and the look tuned to the
small size (`ledge`, `sun`, `dusk` after any air number changes); (5) tests, a
benchmark route, the checkpoint.

**Risks**: land made blind (a probe and a sketch before every picture); the poles (the
tile rings are Mercator: the made land keeps to the middle latitudes, the caps are sea
and ice); things tuned to a huge planet (flight speed by height, the air's thickness
against the radius, cloud heights, the hand-over distances).

## Milestone 12, delivery 1: what was built

- **The maker** (`scripts/make-world.mjs`, `make-world-maps.mjs`; how it works is in
  `docs/ARCHITECTURE.md`, "A made world"): seed 7 gives 43 % land in several continents
  and islands, ranges to 4 314 m, tablelands, 150 lakes (the largest 2 100 km2, the
  deepest 840 m), mean land height 930 m. Tuned at half size in nine seconds a try, by
  shaded-relief previews; the solve counts drained land in cells of that size so the
  result is the same at full size (it was not at first: finer cells, lower mountains).
- **In the game**: `src/worlds/haven.js`, the sky bodies `haven` and `mira`, the made
  mosaics (`tiles/madeTiles.js`, `madeLand.js`), water-only rings, the hydrology with
  the world's lakes given. First run: 105 rivers from the whole-world ring, 38 and 15
  from the finer ones; 3 500 trees and 6 600 far trees at a wooded place.
- **The opening place**: found in three steps (see the lessons in `CLAUDE.md`): a coarse
  search (`find-haven-site.mjs`), the very spot (`find-overlook.mjs`), a sketch
  (`peek.mjs`). The far south of the middle continent, 1 470 m up, a range across the view.
- **Numbers set for the small world**: air standing lower (Rayleigh 4.5 km, the look's
  haze 2 km, as thick by the metre as Earth's; top 60 km); cloud base 1 200 m over the
  country; tree line 3 550 m at the equator, less 39 m a degree; snow from 2.7 km at 40
  degrees; rings at zooms 2, 5 and 8 (1.5 km, 192 m and 24 m a pixel); pictures from zoom
  7 (48 m) to 2 by height; `maxLevel` 14 (24 m patches).
- **Tried and taken back**: beds of rock 120 m thick on every slope (contour lines from
  the air); the haze half again as thick as Earth's by the metre (the lowland from 12 km
  one grey-green); two opening places (a flat coastal plain that the score took for a
  drop of 1 100 m: it was the sea's bed; then a meadow shut in by trees).
- **Known to be weak** (to be looked at before the checkpoint and said to the owner if
  still so): the first load fetches the elevation (17 MB) twice by address (once for the
  ground, once in the tile worker: the browser's cache should serve the second); the
  land's colours are one biome everywhere; no weather block yet (no rain, no storms: the
  third delivery); the caps are open sea; nothing is measured on the phone.

**Tests of delivery 1** (on the build that was merged, served frozen): the build check;
`npm run smoke` (opened on Mars now: the start screen, modes and read-out are the same on
any world, and Haven's wooded ground takes this machine seven seconds a frame; 16 checks,
the ground's shader at 16 of 16 textures); `node scripts/smoke.mjs --haven` (the Haven
benchmark end to end: its lap, the flight to the Moon, the cost test at the opening
place, in the forest and from the air); `npm run shadowturns`; `npm run govsim`;
`npm run lakes` (Earth's hydrology, with the made world's option in the code);
`node scripts/check-ephemeris.mjs` (made bodies left alone); the stability test's move
over Haven from 9 km (`--only haven_flight`: changed 0.55 %, flicker 0.02 %: the nearest
cloud's edges). Pictures: Haven's opening view, sunrise, evening; 1, 9, 60, 300 and
3 000 km; 9 and 60 km with every saving on; Earth's opening view (as it was). (Sunrise,
evening, the two with savings on and Earth are from the merged build; the others from
the build before, which differs in nothing Haven uses; the 3 000 km one from before the
haze was thinned.) **Not
run**: the full reference set, the other stability moves, `flight`, `foot`, `transfer`,
`worlds`. **Nothing is measured on the phone.**

## The owner's eighth phone results (build f300e6f) and the seventh painted delivery: Earth from space to landing

**The numbers** (the three-minute benchmark, Mars and the Moon, Smooth): 55.2 fps, 1 % low
15.8, 7.0 % of frames late; Mars 54.5, flight 55.9, the Moon 55.1; **resolution 1.16 MP on
average, at the floor (0.96) at most stops**; the page's own work 5.9 ms (the figure 2.5);
frames two refreshes long (92.9 %) or four (6.2 %). By stop the late frames run from 0 %
(Moon dusk) to 18.5 % (Mars ship) **at the same one million pixels**.

**The cost test** (Mars ledge, 2.07 MP; times to a pixel read back, about 2.4 times a
frame in play): everything on 44.3 ms, every saving on 40.9, at 1.00 MP 40.5, at native
57.5. Parts left out: the shadow maps 1.7, **the ground's shading 18.7**, the ground and
all on it 30.4, the sky 2.1, the last pass at the picture's size -0.7 (nothing: that
change of the sixth delivery bought nothing), nothing drawn 17.9.

**What it says.**
1. **The levers buy almost nothing.** Half the pixels: 9 % of a frame. Every saving: 8 %.
   Yet the phone sat at one million pixels with savings on through whole benchmarks, and
   the owner's word for the picture was "unrendered".
2. **Why it sat there.** One frame in fifteen is late at every stop, at the floor as
   anywhere: late frames of the phone's own (its GPU clocks itself down to the load; the
   browser; the rest of the system). The governor stepped down for them, cured nothing,
   and needed three seconds without one late frame to step up: with four late frames a
   second it never could. The simulation with such a phone: the old governor stays at
   0.96 MP with 23 savings on for all 150 seconds.
3. **The ground's shader is the largest thing the GPU does** (18.7 of 44 ms on Mars, where
   none of Earth's features run): the next place to cut, and it is cut by the triangle as
   much as by the pixel (the whole frame is hardly cheaper at half the pixels).

**The governor, rewritten where it decides** (`src/perf/governor.js`; `npm run govsim`):
- `bg`: the share of late frames the device has whatever is drawn. Learned only from
  evidence: at the resolution's floor, or from a trial that cured nothing. Up to it (plus
  3 %) late frames neither bring quality down nor stop it from coming back.
- **A step down is a trial.** Some frames late, two steps taken, about as many late as
  before: what was given up comes back (`_putBack`), and such lateness is left alone for
  30 s, then 60, up to 240. Everything given up and the frames as long as before: the
  same. The savings alone can come back while the resolution stays.
- A few late frames above `bg` for six seconds start a trial of their own (too few to
  trip the 24-frame window); a step up followed by one within twelve seconds is taken back.
- The floor is 1.6 MP (it was 1.0); savings come back five at a time; levels remembered
  before this are left behind (`_key`); the benchmark prints `bg` and how often quality
  was put back.
- Four new cases in the simulation, each seen to fail with the old governor.
- `?debug=floor`: pictures at the floor (every saving on, Smooth's share of patches).

**What the owner said** (with the results): *"I still think it looks horrible ...
specifically in space before I've landed on Earth: it looks horrible and unrendered and
it has no height or depth, the clouds are just an image I fly through, and before I land
I see just a green plot of land, not any trees or canyons or rivers. Restart if you have
to, but make that aspect a lot better."*

**Reproduced** (`debug=floor`, from 20 000 km down; pictures under `docs/shots/approach/`):
- From 20 000 km the home world is a pale blue ball with one white smudge; from Mars the
  same Earth (a sky body, `sky/bodies.js`) is a deep blue globe half covered in cloud.
  At the hand-over the Earth one was flying toward turns into the pale ball.
- Why pale: the painted look's low air (five times a clear day's haze, to 4 km) is looked
  through whole from above. Why no cloud: far off the shell showed the heaps' mean cover
  (half of a cover curve that starts at 0.47 of the map), not the day's map.
- From 400 km: forests are flat teal blocks (the far canopy's one green, mixed toward
  the sky's blue by the wood's air), no relief (the governor had it off), no cloud.

**Built** (the seventh painted delivery; each thing seen in pictures, the working numbers
in `docs/ARCHITECTURE.md`):
- **From space**: `uHaze` (the look's haze from above: all of it to 2.5 km, 0.45 of it
  from 25 km); the cloud layer from far is the day's whole map with its own relief, as
  the far globe wears it (it showed nothing at all with the cloud volume off, and half a
  stingy cover with it on); the land's colour ring is coarser and wider with height
  (`zooms`); the far forest keeps the picture's own colour.
- **Height and depth**: the relief light (far ground lit for its slopes by a Sun no
  higher than 35 degrees); every heap of cloud has a lit side, a shaded side and a clean
  edge, and casts its own shadow on the ground (`HEAP_GLSL`: one rule for the layer and
  the ground); clouds' shadows, far relief and the cloud volume are the last three savings.
- **Before landing**: the far trees (`life/groves.js`: a ring of tree shapes to 2 km in
  one draw); the far canopy has crowns and stands (`crowns()`), and follows the trees'
  rule for slopes.
- Small things found on the way: rain streaks in dry weather (a rate that read 0.0 drew
  four hundred); square holes in the canopy on steep hillsides.
- **Found in the last pictures before sending, and put right** (each seen again after):
  - *The heaps were never there on the way in.* The shell took on the volume's heaps (and
    the ground their shadows) only once the volume had been drawn, under 30 km: every
    picture from 30 km and higher had shown the old flat blobs of the day's map, and so
    did a first approach from space, and the governor's floor. `CloudVolume.place` now
    says where the base stands every frame.
  - *With the heaps shown, a wallpaper.* From 30 km one even field of small clouds lay
    over the whole land in rows: the noise repeats every 4.2 km. Shifting the noise from
    place to place (three ways tried in a sketch) bent the rows and stretched the clouds
    and did not hide them; what does is the weather's own way: fair-weather cloud stands
    in **clusters** some tens of kilometres across with clear country between
    (`FAIR_GLSL`, one rule for the volume, the shell and the ground). Tuned in seconds
    in `scripts/cloud-field.mjs`, a top-down sketch without a browser, then seen in the
    game. The opening view keeps its sky.
  - *Clouds from above were grey.* Lit as from below (the light that comes through), a
    heap looked down on was hardly lighter than the desert under it: it now shows its
    sunlit top (by the line of sight, so nothing jumps on the way through the layer),
    and the darker middle is only for the under side.
  - *The forest from the air was a cloth woven in squares*: the same 64 crowns in every
    64 m tile. A patch's tile coordinates are kept modulo 16 tiles (`DETAIL_PERIOD`) and
    the crowns differ over a kilometre: an uneven canopy of crowns.
  - The ground's shader is full: 16 of a phone's 16 textures (the smoke test counts).
  - Test tooling: `scripts/lib/png.mjs` had lost the names three scripts import (the
    stability test, `peek`, `probe-terrain` could not start, since the trees' fifth
    pass); `scripts/check-scripts.mjs` reads every import of every script and is part of
    the build check. A WebGL error on every frame that drew no shadow tile
    (`invalidateFramebuffer` on whatever was bound) is gone.

**Tried and taken back**: the far clouds as the map's faint parts too (grey sheets of fog
over half the land from 100 km); the relief light at full strength from orbit (whole
ranges blue-black); the canopy's slope judged over a whole small patch (square holes).

**Plan** (in this order; each seen in pictures at the floor and at full quality):
1. From space: the haze thinned from above (`uHaze`), the day's whole cloud map with its
   shading on the shell, forests in the picture's own colour. *(built, see below)*
2. Clouds with height: shadows on the ground that stay on, the shell lit by its relief,
   layers one flies through.
3. On the way down: relief that stays on, the land's own colours, rivers that can be
   seen from the air, trees that can be seen well before landing.
4. Deliver, and ask for an Earth benchmark.

All four are built.

**Tests of this delivery** (on the build that was merged, served frozen): the build check
(with the scripts' imports); `npm run smoke` (16 checks; 22 shaders, the ground's the
fullest at 16 of a phone's 16 textures, none failing); `npm run shadowturns` (and no
WebGL error in its log any more);
`npm run govsim` (the four new cases among them); `npm run lakes`; the stability test's
Earth move over the forest from 370 m (`--only earth_forest_flight`: changed 5.3 %,
flicker 0.24 %: crowns and tree outlines moving with the camera, nothing popping).
Pictures from the merged build: 20 000, 2 000, 400, 100, 30, 12 km, among the clouds at
5 km, the forest from 700 and 370 m, the opening view, and 100 and 30 km with every
saving on. **Not run**: the full reference set, the stability test's other moves, the
streaming stability run, `flight`, `foot`, `transfer`, `worlds` (nothing in them was
touched, but the ground's shader and the tile coordinates serve every world: the smoke
test's Mars and Moon are what stands for them). **Nothing is measured on the phone.**

## The owner's seventh phone results (build ef3201a) and the sixth painted delivery

**The numbers** (Earth benchmark, Smooth): **53.7 fps** on average (56.8 at the sixth),
1 % low 16.9, 9.4 % of frames late. **Earth 48.3** (it was 55.8: the trees' cut-out cards
and the storms came in between), the flight 53.9, the Moon 58.8. By stop on Earth: ledge
44.2, sun 43.2, wall 59.2, **ship 37.6**, dusk 57.0. Resolution at the floor nearly all the
time on Earth (0.96 MP of 4.45) with every saving on (102 quality steps); the page's own
work 5.7 ms (the figure 2.3). 137 draw calls, 1 188 k triangles, 237 MB at most.

**What the cost test said** (three views at 2.07 MP; its times are from a frame's start
until one pixel is read back, about twice what a frame takes in play, so only the
proportions count): everything on 58 ms; **every saving on 49 to 59**: the savings together
buy almost nothing; at 1 MP 43, at native 73: a third of the frame does not depend on the
picture's size at all. Parts left out: no ground or things on it 23 to 32; **nothing
drawn at all 19 to 28**. So nearly half a frame was paid with an empty picture, and no
saving and no resolution step could touch it. What that was, looked for in the code:
1. **The last pass wrote the screen's 4.45 million pixels** whatever the picture's size
   (tone map, grade, dither, beams, bloom mix: a long shader).
2. **The shadow atlas was drawn whole every frame**: 6.3 million depth pixels cleared and
   every rock and every tree's cut-out cards drawn into them.
3. **The ground was drawn first** and shaded under everything that then covered it
   (grass, trees, rocks), by the most expensive shader in the game.

**What was done from it** (none of it measured on the phone yet):
- `App.fitCanvas`: the canvas's own pixel size follows the picture's (four steps), the
  browser scales it to the screen; the last pass writes the picture's pixels only.
- `nearShadow`: the tiles are drawn in turns (the figure's every frame, the fine one
  every other, the wide one every fourth; all of them at Sharp's 30 fps), each kept
  where it was drawn; `npm run shadowturns` holds it to the same picture.
- Draw order: grass and leaves, trees, rocks and lander, the ground last.
- Trees cast their shadows as their next simpler mesh (`set.cast` in `trees.js`): the
  shadow pass was drawing every spray of every tree within 150 m (some 300 000 triangles
  of cut-outs in a closed forest, as many again as the view).
- The cost test leaves more parts out (the shadow maps, the ground's shading, the last
  pass at the picture's size) and sets each against a baseline taken just before it.
- **To watch for in the next results**: late frames in a rhythm of four (frame lengths
  2, 2, 2, 4 refreshes) would be the wide shadow tile's turn: then draw its trees as
  their far meshes (6 triangles each) in that tile. And the line "the ground's shading"
  says whether the ground's shader is the next thing to cut.

**What the owner asked for** (with the results, and eight reference pictures): keep
working on the performance; far things should look good; *"I want the ground to be
loaded in when I'm super high in the sky"*; the water needs a lot of work: waves and
tide; rain a lot denser; clouds that change a lot more, like an actual storm; trees
closer to the references.

**Built for it** (the sixth painted delivery):
- **From high up**: patches split sooner from 1.2 km (it was from 30 km), growing to the
  full 2.2 at 150 km, so that about as many patches are in view at every height as from
  the ground (the first try, full by 12 km, drew 177 patches and 675 000 triangles from
  12 km where 73 had been: more than the ground view itself). Between 2 and 30 km the
  ground under the traveller was a blur on the phone. The
  land-cover colours are laid on softly (a class's edge fades over three pixels): from
  40 km and more the land was a mosaic of 600 m blocks.
- **Far forest**: the canopy beyond the trees is up to its height where the last trees
  stand (from above there was a brown ring of bare ground between the two), is lit by
  the sides of its crowns as trees are, and stands in the same air (`forestAir`).
- **Tide**: the sea falls and rises twice a day by the Moon's and the Sun's real places
  (springs and neaps), up to about 3 m on Earth; the beach it leaves is drawn as wet
  sand at its own depth, with a wash at the water's edge; the character wades by it.
  Waves: the smallest waves are half again as tall (`waveScale` at least 0.45), they
  lift the water at every governor level, and in wind the far sea is streaked white to
  the horizon. A strip of dry sand stands above high water. The dark specks on the sea
  off low shores were grass: tufts that are not there were drawn with no height, and a
  blade of no height still lands on a pixel now and then; they are thrown out of the
  picture now (which also spares the phone their triangles wherever grass is thin).
- **Rain** four times as dense (5 600 streaks), each a strip with a width of its own
  (they were one-pixel lines: on the phone the heaviest rain was a few scratches, and a
  bug drew one streak in twelve right across the box), a third of them close round the
  eye, lit by the sky it falls from (lit by a share of the Sun's light it was as bright
  as the scene behind it: unseen); and rain hides what is far (`rainVeil`), the sky too.
- **Storms come in squalls**: bursts of rain and wind every minute or two, a darker
  sky, lightning sooner; in a storm the clouds are denser, drift up to 55 m/s and
  change shape up to thirteen times as fast.
- **Trees**: every bunch of sprays has a dark heart and every tier of a fir a dark
  skirt (a crown is a mass with a cut edge, not a lace); firs a third narrower with more
  boughs; a cold green for conifers and a warm one for broad leaves; furrowed bark near
  by; row behind row of trees paler in the wood's air.

**Pictures of this delivery** (`docs/shots/`, 660 x 309, taken from frozen builds while it
was made): `earth_hurricane_rain.png` (60 m over the sea in Irma's eye wall),
`delivery6_storm_before_after.png` (the same view before: the rain was a few scratches),
`earth_beach_tide_rain.png` (a lagoon at Cape Canaveral, the tide part out),
`earth_forest_inside_6.png` and `earth_forest_far_6.png` (the Kaibab Plateau's forest at
36.3 N 247.9 E, from inside and from 45 m over it),
`delivery6_far_forest_before_after.png` (the far forest before, at another place, with
its brown ring), `earth_from_40km.png`. For a picture inside a forest use that place:
`lat=36.3&lon=247.9&heading=0&pitch=2&t=3` (no `alt`: `alt` is height above the datum,
not above the ground; over it: `alt=2685`). The cost view called "in the forest"
(36.2 N 247.94 E) looks out over a canyon.

## The owner's sixth phone results (build c51fae1) and the third painted delivery

**The numbers** (Earth benchmark, Smooth): **56.8 fps** on average (it was 15.2), Earth
55.8, the flight 56.7, the Moon 57.8; 4.9 % of frames late; frames are two refreshes long
(95 %) or four (4.5 %), never three: the page is paced at 60 on the 120 Hz screen, and a
frame that misses waits a whole one. Resolution 1.98 MP on average: about 1.2 to 1.4 MP
on Earth, 2.2 to 2.9 on the Moon. The page's own work 5.8 ms (the figure 2.2 of it).
**The cure of the fifth results held**: nothing leaves the main picture, its depth is no
texture, and the frame rate is back.

**What the cost test could and could not say.** Its "everything on" ran from 36 to 61 ms
over the test at one view (the phone warming, ground arriving), so the single savings
measured first read as costing 5 to 14 ms *more* when switched on (detail, soft shadows,
contact, at all three views): that is the drift, not the savings. Believed, because they
are large and the same kind at each view: the ground and what stands on it are the bulk
of the picture (24 to 30 ms of 55), the sky 15 to 20; the Sun's beams 4.4 ms at the
opening view. Not believed: anything under 3 ms. **To do before the next reading**: time
each saving against a baseline taken immediately before it, not every third.

**What was done from it.**
- The Sun's beams are worked out on a picture a quarter of the view each way and added
  in the last pass (they were twelve looks a pixel at the screen's own 4.45 MP).
- Nothing else in the governor: it held 60 with resolution alone and one feature step
  for four seconds. Earth's low resolution (1.3 MP of 4.45) is the next thing to win
  back; the ground shader is where the time is.

**What the owner asked for** (with the results): clouds denser and better, and *"I don't
like how they move when I move, they should be doing their own thing"*; trees with
better leaves; and *"I want things to load before I get there, I don't like how things
look really blurry before I show up"*.

**Clouds that keep their place.** Four things tied the clouds to the traveller; all four
are gone.
- The base stood over the ground *under the traveller* and followed it: fly off the
  canyon's rim and the whole sky sank 1 500 m in a few seconds. It now stands over the
  country's height read from the world's coarse elevation, smoothed over a degree
  (`CloudVolume.setGround`): a thing of the place.
- The slices were of the view's depth: turn the view and a cloud passed from one slice
  to another, and was cut to a different outline. They are now of distance from the eye,
  laid as curved sheets (a 24 x 12 grid, each corner at the depth that distance has along
  its own ray).
- The clean edge was cut slice by slice: a cloud that lay across two slices thinned as
  the boundary passed through it, which is whenever the traveller moved. The cut now
  goes by all the cloud along the line of sight (the lay pass reads the six slices).
- Beyond the volume's reach the shell drew *other* clouds (its own noise at another
  height): clouds changed 16 km ahead as one flew. The shell now shows the same clouds:
  the same cover rule, the volume's noise at the height where its masses are widest.
- Besides: the fair-weather field is placed by the world's radius, not the layer's (it
  shifted when the layer's height did); the shapes turn over five times more slowly
  (`change` 0.006: at 0.03 the noise ran through the layer at 156 m/s and the clouds
  boiled); the thinning round the eye is 120 m and to a third, not 300 m and to a tenth
  (a cloud ahead melted before one reached it).
- Denser and better: `dense` 2.8, a steeper edge in the density itself, fair-weather
  cover 0.47 (at 0.62 the sky was a grey lid), the march's grain taken out in a pass of
  its own before the lay.

**Things ready before the traveller arrives.**
- `Terrain._preload`: a patch the camera does not need finer is asked whether the place
  ahead would: three seconds along the traveller's velocity, or, on a GO trip to a
  place, the point over the place where the trip ends (`terrain.dest`). If so its
  children are built and kept **without being drawn** (drawing them early would spend
  the patch budget on ground far off), after everything the camera itself needs, and
  kept up to date with the maps like drawn ground.
- The map rings look ahead: a new mosaic is centred up to half a tile along the way and
  is asked for when the place twelve seconds ahead nears the edge; a GO trip's
  destination gets its mosaics while the traveller is still on the way (when the ring is
  not in use under the traveller: too high, or outside it).
- **Not measured**: how much sooner the ground is sharp on the phone. The patches are
  built by the same three workers; ahead-of-need work competes with nothing the camera
  wants (it queues behind it) but it is more work in all: watch "terrain patches built"
  and the late frames while ground arrives in the next benchmark.

**Leaves.** Every tree shape has a third, close level (within 34 m): the near tree with
3.2 times the leaves, each a leaf's own shape (narrow at the stalk, widest two fifths
out, a point) and standing at several depths over the mass, each lighter or darker than
its neighbours. Governor step `tree-leaves` (the close level off).
A crown seen near is leaves round a smaller, darker heart (the lumps at 0.7 of their size
close, 0.86 near): with the lumps whole the leaves lay on a green ceiling and did not read.

**Tests of this delivery.** Build check; `npm run smoke` (16 checks, 22 shaders, 15 of 16
textures at most); `npm run target` (a GO trip in the real game, with the destination
being got ready on the way); `npm run foot` on Mars. **`npm run foot -- --world earth`
fails one check** ("super speed": the runner leaves its feet at 16.5 m/s on the sloping
rim of the opening place before reaching 25; the test was written for Mars and the Moon,
and nothing on foot was changed): look at it with the next on-foot work. Pictures at
660 x 309: the opening view, the meadow, among the clouds twice (the view turned 40
degrees), the hardwood and the spruce forest. **Not done**: the stability test on the
new clouds, pictures of load-ahead (it shows only in motion), Everest, night, orbit.


## The owner's fifth phone results (build 345e2b7) and the second painted delivery

*The first Earth benchmark to come back, in Smooth, with two screenshots and a list of
what the owner did not like.*

**The numbers.** 15.2 fps on average, a 1 % low of 4.2, half the frames late; Earth 14.0,
the flight 15.6, **the Moon 16.0**. The governor at its floor (0.96 MP, 22 savings) and
nothing cured. The page's own work 4.4 ms a frame: not the cause. The cost test, which
times frames until the GPU has drawn them: about 100 ms a frame with everything on at
2.07 MP, the same with every saving on, the same at 1.00 MP, and **51 to 58 ms at the
full 4.45 MP**. Build fa0c4c9 ran the Moon at 54 fps on the same phone.

**What that says.** A cost of 50 to 100 ms a frame that no resolution and no feature
changes, on every world, and that is *smaller* when the whole target is in use, is not
shading: it is whole pictures being written out of the GPU's tiles and read back. Two
things in the frame did that, both new since fa0c4c9 and both there on every world:
the main picture's depth had been made a texture (for the cloud volume to read), and the
cloud volume was marched in the middle of the main picture (leave the target, draw
elsewhere, come back). On a tile-based GPU each is a full store and load of a 4.45 MP
half-float picture and its depth. At full resolution the clear covers the whole target
and one of the loads goes away, which is the 100 against 55.

**What was done.**
- The depth is a plain buffer again; nothing leaves the main picture between its clear
  and its last draw (`post.resumeScene` is gone).
- The cloud volume no longer reads depth. It is marched **before** the main picture as
  six slices of the view's depth, side by side in one small target, and laid over the
  ground as six full-screen passes at the depths where the slices begin: the depth test
  hides cloud behind a ridge, to within a slice (`sky/cloudVolume.js`).
- The benchmark's cost test now also times the frame **with a part of the picture left
  out** (grass, trees, the figure, the ground and what stands on it, the sky, everything):
  if the fixed cost is still there, those lines say where it lives.
- The Sun's beams got a governor step (12 looks a pixel at the screen's own size).
- This is a diagnosis from numbers, not a measurement of the cure: **the next benchmark
  is the proof.** If the Moon is still slow, read "with a part of the picture left out"
  first; the next suspect is the ground shader's size (Earth's blocks compiled into
  every world's shader: make them compile-time).

**What the owner asked for, and what was built.**
- *"I don't like how it looks when I'm flying over something"* (a screenshot over the
  Bahama shallows: brown ground with teal blobs): see "Flying over" below.
- *Grass much denser, and flowers, different ones in different areas*: three lattices
  from the one ground table (`life/grass.js`): thick grass close by (0.22 m apart, a box
  of 26 m), grass farther out (0.5 m, 72 m), flowers (0.45 m, 43 m): about six times
  the blades underfoot. Seven kinds of flower (daisies, poppies, lupins, buttercups,
  fireweed and heather, orange poppies, the big pink flowers of the wet tropics); which
  grow where follows the land cover, the latitude and the height, one kind to a patch
  some 40 m across, in drifts with bare grass between. The governor's step now lowers
  the count of instances (they are drawn in a scrambled order), so the work goes down.
- *Trees with a lot more leaves, variety, moving in the wind*: every shape is built in
  three variants (proportions, lean, how the masses sit) and each tree takes one by its
  own number; single leaves stand out of every crown (`sprigs`) and flutter each in its
  own time, harder in a harder wind.
- *Leaves fall when it is extra windy or when I fly by superfast*: in a gale every tree
  sheds (green out of season); a traveller passing trees faster than 18 m/s tears
  leaves off them (`life/leaves.js`).
- *Dense, changing clouds to fly through*. What was wrong, seen in pictures: outside the
  day's weather systems the sky was **empty** (the day's cloud map has 10 km pixels and
  a clear reading below half cover), inside them it was a flat sheet, and inside a cloud
  the view was one flat colour. Now: **fair-weather cloud** (`clouds.volume.fair`): where
  the map is clear there are still fields of small heaps with clear stretches between,
  in the volume and in the far shell; the volume is 2.2 times as solid (`dense`) and its
  shapes turn over with time (`change`); the Sun lights it as a painter does (full on
  the tops and the sides turned to it, shade in the hearts and under the masses; with
  the cloud made denser the physical sum had every cloud in its own shadow, dark blue
  against the sky); from 900 m off the cloud is cut to a clean shape (the march is soft
  and grainy at a quarter of the view); close by, wisps are torn out of it and the
  cloud round the eye is thin (`clear`, 300 m), so flying through one is shapes going
  by. The volume now reaches 16 km (it was 45: five steps over the last 27 km drew
  speckle, not cloud); beyond, the shell.

- The cloud base rides `base` metres over the ground under the traveller: with cloud now
  everywhere, a base over the sea put the canyon's rim (2 100 m) inside it.
- For the phone: each of the six cloud passes covers only the part of the sky where its
  slice can hold cloud; from the ground with a level view that is under one screen of
  blending instead of four to six.
- Reference pictures of this delivery (`docs/shots/`, at 660 x 309: there was no time for
  the full set at the phone shape): `earth_ledge`, `earth_dusk`, `earth_forest_spruce`,
  `earth_forest_hardwood`, `earth_meadow_cloud`, `earth_prairie`, `earth_clouds_air`,
  `earth_florida_air`, `earth_hurricane`, `earth_tropics_rain`.
- **Not looked at after these changes**: Everest, the Pacific at dawn, the lakes and the
  Colorado (the haze and the land's colours changed there too), night, and the view from
  orbit down to 40 km. Stability (`npm run stability`) was not run on the new grass,
  flowers and clouds: the cut edge of the far clouds may crawl in motion.

### Flying over

The owner's picture (brown flats with teal pools under a yellow haze) and two of the same
kind made here (Florida from 900 m and from 2 200 m: a grey-green blur) say three things.
- **The haze was far too thick from the air**, most of all toward the Sun. Earth's haze:
  scattering halved and a little less forward, standing higher (scale height 4 km for
  2.2), so that on the canyon's rim the air is nearly what it was. Check `ledge` and
  `dusk` after.
- **The land had no clear colour.** The satellite picture's vegetation is dark and
  brownish (its mean over each land-cover class was measured: forest 30/46/13, grassland
  103/90/59 of 255). In the painted look the tile worker now draws each pixel 60 % of the
  way to a clean colour of its class (`pictures.colour.cover.paint`, `colours`): forests
  green, grassland gold-olive, crops, wetland; deserts, snow, towns and water keep the
  satellite's. Only the ring near the traveller is painted (the globe from far keeps
  the satellite's face).
- **Nothing between the 600 m map and the trees.** The ground shader lays stretches of
  lighter and darker ground some hundreds of metres across, with clean edges (two looks
  at the detail texture's slow channel, placed by direction so they have no seam), and
  out to 900 m the ground wears the colour of the grass that is drawn blade by blade
  near the traveller (`uGrassTone`), so the field does not end at the last blade.
- The pools themselves were right (low ground a metre over the sea with water in its
  hollows: tidal flats); what made them ugly was the bare brown round them.

## The owner's Earth screenshot (build 18c4a23)

One picture, no benchmark: `18 fps · 0.96 MP · Smooth`, the figure hovering over a
smooth sea to the horizon, a clear twilight sky, nothing else. So: the fewest pixels the
governor allows, every saving switched on (the cloud layer is step 15 of 22 and it was
gone), and still a third of the frame rate. Where on Earth it was taken is not known (a
calm sea at dawn: at the scene's date that is the Pacific west of California).

**What was found** (headless, `scripts/play-profile.mjs`, a new script: the real game in
play mode at a place, the page's work by part, the governor's level, patches built):

- At the governor's floor Earth's sea costs no more per frame in the software renderer
  than Mars' ledge does (1.7 s against 2.2 s a frame at the same size). The picture is
  not what is three times too slow.
- **Arriving at a place on Earth built about 600 patches for the 85 drawn.** A place's
  three elevation rings arrive one after another (and one or two again, see TileRings),
  and after each of them every loaded patch the ring touched was built again: the same
  ground up to five times, and five times as many patches as are on screen (430 are
  loaded). Each came to the GPU in a frame of its own, and on the phone a frame that
  takes in ground is the frame that comes late (third and fourth results). With ground
  arriving in every frame the governor has nothing to compare ("frames without new
  terrain") and takes it for slow pixels: resolution to the floor, then every saving,
  curing nothing. The way back was one saving every three or four seconds.
- **The view itself was true, and dull.** The same place at full quality (30 N, 140 W,
  the scene's date): dawn over the open Pacific in the calm of the horse latitudes, wind
  1 m/s, a clear sky. With that wind the wave table gave a sheet of glass to the horizon.

**What was done**

- Stale ground is built again **once**, when no elevation is on its way any more (ten
  seconds at most), and **only what is drawn**, with the parents the drawn patches lean
  on; the rest stays stale until it is drawn. It goes to the GPU **in bursts**, up to
  sixteen patches twice a second. After a jump, fine ground waits up to five seconds
  for elevation (as at the start). Here: 600 builds became about 450 with the wait not
  working (a second a frame); on the phone the 280 of the first descent should mostly
  wait too.
- The governor: the cloud layer is never switched off (step `clouds` now takes its
  shadows on the ground), rain thins to 40 % instead of stopping, savings come back
  three at a time (from the floor: all off again in 21 s in the simulation, was 75 s).
  Two new cases in `npm run govsim`.
- The open sea is never flat: `waveScale` has a floor (0.3, a low swell), since waves
  raised far away keep rolling through a calm. Lakes and rivers take an eighth of it.
- **Instruments**, because the cause above is inferred, not measured: the one-line
  read-out says how many savings are on and `maps` while ground is being built again;
  the full read-out has the page's own work by part (`perf/profile.js`); the benchmark
  prints the largest parts at every stop, and after its lap runs a **cost test**: at
  the first world's opening view and at the world's `scene.costViews` (Earth: in the
  hurricane, in the forest), with the picture held at 2.07 MP, each saving is switched
  on alone and frames are timed from their start until the GPU has drawn them (reading
  one pixel back waits for it). A frame's length on a phone is a whole number of
  refreshes; this is the first measure of the GPU's time that is not.

**If the next benchmark still shows Earth slow**: the cost test says which effect; the
parts say which work. Candidates not yet ruled out, none visible headless: the cloud
volume's switch to its own small picture and back in the middle of the frame (a tile
GPU stores and reloads the whole HDR picture and its depth for that), the scene's depth
kept as a texture, heat from the workers.

## The owner's fourth phone results (build fa0c4c9, after milestones 6 to 9)

Smooth: 54.4 fps (was 49.1), 1 % low 15.1, late frames 7.91 % (was 12.92 %). Sharp: 29.2
fps, 3.60 % late.

- **The stutter of the third results is cured**: frames that took in new ground were
  late 10.5 % of the time, the rest 7.0 %: arriving terrain no longer decides whether a
  frame is late (it was every such frame before the ground was drawn from texture
  arrays). The page's own work is 4.8 ms a frame.
- **What is left is pixels.** A frame lasts 2 screen refreshes or 4, almost never 3: the
  phone shows 60 or 30, nothing between, so a picture slightly too sharp costs half the
  frame rate. Mars holds 60 fps at 1.2 to 2.0 megapixels (the ship view least), the Moon
  at 3.3 to 4.45.
- **The governor lost 15 seconds at the Mars ledge** (48.8 % late there): 6 s before it
  acted, then terrain let in more slowly twice and fewer patches twice (the wrong levers:
  the work per frame was 5.6 ms), then eight single resolution steps. Sharp did the same
  at the Mars ship view (39.6 % late).

Changes: terrain levers only when frames without new ground are seen to be on time while
those with it are late; with most frames late the resolution comes down in strides (up
to four steps at once); each world's held resolution is remembered per mode in the
browser and a return starts from it; a world never seen starts Smooth five steps down
(53 % of the pixels) and climbs. `govsim` has the phone-on-Mars case (must settle within
4 s on resolution alone). An **Earth benchmark** button runs the same route from Earth.

Not done, and why: Mars at 60 fps is a soft picture (1.2 to 2 MP of 4.45). The cure is a
cheaper Mars pixel (its haze, its shadows), which needs each feature's cost measured on
the phone; the owner asked for Earth first.

## Milestone 10 plan: a living Earth

**The foundation changes.** Earth was five sites at 90 to 190 m on a globe at 28 km a
pixel, with one colour map at 10 km. Rivers, coasts and forests need the real planet
everywhere, and that is far too much to ship in the page. So Earth streams, from public
services that need no key and cost nothing (both answer any web page, checked):

- **Elevation**: the Terrain Tiles on AWS Open Data (`s3.amazonaws.com/elevation-tiles-prod`,
  the set the five sites were cut from; land and sea floor).
- **Colour, land cover, canopy height, water, rain, clouds, lightning**: NASA GIBS
  (`gibs.earthdata.nasa.gov`): Blue Marble Next Generation by month, MODIS land cover
  types (IGBP, 500 m), GEDI canopy height, the land-water map, IMERG rain, MODIS cloud
  top height and thickness, the LIS lightning climatology.

Design (generic: a world file lists `tiles`; nothing in the engine says "earth"):

- **Rings.** Three square mosaics of elevation tiles round the traveller, at 30 m, 300 m
  and 2.4 km a pixel (about 30, 300 and 2 400 km wide), made in a worker of their own and
  handed to the height code as ordinary rasters with feathered edges. The bundled globe
  stays underneath (and is all there is at the poles, without a connection, and in Node).
  A ring moves when the traveller nears its edge; ground built from older data is rebuilt
  in place, nearest first.
- **Colour and cover** ride the same rings as textures the ground shader reads by
  longitude and latitude.
- **Tests**: the headless browser cannot reach the services; the test server mirrors them
  from a cache on disk filled with curl (`?ext=` in the page's address).
- **Cost**: fetching and decoding happen off the main thread; the governor's patch and
  pace levers already cover arriving ground. Each new effect gets its own step.

Stages, each merged with a line to the owner:

1. **The whole Earth, and the sea**: the rings; the sea with real coasts, waves that
   follow the wind, colour by depth, foam on the shore; the traveller floats and swims
   instead of standing on water.
2. **Lakes and rivers**: water runs where the land's shape sends it (drainage worked
   out from the elevation in the tile worker, sized by the area upstream and the place's
   real rainfall), lakes where the land holds it.
3. **Forests**: where forest is and of what kind from MODIS land cover, how tall from
   GEDI; the trees of each region from a table of what grows there (ponderosa and pinyon
   on the Grand Canyon's rim, larch and stone pine under the Matterhorn, camel thorn in
   the Namib); trees near the traveller, canopy beyond; wind in them, leaves that fall
   and lie; the seasons by the date.
4. **Clouds to fly through**: a volume drawn at reduced resolution and laid over the
   picture by depth, shaped by a real day's cloud cover, top height and thickness.
5. **Weather**: that day's real rain; snow where it is cold; lightning where storms are
   deep, thunder late by the distance; wind from the pressure systems that pushes
   flight, cloth and trees; a hurricane with an eye; rainbows; fog.

Risks: the phone is already short of pixels on Mars at 60 fps and Earth adds more to
every pixel: an Earth benchmark after each stage decides what stays on in Smooth. The
services can be slow or away: everything must degrade to the bundled globe. Rivers from
drainage are the hardest part to get right at the seams between rings.

## Milestone 10, stages 1 and 2: what was built

- **Earth streams**: three elevation rings (2.4 km, 300 m, 30 m a pixel) and a colour
  ring (600 m) round the traveller, from AWS Terrain Tiles and NASA GIBS, through a tile
  worker; ground built from older data is rebuilt in place. The Grand Canyon from Mather
  Point is now the real canyon at 30 m (buttes, side canyons), and so is everywhere else
  on Earth between 85 degrees north and south. Settles in about 100 s in the test
  browser at a small picture size (the bundled-only Earth took about as long).
- **The sea**: the map decides the shore; coastal water gets a bed; depth gives the
  colour (pale shallows to blue); sixteen wind waves, the eight longest lifting the
  surface near the traveller; the Sun's glint follows the waves; foam at the waterline.
  Seen: open sea off Hawaii's Big Island with Mauna Kea on the horizon; the Kohala shore.
- **Standing in water**: the figure sinks to 1.25 m and rides the waves, wades and swims
  slowly, raises no dust; rocks do not stand in water.
- **Rivers and lakes** from the land's shape and the real rainfall (see ARCHITECTURE,
  "Water"). Checked at the Grand Canyon: the Colorado comes in from Lake Powell's side
  with 594 m3/s, runs the inner gorge at 740 m (Phantom Ranch is at 740 m) carrying
  635 m3/s, 139 m wide; a side creek runs down to it. The real river carries about 500.
- Governor: step `waves`. The terrain shader reads 15 of a phone's 16 textures.
- **Not done**: a swimming stroke (the figure treads water upright); water seen from
  below; flow direction in the look of a river; waterfalls; lakes are untested by eye;
  land below sea level (Death Valley, the Dutch polders) is flooded; rivers do not line
  up across the edge between two rings; a river's colour is the sea's.

## Milestone 10, stages 3 to 5: what was built

- **Forests** (ARCHITECTURE, "Trees and leaves"): where forest is, of what kind and how
  tall from NASA's land-cover and canopy-height tiles; the species from a table of each
  region's own trees. Seen: pinyon and juniper on the Grand Canyon's South Rim (1 500
  trees round Mather Point, with ponderosa and aspen); spruce, ponderosa and aspen on the
  Kaibab Plateau; 3 761 red oak, sugar maple and beech in a Vermont wood in October, red
  and gold, their leaves on the ground and in the air. Beyond 240 m the forest is raised
  as a whole by the ground shader; from the air it is a green canopy over the hills.
- **Clouds with depth** (ARCHITECTURE, "Clouds with depth"): a volume to 45 km, marched
  at a third of the view and laid over the picture by depth; the old shell beyond.
- **Weather** (ARCHITECTURE, "Weather"): Earth has the weather of 8 September 2017, from
  NASA's maps of that day: hurricanes Irma, Jose and Katia stand in the Atlantic (they
  are in the cloud map the globe wears from space, in the rain map and in the wind, which
  circles each of them); rain and snow fall under the cloud, the ground gets wet and
  shines, the cloud overhead dims the Sun and the sky, lightning strikes where the rain
  is hard under deep cloud and its thunder comes late by the distance. The three
  hurricanes are places in the target list and the journal.
- Governor steps added: `rain`, `leaves`, `tree-shadows`, `trees-far`, `waves`,
  `cloud-steps`, `cloud-volume` (22 in all).
- **Not done, or weak**: a tree is a few lumps on a stick up close; no undergrowth or
  grass blades; the far forest turns with the season in patches without knowing which
  trees are evergreen; clouds are grainy at the small picture size and have no memory
  between frames (no temporal smoothing); rain does not show as shafts from afar; snow
  does not lie; the weather does not move or change with the clock (one day, standing
  still); no fog, rainbow, tornado or aurora; the wind only carries a hovering figure.
  None of it has been measured on the phone.

## Milestone 10 review (before the checkpoint)

One workflow: four reviewers (tiles and water; trees and the ground shader; clouds and
weather; the app, the rig and the governor) read everything since 7933ddf; a second
reviewer tried to disprove each finding, running the code in Node where it could. 30
findings, all taken as real and fixed:

- **Tiles and water**: a lake's level was spread over ground far below its outlet (water
  standing in the air); a river crossed dry pits on a causeway of its own level (a river
  now fills the pits it runs through, and banks are never raised); lake shores had steps
  of up to 50 m (the layers now fade toward a lake's edge as toward the sea's); rivers
  moved between ring positions while the ground kept the old ones (ground with water in
  it is always built again); a tile whose body stalled held its mosaic for ever; the
  world left behind kept its mosaics in its height source; two curls wrote one file in
  the test mirror.
- **Trees and water**: leaf-dropping species with the gold flag turned inside out in
  winter; the season froze above 1 500 m and jumped on the way down; the tree lattice
  did not meet itself at longitude 0; "tall canopy is forest" was applied to different
  heights in two places (how closed a canopy is now comes with the map, once); every
  tree vanished whenever a map moved (they now stay until their block's new ones
  arrive); a swimmer on a lake rode the sea's waves (the drawn ones are an eighth as
  high); the CPU's wave sum and the shader's weighted the wind differently; the clock
  the waves share wrapped every hour.
- **Clouds and weather**: cloud noise and rain were moved by the wind's speed times all
  the time passed (they slid about with every gust); the cloud's haze was read from the
  wrong part of the screen; rain, lightning and the rainbow were painted over by the
  cloud laid after them; the thickest cloud let a hundredth of the Sun's disc through;
  strokes and thunder went on in orbit; things near the camera and the ground under them
  used two laws for the same cloud's shade; the small picture's target was made anew at
  every resolution step.
- **App**: the lander and the rocks stayed on the ground of the maps that were there when
  they were placed; the sink of the last sea stayed on the next world; the camera could go
  under the water it draws only from above; a step up of resolution still on trial was
  remembered; pictures were not still on a world with weather; the walker dropped half a
  metre at every waterline.

The second reviewer of "tiles and water" found three of those fixes had moved the fault
rather than cured it, and following them up found two larger ones. What was done after:

- **Lake shores and river banks** (the reviewer's patch, checked in Node on 11.7 million
  sample pairs): a lake's level is read from the four cells round a place and eases out
  over half a cell (`DemSet.lakeS`), a lake has one level, the layers' fade toward a
  lake is continuous in place as well as in height, and a river's bank is blended whichever
  way the ground lies. A finer mosaic worked out before the coarser one's rivers were
  known is asked for again, once (`TileRings`).
- **Lakes were being made by the flood, and the real ones were not drawn.** The test that
  kept level stretches (`lower < 0.12 * rim`) could not pass: the rim was counted among
  cells that are level by definition, so every real lake was dropped (0 < 0), and the only
  "lakes" were filled pits: a sea of 71 000 km2 over Nevada, 66 000 km2 over Utah, the
  Snake River Plain, a lake on the Little Colorado. Measured on fourteen lakes at three
  zooms: every real lake is a level stretch in this elevation set, none has a bed in it.
  The rule is now the one in ARCHITECTURE ("Rivers and lakes"): level stretches in a
  hollow that can be kept full, the large ones checked against NASA's water map; pits
  only as ponds. Checked against the real sizes (km2, found / real): Great Salt Lake
  4 674 / 2 300 to 4 400, Champlain 929 / 1 269, Tahoe 460 / 490, Pyramid 468 / 487,
  Titicaca 7 089 / 8 370, Superior 67 617 / 82 100, Michigan 50 771 / 58 000, Huron
  51 510 / 59 600, Erie 23 380 / 25 700, Ontario 15 889 / 19 000, Victoria 53 199 /
  68 800, Tanganyika 24 446 / 32 900, Turkana 5 570 / 6 400; the Tisza's plain, the Po
  plain, Tulare's dry bed, Carson Sink, Black Rock Desert and the Snake River Plain are
  land.
- **Rivers lie on their ground**: a river's level is the one nearest the ground along its
  way that never rises (it stood on the filled level as on a causeway; held to the
  lowest ground so far it ran on in a trench after every pit). Along the Colorado on the
  finest ring: within 4 m under and 1.4 m over the ground for nine tenths of its length.
- **A lake's bed can lie under sea level** (Champlain's deep is in the map, and its dug
  bed went to -32 m: both were drawn as pits of sea in the lake). Bad cells in the
  elevation are mended: a mosaic over Vermont had a cell at 7 964 m beside one at
  -2 496 m, Lake Winnipesaukee one at -1 926 m.
- **A check that can fail**: `npm run lakes` (no browser, 15 s) finds thirteen real lakes
  within a factor of their real area, seven places that must be land, no region drowned,
  no step in the drawn surface at any water's edge, rivers within 6 m of their ground on
  the finest ring. Its step test was shown to fail by breaking a fix on purpose.
- **The gully layer cut 100 m gullies into real mountainsides**: made for the coarse
  bundled map, it ran at full strength over the 27 m elevation too. It now adds only
  what the map under the place cannot show (`belowDem` on `ridged`), as the roughness
  layer already did. Mountains near the traveller are the real ones.

## Milestone 6 plan: the new worlds

The owner's word: "finish up the rest of the milestones". No stop after every two worlds;
each stage is merged and the owner gets a short message.

**Sources** (all on the USGS planetary map server, public domain, which the cloud machine
may reach; the bucket behind it lists itself, see `scripts/fetch-worlds.py`):
elevation for Phobos (HRSC), Mercury (MESSENGER, 665 m), Venus (Magellan, 4.6 km),
Enceladus (Cassini shape model), Pluto and Charon (New Horizons, 300 m, the sunlit
hemisphere), Ceres (Dawn, 60 px/deg); image mosaics for all of those and for Deimos, Io,
Europa, Ganymede, Callisto, Mimas, Tethys, Dione, Rhea, Iapetus, Titan (ISS, through the
haze), Triton; whole-disc maps of Jupiter, Saturn and Neptune. Where no elevation exists
(Deimos, Io, Europa, Titan, Triton) the shape of the ground comes from terrain recipes
written for what the place is known to look like, under the real image map.
**Orbits and spin**: fitted to JPL Horizons and checked against it by a script that
fails beyond a tolerance (`scripts/fit-orbits.py`, `scripts/check-ephemeris.mjs`); the
owner allowed the Horizons server for this.

**Engine work first** (generic, no world-specific code):
1. A world's data loads when you come near it or aim a trip at it, not at start-up, and
   only the last few worlds stay in memory.
2. Every body of the catalogue is in every sky (a point, then a disc, then a globe).
3. Sky globes from one colour map (the moons you cannot land on, the gas giants), a globe
   whose bands drift at their own speeds (Jupiter, Saturn, Neptune), rings with their
   shadow on the planet and the planet's shadow on them (Saturn).
4. Thick air: Venus and Titan (the Sun is not a disc from the ground; the light is the
   sky's). Thin air: Triton, Pluto.
5. Small bodies: Phobos and Deimos are tens of kilometres across with almost no gravity;
   walking, jumping and the speed law have to stay sane there.
6. Terrain recipes for what elevation data cannot give: grooves (Phobos), lava plains and
   calderas (Io), ridged ice (Europa), tiger stripes (Enceladus), dune seas (Titan),
   cantaloupe ground (Triton), nitrogen ice plains with polygons (Pluto).

**Order**: engine items 1 and 2 with Phobos and Deimos (they are already in the sky);
Mercury; Jupiter with Io and Europa; Saturn, rings, Enceladus and Titan; Venus; Neptune
and Triton; Pluto and Charon; Ceres. Each world: data file, start site at a real place
and a real date, five views, two or three landmarks, a place list for the target picker,
screenshots judged against spacecraft pictures.

## Milestone 6: what was built

Twelve new worlds to land on, as data files: **Phobos, Deimos, Mercury, Venus, Io,
Europa, Enceladus, Titan, Triton, Pluto, Charon, Ceres**. With Mars and the Moon that is
fourteen (Earth's surface is milestone 9). Every other planet and large moon is in the
sky at its true place: Jupiter (the Cassini map, its belts drifting), Saturn with rings,
Uranus, Neptune, Ganymede, Callisto, Mimas, Tethys, Dione, Rhea, Iapetus.

- **Where the shape of the ground comes from.** Real elevation: Phobos (HRSC), Mercury
  (MESSENGER), Venus (Magellan), Enceladus (the Cassini shape model), Pluto and Charon
  (New Horizons, the hemisphere it saw), Ceres (Dawn). From the picture itself: Io's lava
  floors are cut where the colour mosaic shows dark lava, and its named mountains stand
  at their mapped places and heights; Titan's sand seas lie low where the near-infrared
  mosaic is dark (a stand-in: no elevation of Titan is on the map server). From recipes
  for what the place is known to look like: Deimos (its measured ellipsoid), Europa
  (double ridges, chaos at the named chaos regions), Triton (cantaloupe terrain, sulci).
- **Every world wears its real image map** as the colour of its ground and as its globe
  seen from afar. Brightness-only mosaics were coloured by brightness (Europa, Pluto,
  Titan, Callisto, Ceres, Enceladus); ground no spacecraft saw (Pluto's and Charon's
  south, Triton's north) is filled with the mean of what was seen, with no feature
  invented. A 180-degree mix-up in half the sources (the projection's centre longitude)
  was caught by checking landmarks: Ceres' bright spot, Rachmaninoff's floor, Sputnik
  Planitia, the leading and trailing sides of the icy moons.
- **Orbits and spin** of 21 bodies fitted to JPL Horizons and checked against it
  (`scripts/check-ephemeris.mjs`): planets within 0.02 to 0.15 degrees over 1950-2100,
  moons within 0.2 (Mimas 1.1 with its resonance swing). The Moon (3.5 degrees at worst)
  and Phobos after 2030 are the weak ones: mean ellipses cannot follow them (known
  problem below).
- **Thick air worked with the existing model**: Titan's orange smog and Venus' yellow
  overcast are the same atmosphere code with their own numbers; the Sun is lost in both.
- **Ice has a sheen** (`surface.gloss`); **rings** with shadows both ways; a **start
  screen list** to open on any world; the target list sorted nearest first.
- Tools made on the way: `scripts/peek.mjs` (a CPU sketch of the view from a place in
  seconds, for choosing sites and times of day without a five-minute headless picture),
  `scripts/worlds-test.mjs` (`npm run worlds`).

Decisions:

- No stop after every two worlds (the owner asked for the rest of the milestones in one
  go).
- Saturn, Uranus and Neptune are drawn from colour lists, not pictures: the whole-planet
  pictures on the map server are not free to pass on (docs/ASSETS.md, "Not used").
- On foot gravity never counts for less than 1 m/s2: at Phobos' real gravity a jump
  lasts twenty minutes.
- The camera's "up" stays the direction from the body's centre, so on Phobos and Deimos
  the horizon slants like a hillside. Making "up" follow the local ground was left out:
  it touches the whole flight model.

## Milestones 7 and 8: what was built

**Getting around (7).** The clock can run faster, slower and backwards (thirteen speeds
from ten days a second backwards to ten days a second forwards; `.` `,` `/`), stop, jump
to today or to any date from 1950 to 2099 (the years the orbits are fitted for). A map of
the solar system as it is at the game's date (`src/ui/map.js`, a 2-D canvas): orbits,
every body, the traveller; drag, pinch, tap a body, then Set target or GO; "Look closer"
shows a planet's moons. GO trips reach anywhere in under half a minute (Pluto from Mars:
27 s); at those speeds streaks of light rush past (`src/fx/warp.js`). A menu (MENU, Tab)
holds everything that is not flown with the stick.

**Things to do (8).** A journal of 88 real places on the fourteen worlds: a place is
found by going there (a chime, its name and one line about it), and the journal counts
them. The browser remembers the places found, where the traveller last stood on each
world (Play returns there) and the sound switch (`src/core/save.js`, localStorage only).
Photo mode: everything but the picture is put away, time stands still, wider / closer /
earlier / later, and the shutter draws one frame at the screen's full resolution and
saves it (a phone's share sheet, or a download). Sound, all made in code
(`src/audio/audio.js`): the suit's hum, wind where there is air (by the air's density:
loud on Titan and Venus, a whisper on Mars, none on the Moon), the rush of flight,
footsteps and landings, a shimmer at warp speed, the chime.

Behaviour changes the player will notice: the row of touch buttons is HERO, TARGET,
HOVER, ZOOM, MAP, MENU; CAM, VIEW, HUD, MODE and FULL moved into MENU. Play returns to
where the traveller last stood on that world ("To the start" in the menu goes back to
the opening place).

## Milestone 9 plan: Earth's surface

The riskiest part, because everyone knows what Earth looks like: bare ground where a
forest or a city should be is wrong in a way bare ground on Mars is not. The plan avoids
that instead of pretending to solve it.

1. **Open on places that are bare in reality**, where real elevation and real colour
   are the whole truth: the Grand Canyon's rim, Everest and the Khumbu, the summit of
   Mauna Kea, the dunes of the Namib, the Matterhorn above the tree line. Elevation for
   these at 90 to 190 m per pixel and for the globe is already made
   (`scripts/fetch-earth-terrain.py`, from the open Terrain Tiles set: SRTM and others).
2. **Colour from Blue Marble** (the same map the globe uses): deserts, ice, the green of
   forests seen from the air. Snow by height and latitude on top.
3. **The sea**: the ground below sea level is drawn as water: flat, dark, with the
   Sun's glint and the sky's colour at a grazing view, a little paler in the shallows.
   A generic `sea` feature (Titan's methane seas can use it).
4. **Air**: Earth's own numbers in the existing atmosphere model (blue sky, red
   sunsets, the ozone's blue hour).
5. **Clouds**: the real day's cloud map as a layer 4 km up, seen from below and from
   above, with its shadow on the ground; broken up with finer procedural detail because
   the map's cells are 10 km wide. One governor step.
6. **From orbit down**: the hand-over from the globe to the terrain must not show (the
   same colour map on both).
7. What is not attempted: trees, grass, buildings, rivers, waves, weather that moves.
   Flying low over a forest shows green ground. This is said plainly in the checkpoint.

## Milestone 9: what was built

Earth is a world to land on, built on the plan above.

- Elevation from the open Terrain Tiles set (SRTM and others): the globe, and the Grand
  Canyon, Everest, Hawaii's Big Island, the Namib sand sea and the Matterhorn at 90 to
  190 m per pixel. Checked against known heights: Mather Point 2 051 m (real 2 170),
  Kala Patthar 5 595 m (real 5 644), Everest 8 737 m in the data (real 8 849).
- Colour from Blue Marble (the globe's own day map) relative to the land's mean; steep
  rock takes a third of it, so cliffs under snow are rock.
- The sea (flat, dark, the Sun's glint, the sky mirrored), Earth's air (Rayleigh, a
  light haze, ozone), a cloud layer from the real day's cloud map with its shadow on the
  ground, a governor step for the clouds.
- It opens at Mather Point on the Grand Canyon's South Rim on the June solstice, an hour
  and a half after sunrise; other views: Everest from Kala Patthar, the summit of Mauna
  Kea above the clouds, the dunes of Sossusvlei, the Matterhorn from the Gornergrat.
- Not attempted, as planned: trees, grass, buildings, rivers, lakes above sea level,
  waves, weather that moves. Low ground that lies below sea level (Death Valley, the
  Dead Sea) is drawn as sea. The player can stand on the water.

## Milestones 6 to 9 review (before the checkpoint)

One workflow: four reviewers (sky, terrain drawing, height code, the app and its new
screens) read everything changed since build 27e1973; a second reviewer tried to
disprove each finding, by running the code where it could. 25 findings, all upheld, all
fixed:

- **Sky**: the world just left collapsed to a point of light at a hand-over (its globe's
  maps were never fetched while it was home: now the small copies always, the full ones
  once the traveller climbs); the home air dimmed and reddened the Moon and planets by
  their declination instead of their height in the sky (`uUp` was never set); a moon
  crossing in front of its planet was drawn behind it (far-pass slots `20 + 3k`: now
  each body's slot lies behind the whole of the one before it, rings included, and all
  are scaled to end by 45; the far pass's near plane is 0.002); rings and their edge-on
  line ignored the home air and (the line) the planet's shadow; ring textures had no mip
  maps; full maps were never let go (now freed when a body is small again, the small
  copy kept); Saturn pulled 5.8 times too hard (its ring radius stood in for its own).
- **Height code**: every value written to `c.slope` by `massifs`, `lineaments` and the
  craters' flat floors is continuous now; `cells` keeps each centre in the middle 0.4 of
  its cell, so the 27 cells searched always hold the two nearest (walls up to 149 m ran
  along lattice planes on Triton and Europa); a `where.at` place wider than 26 degrees
  ended in a wall; a `lat` limit of 0 or 90 is open and fades are in degrees (the tiger
  stripes were at two thirds strength at the start site, the dunes at half on the
  equator); Enceladus' large craters were on the equator, not in the north; Io's shadow
  rays stopped at 1 200 m under 17 km mountains (the mountain blocks now report their
  height to `ceilingAt`). `scratch` check: no jump above the local slope along lines
  through each of the reported places.
- **Terrain drawing**: rocks stood on the sea on a page that started on Earth.
- **App**: the benchmark's flight handed over to Phobos on the way to the Moon (it now
  hands over to its destination only, and fetches it at the start); most places on
  Phobos and Deimos were "found" from the start site (reach now at most a fifth of the
  radius); sound kept running on a hidden page or switched off (the audio engine is now
  suspended); photo mode: a hidden stick took touches and the target marker came back;
  one failed download counted as hundreds; the menu was rebuilt 5 times a second and
  lost clicks (only its clock line is updated now); the mouse stayed captured under the
  menu, map and journal; a date typed on a keyboard was cut off after its first part.

Behaviour changes for the player: the ground changed a little on Io's mountains,
Europa's chaos, Triton's cantaloupe ground, Pluto's ice plain, Venus' tessera, Titan's
dune belt and round Enceladus' south pole (stronger stripes); Saturn's pull is weaker;
places on the two small moons must be gone to.

## Milestone 5 plan: Earth and the Sun from space

1. **Earth as a real globe** (not landable; you stop 2 % of its radius up). NASA maps
   through the GIBS service: Blue Marble Next Generation for the day side, Black Marble
   2016 for city lights, a VIIRS true-colour mosaic of one real day (2016-09-22) for the
   clouds, the MODIS water mask for the oceans' glint. A small copy is always loaded (the
   Earth of the Moon's sky); the full maps load when Earth grows large in view.
   A generic body recipe (`globe`), numbers in `solarSystem.js`.
2. **Its air**: blue haze over the day side that thickens toward the edge, a red
   day-night line, and a thin bright blue line beyond the solid edge (a shell).
3. **Sun-glint** on the oceans, clouds over everything, **city lights** on the night side
   when the exposure allows.
4. **Bright bodies in a dark scene keep their colour** (Earth was a white blob from the
   lunar night, Deimos burnt out at dusk).
5. **Eclipses**: a body in front of the Sun dims the sunlight by the share of the disc
   it covers.
6. **Light from the world below** on things in orbit (the figure was near black over
   sunlit Mars).
7. **The Sun up close**: a surface with grain and darker edge, a faint outer glow.
8. Earth among the targets; GO to Earth; reference pictures; tests; the milestone's
   independent review (the one workflow); checkpoint with a request for a benchmark.

Status: all eight built; checkpoint sent ("Milestone 5: what was built" below).

## Milestone 5: what was built, tested and found

**Built.** Earth is a real globe (`surface.recipe: 'globe'` in `solarSystem.js`, shader in
`sky/bodies.js`): NASA's Blue Marble for the day side, the clouds of 22 September 2016
(shaded on their far side, with a shadow on the sea beside each), the Sun's glint on the
water, air that hazes the edge and reddens the day-night line, a thin bright rim of air
beyond the solid edge, city lights on the night side. Small copies of the four maps
(about 100 kB together) are always loaded; the full ones (2.9 MB) load when Earth is more
than 260 pixels across. From the Moon it is a small blue-and-white Earth with its real
phase; up close it fills the sky. It cannot be landed on (you stop 2 % of its radius up
and stay beside it). The Sun is drawn where it is from the camera and grows as it is
approached; large in view it is seen as through a dark filter, with a darker, warmer
edge and a few spots. A body that hides part of the Sun dims the sunlight on the ground
round the camera. The figure in orbit is lit from below by the world's day side. A body
far brighter than the scene is exposed for keeps its colours (Earth in the lunar night),
and a globe that fills the view is held just under white whatever the exposure meter
does.

**Tests** (final build): `smoke` (23 shaders, the terrain still the fullest at 15 of 16
textures; the globe uses 5), `foot`, `target`, `flight` pass; the governor simulation
passes with four new cases, two of which fail the run if they regress.

**Independent critic** (pictures only). Its five gaps and what was done:
1. *Earth dull and grey up close* (the exposure meter aims at a middle grey): a globe
   large in view is now brought up to just under white; richer sea colour, more haze.
2. *The Sun a plaster ball*: redone as an even glowing disc with a strong warm edge, a
   grain too fine to see until very near, small dark spots in two belts.
3. *Clouds a flat sticker*: shading on each cloud's far side and its shadow on the sea,
   a softer ramp from thin to thick. Still soft low down (the map is 10 km a pixel).
4. *City lights*: they blazed on the dark edge of an Earth exposed for its day side:
   now dimmed with the day side, so only the night side seen on its own shows them;
   finer map (4096), warmer, a wide range from sprawl to cores.
5. *Glint and day-night line*: a tighter, brighter glint, only on water and under cloud
   shadows; clouds turn warm toward the line.
Not done: Phobos a pale featureless lump and Deimos a speck (they become worlds in
milestone 6), a hard sunlit rim on the figure in orbit, faint banding in the dusk sky.

**Code review** (three lines of review, each finding checked by a second reviewer): 27
findings, 26 upheld. Fixed: the new governor logic could stop lowering resolution for
good when the page's own work passed 0.6 of the frame while the GPU was what was late
(now judged on the late frames, at 0.9 of the interval, and it falls through to
resolution); the patch lever hunted every 15 s (it backs off now) and did nothing in
Smooth (the mode's share now multiplies); Sharp did not get its patches back; an eclipse
seen from the camera darkened the whole world (hovering behind Phobos turned Mars
black: now only near the ground); the Sun's disc vanished when it filled the view from
the side; the exposure meter masked the Sun where it is from the home world; NaN risks
in the glint and in the light from below; a seam in the cloud map at the date line; a
map that fails to load stalled every screenshot; stars vanished over a third of the sky
far from home; the mode button before the world had loaded. Recorded, not fixed: the
full maps are decoded on the main thread when they arrive (a hitch of a frame or
two, once, hidden from the governor); close to the Sun the exposure has nothing to meter
and runs to its limit (the filter hides it).

## The owner's flight notes (after milestone 2)

"Fix the flying when you're going super fast and miss a planet; add gravity that pulls you
in if you're not actively flying away or choosing to hover; the Sun should have a much
stronger gravity."

Reproduced without a browser (`node scripts/flyby.mjs`): leave a Mars-sized world, aim
once at a Moon-sized world 2000 of its radii away, hold forward and boost, never touch
the view.

| | Before | After |
| --- | --- | --- |
| Aimed at the centre | never arrives: the aim slides off (up to 180°), closest pass 1283 radii, still wandering after 60 s | lands in about 13 s; the aim stays within 0.1° |
| Aimed 12 radii beside it | misses | lands (close misses are drawn in once the world is underfoot) |
| Aimed 60 radii beside it, stick held | passes in a blink | passes at 13 radii with the world sweeping at no more than about 45°/s |
| The same, stick released after the pass | stays where it stopped, 1980 radii out | gravity brings it down to the ground in about 45 s |

Causes found and fixed: the view's direction was tied to a horizon that turns as you move
away; pitch stopped one degree short of vertical; speed eased down more slowly than the
distance shrank on arrival, so the traveller shot past. Added: gravity when the stick is
released (HOVER switches it off), a limit on how fast the nearest body may sweep past, a
3 AU/s ceiling, and a stop just above the Sun's surface. A first version of gravity that
also acted while flying bent every aimed trip off its target and was dropped: gravity
acts when the pilot lets go.

## The owner's scale note (during milestone 3)

"It doesn't feel like I'm standing on a planet: make the planet feel giant, the mountains
and the canyons, give it depth, deep depths." Three causes found, three changes:

| Cause | Change |
| --- | --- |
| Flight speed was 0.85 × height above the ground per second at every height, so the ground streamed past alike at 10 m and at 10 km: the eye could not tell a 7 km cliff from a 7 m rock | Near the ground the speed is now 0.2 × height per second, rising smoothly to 0.85 between 3 and 60 km. Falling (stick released) keeps its old pace. Aimed trips still arrive (`flyby`: 13 → 19 s, the last kilometres gentler) |
| A 60° vertical field of view: about 100° across on a phone held sideways, which shrinks everything far away | 48° (about 85° across). Mountains and canyon walls fill more of the screen |
| The opening view looked along the canyon from a bench among low hills: neither wall nor the depth was in view | The opening view is now the lip of the north rim at 5 km, two hours before sunset, looking down across the 10 km deep canyon to the south wall 60 km away. The sunset view along the canyon stays as an extra place (`canyon`) |

## Mars ground at walking distance (helper, milestone 3)

The critic's "Mars is one colour everywhere", "tiger stripes", "Olympus wall like snow" and
"identical gem rocks". Causes: every material had the same red-to-green ratio, sand came
only by altitude; ripples covered all dust and broke along chunk edges (their phase was not
a whole number of cycles per detail tile); the Viking mosaic's sunlit caldera wall is three
times its mean and bluish white; every rock was the same 80-facet icosahedron. Changes:
ground cover of dust, dark grey-brown sand and bedrock driven by the map's darkness, darker
grey-brown rock and boulders (darker than the dust, as at Gale), ripples on sand only and
continuous across chunks, the map's range held near the ground, detail mapped onto steep
faces, rocks cut into blocks. Kept open: the Olympus wall is still pale (the exposure keys
on the ground there), the 5 m ledges have box-like edges, Mount Sharp's layers are faint.

## The owner's on-foot request (during milestone 3)

"I want to be able to walk on the ground, and super speed on the ground as well, with
gravity different by the size of the planet, so on the Moon I can jump much higher."
Built: the character stands, walks, runs at super speed (60 m/s), jumps and lands, with
walking, running, sprinting-lean, jumping and landing-crouch poses; gravity is each
world's real surface gravity (already in the world files), so the same jump goes 2.3
times higher and lasts 2.3 times longer on the Moon than on Mars. See "Character and
flight" for the rules. Rocks are not obstacles yet; any slope can be walked up.

## The owner's floating note (during milestone 3)

"I've played it and it looks like I'm floating on top of nothing", then a phone screenshot:
"there is no ground to stand on". The phone drew no ground at all: rocks and the character
over a brown void. **The cause**: the ground's shader read 17 textures and phones allow 16
(the test browser allows 32, so every headless picture had ground). It went over when the
slope map and its "data sharpness" map were added for the owner's space note. Fixed: the
sharpness map is now a list of numbers (exact instead of blurred), and the two sky-light
tables share one texture, so the shader reads 15. To stop it happening again: every
screenshot run and the smoke test check each shader against a phone's limits, and a shader
that fails on the device shows a message on screen and in the benchmark results.

Before the screenshot I looked for other reasons it could look like floating, and fixed
these as well:

| Cause | Change |
| --- | --- |
| The character cast no shadow at all, nor did the lander: when the rocks' shadows learned to draw only the nearest rocks into the fine shadow tile, every caster without instances (the character, the lander) was given an instance count of "none" and skipped | Only instanced casters have their count changed |
| The feet stood on the exact surface while the drawn ground under them is a coarser mesh: measured up to 6.5 m below the feet in the first seconds and still 0.5–2 m on slopes once detailed | The feet stand on the drawn triangles (morph included) wherever those are within 2 m of the true surface, and blend to the true surface between 2 and 6 m (so nobody walks on a first draft hundreds of metres off) |
| Ledge detection compared the ground under the feet with the ground a step ahead, and two different levels of detail could differ by metres: the character dropped into a fall on flat ground | It compares like with like (both drawn) |
| Play could be pressed while the ground under the start was still a first draft | Play (and the benchmarks) wait until the ground under the start is the detailed one, 20 s at most |
| Sky light reached the ground under the character as if nothing stood there | The figure's torso, legs and feet darken the sky light they hide from the ground (four spheres, within 6 m only) |

## The owner's space note (during milestone 3)

"Fix the textures up when I'm in outer space, things have no depth, the planet just looks
like a circle; fix it or find a way around it." Reproduced from 150 km to 12,000 km on both
worlds. Causes found, by measurement:

| Cause | Change |
| --- | --- |
| On the phone a pixel is 4–5 times smaller than in the test pictures, and the terrain's detail does not depend on screen size: from orbit every normal texel covered 5–15 pixels | From high up, patches split 2.2 times sooner (there is plenty of room under the 120-patch cap there) |
| Outside the six sharp patches the heights come from 15 km (Mars) and 7.6 km (Moon) per pixel data: every crater and canyon wall smaller than a few tens of kilometres was smooth | A slope map of each whole world from the 16 px/deg NASA elevation (5.2 km per texel on Mars, 2.7 km on the Moon) adds the real relief in that band, from far away only |
| Mars had no invented relief between 1 and 30 km: bumps of tens of metres where the real highlands are covered in craters | Craters 1–30 km across on Mars wherever the elevation map is coarser than that |
| Real slopes at those sizes are gentle (a few degrees) and barely shade at a mid-day Sun | The slope map's relief is drawn at twice its true strength from far away (a stylisation for a small screen, on the owner's "find a way around it") |
| Mars's surface model is tuned for grains underfoot: across a whole disc it kept the edge almost as bright as the centre | Far ground uses a smoother model, so the disc darkens toward its edge as real Mars does |
| Colour maps 2880 wide: blurrier than the phone's pixels from mid-orbit | 4096 wide (Mars 5.2 km, the Moon 2.7 km) |

Tried and rejected: holding the Viking mosaic's brightest parts at 1.7 times its mean (a
helper's suggestion to remove "white lines" along the canyon): those are the mosaic's
photographed sunlit walls, the best depth cue Mars has from orbit, and Mars looked flatter
without them. Lossy WebP for the slope maps: blocky canyon walls; colour JPEG: noisier than
two greyscale halves at the same size. Not changed, because it is true: a world with the Sun
behind the viewer looks flat (the full Moon); relief shows wherever the light comes from the side.

## Milestone 4 plan — character and flight feel

The owner accepted milestone 3 ("it's all good, continue"). Plan, in this order:

1. **Flight poses** from what the pilot asks for, not from raw speed (speeds run from 7 m/s
   to astronomical): hover (upright), cruise (stick pushed: one arm ahead, body tipped),
   fast flight (boost: streamlined, both arms ahead, legs together), banking (roll into the
   turn), climbing straight up (arm raised) and a feet-first slow descent near the ground.
2. **Take-off and landing**: a crouch that builds while up is held, then a spring with a
   ring of dust; the figure turns upright before touching down; a crouch scaled by the
   landing speed, a three-point landing for hard ones, dust on every landing.
3. **Target selector**: a marker on the chosen target (another body, the Sun, or one of
   this world's landmarks) with its name, distance and time to arrival from the real
   speed rule; an arrow at the screen's edge when it is behind. `TARGET` cycles.
4. **A boost for long transfers**: with a target chosen, `GO` flies there hands-off,
   faster than the manual boost in open space, slowing to arrive above the target; any
   stick input takes back control. Checked without a browser like `flyby`.
5. **Camera**: the figure leads turns and drifts back to the centre, the camera keeps it
   in sight over ridges on foot and low down, pulls back a little at super speed, and the
   telephoto does not fill the screen with the figure.
6. **Known problems marked 4**: the suit (visor, backpack, gloves, worn dust), darkening
   under the lander and rocks where the site is in shade, irregular dust puffs.
7. Reference set, independent critic, stability test, governor steps, checkpoint.

## Milestone 3 plan — make Mars and the Moon beautiful

Started straight after the owner's phone results and flight notes (above). Order: the
real maps first, because everything else is judged on top of them.

1. The Moon from real data: LOLA elevation for the whole globe, a sharper patch for one
   real site, Clementine brightness for maria and rays, procedural craters only below
   the pixel size of the map under the point. Move the lunar scene from the invented
   crater to a real place.
2. Mars in colour from the Viking mosaic, laid over the existing palette.
3. How regolith reflects: bright down-Sun, dark toward the Sun, for ground and rocks.
4. Both worlds from orbit: day side, terminator, night side. Fix what the maps expose.
5. More real places as bookmarks, each with its own patch of real elevation: Olympus
   Mons and Gale on Mars, Tycho and the Apollo 17 valley on the Moon.
6. Dust thrown up by the character at touch-down, take-off and when skimming.
7. Ground at walking distance; night exposure.
8. Reference set, stability test, flight and smoke tests, critic, governor step for the
   dust, docs, checkpoint.

## Milestone 2 plan — fix the known problems

The owner said "continue" at the milestone 1 checkpoint before any phone results; the
governor is tuned when they arrive. Order: small and safe first, recipe tuning last
(it moves the ground and needs the most screenshots).

1. Phobos and Deimos: an `aim=` screenshot parameter, telephoto shots, check position,
   size and phase.
2. Lunar chunk builds: profile the height recipe in Node, remove the hot spots.
3. Hand-over roll: carry the camera's roll across the switch and let it go as the new
   world gets close.
4. From space: exposure that does not blow out a sunlit globe, sky light that follows
   the local Sun (dark night side, no stripe), glow on the planet's edge.
5. Terrain popping: new chunks fade in from their parent's shape, normals and shadows.
6. Haze in terrain shadow: air below the shadow line gets no direct sunlight.
7. Far wall: dust numbers re-tuned once the shadowed haze is right.
8. Ledges: sharper benches at walking scale; re-pick bookmarks if the ground moves.
9. Character: bending limbs, cloak kept off the arms.
10. Reference set, stability test, critic, governor steps for anything new, checkpoint.

## Decisions in force (and why)

### Rendering and physics

- **Depth**: far pass → clear depth → near pass with a near plane that grows with
  altitude and front-to-back chunk order; the character gets its own depth slice when
  the terrain's near plane has moved past it.
- **Pre-exposure** everywhere, and exposure-scaled lookup tables, because half-float
  targets cannot span the solar disc and faint stars.
- **Circumsolar split**: at sunset most sunlight on Mars arrives as a forward-scattered
  aureole, not the direct beam. Treating the aureole (within ~28°) as directional light
  that terrain shadows can block keeps canyon shadows meaningful without inventing light.
- **Highlight-priority metering**: lit surfaces write alpha 1, sky/stars/Sun write 0, and
  exposure may not push the brightest lit region more than `exposure.highlight` (6) times
  over white. Consequence, consistent with art rule 2: while the sunlit character is in
  frame in space, stars and distant planets are not visible.
- **Exposure metering floor** (`scene.exposure.shadowFloor`) is a per-world number: 0.2
  on Mars, 0.6 on the Moon, where a black sky would otherwise over-expose the ground.
- **Chunk grid 40×40, normal map 120², shadow map 60², at most 180 patches drawn** (120
  until the owner dropped the fixed budgets on 2026-11-20; the governor's terrain steps
  lower it to 144 and 115). Whether the phone holds 180 is not measured yet.
- **No fixed budgets** (owner, 2026-11-20: "if they are limits set by me get rid of them,
  you are making the best game possible"). The 200 draw calls / 500,000 triangles / 300 MB
  limits are gone from the charter, the config and the HUD. What limits the picture now is
  the steady frame rate on the phone, which the governor keeps; pools stay fixed-size.
- **Mobile GPU care**: clears before full-screen passes, depth and unused colour
  invalidated, GL context loss reloads the page.

### Measurement and the governor (milestone 1)

- **The canvas is drawn pixel for pixel** (`devicePixelContentBox`), so "native" really
  is the panel's own pixels. A guard at 8.3 M pixels protects the memory budget on
  monitors above 4K only.
- **Both modes start at native resolution** (since the owner's first phone results; the
  first design started Smooth at half). Coming down is quick (under a second per step) and
  climbing is slow on purpose.
- **Lateness is judged against the target interval (×1.2), not against the measured
  refresh rate.** When every frame is slow the refresh rate cannot be measured (all
  callbacks are late), and a tolerance based on it excused 40 fps as "on time" in
  simulation. The refresh rate is measured at page load, before anything heavy runs.
- **Frames with terrain uploads count less.** A late frame that uploaded terrain is
  usually late because of the upload, which a lower resolution cannot fix. Such frames
  only trigger a step down when more than 60 % of all frames are late.
- **Hysteresis**: a step up that is taken back within 4 s doubles the wait before the
  next try (3 s → 60 s); each step up that holds halves it. In simulation a steady
  scene settles on one level and tries the next one about once a minute.
- **The benchmark drives the game through virtual keys** rather than a replayed camera
  path, so it measures the code a player runs (controls, hand-over between worlds,
  terrain streaming). Runs are therefore close to, but not exactly, repeatable.
- **HUD has three states** (one line / everything / off) and starts on the one line, so
  the picture is not covered by debug text on the phone. `?hud=1` still gives the full
  read-out.
- **`npm run stability` reports, it does not pass or fail.** Consecutive frames legally
  differ where the camera moved; the script marks one-frame outliers in red and a person
  (or Claude) looks at the strips.
- **The near shadow map's texel grid is anchored to the ground near the camera** and
  re-anchored only when the camera is more than two map radii away.

### From space, exposure and haze (milestone 2)

- **Subject-priority exposure** (`exposure.surface`, default 0.6): single pixels of the
  HDR scene are sampled on a 32×18 grid; where alpha says "lit surface" they give the
  share of the frame that is surface and the brightness of its bright parts (mean weighted
  by brightness, so a half-lit globe counts as its day side). Once surfaces cover more
  than 1–6 % of the frame, exposure may not push that brightness above `surface`. A small
  figure against the stars keeps the old, looser limit (`highlight`). Ground-level
  bookmarks sit at 0.17–0.24, far below the limit, and are unchanged.
- **Sky light follows the local Sun.** The irradiance map belongs to the camera's place.
  From high up every surface instead takes the sky-plus-bounce light of level ground at
  its own Sun height, from a table built once per world (milestone 3; in milestone 2 the
  camera's map was scaled by the ratio of that table to its value at the camera, which
  left the day side without any sky light whenever the camera hung over the night side).
  Below 3 km of altitude the table is not used at all (it fades in up to 30 km), so
  nothing changes on the ground and nothing is paid for there.
- **Edge glow from space is marched per pixel**, in the sky dome (rays that cross the
  shell) and on ground seen at a grazing angle (blend from froxels below a view cosine of
  0.38, fully marched below 0.22), and since milestone 3 everywhere the Sun is less than
  about 6° up: a froxel tile near the edge can hold rays that pass through sunlit air
  beyond it, and over the night side that light showed as bright square blocks. Screen-
  space froxels cannot follow the path length near the edge: it changes by a factor of
  two between neighbouring froxels. The sky-view LUT is
  used only while the camera is in the air and is cross-faded over the top tenth of the
  atmosphere.
- **Terrain shadow in the air** is a 64×64 map on the tangent plane around the camera
  (half-width 0.6 × the world's shadow range, growing with altitude) holding the altitude
  below which the Sun is hidden. One coarse height sample per step toward the Sun; about
  50–100 ms in a worker, redone when the camera has moved a sixth of the half-width or the
  Sun 0.4°. At the Mars bookmarks it changes little, and that is correct: the Sun shines
  along the canyon and its air really is sunlit (`?debug=airall` shows what fully shadowed
  air would look like; `?debug=noair` switches the map off).
- **Mars dust re-tuned for the far wall**: 15 % less dust (column optical depth about
  0.23, a clear season). Direct sunlight at the scene's 4° Sun rises by about half, so
  benches catch light and cast shadows, and the far wall keeps a third of its light
  instead of a quarter. Tried and rejected: a tighter forward lobe for red and green. It
  is closer to measured Martian dust 60° from the Sun (a single Henyey–Greenstein lobe
  that matches the aureole is about twice too bright there), but it made the aureole a
  third brighter and whiter and darkened the whole sunset view. A two-lobe phase function
  is the proper fix and belongs to milestone 3.
- **Ledges**: a terrace riser reads as rock only when it is steeper than the surface's
  rock slope, so the 38 m beds went from a 30 % to an 18 % cliff fraction, and a 5 m bed
  layer adds ledges at walking scale. The masks use the large-scale slope (0.54 at the
  site, a canyon flank), so the benches themselves carry small steps too.
- **The lander bookmark moved** 25 m east and 20 m south onto a sunlit bench (the old spot
  ended up behind a riser). The start position and the lander's place are unchanged.
- **Character**: each limb is an upper and a lower piece, both children of the body (so
  each can be drawn into the shadow map on its own); the lower one is placed at the joint
  every frame. Eight limb capsules are handed to the cloak solver.
- **New chunks fade in from their parent** (shape, normals, cavities, baked shadows) over
  0.6 s, and shading morphs with distance exactly like the vertices. A parent's maps are
  always loaded while its children are drawn (the pool never evicts a node with loaded
  children).
- **The hand-over between worlds keeps the camera's roll.** `CameraRig.roll` holds the
  previous world's "up" and is released (1.2 /s) only inside 40 radii of the new world, so
  the re-levelling happens while the world grows in view. Look input is rotated by the
  roll so "right" stays right on screen.
- **Lunar chunk builds**: the crater op remembers the last 2×2×2 lattice block per class.
  Heights are bit-identical; the profile went from 72 to 41 ms per chunk in Node (Mars:
  24 ms). The rest of the gap is the fractal layers and the shadow rays, which simply
  cost more per sample on a cratered world.

- **Baked sunlight is decided per texel, not per chunk** (milestone 3). The walk across a
  chunk's own height grid used the Sun's height at the chunk's centre; on a chunk the
  size of a cube face that put a sixth of Mars in shadow whenever its centre (the south
  pole, in northern summer) was in night. Each texel now uses its own Sun height, walks no
  further than the shadow range, and is dark when the Sun is below its own horizon.
- **A world in black space is exposed lower than a view full of ground** (`globe` 0.32
  against `surface` 0.6, blended by how much of the frame the lit surface covers): at
  0.6 the tone curve flattened Mars's markings into cream.
- **Hard lunar shadows** (a helper measured why the Moon's light looked soft). No small
  crater was steep enough to shade itself at a 29° Sun (inner walls 23°): fresh ones are
  now bowls a fifth as deep as wide (`ageSkew` keeps most worn), and craters fade out on
  slopes above about 20° (soil creep), which also removed the camouflage blotches on the
  rille's far wall. The finest lunar chunks went from 42 m to 10 m (`maxLevel` 18). The
  rock, lander and figure shadows went from one 15 cm-texel map to an atlas with a 4 cm
  tile near the camera and a 7 mm tile that follows the figure: its shadow is a crisp
  silhouette instead of a smudge, and it now shades itself. The fine tile draws only the
  rocks within 30 m (they are scattered nearest-first), so its cost stays small.
  Baked terrain shadows can store the clearance angle instead of visibility for sharper
  edges (`CONFIG.SHADOW_ANGLE`); not switched on yet, it needs a decode in the terrain shader.
- **Mars from orbit keeps its albedo features** (a helper measured where the Viking
  mosaic's contrast went: the picture kept half of it). Three causes, three fixes: the
  globe was exposed into the tone curve's shoulder (Mars now sets `exposure.globe` 0.18,
  the default 0.32 suits grey worlds); only half of the mosaic's colour differences were
  used (now all: dark basalt is 0.4 as bright as dust in red, 0.75 in blue); and the haze
  added the same ground-bounced light over dark and bright ground (now it follows the
  ground's albedo on steep views). Contrast kept in the displayed day globe: 0.51 → 0.72.
  Still below Hubble's processed pictures, which stretch it; going further would invent
  contrast. Ruled out: the low dust layer, the froxels, the sky light.
- **The bright-part meter is weighted by the square root of brightness** (was: by
  brightness). A crescent still counts as its day side, but a white lander and sunlit
  rocks on dark lunar soil no longer drag the exposure down until the ground is black.
- **The highlight meter leaves out the screen around the Sun's disc.** It reads a blurred
  copy of the frame, and where the Sun sits on a ridge (the lunar sunrise view) the disc's
  light shared texels with lit ground and counted as ground many times over white: the
  exposure never settled. A first fix capped that reading at 8 times the mean of the lit
  samples, which over-exposed a thin crescent (the night side counts as lit surface and
  pulls the mean down); it was replaced by skipping the texels within the Sun's radius
  plus 1.6 texels.
- **Dim scenes stay dim on the Moon** (`exposure.dim`): above an exposure of 60 only part
  of the missing light is made up (the square root of it), and never less than a fifth.
  An earthlit night comes out about five times darker than full compensation would make
  it (it used to look like day), and a view into a low Sun keeps its ground dark: Apollo
  crews opened up only about two stops for into-Sun pictures, the meter had opened five.
  A plain power law could not do both (the two scenes need the same factor at very
  different brightness), and the glow drawn around a bright Earth feeds back into the
  meter, so the numbers were set by looking: ground-level day views (11–66) are unchanged.

### Worlds

- **Mars site**: the lip of a bench on the north flank of Coprates' southern ridge
  (13.174°S, 296.568°E, +570 m). The trough runs ~W17°N; on the chosen date the Sun sets
  at azimuth 297°, almost straight down the canyon. The north wall (≈10 km of relief,
  ~55 km away) is the "far wall".
- **Mars date**: 2014-01-31 — the evening Curiosity photographed Earth and the Moon from
  Mars — so Earth really is an evening star 34° from the Sun. Phobos is in the eastern
  sky and sets about 35 minutes later.
- **Mars height data**: MOLA global 4 px/deg (2 MB) plus a 128 px/deg inset (463 m/px,
  2.3 MB) around the scene. Everything below ~1 km is procedural.
- **Dusk bookmark is 1.7 h after the start**: Martian twilight is long, and stars/Earth
  only clear the glow once the Sun is ~17° down.
- **Moon site (milestone 3)**: Hadley Rille and the Apollo 15 landing site, replacing the
  invented crater. Chosen because one small area holds a 300 m deep canyon, a 4.5 km
  mountain front and a real landing site, and because Apollo 15's photographs are the
  reference to compare against. The scene date is the mission's second day (Sun 29° up in
  the east, 106° azimuth): at 19° (the first day) the canyon's east wall was a black hole.
  The start is the outside of the rille's bend at the foot of Hadley Delta, looking down
  the 3 km reach that runs north-north-west, the lit west wall on the left, the shadowed
  east wall on the right. A view from the rim half-way along (the first attempt) showed
  only one wall and read as a hillside.
- **Moon height data**: LOLA 4 px/deg for the globe; SLDEM2015 (LOLA + Kaguya stereo) for
  the sites, because the LOLA-only 118 m mosaic has kilometre-wide gaps between tracks at
  this latitude and the rille came out as blocks. Patches: the Apennines at 474 m, Hadley
  at 59 m (the whole rille), Tycho at 474 m, Taurus-Littrow at 118 m.
- **Procedural detail only below the map's pixel size** (`belowDem`): crater and relief
  layers switch themselves off for features the raster under the point can resolve, so
  the sharp patches show only real craters above ~120 m and the coarse globe still gets
  its share of invented ones. The old Moon's "dark fines in low ground" (darkening by
  altitude) is off: the brightness map knows where the maria are.
- **Brightness and colour maps multiply the palette** (divided by the map's mean), they do
  not replace it: slope materials, strata and close-up detail keep working, and the
  palette numbers stay normal albedos. Mars uses half of the Viking mosaic's colour
  differences: its dark regions lean bluer than the ground looks from the surface. The
  lunar map fades out between 62° and 75° latitude, where the mosaic is mostly shadows.
- **Regolith reflects like the Moon** (`photometry: 'lunar'`): lunar-Lambert times the
  phase curve fitted to the Moon's brightness through the month (0.57 at 30°, 0.37 at
  60°, 0.24 at 90°, 0.15 at 120°). A first curve (a plain exponential) was 2.7 times too
  dark at 100°: looking across the sunlight the ground went black beside the lander.
  Rocks use the same function and the local tint; the lander and the character stay
  matte, so white paint is far brighter than the soil, as in the Apollo pictures.
- **Landmarks are bookmarks 6 and up** with their own elevation patch and their own
  light (`timeOffsetHours`); the first five stay the scene the benchmark flies. Olympus
  Mons: west rim of the summit caldera, late afternoon. Gale: Curiosity's landing place
  looking at Mount Sharp, morning. Tycho: south rim, the Earth above the north wall.
  Taurus-Littrow: the Apollo 17 site, the Earth above the South Massif as in that
  mission's pictures.
- **Shadow rays stop at the tallest ground near them**, found from the rasters, instead
  of at one number per world: a view from a 21 km volcano needs a different ceiling from a
  canyon, and a wrong one silently removes shadows.
- **The sky always contains every catalogue body**; the one underfoot is skipped.

### Character and flight

- Interactive sessions start behind the character, on its feet; bookmarks in screenshot
  mode stay first person unless `?hero=1`.
- **On foot** (owner's request during milestone 3): walk at up to 4.5 m/s, super speed up
  to 60 m/s with the stick at its rim, jump at 5 m/s under the world's real gravity
  (3.4 m and 2.7 s in the air on Mars, 7.7 m and 6.2 s on the Moon; a future Earth 1.3 m).
  A tap of up jumps; holding it 0.35 s, or a second tap in the air, takes off. With HOVER
  off, touching the ground while not climbing lands on the feet, and letting go of the
  stick within 30 m of the ground is a real fall (the flight's own pull is a gentle,
  scaled one, which made the last metres float). Running off a cliff and falling more
  than 40 m hands over to flight. The camera follows from where it sits in flight, so
  landing and taking off do not move it; it never goes below the ground and follows its
  rises smoothly. The first-person walk (HERO off) jumps at the same speed.
- Speed in flight is 0.85 × distance-to-nearest-surface per second (×3 boost), 0.2 × near
  the ground (see the owner's scale note): far faster than light between planets,
  automatic slow arrival.
- The camera is the thing that moves; the figure is drawn ~4 m ahead of it.
- **Targets** (milestone 4): each world lists real places in its data file (`places`);
  `TARGET` opens a list of them, the bodies in the sky and the Sun, with distances; `T`
  cycles. The marker (thin brackets, name, distance, how long a GO trip takes) is plain
  DOM over the canvas: no draw calls. Turning to a body looks straight at it; turning to a
  place looks along the way a trip would set off (over the horizon).
- **GO** (milestone 4) is the boost for long transfers: hands-off, full stick with the
  boost, and twice that again when every body is more than 20 radii away; near the ground
  it keeps the open-space pace (0.85 of the height per second, not hand flight's fifth).
  From the ground to another world takes about 15 s. It climbs away first (speed grows with
  height, so skimming the ground toward a body on the horizon crawled at 21 m/s), never
  aims through the world, and ends 5 % of a radius above a body or 500 m above a place,
  where gravity takes over unless HOVER is on. The view looks toward the target, kept
  10° above the world's edge (along the path, or a third of the way toward the target, it
  showed black space for most of a trip); looking around
  is free; the stick or a movement key takes control back.
- **Poses from the pilot's intent, not raw speed** (speeds span 7 m/s to astronomical):
  stick pushed = cruise (one arm ahead), boost = streamlined, nearly straight down = feet
  first. Landing: an upright flare in the last second when diving at the ground; landing
  faster than 9 m/s (a fall of about 20 m on Mars) is a three-point landing that brakes
  the skid and holds 0.45 s. Up held after a jump: a fist-up launch, and a ring of dust.
- **Chase camera**: the figure drifts up to 0.7 m against a turn and settles back; on
  foot the camera rises to keep the figure's chest in sight over ridges and drops back
  2.5 m at super speed; through the telephoto the figure steps out of the picture.
- **The robe and hair flow in vacuum too**: 30 % of the atmospheric flow is kept in
  flight, and a breeze always blows through the cloth, even standing still on the Moon
  (its push is about a third of the cloth's weight on that world, so it leans and ripples).
  These are the two deliberate departures from physics, both at the owner's request
  ("the robe should be flowing in the wind or flight").
- World hand-over (Mars ↔ Moon) happens when the other world's surface is nearer than
  the current one's; in practice about half-way, where both are dots. Simulation time
  runs on across worlds; pressing a bookmark jumps to that world's own scene date.

## Known limits of what is built

Every limit in the code today that holds back the picture or its detail, checked against
the code on 2026-11-20. Faults that will be fixed are in the table below; these are the
ceilings the engine was built with. Since the owner dropped the fixed budgets (CLAUDE.md,
"No fixed budgets"), none of the numbers here is a rule any more: each one can be raised
when the phone's benchmark shows it holds a steady frame rate.

The picture

- No anti-aliasing of any kind: thin bright edges (ridge lines, crater rims) shimmer.
- Render resolution is whatever holds the frame rate: from native down to about 1 million
  pixels, then features switch off in the governor's order. Above 8.3 million pixels (a
  monitor larger than 4K) the canvas is capped.
- Smooth mode asks for 60 frames a second, so each frame has half the time Sharp gives it.
- None of the expensive effects in CLAUDE.md is built: volumetric clouds, screen-space
  reflections, ambient occlusion, global illumination, motion blur, temporal
  anti-aliasing. Each waits for phone results that show headroom.
- Bloom is one cheap pass (5 levels, about 4.5 % of the light).
- Photo mode (one frame at full native resolution) is not built yet (milestone 8).
- A phone allows 16 textures in one shader and the ground's shader uses 15: one more map
  on the ground means merging or dropping another.

The ground

- At most 180 terrain patches are drawn at once (120 until 2026-11-20), from a pool of
  480; the governor can lower that to 144 and 115. Detail in the distance is what this cap
  leaves after the patches near the camera.
- Every patch is a 40 × 40 grid of quads with a 120 × 120 normal map, whatever its size.
  The finest patches are about 40 m across on Mars (1 m quads, 34 cm normal texels) and
  10 m on the Moon (26 cm quads, 9 cm texels). Nothing smaller has real shape.
- Below that, grain comes from one generated 256-pixel pattern repeated at three sizes
  (64 m, 7 m and 0.8 m tiles): no photographed or scanned surfaces (art rule 3).
- Real elevation is coarse outside a few sites. Mars: 15 km per pixel everywhere, 463 m at
  Coprates, the Olympus summit and Gale, 1.9 km over the Olympus shield. The Moon: 7.6 km
  per pixel everywhere, 59 m at Hadley, 118 m at Taurus-Littrow, 474 m over the Apennines
  and Tycho. Everything finer is invented relief from the recipe.
- Real colour is one 4096 × 2048 map per world: 5.2 km per pixel on Mars, 2.7 km on the
  Moon. Finer colour is the palette and the generated ground cover.
- Relief shading from far away comes from one slope map per world, 4096 pixels round
  the globe (5.2 km per pixel on Mars, 2.7 km on the Moon), with its slopes doubled so
  landforms read on a phone.
- Gullies below the elevation maps' resolution are noise, not aligned downslope.
- Rocks: one lump shape cut by fracture planes, at most 512 (480 on Mars, 420 on the
  Moon), only within 120 m of the camera. No pebbles, boulder fields or footprints.
- Three workers build terrain: ground that comes into view fast is drawn coarse until
  they catch up.

Shadows and light

- Terrain shadows are baked per patch at 60 × 60 (half the normal map), re-baked when the
  Sun has moved 1°. Shadows cast from far away have soft edges, and the day-night line
  seen from far away is as sharp as those texels (stair-stepped on the Moon at high zoom).
- Shadows of rocks, the lander and the character are drawn within 150 m of the camera
  (15 cm texels; 4 cm within 20 m; 7 mm round the character). Farther away the lander
  casts none. Kicked-up dust casts none.
- No sky-visibility bake: sky light is not reduced inside a canyon or a crater, only in
  one-texel hollows (the normal map's cavity term) and at the foot of the character, the
  lander and the eight nearest rocks.
- Planetshine is unshadowed and comes only from the single brightest sky body.
- The lander's lamps light nothing. Nothing in orbit is lit by the planet below it.

The air

- The air is a set of small tables: sky 160 × 100, 32 × 32 × 32 cells of haze in front of
  the camera, a 64 × 64 map of where terrain shadows the air. So shadows in the haze are
  soft.
- From space the glow on a planet's edge is marched per pixel with 16 samples (12 over
  ground), halved by the governor.
- No clouds, no dust storms, no weather: a world's air changes with height only, it is
  the same over every place.

The sky

- Only Mars and the Moon have terrain; any other body stops you just above its drawn
  surface (2 % of its size).
- The catalogue holds the Sun, Earth, the Moon, Mars, Phobos and Deimos. No other planets
  yet (milestone 6).
- A body seen in the sky is a ball with a generated pattern, not its real map: Mars and
  the Moon too, seen from the other world. Earth's is a procedural ocean/land/cloud
  pattern, not real geography (milestone 5).
- Stars are the 9,096 of the Yale Bright Star Catalogue as points; no Milky Way.
- The Moon's rotation uses mean elements (no libration); Earth can be a few degrees off.

The character

- No textures: detail is geometry coloured per vertex; face and hands are simple shapes
  and do not move (no fingers, no expression).
- The robe, sleeves and hair are about 500 simulated points at 75 steps a second (half
  that on the governor's last-but-one step), drawn finer than they are simulated. The
  cloth is kept off the body, head and limbs, not off the ground, rocks or lander, and the
  hair is not kept off the arms.
- Kicked-up dust is a pool of 1,024 sprites, each at most 256 pixels across.

## Known problems (and where the roadmap deals with them)

| Problem | Milestone |
| --- | --- |
| Nothing since build 27e1973 has run on the phone: the one-draw-call ground, twelve new worlds, thick air (Titan, Venus), the cloud layer, the sea, rings, the menu, map, sound | owner's next benchmark and first look |
| The new worlds were given one pass each: views chosen with the CPU sketch and one or two headless pictures, no reference set, no stability run, no critic. Weakest: Europa (reads as a brown dune, not ice), Triton (flat), Io (bland plains), Titan's dunes (hard to see in the flat light), Phobos and Deimos (the horizon slants: "up" is from the body's centre) | after the owner's first look |
| Where a world has no elevation data the small-scale ground is invented (recipes), and so is everything below the data's pixel size everywhere | by design; say so |
| Pluto's and Charon's far hemispheres have no elevation and a filled-in colour: featureless there | data does not exist |
| Earth: no trees, grass, buildings, rivers or lakes; ground below sea level is sea; the player can stand on water; clouds are a single thin layer of 10 km cells with generated detail | by design for now |
| The Moon's orbit is a mean ellipse: up to 3.5 degrees from its true place; Phobos runs ahead after 2030 (12 degrees by 2100): each needs a periodic or squared term in `orbitPosition` (the numbers are in `scripts/fit-orbits.py --refit-existing`) | open |
| Sound, photo sharing and the date picker could only be tested as far as a headless browser goes (no speaker, no share sheet) | owner's first look |
| The journal has no hints or map pins; a place is found only by going near it | open |
| Milestone 2 and 3 builds have not been measured on the phone: the per-pixel haze near a planet's edge, the albedo lookup and the dust are new costs | owner's next benchmark |
| One-pixel-high bright features alias (ridge highlights, crater rims): no anti-aliasing. The milestone 1 results showed room for it; it waits for numbers from the current build | after the next benchmark |
| Night scenes need about 570 frames for exposure to settle in screenshot mode | tooling |
| A chunk that takes over while its parent is itself still fading in starts from the parent's own maps, a small jump during fast streaming | watch |
| Chunk builds cost about 10 % more than in milestone 2 on Mars (the rays that keep shadows continuous across chunk borders); lunar chunks are a third cheaper than before | watch |
| The terminator seen from far away is as sharp as the shadow map's texels: stair-stepped on the Moon at high zoom, no long relief shadows across it | 5 |
| Looking straight down-Sun on the Moon the ground is featureless (true to life; the target marker now gives something to steer by); small craters only show across the light | watch |
| The SLDEM patch has faint north-south stripes a few metres high (the altimeter's tracks) | watch |
| Outside the sharp patches the Moon and Mars are 7 to 15 km per pixel plus invented relief: landing anywhere else shows no real small landforms | 6 / 7 |
| Mars from orbit is soft: about 40 % of the contrast of the Viking mosaic survives the haze; Valles Marineris shows by its bright rims | 5 |
| Twilight glow has a hard upper edge at the highest exposures | 5 |
| Mars: flat grey sky away from the Sun, olive cast in the sunset views | 5 |
| The cost of the Mars dust cloud's noise on the phone's fill rate is not measured (the governor's dust step drops most of it) | owner's next benchmark |
| Through a very long lens (under 10°) looking down-Sun at a grazing angle, the sand ripples stretch into vertical stripes (seen at the lander bench near sunset; not at normal lenses) | watch |
| Rocks look pale, bluish grey against the Martian ground (real ones are dark and dust-coated) | 6 |
| Landforms soft from close up: Mount Sharp, the Coprates wall, the Olympus caldera wall, Hadley Rille, Tycho's peak read as rounded heaps (milestone 4 critic) | 6 / 7 |
| Mars daylight haze too thick: far walls dissolve, flat khaki sky (milestone 4 critic) | 5 |
| Chalk-white outlines on canyon walls and crater rims in Mars from orbit; a bluish Mars crescent | 5 |
| In orbit the cloth floats loosely with almost no weight to hang by | next character pass |
| Black shadow slivers with no visible relief in the low lunar orbit view | 5 |
| Far from every body only the target marker shows the way; there is no map yet | 7 |
| Places on other worlds cannot be chosen until that world is home (no map yet) | 7 |
| The terrain patch cap went from 120 to 180 when the owner dropped the fixed budgets (2026-11-20), so more triangles and draw calls are drawn than in any build the phone has measured (the reference views sat at 480–495 thousand triangles before) | owner's next benchmark |
| No footprints (footfalls throw dust) | 8 |
| The character is built from code: clean shapes and per-vertex colour, no sculpted face, no painted embroidery, none of the fine ornament of the owner's reference pictures. A real model file from the owner would replace it | owner (asked) |
| In fast flight the robe's skirt streams back as a smooth tube; little billow. The face is a few simple shapes | next character pass |
| The robe and hair simulation (about 500 points, 75 steps a second) and the 180 patches are not measured on the phone | owner's next benchmark |
| The reference pictures of the worlds without the character (bookmarks, orbit views) were rendered with 120 patches; with 180 the ground is finer than they show. Re-render with `npm run shots:all` (3–4 hours) | tooling |
| Earth's maps are 10 km a pixel (clouds, colour) and 20 km (lights, water): low over it the clouds are soft; it cannot be landed on (milestone 9). The other bodies seen from afar are still generated patterns on a 3,380-triangle sphere | 6 (each new world brings its maps) / 9 |
| An eclipse dims the sunlight by the share of the Sun's disc covered, at the camera, for the whole frame: no shadow edge moving over the ground, no red ring of air round an eclipsing Earth | 7 |
| Milestone 5's costs are not measured on the phone: the globe's shader and the rim of air (only where Earth is on screen), four maps of about 80 MB when Earth is near | owner's next benchmark |
| Low over Earth the clouds are soft and have no fine structure; city lights are 10 km a pixel; no cloud shadows on land at the day-night line (milestone 5 critic) | 9 |
| Phobos is a pale featureless lump and Deimos a speck through a long lens (milestone 5 critic) | 6 |
| Earth's full maps are decoded on the main thread when they arrive: a hitch of a frame or two, once | watch |
| The Sun's disc is placed from the camera, but the sunlight on everything (direction and strength) is still that at the home world: flying far from home toward the Sun, things are lit as if at home | 7 |
| Far from every body the traveller still rides the home world's spinning axes, so a time change swings distant bodies round it (near a body it is now carried along with that body) (foundation review) | 7 |
| Every world's elevation data is downloaded at start-up and kept: fine for two worlds, not for ten (foundation review) | 6 |
| `scripts/transfer.mjs` flies a hand copy of the trip code in `App`; a change to one can miss the other. The trip's steering belongs in `autopilot.js`, used by both. `transfer` and `flyby` print their numbers but never fail: they need pass marks (foundation and final reviews) | 5 (before touching trips again) |
| Stars load from the starting world's data file only; the `sky.bodies` field of the world files is unused (foundation review) | 6 |

Fixed in the milestone 4 review: GO arriving at tens of thousands of km/s (the figure hit
the ground a fraction of a second after "Arrived", even with HOVER on); the trip's heading
and the cloak left in the old axes at the world hand-over; a trip that kept running after
HERO, FLY, a bookmark or standing up; a three-point landing that read as a stumble, and its
kneel carried into a jump or take-off; the figure jumping up to 0.7 m on landing while the
view turned; the take-off dust missing for a held take-off and the landing dust a quarter
of a second early; dust shown through rocks from higher up, and its noise breaking up far
from where the pool was anchored; the feet's contact spheres read from the wrong slots
(one was NaN); lander and rock darkening switching on in one frame; HOVER doing nothing in
a fall on foot; GO reshuffling the touch buttons; the marker gone with the HUD off, its
label cut at the screen's edge, and a place beyond the horizon marked on the ground in
front; the boots of the hovering figure cut by the frame.

Fixed in milestone 4: no darkening under the lander and rocks in shade (sky occlusion at
their foot); the simple white figure (visor, lamps, pack, joints, gloves, boots, dust);
round dust puffs (a lumpy cloud on Mars, a fine spray on the Moon); nothing but the HUD to
navigate by (target marker, list and GO); the figure banked away from turns.

Fixed in milestone 3: the Moon had no maria or rays and Mars was one colour from orbit;
a sixth of Mars drawn washed-out from far away; lunar ground one grey at every Sun
height; an earthlit lunar night exposed as bright as day; whole benches wrongly in shadow
at a low Sun, with straight edges where chunks meet.

Fixed in milestone 2: detail popping as terrain refines; no glow (and an inverted band)
on the planet's edge from orbit; over-exposed globes, lit night sides and the stripe on
Mars's terminator; the halo around the airless Moon; the roll at the Mars ↔ Moon
hand-over; lunar chunk build time (72 → 41 ms); haze ignoring terrain shadow; ledges
reading as dunes; the far wall's haze (in part: 15 % less dust); rigid limbs and the
cloak passing through arms and legs; Phobos and Deimos checked.

## Tests and measurements, milestone 4

- **GO trips without a browser** (`npm run transfer`, a Mars-sized world): to a Moon-sized
  world 2000 of its radii away, made home halfway as in the game, 15.5 s (the marker
  predicted 14.7 s); to a place 71° away from ground 5 km up, 18.6 s (17.5 s); 169° away,
  23.1 s (19.9 s); a 3° hop, 11.2 s (11.9 s). (Corrected in the milestone 4 review: a place trip stops
  about 245 m short of the point 500 m over the place, at about 1.2 km/s, and its speed is
  then cut to what the stick would give there; with HOVER on it stays about 480 m up, with
  it off it comes down about 540 m from that point.) Before trips kept the open-space pace near the ground they took 28–45 s,
  most of it drifting up the first kilometres. No trip touches the ground; the
  straight-line distance grows by at most 4 % on the way except to the far side (31 %, it
  goes up and over), which is why a place's distance is shown along the ground. Found on
  the way: after the target body became home, the "never through the world" rule kept the
  aim on its edge, so a trip to another world would never have landed.
- **Target list and GO in the game** (`npm run target`, final build): the list holds 16
  entries on Mars; picking one closes it; the marker reads "Olympus Mons · 4487 km · GO
  17 s"; GO climbs to 200 km and closes from 4487 to 422 km along the ground; the marker
  counts down; `T` picks the next target and ends the trip.
- **Smoke** (final build): start screen, modes, HUD and a full benchmark pass; most at once
  90 draw calls, 237k triangles, about 183 MB; 21 shaders, the fullest (terrain) reads 15
  of a phone's 16 textures; none fails to compile.
- **On foot** (`npm run foot`, final build): both worlds pass; jumps peak at 3.37 m (Mars)
  and 7.64 m (Moon); a hard landing's kneel does not stop the test's walk afterwards.
- **Fly-bys** (`scripts/flyby.mjs`): aimed trips still land; a 60-radii miss passes at 1.3
  radii and lands once released, the sweep held to 44°/s.
- **Governor simulation**: unchanged behaviour with the new `contact` step.
- **Poses** checked by eye from the side and behind over Gale (cruise, boost, turning,
  climbing, hover, three-point landing, launch). Found and fixed on the way: the figure
  banked away from turns (sign error since milestone 2), faced the camera when climbing
  straight up, and dove feet first when boosting downward; the trailing legs were cut off
  by the frame's bottom edge (the figure now sits 0.9 m below the view's axis, was 1.2).
- **Suit** (helper): 3,568 → 5,242 triangles without the cloak, no new meshes or
  textures; exposure unchanged by the visor's glints (Mars 223.9 → 224.3).
- **Dust** (helper): one draw call, 1024 particles, no textures; the governor's dust
  step now also drops the cloud's small lumps and its self-shadowing.

## Tests and measurements, milestone 3

- **Flight**: `flyby` as after the flight fix (an aimed trip lands in 13 s within 0.1°; a
  60-radius miss passes at 16 radii with the target sweeping at most 46°/s; a released
  stick ends on the ground). The scripted Mars → orbit → Moon flight passes and now
  arrives over Hadley.
- **Smoke test** with a full benchmark: passes; the new dust step was exercised with the
  others. Most at once in that run: 124 draw calls, 337k triangles, about 142 MB of GPU
  memory (the brightness or colour map of the current world adds 22 MB).
- **Chunk builds in Node** (`profile-chunks`, means over the levels down to the start
  site): the Moon 51 → 36 ms (real maps: far fewer invented craters to stamp), Mars
  29 → 32 ms (the rays that keep shadows continuous across chunk borders). In the
  browser run of the benchmark: Mars 50 ms, Moon 56 ms per patch on the test machine.
- **Shadow continuity across chunk borders** (`bakecmp` in the session's scratch files:
  mean difference, out of 255, between the two chunks' values along a shared edge, at the
  Mars start with the Sun 4° up): level 17: 245 → 0; 16: 78 → 0; 14: 155 → 11; 12: 62 → 9.
  The cause was not the border itself: rays that start under a ledge smaller than the
  detail their first samples can see came out dark, in whole benches.
- **Download**: Mars 4.4 → 13.7 MB of map data, the Moon 0 → 13.6 MB (fetched when the
  Moon is first visited); the page script is 782 kB (224 kB compressed). The slope maps are
  most of the growth (4.6 and 6.4 MB).
- **Final benchmark run in the test browser** (after all of milestone 3 and the owner's
  notes): most at once 97 draw calls, 281k triangles, about 183 MB of GPU memory (the
  slope and colour maps add about 40 MB); chunks Mars 41 ms, Moon 43 ms each.
- **On foot** (`npm run foot`, both worlds): starts on its feet, walks at 4.5 m/s, a jump
  peaks at 3.37 m on Mars and 7.70 m on the Moon, super speed passes 25 m/s within the
  test's wait, holding up takes off, letting go lands on the feet; no page errors.

## Tests and measurements, milestone 2

- **Stability** (ten moves, two stations each, `docs/shots/stability/report.json`): no
  pops, no sparkles. Mars from orbit went from 0.07 % of pixels changing to 0 (the edge of
  the planet is now smooth). The Moon is as before: differences only where a rock a metre
  from the camera really moves.
- **Flight test**: Mars → orbit → Moon, hand-over with the roll carried over, no errors.
- **Smoke test** with a full benchmark: passes; all nine governor steps were exercised.
- **Final build against the reference set**: `mars_ledge` and both Mars orbit views are
  identical to within 1/255 after the last two changes (sky-light look-up skipped near the
  ground; the from-space haze march compiled only into the terrain shader).
- **Relative cost in the test browser** (software rendering, start view, all features on;
  only the ratios mean anything, and they are not phone performance): milestone 1 = 584
  ms per frame; milestone 2 = 784 ms. Known shares: the from-space haze branch in the
  terrain shader, never taken on the ground, costs about 15 % there (a software renderer
  pays for masked branches; a phone GPU should not), and the sky-light look-up cost 10 %
  before it was skipped near the ground. **Open risk**: if the owner's benchmark shows the
  ground views slower than with the milestone 1 build, compile the from-space haze as a
  second terrain program and switch to it above the atmosphere.
- **Lunar chunk builds in the browser**: 59 ms each in the benchmark run (90 before);
  Martian ones 43 ms (35 before: the extra ledge layer and the busier machine).

## Stability test, milestone 4

Two stations on each of the ten moves, final builds. Pixels that flicker (change one way
then back across three frames): Mars walking 0.05 % and 0.006 %, turning 0.006 % and
0.002 %, telephoto on the wall 0, high flight 0, orbit 0; Moon walking 0.015 %, turning
0.005 %, low flight 0.001 %, orbit 0.001 %. The largest, Mars low flight at 0.4 %, is the
character itself between frames (the cloak's new flutter and the hover sway) and the
edges of terrain moving past: nothing static pops, crawls or sparkles. The dust was not
part of the moves (the helper flagged the Mars cloud's small lumps and the lunar streak
heads as things to watch while the camera turns).

## Stability test, milestone 1

Three consecutive frames at two stations along ten scripted moves (walking, turning,
telephoto, low flight, high flight and orbit on Mars; walking, turning, low flight and
orbit on the Moon), about one pixel of image motion per frame, exposure held.
Numbers are in `docs/shots/stability/report.json`; the strips are not kept in the
repository (re-create them with `npm run stability`).

- **No pops and no sparkles** in any of the moves; differences between frames follow
  the edges of things that moved.
- **Residual shimmer: one-pixel-high bright features alias**, because there is no
  anti-aliasing: sunlit ridge highlights on the near Martian ground while turning, and
  the sunlit far rim of the lunar crater (a broken line on the horizon). At the phone's
  resolution these are finer than in the test; to be judged there. → 2
- **Fixed: the near shadow map's texel grid was tied to the planet's centre.** One of
  its two coordinates was identically zero (never snapped) and, measured from the
  centre, the grid swept across the ground as the Sun turned, so shadow edges of rocks,
  the lander and the character could crawl. It is now tied to a point on the ground near
  the camera. Found by reading the code while chasing a test result; the test itself
  cannot show it (time is paused in screenshots), so the visible effect is unconfirmed.
- **Fixed: screenshot mode never became ready a few hundred metres above the ground**
  (the rocks waited for a shadow answer that was never asked for).
- The first version of the test moved too fast (several pixels per frame) and let
  exposure re-meter between frames; both produced large, honest differences that hid
  what the test is for. Steps are now about a pixel and exposure is held per station.

## Milestone 4 review (after the checkpoint, at the owner's request)

The owner asked for milestone 4 to be reviewed, judged and its errors redone before it is
called done. Done as two rounds of independent reviewers (code read along five lines:
character and poses, targets and GO, camera and flight, rendering cost, phone screen and
documentation), each finding checked by a second reviewer told to disprove it, plus a
critic that saw only the pictures and the art rules. 25 findings held (about 19 once the
duplicates were merged); the fixes themselves were then reviewed the same way and 7 more
problems were found in them and fixed. What changed, for the player:

- **GO** now stops above the target and stays there with HOVER on (before, its speed on
  arrival was about 70,000 km/s near the Moon and the figure hit the ground at once). A
  trip ends when the character is put away, the free camera is taken, a bookmark is chosen
  or it stands up. Across the world hand-over the trip keeps its heading (it veered by
  about 110° and arrived 4 s late) and the cloak no longer whips round.
- **Three-point landing**: a real kneel (left foot planted, right knee and fist on the
  ground, head low), for every landing over about 10 m/s; a jump or take-off straight out
  of it lets go of it.
- **Chase camera**: while the figure hovers upright it is drawn 5.5 m ahead instead of
  4.1 m, so its boots are in the picture (cruising with the stick pushed is unchanged). No
  jump of the figure on landing or after the next take-off while the view turns. The
  figure's trailing offset is the same at 30, 60 and 120 fps (it was four times larger at
  120 Hz than at 30). Turning straight round on foot turns the figure at once (it ran
  backwards for over a second). On a steep slope just past a crest the camera rises enough
  to keep the figure in sight.
- **Dust**: a ring at take-off when up is held (the usual phone take-off threw none); the
  landing ring at the moment the feet touch; from higher up a lingering cloud is hidden by
  rocks and ground in front of it; a long run or a bookmark jump no longer breaks it up.
- **Darkening under things**: the feet's spheres were read from the wrong slots (one of
  them NaN); the lander's and the rocks' spheres now fade in and out.
- **HOVER** pressed during a fall on foot stops the fall, as its message says.
- **Screen**: `GO` sits above `▲` (showing it pushed every button after it one place
  along); the target marker stays when the HUD is off, keeps its label inside the screen,
  and a place beyond the horizon is marked where the way to it crosses the horizon, with
  "over the horizon"; the full read-out starts below the buttons; the HUD no longer shows
  through the start and results screens.
- **Tests**: `npm run transfer` turns the frame at the hand-over as the game does and flies
  every trip with HOVER off and on; the headless tests no longer count the software
  driver's "GPU stall" notes as page faults (target and foot had been failing on them).

Checks on the final build: `target`, `foot`, `smoke` (21 shaders, the terrain at 15 of a
phone's 16 textures, none failing) and `flight` pass; `transfer`: the trip to another world
arrives in 15.5 s (marker 14.7 s) through a frame turned 112° at the hand-over and with
HOVER on holds 71 km over it (before: on the ground in a fraction of a second); a place
trip holds 480 m up with HOVER on; `flyby` unchanged (an aimed trip lands, a 60-radii miss
released lands); the governor simulation unchanged; triangle and draw counts of the
re-rendered reference views identical to before. Re-rendered references: the three-point
landing, both hovers, both touch-down dusts, the Mars flight, the target marker, the UI.

The critic's remaining gaps are about the character's look (a sheet-like cloak, a slim
suit, no footstep dust): in the known-problems table for a later character pass.

## Foundation review and the owner's character (after milestone 4)

The owner sent three reference pictures of the character (a cultivator in a white-silver
robe, long magenta-purple hair, wide sleeves, a silver sash with pearls and tassels) and
asked for the robe to flow in the wind and in flight, for everything built so far to be
reviewed, judged and fixed, and for milestone 4 to be a good foundation. In the same
session the owner dropped the fixed budgets.

**The character** (`src/hero/heroModel.js`, `src/hero/robe.js`; `cloak.js` is gone).
The suit, helmet and cloak are replaced. The body: a slim torso in a crossed-collar robe,
silver shoulder pieces with a fringe of drops, a wide silver sash with a polished clasp,
strings of pearls with lavender tassels on the hips and down the back, silver bracers,
bare hands, loose trousers gathered into silver-topped boots, a head with a simple face
and two locks of hair framing it. The cloth, one draw call and about 500 simulated points:
three panels of the long skirt with slits at the front and sides, two wide sleeves (a
sheet laid over each arm, fixed along it and sewn underneath, hanging deep at the wrist),
three long locks of hair down the back. It is drawn finer than it is simulated, with
folds. Five materials in one shader: silk (a satin sheen), skin, silver embroidery,
polished silver and pearls, hair (highlights along the strands). No textures. About
9,400 triangles (the suit had 6,300). A breeze always blows through the cloth. Limits,
honestly: a code-built figure cannot match the paintings' face, ornament or painted
detail; the owner was asked whether the 3D model named on the reference sheet exists.

Reference pictures (`docs/shots/*_hero_*`, final build): hover on both worlds (the back
view of the owner's second reference), walking toward the camera (`mars_gale_hero_front`,
new), run, super speed, fast flight, bank, coming in to land, jump, three-point landing,
orbit, touch-down and footfall dust.

**The foundation review**: six lines of review over all work since milestone 3 (flight,
character logic, rendering, phone screen and tests, foundation for milestones 5–8,
documentation truth), every finding checked by a second reviewer told to disprove it:
51 findings, 48 upheld. Fixed in this round:

- *Flight*. Held against a body without terrain (Earth, the Sun, Phobos, Deimos) flight
  crawled at walking pace (a placeholder height of zero): now its true height. Beside such
  a body the traveller is carried along with it (before, Phobos drifted off at 1.5 km/s
  and the Sun at 15,000 km/s, because everything is kept in the home world's spinning
  axes). The camera could fly inside Phobos and Deimos (they are drawn up to 25 % bigger
  than the sphere that stopped it): now the shape as drawn. A stick pushed part of the way
  no longer bends the flight toward the ground (at half stick, aimed level, it sank at
  31°). The last stretch of a GO trip no longer depends on the frame rate (trips to a body
  take about 1.2 s longer, 16.7 s; the marker's estimate was re-tuned: 16.6 s). Trips to
  places below the datum (all the Moon's places, Gale) can no longer aim through the
  world. A hand-over keeps the moment and centres the time slider (the clock jumped by up
  to weeks at the next touch of a time key); the time keys run per second, not per frame.
  A world whose data fails to load is retried after a pause, with a message.
- *Character*. After a hard landing the kneel lets go when the stick unlocks (it slid a
  metre on one knee). No forward tilt after a flared landing (22° before). Leaving the
  ground on a steep slope is the same at 30 and 60 fps. Standing, the figure keeps facing
  where it faced: turn the view round it to see its face. Off a sheer wall it no longer
  hangs in mid-air. The terrain's shadow on the figure fades in and out and keeps updating
  while terrain loads (it froze, then snapped).
- *Rendering*. Rocks keep their own sunlight when the scatter moves (they flickered lit and
  dark near shadow edges). Dust takes free packets first (at super speed on the Moon,
  packets vanished in mid-air) and its lumps no longer jump every 1000 s.
- *Screen*. `F` / the button now labelled `CAM` is the free camera where you are (from
  flight it dropped the player to the ground in first person).
- *Tests* (helper). `npm run flight` can now fail (it could not); screenshots fail on page
  errors and shader failures; the shader-limit check counts varyings properly; the
  stability test says what it cannot show and gains `--streaming`; the target test works
  the touch stick and look for real; `--distdir` no longer silently serves live source.
- *Documentation* (helper): ARCHITECTURE's frame order, governor and world schema, the
  known limits, the keys and parameters, brought back to what the code does.

Left for later, each in the known-problems table: Earth and other bodies drawn as
generated patterns, eclipses, the frame far from every body, loading all worlds' data at
start-up, the trip test's hand copy.

**Final review** of this round's own changes (four lines of review, each finding checked
by a second reviewer): 23 findings, 22 upheld, all fixed before the merge. The ones that
showed: the robe, sleeves and hair were lit inside-out (their normals pointed against the
way their triangles were wound, so the sunlit side was the dark one); the silver trims
were shaded as skin or as nothing (a material number blended between neighbouring
points); with the governor's cloth step on, the sleeves came off the arms on three frames
in eight (it now halves the solver's passes instead of the step); sleeves whipped for
three frames after a bookmark; the skirt went under the ground when kneeling (the cloth
now has a ground); a light push of the stick aimed upward flew backward (the first fix
for the bending pull overshot); off a sheer wall the figure bounced between falling and
flight (the first fix did not hold: it now falls on foot until the camera is past the
edge too); a bookmark pressed while being carried with a moon landed far from the place;
the figure stayed sunlit on the night side of an airless world above 20 km; the collar
stood 4–8 cm off the neck and the brows off the head. Recorded, not fixed: `transfer`
and `flyby` print their numbers but still cannot fail.

## Look pass after the milestone 4 review (owner: "keep refining the looks")

Aimed at the critic's character gaps, the things on screen all the time:

- **Cloak**: drawn as a smooth surface through the simulated points (25 x 27 drawn points
  over the 9 x 14 simulated ones, Catmull-Rom across and down) with about four and a half
  folds fanning from the shoulders, 6 mm deep at the top and 34 mm at the hem, pressed in
  along the cloth's own normal; the inside of a fold is a touch darker. The simulation
  and its cost are unchanged; about 1,000 more triangles. Up close it now reads as cloth
  with pleats; seen exactly side-on in a run it is still a thin line (a flat cloth seen
  edge-on).
- **Suit**: arms drawn 28 % and legs 22 % wider (their length and joints unchanged), the
  soft torso 10–12 % wider, the backpack 9 cm deep instead of 5, the gold visor larger;
  the cloak hangs 4 cm farther out to clear the pack, and its collision with the limbs is
  widened to match.
- **Dust at every footfall**: each step on the ground kicks a small puff from the foot that
  lands, bigger the faster the run (the steady trail on foot is a quarter of what it was,
  the footfalls carry the rest). Shot parameter `dust=run` freezes the last few.
  Lunar grains in vacuum take less of the sunlight (0.35 → 0.2): the puffs were brighter
  than the regolith they came from.
- **Mars air**: the dust pooled low in Coprates halved (density 0.6 → 0.3). The pictures
  barely changed: the haze over the far wall is mostly the general dust at the canyon's
  depth, seen with the Sun low just before sunset. Making Mars's air clearer means
  lowering the main dust load, which changes the sky and the sunset too: milestone 5.

## Independent critic, milestone 4 (screenshots and art rules only)

The five biggest gaps, as ranked (all about the worlds, none about this milestone's
character and flight work; each is in the known-problems table with its milestone):
1. Landforms read as soft sand and clay, not as the real places: Mount Sharp a rounded
   heap of even corrugations, the Coprates wall a flat band, the Olympus caldera wall one
   smooth slab, Hadley Rille a shallow trough, Tycho's peak a mound.
2. Mars daylight haze at dust-storm level: the 60 km wall nearly dissolved, a flat khaki
   sky (clear-day rover views see rims 30–40 km away crisply).
3. Earth and Deimos colourless blown-out blobs; few stars in the earthlit lunar night.
4. The lunar surface lacks Apollo's hard high-key light (dim, soft, plaster-like craters).
5. Invented colour: an olive cast in the Mars sunset sky, a hard-edged cream twilight
   ellipse, chalk-white outlines on canyon walls from orbit, a bluish Mars crescent; the
   figure's legs near black in orbit over sunlit Mars (no light from the planet below).

Kept: the Mars canyon sunset (blue aureole, ridges into warm haze), the whole-Moon and
day-side Mars globes, the black lunar sky with hard shadows and the lander in the same light.

"Visibly broken", and what was done:
- The figure's shadow a stick figure without a cloak (mars_ship_hero_dust), a black
  parallelogram (moon_ship_hero_jump): checked, both are the figure's own long low-Sun
  shadow (the first cut by the frame's top edge, the second the cloak streaming flat).
- The cloak a stiff stick or plank seen from the side (run, super speed): it streamed into
  a flat sheet; it now flutters like a flag along its own normal.
- Lunar dust like comic speed lines or sparks, brighter than the regolith: shorter,
  fainter, scattering less. Re-checked in the re-rendered picture.
- No three-point landing visible (moon_ship_hero_land): the pose was there but seen from
  behind under the cloak; the picture is now side-on.
- Pale bluish rocks on Mars, smeared ripple texture at the lander bench, the striped
  foreground slab in mars_wall, black shadow slivers in moon_ledge_orbit_low: existing
  terrain and rock work, listed as known problems.

## Independent critic, milestone 3 (screenshots and art rules only)

Thirty reference pictures, compared with Viking, Pathfinder, the rovers, Hubble and the
Apollo surface photographs. The five gaps, worst first, and what was done:

1. **Mars is one colour everywhere**: ground, cliffs, rocks and the globe the same tan;
   from orbit no Solis Lacus, no dark regions; craters and the canyon as white embossed
   lines. → a helper traced where the colour map's contrast is lost from orbit; another
   reworked the ground palette (see below).
2. **Landforms read as sand or dough**: Mount Sharp a rippled heap, canyon slopes like
   wax, blurry dark "tiger stripes" on the ground, the Olympus caldera wall near-white
   like snow, identical faceted rocks. → ground palette and texture helper; the large
   landform shapes are recorded under known problems.
3. **The Moon's light is soft**: few, small, soft shadows at mid-morning; the figure's
   shadow blurred; the sunrise view's foreground the whitest thing in the frame;
   blotches on the rille's far wall. → a helper on crisp shadows; the exposure of
   into-Sun views and of the night now follows how Apollo crews exposed.
4. **Bright sky bodies**: Earth a white oval in a glow, Deimos burnt out, Phobos cream
   and brighter than the sky. → Earth and Deimos belong to milestone 5. Phobos is lit
   by full sunlight and seen through the whole dusty sky, which adds to it, so it is
   brighter than the sky behind it; kept.
5. **The Mars sky**: the twilight a cream lens with a sharp lower edge; the daytime sky
   away from the Sun flat grey-brown. → milestone 5 (already in the known problems).

Kept, as the critic advised: the Martian sunset (`ledge`, `sun`), the Moon from space with
its seas and Tycho's rays, the crescent Mars with its bluish rim, the black airless sky,
Mount Hadley.

Reported as broken: a straight line across the ground at the Mars lander (the lip of a
small rock bench; in milestone 2 it was the edge of a wrong shadow, now fixed); a curved
material edge and a stair-stepped far ridge at Olympus; a box-like ledge with stretched
texture in `mars_wall`; stair-steps on the lunar sunrise ridge (no anti-aliasing yet);
soft puffs of lunar dust (now a spray of fine grains on clean arcs).

## Independent critic, milestone 2 (screenshots and art rules only)

Told that real surface maps from orbit and the simple character are scheduled. Ranked:

1. **A low Sun that casts no long shadows.** Rocks, lander and craters sit on evenly lit
   ground with a small smudge at most; from 120 km lunar craters are pale dimples. Real
   low-Sun frames are ruled by shadows many times longer than the objects. → 3
2. **The Moon is soft where it must be razor-sharp.** Blurred, wobbly edge on the big
   crater shadow, craters shading like blisters, the broken white line on the horizon, a
   glowing fringe on the globe, a ruler-straight terminator, ground like plaster. → 3
3. **Mars's colour and sky disagree from shot to shot.** A flat grey sky with no
   brightening toward the horizon over saturated orange clay in `mars_ship`; an olive
   drift in `mars_sun` and `mars_dusk`; chocolate ground in `mars_ledge`; the dusk glow
   is a cream lens with a visible upper edge. → 3
4. **Mars from orbit looks cloud-covered** even allowing for the missing map: a cream
   veil, faint vertical streaks in the low-orbit view, a fat fuzzy rim, no relief
   although the largest canyon lies below in raking light. → 3
5. **Sky bodies fall apart under a long lens.** Phobos's shadow edge was a staircase of
   facets (fixed straight away: the moons' meshes had one normal per face); Deimos burns
   out at dusk; Earth is a grey-white speck with no blue; `moon_dusk` is exposed as
   bright as day. → Earth 5; night exposure 3.

Strongest image: `mars_ledge` ("at a glance it passes for a rover sunset frame").
Weakest: `mars_ship` ("grey slab sky, monochrome orange clay, box rocks and a lander with
no shadow").

Compared with the first review, the gaps about the view from space (blown-out globes,
lit night sides, the stripe on the terminator, no edge glow) are gone from the list;
what replaced them is mostly the lunar surface and Martian colour, which milestone 3 is
for.

## Independent critic, milestone 1 (screenshots and art rules only)

Ranked, most damaging first. None of these were in milestone 1's scope; each is filed
under the milestone that owns it.

1. **Both worlds are blank from orbit.** Mars's day side is a blown-out cream ball with
   no canyon, volcanoes or dark markings; the Moon is one pale grey with a few dozen
   soft pits, no maria, highlands or rays. → 3 (real maps, both worlds from orbit); the
   over-exposed day side is an exposure fault to fix first → 2.
2. **The day–night boundary is wrong.** Night sides are visibly lit (Mars rust-red and
   more detailed than its day side), terminators are ruler-straight, Mars has a grey
   stripe darker than the night beyond it, the airless Moon has a soft glow around its
   lit edge, Mars's halo is thick and fuzzy, and the twilight in `mars_dusk` is a
   hard-edged lens. → 2 (edge glow, stripe, Moon halo), 3 (terminator, night side,
   twilight edge).
3. **A low Sun does not look low on the ground.** `mars_ship` reads as overcast noon
   with no contact shadows under the lander and rocks; at 7° the lunar ground is evenly
   grey and craters read as pale blisters, not shadow-filled bowls. → 2 (shadowed-canyon
   haze and sky light, contact shadows), 3 (ground materials).
4. **Lunar ground is uniform plaster.** Same grey in every direction and at every Sun
   height, `moon_dusk` looks like daytime with stars, craters are identical stamps, a
   broken white line runs along the horizon, Earth is a white speck with no blue.
   → 3 (lunar maps and materials), 2 (the white line), 5 (Earth).
5. **The character is a mannequin.** Ball head with no visor, pipe limbs, no backpack,
   a stiff rectangular cloak in saturated red, a suit that stays clean white in
   butterscotch light. → 2 (limbs, cloak), 4 (the rest).

Strongest image: `mars_sun` ("could pass for a Spirit/Curiosity sunset frame").
Weakest: `mars_ledge_orbit_globe`.

## Log

- **Foundation (before the charter)**: stages 0–9 of the original brief — skeleton and
  HDR pipeline, terrain, atmosphere, sky, shadows, rocks and lander, phone adaptation,
  the Moon swap, the flying character and flight between worlds.
- **Charter adopted**: `CLAUDE.md` rewritten from the owner's charter, `docs/ROADMAP.md`
  added, the replaced rules deleted (old hardware target, pixel caps, "no UI", Mars-only
  scope, the do-not-build list).
- **Milestone 1 built**: Pages workflow, build stamp, start screen, governor with Smooth
  and Sharp, benchmark and soak with a results screen, exact-pixel canvas, three-state
  HUD, `shots:all`, `stability` and `smoke` scripts. Removed `dynamicResolution.js`,
  `MAX_PIXELS`, `TARGET_FPS`, `MIN_SCALE` and the `?fps=` parameter.
- **Milestone 2 built**: exposure, sky light and edge glow from space; fade-in of new
  terrain; roll carried across the hand-over; faster lunar chunks; terrain shadow in the
  haze; clearer Martian air; rock ledges and a new lander view; bending limbs and a cloak
  that stays off them; Phobos and Deimos checked (and their faceted shading fixed);
  tools `sky-table`, `profile-chunks`, `build-check`; shot parameters `aim`, `east`,
  `north`, `debug`.
- **The owner's phone results and flight notes** (between milestones 2 and 3): both
  modes start at native resolution, chunk uploads are spread over frames, flight goes
  where it is aimed, gravity pulls when the stick is released, `HOVER` button.
- **Milestone 3 built**: the real Moon (LOLA, SLDEM2015, Clementine) with its scene at
  Hadley Rille; Mars in Viking colour; lunar photometry; landmark bookmarks with their
  own elevation patches (Olympus Mons, Gale, Tycho, Taurus-Littrow) and labels; dust;
  automatic shadow ceiling, per-texel baked sunlight, shadow rays that start from the
  ground as they see it; exposure rules for globes, small bright objects, dim scenes and
  the Sun on a ridge; `scripts/fetch-maps.py`; shot parameter `dust`.
- **During milestone 3, from the owner's notes**: Mars opens on the canyon's north rim;
  slower flight near the ground; a narrower lens; slope maps of both worlds for depth from
  space, Mars craters 1–30 km, finer detail from orbit, 4096-wide colour maps; Mars ground
  cover (dust, dark sand, bedrock), block rocks (helper); hard lunar shadows (helper);
  Mars's colours from orbit (helper); walking, super speed and real-gravity jumps on foot.
  Tools `foot-test`, `vista`/`cliff` searches (session scratch only), shot parameters
  `heropose=stand|walk|run|super|jump`, `posedir`, `debug=nofar|norelief|nofarrough|noboost`.
- **Milestone 4 (character and flight feel)**: cruise, boost, banking, climbing and
  feet-first poses; landing flare, three-point landing, launch pose, take-off dust; target
  list (this world's real places, the bodies in the sky, the Sun) with a marker, distance
  and trip time; GO hands-off trips with a transfer boost; chase-camera drift, sight over
  ridges, super-speed pull-back, figure hidden through the telephoto; darkening at the
  foot of the figure, the lander and rocks; the suit's detail (helper); dust clouds and
  sprays (helper). Tools `transfer`, `target`, `scripts/lib/glLimits.mjs` (phone shader
  limits in smoke and every screenshot run), `--distdir`; shot parameters
  `heropose=fast|bank|climb|land|launch`, `target=`, `debug=contactx4`.
- **Milestone 4 review** (owner's request after the checkpoint): 32 problems found by
  independent reviewers and fixed (GO arrival speed and hand-over heading, a real
  three-point landing, hover framing, dust timing and depth, contact spheres, HOVER in a
  fall, the GO button's place, the marker beyond the horizon and without the HUD, frame-
  rate independence); `transfer` flies with HOVER on and off through a turning frame; the
  headless tests ignore the software driver's performance notes. Milestone 4 `done`.
- **Foundation review and the owner's character** (after milestone 4): the robed,
  long-haired figure from the owner's references (`heroModel.js`, `robe.js`); 48 upheld
  findings of a 57-reviewer foundation review, fixed or recorded for their milestone;
  fixed budgets dropped by the owner, 180 terrain patches; `App.carryWith` / `turnAxes`;
  tests that can fail; shot parameter `posedir=front`. Tools: `stability --streaming`.
- **The gate and milestone 5**: the owner's second phone results; the charter rewritten
  round one goal; governor levers for slow work; Earth as a globe from NASA's GIBS maps
  (`scripts/fetch-earth.py`), its air, glint, clouds and lights; the Sun up close;
  eclipses; light from the world below; `at=` for pictures beside a body; a cloud
  environment `what-it-s-best-at` that allows the NASA and USGS map hosts.
- **Milestones 6 to 9** (the owner: "finish up the rest of the milestones", with the
  third benchmark): the ground drawn by one instanced mesh from texture arrays, uploads
  between frames; twelve new worlds as data (Phobos, Deimos, Mercury, Venus, Ceres, Io,
  Europa, Enceladus, Titan, Triton, Pluto, Charon) and Earth's surface with a sea and
  clouds; orbits fitted to JPL Horizons, Jupiter's drifting bands, Saturn's rings; the
  menu, the solar system map, the clock and dates, the warp effect; the journal, photo
  mode, saves, sound. Reviewed by one workflow (25 findings, all fixed: "Milestones 6 to
  9 review"). Tools: `worlds`, `ui`, `peek.mjs`, `check-ephemeris.mjs`, `fit-orbits.py`,
  `fetch-worlds.py`, `fetch-earth-terrain.py`.
- **Milestone 10, a living Earth** (the owner, with the fourth phone results): governor
  tuned (resolution first, strides, each world's level remembered) and an Earth
  benchmark; Earth streamed from AWS Terrain Tiles and NASA GIBS (rings, a tile worker,
  rebuild in place, a test mirror); the sea, lakes and rivers from the land's shape and
  real rainfall; forests of each region's trees, wind, seasons, leaves; a cloud volume;
  the weather of 8 September 2017 (three hurricanes), rain, snow, lightning, thunder, a
  rainbow. Reviewed by one workflow (30 findings fixed). Tools: `fetch-earth-climate.py`,
  `fetch-earth-weather.py`; `debug=flash`.
