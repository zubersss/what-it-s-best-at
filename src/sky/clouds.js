// A layer of cloud round the home world: a real day's cloud map (the same one the globe
// wears from space) as a thin shell some kilometres up, seen from below and from above,
// broken up by finer generated detail (the map's cells are 10 km wide). Lit by the Sun
// through the air (so it reddens at sunset) and by the sky; its shadow on the ground is
// the terrain shader's business (uCloud, tClouds). A world file's `clouds` block:
//   { map: url (grey, north at the top), lon0: -180 if the map's left edge is longitude
//     -180 (else 0), altitude (m), cover (0..1, how much of the map's cloud is kept),
//     shadow (0..1, how dark its shadow is) }
// One draw call; the governor can switch it off (App.cloudsOn).
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const VERT = /* glsl */`
out vec3 vRel;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform sampler2D tCloudMap;
uniform vec4 uCloud;           // x cover, y the shell's radius (m), z longitude shift of the map (turns), w 1 = the camera is below the shell
uniform float uFair;           // the cover of fair-weather cloud where the day's map has none (0: none; see cloudVolume.js)
uniform float uNearFade;       // metres: nearer than this the cloud is drawn as a volume instead (cloudVolume.js); 0: all of it is this shell
in vec3 vRel;
layout(location = 0) out vec4 fragColor;
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
  float dist = length(vRel);
  vec3 V = -vRel / dist;
  // the map, its footprint taken from the direction itself (no seam where longitude wraps)
  vec2 uv = vec2(atan(up.y, up.x) * 0.15915494 + uCloud.z, acos(clamp(up.z, -1.0, 1.0)) * 0.31830989);
  vec3 ux = dFdx(up), uy = dFdy(up);
  float k = 0.15915494 / max(dot(up.xy, up.xy), 1e-5);
  vec2 gx = vec2((up.x * ux.y - up.y * ux.x) * k, dFdx(uv.y)), gy = vec2((up.x * uy.y - up.y * uy.x) * k, dFdy(uv.y));
  float m = textureGrad(tCloudMap, uv, gx, gy).r;
  // finer shapes than the map holds: three sizes of puff, fading out where they would be
  // smaller than a pixel
  float px = length(ux) + length(uy);                     // radians per pixel
  vec3 q = up * 900.0;
  float d = 0.0, a = 0.5, f = 1.0;
  // (the painted look: a cloud is a few round masses with a clean edge, not a fine froth)
  int octs = uPaint.x > 0.5 ? 2 : 4;
  for (int i = 0; i < octs; i++) { d += a * vnoise(q * f) * (1.0 - smoothstep(0.15, 0.6, px * 900.0 * f)); a *= 0.55; f *= 2.7; }
  if (uPaint.x > 0.5) d *= 1.18;
  // (the detail carves the map's cloud into pieces: thin cloud breaks up, thick cloud stays)
  float dens = m * (0.25 + 1.7 * d) + (d - 0.45) * 0.2 * smoothstep(0.1, 0.4, m);
  float lo = 1.0 - uCloud.x;
  float cover = smoothstep(lo - 0.08, lo + 0.34, dens);
  // (fair-weather cloud, as the volume near the traveller has it: fields of small heaps where the map is clear)
  if (uFair > 0.0) cover = max(cover, uFair * 1.7 * (0.55 + 0.45 * smoothstep(0.0, 0.5, m)) / 0.55 * smoothstep(0.52, 0.72, d) * smoothstep(0.32, 0.52, vnoise(up * 140.0 + 3.7)));
  // seen at a slant the layer is longer to look through
  float mu = max(abs(dot(V, up)), 0.12);
  float alpha = 1.0 - exp(-cover * (0.4 + cover) * 1.7 / mu);
  if (uPaint.x > 0.0) alpha = mix(alpha, smoothstep(0.16, 0.5, cover) * 0.96, uPaint.x);
  if (uNearFade > 0.0) alpha *= smoothstep(0.7 * uNearFade, uNearFade, dist);
  if (alpha < 0.004) discard;
  // light: the Sun through the air to this height, more of it at the cloud's sunward edge
  // and around the Sun's direction; from below a thick cloud is grey
  float mu0 = dot(up, uSunDir), cs = dot(-V, uSunDir);
  float fwd = 0.6 + 0.9 * pow(max(cs, 0.0), 8.0);
  float under = uCloud.w > 0.5 ? mix(1.0, 0.42, cover) : 1.0;
  vec3 sun = directSun(planetPos) * smoothstep(-0.06, 0.08, mu0) * fwd * under;
  vec3 col = vec3(0.86) * (sun * 0.42 + skyLight(uCloud.w > 0.5 ? -up : up, up) * 0.9 + skyLight(up, up) * 0.25) / PI;
  // (... in two tones: its body, and its thick middle a step darker)
  if (uPaint.x > 0.0) col *= mix(1.0, mix(1.0, 0.8, smoothstep(0.55, 0.7, cover)), uPaint.x);
  col = aerialPerspective(col, vRel);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class CloudLayer {
  constructor(renderer) {
    this.renderer = renderer;
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
    this.blank = blank; this.texture = blank;
    this.uniforms = { ...lightingUniforms(), tCloudMap: { value: blank }, uCloud: { value: new THREE.Vector4(0.8, 1, 0, 1) }, uNearFade: { value: 0 }, uFair: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 48), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1000; this.mesh.visible = false;
    this.def = null; this.enabled = true; this.loading = false; this.radius = 0; this.epoch = 0;
    // what the terrain shader needs for the shadow: strength, shell radius, map shift (see setWorld / update)
    this.shadow = new THREE.Vector4(0, 1, 0, 0);
  }

  // The home world changed: its cloud map is fetched (decoded off the main thread).
  setWorld(world) {
    this.epoch++;
    const def = world.clouds || null, epoch = this.epoch;
    this.def = def;
    if (this.texture !== this.blank) { this.texture.dispose(); this.texture = this.blank; }
    this.uniforms.tCloudMap.value = this.blank;
    this.mesh.visible = false; this.shadow.x = 0; this.loading = !!def;
    if (!def) return;
    this.radius = world.radius + def.altitude;
    this.mesh.scale.setScalar(this.radius);
    const loader = new THREE.ImageBitmapLoader();
    loader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    loader.load(import.meta.env.BASE_URL + def.map, (bitmap) => {
      if (epoch !== this.epoch) { bitmap.close?.(); return; }
      const t = new THREE.Texture(bitmap);
      t.flipY = false; t.format = THREE.RedFormat; t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
      t.needsUpdate = true; this.renderer.initTexture(t);
      this.texture = t; this.uniforms.tCloudMap.value = t; this.loading = false;
    }, undefined, () => { this.loading = false; });
  }

  // cam: the camera (planet-fixed, m). Returns how far the camera must be able to see for
  // the layer to reach its horizon (0: nothing to draw).
  update(cam, worldRadius) {
    const on = !!this.def && this.enabled && this.texture !== this.blank;
    this.mesh.visible = on;
    this.shadow.x = on && this.shadows !== false ? (this.def.shadow ?? 0.6) : 0;
    if (!on) return 0;
    const r = cam.length(), shift = this.def.lon0 === -180 ? 0.5 : 0;
    this.mesh.position.set(-cam.x, -cam.y, -cam.z);
    this.uniforms.uCloud.value.set(this.def.cover ?? 0.8, this.radius, shift, r < this.radius ? 1 : 0);
    this.uniforms.uFair.value = this.def.volume?.fair ?? 0;
    this.shadow.y = this.radius; this.shadow.z = shift;
    return Math.sqrt(Math.max(0, r * r - worldRadius * worldRadius)) + Math.sqrt(this.radius * this.radius - worldRadius * worldRadius);
  }
}
