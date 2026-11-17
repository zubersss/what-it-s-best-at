// A small lander built entirely from code: octagonal descent stage in gold foil, white
// crew cabin with one lit window, dark heat tiles, engine bell, four braced legs, a truss
// mast with a dish, two solar panels on truss booms, blinking navigation lights.
// One mesh, one draw call. Emissive parts glow but do not light the scene (art rule 1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { SKYVIEW_ACCESS } from '../atmosphere/atmosphereGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';

// Material ids (per-vertex attribute aMat)
const WHITE = 0, FOIL = 1, TILE = 2, METAL = 3, WINDOW = 4, NAV_RED = 5, NAV_GREEN = 6, STROBE = 7, PANEL = 8;
export const FOOT_RADIUS = 3.9;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);

function tag(geo, mat, matrix) {
  if (matrix) geo.applyMatrix4(matrix);
  geo.deleteAttribute('uv');
  geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(mat), 1));
  return geo;
}
// Cylinder / cone with its axis along +Z, base at z0.
function zCyl(rTop, rBot, h, seg, z0, mat, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.rotateX(Math.PI / 2); g.translate(0, 0, z0 + h / 2);
  return tag(g, mat);
}
function strut(a, b, r, mat, seg = 5) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  _q.setFromUnitVectors(_y, d.clone().normalize());
  _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  return tag(g, mat, _m);
}
function box(w, d, h, pos, mat, rot) {
  const g = new THREE.BoxGeometry(w, d, h);
  _m.compose(pos, rot || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  return tag(g, mat, _m);
}
function ball(r, pos, mat) { const g = new THREE.SphereGeometry(r, 8, 6); g.translate(pos.x, pos.y, pos.z); return tag(g, mat); }

// Lattice truss between two points: four longerons with zig-zag bracing.
function truss(a, b, width, bays, mat, parts) {
  const axis = new THREE.Vector3().subVectors(b, a), len = axis.length(); axis.normalize();
  const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
  const side2 = new THREE.Vector3().crossVectors(axis, side);
  const corner = (k, t) => new THREE.Vector3().copy(a).addScaledVector(axis, t * len)
    .addScaledVector(side, (k === 0 || k === 3 ? -1 : 1) * width / 2).addScaledVector(side2, (k < 2 ? -1 : 1) * width / 2);
  for (let k = 0; k < 4; k++) parts.push(strut(corner(k, 0), corner(k, 1), 0.022, mat, 4));
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      parts.push(strut(corner(k, t0), corner(n, t1), 0.014, mat, 3));
      if (i === bays - 1) parts.push(strut(corner(k, t1), corner(n, t1), 0.014, mat, 3));
    }
  }
}

