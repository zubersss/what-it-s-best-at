// Waterfalls seen from afar, and their mist. Where a river falls is worked out with the
// rivers (terrain/tiles/hydrology.js, falls(): the water's level drops all at once, and the
// ground's own picture of the river goes over the drop as white water). But a drop is a
// metre or two of ground from above, far less than a texel of the far ground's maps: from
// a kilometre off there would be nothing. So every fall the map rings know of also gets
//   - a sheet: a leaning white card as wide as the river from its lip to its foot, streaked
//     down its length, the streaks running down; never under a pixel and a half wide (a
//     thread on the rock, thinner in strength instead of in width), and fading out close
//     by, where the ground's own picture of the fall takes over;
//   - mist: a soft cloud at its foot that the Sun lights, brightest looked at toward the Sun.
// One draw call, a fixed pool, nothing kept from frame to frame but the clock's place.
//
// The falls come with the rings' water (packWater: six numbers a fall). A place belongs to
// the finest ring whose box holds it, as in the height code (DemSet._ringWater): a coarser
// ring's falls are shown only outside the finer rings' boxes.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { RING_INSET } from '../terrain/height/dem.js';

const MAX = 384;                 // falls drawn at once (sheet and mist each take one of the pool's 2 x MAX)
const REACH = 60000;             // metres: none farther than this is listed
const LEAN = 0.3;                // how far out the sheet leans for its height: the water leaves the lip in an arc
// The streaks' clock: every term of it turns a whole number of times in PERIOD seconds, and
// the waves' clock (uWave.z, which wraps at 14 400 s) is a whole number of PERIODs.
const PERIOD = 8;

