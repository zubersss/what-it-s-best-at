// Valley fog and sea fog: white lakes of mist lying in the basins between dark ridges, with
// their tops gilded by a low Sun (the plan's "Valley fog and sea fog").
//
// It is a sheet of 129 x 129 points over 60 km, on a LATTICE FIXED TO THE WORLD (the middle
// snapped to whole steps and re-anchored only when the traveller has moved a whole step), so
// nothing of the fog moves when the traveller moves: a point of the world keeps its own height
// and its own lumps. Each vertex is lifted to the fog's top at its own place, which is field C's
// first channel (m above the sea), and the sheet is depth-tested, so a ridge cuts it crisply and
// the mist lies behind what stands out of it.
//
// Cost: one draw of 32 768 triangles, one read of the field a vertex and one of the noise a
// pixel. It is drawn only where the field has fog within reach.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { SKY_FIELD_GLSL, SKY_UNIFORMS } from './skyGlsl.js';
import { makeSkyAt } from '../weather/sky/format.js';
import { G } from '../render/globals.js';

export const FOG_LOOK = Object.freeze({
  SPAN: 60000,       // m across the whole sheet
  N: 129,            // points a side
  EDGE0: 0.1, EDGE1: 0.7,   // the share of a place's texels with fog between which the sheet fades in
  LUMP: 900,         // m: the soft lumps of its top (in what it takes of the light behind it;
                     // its top itself is level, as a lake of mist is)
  ALPHA: 0.96,       // the most it takes of what is behind it
  LAKE: 34, LAKE_DEEP: 30,   // m of mist over a lake's deep water where the field has fog, and the water's depth at which it is all there (thin at the shore)
  VEIL: 0.009,       // 1/m: the air's veil for an eye inside the mist (one sees some 110 m; the sheet itself, looked down through from above, takes 1/EXT a metre: with a quarter of that, the water under an eye just inside the top was clear where a metre higher it had been a white plate)
  VEIL_IN: 4,        // m of mist over the eye at which that veil is all there
  SHADE: 0.4,        // the share of the Sun's light it keeps in the land's shadow (cooler there, never the sky's blue alone)
  EXT: 55,           // m of mist along the line of sight that takes 63 % of what is behind it (thin at its edge: the water and the far shore show through)
  RAG: 0.55,         // how far the lumps thin and thicken its depth (its edge broken into tongues) ...
  WISP: 16,          // ... and m of depth the finer wisps take from it
  TOP: 0.35,         // the share of its depth by which its top rises and falls (at most TOP_MAX m): not a plane
  TOP_MAX: 28,
  LAND_WL: 240,      // m: the wavelength the ground under it is asked at
  SUN_ROWS: 16,      // points of its lattice whose shade from the land is asked again each frame
  SUN_STEPS: [150, 400, 900, 1800, 3500, 6500],   // m toward the Sun at which the land is looked for
  BRIGHT: 1.06,      // mist is bright: it takes the Sun and the sky and keeps them
});
const F = FOG_LOOK;
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

