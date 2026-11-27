// A rainbow: where rain falls on the side of the sky away from the Sun and the Sun still
// shines on it. The bow is a circle 42 degrees round the point opposite the Sun (red
// outside, violet inside), the sky a little brighter inside it, and a fainter second bow
// at 51 degrees with its colours the other way round. One full-screen pass that adds
// light, drawn only when there is a bow to see.
import * as THREE from 'three';

export class Rainbow {
  constructor(shared) {
    this.uniforms = {
      uExposure: shared.uExposure, uSunIrradiance: shared.uSunIrradiance, uSunDir: shared.uSunDir,
      uBowRight: { value: new THREE.Vector3() }, uBowUp: { value: new THREE.Vector3() }, uBowFwd: { value: new THREE.Vector3() },
      uBowProj: { value: new THREE.Vector3(1, 1, 0) },       // x tan(half the view angle), y aspect, z how strong the bow is
      uBowZenith: { value: new THREE.Vector3(0, 0, 1) },
    };
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(tri, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: 'out vec2 vNdc; void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uExposure; uniform vec3 uSunIrradiance, uSunDir, uBowRight, uBowUp, uBowFwd, uBowProj, uBowZenith;
        in vec2 vNdc;
        layout(location = 0) out vec4 fragColor;
        // the colour at a place in the band: 0 violet .. 1 red
        vec3 spectrum(float t) { return clamp(vec3(1.5 - abs(t - 0.85) * 3.2, 1.3 - abs(t - 0.5) * 3.6, 1.4 - abs(t - 0.14) * 3.4), 0.0, 1.0); }
        void main() {
          vec3 dir = normalize(uBowFwd + uBowRight * (vNdc.x * uBowProj.x * uBowProj.y) + uBowUp * (vNdc.y * uBowProj.x));
          float ang = degrees(acos(clamp(dot(dir, -uSunDir), -1.0, 1.0)));
          float t1 = (ang - 40.4) / 2.0, t2 = (53.6 - ang) / 3.0;
          vec3 bow = spectrum(t1) * step(0.0, t1) * step(t1, 1.0) + 0.35 * spectrum(t2) * step(0.0, t2) * step(t2, 1.0);
          // (inside the first bow the rain sends back a little white light; between the bows less)
          bow += vec3(0.05) * (1.0 - smoothstep(38.0, 40.4, ang));
          // only where there is air to look through: not far below the horizon
          float above = smoothstep(-0.12, 0.02, dot(dir, uBowZenith));
          fragColor = vec4(bow * uSunIrradiance * (0.035 * uBowProj.z * above * uExposure), 0.0);
        }`,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2000; this.mesh.visible = false;
    this.strength = 0;
  }

  // Every frame. weather: the Weather; rig: the camera rig; aspect: the view's.
  update(weather, rig, aspect, sunDir) {
    let want = 0;
    if ((weather.def || weather.own) && rig.agl < 8000) {
      // rain a few kilometres off on the side away from the Sun, the Sun low enough for the
      // bow to stand above the horizon and not hidden where the traveller stands
      const p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = Math.atan2(p.y, p.x) * 180 / Math.PI, e = weather._e, n = weather._n, u = weather._u;
      const se = sunDir.x * e[0] + sunDir.y * e[1] + sunDir.z * e[2], sn = sunDir.x * n[0] + sunDir.y * n[1] + sunDir.z * n[2], su = sunDir.x * u[0] + sunDir.y * u[1] + sunDir.z * u[2];
      const low = su > 0.02 && su < 0.66 ? Math.min(1, (0.66 - su) / 0.15) * Math.min(1, (su - 0.02) / 0.05) : 0;
      // (the air is asked only where a bow could stand: four looks, and none with the Sun high)
      const h = Math.hypot(se, sn) || 1, cl = Math.max(0.2, Math.cos(lat * Math.PI / 180)), m = weather.mPerDeg;
      let rain = 0;
      if (low > 0) for (const d of [2500, 6000, 11000, 18000]) rain = Math.max(rain, weather.rainNear(lat - sn / h * d / m, lon - se / h * d / (m * cl)));
      want = Math.min(1, rain / 1.5) * low * Math.max(0, (weather.sunShade - 0.35) / 0.65);
    }
    // (a picture: the bow at once at its full, not a hundred frames of fading in)
    this.strength += (want - this.strength) * (weather.quiet ? 1 : 0.03);
    this.mesh.visible = this.strength > 0.01;
    if (!this.mesh.visible) return;
    const m = rig.camera.matrixWorld.elements, U = this.uniforms;
    U.uBowRight.value.set(m[0], m[1], m[2]); U.uBowUp.value.set(m[4], m[5], m[6]); U.uBowFwd.value.set(-m[8], -m[9], -m[10]);
    U.uBowProj.value.set(Math.tan(rig.fov * Math.PI / 360), aspect, this.strength);
    U.uBowZenith.value.set(weather._u[0], weather._u[1], weather._u[2]);
  }
}