export class Falls {
  constructor(shared) {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    quad.setIndex([0, 2, 1, 1, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 3), 3);          // the lip's middle, from the anchor (m)
    this.aDir = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 3), 3);          // the way the water runs there (unit, along the ground)
    this.aDim = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 4), 4);          // x: half width (m), y: drop (m), z: 0 sheet / 1 mist, w: its own number
    quad.setAttribute('aPos', this.aPos); quad.setAttribute('aDir', this.aDir); quad.setAttribute('aDim', this.aDim);
    quad.instanceCount = 0;
    this.geo = quad;
    this.anchor = new THREE.Vector3(); this.count = 0; this.mist = true;
    this.uniforms = {
      ...lightingUniforms(), uWave: shared.uWave,
      uFalls: { value: new THREE.Vector4() },          // xyz: the anchor less the camera (m), w: 1 with mist, 0 without
      uFallsView: { value: new THREE.Vector2(1, 1) },  // x: the picture's height (pixels), y: unused
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines() }, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */`
        in vec3 aPos, aDir; in vec4 aDim;
        uniform vec3 uCamPlanetPos; uniform vec4 uFalls; uniform vec2 uFallsView;
        out vec3 vRel; out vec4 vUv;          // vUv: xy across and down the card (0..1), z: 0 sheet / 1 mist, w: its strength
        out vec4 vDim;
        void main() {
          vec3 lip = uFalls.xyz + aPos, up = normalize(uCamPlanetPos + lip), right = normalize(cross(up, aDir));
          float half = aDim.x, drop = aDim.y, dist = length(lip), k = 1.0;
          vec3 rel;
          if (aDim.z < 0.5) {
            // the sheet. Its width on the picture: never under a pixel and a half (thinner in strength instead)
            float px = 2.0 * half * uFallsView.x * abs(projectionMatrix[1][1]) * 0.5 / max(dist, 1.0), drawn = max(px, 1.5);
            k = px / drawn; half *= drawn / max(px, 1e-4);
            // (a little wider at its foot, where the water has spread)
            rel = lip + right * ((position.x - 0.5) * 2.0 * half * (1.0 + 0.25 * position.y)) + (aDir * ${LEAN.toFixed(2)} - up) * (drop * position.y) + up * 0.3;
            // (close by the ground's own picture of the fall is there: the card would stand in front of it)
            k *= smoothstep(70.0, 220.0, dist);
          } else {
            // the mist: a soft round cloud at the foot, facing the eye
            if (uFalls.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
            float r = clamp(0.45 * drop + half, 3.0, 26.0);
            vec3 foot = lip + (aDir * ${LEAN.toFixed(2)} - up) * drop + up * (0.45 * r) + aDir * (0.3 * r);
            vec3 cr = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0])), cu = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
            rel = foot + (cr * (position.x - 0.5) + cu * (position.y - 0.5)) * (2.0 * r);
            // (not a blob a hand from the lens, and gone where it is under a pixel)
            k = smoothstep(4.0, 30.0, dist) * smoothstep(0.7, 2.5, r * uFallsView.x * abs(projectionMatrix[1][1]) / max(dist, 1.0));
          }
          if (k <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vRel = rel; vUv = vec4(position.xy, aDim.z, k); vDim = aDim;
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uWave;
        in vec3 vRel; in vec4 vUv; in vec4 vDim;
        layout(location = 0) out vec4 fragColor;
        const float TAU = 6.2831853;
        void main() {
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
          float t = uWave.z / ${PERIOD.toFixed(1)}, own = vDim.w * 17.0, a, fwx = fwidth(vUv.x);
          vec3 col;
          if (vUv.z < 0.5) {
            // streaks down the sheet: strands that run down it, each at its own pace, torn at the
            // foot; thin at its two edges
            float x = vUv.x, y = vUv.y, tall = max(vDim.y, 1.0), wide = max(2.0 * vDim.x, 1.0);
            float lanes = max(3.0, floor(wide / 0.9));
            float lane = x * lanes + own, id = floor(lane), fr = lane - id, h = fract(sin(id * 12.9898 + own) * 43758.5453);
            float run = fract(y * tall / (9.0 + 6.0 * h) - t * (3.0 + floor(h * 3.0)) + h);          // (each strand a whole number of turns a period)
            float strand = (0.55 + 0.45 * smoothstep(0.0, 0.35, run) * (1.0 - smoothstep(0.6, 1.0, run))) * (0.6 + 0.4 * sin(3.14159 * fr));
            float px = fwx * lanes;
            strand = mix(strand, 0.72, smoothstep(0.35, 1.0, px));                                 // (a strand under a pixel: its mean)
            a = strand * smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.88, 1.0, x)) * (1.0 - 0.35 * smoothstep(0.75, 1.0, y) * h);
            // white water: lit as a rough white face that takes the Sun from every side, and the sky
            float nl = 0.5 + 0.5 * max(dot(up, uSunDir), 0.0);
            col = vec3(0.86, 0.90, 0.93) * (directSun(planetPos) * nl / PI + skyLight(up, up) / PI);
          } else {
            vec2 q = vUv.xy * 2.0 - 1.0;
            float r = length(q), th = atan(q.y, q.x);
            // (billows that turn slowly, a whole number of turns a period)
            float edge = 0.78 + 0.14 * sin(3.0 * th + own + TAU * t) + 0.08 * sin(5.0 * th - own * 1.7 - TAU * 2.0 * t);
            a = (1.0 - smoothstep(0.15, edge, r)) * 0.34 * (1.0 - 0.5 * smoothstep(-0.2, 0.9, q.y));
            // (drops throw the Sun's light forward: looked at toward the Sun the mist glows)
            float c = max(dot(-V, uSunDir), 0.0), c2 = c * c;
            col = vec3(0.90, 0.93, 0.96) * (directSun(planetPos) * (0.45 + 1.6 * c2 * c2) / PI + skyLight(up, up) / PI);
          }
          a *= vUv.w;
          if (a <= 0.003) discard;
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * (a * uExposure), a);
        }`,
    });
    this.mesh = new THREE.Mesh(quad, this.material); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 5;
  }

  // The governor's 'water' step: the sheets stay, the mist goes.
  setMist(on) { this.mist = on; }

  // The rings have changed (or the traveller has gone far from the anchor): the list again.
  // rings: per slot, coarsest first, { zoom, tx, ty, width, falls } or null (Terrain.ringFalls);
  // radius: the world's; at: the traveller (the world's axes, m).
  rebuild(rings, radius, at) {
    this.anchor.copy(at);
    const P = this.aPos.array, D = this.aDir.array, M = this.aDim.array, list = [];
    const boxes = rings.map((r) => (r ? { n: 2 ** r.zoom, tx: r.tx, ty: r.ty, W: r.width } : null));
    // (is a place, as fractions of the world map, inside a ring's box?)
    const inBox = (b, fx, fy) => { let x = fx * b.n - b.tx; x -= b.n * Math.floor(x / b.n); x *= 256; const y = (fy * b.n - b.ty) * 256; return x >= RING_INSET && y >= RING_INSET && x <= b.W - RING_INSET && y <= b.W - RING_INSET; };
    for (let s = rings.length - 1; s >= 0; s--) {
      const r = rings[s]; if (!r || !r.falls) continue;
      const f = r.falls, b = boxes[s];
      for (let o = 0; o + 5 < f.length; o += 6) {
        if (f[o] < RING_INSET || f[o + 1] < RING_INSET || f[o] > b.W - RING_INSET || f[o + 1] > b.W - RING_INSET) continue;
        const fx = (b.tx + f[o] / 256) / b.n, fy = (b.ty + f[o + 1] / 256) / b.n;
        let finer = false; for (let q = s + 1; q < rings.length && !finer; q++) if (boxes[q] && rings[q].falls && inBox(boxes[q], ((fx % 1) + 1) % 1, fy)) finer = true;
        if (finer) continue;
        const lon = fx * 2 * Math.PI - Math.PI, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))), cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
        const R = radius + f[o + 2], x = cl * co * R - at.x, y = cl * so * R - at.y, z = sl * R - at.z, d2 = x * x + y * y + z * z;
        if (d2 > REACH * REACH) continue;
        // (the way it runs: east and north at the place, by the fall's angle)
        const ca = Math.cos(f[o + 5]), sa = Math.sin(f[o + 5]);
        list.push({ d2, x, y, z, dx: -so * ca - sl * co * sa, dy: co * ca - sl * so * sa, dz: cl * sa, half: Math.max(1, f[o + 4]), drop: f[o + 3], own: ((f[o] * 7.31 + f[o + 1] * 3.17 + s) % 1 + 1) % 1 });
      }
    }
    // (the nearest first, if there are more than the pool holds)
    list.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(MAX, list.length);
    for (let i = 0; i < n; i++) for (let kind = 0; kind < 2; kind++) {
      const e = list[i], j = i + kind * n;
      P[j * 3] = e.x; P[j * 3 + 1] = e.y; P[j * 3 + 2] = e.z; D[j * 3] = e.dx; D[j * 3 + 1] = e.dy; D[j * 3 + 2] = e.dz;
      M[j * 4] = e.half; M[j * 4 + 1] = e.drop; M[j * 4 + 2] = kind; M[j * 4 + 3] = e.own;
    }
    this.aPos.needsUpdate = this.aDir.needsUpdate = this.aDim.needsUpdate = true;
    this.count = n; this.geo.instanceCount = 2 * n; this.mesh.visible = n > 0;
    this.listed = list.length;
  }

  // Every frame. camPos: the camera (the world's axes, m); viewH: the picture's height (pixels).
  update(camPos, viewH) {
    this.uniforms.uFalls.value.set(this.anchor.x - camPos.x, this.anchor.y - camPos.y, this.anchor.z - camPos.z, this.mist ? 1 : 0);
    this.uniforms.uFallsView.value.set(viewH, 0);
  }
}
