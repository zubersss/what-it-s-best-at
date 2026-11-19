// What each linked shader program uses, against the smallest limits WebGL 2 allows a device
// (the OpenGL ES 3.0 minimums), which is what phones have. The test browser allows far more
// (32 textures per shader, 4096 uniform vectors), so a shader over a phone's limit works in
// every headless test and draws nothing on the phone: the ground vanished that way once,
// when its shader read 17 textures.
export const PHONE = { fragTextures: 16, vertTextures: 16, textures: 32, fragVectors: 224, vertVectors: 256, varyings: 15 };

// Runs in the page; returns one row per program three has linked so far.
export async function shaderUse(page) {
  return page.evaluate(() => {
    const r = window.__app.renderer, gl = r.getContext();
    const rows = { [gl.FLOAT_MAT4]: 4, [gl.FLOAT_MAT3]: 3, [gl.FLOAT_MAT2]: 2 };
    const samplers = new Set([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_CUBE_SHADOW, gl.SAMPLER_2D_ARRAY_SHADOW, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D]);
    const used = (src, name) => (src.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length > 1;     // declared and read
    return r.info.programs.map((p) => {
      const prog = p.program, vs = gl.getShaderSource(p.vertexShader), fs = gl.getShaderSource(p.fragmentShader);
      const o = { id: p.id, fragTextures: 0, vertTextures: 0, fragVectors: 0, vertVectors: 0, textureNames: [] };
      for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const u = gl.getActiveUniform(prog, i), name = u.name.split('[')[0].split('.')[0];
        const inV = used(vs, name), inF = used(fs, name);
        if (samplers.has(u.type)) { if (inV) o.vertTextures++; if (inF) { o.fragTextures++; o.textureNames.push(name); } continue; }
        const vec = (rows[u.type] || 1) * u.size;           // unpacked: the worst case a driver may count
        if (inV) o.vertVectors += vec; if (inF) o.fragVectors += vec;
      }
      o.textures = o.fragTextures + o.vertTextures;
      o.varyings = (vs.match(/^\s*(flat\s+|smooth\s+)?out\s+\w+\s+\w+/gm) || []).length;
      o.linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
      return o;
    });
  });
}

// Lines describing every limit a program is over (empty when all fit).
export function overPhone(list) {
  const out = [];
  for (const p of list) for (const k of Object.keys(PHONE)) {
    if (p[k] > PHONE[k]) out.push(`program ${p.id} (${p.textureNames.slice(-6).join(' ')}): ${k} ${p[k]} > ${PHONE[k]}`);
  }
  return out;
}
