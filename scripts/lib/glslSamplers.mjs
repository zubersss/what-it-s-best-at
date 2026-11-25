// Samplers for scripts/lib/glslRun.mjs: textures read in Node the way a GPU reads them with
// LINEAR filtering and no mipmaps (texel centres at (i + 0.5) / size, REPEAT or CLAMP_TO_EDGE
// per axis). Bytes in, numbers 0..1 out, four channels as GLSL gives them: a texture of one
// channel reads (r, 0, 0, 1), of two (r, g, 0, 1).
//   const s = sampler2D(bytes, width, height, 4, { wrapS: 'repeat', wrapT: 'clamp' });
//   runGlsl(src, { tWxA: s }) ... texture(tWxA, uv)
// (A GPU's filter weights are fixed-point, 8 bits on some: what is compared against these is
// the arithmetic of a shader, not a driver's rounding.)

const wrapIndex = (i, n, mode) => (mode === 'clamp' ? Math.min(n - 1, Math.max(0, i)) : ((i % n) + n) % n);

function finish(out, ch) {
  if (ch < 4) out[3] = 1;
  if (ch < 3) out[2] = 0;
  if (ch < 2) out[1] = 0;
  return out;
}

// bytes: width x height x ch, rows first (row 0 at v = 0, as uploaded unflipped)
export function sampler2D(bytes, width, height, ch, { wrapS = 'repeat', wrapT = 'clamp' } = {}) {
  if (bytes.length !== width * height * ch) throw new Error('sampler2D: the bytes are not width x height x channels');
  return {
    width, height, ch,
    sample(c) {
      const x = c[0] * width - 0.5, y = c[1] * height - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const i0 = wrapIndex(x0, width, wrapS), i1 = wrapIndex(x0 + 1, width, wrapS), j0 = wrapIndex(y0, height, wrapT), j1 = wrapIndex(y0 + 1, height, wrapT);
      const out = [0, 0, 0, 0];
      for (let k = 0; k < ch; k++) {
        const a = bytes[(j0 * width + i0) * ch + k], b = bytes[(j0 * width + i1) * ch + k], d = bytes[(j1 * width + i0) * ch + k], e = bytes[(j1 * width + i1) * ch + k];
        out[k] = ((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy) / 255;
      }
      return finish(out, ch);
    },
  };
}

// bytes: n x n x n x ch (x fastest, then y, then z), REPEAT on every axis: the clouds' noise
// (src/sky/cloudNoiseData.js, RG8)
export function sampler3D(bytes, n, ch) {
  if (bytes.length !== n * n * n * ch) throw new Error('sampler3D: the bytes are not n^3 x channels');
  return {
    n, ch,
    sample(c) {
      const x = c[0] * n - 0.5, y = c[1] * n - 0.5, z = c[2] * n - 0.5;
      const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
      const I0 = wrapIndex(x0, n), I1 = wrapIndex(x0 + 1, n), J0 = wrapIndex(y0, n), J1 = wrapIndex(y0 + 1, n), K0 = wrapIndex(z0, n), K1 = wrapIndex(z0 + 1, n);
      const out = [0, 0, 0, 0];
      for (let k = 0; k < ch; k++) {
        const g = (a, b, cc) => bytes[((cc * n + b) * n + a) * ch + k];
        const lx = (b, cc) => g(I0, b, cc) * (1 - fx) + g(I1, b, cc) * fx;
        const ly = (cc) => lx(J0, cc) * (1 - fy) + lx(J1, cc) * fy;
        out[k] = (ly(K0) * (1 - fz) + ly(K1) * fz) / 255;
      }
      return finish(out, ch);
    },
  };
}
