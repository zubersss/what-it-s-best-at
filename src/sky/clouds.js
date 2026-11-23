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

// A heap of the cloud layer over a place, as the layer draws it and as the ground is shaded
// by it (terrainMaterial.js): one rule, written here, for both.
//   noise: the cloud volume's noise; up: the direction from the world's centre; m: the day's
//   map there; lo: 1 - the layer's cover; fair: the cover of fair-weather cloud where the map
//   has none; vol: x 1 / the noise's scale, y the fair-weather field's scale, z the radius at
//   which the volume's masses are widest; wind: where the noise has drifted to; fine: how
//   much of the smaller lobes (0: none; 1: all). c: the cover there (0..1). Returns 0..1.
// Fair-weather cloud, where the day's map shows none (its pixels are 10 km: it never saw
// them): fields of small heaps with clear stretches between, and the fields themselves in
// clusters some tens of kilometres across with clear country between them. One rule, for
// the volume (cloudVolume.js), this shell and the ground's shadows. (Without the clusters,
// seen from high up one even field lay over the whole land: the same few heaps in rows
// to the horizon, since the noise they are cut from repeats every few kilometres.)
//   noise: the cloud volume's noise; up: the direction from the world's centre; k: the
//   world's radius in units of the field; fair: its cover; m: the day's map there.
//   Never a whole cover: fair weather has sky between its heaps.
export const FAIR_GLSL = /* glsl */`
float fairCover(highp sampler3D noise, vec3 up, float k, float fair, float m) {
  float field = texture(noise, up * k + 0.31).r, cluster = texture(noise, up * (k * 0.2) + 0.83).g;
  return min(0.5, fair * (0.55 + 0.45 * smoothstep(0.0, 0.5, m)) * smoothstep(0.12, 0.34, field) * smoothstep(0.40, 0.56, cluster) * (1.3 / 0.55));
}`;

