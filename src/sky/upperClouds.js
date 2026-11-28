// The two upper layers of cloud, each a painted shell at its own true height (the plan's
// "Mid-level patches and veil" and "High cloud"): the mid layer at 5 km above the sea
// (altocumulus in rows of small cloudlets, altostratus as a veil that turns the Sun into a pale
// disc) and the high layer at 9 km (cirrus brushed out along the high wind, cirrostratus with a
// faint 22-degree halo, and the anvils of storms, opaque and dark beneath).
//
// Why shells and not sheets at the far plane: a storm's tower stands through both of them, and a
// layer laid at the far plane would be drawn in front of a tower that should stand through it.
// Each shell is cut where a tower passes through it (the cells' own shape, cellShape.js), and
// the two are drawn above or below the camera by their height, so a traveller flying between
// them sees the mid layer under the cirrus.
//
// Where the cloud is comes from the field (weather/sky/format.js: B.R the mid cover, B.G the
// high cover); how it is shaped comes from the clouds' own noise read in each layer's own frame
// (weather/sky/steer.js: the mid layer overtakes the heaps, the high layer often runs on another
// heading), so both move with their own wind on the game clock.
//
// Reads: one into the field and one into the noise where a pixel has cloud; where it is clear
// the pixel is thrown out after the field's read alone. The governor's 'cloud-upper' step takes
// the second noise octave and the relief look away (the cloudlets become a soft veil).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { G } from '../render/globals.js';
import { SKY_FIELD_GLSL, SKY_UNIFORMS } from './skyGlsl.js';
import { STEER_GLSL } from '../weather/sky/steer.js';
import { CLOUD_LOOK } from './cloudLook.js';
import { CELL_GLSL, ANVIL_GLSL, CELL_MAX, ANVIL_MAX, ANVIL_VEC4, CELL_UNIFORMS, CELL_SHAPE } from '../weather/sky/cellShape.js';

// A round shell with each corner handed to the GPU once: three's polyhedra are triangle soup
// (three corners a triangle, every one run through the vertex shader), and a shell is drawn
// every frame whatever is on screen. Positions alone: the shaders here read nothing else.
function shell(detail) {
  const soup = new THREE.IcosahedronGeometry(1, detail);
  soup.deleteAttribute('normal'); soup.deleteAttribute('uv');
  const geo = mergeVertices(soup, 1e-6);
  soup.dispose();
  return geo;
}

// the look's numbers (the report lists them; the world file may pin them)
export const UPPER_LOOK = Object.freeze({
  MID_H: 5000, HIGH_H: 9000,      // m above the sea
  MID_K: 2.2, HIGH_K: 0.8,        // how fine each layer's pattern is (the noise's period over this)
  MID_CELL: 520,                  // m: a cloudlet of the mackerel sky (what counts as smaller than a pixel)
  MID_ALPHA: 0.92,                // the most a thick altostratus veil takes
  MID_SHADE: 0.72,                // its shaded side (two tones, as the heaps have)
  MID_PATCH: 0.28,                // how much the field clumps into patches and lanes (0: an even screen)
  MID_PATCH_K: 0.21,              // how large those patches are, against a cloudlet
  WINDOW: 0.8,                    // how much of the mid and high cloud in FRONT of a storm tower is taken away on the lines of sight that go on into it
  ANVIL_TORN: 0.6,                // how far the cirrus strokes move an anvil's edge (a torn fringe)
  HIGH_STRETCH: 7,                // how far the high noise is drawn out along its own wind
  HIGH_ALPHA: 0.5,                // cirrus is never more than half there ...
  HIGH_ANVIL: 0.97,               // ... but an anvil is solid
  HIGH_UNDER: 0.2,                // an anvil's underside, against its top (grey, not white: it is shut out of the Sun by its own depth)
  ANVIL_GRAIN: 0.3,               // how much the strokes thin and thicken its sheet
  ANVIL_STEPS: 8, ANVIL_STEPS_THIN: 4,   // steps through an anvil's depth along a line of sight (thinned: the governor's cloud-upper)
  ANVIL_UNDER_EDGE: 0.32,         // its underside toward its thin edge, against its top (HIGH_UNDER under its deep middle)
  ANVIL_FIND: 5, ANVIL_FIND_THIN: 2,   // halvings that find where a line of sight enters it
  ANVIL_DEEP0: 0.14, ANVIL_DEEP1: 0.55,   // its depth where it is entered (a share of its deepest) between which its underside goes from the rim's tone to its darkest
  ANVIL_SKY: 0.22, ANVIL_SKY_EDGE: 0.5,  // the share of the sky's light its underside keeps: under its deep middle, at its rim
  ANVIL_EXT: 260,                 // m of anvil that takes 63 % of what is behind it
  ANVIL_LIT0: 0.3, ANVIL_LIT1: 0.85,   // how high in the anvil (0 its underside .. 1 its top) what is seen goes from the underside's grey to the lit top
  HALO: 0.062,                    // how strong the 22-degree halo is
});
const U = UPPER_LOOK;
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

