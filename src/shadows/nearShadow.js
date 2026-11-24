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
  }

  // isVisible: optional predicate (a mesh inside a hidden group still reports visible).
  // A mesh whose userData.shadowFocus is an Object3D (the character's parts) is drawn
  // only into the focus tile, which follows that object.
  // fineCount: optional function giving how many instances of an instanced caster can reach
  // the fine tile (they must come first); the rest are left out of that pass.
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
    const t = this.tiles[k], u = G.uShadowTile.value[k];
    return Math.abs(p.dot(this._lx) - u.x) < t.R + r && Math.abs(p.dot(this._ly) - u.y) < t.R + r;
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
    if (!this._anchored || A.distanceToSquared(camPos) > 4 * this.radius * this.radius) { A.copy(camPos); this._anchored = true; all = true; }
    // Light basis; lz = toward the Sun.
    const nz = this._nz.copy(sunDir), nx = this._nx.set(localUp[0], localUp[1], localUp[2]).cross(nz);
    if (nx.lengthSq() < 1e-8) nx.set(1, 0, 0).cross(nz);
    nx.normalize();
    // (0.03 degrees of Sun: 8 cm at the wide tile's edge; half a degree of turn about it, which changes nothing but the tiles' squares)
    if (all || nz.dot(this._lz) < 0.99999986 || nx.dot(this._lx) < 0.99996) { all = true; this._lz.copy(nz); this._lx.copy(nx); this._ly.crossVectors(nz, nx); }
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
