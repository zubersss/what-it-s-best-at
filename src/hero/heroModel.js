// How the character looks: its parts (built from code, like the lander), their colours
// and the shader that lights them. How it moves is hero.js.
//
// Local frame of the figure: +Y = toward the head, +Z = chest, +X = its left. Metres.
// Each part carries a colour (aCol) and a material index (aMat): 0 suit fabric, 1 visor,
// 2 cloth (the cloak).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_PARS } from '../render/lightingGlsl.js';

const SUIT = [0.74, 0.73, 0.70], TRIM = [0.20, 0.20, 0.21], BOOT = [0.07, 0.07, 0.075], VISOR = [0.55, 0.38, 0.12];

function part(geo, col, mat = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return g;
}
const capsule = (r, len, col, x, y, z, mat) => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.translate(x, y, z); return part(g, col, mat); };
const ball = (r, col, x, y, z, mat, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 12, 9); g.scale(sx, sy, sz); g.translate(x, y, z); return part(g, col, mat); };

export function torsoGeometry() {
  return mergeGeometries([
    capsule(0.165, 0.30, SUIT, 0, 0.30, 0),                         // chest
    ball(0.185, SUIT, 0, 0.47, 0.01, 0, 1.12, 0.8, 0.9),            // shoulders
    ball(0.165, SUIT, 0, 0.04, 0, 0, 1.0, 0.85, 0.9),               // hips
    capsule(0.05, 0.03, TRIM, 0, 0.64, 0),                          // neck ring
    ball(0.135, SUIT, 0, 0.80, 0, 0),                               // helmet
    ball(0.108, VISOR, 0, 0.805, 0.052, 1, 1.0, 0.86, 0.8),         // visor
    ball(0.09, TRIM, 0, 0.34, 0.15, 0, 1.3, 1.0, 0.45),             // chest unit
    capsule(0.04, 0.42, TRIM, 0, 0.60, -0.115, 0).rotateZ(Math.PI / 2).translate(0.6, 0.6, 0),   // cloak clasp bar across the shoulders
  ]);
}
// A limb hangs along -Y from its pivot at the origin, in two pieces: the upper part
// (shoulder or hip to the joint, with the joint's ring) and the lower part, whose own
// origin is the joint (elbow or knee).
export const ELBOW = 0.29, HAND = 0.31, KNEE = 0.41, ANKLE = 0.45;       // segment lengths (m)
export function upperArmGeometry() { return mergeGeometries([capsule(0.052, 0.22, SUIT, 0, -0.15, 0), ball(0.056, TRIM, 0, -ELBOW, 0, 0)]); }
export function forearmGeometry() { return mergeGeometries([capsule(0.047, 0.20, SUIT, 0, -0.13, 0), ball(0.058, BOOT, 0, -HAND, 0, 0, 1.0, 1.15, 1.0)]); }
export function thighGeometry() { return mergeGeometries([capsule(0.075, 0.28, SUIT, 0, -0.20, 0), ball(0.07, TRIM, 0, -KNEE, 0.005, 0)]); }
export function shinGeometry() {
  const boot = new THREE.CapsuleGeometry(0.06, 0.13, 3, 8);
  boot.rotateX(Math.PI / 2 - 0.3); boot.translate(0, -ANKLE, 0.055);
  return mergeGeometries([capsule(0.062, 0.28, SUIT, 0, -0.19, 0), part(boot, BOOT)]);
}

export const HERO_VERT = /* glsl */`
in vec3 aCol; in float aMat;
out vec3 vRel; out vec3 vN; out vec3 vCol; out float vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz; vCol = aCol; vMat = aMat;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const HERO_FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uSunVis;
in vec3 vRel; in vec3 vN; in vec3 vCol; in float vMat;
layout(location = 0) out vec4 fragColor;
void main() {
  int m = int(vMat + 0.5);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel), L = uSunDir;
  float NL = dot(N, L), NV = max(dot(N, V), 1e-3);
  vec3 Esun = directSun(planetPos) * uSunVis * nearShadow(vRel, N);
  vec3 sky = skyLight(N, up) + planetShine(N);
  vec3 col = vCol * (Esun * max(NL, 0.0) + sky) / PI;
  vec3 H = normalize(L + V);
  if (m == 1) {
    // visor: dark, glossy, mirrors the sky and a sharp Sun glint
    vec3 env = skyLight(reflect(-V, N), up) / PI;
    float F = 0.08 + 0.92 * pow(1.0 - NV, 5.0);
    col = vCol * 0.12 * (Esun * max(NL, 0.0) + sky) / PI + vCol * env * (0.6 + F) + Esun * pow(max(dot(N, H), 0.0), 220.0) * 6.0 * step(0.0, NL);
  } else if (m == 2) {
    // cloth: a little sunlight comes through from behind, soft sheen at grazing angles
    col += vCol * Esun * max(-NL, 0.0) * 0.22 / PI;
    col += vCol * sky * pow(1.0 - NV, 3.0) * 0.35 / PI;
  } else {
    col += Esun * max(NL, 0.0) * pow(max(dot(N, H), 0.0), 26.0) * 0.045;     // suit fabric highlight
  }
  col = aerialPerspective(col, vRel);
  fragColor = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
}`;

// Where the limbs hang from (shoulders, hips), in the body's frame.
export const SHOULDER = [0.235, 0.50, 0], HIP = [0.095, 0.0, 0];
