// float32 -> IEEE half conversion (table method, van der Zijp). Worker-safe.
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const base = new Uint16Array(512), shift = new Uint8Array(512);
for (let i = 0; i < 256; i++) {
  const e = i - 127;
  if (e < -27) { base[i] = 0x0000; base[i | 0x100] = 0x8000; shift[i] = 24; shift[i | 0x100] = 24; }
  else if (e < -14) { base[i] = 0x0400 >> (-e - 14); base[i | 0x100] = (0x0400 >> (-e - 14)) | 0x8000; shift[i] = -e - 1; shift[i | 0x100] = -e - 1; }
  else if (e <= 15) { base[i] = (e + 15) << 10; base[i | 0x100] = ((e + 15) << 10) | 0x8000; shift[i] = 13; shift[i | 0x100] = 13; }
  else if (e < 128) { base[i] = 0x7c00; base[i | 0x100] = 0xfc00; shift[i] = 24; shift[i | 0x100] = 24; }
  else { base[i] = 0x7c00; base[i | 0x100] = 0xfc00; shift[i] = 13; shift[i | 0x100] = 13; }
}
export function toHalf(v) {
  f32[0] = v;
  const f = u32[0], e = (f >> 23) & 0x1ff;
  return base[e] + ((f & 0x007fffff) >> shift[e]);
}