export const HEAP_GLSL = FAIR_GLSL + /* glsl */`
float cloudHeap(highp sampler3D noise, vec3 up, float m, float lo, float fair, vec3 vol, vec3 wind, float fine, out float c) {
  c = smoothstep(lo - 0.08, lo + 0.34, m);
  if (fair > 0.0) c = max(c, fairCover(noise, up, vol.y, fair, m));
  vec3 qv = up * (vol.z * vol.x) + wind;
  float n = texture(noise, qv).r;
  if (fine > 0.0) n += (texture(noise, qv * 5.3 + 0.37).g - 0.5) * 0.26 * fine;
  return clamp((n - (1.0 - c) * 0.85) / max(c * 0.85 + 0.15, 0.2) * 2.2, 0.0, 1.0);
}`;

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
precision highp sampler3D;
uniform sampler3D tCloudNoise; // the volume's own noise: far off, this shell shows the same clouds the volume does near
uniform vec4 uVol;             // x: 1 / the noise's scale (1/m; 0: no volume), y: the world's radius in units of the fair-weather field, z: the radius at which the volume's masses are widest (m)
uniform vec3 uVolWind;         // where the volume's noise has drifted to
uniform float uNearFade;       // metres: nearer than this the cloud is drawn as a volume instead (cloudVolume.js); 0: all of it is this shell
in vec3 vRel;
layout(location = 0) out vec4 fragColor;
${HEAP_GLSL}
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
  // (how far off this is: 1 where a cloud's heaps are smaller than a pixel. Whether or not
  // there is a volume near the traveller: with the governor's last saving on there is
  // none, and from space the Earth then had no cloud at all.)
  // (by the pixel's width across the line of sight, not its length along it: seen at a low
  // angle a heap is still as wide as it was. By the longer of the two, every cloud a few
  // hundred kilometres off from 100 km up was a grey veil, with the crisp shadows of its
  // heaps on the ground under it.)
  // (heaps, some kilometres wide, stay heaps until a pixel is a kilometre and a half across)
  float far = smoothstep(1500.0, 5000.0, 2.0 * min(length(ux), length(uy)) * uCloud.y);
  float relief = 1.0;            // the Sun on a heap's own shape: over 1 on its sunward side, under 1 in its own shade
  if (uVol.x > 0.0) {
    // With a volume near the traveller, this shell is the same clouds seen from far off: the
    // same cover (the day's map, and fair-weather fields where it is clear), carved by the
    // same noise at the height where the masses are widest. A cloud keeps its place and
    // its outline when the traveller comes near and the volume takes it over. (Not where
    // a mass is smaller than a pixel: there, its mean.)
    float c, dv = cloudHeap(tCloudNoise, up, m, lo, uFair, uVol.xyz, uVolWind, 1.0 - smoothstep(150.0, 600.0, px * uVol.z), c);
    float small = far;
    cover = mix(smoothstep(0.0, 0.45, dv) * 0.75, c * 0.5, small);
    // A heap seen from above has a lit side and a side in its own shade: the same cloud a
    // few hundred metres toward the Sun says which this is (as the volume does near the
    // traveller). Flat white, the layer was a picture laid over the land.
    if (small < 1.0) {
      float n1 = texture(tCloudNoise, normalize(up + uSunDir * (450.0 / uVol.z)) * (uVol.z * uVol.x) + uVolWind).r;
      float dv1 = clamp((n1 - (1.0 - c) * 0.85) / max(c * 0.85 + 0.15, 0.2) * 2.2, 0.0, 1.0);
      relief = clamp(1.0 + 1.25 * (dv - dv1), 0.6, 1.24);
    }
  }
  // seen at a slant the layer is longer to look through
  float mu = max(abs(dot(V, up)), 0.12);
  float alpha = 1.0 - exp(-cover * (0.4 + cover) * 1.7 / mu);
  // (a clean edge: a heap is white or it is not there. With a soft one, seen from above
  // the heaps were grey veils over the land.)
  if (uPaint.x > 0.0) alpha = mix(alpha, smoothstep(0.2, 0.38, cover) * 0.97, uPaint.x);
  // From far off (a cloud's heaps smaller than a pixel) the layer is the day's map itself, as
  // the globe seen from another world wears it (sky/bodies.js): all of its cloud, thin and
  // thick, every mass lit on its sunward side and in its own shade on the other. (It was the
  // heaps' mean cover: from orbit the Earth had hardly a cloud, and what it had was flat.)
  if (far > 0.0) {
    vec3 ps = normalize(up + uSunDir * 0.0035);
    float m1 = textureGrad(tCloudMap, vec2(atan(ps.y, ps.x) * 0.15915494 + uCloud.z, acos(clamp(ps.z, -1.0, 1.0)) * 0.31830989), gx, gy).r;
    // (thin cloud shows only from very far, where the whole globe is in view: nearer, the
    // map's faint parts were grey veils of fog lying over the land)
    // Between the two (heaps too small to see one by one, the globe not yet whole in view) a
    // field of heaps is a white veil as thick as the share of sky it covers: the same cover
    // the heaps are cut from, so no cloud appears from far that is not there from near.
    // (With the map's own faint parts shown, grey sheets of fog lay over half the land.)
    alpha = mix(alpha, mix(0.55 * smoothstep(lo - 0.08, lo + 0.34, m), smoothstep(0.04, 0.9, m), smoothstep(4000.0, 12000.0, px * uCloud.y)), far);
    relief = mix(relief, clamp(1.0 + 1.3 * (m - m1), 0.55, 1.25), far);
  }
  if (uNearFade > 0.0) alpha *= smoothstep(0.7 * uNearFade, uNearFade, dist);
  if (alpha < 0.004) discard;
  // light: the Sun through the air to this height, more of it at the cloud's sunward edge
  // and around the Sun's direction; from below a thick cloud is grey
  float mu0 = dot(up, uSunDir), cs = dot(-V, uSunDir);
  float fwd = 0.6 + 0.9 * pow(max(cs, 0.0), 8.0);
  float under = uCloud.w > 0.5 ? mix(1.0, uVol.x > 0.0 ? 0.6 : 0.42, cover) : 1.0;
  vec3 sun = directSun(planetPos) * smoothstep(-0.06, 0.08, mu0) * fwd * under;
  // (matched to the volume near the traveller, whose sunlit faces are white)
  // (... and as white without the volume, in the painted look: with the governor's last
  // saving on, the same clouds were grey)
  vec3 col = vec3(0.86) * (sun * (uVol.x > 0.0 ? 0.8 : mix(0.42, 0.8, uPaint.x)) + skyLight(uCloud.w > 0.5 ? -up : up, up) * 0.9 + skyLight(up, up) * 0.25) / PI;
  // (... in two tones: its body, and its thick middle a step darker)
  if (uPaint.x > 0.0) col *= mix(1.0, mix(1.0, 0.8, smoothstep(0.55, 0.7, cover)), uPaint.x * (1.0 - far));
  col *= relief;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class CloudLayer {
  constructor(renderer) {
    this.renderer = renderer;
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
    this.blank = blank; this.texture = blank;
    this.uniforms = { ...lightingUniforms(), tCloudMap: { value: blank }, uCloud: { value: new THREE.Vector4(0.8, 1, 0, 1) }, uNearFade: { value: 0 }, uFair: { value: 0 }, tCloudNoise: { value: null }, uVol: { value: new THREE.Vector4() }, uVolWind: { value: new THREE.Vector3() } };
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
    // heap: x 1 - the cover, y the fair-weather cover, w 1 when the ground can be shaded by
    // the layer's own heaps (the volume's noise is there); the ground shader's uCloudHeap.
    this.heap = new THREE.Vector4(0, 0, 0, 0);
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
  // volume: the cloud volume (cloudVolume.js), whose clouds this shell shows from far off.
  update(cam, worldRadius, volume) {
    const on = !!this.def && this.enabled && this.texture !== this.blank;
    const v = this.def?.volume, match = !!(v && volume && volume.noise && volume.base != null);
    if (match) {
      // (the shell stands where the volume's masses are widest: a third of the way up them)
      this.radius = worldRadius + volume.base + 0.3 * (v.thick ?? 3000);
      this.mesh.scale.setScalar(this.radius);
      this.uniforms.tCloudNoise.value = volume.noise; this.uniforms.uVolWind.value.copy(volume.drift);
      this.uniforms.uVol.value.set(1 / (v.scale ?? 5200), worldRadius / (v.scale ?? 5200) * 0.11, this.radius, 0);
    } else this.uniforms.uVol.value.x = 0;
    if (!on || !match) this.heap.w = 0;
    this.mesh.visible = on;
    this.shadow.x = on && this.shadows !== false ? (this.def.shadow ?? 0.6) : 0;
    if (!on) return 0;
    const r = cam.length(), shift = this.def.lon0 === -180 ? 0.5 : 0;
    this.mesh.position.set(-cam.x, -cam.y, -cam.z);
    this.uniforms.uCloud.value.set(this.def.cover ?? 0.8, this.radius, shift, r < this.radius ? 1 : 0);
    this.uniforms.uFair.value = this.def.volume?.fair ?? 0;
    this.shadow.y = this.radius; this.shadow.z = shift;
    // (what the ground needs to be shaded by the heaps the layer shows: see heap below)
    this.heap.set(1 - (this.def.cover ?? 0.8), this.uniforms.uFair.value, 0, match && this.shadows !== false ? 1 : 0);
    return Math.sqrt(Math.max(0, r * r - worldRadius * worldRadius)) + Math.sqrt(this.radius * this.radius - worldRadius * worldRadius);
  }
}
