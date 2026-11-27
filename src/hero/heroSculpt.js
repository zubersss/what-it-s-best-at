// The character as the owner sculpted it (public/data/hero.bin, made from the sculpt by
// scripts/make-hero.mjs; docs/ASSETS.md), drawn in place of the figure built in code
// (heroModel.js). The motion is still Hero's: its nine rigid parts and the simulated cloth
// (robe.js) are what move, and the sculpt's surface goes with them: each vertex is carried
// by up to two parts beside the torso, and by its share of cloth by up to four of the
// cloth's particles instead, each of which turns and moves the sculpt round it
// (heroPalette.js says how; scripts/hero/heroBind.mjs chose which). The vertex shader does
// that sum from a small texture of matrices written once a frame.
//
// Two meshes: the full one for the picture, a lighter one for the shadow map (and for the
// picture under the governor's 'figure' saving). The sculpt is a closed surface: only its
// outside is drawn (inside it the cloth's two faces cross each other in motion).
import * as THREE from 'three';
import { parseHero } from './heroFile.js';
import { HERO_FRAG } from './heroModel.js';
import { PARTS, PALETTE_W, paletteTexels, fillPalette } from './heroPalette.js';

const SKIN = /* glsl */`
uniform highp sampler2D uPalette;
// (the nine parts' rows as plain numbers: a vertex with no loose cloth, which is the body, the
// boots, the hands, the head and most of what is drawn, reads no texture at all; it read nine)
uniform vec4 uPartRows[${PARTS * 3}];
in vec4 aParts; in vec4 aMovers; in vec4 aShares;
vec4 pal(int k) { return texelFetch(uPalette, ivec2(k % ${PALETTE_W}, k / ${PALETTE_W}), 0); }
// The rows of the matrix that takes this vertex from where the sculpt stands to where it is
// now: the parts that carry it, and by its share of cloth the particles it goes with.
void carriers(out vec4 r0, out vec4 r1, out vec4 r2) {
  int a = int(aParts.x + 0.5) * 3, b = int(aParts.y + 0.5) * 3;
  float w = aParts.z / 255.0, t = aParts.w / 255.0, u = 1.0 - w - t;
  r0 = uPartRows[a] * u + uPartRows[b] * w + uPartRows[0] * t;
  r1 = uPartRows[a + 1] * u + uPartRows[b + 1] * w + uPartRows[1] * t;
  r2 = uPartRows[a + 2] * u + uPartRows[b + 2] * w + uPartRows[2] * t;
  float cloth = aShares.x + aShares.y + aShares.z + aShares.w;
  if (cloth > 0.0) {
    r0 *= 1.0 - cloth; r1 *= 1.0 - cloth; r2 *= 1.0 - cloth;
    for (int k = 0; k < 4; k++) {
      float sh = aShares[k]; if (sh <= 0.0) continue;
      int c = (${PARTS} + int(aMovers[k] + 0.5)) * 3;
      r0 += sh * pal(c); r1 += sh * pal(c + 1); r2 += sh * pal(c + 2);
    }
  }
}
vec3 moved(vec4 r0, vec4 r1, vec4 r2) { vec4 p = vec4(position, 1.0); return vec3(dot(r0, p), dot(r1, p), dot(r2, p)); }`;