const VERT = /* glsl */`
precision highp sampler3D;
${SKY_FIELD_GLSL}
uniform vec3 uAnchor;          // the lattice's middle, a point of the world (planet axes, m)
uniform vec3 uEast, uNorth;    // its axes there
uniform float uStep;           // m between two points of the lattice
uniform vec3 uCamPlanetPos;    // the eye (planet axes, m): the sheet is drawn relative to it
uniform sampler2D tFogLand;     // the lattice's own land: RG the real surface under each point (ground or water, m over the sea, 1/8 m), B how much of the Sun the land leaves it, A the water's depth there (2 m a step; 0: land)
uniform vec2 uFogLand;         // x 1: the land is known, y texels a lattice step (1; 2 on the governor's coarser lattice)
out float vDepth;              // m of mist over the real surface here (under 0: the ground stands out of it)
out float vSun;                // the Sun the land leaves this place (0 in a mountain's shadow)
out vec3 vRel;
out vec3 vPlanet;
out float vFog;                // how much of this place has fog (0 none .. 1 all four of its texels)
// The fog's top at a place and how much of the place has fog, from the four texels round it,
// EACH TAKEN BY ITSELF: the top is the mean over the texels that have fog, and the share of them
// is what fades the sheet out. (A filtered read mixes a basin's top with the zero of a texel
// that has none, and the sheet's rim then dived to the sea.)
vec2 fogAt(vec3 dir) {
  ivec2 sz = textureSize(tWxC, 0);
  vec2 q = wxUV(dir) * vec2(sz) - 0.5, f = fract(q);
  ivec2 i0 = ivec2(floor(q));
  float has = 0.0, top = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    ivec2 ij = ivec2((i0.x + o.x + 2 * sz.x) % sz.x, clamp(i0.y + o.y, 0, sz.y - 1));
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    float t = wxFogTop(texelFetch(tWxC, ij, 0));
    if (t > 0.0) { has += w; top += w * t; }
  }
  return vec2(has > 0.0 ? top / has : 0.0, has);
}
void main() {
  // the lattice point: a place of the world, not of the traveller
  vec3 p = uAnchor + uEast * (position.x * uStep) + uNorth * (position.y * uStep);
  vec3 dir = normalize(p);
  // The sheet lies AT THE FOG'S TOP, a level lake of mist, and the depth test cuts it against
  // the real ground: the mist is seen wherever the ground is lower than its top, in the hollows,
  // and a ridge standing out of it hides it. (It was drawn only where the top stood above the
  // COUNTRY, the ground smoothed over 15 km; the weather model puts its fog in hollows, which
  // are below that by what a hollow is, so none of the model's fog was ever drawn.)
  vec2 fg = fogAt(dir);
  vFog = fg.y;
  vPlanet = dir;
  // The real surface under this point of the lattice (the page's own height function, asked
  // once for each point of the world's lattice: water counts as its surface, so a hollow that
  // is a lake has no mist under its water) and the land's shadow there.
  vec4 land = texelFetch(tFogLand, ivec2(position.xy * uFogLand.y + ${glf((F.N - 1) / 2 + 0.5)}), 0);
  float surf = (land.r * 65280.0 + land.g * 255.0) * 0.125;
  // MIST LIES ON WATER. A made world's hollows are its lakes (the land's maker floods every pit),
  // and the weather model, which knows the land's bed and not its water, lays its mist on the
  // bed: under the lake. Where the field has fog and the place is water, the mist stands on the
  // water instead: a few metres at the shore, LAKE m over deep water.
  float wd = land.a * 510.0, mistTop = fg.x;
  if (uFogLand.x > 0.5 && wd > 0.0) mistTop = max(mistTop, surf + ${glf(F.LAKE)} * smoothstep(0.0, ${glf(F.LAKE_DEEP)}, wd) * fg.y);
  vDepth = uFogLand.x > 0.5 ? mistTop - surf : 60.0;
  vSun = uFogLand.x > 0.5 ? land.b : 1.0;
  // its top is not a plane: it rises and falls with the lumps that drift along it
  float lump = skyTex3(tCloudNoise, skyToLow(uCloudSteer, dir) * (uSkyLow.y * uSkyLow.x * ${glf(4200 / F.LUMP)})).r;
  float top = mistTop + (lump - 0.4) * min(max(vDepth, 0.0) * ${glf(F.TOP)}, ${glf(F.TOP_MAX)});
  vec3 w = dir * (uSkyLow.y + top) - uCamPlanetPos;
  vRel = w;
  // (no fog here: out of the picture)
  gl_Position = fg.y > 0.0 ? projectionMatrix * viewMatrix * vec4(w, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
${SKY_FIELD_GLSL}
in vec3 vRel;
in vec3 vPlanet;
in float vFog;
in float vDepth;
in float vSun;
layout(location = 0) out vec4 fragColor;
void main() {
  if (vFog < 0.02 || vDepth <= 0.0) discard;
  // Mist, not a plate. How much of it the line of sight goes through decides how much it takes:
  // thin where it is shallow (its edge on a shore or up a slope: the water and the far shore show
  // through), thick over the hollow's middle. Its depth is thinned and thickened by lumps that
  // drift with the ground wind and by finer wisps, so its edge is feathered over the few hundred
  // metres the ground takes to rise through it and broken into tongues.
  vec3 qn = skyToLow(uCloudSteer, vPlanet) * (uSkyLow.y * uSkyLow.x * ${glf(4200 / F.LUMP)});
  float n = skyTex3(tCloudNoise, qn).r, n2 = skyTex3(tCloudNoise, qn * 3.1 + 0.37).g;
  float d = vDepth * (${glf(1 - F.RAG)} + ${glf(2.6 * F.RAG)} * n) - ${glf(F.WISP)} * (1.0 - n2);
  if (d <= 0.0) discard;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), rd = normalize(vRel);
  float sinE = dot(rd, up);
  // from above: down through its depth; from inside it: the mist between the eye and its top
  // (looked up through, little; looked along, all of it: no ceiling over one who stands in it)
  // (looked along from inside, the line of sight stays in the mist for hundreds of metres: with
  // the sine held at 0.05 an eye 2 m under the top saw half the far sky through it, down to the
  // horizon, over water the air's veil had already taken: a level line between the two)
  bool inside = sinE >= 0.0;
  float path = !inside ? d / max(-sinE, 0.22) : min(max(length(planetPos) - length(uCamPlanetPos), 0.0), d) / max(sinE, 0.004);
  float alpha = (inside ? 1.0 : ${glf(F.ALPHA)}) * smoothstep(${glf(F.EDGE0)}, ${glf(F.EDGE1)}, vFog) * (1.0 - exp(-path / ${glf(F.EXT)}));
  // (from INSIDE the mist the sheet is over the eye and veils the sky; what lies below the eye's
  // level is veiled by the air's own veil, which the sheet hands the sky system: eyeVeil)
  if (alpha < 0.01) discard;
  // the dawn's colour: the sky's cool light everywhere, and the low Sun's warm one where the land
  // lets it through (the mist in a mountain's shadow is blue-grey, the tongue the Sun has reached gold)
  float mu0 = max(dot(up, uSunDir), 0.0);
  // (in the land's shadow it keeps SHADE of the Sun's light: mist is lit through itself and by the
  // sunlit air over it. With none, shaded mist was the zenith's deep blue, and from its own shore a
  // flat blue sea.)
  vec3 sun = directSun(planetPos) * (mix(${glf(F.SHADE)}, 1.0, vSun) * (0.3 + 0.7 * mu0));
  vec3 col = vec3(${glf(F.BRIGHT)}) * (sun * 0.8 + skyLight(up, up) * 0.9) / PI;
  col = aerialPerspective(col, vRel);
  // (from inside, toward the horizon, it is the very colour the air's veil gives the water and
  // the shore under it (rainVeil in the lighting chunk): the mist is one thing, above the eye's
  // level and below it. Higher up it is lit mist with the sky coming through.)
  if (inside) col = mix(skyLight(up, up) * (0.7 / PI), col, smoothstep(0.08, 0.5, sinE));
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

// The level axes at a place of the world (east, then north): a function of that place alone.
export function frameAt(q) {
  const r = Math.hypot(q[0], q[1], q[2]) || 1, up = [q[0] / r, q[1] / r, q[2] / r];
  const el = Math.hypot(-q[1], q[0]);
  const east = el > 1 ? [-q[1] / el, q[0] / el, 0] : [1, 0, 0];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  return { up, east, north };
}

// (Held back from the link for a morning, 2026-11-27, while it drew as a flat white plate; let
// go when it read as mist from above and from the opening view. Still wrong: from inside the
// mist at eye height the water below the eye is not veiled: weather.js's veil does not know of
// mist that stands on water.)
const HELD = false;

export class FogSheet {
  constructor(renderer) {
    this.renderer = renderer;
    this.off = false; this.ready = false; this.thin = false; this.held = renderer ? HELD : false;      // (a sheet made without a renderer is a test's: it is tried as made)
    this.uniforms = {
      ...lightingUniforms(), uSkyLow: SKY_UNIFORMS.uSkyLow, tWxA: SKY_UNIFORMS.tWxA, tWxB: SKY_UNIFORMS.tWxB, tWxC: SKY_UNIFORMS.tWxC,
      tCloudNoise: SKY_UNIFORMS.tCloudNoise, uCloudSteer: SKY_UNIFORMS.uCloudSteer, uCloudRise: SKY_UNIFORMS.uCloudRise,
      uAnchor: { value: new THREE.Vector3() }, uEast: { value: new THREE.Vector3() }, uNorth: { value: new THREE.Vector3() }, uStep: { value: F.SPAN / (F.N - 1) },
      tFogLand: { value: null }, uFogLand: { value: new THREE.Vector2(0, 1) },
    };
    // the lattice's own land (see _land): four bytes a point, uploaded between frames
    this.landBytes = new Uint8Array(F.N * F.N * 4);
    this.landTex = new THREE.DataTexture(this.landBytes, F.N, F.N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.landTex.minFilter = this.landTex.magFilter = THREE.NearestFilter; this.landTex.generateMipmaps = false; this.landTex.flipY = false; this.landTex.colorSpace = THREE.NoColorSpace;
    this.uniforms.tFogLand.value = this.landTex;
    this.eyeVeil = 0;                // 1/m: the air's veil for an eye inside the mist (see _eye)
    this.land = null;                // () => the page's height source (terrain.hs): set by the sky system
    this._landAnchor = null; this._sunAt = 0; this._landDirty = false; this._landAge = 0; this.landAsked = 0;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.material = mat;
    // (the grid's x and y run from -(N-1)/2 to (N-1)/2 in whole steps: a lattice, not a plane of
    // its own size, so the vertex shader can snap it to the world)
    // the lattice, and a coarser one for the governor's step (half as many points a side: a
    // quarter of the triangles, and the same places of the world, since the step is doubled)
    const grid = (n) => new THREE.PlaneGeometry(n - 1, n - 1, n - 1, n - 1);
    this.fine = grid(F.N); this.coarse = grid((F.N + 1) / 2);
    this.mesh = new THREE.Mesh(this.fine, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 950;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this._anchor = null;
  }

  // Before the main picture: where the lattice stands (snapped, so it does not slide), and
  // whether there is any fog in reach at all. c: { rig, sky }.
  update(c) {
    const sky = c.sky, R = sky?.R || 0;
    this.ready = false;
    // (the veil goes when the mist does: eased off here, and set again by _eye while there is mist)
    this._veilWas = this.eyeVeil; this.eyeVeil = c.sky?.shotMode || this.eyeVeil < 1e-6 ? 0 : this.eyeVeil * 0.92;
    if (this.held || !R || !sky.field?.on || sky.noClouds || this.off || !this.uniforms.tCloudNoise.value) return;
    const step = this.uniforms.uStep.value, p = c.rig.pos;
    // The lattice's middle: the traveller's place snapped to whole steps, kept until it is a
    // whole step away. ITS AXES ARE THE ANCHOR'S OWN, never the traveller's: taken at
    // the traveller they turn with every metre flown, and the whole lattice then swings about its
    // anchor — on a world 250 km in radius by up to a tenth of a kilometre at the sheet's far
    // corner, to and fro as the traveller crosses each cell, so the fog's edge crawled against
    // the ridges all the way. What the shader is given now depends on the anchor alone, and
    // between two anchors nothing of the sheet moves at all (scripts/fog-sheet-test.mjs).
    let a = this._anchor;
    let { east, north } = frameAt(a || [p.x, p.y, p.z]);
    const de = a ? (p.x - a[0]) * east[0] + (p.y - a[1]) * east[1] + (p.z - a[2]) * east[2] : 0;
    const dn = a ? (p.x - a[0]) * north[0] + (p.y - a[1]) * north[1] + (p.z - a[2]) * north[2] : 0;
    if (!a || Math.abs(de) > step || Math.abs(dn) > step) {
      const ne = a ? Math.round(de / step) : 0, nn = a ? Math.round(dn / step) : 0;
      const base = a || [p.x, p.y, p.z];
      a = this._anchor = [base[0] + east[0] * ne * step + north[0] * nn * step, base[1] + east[1] * ne * step + north[1] * nn * step, base[2] + east[2] * ne * step + north[2] * nn * step];
      ({ east, north } = frameAt(a));
    }
    // Is there fog within reach? (the field over a square of 81 places across the sheet; the
    // sheet is drawn only where there is. A ring of eight at the sheet's edge missed what lay
    // between them: fog lies in basins a few kilometres wide, and one of those falls through a
    // ring of 24 km easily. Asked again when the traveller has gone a few kilometres or the
    // clock has moved on — it burns off over an hour — so this is under a millisecond every few seconds,
    // not page work in every frame.)
    const out = this._at || (this._at = makeSkyAt());
    const a0 = this._fogAt;
    if (!a0 || Math.abs(sky.t - this._fogT) > 60 || (p.x - a0[0]) ** 2 + (p.y - a0[1]) ** 2 + (p.z - a0[2]) ** 2 > 3000 * 3000) {
      let fog = 0;
      const look = (x, y, z) => { const v = sky.field.at([x, y, z], sky.t, out); fog = Math.max(fog, v.field.fogTop); };
      const reach = F.SPAN * 0.45;
      for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
        const ce = i * reach * 0.25, cn = j * reach * 0.25;
        look(p.x + east[0] * ce + north[0] * cn, p.y + east[1] * ce + north[1] * cn, p.z + east[2] * ce + north[2] * cn);
      }
      this._fogAt = [p.x, p.y, p.z]; this._fogT = sky.t; this._fog = fog;
    }
    if (!(this._fog >= 1)) return;
    const u = this.uniforms;
    u.uAnchor.value.set(this._anchor[0], this._anchor[1], this._anchor[2]);
    u.uEast.value.set(east[0], east[1], east[2]); u.uNorth.value.set(north[0], north[1], north[2]);
    this._land(east, north, R);
    this.ready = true;
    this._eye(c, R);
  }

  // The eye inside the mist: how much mist stands over it, by the same rule the sheet is laid by
  // (the field's fog top at the eye, or the water's surface and the mist that stands on it), and
  // from that the air's own veil (eyeVeil, 1/m), which the sky system puts into what every lit
  // thing reads (uWeather.w, beside the rain's). Eased, so that walking into the mist it comes on.
  _eye(c, R) {
    const hs = this.land ? this.land() : null, here = c.sky?.here, p = c.rig.pos;
    let want = 0;
    if (hs && here && here.field.fogTop > 0) {
      const l = p.length(), g = hs.height(p.x / l, p.y / l, p.z / l, F.LAND_WL), wd = hs.waterDepth > 0 ? hs.waterDepth : 0;
      // (over water the height function answers the water's SURFACE, with its depth beside it:
      // the depth is not added. Added, the mist stood the lake's depth too high over deep water.)
      const surf = Math.max(0, g), k = Math.min(1, Math.max(0, wd / F.LAKE_DEEP));
      const top = wd > 0 ? Math.max(here.field.fogTop, surf + F.LAKE * k * k * (3 - 2 * k)) : here.field.fogTop;
      const over = top - (l - R), t = Math.min(1, Math.max(0, over / F.VEIL_IN));
      want = top > surf ? F.VEIL * t * t * (3 - 2 * t) : 0;
    }
    const was = this._veilWas || 0;
    this.eyeVeil = was + (want - was) * (c.sky?.shotMode ? 1 : 0.08);
  }

  // The real surface under every point of the lattice, and the land's shadow on it. The lattice
  // is the world's, so a point's surface is asked ONCE: when the anchor moves a step, what is
  // known is moved with it and only the new row or column is asked (129 questions of the height
  // function, about a microsecond each); after a jump, all 16 641. The land's shadow is asked
  // again for SUN_ROWS points a frame (the Sun moves), each a short look toward the Sun through
  // the same height function. Both go to the GPU as one small texture, between frames.
  _land(east, north, R) {
    const hs = this.land ? this.land() : null, u = this.uniforms, N = F.N, half = (N - 1) / 2, fine = F.SPAN / (N - 1);
    u.uFogLand.value.set(hs ? 1 : 0, this.thin ? 2 : 1);
    if (!hs) return;
    const a = this._anchor, b = this.landBytes;
    const point = (i, j, out) => {
      const e = (i - half) * fine, n = (j - half) * fine;
      out[0] = a[0] + east[0] * e + north[0] * n; out[1] = a[1] + east[1] * e + north[1] * n; out[2] = a[2] + east[2] * e + north[2] * n;
      return out;
    };
    const p = this._p || (this._p = [0, 0, 0]);
    let wet = 0;                       // (the water's depth at the place last asked about, m)
    const surface = (q) => {
      const l = Math.hypot(q[0], q[1], q[2]);
      const g = hs.height(q[0] / l, q[1] / l, q[2] / l, F.LAND_WL), w = hs.waterDepth > 0 ? hs.waterDepth : 0;
      this.landAsked++; wet = w;
      return Math.max(0, g);          // (the water's surface over water: see _eye)
    };
    const put = (i, j) => {
      const o = (j * N + i) * 4, v = Math.min(65535, Math.round(surface(point(i, j, p)) * 8));
      // (the fourth byte: how deep the water is there, 2 m a step; 0 on land)
      b[o] = v >> 8; b[o + 1] = v & 255; b[o + 2] = 255; b[o + 3] = wet > 0 ? Math.min(255, Math.max(1, Math.round(wet / 2))) : 0;
    };
    const la = this._landAnchor;
    let di = null, dj = null;
    if (la) {
      // (how many whole steps the anchor has moved, in the lattice's own axes)
      const dx = a[0] - la[0], dy = a[1] - la[1], dz = a[2] - la[2];
      di = Math.round((dx * east[0] + dy * east[1] + dz * east[2]) / fine); dj = Math.round((dx * north[0] + dy * north[1] + dz * north[2]) / fine);
    }
    if (!la || Math.abs(di) >= N || Math.abs(dj) >= N) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) put(i, j);
      this._landDirty = true; this._sunAt = 0; this._sunBurst = N * N;
    } else if ((di || dj) && !this.breakNoShift) {
      const old = b.slice();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const si = i + di, sj = j + dj;
        if (si >= 0 && si < N && sj >= 0 && sj < N) { const o = (j * N + i) * 4, q = (sj * N + si) * 4; b[o] = old[q]; b[o + 1] = old[q + 1]; b[o + 2] = old[q + 2]; b[o + 3] = old[q + 3]; } else put(i, j);
      }
      this._landDirty = true;
    }
    this._landAnchor = [a[0], a[1], a[2]];
    // the land's shadow: SUN_ROWS points a frame (all of them the first time)
    // (after a jump all of them, a sixteenth a frame: until a point is asked it is in the Sun)
    let stale = false;
    const burst = Math.min(this._sunBurst || 0, Math.ceil(N * N / 16));
    this._sunBurst = (this._sunBurst || 0) - burst;
    const sun = G.uSunDir.value, count = burst || F.SUN_ROWS, q = this._q || (this._q = [0, 0, 0]);
    for (let c = 0; c < count; c++) {
      // (in strides through the lattice, not row by row: a change anywhere is met within a frame or two)
      const k = this._sunAt; this._sunAt = (k + (burst ? 1 : 4099)) % (N * N);
      const o = k * 4;
      // (the surface itself is asked again on the same round: a lake's water reaches the page
      // after the land does, and a lattice asked once at the start had the lake's bed for ever
      // and its mist under the water. What is laid on the ground is laid again when the ground's
      // data arrives.)
      { const s0 = b[o], s1 = b[o + 1], s3 = b[o + 3], lit0 = b[o + 2]; put(k % N, (k / N) | 0); b[o + 2] = lit0; if (b[o] !== s0 || b[o + 1] !== s1 || b[o + 3] !== s3) { this._landChanged = true; if (Math.abs((b[o] - s0) * 256 + b[o + 1] - s1) > 16 || (b[o + 3] > 0) !== (s3 > 0)) stale = true; } }
      const surf = (b[o] * 256 + b[o + 1]) / 8;
      point(k % N, (k / N) | 0, p);
      const l = Math.hypot(p[0], p[1], p[2]), r0 = R + surf + 25;
      let lit = 255;
      for (const s of F.SUN_STEPS) {
        q[0] = p[0] / l * r0 + sun.x * s; q[1] = p[1] / l * r0 + sun.y * s; q[2] = p[2] / l * r0 + sun.z * s;
        if (surface(q) > Math.hypot(q[0], q[1], q[2]) - R) { lit = 0; break; }
      }
      if (b[o + 2] !== lit) { b[o + 2] = lit; this._landChanged = true; }
    }
    // (the ground under the lattice is not what it was — its water has arrived, or finer land:
    // all of it is asked again at the next frame, at most once a second)
    if (stale && !burst && this._landAge > 30) this._landAnchor = null;
    // (the shadow's changes go up at most twice a second; a moved lattice at once)
    this._landAge++;
    if (this._landChanged && (this._landAge > 15 || burst)) { this._landDirty = true; }
    if (this._landDirty) {
      this.landTex.needsUpdate = true;
      this.renderer?.initTexture?.(this.landTex);
      this._landDirty = false; this._landChanged = false; this._landAge = 0;
    }
  }

  draw(c) {
    if (!this.ready) return;
    c.renderer.render(this.scene, c.rig.camera);
  }

  // The governor's step and the benchmark's part. Thinned, the sheet is a lattice of half as
  // many points a side over the same 60 km (a quarter of the triangles, standing on the same
  // places of the world: the step is doubled, so every coarse point is a fine one). The fog is
  // still there, as a step must leave what the place is about.
  saving(id, off) {
    if (id !== 'fog-sheet') return;
    this.thin = !!off;
    this.mesh.geometry = this.thin ? this.coarse : this.fine;
    this.uniforms.uStep.value = F.SPAN / (F.N - 1) * (this.thin ? 2 : 1);
  }

  live(id) { return id === 'fog-sheet' && this.ready; }
  has(id) { return id === 'fog' || id === 'fog-sheet'; }
  partOut(id, out) { if (id === 'fog') this.off = !!out; }
}