// footDrop[i]: how far (m) each of the four feet must reach below the nominal ground plane.
export function buildLanderGeometry(footDrop = [0, 0, 0, 0]) {
  const P = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Descent stage: octagonal, gold foil, with a darker deck and underside.
  const stage = zCyl(2.05, 2.05, 1.55, 8, 1.25, FOIL); stage.rotateZ(Math.PI / 8); P.push(stage);
  const deck = zCyl(2.0, 2.0, 0.06, 8, 2.8, METAL); deck.rotateZ(Math.PI / 8); P.push(deck);
  P.push(zCyl(1.2, 1.9, 0.25, 8, 1.0, TILE));
  // Engine bell.
  P.push(zCyl(0.32, 0.78, 0.85, 14, 0.42, METAL, true));
  P.push(zCyl(0.36, 0.36, 0.3, 10, 1.0, METAL));
  // Crew cabin: white, conical top, tile skirt, docking ring, one window.
  P.push(zCyl(1.32, 1.32, 1.75, 18, 2.86, WHITE));
  P.push(zCyl(0.55, 1.32, 0.75, 18, 4.61, WHITE));
  P.push(zCyl(1.36, 1.36, 0.42, 18, 2.86, TILE));
  P.push(zCyl(0.5, 0.55, 0.22, 14, 5.36, METAL));
  P.push(zCyl(0.42, 0.42, 0.05, 14, 5.58, TILE));
  P.push(box(0.05, 0.62, 0.46, V(1.325, 0, 3.95), WINDOW));
  P.push(box(0.035, 0.76, 0.60, V(1.31, 0, 3.95), METAL));         // window frame
  P.push(box(0.04, 0.7, 1.25, V(-1.32, 0, 3.6), METAL));           // hatch on the far side
  // Four legs: main strut, two braces, foot pad.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    const drop = footDrop[i] || 0;
    const top = V(c * 1.95, s * 1.95, 2.55), foot = V(c * FOOT_RADIUS, s * FOOT_RADIUS, 0.16 - drop);
    const knee = top.clone().lerp(foot, 0.62);
    P.push(strut(top, foot, 0.075, FOIL, 6));
    P.push(strut(knee, foot, 0.055, METAL, 6));
    const t = V(-s, c, 0);
    P.push(strut(V(c * 1.9, s * 1.9, 1.3).addScaledVector(t, 0.75), knee, 0.04, METAL));
    P.push(strut(V(c * 1.9, s * 1.9, 1.3).addScaledVector(t, -0.75), knee, 0.04, METAL));
    const pad = new THREE.CylinderGeometry(0.46, 0.5, 0.12, 12); pad.rotateX(Math.PI / 2); pad.translate(foot.x, foot.y, foot.z - 0.1);
    P.push(tag(pad, FOIL));
    // ladder on the first leg
    if (i === 0) for (let k = 1; k < 8; k++) { const p = top.clone().lerp(foot, k / 8.5); P.push(strut(p.clone().addScaledVector(t, 0.22), p.clone().addScaledVector(t, -0.22), 0.016, METAL, 3)); }
  }
  // Truss mast with a dish and the white strobe.
  const mastBase = V(-1.1, 1.25, 2.86), mastTop = V(-1.1, 1.25, 6.4);
  truss(mastBase, mastTop, 0.26, 7, METAL, P);
  const dish = new THREE.SphereGeometry(0.62, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
  dish.rotateX(-Math.PI / 2 + 0.5); dish.rotateZ(2.2); dish.translate(mastTop.x, mastTop.y, mastTop.z + 0.3);
  P.push(tag(dish, WHITE));
  P.push(ball(0.06, V(mastTop.x, mastTop.y, mastTop.z + 0.12), STROBE));
  // Two solar panels on truss booms.
  for (const sgn of [-1, 1]) {
    const root = V(0, sgn * 2.0, 2.3), tip = V(0, sgn * 4.4, 2.75);
    truss(root, tip, 0.18, 5, METAL, P);
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(sgn * 0.42, 0, 0));
    P.push(box(1.9, 2.5, 0.035, V(0, sgn * 5.5, 2.98), PANEL, rot));
    P.push(box(1.98, 2.58, 0.02, V(0, sgn * 5.5, 2.965), WHITE, rot));
    P.push(ball(0.05, V(0, sgn * 6.75, 3.5 + 0.02), sgn < 0 ? NAV_RED : NAV_GREEN));
  }
  // Thruster quads around the cabin.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    if (i === 0) continue;                                         // window side stays clear
    P.push(box(0.22, 0.22, 0.22, V(c * 1.5, s * 1.5, 4.3), METAL));
    P.push(strut(V(c * 1.5, s * 1.5, 4.3), V(c * 1.5, s * 1.5, 4.62), 0.05, TILE, 6));
    P.push(strut(V(c * 1.5, s * 1.5, 4.3), V(c * 1.5 - s * 0.3, s * 1.5 + c * 0.3, 4.3), 0.05, TILE, 6));
  }
  // Tanks on the descent stage.
  for (const a of [0.9, 2.3, 4.1, 5.4]) P.push(ball(0.42, V(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 3.05), FOIL));
  const merged = mergeGeometries(P.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  merged.computeBoundingSphere();
  return merged;
}

