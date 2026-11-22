// Where things are in the trees' picture (public/data/tree_atlas.png, made by
// scripts/make-tree-atlas.mjs from life/treeAtlasGen.js): sprays of foliage on the left,
// whole trees seen from the side on the right. Shared by what draws the picture, what
// builds the tree meshes (their texture coordinates) and the preview.
//
// Row 0 of the picture is its top; v runs downward. A spray has its root at the left of
// its cell and its tip at the right. A whole tree stands on the bottom of its cell.
export const ATLAS_W = 2048, ATLAS_H = 1024;
export const SPRAY = 256, SPRAY_COLS = 3;            // sprays: 3 x 4 cells of 256
export const IMP_X0 = 768, IMP_W = 160, IMP_H = 320; // whole trees: 8 shapes across, 3 variants down
// A whole tree's cell covers this much of the tree's own space: x from -IMP_HALF to
// IMP_HALF, y from 0 to IMP_TALL.
export const IMP_HALF = 0.55, IMP_TALL = 1.1;

export const SPRAYS = { fir: 0, firTop: 1, pine: 2, leaf: 3, leaf2: 4, aspen: 5, big: 6, fine: 7, tuft: 8, pine2: 9, roseN: 10, roseL: 11 };

// [u0, v0, u1, v1] of a spray's cell, a pixel and a half inside it.
export function sprayRect(i) {
  const x = (i % SPRAY_COLS) * SPRAY, y = Math.floor(i / SPRAY_COLS) * SPRAY, m = 1.5;
  return [(x + m) / ATLAS_W, (y + m) / ATLAS_H, (x + SPRAY - m) / ATLAS_W, (y + SPRAY - m) / ATLAS_H];
}
// ... and of a whole tree's (shape 0..7, variant 0..2).
export function impostorRect(arch, variant) {
  const x = IMP_X0 + arch * IMP_W, y = variant * IMP_H, m = 1.5;
  return [(x + m) / ATLAS_W, (y + m) / ATLAS_H, (x + IMP_W - m) / ATLAS_W, (y + IMP_H - m) / ATLAS_H];
}
