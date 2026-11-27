// The clouds' shade on the trees, the far forest and the far grass: the names they read it by.
//
// What stood here was a map of its own: 256 x 256 points 55 m apart on a level plane through the
// ground under the traveller, worked out once a frame by the ground's own cloud rule and read
// once per vertex of a tree. That plane moved with the traveller, so a tree at a shadow's edge
// changed by up to 0.44 in light as one walked (the owner's "the shadows ... get jumpy when I'm
// moving around near them"). Its place is taken by the cloud-shade atlas, which is fixed to the
// world and read by the ground, the trees, the far forest, the grass, the far rocks and - through
// a probe read back from the GPU - the figure and the things near it: src/sky/cloudShade.js.
//
// The three names below are the ones life/trees.js, life/farForest.js and life/grass.js read the
// shade by, so none of them changed: TREE_SHADE_VERT still declares what it needs and still
// answers cloudShade(rel) for a place `rel` metres from the camera in the planet's axes, and
// TREE_SHADE_UNIFORMS is still the one set of uniform objects they spread into their materials.
// TreeShade is the atlas itself, under the name sky/skySystem.js builds it by.
export { CLOUD_SHADE_UNIFORMS as TREE_SHADE_UNIFORMS, SHADE_READ_GLSL as TREE_SHADE_VERT, CloudShade as TreeShade } from '../sky/cloudShade.js';
