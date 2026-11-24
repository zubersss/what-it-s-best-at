// The far tree's forms by how steeply it is looked down on (life/farForest.js draws them;
// scripts/far-tree-above.mjs sketches them without a browser from the mirror below).
//
// A far tree is three quads: two crossed upright pictures of the whole tree and a rosette
// lying in its crown; for a traveller in the air a fourth, its shadow. From the side the
// upright ones are the tree. From above they are on edge and show nothing, and what the
// tree is from there is its crown's top, and its shadow on the ground beside it. So, by the
// sine of the angle the tree is looked down at (`down`: 0 from the side, 1 from straight
// above), everything **blended**, nothing switched:
//
// - the rosette is the crown's top. Where the trees are thinned by distance, a tree that is
//   kept stands for the 1 / keep trees round it: from above the rosette spreads toward
//   their ground (wider by a power of 1 / keep, TOP_POW below), **where the wood is
//   closed** (`closed`, from the chance a site there has of carrying a tree): a closed wood
//   then stays a wood from above at every distance. A lone tree on open ground stays a
//   lone tree of its own size.
// - the upright pictures draw in to nothing from 49 degrees to 68 (steeper than that they
//   are a pair of bright lines crossed on every crown);
// - the shadow is the picture of the whole tree laid on the ground along the Sun's ray: the
//   tree's own outline, as long as the Sun is low. (It was first made of the second upright
//   picture, which left a tree looked down on at 30 to 50 degrees with one picture, a line
//   from two sides of it.)
//
// The shadow's quad is handed over only from the air (two triangles a tree more, there);
// none of the rest is seen from the ground (down < TOP0).

export const TOP0 = 0.30, TOP1 = 0.72;        // the rosette spreads between these
export const TOP_POW = 0.17;                  // ... by keep^-(1/4 + this) in a closed wood. (At 1/4 more the cover would be kept whole, and every
                                              // crown would look the same size on the screen at any distance: a forest with no depth.
                                              // A closed wood's crowns overlap two deep, so less keeps it closed for kilometres.)
export const TOP_MAX = 8;                     // ... and to at most this many crown widths
export const CLOSED0 = 0.12, CLOSED1 = 0.45;  // a site's chance of a tree: an open scatter below, a closed wood above
export const SHADOW0 = 0.30, SHADOW1 = 0.50;  // the shadow darkens in between these
export const EDGE0 = 0.75, EDGE1 = 0.93;      // the upright pictures draw in to nothing between these (from 49 degrees to 68: steeper than
                                              // that they are bright slivers beside the crown's top, scratches on the wood)
export const SHADOW_DARK = 0.5;               // how much of the ground's light shadow takes: one tree's alone, or those of a wood's edge lying over one another
export const SITE_M2 = 49;                    // the ground one tree site has (m2)
export const SHADOW_LONG = 5.0;               // a shadow is at most this many tree heights long
export const SHADOW_FAR0 = 1600, SHADOW_FAR1 = 4200;   // shadows fade out between these distances (m): the air's own light lies over them
export const END_ABOVE = 0.6;                 // seen from above the far forest's trees begin to draw in at this share of its reach (0.86 from the side)
export const DENS_STEPS = 31;                 // the site's chance is carried in this many steps beside the tree's rank

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// How wide the tree's parts stand, in crown widths. keep: the share of sites drawn at its
// distance; down: see above; dens: its site's chance of a tree (0..1).
export function widths(keep, down, dens) {
  const side = Math.min(1.5, Math.max(1, Math.pow(Math.max(keep, 1e-3), -0.25)));
  const closed = ss(CLOSED0, CLOSED1, dens);
  const top = side + (Math.min(TOP_MAX, Math.max(side, Math.pow(Math.max(keep, 1e-4), -0.25 - TOP_POW))) - side) * closed;
  return {
    card: side * (1 - ss(EDGE0, EDGE1, down)),
    rose: side + (top - side) * ss(TOP0, TOP1, down),
    shadow: ss(SHADOW0, SHADOW1, down),
  };
}

