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
  // Planetshine: light reflected onto the ground by the brightest sky body (earthshine on the Moon).
  // Weather where the traveller is (weather/weather.js): x how much of the Sun gets through
  // the cloud overhead onto the things round the camera (1: all), y how much of the clear
  // sky's light is left under that cloud, z how wet the ground is (0..1).
  uWeather: { value: new THREE.Vector4(1, 1, 0, 0) },
  uFlash: { value: new THREE.Vector3(0, 0, 0) },          // lightning: light from the whole sky for an instant
  uShineDir: { value: new THREE.Vector3(0, 0, 1) },
  uShineE: { value: new THREE.Vector3(0, 0, 0) },
  uHomeShine: { value: new THREE.Vector3(0, 0, 0) },      // light from the home world below, on something high above it facing straight down
  // Quality switches set by the governor: x = close-up ground detail, y = soft shadow edges,
  // z = full sample count for the glow on a planet's edge seen from space, w = relief
  // shading of far ground from the world's slope map.
  uQuality: { value: new THREE.Vector4(1, 1, 1, 1) },
  // The painted look (a world's `look`, see render/look.js): x how much of it (0: the plain
  // physical picture), y how much stronger the light of the sky is on things (coloured
  // shade), z how much cleaner the colours of surfaces are, w how flat a faceted rock face is lit.
  uPaint: { value: new THREE.Vector4(0, 1, 1, 0) },
  // How much of the air's haze lies over what is seen (1: all of it). A world whose look has
  // thick low air (Earth's painted haze) is seen through less of it from high above: the
  // haze is for the layers of a landscape, and from orbit it was a milky veil over the
  // whole globe (render/look.js sets it by the camera's height).
  uHaze: { value: 1 },
  // How the world's ground scatters sunlight: 0 = matte dust under air, 1 = airless regolith.
  uPhotometry: { value: 0 },
  // The world's albedo map at the camera, relative to its mean (1 when there is no map):
  // tints the things that lie on the ground there (rocks, kicked-up dust).
  uGroundTint: { value: new THREE.Vector3(1, 1, 1) },
  // The character's body as four spheres (camera-relative centre, radius; radius 0 = none):
  // it hides part of the sky from the ground right under and around it.
  uOccluders: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },     // see contactSky in the lighting chunk
  uOccGroups: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
  // The Atmosphere adds its LUT textures and medium parameters here at start-up.
};
