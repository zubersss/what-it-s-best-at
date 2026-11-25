// Shadows of the things that stand on the ground (rocks, the lander, the character), cast
// by the Sun onto everything near the camera. Terrain shadows are baked per chunk.
// One depth texture holds three tiles, all orthographic along the Sun with one light basis
// and one depth range:
//   0  scene casters (rocks, lander) within NEAR_SHADOW_RADIUS of the camera, 2048 texels
//   1  the same casters within NEAR_SHADOW_INNER of the camera, 1024 texels (fine)
//   2  the character alone ("focus" casters), NEAR_SHADOW_FOCUS around it, 1024 texels
// A point takes the finest scene tile that covers it, times the focus tile where that
// covers it. On an airless world the Sun's disc is half a degree, so a shadow's soft edge
// is about a hundredth of the distance to what casts it: centimetres for a rock or a
// figure. One map spread over 300 m (15 cm texels) blurred them into smudges and broke a
// figure's thin parts into dashes.
// Publishes tNearShadow / uShadowMatrix / uShadowParams / uShadowTile / uShadowAtlas.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { G } from '../render/globals.js';

// How far (m) a camera-relative point lies from the middle of tile k across the Sun's rays,
// as the tiles stand now (the larger of the two light-space axes: a tile is a square). A
// thing r metres round falls inside tile k when this is under the tile's half-width plus r
// (inShadowTile). This is the one rule for what a tile is given: _reaches below, and the
// rocks that choose which of theirs the fine tile draws (rocks.js, farRocks.js). Straight
// distance from the eye was the rocks' rule before, and with a low Sun the fine tile reaches
// 17.2 m / sin(elevation) along the Sun: 51 m at 20 degrees, where they drew 30 and 45 m.
export function shadowTileDistance(k, x, y, z) {
  const m = G.uShadowMatrix.value.elements, u = G.uShadowTile.value[k];
  return Math.max(Math.abs(m[0] * x + m[4] * y + m[8] * z - u.x), Math.abs(m[1] * x + m[5] * y + m[9] * z - u.y));
}
export function inShadowTile(k, x, y, z, r = 0) { return shadowTileDistance(k, x, y, z) < 1 / G.uShadowTile.value[k].z + r; }
// How many of the first n instances of an instanced caster tile k must draw: up to the last
// one that falls inside it. at: their middles (every stride numbers) from origin, which is
// camera-relative (the mesh's position); scale: their three scales; lump: the shape's
// largest radius before scaling.
export function tileShare(k, n, at, stride, origin, scale, lump) {
  for (let i = n - 1; i >= 0; i--) {
    if (inShadowTile(k, at[i * stride] + origin.x, at[i * stride + 1] + origin.y, at[i * stride + 2] + origin.z, lump * Math.max(scale[i * 3], scale[i * 3 + 1], scale[i * 3 + 2]))) return i + 1;
  }
  return 0;
}

