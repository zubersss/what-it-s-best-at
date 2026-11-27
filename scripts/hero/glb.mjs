// A GLB read whole, without a browser: its JSON, and any accessor as a typed array of real
// numbers (meshopt-compressed and quantised files too: glTF-Transform writes both). For the
// rigged character (scripts/make-hero-rig.mjs).
import fs from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer';

const COMP = { 5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767], 5123: [Uint16Array, 65535], 5125: [Uint32Array, 4294967295], 5126: [Float32Array, 1] };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export async function readGLB(file) {
  const b = fs.readFileSync(file), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error(`${file}: not a GLB`);
  const jl = dv.getUint32(12, true), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + dv.getUint32(20 + jl, true));
  await MeshoptDecoder.ready;
  const views = new Map();
  // the bytes of a buffer view (decoded if it is compressed)
  const view = (i) => {
    if (views.has(i)) return views.get(i);
    const v = json.bufferViews[i], ext = v.extensions?.EXT_meshopt_compression; let out;
    if (ext) {
      if ((ext.buffer ?? 0) !== 0) throw new Error('compressed data outside the file');
      out = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength), ext.mode, ext.filter);
    } else { if ((v.buffer ?? 0) !== 0) throw new Error('data outside the file'); out = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); }
    views.set(i, out); return out;
  };
  // an accessor as numbers: Float32Array of count x size, normalised ones scaled to -1..1 or
  // 0..1; { raw: true }: as stored (indices, joints)
  const accessor = (i, { raw = false } = {}) => {
    const a = json.accessors[i], [T, max] = COMP[a.componentType], n = SIZE[a.type], bytes = view(a.bufferView), stride = json.bufferViews[a.bufferView].extensions?.EXT_meshopt_compression?.byteStride || json.bufferViews[a.bufferView].byteStride || n * T.BYTES_PER_ELEMENT;
    const dvw = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = raw ? new T(a.count * n) : new Float32Array(a.count * n), get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const x = dvw[get]((a.byteOffset || 0) + k * stride + c * T.BYTES_PER_ELEMENT, true); out[k * n + c] = raw || !a.normalized ? x : Math.max(x / max, -1); }
    return out;
  };
  const image = (i) => { const im = json.images[i]; return { name: im.name, mime: im.mimeType, bytes: Buffer.from(view(im.bufferView)) }; };
  return { json, accessor, image };
}
