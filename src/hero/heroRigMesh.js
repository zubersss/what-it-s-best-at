// The owner's rigged character drawn (public/data/hero_rig.bin and .jpg, from the owner's
// Meshy file: scripts/make-hero-rig.mjs; docs/ASSETS.md). A skinned surface with its own
// picture for colour: each vertex goes with up to four of the skeleton's 24 joints, whose
// matrices (heroRig.js, posed by heroAnim.js) are handed over as uniforms once a frame: no
// texture is read for a vertex. Lit by the game's one light like every other surface.
//
// Three meshes: the whole surface for the picture, a lighter one (the governor's 'figure'
// saving), and the shape alone for the shadow map (in no scene: the shadow pass draws it).
// The robe's inside shows where it opens, so both sides are drawn.
import * as THREE from 'three';
import { LIGHTING_PARS } from '../render/lightingGlsl.js';
import { parseHero } from './heroFile.js';
import { HeroRig } from './heroRig.js';
import { HeroAnim } from './heroAnim.js';

const JOINTS = 24;
const SKIN = /* glsl */`
uniform vec4 uJoints[${JOINTS * 3}];
in vec4 aJoints; in vec4 aWeights;
void carriers(out vec4 r0, out vec4 r1, out vec4 r2) {
  r0 = vec4(0.0); r1 = vec4(0.0); r2 = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = aWeights[k]; if (w <= 0.0) continue;
    int j = int(aJoints[k] + 0.5) * 3;
    r0 += w * uJoints[j]; r1 += w * uJoints[j + 1]; r2 += w * uJoints[j + 2];
  }
}`;
const VERT = /* glsl */`
${SKIN}
in vec2 aUv;
out vec3 vRel; out vec3 vN; out vec2 vUv;
void main() {
  vec4 r0, r1, r2; carriers(r0, r1, r2);
  vec4 p = vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(dot(r0, p), dot(r1, p), dot(r2, p), 1.0);
  vRel = w.xyz; vUv = aUv;
  vN = normalize(mat3(modelMatrix) * vec3(dot(r0.xyz, normal), dot(r1.xyz, normal), dot(r2.xyz, normal)));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uSunVis;
uniform sampler2D tHero;
in vec3 vRel; in vec3 vN; in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 albedo = texture(tHero, vUv).rgb;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel), L = uSunDir;
  float NL = dot(N, L), NV = max(dot(N, V), 1e-3);
  vec3 Esun = directSun(planetPos) * uSunVis * nearShadow(vRel, N);
  vec3 sky = skyLight(N, up) + planetShine(N) + homeShine(N, up);
  // cloth, hair and skin alike: light wrapped a little past the edge of the shade (it is all
  // soft stuff), a broad silk sheen, a soft glow at grazing angles
  float wrap = max((NL + 0.25) / 1.25, 0.0);
  vec3 col = albedo * (Esun * wrap + sky) / PI;
  vec3 H = normalize(L + V);
  col += albedo * Esun * max(NL, 0.0) * pow(max(dot(N, H), 0.0), 16.0) * 0.14;
  col += albedo * sky * pow(1.0 - NV, 2.0) * 0.2 / PI;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
}`;
const DEPTH_VERT = /* glsl */`
${SKIN}
void main() { vec4 r0, r1, r2; carriers(r0, r1, r2); vec4 p = vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(dot(r0, p), dot(r1, p), dot(r2, p), 1.0); }`;

function geometryOf(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  if (m.normal) g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 4, true));
  if (m.uv) g.setAttribute('aUv', new THREE.BufferAttribute(m.uv, 2, true));
  g.setAttribute('aJoints', new THREE.BufferAttribute(m.joints, 4));
  g.setAttribute('aWeights', new THREE.BufferAttribute(m.weights, 4, true));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2.6);     // (the surface moves in the shader)
  return g;
}

export class HeroRigMesh {
  // hero: the Hero that places and turns the figure. buffer: hero_rig.bin. image: its picture
  // (an ImageBitmap or an image element).
  constructor(hero, buffer, image) {
    const file = parseHero(buffer);
    if (file.kind !== 'rig' || file.joints.length !== JOINTS) throw new Error('not the rigged character this build draws');
    this.hero = hero; this.rig = new HeroRig(file); this.anim = new HeroAnim(this.rig);
    this.joints = new Float32Array(JOINTS * 12);
    this.texture = new THREE.Texture(image);
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.flipY = false; this.texture.anisotropy = 4;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.magFilter = THREE.LinearFilter; this.texture.generateMipmaps = true;
    this.texture.needsUpdate = true;
    this.uniforms = { ...hero.uniforms, uJoints: { value: this.joints }, tHero: { value: this.texture } };       // (the figure's own light: one set of uniform objects)
    this.material = new THREE.ShaderMaterial({ name: 'HeroRig', glslVersion: THREE.GLSL3, defines: { ...hero.material.defines }, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.depthMaterial = new THREE.ShaderMaterial({
      name: 'HeroRigDepth', glslVersion: THREE.GLSL3, side: THREE.DoubleSide, colorWrite: false, uniforms: { uJoints: this.uniforms.uJoints },
      vertexShader: DEPTH_VERT, fragmentShader: `layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    this.geometries = [geometryOf(file.lods[0]), geometryOf(file.lods[1])];
    this.triangles = file.lods.map((m) => m.triangles);
    this.mesh = new THREE.Mesh(this.geometries[0], this.material); this.mesh.frustumCulled = false;
    this.shadowMesh = new THREE.Mesh(geometryOf(file.lods[2]), this.depthMaterial);
    this.shadowMesh.frustumCulled = false; this.shadowMesh.matrixAutoUpdate = false; this.shadowMesh.userData.shadowFocus = hero.group;
    this.light = false;                                   // governor: the picture from the lighter mesh
  }

  // Whether this device has made the shaders (asked once they have been used): null while
  // they have not been made yet, false if one could not be.
  drawable(renderer) {
    const made = (renderer.info.programs || []).filter((p) => p.name === 'HeroRig' || p.name === 'HeroRigDepth');
    if (!made.some((p) => p.name === 'HeroRig')) return null;
    return !made.some((p) => p.diagnostics && p.diagnostics.runnable === false);
  }

  // The skeleton posed for this frame's state (Hero.update calls it).
  pose(dt, state) { this.anim.update(dt, state); }

  // Once a frame, after the figure is placed: the joints' matrices in the group's frame.
  update() {
    const hero = this.hero;
    hero.body.updateMatrix();
    this.rig.palette(this.joints, hero.body.matrix.elements);
    const g = this.geometries[this.light ? 1 : 0]; if (this.mesh.geometry !== g) this.mesh.geometry = g;
    this.shadowMesh.matrix.copy(hero.group.matrixWorld); this.shadowMesh.matrixWorld.copy(hero.group.matrixWorld);
  }
}
