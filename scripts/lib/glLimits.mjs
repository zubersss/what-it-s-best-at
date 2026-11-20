// What each linked shader program uses, against the smallest limits WebGL 2 allows a device
// (the OpenGL ES 3.0 minimums), which is what phones have. The test browser allows far more
// (32 textures per shader, 4096 uniform vectors), so a shader over a phone's limit works in
// every headless test and draws nothing on the phone: the ground vanished that way once,
// when its shader read 17 textures.
export const PHONE = { fragTextures: 16, vertTextures: 16, textures: 32, fragVectors: 224, vertVectors: 256, varyings: 15 };

// Varying vectors a vertex shader hands to its fragment shader, counted the way a strict
// driver may: every output the fragment shader names, one row per float or vector, 2-4 for
// a matrix, times the array size. Several declarations on one line, comma lists and
// three's own `varying` spelling all count (a count of one per line once read 5 as 1).
// Pure text, so it can be checked without a browser: node scripts/lib/glLimits.mjs
export function countVaryings(vs, fs = null) {
  const code = vs.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
  const defs = {};
  for (const m of code.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(\d+)[ \t]*$/gm)) defs[m[1]] = +m[2];
  const body = code.replace(/^[ \t]*#.*$/gm, ' ');
  const ROWS = { mat2: 2, mat3: 3, mat4: 4, mat2x2: 2, mat2x3: 2, mat2x4: 2, mat3x2: 3, mat3x3: 3, mat3x4: 3, mat4x2: 4, mat4x3: 4, mat4x4: 4 };
  let n = 0;
  for (const m of body.matchAll(/\b(?:out|varying)\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([^;{}()]+);/g)) {
    for (const d of m[2].split(',')) {
      const v = d.trim().match(/^(\w+)\s*(?:\[\s*(\w+)\s*\])?$/);
      if (!v) continue;
      if (fs != null && !new RegExp('\\b' + v[1] + '\\b').test(fs)) continue;      // never read: not active, costs nothing
      const size = v[2] == null ? 1 : /^\d+$/.test(v[2]) ? +v[2] : (defs[v[2]] || 1);
      n += (ROWS[m[1]] || 1) * size;
    }
  }
  return n;
}

// Runs in the page; returns one row per program three has linked so far.
export async function shaderUse(page) {
  const list = await page.evaluate(() => {
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
        // (an array of samplers takes one texture unit per element)
        if (samplers.has(u.type)) { if (inV) o.vertTextures += u.size; if (inF) { o.fragTextures += u.size; o.textureNames.push(u.size > 1 ? `${name}[${u.size}]` : name); } continue; }
        const vec = (rows[u.type] || 1) * u.size;           // unpacked: the worst case a driver may count
        if (inV) o.vertVectors += vec; if (inF) o.fragVectors += vec;
      }
      o.textures = o.fragTextures + o.vertTextures;
      o.vs = vs; o.fs = fs;                                // (varyings are counted outside the page, see countVaryings)
      o.linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
      return o;
    });
  });
  for (const o of list) { o.varyings = countVaryings(o.vs, o.fs); delete o.vs; delete o.fs; }
  return list;
}

// Lines describing every limit a program is over (empty when all fit).
export function overPhone(list) {
  const out = [];
  for (const p of list) for (const k of Object.keys(PHONE)) {
    if (p[k] > PHONE[k]) out.push(`program ${p.id} (${p.textureNames.slice(-6).join(' ')}): ${k} ${p[k]} > ${PHONE[k]}`);
  }
  return out;
}

// Self-check of the text counting (no browser): node scripts/lib/glLimits.mjs
if (process.argv[1] && process.argv[1].endsWith('glLimits.mjs')) {
  const cases = [
    ['out vec3 a; out vec3 b;', null, 2],                                  // two on one line
    ['  flat out int a; smooth out vec2 b; centroid out highp vec4 c;\nout mat3 m; out mat4 n;', null, 10],
    ['#define N 3\nout vec4 a[4]; out vec2 b[N];\nvarying vec3 c, d;', null, 9],
    ['#define varying out\n#define attribute in\nprecision highp float;\nvarying vec3 vN; // out vec3 no;\n/* out vec3 no2; */ out float f;', null, 2],
    ['out vec3 used; out vec3 unused; void main() { vec3 outv = vec3(0.0); used = outv; }', 'in vec3 used; void main() {}', 1],
    ['layout(location = 0) in vec3 position; void main() { gl_Position = vec4(position, 1.0); }', null, 0],
  ];
  let bad = 0;
  for (const [vs, fs, want] of cases) { const got = countVaryings(vs, fs); if (got !== want) { bad++; console.log(`FAIL expected ${want}, counted ${got}: ${JSON.stringify(vs)}`); } }
  console.log(bad ? `${bad} of ${cases.length} varying counts wrong` : `varying counting ok (${cases.length} cases)`);
  process.exit(bad ? 1 : 0);
}