const VERT = /* glsl */`
${SKIN}
in vec4 aColour;
out vec3 vRel; out vec3 vN; out vec3 vCol; flat out float vMat; out vec3 vT;
void main() {
  vec4 r0, r1, r2; carriers(r0, r1, r2);
  vec4 w = modelMatrix * vec4(moved(r0, r1, r2), 1.0);
  vRel = w.xyz; vCol = aColour.rgb * aColour.rgb; vMat = aColour.a * 255.0;      // (the colour is kept as its root)
  vN = normalize(vec3(dot(r0.xyz, normal), dot(r1.xyz, normal), dot(r2.xyz, normal)));
  vT = vec3(r0.y, r1.y, r2.y);                                                    // hair runs down the figure, turned as its cloth is
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const DEPTH_VERT = /* glsl */`
${SKIN}
void main() { vec4 r0, r1, r2; carriers(r0, r1, r2); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(moved(r0, r1, r2), 1.0); }`;

function geometryOf(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('aColour', new THREE.BufferAttribute(m.colour, 4, true));
  g.setAttribute('aParts', new THREE.BufferAttribute(m.parts, 4));
  g.setAttribute('aMovers', new THREE.BufferAttribute(m.movers, 4));
  g.setAttribute('aShares', new THREE.BufferAttribute(m.shares, 4, true));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  // (the surface moves in the shader: a sphere round the whole figure, cloth streaming and all)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2.2);
  return g;
}

export class HeroSculpt {
  // hero: the Hero whose parts and cloth move it. buffer: the file.
  constructor(hero, buffer) {
    const file = parseHero(buffer);
    this.hero = hero; this.shared = file.shared;
    const count = hero.robe.count;
    if (file.shared.rest.length !== count * 3) throw new Error(`the character's file was bound to a cloth of ${file.shared.rest.length / 3} particles, the game's has ${count}: run scripts/make-hero.mjs`);
    const h = Math.ceil(paletteTexels(count) / PALETTE_W);
    this.data = new Float32Array(PALETTE_W * h * 4);
    this.palette = new THREE.DataTexture(this.data, PALETTE_W, h, THREE.RGBAFormat, THREE.FloatType);
    this.palette.minFilter = this.palette.magFilter = THREE.NearestFilter; this.palette.generateMipmaps = false;
    this.partRows = new Float32Array(PARTS * 12);
    this.uniforms = { ...hero.uniforms, uPalette: { value: this.palette }, uPartRows: { value: this.partRows } };       // (the figure's own light: one set of uniform objects)
    this.material = new THREE.ShaderMaterial({ name: 'HeroSculpt', glslVersion: THREE.GLSL3, defines: { ...hero.material.defines, SCULPT: 1 }, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: HERO_FRAG, side: THREE.FrontSide });
    this.depthMaterial = new THREE.ShaderMaterial({
      name: 'HeroSculptDepth', glslVersion: THREE.GLSL3, side: THREE.DoubleSide, colorWrite: false, uniforms: { uPalette: this.uniforms.uPalette, uPartRows: this.uniforms.uPartRows },
      vertexShader: DEPTH_VERT, fragmentShader: `layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    this.geometries = file.lods.map(geometryOf);
    this.triangles = file.lods.map((m) => m.triangles);
    this.mesh = new THREE.Mesh(this.geometries[0], this.material); this.mesh.frustumCulled = false;
    // The shadow's mesh is in no scene (the picture never draws it): the near shadow map
    // draws it by itself, where the figure's group is.
    this.shadowMesh = new THREE.Mesh(this.geometries[this.geometries.length - 1], this.depthMaterial);
    this.shadowMesh.frustumCulled = false; this.shadowMesh.matrixAutoUpdate = false; this.shadowMesh.userData.shadowFocus = hero.group;
    this.light = false;                                   // governor: the picture from the lighter mesh too
    this._inv = Array.from({ length: PARTS }, (_, i) => new THREE.Matrix4().fromArray(file.shared.partsRest, i * 16).invert());
    this._m = Array.from({ length: PARTS }, () => new THREE.Matrix4());
    this._e = this._m.map((m) => m.elements);
  }

  // Whether this device has made the sculpt's shaders (asked once they have been used): null
  // while they have not been made yet, false if one could not be: then the figure built in
  // code must take over (Hero.dropSculpt), or there is no figure at all.
  drawable(renderer) {
    const made = (renderer.info.programs || []).filter((p) => p.name === 'HeroSculpt' || p.name === 'HeroSculptDepth');
    if (!made.some((p) => p.name === 'HeroSculpt')) return null;
    return !made.some((p) => p.diagnostics && p.diagnostics.runnable === false);
  }

  // Once a frame, after the figure is posed and its cloth has moved: the palette. Returns
  // the texture (to be handed to the GPU before the picture is begun: App.updateHero).
  update() {
    const hero = this.hero, parts = hero.parts;
    hero.body.updateMatrix();
    for (let i = 0; i < PARTS; i++) { parts[i].updateMatrix(); this._m[i].multiplyMatrices(hero.body.matrix, parts[i].matrix).multiply(this._inv[i]); }
    fillPalette(this.data, this._e, hero.robe.pos, this.shared);
    this.partRows.set(this.data.subarray(0, PARTS * 12));
    this.palette.needsUpdate = true;
    const g = this.geometries[this.light ? this.geometries.length - 1 : 0]; if (this.mesh.geometry !== g) this.mesh.geometry = g;
    this.shadowMesh.matrix.copy(hero.group.matrixWorld); this.shadowMesh.matrixWorld.copy(hero.group.matrixWorld);
    return this.palette;
  }
}