// The same in the vertex shader. Expects: keep, down, dens (floats). Gives: wCard, wRose
// (crown widths), wShadow (0..1).
export const FORM_GLSL = /* glsl */`
  float wSide = clamp(pow(max(keep, 1e-3), -0.25), 1.0, 1.5);
  float wClosed = smoothstep(${CLOSED0.toFixed(3)}, ${CLOSED1.toFixed(3)}, dens);
  float wTop = mix(wSide, clamp(pow(max(keep, 1e-4), -0.25 - ${TOP_POW.toFixed(3)}), wSide, ${TOP_MAX.toFixed(2)}), wClosed);
  float wCard = wSide * (1.0 - smoothstep(${EDGE0.toFixed(3)}, ${EDGE1.toFixed(3)}, down));
  float wRose = mix(wSide, wTop, smoothstep(${TOP0.toFixed(3)}, ${TOP1.toFixed(3)}, down));
  float wShadow = smoothstep(${SHADOW0.toFixed(3)}, ${SHADOW1.toFixed(3)}, down);
`;

// How dark one tree's shadow is. Shadows multiply where they lie over one another, and at
// a wood's edge several do: each is made so much lighter that the lot of them come to
// SHADOW_DARK. area: the shadow's own ground (m2); dens, keep: as above.
export function shadowAlpha(area, dens, keep) { return 1 - Math.pow(1 - SHADOW_DARK, 1 / Math.max(1, dens * keep * area / SITE_M2)); }
export const SHADOW_GLSL = /* glsl */`
  float shadowAlpha(float area, float dens, float keep) { return 1.0 - pow(${(1 - SHADOW_DARK).toFixed(3)}, 1.0 / max(1.0, dens * keep * area / ${SITE_M2.toFixed(1)})); }
`;

// The far green: from the line where the near trees end (nothing changes there) out to a
// kilometre and more a far tree's leaf colour goes over to a dark warm olive of the same
// brightness. Here so that whatever stands in for far trees (the canopy the ground raises
// between and beyond them) can be the same green by the same rule: leaf is a leaf's colour
// as the trees have it before the light (a species' leaf albedo x 0.61, through paintLeaf
// of life/trees.js in the painted look, x 0.76 for the tone of the cut-out), dist metres
// from the eye.
export const FAR_GREEN_GLSL = /* glsl */`
float farGreenW(float dist) { return smoothstep(300.0, 1300.0, dist); }
vec3 farGreen(vec3 leaf, float dist) { return mix(leaf, dot(leaf, vec3(0.3, 0.6, 0.1)) * vec3(0.72, 0.88, 0.38), 0.7 * farGreenW(dist)); }
`;

// The canopy the ground raises under and beyond the far trees (terrain/terrainMaterial.js,
// farCanopyColour): its leaf colour before the light, and how much of the land's colour map
// it wears, **from the world's own data** (review farforest-4: a constant here was one
// world's flora written into every world's ground). A world says it in
// `life.trees.far.canopy: { leaf: [r, g, b], tint }`; without `leaf`, it is the mean leaf of
// the flora that grows where no land class is named (`life.flora`, the forest's entries), as
// the far trees have it: a species' leaf albedo x 0.61, x 1.12 for a crown's top, x 0.76 for
// the tone of the trees' cut-out. Gives [r, g, b, tint]; null for a world with no trees.
export const CANOPY_TONE = 0.61 * 1.12 * 0.76;
export function canopyLeaf(world, species) {
  const life = world.life, c = life?.trees?.far?.canopy || {};
  if (!life?.trees) return null;
  let leaf = c.leaf;
  if (!leaf) {
    const forest = (life.flora || []).filter((f) => !f.classes && !f.near), from = forest.length ? forest : (life.flora || []);
    const sum = [0, 0, 0]; let w = 0;
    for (const f of from) for (const [k, wk] of f.mix) { const sp = species[k]; if (!sp) continue; for (let i = 0; i < 3; i++) sum[i] += sp.leaf[i] * wk; w += wk; }
    if (!w) for (const sp of species) { for (let i = 0; i < 3; i++) sum[i] += sp.leaf[i]; w++; }
    leaf = sum.map((v) => v / w * CANOPY_TONE);
  }
  return [leaf[0], leaf[1], leaf[2], c.tint ?? 0];
}
