// Which make a near tree gets (life/trees.js): the close mesh (the whole skeleton, sprays a
// metre long), the near mesh (the same skeleton, a few large sprays) or its picture on two
// crossed cards, by its distance from the eye. Pure numbers (no three, no DOM): the trees
// use it and scripts/trees-near-test.mjs replays a walk with it.
//
// Two lists, made at two paces. The whole list (every tree within reach, the far cards, the
// trees in flower) is made when the eye has moved REBUILD_M from where it was made: that is
// a few thousand trees. The close and near lists are a few hundred and are made again when
// the eye has moved `fineStep`: a tree's make is chosen by its distance from where the eye
// was at most that far back (it was from where the whole list was made, up to 25 m back,
// more than the close radius: no tree was sure of its close mesh). The far cards are not
// made again at that pace: the far list holds every tree that may need them before the whole
// list is made again, and each far card is cut in the vertex shader when its tree stands
// inside the near radius of the eye at the last choice (`farCut`), where the near lists have it.

// Trees nearer than these get the close and the near mesh. They were 42 and 115 m: a forest
// is paid for in layers of cut-out pixels, and from 60 m a tree on the phone is no taller
// than its picture is.
export const CLOSE_M = 20, NEAR_M = 60;
export const REBUILD_M = 25;                 // the whole list is made again when the eye has moved this far

// The radii in use: the governor's trees-far step shortens both (fraction), its
// tree-leaves step takes the close mesh away (closeOn false), and with it the near trees'
// shadows of skeleton and sprays (castMake).
export const radii = (fraction, closeOn = true) => ({ close: closeOn ? CLOSE_M * fraction : 0, near: NEAR_M * fraction });

// How far the eye may move before the close and near lists are made again: a quarter of the
// smallest radius in use, or of the distance to the nearest tree at the last choice when that
// is more (from 40 m up the nearest tree is 40 m off, and beside a rim it is the tree, not
// the ground under the eye, that counts), and no less than a fifth of a second's travel (at
// super speed, 60 m/s, a tree is past in a third of a second: nobody sees its make); 2 m at
// least, REBUILD_M at most. A tree D away then comes no nearer than about 3D/4 before the
// next choice.
export const fineStep = (fraction, closeOn, nearest, speed = 0) => {
  const r = radii(fraction, closeOn), small = r.close > 0 ? r.close : r.near;
  return Math.min(REBUILD_M, Math.max(2, Math.max(small, nearest || 0) / 4, speed * 0.2));
};

// What to make this frame: 2 the whole list, 1 the close and near lists, 0 nothing.
// dWhole2, dFine2: the eye's distance squared from where each was last made.
export const toMake = (dirty, dWhole2, dFine2, step) => (dirty || dWhole2 > REBUILD_M * REBUILD_M ? 2 : dFine2 > step * step ? 1 : 0);

// The far list: every tree that can stand at or beyond the near radius of the eye at a
// choice made before the whole list is made again (the eye is then within REBUILD_M of where
// the whole list was made). d2: its distance squared from there.
export const inFarList = (d2, near) => d2 >= Math.max(0, near - REBUILD_M) ** 2;
// The close and near lists are chosen from the trees within this of where the whole list was made.
export const nearCandidates = (near) => near + REBUILD_M;
// A tree's make by its distance squared from the eye at the choice: 0 close, 1 near, 2 the far card.
export const makeOf = (d2, close, near) => (d2 < close * close ? 0 : d2 < near * near ? 1 : 2);
// Which of a tree's meshes casts its shadow (0 close, 1 near, 2 the far cards), by the make it
// is drawn with and whether the lists were made with a close radius (the governor's
// tree-leaves step takes it away). With one: the near mesh while the tree is drawn with
// skeleton and sprays (never the close mesh: every spray of every tree within 150 m was as
// many triangles again as the view itself), its cards once it is drawn so, so that a shadow
// changes where its tree does, at the near radius (cast as cards from the close radius on,
// 25 to 70 % of a tree's shadow changed in one frame 20 m from the walker). Without one,
// every tree casts its cards, as every tree did then whenever the close mesh was given up:
// the saving takes back the shadow pass's added work with the leaves (north wood, tree
// triangles a wide tile draw: 113k with near meshes, 28k as cards), and the governor's floor
// draws what it drew before (0.6k there; with near meshes 38k, and no saving left to give up).
export const castMake = (lod, close) => (close ? Math.max(1, lod) : 2);
// The far card's cut, as the vertex shader makes it (length(iA.xyz - uLodCut.xyz) < uLodCut.w):
// a hair inside the near radius, so that a tree exactly on it is drawn twice for one choice
// rather than by nobody (single precision on the GPU against double here).
export const CUT_IN = 0.01;
export const farCut = (d2, near) => d2 < (near - CUT_IN) * (near - CUT_IN);
