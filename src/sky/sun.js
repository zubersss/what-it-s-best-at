// The Sun's disc: true angular size, limb darkening, attenuated by the atmosphere.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { ATMO_UNIFORMS, ATMO_COMMON } from '../atmosphere/atmosphereGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

export class SunDisc {
  constructor(sunDef) {
    this.def = sunDef;
    this.uniforms = {
      ...G,
      uAngRadius: { value: 0.003 }, uLimb: { value: new THREE.Vector3(...sunDef.limbDarkening) },
      uUp: { value: new THREE.Vector3(0, 0, 1) }, uCamRkm: { value: 3390 }, uPixelAngle: { value: 0.001 },
      uDiscDir: { value: new THREE.Vector3(0, 0, 1) }, uSurface: { value: new THREE.Vector3(1, 1, 1) },
    };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), depthTest: true, depthWrite: false, uniforms: this.uniforms,
      vertexShader: /* glsl */`out vec3 vDir; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        ${ATMO_UNIFORMS}
        ${ATMO_COMMON}
        uniform sampler2D tTransmittance;
        uniform vec3 uLimb, uUp;
        uniform vec3 uDiscDir;      // toward the Sun's centre from the camera
        uniform vec3 uSurface;      // radiance of the Sun's surface at the centre of the disc
        uniform float uExposure, uAngRadius, uCamRkm, uPixelAngle, uTime;
        in vec3 vDir; layout(location = 0) out vec4 fragColor;
        float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        void main() {
          vec3 d = normalize(vDir);
          float ang = acos(clamp(dot(d, uDiscDir), -1.0, 1.0));
          float edge = 1.0 - smoothstep(uAngRadius - uPixelAngle, uAngRadius + uPixelAngle, ang);
          // seen through the home world's air only from inside it
          vec3 T = uCamRkm < uRTop ? texture(tTransmittance, transmittanceUv(uCamRkm, dot(d, uUp))).rgb : vec3(1.0);
          vec3 col = vec3(0.0);
          if (edge > 0.0) {
            // the point of the surface this pixel sees (unit vector from the Sun's centre):
            // the ray against a sphere of radius sin(angular radius) at distance 1
            float s = sin(uAngRadius), c = dot(d, uDiscDir), h = sqrt(max(s * s - (1.0 - c * c), 0.0));
            vec3 n = (d * (c - h) - uDiscDir) / s;
            float mu = clamp(dot(n, -d), 0.0, 1.0);
            vec3 limb = (1.0 - uLimb * (1.0 - mu)) / (1.0 - uLimb / 3.0);
            // Up close the surface shows its grain: cells of rising gas, bright with darker
            // lanes, slowly changing, and a few larger dark patches. From a planet the disc
            // is too small for any of it (faded in with its size on screen).
            // Large in view it is seen as through a dark filter (no exposure could show it
            // otherwise): an evenly glowing disc, strongly darker and warmer toward its edge,
            // with a grain too fine to see until very near, a few small spots in two belts
            // either side of its equator (a black core, a paler fringe) and brighter patches
            // near the edge. From a planet it stays the blinding point it is.
            float big = smoothstep(30.0, 200.0, uAngRadius / uPixelAngle);
            float grain = 1.0;
            vec3 tint = vec3(1.0);
            if (big > 0.0) {
              float px = uAngRadius / uPixelAngle;                         // the disc's radius in pixels
              vec3 q = n * 420.0 + vec3(0.0, 0.0, uTime * 0.02);
              float g = vnoise(q) * 0.6 + vnoise(q * 2.3 + 5.0) * 0.4;
              float fineOn = smoothstep(500.0, 2500.0, px);                // the grain: only very near
              float sp = vnoise(n * 11.0 + 3.0) * 0.6 + vnoise(n * 29.0 + 7.0) * 0.4;
              float belt = smoothstep(0.08, 0.2, abs(n.z)) * smoothstep(0.55, 0.38, abs(n.z));
              float core = smoothstep(0.735, 0.75, sp) * belt, fringe = smoothstep(0.705, 0.72, sp) * belt;
              float bright = smoothstep(0.62, 0.70, vnoise(n * 23.0 + 11.0)) * (1.0 - mu) * (1.0 - mu) * belt;
              grain = mix(1.0, (1.0 + 0.10 * (g - 0.5) * fineOn) * (1.0 - 0.35 * fringe) * (1.0 - 0.85 * core) * (1.0 + 0.25 * bright), big);
              // the edge: darker than the plain law draws it once the picture is exposed for
              // the centre, and warmer
              float e = mix(1.0, 0.42 + 0.58 * pow(mu, 0.7), big);
              tint = vec3(e, e * mix(1.0, 0.86 + 0.14 * mu, big), e * mix(1.0, 0.62 + 0.38 * mu, big));
            }
            col = uSurface * limb * grain * tint * edge;
            col *= pow(min(1.0, 0.95 / max(uExposure * uSurface.g, 1e-9)), big) * mix(vec3(1.0), vec3(1.0, 0.93, 0.80), big);
          }
          // A faint glow round the disc (the inner corona): a few millionths of the surface,
          // falling off steeply. Only an exposure long enough for it shows it (an eclipse).
          float rr = max(ang / uAngRadius, 1.0);
          float bigG = smoothstep(30.0, 200.0, uAngRadius / uPixelAngle);
          col += uSurface * 4e-6 * pow(rr, -4.5) * (1.0 - edge) * smoothstep(3.0, 2.2, rr) * pow(min(1.0, 0.85 / max(uExposure * uSurface.g, 1e-9)), bigG * 0.6);
          if (col.r + col.g + col.b <= 0.0) discard;
          fragColor = vec4(min(col * T * uExposure, vec3(60000.0)), 0.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  // sunDir, sunDistance: the Sun from the home world's centre (unit vector in home axes,
  // metres); irradiance: sunlight there (THREE.Vector3). The disc is drawn where the Sun is
  // from the camera, at the size it has from there: it grows as it is approached.
  update(sunDir, sunDistance, rig, viewH, irradiance) {
    const to = this._to || (this._to = new THREE.Vector3());
    to.copy(sunDir).multiplyScalar(sunDistance).sub(rig.pos);
    const dist = to.length(), ang = Math.asin(Math.min(1, this.def.radius / dist));
    to.divideScalar(dist);
    this.uniforms.uDiscDir.value.copy(to);
    this.uniforms.uAngRadius.value = ang;
    // the surface's radiance does not depend on where it is seen from
    const a0 = Math.asin(this.def.radius / sunDistance);
    this.uniforms.uSurface.value.copy(irradiance).multiplyScalar(1 / (Math.PI * a0 * a0));
    this.uniforms.uUp.value.set(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    this.uniforms.uCamRkm.value = rig.pos.length() * 0.001;
    this.uniforms.uPixelAngle.value = 2 * Math.tan(rig.fov * Math.PI / 360) / viewH * 0.75;
    const D = 50;                                   // far-pass units (behind every body: those sit at 20 + 3k)
    this.mesh.quaternion.copy(rig.camera.quaternion);
    if (ang * 3.0 > 0.5) {
      // Close up, the disc can fill part of the view while its centre is beside or behind
      // the camera, where a quad placed on the Sun is clipped away: cover the whole view
      // instead (the shader works from the view ray alone).
      this.mesh.position.copy(rig.forward).multiplyScalar(D);
      this.mesh.scale.setScalar(D * Math.tan(rig.fov * Math.PI / 360) * 3.2);
    } else {
      // (the quad is parallel to the view plane: off axis it is seen foreshortened, so it
      // is widened by as much, or the glow round the disc is cut)
      const c = Math.max(0.3, to.dot(rig.forward));
      this.mesh.position.copy(to).multiplyScalar(D);
      this.mesh.scale.setScalar((D * Math.tan(ang * 3.0) + D * this.uniforms.uPixelAngle.value * 2) / c);
    }
  }
}
