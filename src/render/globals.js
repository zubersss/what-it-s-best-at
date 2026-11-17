// Uniforms shared by reference between every material that lights or fogs something.
// Modules fill these in once per frame; materials spread them into their uniform maps.
import * as THREE from 'three';

export const G = {
  uExposure: { value: 1 },                              // pre-exposure multiplier (see ARCHITECTURE.md)
  uSunDir: { value: new THREE.Vector3(0, 0, 1) },       // unit, planet-fixed frame
  uSunIrradiance: { value: new THREE.Vector3(1, 1, 1) },// at the world (1 = solar constant at 1 AU)
  uViewport: { value: new THREE.Vector2(1, 1) },        // render viewport size in pixels
  uTime: { value: 0 },                                  // seconds, for blinking lights only
  uCamPlanetPos: { value: new THREE.Vector3() },        // camera relative to planet centre (m, float32: atmosphere use only)
  uPlanetRadius: { value: 1 },
  // Camera basis in the planet-fixed frame (the camera itself is the origin).
  uCamRight: { value: new THREE.Vector3(1, 0, 0) },
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },
  uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
  uTanHalfFov: { value: new THREE.Vector2(1, 1) },
  // The Atmosphere adds its LUT textures and medium parameters here at start-up.
};