const VERT = /* glsl */`
in float aMat;
out vec3 vRel; out vec3 vN; out vec3 vObj; out float vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz; vObj = position; vMat = aMat;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
${SKYVIEW_ACCESS}
uniform vec3 uSunLocal;
uniform float uTime;
uniform float uSunVis;        // baked terrain shadow at the ship
uniform vec3 uLights;         // radiance: window, nav lights, strobe (solar-constant units)
in vec3 vRel; in vec3 vN; in vec3 vObj; in float vMat;
layout(location = 0) out vec4 fragColor;

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float ggx(float NH, float a) { float a2 = a * a, d = NH * NH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }

void main() {
  int m = int(vMat + 0.5);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
  vec3 albedo = vec3(0.8), emissive = vec3(0.0);
  float metal = 0.0, rough = 0.5;
  if (m == 0) { albedo = vec3(0.80, 0.79, 0.76) * (0.94 + 0.06 * vnoise(vObj * 3.0)); rough = 0.42; }
  else if (m == 1) {
    albedo = vec3(1.0, 0.74, 0.32); metal = 1.0; rough = 0.30;
    vec3 q = vObj * 9.0;                                        // crinkled foil
    N = normalize(N + (vec3(vnoise(q), vnoise(q + 17.3), vnoise(q + 41.7)) - 0.5) * 1.1);
  }
  else if (m == 2) { vec3 g = abs(fract(vObj * 5.0) - 0.5); albedo = vec3(0.035) * (0.7 + 0.3 * step(0.06, min(g.x, min(g.y, g.z)) + 0.04)); rough = 0.85; }
  else if (m == 3) { albedo = vec3(0.34, 0.34, 0.35); metal = 0.7; rough = 0.42; }
  else if (m == 4) { albedo = vec3(0.02); emissive = vec3(1.0, 0.70, 0.40) * uLights.x * (0.75 + 0.25 * vnoise(vObj * 6.0)); rough = 0.1; }
  else if (m == 5 || m == 6) { albedo = vec3(0.02); float on = step(fract(uTime / 1.2), 0.5); emissive = (m == 5 ? vec3(1.0, 0.06, 0.03) : vec3(0.05, 1.0, 0.25)) * uLights.y * on; }
  else if (m == 7) { albedo = vec3(0.02); float t = fract(uTime / 1.6); float on = step(t, 0.06) + step(0.12, t) * step(t, 0.18); emissive = vec3(1.0) * uLights.z * on; }
  else { albedo = vec3(0.012, 0.018, 0.045); rough = 0.22; }

  vec3 L = uSunDir;
  float NL = max(dot(N, L), 0.0), NV = max(dot(N, V), 1e-3);
  vec3 Esun = directSun(planetPos) * uSunVis * nearShadow(vRel, normalize(vN));
  vec3 sky = skyLight(N, up);
  vec3 diffuse = albedo * (1.0 - metal) * (Esun * NL + sky) / PI;
  // Specular: Sun highlight + a reflection of the real sky (or the ground below the horizon).
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 H = normalize(L + V);
  float a = rough * rough;
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = F * ggx(max(dot(N, H), 0.0), a) * 0.25 / max(NV, 0.25) * Esun * NL;
  vec3 Rv = reflect(-V, N), Rl = uSkyFrame * Rv;
  vec3 ground = uGroundAlbedo / PI * (skyLight(up, up) + directSun(planetPos) * max(dot(up, L), 0.0) * 0.5);
  vec3 env = Rl.z > 0.0 ? skyRadianceLocal(normalize(vec3(Rl.xy, max(Rl.z, 0.02))), uSunLocal, uMieG) * uSunIrradiance : ground;
  vec3 Fenv = F0 + (1.0 - F0) * pow(1.0 - NV, 5.0);
  spec += Fenv * env * (1.0 - rough * 0.6);
  vec3 col = diffuse + spec + emissive;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
}`;