export class NearShadow {
  constructor(renderer) {
    this.renderer = renderer;
    const N = CONFIG.NEAR_SHADOW_SIZE, n = CONFIG.NEAR_SHADOW_TILE, R = CONFIG.NEAR_SHADOW_RADIUS;
    const W = N + n, H = Math.max(N, 2 * n);
    this.size = N; this.radius = R; this.width = W; this.height = H;
    // tiles: half-width (m), texels across, atlas rectangle (texels)
    this.tiles = [
      { R, n: N, x: 0, y: 0 },
      { R: CONFIG.NEAR_SHADOW_INNER, n, x: N, y: 0 },
      { R: CONFIG.NEAR_SHADOW_FOCUS, n, x: N, y: n },
    ];
    // 16-bit depth: the depth range is a few hundred metres, so a step is ~6 mm, finer than
    // any bias used below; it keeps the atlas smaller than the single 24-bit map it replaced.
    const depth = new THREE.DepthTexture(W, H, THREE.UnsignedShortType);
    depth.compareFunction = THREE.LessEqualCompare;         // hardware PCF through sampler2DShadow
    depth.minFilter = depth.magFilter = THREE.LinearFilter;
    this.target = new THREE.WebGLRenderTarget(W, H, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true, depthTexture: depth, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.depth = depth;
    this.gpuBytes = W * H * 3;
    this.range = 420;                                        // depth extent along the Sun (m)
    this.camera = new THREE.OrthographicCamera(-R, R, R, -R, 1, 1 + this.range);
    this.casters = [];                                       // { mesh, depthMaterial, isVisible }
    this.fine = true;                                        // governor: the fine scene tile
    G.tNearShadow = { value: depth };
    G.uShadowMatrix = { value: new THREE.Matrix4() };
    // x: radius (m), y: depth range (m), z: enabled, w: focus tile in use
    G.uShadowParams = { value: new THREE.Vector4(R, this.range, 0, 0) };
    // per tile: light-space centre relative to the camera (m), 1 / half-width (1/m), texel (m)
    G.uShadowTile = { value: this.tiles.map(() => new THREE.Vector4(0, 0, 1, 1)) };
    // per tile: atlas origin and size (uv); the last entry holds the size of one texel (uv)
    G.uShadowAtlas = { value: [...this.tiles.map((t) => new THREE.Vector4(t.x / W, t.y / H, t.n / W, t.n / H)), new THREE.Vector4(1 / W, 1 / H, 0, 0)] };
    // While a tile is drawn: what to add to a pixel of the atlas to count it on the tile's
    // lattice on the ground (whole texels from the anchor, kept positive), the same texel of
    // the ground whichever pixel of the atlas it falls on as the tile follows the traveller.
    // The trees' shadow pass lets the Sun through a crown by this count (life/trees.js).
    G.uShadowHashShift = { value: new THREE.Vector2() };
    this._lx = new THREE.Vector3(); this._ly = new THREE.Vector3(); this._lz = new THREE.Vector3(0, 0, 1); this._m = new THREE.Matrix4();
    this._nx = new THREE.Vector3(); this._nz = new THREE.Vector3();
    // How often the tiles are drawn (see render): 2 = the wide tile every fourth frame, the
    // fine one every other; 1 = all of them every frame (screenshots, which must not
    // depend on which frame they are).
    this.alternate = false;       // the 30-a-second mode: the wide and the fine tile take the frames in turn (see render)
    this.every = 2; this._has = false; this._draw = [false, false, false]; this.drawn = 0;
    this.state = this.tiles.map(() => ({ ax: 0, ay: 0, az: 0, at: -1e9 }));      // where each tile was drawn last (light space, from the anchor) and when
    this._anchor = new THREE.Vector3(); this._rel = new THREE.Vector3(); this._anchored = false;
    this._c = new THREE.Vector3(); this._s = new THREE.Vector3();
    // The lattice the anchor is moved on (_reanchor): the shortest length that is a whole
    // number of texels of every tile (300/2048, 40/1024 and 7/1024 m: 4.1 m); or, should the
    // tiles' sizes not allow one, of the wide tile alone.
    const texels = this.tiles.map((t) => 2 * t.R / t.n);
    this.lattice = texels[0];
    for (let k = 1; k <= 4096; k++) { const m = k * texels[0]; if (texels.every((t) => Math.abs(m / t - Math.round(m / t)) < 1e-6)) { this.lattice = m; break; } }
  }

  // The tiles' texels lie on a lattice tied to the anchor, and the lattice turns about the
  // anchor when the light's axes are taken anew (every ~7 s, as the Sun moves 0.03 degrees).
  // With the anchor up to 300 m back, every shadow near the eye moved by up to a wide texel
  // (15 cm) then; and the anchor put again at the eye itself after 300 m of travel put the
  // lattice off its place on the ground by up to half a texel. Here the anchor is put on the
  // lattice itself (with the axes it was drawn with): the point of it nearest the eye, at the
  // eye's depth along the light. The lattice keeps its place on the ground, and it turns
  // about a point within 3 m of the eye: a still shadow near the eye moves a millimetre or
  // two when the axes are taken anew, one 60 m off 3 cm.
  _reanchor(camPos) {
    const A = this._anchor;
    if (!this._anchored) { A.copy(camPos); this._anchored = true; return; }
    const L = this.lattice, rel = this._rel.subVectors(camPos, A);
    const a = Math.round(rel.dot(this._lx) / L) * L, b = Math.round(rel.dot(this._ly) / L) * L, c = rel.dot(this._lz);
    A.addScaledVector(this._lx, a).addScaledVector(this._ly, b).addScaledVector(this._lz, c);
  }

  // isVisible: optional predicate (a mesh inside a hidden group still reports visible).
  // A mesh whose userData.shadowFocus is an Object3D (the character's parts) is drawn
  // only into the focus tile, which follows that object.
  // fineCount: optional function giving how many instances of an instanced caster can reach
  // the fine tile (they must come first); the rest are left out of that pass. It is asked
  // when the fine tile is drawn, with the tile in place: inShadowTile(1, ...) says what falls in it.
  addCaster(mesh, depthMaterial, isVisible = null, fineCount = null) { this.casters.push({ mesh, depthMaterial, isVisible, fineCount }); }
  removeCaster(mesh) { this.casters = this.casters.filter((c) => c.mesh !== mesh); }
  _on(c) { return c.mesh.visible && (!c.isVisible || c.isVisible()); }

  // Light-space footprint test: can this caster reach tile k? Instanced or unbounded
  // geometry always can.
  _reaches(c, k) {
    const g = c.mesh.geometry;
    if (g.isInstancedBufferGeometry || c.mesh.isInstancedMesh) return true;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const b = g.boundingSphere;
    if (!b || !Number.isFinite(b.radius)) return true;
    c.mesh.updateMatrixWorld();                              // (its position was set this frame)
    const p = this._c.copy(b.center).applyMatrix4(c.mesh.matrixWorld);
    const r = b.radius * c.mesh.matrixWorld.getMaxScaleOnAxis();
    return inShadowTile(k, p.x, p.y, p.z, r);
  }

  // camPos: planet-fixed doubles; sunDir: unit; localUp: array.
  //
  // Not every tile is drawn every frame. Drawing all three was a second picture's worth
  // of work each frame (6.3 million texels, with every tree near the traveller cut out
  // leaf by leaf, twice): on the phone that went on whatever the picture's size and with
  // every saving on. Rocks and trunks do not move and boughs sway slowly, so the wide tile
  // is drawn every fourth frame and the fine one every other; the character's own tile
  // every frame. A tile that is not drawn stays where it was drawn on the ground: its
  // place and its depths are handed to the shader as seen from where the camera is now.
  // The light's own axes are kept from one full drawing to the next (all three tiles
  // share them) and taken anew, with all three drawn, when the Sun has moved a little.
  render(camPos, sunDir, localUp) {
    const elevationSin = sunDir.x * localUp[0] + sunDir.y * localUp[1] + sunDir.z * localUp[2];
    const enabled = !this.off && elevationSin > -0.02 && this.casters.some((c) => this._on(c));
    const P = G.uShadowParams.value;
    P.z = enabled ? 1 : 0;
    if (!this.initialised) {
      // The depth texture must exist even when shadows are off (night): a shadow sampler
      // bound to an unallocated texture makes every lit draw call fail.
      this.initialised = true;
      this.target.scissorTest = false; this.target.viewport.set(0, 0, this.width, this.height);
      this.renderer.setRenderTarget(this.target);
      this.renderer.clear(true, true, false);
    }
    if (!enabled) { this._has = false; return; }
    const frame = this.frame = (this.frame || 0) + 1;
    const range = this.range, every = Math.max(1, this.every | 0);
    // Each tile's centre is snapped to whole texels of that tile, so shadows do not crawl
    // as the camera moves. The lattice is tied to a point on the ground near the camera,
    // not to the planet's centre: measured from the centre, it sweeps across the ground at
    // hundreds of metres per second as the Sun turns.
    const A = this._anchor;
    let all = !this._has || (every <= 1 && !this.hold);
    // Light basis; lz = toward the Sun, taken anew when the Sun has moved 0.03 degrees (8 cm
    // at the wide tile's edge). The axes across it turn only as the Sun does: the old lx made
    // square to the new Sun, by the least turn. (Made anew from the local up each time, as they
    // were, they carried the turn of the up over the ground walked since, all at once: 0.06
    // degrees after 280 m on Haven, twice the Sun's own; and they were made anew for that
    // alone at half a degree, every 2.2 km there. Which way a tile's square lies on the
    // ground makes no difference to what it covers.)
    const nz = this._nz.copy(sunDir);
    if (nz.dot(this._lz) < 0.99999986) all = true;
    // (the axes are taken anew: the lattice turns about the eye; and after 300 m of travel: see _reanchor)
    if (all || !this._anchored || A.distanceToSquared(camPos) > 4 * this.radius * this.radius) { this._reanchor(camPos); all = true; }
    if (all) {
      const nx = this._nx.copy(this._lx).addScaledVector(nz, -this._lx.dot(nz));
      // (none yet, or the Sun has gone far round since: across it from the local up)
      if (nx.lengthSq() < 0.25) { nx.set(localUp[0], localUp[1], localUp[2]).cross(nz); if (nx.lengthSq() < 1e-8) nx.set(1, 0, 0).cross(nz); }
      nx.normalize();
      this._lz.copy(nz); this._lx.copy(nx); this._ly.crossVectors(nz, nx);
    }
    const lx = this._lx, ly = this._ly, lz = this._lz;
    // camera-relative position -> light-space metres (x, y) and depth 0..1 (what the
    // orthographic cameras below write: they all sit D metres toward the Sun)
    G.uShadowMatrix.value.set(
      lx.x, lx.y, lx.z, 0,
      ly.x, ly.y, ly.z, 0,
      -lz.x / range, -lz.y / range, -lz.z / range, 0.5,
      0, 0, 0, 1);
    const rel = this._rel.subVectors(camPos, A);
    const cx = rel.dot(lx), cy = rel.dot(ly), cz = rel.dot(lz);
    // the character, if it is drawn: the focus tile follows it
    let focus = null;
    for (const c of this.casters) if (c.mesh.userData.shadowFocus && this._on(c)) { focus = c.mesh.userData.shadowFocus; break; }
    const fp = focus ? this._s.setFromMatrixPosition(focus.matrixWorld) : null;
    P.w = focus ? 1 : 0;
    const tileOn = [true, this.fine, !!focus], draw = this._draw, zoff = G.uShadowAtlas.value[3];
    this.tiles.forEach((t, k) => {
      const texel = 2 * t.R / t.n, u = G.uShadowTile.value[k], st = this.state[k];
      if (!tileOn[k]) { u.z = 1e6; st.at = -1e9; draw[k] = false; return; }     // covers nothing: never chosen
      const fx = k === 2 && fp ? fp.dot(lx) : 0, fy = k === 2 && fp ? fp.dot(ly) : 0;
      // due: by turn (the wide tile on every fourth frame, the fine one on the odd ones), or
      // when the camera has left the middle of what was drawn
      // (hold: a test's switch: the wide and fine tiles are left as they are while the camera moves)
      // (alternate, the 30-a-second mode: the wide tile on the even frames, the fine one on the
      // odd, so that no frame draws more than one of the two beside the character's own, and
      // neither is older than a fifteenth of a second: what casts into them, rocks, trunks and
      // slowly swaying boughs, does not move in that time. All three every frame, as that mode
      // had it, was the "second picture's worth" above, paid thirty times a second.)
      const due = this.alternate ? (k === 0 ? frame % 2 === 0 : frame % 2 === 1) || frame - st.at >= 2 : (k === 0 ? frame % (2 * every) === 0 : frame % every === every - 1) || frame - st.at >= 2 * every;
      const turn = k === 2 || (!this.hold && due);
      const moved = Math.max(Math.abs(st.ax - cx), Math.abs(st.ay - cy)) > 0.3 * t.R;
      draw[k] = all || turn || moved || st.at < 0;
      if (draw[k]) {
        u.set(Math.round((cx + fx) / texel) * texel - cx, Math.round((cy + fy) / texel) * texel - cy, 1 / t.R, texel);
        st.ax = u.x + cx; st.ay = u.y + cy; st.az = cz; st.at = frame;
      } else u.set(st.ax - cx, st.ay - cy, 1 / t.R, texel);
      // (depths were written from where the camera was then)
      if (k < 2) zoff.setComponent(2 + k, -(cz - st.az) / range);
    });
    this._has = true;

    const r = this.renderer, cam = this.camera, D = 1 + range * 0.5, tgt = this.target;
    this._m.makeBasis(lx, ly, lz);
    cam.quaternion.setFromRotationMatrix(this._m);
    if (all) {
      tgt.scissorTest = false;
      tgt.viewport.set(0, 0, this.width, this.height);
      r.setRenderTarget(tgt);
      r.clear(true, true, false);
    }
    this.drawn = 0;
    for (let k = 0; k < this.tiles.length; k++) {
      if (!draw[k]) continue;
      const t = this.tiles[k], u = G.uShadowTile.value[k];
      cam.left = -t.R; cam.right = t.R; cam.top = t.R; cam.bottom = -t.R;
      cam.position.set(lx.x * u.x + ly.x * u.y + lz.x * D, lx.y * u.x + ly.y * u.y + lz.y * D, lx.z * u.x + ly.z * u.y + lz.z * D);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      tgt.viewport.set(t.x, t.y, t.n, t.n);
      // (one tile alone: only its own square of the atlas is cleared and written)
      tgt.scissorTest = !all; tgt.scissor.set(t.x, t.y, t.n, t.n);
      r.setRenderTarget(tgt);
      if (!all) r.clear(true, true, false);
      this.drawn += t.n * t.n;
      // (the pixel at the atlas's t.x + n/2 is the tile's middle, which is a whole number of
      // texels from the anchor)
      const texel = 2 * t.R / t.n, st = this.state[k];
      G.uShadowHashShift.value.set(Math.round(st.ax / texel) - t.n / 2 - t.x + 65536, Math.round(st.ay / texel) - t.n / 2 - t.y + 65536);
      for (const c of this.casters) {
        const isFocus = !!c.mesh.userData.shadowFocus;
        if (!this._on(c) || isFocus !== (k === 2) || (!isFocus && !this._reaches(c, k))) continue;
        // (only instanced geometry has an instance count; the fine tile may draw fewer)
        const keep = c.mesh.material, g = c.mesh.geometry, inst = !!g.isInstancedBufferGeometry, n = g.instanceCount;
        if (inst && k === 1 && c.fineCount) g.instanceCount = Math.min(n, c.fineCount());
        c.mesh.material = c.depthMaterial;
        if (!inst || g.instanceCount > 0) r.render(c.mesh, cam);
        c.mesh.material = keep;
        if (inst) g.instanceCount = n;
      }
    }
    tgt.scissorTest = false;
    tgt.viewport.set(0, 0, this.width, this.height);
    // only depth is kept (and only if a tile was drawn: on a frame that is nobody's turn the
    // atlas is not bound, and this would be said of whatever picture is)
    if (this.drawn > 0) { const gl = r.getContext(); gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]); }
  }
}

