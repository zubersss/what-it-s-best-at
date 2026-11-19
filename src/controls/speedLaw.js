// How fast flight goes, as a function of the clearance to the nearest surface (metres), and
// the boost. Pure (no DOM, no three): the rig and the trip planner (autopilot.js) share it.
import { SPACE_CAP } from './gravity.js';

export const BOOST = 3;          // the stick at its rim / Shift: three times the speed

// Top speed (m/s) at full stick, before the boost. Near the ground the fraction is small
// (a fifth of the height per second), so a 7 km canyon wall drifts past slowly enough to
// look 7 km tall: with one fraction at every height the ground streams by alike at 10 m and
// at 10 km, and the eye loses the size of everything. Between 3 and 60 km it grows to 0.85,
// so trips between worlds take as long as before.
export function flightBase(dist) {
  const xs = Math.min(1, Math.max(0, Math.log(dist / 3000) / Math.log(20)));
  return Math.max(7, dist * (0.2 + 0.65 * xs * xs * (3 - 2 * xs)));
}
