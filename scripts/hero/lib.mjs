// Shared by the character tools: the owner's GLB read by hand, welded; reduced meshes; a heap.
import fs from 'node:fs';
export function loadGLB(src) {
  const buf = fs.readFileSync(src), jl = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jl).toString()), B = buf.subarray(28 + jl);
  const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = (i) => {
    const a = J.accessors[i], bv = J.bufferViews[a.bufferView], sz = SZ[a.componentType], n = NC[a.type], off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || sz * n;
    const o = new Float64Array(a.count * n), dv = new DataView(B.buffer, B.byteOffset + off), ct = a.componentType, k0 = a.normalized ? NORM[ct] : 1;
    const get = ct === 5120 ? (p) => dv.getInt8(p) : ct === 5121 ? (p) => dv.getUint8(p) : ct === 5122 ? (p) => dv.getInt16(p, true) : ct === 5123 ? (p) => dv.getUint16(p, true) : ct === 5125 ? (p) => dv.getUint32(p, true) : (p) => dv.getFloat32(p, true);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) o[k * n + c] = get(k * stride + c * sz) / k0;
    return o;
  };
  const node = J.nodes[0], sc = node.scale || [1, 1, 1], tr = node.translation || [0, 0, 0];
  const P = [], N = [], I = []; let base = 0;
  for (const p of J.meshes[0].primitives) {
    const pos = acc(p.attributes.POSITION), nrm = acc(p.attributes.NORMAL), idx = acc(p.indices);
    for (let k = 0; k < pos.length; k += 3) { P.push(pos[k] * sc[0] + tr[0], pos[k + 1] * sc[1] + tr[1], pos[k + 2] * sc[2] + tr[2]); N.push(nrm[k] / sc[0], nrm[k + 1] / sc[1], nrm[k + 2] / sc[2]); }
    for (let k = 0; k < idx.length; k++) I.push(idx[k] + base);
    base += pos.length / 3;
  }
  // weld: one vertex a place (the file is cut into pieces of 65 534 vertices)
  const key = new Map(), remap = new Uint32Array(P.length / 3), WP = [], WN = [];
  for (let v = 0; v < remap.length; v++) {
    const k = `${Math.round(P[v * 3] * 2e5)},${Math.round(P[v * 3 + 1] * 2e5)},${Math.round(P[v * 3 + 2] * 2e5)}`; let w = key.get(k);
    if (w === undefined) { w = WP.length / 3; key.set(k, w); WP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); WN.push(0, 0, 0); }
    WN[w * 3] += N[v * 3]; WN[w * 3 + 1] += N[v * 3 + 1]; WN[w * 3 + 2] += N[v * 3 + 2]; remap[v] = w;
  }
  const n = new Float32Array(WN); for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
  const idx = new Uint32Array(I.length); for (let k = 0; k < I.length; k++) idx[k] = remap[I[k]];
  return { P: new Float32Array(WP), N: n, I: idx };
}
export function saveMesh(file, P, N, I) { fs.writeFileSync(file, Buffer.concat([Buffer.from(new Uint32Array([P.length / 3, I.length]).buffer), Buffer.from(P.buffer, P.byteOffset, P.byteLength), Buffer.from(N.buffer, N.byteOffset, N.byteLength), Buffer.from(I.buffer, I.byteOffset, I.byteLength)])); }
export function loadMesh(file) {
  const buf = fs.readFileSync(file), nv = buf.readUInt32LE(0), ni = buf.readUInt32LE(4), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  return { P: new Float32Array(ab, 8, nv * 3), N: new Float32Array(ab, 8 + nv * 12, nv * 3), I: new Uint32Array(ab, 8 + nv * 24, ni) };
}
// neighbours as a compressed list: [start (nv + 1), items]
export function adjacency(nv, I) {
  const deg = new Uint32Array(nv + 1);
  for (let t = 0; t < I.length; t += 3) { deg[I[t]] += 2; deg[I[t + 1]] += 2; deg[I[t + 2]] += 2; }
  const start = new Uint32Array(nv + 1); for (let v = 0; v < nv; v++) start[v + 1] = start[v] + deg[v];
  const fill = start.slice(0, nv), items = new Uint32Array(start[nv]);
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; items[fill[a]++] = b; items[fill[a]++] = c; items[fill[b]++] = a; items[fill[b]++] = c; items[fill[c]++] = a; items[fill[c]++] = b; }
  return { start, items };
}
export class Heap {
  constructor(n) { this.k = new Float64Array(n); this.v = new Uint32Array(n); this.n = 0; }
  push(key, val) { let i = this.n++; if (i >= this.k.length) { const k = new Float64Array(i * 2), v = new Uint32Array(i * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; } while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; } this.k[i] = key; this.v[i] = val; }
  pop() { const top = this.v[0], tk = this.k[0], key = this.k[--this.n], val = this.v[this.n]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= key) break; this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c; } this.k[i] = key; this.v[i] = val; this.key = tk; return top; }
}
