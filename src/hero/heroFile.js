// The character's file (public/data/hero.bin, written by scripts/make-hero.mjs) read into
// arrays: 'HERO', the length of a JSON header, the header, then the arrays it lists. Plain
// JavaScript: the game reads it, and so do the tools in Node.
const TYPES = { f32: Float32Array, u8: Uint8Array, u16: Uint16Array, u32: Uint32Array, i8: Int8Array };

// buffer: an ArrayBuffer. Returns { fit, labels, shared: { rest, carried, near, nearW, partsRest }, lods: [{ vertices, triangles, ...arrays }] }.
export function parseHero(buffer) {
  const dv = new DataView(buffer);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'HERO') throw new Error('not a character file');
  const n = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, n))), base = 8 + n;
  for (const [name, d] of Object.entries(head.shared || {})) head.shared[name] = new TYPES[d.type](buffer, base + d.at, d.count);
  for (const L of head.lods) {
    for (const [name, d] of Object.entries(L.arrays)) { const T = TYPES[d.type]; L[name] = new T(buffer, base + d.at, d.count); }
    delete L.arrays;
  }
  return head;
}
