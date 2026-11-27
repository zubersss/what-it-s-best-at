// Snow that comes and goes, for every shader that draws something snow can lie on (the
// ground, rocks, the tops of crowns near and far, the grass): one text, and the numbers of
// the season's one rule (life/season.js, "Snow that comes and goes": snowYear, snowFresh),
// set once a frame by the app (App.updateSnow). A shader works nothing out about the year.
import * as THREE from 'three';

// Shared by every material that includes SNOW_GLSL (the same objects: set once).
export const SNOW_UNIFORMS = {
  uSnowLand: { value: new THREE.Vector4(0, 0, 0, 1e9) },   // x: the land's own snow line at the equator (m over the sea), y: metres lower a degree of latitude, z: metres a degree C (0: no snow rule on this world), w: fresh snow's line where the traveller is (m; huge: none)
  uSnowYear: { value: new THREE.Vector4(0, 0, 0, 0) },     // x, y: how much warmer than the land's own snow's day, north and south (degrees C); z: new snow lies this far above the land's line (m); w: the land's snow is gone this far below it (m)
};

// snowSeason(height, up, N, slope, rough): x: how much new snow lies here (0..1), y: how much
// of the land's own (painted) snow is gone (0..1).
//   height: m over the sea; up: the unit direction from the world's middle; N: the surface's
//   normal (planet axes); slope: its steepness, m per m; rough: a number of the place about
//   -0.5..0.5 that breaks the line (0 for a thing that has none).
// A slope turned toward the equator's sky is warmer: it loses its snow first and takes it
// last; steep ground sheds it.
export const SNOW_GLSL = /* glsl */`
uniform vec4 uSnowLand, uSnowYear;
vec2 snowSeason(float height, vec3 up, vec3 N, float slope, float rough) {
  if (uSnowLand.z <= 0.0) return vec2(0.0);
  float alat = degrees(asin(clamp(abs(up.z), 0.0, 1.0)));
  float own = uSnowLand.x - uSnowLand.y * alat, shift = (up.z >= 0.0 ? uSnowYear.x : uSnowYear.y) * clamp(alat / 45.0, 0.0, 1.0) * uSnowLand.z;
  float sunny = -sign(up.z) * (N.z - up.z * dot(N, up));          // (how far the surface leans toward the equator)
  float h = height + rough * 320.0 - sunny * 420.0;
  float add = smoothstep(-70.0, 70.0, h - min(own + uSnowYear.z + shift, uSnowLand.w)) * (1.0 - smoothstep(0.6, 1.0, slope));
  float gone = 1.0 - smoothstep(-90.0, 90.0, h - (own - uSnowYear.w + shift));
  return vec2(add, gone);
}`;