// (HAZE_UV: the lighting chunk's air reads gl_FragCoord unless told where its pixel is; a vertex
// shader has none, and this one asks for no air. As the far forest's vertex shader has it.)
const VERT = /* glsl */`
#define HAZE_UV 1
${LIGHTING_PARS}
uniform vec4 uUpper;
out vec3 vRel;
out vec3 vSun;                 // the Sun's light at the shell here, through the air at its height (directSun), gone below the horizon
out vec3 vSky;                 // the sky's light on the side of the shell that is looked at
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  // The Sun's and the sky's light, worked out at the shell's corners (10 892 of them) and not at
  // every pixel of the sky, twice over: across a triangle of a shell 5 or 9 km up they change by
  // next to nothing, and they were three looks into the tables a pixel a shell. (The air between
  // the eye and the shell stays with the pixel: a triangle overhead spans tens of degrees of
  // sky, from thin air to the horizon's thick.)
  vec3 pv = uCamPlanetPos + vRel, upv = normalize(pv);
  vSun = directSun(pv) * smoothstep(-0.09, 0.06, dot(upv, uSunDir));
  vSky = skyLight(uUpper.z > 0.5 ? -upv : upv, upv);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
${SKY_FIELD_GLSL}
${STEER_GLSL}
${CELL_GLSL}
${ANVIL_GLSL}
uniform vec4 uUpper;           // x 1 for the high layer (0 the mid), y the shell's radius (m), z 1 when the camera is below it, w 1 while the shell is thinned (the governor)
in vec3 vRel;
in vec3 vSun;
in vec3 vSky;
uniform float uUpperOld;
layout(location = 0) out vec4 fragColor;

// the layer's pattern at a point of its own frame (one read)
float upperNoise(vec3 q) { return skyTex3(tCloudNoise, q).r; }

// What an anvil shows along the ray o + t d. It has depth (a kilometre over its tower, thinner
// downwind), so it is not asked for at one height: the ray's stretch through its slab
// (anvilChord, exact) is walked in a few steps, and what comes back is x how solid it is at most
// on the way, y how high in it the part that is seen lies (0 its underside .. 1 its top: from
// under it one sees its dark base, from the side its lit top over its dark base, from above its
// top), z how much of what is behind it is left and w how deep it is where it is entered (1: as
// deep as it gets, round its tower). All of it along the line of sight, the same
// from anywhere on that line.
vec4 anvilSeen(int k, vec3 o, vec3 d) {
  vec2 ch = anvilChord(k, o, d);
  if (ch.y <= ch.x) return vec4(0.0, 0.0, 1.0, 0.0);
  float L = length(${CELL_UNIFORMS.anvils}[k * ${ANVIL_VEC4}].xyz);
  bool thin = uUpper.w > 0.5;
  int steps = thin ? ${U.ANVIL_STEPS_THIN} : ${U.ANVIL_STEPS};
  float ds = (ch.y - ch.x) / float(steps), T = 1.0, mx = 0.0, t0 = ch.x, tIn = -1.0;
  for (int i = 0; i < ${U.ANVIL_STEPS}; i++) {
    if (i >= steps) break;
    float t = ch.x + (float(i) + 0.5) * ds;
    float dn = anvilDensity(k, o + d * t);
    if (dn <= 0.0) { if (tIn < 0.0) t0 = t; continue; }
    if (tIn < 0.0) tIn = t;
    T *= exp(-dn * ds / ${glf(U.ANVIL_EXT)}); mx = max(mx, dn);
  }
  if (tIn < 0.0) return vec4(0.0, 0.0, 1.0, 0.0);
  // Where the line of sight ENTERS it, found between the last clear step and the first in
  // cloud: how high in the anvil that is says what is seen (its underside, its side, its top).
  // (Taken from the steps themselves it was a step's length wrong: bands across the underside,
  // and an underside lit like a top.)
  for (int i = 0; i < ${U.ANVIL_FIND}; i++) {
    if (thin && i >= ${U.ANVIL_FIND_THIN}) break;
    float tm = 0.5 * (t0 + tIn);
    if (anvilDensity(k, o + d * tm) > 0.0) tIn = tm; else t0 = tm;
  }
  vec3 pe = o + d * tIn;
  float re = length(pe);
  float deep = anvilDepth(anvilPlace(k, pe / re));
  return vec4(mx, clamp(1.0 + (re - L) / deep, 0.0, 1.0), T, deep / ${glf(CELL_SHAPE.ANVIL_THICK + CELL_SHAPE.ANVIL_FLARE)});
}

void main() {
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
  float dist = length(vRel);
  bool high = uUpper.x > 0.5;
  // the cover over this place: one read of the field, and nothing more where the sky is clear
  vec4 B = wxRead(tWxB, up);
  float cover = high ? wxHigh(B) : wxMid(B);
  // Its own anvil, worked out first because the cut below must not take it: an anvil is
  // thickest exactly over the tower that made it. (It was cut there, so every anvil had a hole
  // in it where its own tower passed through, and the sheet floated round the stalk.)
  // Each is asked for along THIS RAY through ITS OWN slab, not where the ray crosses the shell:
  // an anvil stands between 6.7 and 9.5 km by the height of the tower that made it, and the
  // shell is at 9. (And before the clear sky is thrown away: seen from 30 km off, the ray meets
  // the anvil's slab kilometres from where it meets the shell, where the field may have none.)
  float an = 0.0, anH = 0.0, anDeep = 0.0, skyShade = 1.0, anUnder = 0.0;
  if (high && uAnvilCount > 0) {
    vec3 ray = normalize(vRel);
    float left = 1.0;
    for (int k2 = 0; k2 < ANVIL_MAX; k2++) {
      if (k2 >= uAnvilCount) break;
      vec4 sn = anvilSeen(k2, uCamPlanetPos, ray);
      if (sn.x > an) { an = sn.x; anH = sn.y; anDeep = sn.w; }
      left *= sn.z;
    }
    an *= 1.0 - left;
  }
  if (cover < 0.015 && an <= 0.0) discard;
  // A tower stands through both layers: where one does, this shell is not drawn (the march
  // draws the tower itself, with its own depth).
  if (an < 0.05) {
    for (int k = 0; k < CELL_MAX; k++) {
      if (k >= uCellCount) break;
      if (cellDensity(k, planetPos) > 0.08) discard;
    }
  }
  float px = length(dFdx(up)) + length(dFdy(up));          // radians a pixel
  float alpha, shade = 1.0;
  vec3 q = high ? steerHigh(up) : steerMid(up);
  if (high) {
    // Cirrus: fine brush strokes drawn out along the high wind, warped once. The wind in the
    // layer's own frame is where the strokes lie.
    vec3 w = steerWindHigh(q);
    float wl = length(w);
    vec3 e = wl > 1e-6 ? w / wl : vec3(1.0, 0.0, 0.0);
    float along = dot(q, e);
    vec3 qs = q - e * along * (1.0 - 1.0 / ${glf(U.HIGH_STRETCH)});
    float k = uUpper.y * uSkyLow.x * ${glf(U.HIGH_K)};
    float n = upperNoise(qs * k);
    if (uUpper.w < 0.5) n = 0.75 * n + 0.25 * upperNoise(qs * (k * 2.7));
    float streak = smoothstep(0.42, 0.78, n * (0.6 + 0.6 * cover));
    alpha = min(${glf(U.HIGH_ALPHA)}, streak * cover * 1.6);
    // an anvil: the same height, but solid, and dark underneath (worked out above)
    if (an > 0.0) {
      // (its edge is torn and fibrous, not a cut line: the same strokes the cirrus is made of
      // move the line where it ends, so it ends in streaks drawn out downwind. And its sheet is
      // ice drawn out by the same wind, not a plate: the strokes thin and thicken it.)
      float fray = 0.55 * n + 0.45 * upperNoise(qs * (k * 3.1));
      float e = smoothstep(0.04 + ${glf(U.ANVIL_TORN)} * fray, 0.2 + ${glf(U.ANVIL_TORN)} * fray, an);
      alpha = max(alpha, min(${glf(U.HIGH_ANVIL)}, ${glf(U.HIGH_ANVIL)} * e * (${glf(1 - U.ANVIL_GRAIN)} + ${glf(2 * U.ANVIL_GRAIN)} * n)));
      // (its underside is not one grey: dark under its deep middle, paler toward its thin edge,
      // where the light comes through the ice)
      float heavy = smoothstep(0.15, 0.8, an) * smoothstep(${glf(U.ANVIL_DEEP0)}, ${glf(U.ANVIL_DEEP1)}, anDeep);
      float under = mix(${glf(U.ANVIL_UNDER_EDGE)}, ${glf(U.HIGH_UNDER)}, heavy);
      // (and its SIDE: a line of sight that enters it above its base looks at a face turned toward
      // the eye, lit when the Sun is behind the eye. Without, a storm seen from its sunlit side
      // was a pale tower under a dark plate.)
      float side = smoothstep(0.04, 0.3, anH) * clamp(0.25 - 1.2 * dot(normalize(vRel), uSunDir), 0.0, 1.0);
      shade = mix(shade, mix(under, 1.12, max(smoothstep(${glf(U.ANVIL_LIT0)}, ${glf(U.ANVIL_LIT1)}, anH), side)) * (0.93 + 0.14 * n), smoothstep(0.05, 0.5, an));
      // (and the sky's own light is shut out of it as the Sun's is: lit by the whole sky, its
      // underside was the tone of the cloudlets round it. It is the dark, heavy thing in its sky.)
      anUnder = smoothstep(0.05, 0.5, an) * (1.0 - max(smoothstep(${glf(U.ANVIL_LIT0)}, ${glf(U.ANVIL_LIT1)}, anH), side));
      skyShade = mix(1.0, mix(${glf(U.ANVIL_SKY_EDGE)}, ${glf(U.ANVIL_SKY)}, heavy), anUnder);
    }
  } else {
    // Altocumulus: rows of small rounded cloudlets, each with a lit and a shaded side; thick, it
    // is a grey-white veil with the Sun a pale disc behind it.
    float k = uUpper.y * uSkyLow.x * ${glf(U.MID_K)};
    float n = upperNoise(q * k);
    // (a mackerel sky comes in patches and lanes, not as an even screen of dots: a coarse look
    // at the same noise thickens the cloudlets here and thins them there. It takes the place of
    // the finer octave, which at this size is smaller than a pixel from anywhere: the same
    // number of reads.)
    float lumpN = n;
    if (uUpper.w < 0.5) lumpN = n * (${glf(1 - U.MID_PATCH)} + ${glf(2 * U.MID_PATCH)} * upperNoise(q * (k * ${glf(U.MID_PATCH_K)})));
    float veil = smoothstep(0.45, 0.85, cover);                 // thick: altostratus
    float lump = smoothstep(0.46, 0.62, lumpN + 0.35 * cover);
    alpha = min(${glf(U.MID_ALPHA)}, mix(lump * cover * 1.8, 0.75 + 0.25 * cover, veil));
    // (its two tones: the side of each cloudlet turned from the Sun. Not in a veil, which is flat.)
    // SEEN FROM ABOVE the layer lies over the land, and a veil of it thin enough to see through
    // is a grey film on the country ("stickers"): from above a veil keeps its lumps' two tones
    // (its top is rolled, and the Sun lies across it), and what is less than half there is cut
    // to a clean edge, as the heaps are. From below nothing changes.
    bool above = uUpper.z < 0.5;
    if (uUpper.w < 0.5 && (veil < 1.0 || above)) {
      float n1 = upperNoise((q + steerMid(uSunDir) * 0.12) * k);
      shade = mix(mix(${glf(U.MID_SHADE)}, 1.06, smoothstep(-0.03, 0.05, n - n1)), 1.0, above ? 0.35 * veil : veil);
    }
    if (above) alpha = mix(alpha, ${glf(U.MID_ALPHA)} * smoothstep(0.3, 0.5, alpha), uPaint.x);
  }
  // (nothing smaller than a pixel: from far above, a field of cloudlets is its own mean)
  float small = smoothstep(0.4, 1.4, px * uUpper.y / ${glf(U.MID_CELL)});
  if (small > 0.0) alpha = mix(alpha, cover * (high ? 0.55 : 0.8), small);
  // A storm tower farther along this line of sight: the tower is the sky's landmark, and the
  // veil in front of it is thinned to ${Math.round((1 - U.WINDOW) * 100)} % where the sight line goes on into its hull (by the
  // length of tower behind, so the thinning ends softly at its outline). Not its own anvil, which
  // lies over its tower as it should. (A mackerel sky 5 km up crosses every line of sight to a
  // tower 30 km off: the storm of the day was a column of cloudlets.)
  if (an < 0.05 && uCellCount > 0) {
    vec3 ray = normalize(vRel);
    float behind = 0.0;
    for (int k = 0; k < CELL_MAX; k++) {
      if (k >= uCellCount) break;
      vec2 ch = cellChord(k, uCamPlanetPos, ray);
      if (ch.y > ch.x && ch.x > dist) behind = max(behind, smoothstep(0.0, 1500.0, ch.y - ch.x));
    }
    alpha *= 1.0 - ${glf(U.WINDOW)} * behind;
  }
  // And an anvil farther along it: the mid layer's cloudlets under an anvil stand in its shadow,
  // and drawn lit in front of its dark underside they were cream flecks all over it. Thinned as
  // in front of a tower, by how much of the anvil the line of sight goes on through.
  if (!high && uAnvilCount > 0) {
    vec3 ray = normalize(vRel);
    float left = 1.0;
    for (int k2 = 0; k2 < ANVIL_MAX; k2++) {
      if (k2 >= uAnvilCount) break;
      vec2 ch = anvilChord(k2, uCamPlanetPos, ray);
      if (ch.y > ch.x && ch.x > dist) left *= anvilSeen(k2, uCamPlanetPos, ray).z;
    }
    // (all of it, not the tower's share: a fifth of a sunlit cloudlet left on a slate underside
    // was still a cream blotch)
    alpha *= left;
  }
  if (alpha < 0.004) discard;
  // light: the Sun through the air at this height (so it goes gold and then pink after the land's
  // sunset), the sky from above and below
  // (the cosine between the way one is LOOKING and the Sun, as the march and the far shell have
  // it (cloudVolume.js gCs, clouds.js cs): from the vector toward the eye instead, which is what
  // stood here, every ice effect was put opposite the Sun — the bright rim and the 22-degree halo
  // ringing the antisolar point, where a real sky has neither.)
  float mu0 = dot(up, uSunDir), cs = dot(normalize(vRel), uSunDir);
  // (uUpperOld: the old way, at every pixel, for the benchmark's what-it-adds row)
  vec3 sun = uUpperOld > 0.5 ? directSun(planetPos) * smoothstep(-0.09, 0.06, mu0) : vSun;
  // (ice: a bright rim toward the Sun, and the 22-degree halo of a cirrostratus veil)
  float fwd = 0.75 + 0.9 * pow(max(cs, 0.0), 8.0);
  if (high) fwd += ${glf(U.HALO)} * (1.0 - smoothstep(0.0, 0.02, abs(cs - 0.927))) * smoothstep(0.1, 0.4, cover);
  vec3 col = vec3(0.9) * (sun * fwd * shade + (uUpperOld > 0.5 ? skyLight(uUpper.z > 0.5 ? -up : up, up) : vSky) * (0.8 * skyShade)) / PI;
  // (its shade is the tower's slate, not the warm grey of the ground's light)
  col *= mix(vec3(1.0), vec3(${glf(CLOUD_LOOK.CELL_TINT[0])}, ${glf(CLOUD_LOOK.CELL_TINT[1])}, ${glf(CLOUD_LOOK.CELL_TINT[2])}), 0.8 * anUnder);
  // (an anvil keeps the share of the air's veil its tower keeps (CLOUD_LOOK.CELL_HAZE): through
  // all of it, 15 km of low air laid one warm beige over its underside whatever its own shade,
  // and it was the tone of the cloudlets round it)
  col = mix(col, aerialPerspective(col, vRel), mix(1.0, ${glf(CLOUD_LOOK.CELL_HAZE)}, high ? smoothstep(0.05, 0.5, an) : 0.0));
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class UpperClouds {
  constructor(renderer) {
    this.renderer = renderer;
    this.thin = false; this.off = false;
    this.uniforms = { ...lightingUniforms(), uUpper: { value: new THREE.Vector4(0, 1, 1, 0) }, uUpperOld: { value: 0 },
      uSkyLow: SKY_UNIFORMS.uSkyLow, tWxA: SKY_UNIFORMS.tWxA, tWxB: SKY_UNIFORMS.tWxB, tWxC: SKY_UNIFORMS.tWxC,
      tCloudNoise: SKY_UNIFORMS.tCloudNoise, uCloudSteer: SKY_UNIFORMS.uCloudSteer, uCloudRise: SKY_UNIFORMS.uCloudRise,
      uSteerInv: { value: SKY_UNIFORMS.uSteerInv.value }, uSteerSpin: { value: SKY_UNIFORMS.uSteerSpin.value }, uSteerRise: { value: SKY_UNIFORMS.uSteerRise.value },
      uCells: SKY_UNIFORMS.uCells, uCellCount: SKY_UNIFORMS.uCellCount, uAnvils: SKY_UNIFORMS.uAnvils, uAnvilCount: SKY_UNIFORMS.uAnvilCount };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1, CELL_MAX, ANVIL_MAX }, uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.material = mat;
    const geo = shell(32);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 900;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.ready = false;
  }

  // Before the main picture: where the two shells stand this frame and whether they are drawn.
  // c: { rig, sky } (the sky system's frame).
  update(c) {
    const sky = c.sky, R = sky?.R || 0;
    this.ready = !!(R && sky.field?.on && !sky.noClouds && !this.off && this.uniforms.tCloudNoise.value);
    if (!this.ready) return;
    const alt = c.rig.pos.length() - R;
    this.midR = R + UPPER_LOOK.MID_H; this.highR = R + UPPER_LOOK.HIGH_H;
    this.camBelowMid = alt < UPPER_LOOK.MID_H; this.camBelowHigh = alt < UPPER_LOOK.HIGH_H;
    this.cam = c.rig.pos;
  }

  // In the picture: the shells above the camera first (farthest first), the ones below it last.
  draw(c, where) {
    if (!this.ready) return;
    const above = where === 'above';
    const list = above
      ? [this.camBelowHigh && ['high', this.highR], this.camBelowMid && ['mid', this.midR]]
      : [!this.camBelowMid && ['mid', this.midR], !this.camBelowHigh && ['high', this.highR]];
    for (const item of list) {
      if (!item) continue;
      const [kind, r] = item;
      const u = this.uniforms;
      u.uUpper.value.set(kind === 'high' ? 1 : 0, r, (kind === 'high' ? this.camBelowHigh : this.camBelowMid) ? 1 : 0, this.thin ? 1 : 0);
      this.mesh.scale.setScalar(r);
      this.mesh.position.set(-this.cam.x, -this.cam.y, -this.cam.z);
      this.material.uniformsNeedUpdate = true;
      c.renderer.render(this.scene, c.rig.camera);
    }
  }

  saving(id, off) { if (id === 'cloud-upper') this.thin = !!off; }
  live(id) { return id === 'cloud-upper' && this.ready; }
  has() { return true; }
  // (the benchmark's row: the shells' Sun and sky light at every pixel, as it was)
  set lightAtPixel(on) { this.uniforms.uUpperOld.value = on ? 1 : 0; }
  partOut(id, out) { if (id === 'cloud-upper') this.off = !!out; }
}
