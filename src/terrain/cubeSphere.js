// Cube-sphere mapping. Face coordinates (a, b) run -1..1 and are tangent-warped so cells
// are nearly equal in size. Pure JS (used by workers too).
export const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
];

const Q = Math.PI / 4;

export function faceToDir(face, a, b, out) {
  const f = FACES[face];
  const ta = Math.tan(a * Q), tb = Math.tan(b * Q);
  const x = f.n[0] + ta * f.u[0] + tb * f.v[0];
  const y = f.n[1] + ta * f.u[1] + tb * f.v[1];
  const z = f.n[2] + ta * f.u[2] + tb * f.v[2];
  const l = 1 / Math.sqrt(x * x + y * y + z * z);
  out[0] = x * l; out[1] = y * l; out[2] = z * l;
  return out;
}

// Returns false when the direction is on the far side of the face's plane.
export function dirToFace(face, x, y, z, out) {
  const f = FACES[face];
  const dn = x * f.n[0] + y * f.n[1] + z * f.n[2];
  if (dn <= 1e-6) return false;
  out[0] = Math.atan((x * f.u[0] + y * f.u[1] + z * f.u[2]) / dn) / Q;
  out[1] = Math.atan((x * f.v[0] + y * f.v[1] + z * f.v[2]) / dn) / Q;
  return true;
}

export function nodeEdge(level, radius) { return (Math.PI / 2) * radius / (1 << level); }
