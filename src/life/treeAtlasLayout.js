// Where things are in the trees' picture (public/data/tree_atlas.png, made by
// scripts/make-tree-atlas.mjs from life/treeAtlasGen.js): sprays of foliage on the left,
// whole trees seen from the side on the right. Shared by what draws the picture, what
// builds the tree meshes (their texture coordinates) and the preview.
//
// Row 0 of the picture is its top; v runs downward. A spray has its root at the left of
// its cell and its tip at the right. A whole tree stands on the bottom of its cell.
//
// The sprays are 512 pixels: a card a metre and a quarter long (what the nearest trees
// are made of) holds 400 texels a metre, which is a texel a pixel from 3.4 m on a screen
// 1 440 pixels tall. (They were 256 on cards four metres long: 60 texels a metre.)
export const ATLAS_W = 4096, ATLAS_H = 2048;
export const SPRAY = 512, SPRAY_COLS = 4;            // sprays: 4 x 4 cells of 512
export const IMP_X0 = 2048, IMP_W = 256, IMP_H = 512, IMP_COLS = 8; // whole trees: 8 across, 4 rows; shape a, variant v is cell a * 3 + v
// A whole tree's cell covers this much of the tree's own space: x from -IMP_HALF to
// IMP_HALF, y from 0 to IMP_TALL.
export const IMP_HALF = 0.55, IMP_TALL = 1.1;

// fir: a bough from the side (the middle distance); firTop: a frond from above; firHang: the
// twigs hanging under a bough; pine, pine2: bursts of needles; pineTwig: a branch's end
// with its tufts; leaf, leaf2, aspen, big, fine: twigs of leaves; blossom: a twig in flower;
// tuft: a juniper's; roseN, roseL, roseB: crowns from straight above (needles, leaves, blossom).
export const SPRAYS = { fir: 0, firTop: 1, pine: 2, leaf: 3, leaf2: 4, aspen: 5, big: 6, fine: 7, tuft: 8, pine2: 9, roseN: 10, roseL: 11, firHang: 12, pineTwig: 13, blossom: 14, roseB: 15 };

// [u0, v0, u1, v1] of a spray's cell, a pixel and a half inside it.
export function sprayRect(i) {
  const x = (i % SPRAY_COLS) * SPRAY, y = Math.floor(i / SPRAY_COLS) * SPRAY, m = 1.5;
  return [(x + m) / ATLAS_W, (y + m) / ATLAS_H, (x + SPRAY - m) / ATLAS_W, (y + SPRAY - m) / ATLAS_H];
}
// Where a whole tree's cell begins (shape, variant): [x, y] in pixels.
export function impostorCell(arch, variant) { const i = arch * 3 + variant; return [IMP_X0 + (i % IMP_COLS) * IMP_W, Math.floor(i / IMP_COLS) * IMP_H]; }
// ... and its [u0, v0, u1, v1].
export function impostorRect(arch, variant) {
  const [x, y] = impostorCell(arch, variant), m = 1.5;
  return [(x + m) / ATLAS_W, (y + m) / ATLAS_H, (x + IMP_W - m) / ATLAS_W, (y + IMP_H - m) / ATLAS_H];
}

// Crown tops: a tree's crown seen from above (the far mesh's rosette, which the far forest
// draws too): solid rounded masses of clumps, 256 pixels, in the whole trees' free cells
// (shapes 9 x 3 variants fill 27 of the 32). N needles, L leaves, B blossom.
export const CROWN = 256, CROWN_X0 = IMP_X0 + 3 * IMP_W, CROWN_Y0 = 3 * IMP_H;
export const CROWNS = { N: 0, L: 1, B: 2 };
export function crownCell(k) { return [CROWN_X0 + (k % 5) * CROWN, CROWN_Y0 + Math.floor(k / 5) * CROWN]; }
export function crownRect(k) {
  const [x, y] = crownCell(k), m = 1.5;
  return [(x + m) / ATLAS_W, (y + m) / ATLAS_H, (x + CROWN - m) / ATLAS_W, (y + CROWN - m) / ATLAS_H];
}