// GLSL used by the shared lighting chunk.
export const NEAR_SHADOW_PARS = /* glsl */`
uniform highp sampler2DShadow tNearShadow;
uniform mat4 uShadowMatrix;     // camera-relative position -> light-space metres (xy) and depth 0..1 (z)
uniform vec4 uShadowParams;     // radius (m), depth range (m), enabled, focus tile in use
uniform vec4 uShadowTile[3];    // per tile: centre (m, light space, from the camera), 1 / half-width, texel (m)
uniform vec4 uShadowAtlas[4];   // per tile: atlas origin and size (uv); [3].xy = one texel (uv), [3].zw = how far (in depth 0..1)
                                // the camera has moved along the light since the wide and the fine tile were drawn
// (uQuality is declared by the lighting chunk that includes this.)

// Sun visibility from tile k at light-space point p. pn: the surface normal in light space
// (per metre), sinL: sine of its angle to the Sun. The point is pushed out along its
// normal by a texel or two (more where the light grazes) and its depth biased by half a
// texel: both scale with the tile, so the fine tiles keep shadows tight to what casts them.
float nearShadowTile(int k, vec3 p, vec3 pn, float sinL) {
  vec4 t = uShadowTile[k], a = uShadowAtlas[k];
  vec2 px = uShadowAtlas[3].xy;
  vec3 q = p + pn * (t.w * (0.5 + 1.5 * sinL));
  vec2 uv = a.xy + (0.5 + 0.5 * (q.xy - t.xy) * t.z) * a.zw;
  uv = clamp(uv, a.xy + px, a.xy + a.zw - px);           // taps never reach the next tile
  float ref = q.z - (t.w * 0.5 + 0.003) / uShadowParams.y + (k == 0 ? uShadowAtlas[3].z : k == 1 ? uShadowAtlas[3].w : 0.0);
  if (uQuality.y < 0.5) return texture(tNearShadow, vec3(uv, ref));     // governor step: one filtered tap
  vec2 d = px * 0.6;
  return 0.25 * (texture(tNearShadow, vec3(uv + d * vec2(-1.0, -0.4), ref)) + texture(tNearShadow, vec3(uv + d * vec2(1.0, 0.4), ref))
               + texture(tNearShadow, vec3(uv + d * vec2(-0.4, 1.0), ref)) + texture(tNearShadow, vec3(uv + d * vec2(0.4, -1.0), ref)));
}

// Visibility of the Sun (0..1) from rock, ship and figure shadows at a camera-relative position.
float nearShadow(vec3 rel, vec3 N) {
  float d = length(rel);
  if (uShadowParams.z < 0.5 || d > uShadowParams.x) return 1.0;
  vec3 p = (uShadowMatrix * vec4(rel, 1.0)).xyz;
  if (p.z > 1.0) return 1.0;
  vec3 pn = (uShadowMatrix * vec4(N, 0.0)).xyz;
  float cosL = clamp(-pn.z * uShadowParams.y, 0.0, 1.0), sinL = sqrt(1.0 - cosL * cosL);
  // scene casters: the fine tile where it covers the point (handing over to the coarse
  // one across its outer eighth), else the coarse one
  vec2 qi = abs(p.xy - uShadowTile[1].xy) * uShadowTile[1].z;
  float mi = max(qi.x, qi.y), s = 1.0;
  if (mi < 0.86) s = nearShadowTile(1, p, pn, sinL);
  else {
    vec2 qo = abs(p.xy - uShadowTile[0].xy) * uShadowTile[0].z;
    if (max(qo.x, qo.y) < 0.995) s = nearShadowTile(0, p, pn, sinL);
    if (mi < 0.98) s = mix(nearShadowTile(1, p, pn, sinL), s, smoothstep(0.86, 0.98, mi));
  }
  // the character's own tile
  if (uShadowParams.w > 0.5) {
    vec2 qf = abs(p.xy - uShadowTile[2].xy) * uShadowTile[2].z;
    if (max(qf.x, qf.y) < 0.98) s *= nearShadowTile(2, p, pn, sinL);
  }
  return mix(s, 1.0, smoothstep(uShadowParams.x * 0.8, uShadowParams.x, d));
}
`;