export class Lander {
  // hs: HeightSource; startDir: unit direction of the scene start; placement from world.scene.ship.
  constructor(world, hs, startDir) {
    this.world = world;
    const def = world.scene.ship || { east: 60, north: 50, heading: 0 };
    const R = world.radius;
    const { east, north, up } = localFrame(startDir);
    // Nominal position on the ground.
    const g0 = R + hs.height(startDir[0], startDir[1], startDir[2], 0.6);
    const at = (e, n) => {
      const x = startDir[0] * g0 + east[0] * e + north[0] * n, y = startDir[1] * g0 + east[1] * e + north[1] * n, z = startDir[2] * g0 + east[2] * e + north[2] * n;
      const l = Math.hypot(x, y, z), d = [x / l, y / l, z / l], r = R + hs.height(d[0], d[1], d[2], 0.6);
      return new THREE.Vector3(d[0] * r, d[1] * r, d[2] * r);
    };
    // Look for the flattest spot within 25 m of the requested offset.
    let best = null, bestSpread = Infinity;
    for (let de = -25; de <= 25; de += 5) for (let dn = -25; dn <= 25; dn += 5) {
      const c = at(def.east + de, def.north + dn).length();
      let spread = 0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; spread = Math.max(spread, Math.abs(at(def.east + de + Math.cos(a) * 4.5, def.north + dn + Math.sin(a) * 4.5).length() - c)); }
      spread += Math.hypot(de, dn) * 0.01;
      if (spread < bestSpread) { bestSpread = spread; best = [def.east + de, def.north + dn]; }
    }
    const hdg = (def.heading || 0) * Math.PI / 180;
    const feet = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;                    // ship-local angle
      const lx = Math.cos(a) * FOOT_RADIUS, ly = Math.sin(a) * FOOT_RADIUS;
      // ship x axis points along the heading (clockwise from north), y to its left
      const e = Math.sin(hdg) * lx - Math.cos(hdg) * ly, n = Math.cos(hdg) * lx + Math.sin(hdg) * ly;
      feet.push(at(best[0] + e, best[1] + n));
    }
    const centre = at(best[0], best[1]);
    const upv = new THREE.Vector3(up[0], up[1], up[2]);
    // Stand level; rest on the highest foot and let the other legs reach down.
    const heights = feet.map((f) => f.clone().sub(centre).dot(upv));
    const base = Math.max(...heights);
    const drops = heights.map((h) => Math.min(1.2, base - h));
    this.position = centre.clone().addScaledVector(upv, base);
    const x = new THREE.Vector3(east[0], east[1], east[2]).multiplyScalar(Math.sin(hdg)).add(new THREE.Vector3(north[0], north[1], north[2]).multiplyScalar(Math.cos(hdg)));
    const y = new THREE.Vector3().crossVectors(upv, x);
    this.quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, upv));
    this.offset = best;

    this.uniforms = { ...lightingUniforms(), uSunVis: { value: 1 }, uLights: { value: new THREE.Vector3(2.5e-3, 0.12, 0.6) } };
    const geo = buildLanderGeometry(drops);
    this.triangles = geo.attributes.position.count / 3;
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, side: THREE.DoubleSide,
      vertexShader: `void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.quaternion.copy(this.quaternion);
    this.visSun = [0, 0, 0];
    this.point = new Float64Array(3);
  }

  update(rig, sun, sunHalf, workers) {
    this.mesh.position.subVectors(this.position, rig.pos);
    this.mesh.visible = this.mesh.position.length() < 60000;
    const s = this.visSun;
    if (!this.pending && s[0] * sun[0] + s[1] * sun[1] + s[2] * sun[2] < 0.99999) {
      const up = this.position.clone().normalize(), p = this.position.clone().addScaledVector(up, 3);
      this.point[0] = p.x; this.point[1] = p.y; this.point[2] = p.z;
      const want = [sun[0], sun[1], sun[2]];
      const job = workers.run({ type: 'points', points: this.point.slice(), sun: want, sunHalf, minWL: 2 });
      if (job) {
        this.pending = true;
        job.then((res) => { this.pending = false; this.uniforms.uSunVis.value = res.vis[0]; this.visSun = want; }).catch(() => { this.pending = false; });
      }
    }
  }
}
