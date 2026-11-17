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
    };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), depthTest: true, depthWrite: false, uniforms: this.uniforms,
      vertexShader: /* glsl */`out vec3 vDir; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        ${ATMO_UNIFORMS}
        ${ATMO_COMMON}
        uniform sampler2D tTransmittance;
        uniform vec3 uSunDir, uSunIrradiance, uLimb, uUp;
        uniform float uExposure, uAngRadius, uCamRkm, uPixelAngle;
        in vec3 vDir; layout(location = 0) out vec4 fragColor;
        void main() {
          vec3 d = normalize(vDir);
          float ang = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
          float edge = 1.0 - smoothstep(uAngRadius - uPixelAngle, uAngRadius + uPixelAngle, ang);
          if (edge <= 0.0) discard;
          float rho = min(ang / uAngRadius, 1.0), mu = sqrt(max(1.0 - rho * rho, 0.0));
          vec3 limb = (1.0 - uLimb * (1.0 - mu)) / (1.0 - uLimb / 3.0);
          vec3 Lmean = uSunIrradiance / (PI * uAngRadius * uAngRadius);
          vec3 T = texture(tTransmittance, transmittanceUv(uCamRkm, dot(d, uUp))).rgb;
          fragColor = vec4(min(Lmean * limb * T * edge * uExposure, vec3(60000.0)), 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  // sunDir: THREE.Vector3 (planet-fixed); distance in metres; camera for orientation.
  update(sunDir, sunDistance, rig, viewH) {
    const ang = Math.asin(this.def.radius / sunDistance);
    this.uniforms.uAngRadius.value = ang;
    this.uniforms.uUp.value.set(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    this.uniforms.uCamRkm.value = rig.pos.length() * 0.001;
    this.uniforms.uPixelAngle.value = 2 * Math.tan(rig.fov * Math.PI / 360) / viewH * 0.75;
    const D = 50;                                   // far-pass units
    this.mesh.position.copy(sunDir).multiplyScalar(D);
    this.mesh.quaternion.copy(rig.camera.quaternion);
    this.mesh.scale.setScalar(D * Math.tan(ang) * 1.6 + D * this.uniforms.uPixelAngle.value * 2);
  }
}
