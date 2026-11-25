// Runs a small part of GLSL ES 3.00 in Node: enough for the functions the game writes as GLSL
// text from its own JS constants (src/weather/sky/steer.js), so that a test can call the very
// text a shader compiles, with the very uniforms the page hands it (flat arrays, matrices
// column by column as WebGL takes them), and compare it with the JS. Every float is rounded
// to 32 bits after each operation, as a phone's highp does (off: { f32: false }).
//   const g = runGlsl(source, uniforms); g.fn.steerLow([x, y, z])
// What it takes: #define (names only), uniform (arrays too), const, functions with in-
// parameters, local declarations, = and op=, ++ and --, if/else, for (with break and
// continue), return, the usual operators, ?:, swizzles, vecN/matN constructors and the common
// built-ins. Anything else is an error, and so is a word GLSL ES 3 reserves used as a name (a
// variable `patch` once broke the ground shader).
// Vectors are arrays of numbers; a matrix is { n, v } (v column by column).
// Samplers (sampler2D, sampler3D, as uniforms or parameters) are objects with
// sample(coords, lod) -> [r, g, b, a]: texture() and textureLod() call it (glslSamplers.mjs makes
// ones that filter bytes as a GPU does). An int divided by an int is not truncated here.

export const GLSL_RESERVED = new Set(['attribute', 'varying', 'coherent', 'volatile', 'restrict', 'readonly', 'writeonly', 'resource',
  'atomic_uint', 'noperspective', 'patch', 'sample', 'subroutine', 'common', 'partition', 'active', 'asm', 'class', 'union', 'enum',
  'typedef', 'template', 'this', 'goto', 'inline', 'noinline', 'public', 'static', 'extern', 'external', 'interface', 'long', 'short',
  'double', 'half', 'fixed', 'unsigned', 'superp', 'input', 'output', 'hvec2', 'hvec3', 'hvec4', 'dvec2', 'dvec3', 'dvec4', 'fvec2',
  'fvec3', 'fvec4', 'sampler3DRect', 'filter', 'image1D', 'image2D', 'image3D', 'imageCube', 'sizeof', 'cast', 'namespace', 'using']);
const TYPES = new Set(['void', 'float', 'int', 'uint', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'mat2', 'mat3', 'mat4', 'sampler2D', 'sampler3D']);
const SAMPLERS = new Set(['sampler2D', 'sampler3D']);
const KEYWORDS = new Set(['uniform', 'const', 'return', 'if', 'else', 'for', 'break', 'continue', 'precision', 'highp', 'mediump', 'lowp', 'in', 'out', 'inout', 'true', 'false']);
const SIZE = { float: 1, int: 1, uint: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, ivec2: 2, ivec3: 3, ivec4: 4, mat2: 4, mat3: 9, mat4: 16 };
const TOKEN = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+|\d+)[uUfF]?|([A-Za-z_]\w*)|(&&|\|\||==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|[-+*/%<>=!?:;,.(){}[\]])/y;

function tokenize(text) {
  const out = []; TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(text);
    if (!m || m.index !== at) throw new Error(`glsl: cannot read "${text.slice(at, at + 20)}"`);
    if (m[1] !== undefined) out.push({ k: 'num', v: m[1], int: !/[.eE]/.test(m[1]) });
    else if (m[2] !== undefined) out.push({ k: 'id', v: m[2] });
    else if (m[3] !== undefined) out.push({ k: 'p', v: m[3] });
  }
  return out;
}

// (#ifdef, #ifndef, #else and #endif too: the shared texts are guarded so that a shader may take
// two of them, src/sky/skyGlsl.js)
function preprocess(source) {
  const defines = new Map(), body = [], live = [];
  const on = () => live.every(Boolean);
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('#')) { body.push(on() ? line : ''); continue; }
    const m = /^#\s*(\w+)\s*(.*)$/.exec(t);
    if (m && (m[1] === 'ifdef' || m[1] === 'ifndef')) {
      const nm = m[2].replace(/\/\/.*$/, '').trim();
      if (!/^[A-Za-z_]\w*$/.test(nm)) throw new Error(`glsl: #${m[1]} needs one name: ${t}`);
      live.push(m[1] === 'ifdef' ? defines.has(nm) : !defines.has(nm)); body.push(''); continue;
    }
    if (m && m[1] === 'else') { if (!live.length) throw new Error('glsl: #else without #if'); live.push(!live.pop()); body.push(''); continue; }
    if (m && m[1] === 'endif') { if (!live.length) throw new Error('glsl: #endif without #if'); live.pop(); body.push(''); continue; }
    if (!on()) { body.push(''); continue; }
    if (m && m[1] === 'define') {
      const d = /^([A-Za-z_]\w*)(\s+(.*))?$/.exec(m[2]);
      if (!d || m[2].includes('(') && /^[A-Za-z_]\w*\(/.test(m[2])) throw new Error(`glsl: only #define NAME value is understood: ${t}`);
      defines.set(d[1], tokenize((d[3] || '').replace(/\/\/.*$/, '')));
    } else if (!m || !['version', 'extension'].includes(m[1])) throw new Error(`glsl: the directive ${t} is not understood here`);
    body.push('');
  }
  if (live.length) throw new Error('glsl: an #ifdef or #ifndef is never closed');
  const expand = (tokens, depth = 0) => tokens.flatMap((tk) => tk.k === 'id' && defines.has(tk.v) ? (depth > 20 ? [] : expand(defines.get(tk.v), depth + 1)) : [tk]);
  return { defines, tokens: expand(tokenize(body.join('\n'))) };
}

function parse(tokens) {
  let i = 0;
  const peek = (o = 0) => tokens[i + o], eof = () => i >= tokens.length;
  const is = (v, o = 0) => peek(o) && peek(o).k !== 'num' && peek(o).v === v;
  const fail = (what) => { throw new Error(`glsl: ${what} at "${tokens.slice(i, i + 8).map((t) => t.v).join(' ')}"`); };
  const expect = (v) => { if (!is(v)) fail(`expected ${v}`); i++; };
  const accept = (v) => { if (is(v)) { i++; return true; } return false; };
  const name = () => {
    const t = peek(); if (!t || t.k !== 'id' || TYPES.has(t.v) || KEYWORDS.has(t.v)) fail('expected a name');
    if (GLSL_RESERVED.has(t.v)) fail(`"${t.v}" is reserved in GLSL ES 3`);
    i++; return t.v;
  };
  const type = () => { while (['highp', 'mediump', 'lowp'].includes(peek()?.v)) i++; const t = peek(); if (!t || !TYPES.has(t.v)) fail('expected a type'); i++; return t.v; };
  const isType = () => peek() && (TYPES.has(peek().v) || ['highp', 'mediump', 'lowp'].includes(peek().v));
  // expressions, by precedence
  const BIN = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
  const expr = () => { const c = binary(0); if (accept('?')) { const a = expr(); expect(':'); const b = expr(); return { n: 'tern', c, a, b }; } return c; };
  const binary = (lv) => {
    if (lv === BIN.length) return unary();
    let a = binary(lv + 1);
    while (peek() && peek().k === 'p' && BIN[lv].includes(peek().v)) { const op = tokens[i++].v; a = { n: 'bin', op, a, b: binary(lv + 1) }; }
    return a;
  };
  const unary = () => { if (is('-') || is('+') || is('!')) { const op = tokens[i++].v; return { n: 'un', op, a: unary() }; } return postfix(primary()); };
  const primary = () => {
    const t = peek(); if (!t) fail('expected a value');
    if (t.k === 'num') { i++; return { n: 'num', v: Number(t.v), int: t.int }; }
    if (accept('(')) { const e = expr(); expect(')'); return e; }
    if (t.v === 'true' || t.v === 'false') { i++; return { n: 'bool', v: t.v === 'true' }; }
    if (t.k === 'id' && (TYPES.has(t.v) || is('(', 1))) {
      i++; expect('('); const args = [];
      if (!accept(')')) { do args.push(expr()); while (accept(',')); expect(')'); }
      return { n: 'call', f: t.v, args };
    }
    return { n: 'id', v: name() };
  };
  const postfix = (a) => {
    for (;;) {
      if (accept('[')) { const e = expr(); expect(']'); a = { n: 'idx', a, i: e }; } else if (accept('.')) { const t = peek(); if (!t || t.k !== 'id') fail('expected a field'); i++; a = { n: 'mem', a, f: t.v }; } else return a;
    }
  };
  const decl = (constant) => {
    const ty = type(), items = [];
    do { const nm = name(); items.push({ name: nm, type: ty, init: accept('=') ? expr() : null }); } while (accept(','));
    expect(';'); return { n: 'decl', items, constant };
  };
  const stmt = () => {
    if (accept('{')) { const body = []; while (!accept('}')) body.push(stmt()); return { n: 'block', body }; }
    if (accept('return')) { if (accept(';')) return { n: 'ret', e: null }; const e = expr(); expect(';'); return { n: 'ret', e }; }
    if (accept('if')) { expect('('); const c = expr(); expect(')'); const a = stmt(); return { n: 'if', c, a, b: accept('else') ? stmt() : null }; }
    if (accept('for')) {
      expect('(');
      const init = accept(';') ? null : isType() ? decl(false) : simple(';');
      const c = is(';') ? { n: 'bool', v: true } : expr(); expect(';');
      const step = is(')') ? null : simple(')');
      return { n: 'for', init, c, step, body: stmt() };
    }
    if (accept('break')) { expect(';'); return { n: 'break' }; }
    if (accept('continue')) { expect(';'); return { n: 'continue' }; }
    if (accept('const')) return decl(true);
    if (isType()) return decl(false);
    return simple(';');
  };
  // an assignment, ++ / -- or an expression, ended by `end` (';', or ')' after a for's step)
  const simple = (end) => {
    if (is('++') || is('--')) { const op = tokens[i++].v; const nm = name(); expect(end); return { n: 'set', name: nm, op: op === '++' ? '+=' : '-=', e: { n: 'num', v: 1, int: true } }; }
    const lhs = expr();
    if (is('++') || is('--')) { const op = tokens[i++].v; if (lhs.n !== 'id') fail('only a name can be stepped here'); expect(end); return { n: 'set', name: lhs.v, op: op === '++' ? '+=' : '-=', e: { n: 'num', v: 1, int: true } }; }
    for (const op of ['=', '+=', '-=', '*=', '/=']) if (accept(op)) { if (lhs.n !== 'id') fail('only a name can be assigned to here'); const e = expr(); expect(end); return { n: 'set', name: lhs.v, op, e }; }
    expect(end); return { n: 'expr', e: lhs };
  };
  const prog = { uniforms: [], consts: [], fns: [] };
  while (!eof()) {
    if (accept('precision')) { while (!accept(';')) i++; continue; }
    if (accept('uniform')) {
      const ty = type();
      do {
        const nm = name(); let size = 0;
        if (accept('[')) { const t = peek(); if (!t || t.k !== 'num' || !t.int) fail('an array size must be a whole number'); size = Number(t.v); i++; expect(']'); }
        prog.uniforms.push({ type: ty, name: nm, size });
      } while (accept(','));
      expect(';'); continue;
    }
    if (accept('const')) { prog.consts.push(decl(true)); continue; }
    if (!isType()) fail('expected a declaration');
    const ret = type(), nm = name();
    if (!accept('(')) fail('only uniforms, constants and functions are understood at the top');
    const params = [];
    if (!accept(')')) {
      if (is('void') && is(')', 1)) { i += 2; } else {
        do { if (is('out') || is('inout')) fail('out parameters are not understood'); accept('in'); params.push({ type: type(), name: name() }); } while (accept(','));
        expect(')');
      }
    }
    if (accept(';')) continue;
    expect('{'); const body = []; while (!accept('}')) body.push(stmt());
    prog.fns.push({ ret, name: nm, params, body });
  }
  // (as a GLSL compiler: a uniform, a constant or a function with the same parameters given
  // twice is an error; two shared texts pasted into one shader without their guards do this)
  const seen = new Map();
  const once = (key, what) => { if (seen.has(key)) throw new Error(`glsl: ${what} is defined twice`); seen.set(key, true); };
  for (const u of prog.uniforms) once(`v ${u.name}`, `the uniform ${u.name}`);
  for (const c of prog.consts) for (const it of c.items) once(`v ${it.name}`, `the constant ${it.name}`);
  for (const fn of prog.fns) once(`f ${fn.name}(${fn.params.map((p) => p.type).join(',')})`, `the function ${fn.name}(${fn.params.map((p) => p.type).join(', ')})`);
  return prog;
}

// --- the values: numbers, vectors (arrays) and matrices ---
class Mat { constructor(n, v) { this.n = n; this.v = v; } }
class Arr { constructor(items) { this.items = items; } }
const SW = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3, s: 0, t: 1, p: 2, q: 3 };

function runtime(f) {
  const map = (a, fn) => Array.isArray(a) ? a.map((x) => f(fn(x))) : f(fn(a));
  const zip = (fn) => (...args) => {
    const n = Math.max(...args.map((a) => Array.isArray(a) ? a.length : 1));
    const at = (a, k) => Array.isArray(a) ? a[k] : a;
    if (args.every((a) => !Array.isArray(a))) return f(fn(...args));
    return Array.from({ length: n }, (_, k) => f(fn(...args.map((a) => at(a, k)))));
  };
  const arith = (fn) => (a, b) => {
    if (a instanceof Mat || b instanceof Mat) {
      if (a instanceof Mat && b instanceof Mat) return new Mat(a.n, a.v.map((x, k) => f(fn(x, b.v[k]))));
      const m = a instanceof Mat ? a : b, s = a instanceof Mat ? b : a;
      if (typeof s !== 'number') throw new Error('glsl: a matrix and a vector are only multiplied');
      return new Mat(m.n, m.v.map((x) => f(a instanceof Mat ? fn(x, s) : fn(s, x))));
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) throw new Error(`glsl: vectors of ${a.length} and ${b.length}`);
    return zip(fn)(a, b);
  };
  const dotF = (a, b) => a.reduce((s, x, k) => f(s + f(x * b[k])), 0);
  const R = {
    f, Mat, Arr,
    add: arith((a, b) => a + b), sub: arith((a, b) => a - b), div: arith((a, b) => a / b),
    mul(a, b) {
      if (a instanceof Mat && Array.isArray(b)) { const n = a.n; return Array.from({ length: n }, (_, r) => { let s = 0; for (let c = 0; c < n; c++) s = f(s + f(a.v[c * n + r] * b[c])); return s; }); }
      if (Array.isArray(a) && b instanceof Mat) { const n = b.n; return Array.from({ length: n }, (_, c) => { let s = 0; for (let r = 0; r < n; r++) s = f(s + f(a[r] * b.v[c * n + r])); return s; }); }
      if (a instanceof Mat && b instanceof Mat) { const n = a.n, v = new Array(n * n); for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) { let s = 0; for (let k = 0; k < n; k++) s = f(s + f(a.v[k * n + r] * b.v[c * n + k])); v[c * n + r] = s; } return new Mat(n, v); }
      return arith((x, y) => x * y)(a, b);
    },
    neg: (a) => a instanceof Mat ? new Mat(a.n, a.v.map((x) => -x)) : map(a, (x) => -x),
    cmp(op, a, b) {
      if (typeof a !== 'number' || typeof b !== 'number') { if (op === '==' || op === '!=') { const eq = JSON.stringify(a) === JSON.stringify(b); return op === '==' ? eq : !eq; } throw new Error('glsl: only numbers are compared'); }
      return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : op === '>=' ? a >= b : op === '==' ? a === b : a !== b;
    },
    b(x) { if (typeof x !== 'boolean') throw new Error('glsl: a condition must be a bool'); return x; },
    idx(a, k) {
      if (!Number.isInteger(k)) throw new Error('glsl: an index must be a whole number');
      if (a instanceof Arr) { if (k < 0 || k >= a.items.length) throw new Error(`glsl: index ${k} outside an array of ${a.items.length}`); return a.items[k]; }
      if (a instanceof Mat) return a.v.slice(k * a.n, k * a.n + a.n);
      if (Array.isArray(a)) { if (k < 0 || k >= a.length) throw new Error(`glsl: component ${k} of a vec${a.length}`); return a[k]; }
      throw new Error('glsl: this value has no index');
    },
    swz(a, s) {
      if (!Array.isArray(a)) throw new Error(`glsl: .${s} of a value that is not a vector`);
      const r = [...s].map((c) => { const k = SW[c]; if (k === undefined || k >= a.length) throw new Error(`glsl: .${s} of a vec${a.length}`); return a[k]; });
      return r.length === 1 ? r[0] : r;
    },
    ctor(ty, args) {
      const flat = args.flatMap((a) => a instanceof Mat ? a.v : Array.isArray(a) ? a : [typeof a === 'boolean' ? +a : a]);
      if (ty === 'float') return f(flat[0]);
      if (ty === 'int' || ty === 'uint') return Math.trunc(flat[0]);
      if (ty === 'bool') return !!flat[0];
      const n = SIZE[ty];
      if (ty.startsWith('mat')) {
        const d = Math.round(Math.sqrt(n));
        if (flat.length === 1) return new Mat(d, Array.from({ length: n }, (_, k) => (k % (d + 1) === 0 ? f(flat[0]) : 0)));
        if (flat.length !== n) throw new Error(`glsl: ${ty} from ${flat.length} numbers`);
        return new Mat(d, flat.map(f));
      }
      if (flat.length === 1) return Array(n).fill(f(flat[0]));
      if (flat.length < n) throw new Error(`glsl: ${ty} from ${flat.length} numbers`);
      return flat.slice(0, n).map((x) => (ty[0] === 'i' ? Math.trunc(x) : f(x)));
    },
    // built-ins
    length: (a) => Array.isArray(a) ? f(Math.sqrt(dotF(a, a))) : Math.abs(a),
    normalize: (a) => { const l = f(Math.sqrt(dotF(a, a))); return a.map((x) => f(x / l)); },
    dot: (a, b) => Array.isArray(a) ? dotF(a, b) : f(a * b),
    cross: (a, b) => [f(f(a[1] * b[2]) - f(a[2] * b[1])), f(f(a[2] * b[0]) - f(a[0] * b[2])), f(f(a[0] * b[1]) - f(a[1] * b[0]))],
    distance: (a, b) => R.length(R.sub(a, b)),
    abs: (a) => map(a, Math.abs), sign: (a) => map(a, Math.sign), floor: (a) => map(a, Math.floor), ceil: (a) => map(a, Math.ceil),
    fract: (a) => map(a, (x) => x - Math.floor(x)), sqrt: (a) => map(a, Math.sqrt), inversesqrt: (a) => map(a, (x) => 1 / Math.sqrt(x)),
    exp: (a) => map(a, Math.exp), exp2: (a) => map(a, (x) => 2 ** x), log: (a) => map(a, Math.log), log2: (a) => map(a, Math.log2),
    sin: (a) => map(a, Math.sin), cos: (a) => map(a, Math.cos), tan: (a) => map(a, Math.tan), asin: (a) => map(a, Math.asin), acos: (a) => map(a, Math.acos),
    radians: (a) => map(a, (x) => x * Math.PI / 180), degrees: (a) => map(a, (x) => x * 180 / Math.PI),
    atan: (a, b) => b === undefined ? map(a, Math.atan) : zip(Math.atan2)(a, b),
    pow: zip(Math.pow), mod: zip((x, y) => x - y * Math.floor(x / y)), min: zip(Math.min), max: zip(Math.max),
    clamp: zip((x, lo, hi) => Math.min(Math.max(x, lo), hi)), mix: zip((x, y, t) => x * (1 - t) + y * t),
    step: zip((e, x) => (x < e ? 0 : 1)), smoothstep: zip((a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }),
    texture: (s, c) => R.textureLod(s, c, 0),
    textureLod: (s, c, lod) => {
      if (!s || typeof s.sample !== 'function') throw new Error('glsl: texture() of something that is not a sampler');
      return Array.from(s.sample(c.map(f), lod), f);
    },
  };
  return R;
}
const BUILTINS = ['length', 'normalize', 'dot', 'cross', 'distance', 'abs', 'sign', 'floor', 'ceil', 'fract', 'sqrt', 'inversesqrt', 'exp', 'exp2', 'log', 'log2',
  'sin', 'cos', 'tan', 'asin', 'acos', 'radians', 'degrees', 'atan', 'pow', 'mod', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'texture', 'textureLod'];

function emit(prog, f) {
  const out = ['"use strict"; const F = {}, C = {};'];
  const globals = new Map();     // name -> 'C' | 'U'
  for (const u of prog.uniforms) globals.set(u.name, 'U');
  const fnNames = new Set(prog.fns.map((x) => x.name));
  let scope;
  const ref = (nm) => {
    for (let s = scope.length - 1; s >= 0; s--) if (scope[s].has(nm)) return `v_${nm}`;
    if (globals.has(nm)) return `${globals.get(nm)}.${nm}`;
    throw new Error(`glsl: "${nm}" is not declared`);
  };
  const lit = (v, int) => (int ? String(v) : String(f(v)));
  const ex = (e) => {
    switch (e.n) {
      case 'num': return lit(e.v, e.int);
      case 'bool': return String(e.v);
      case 'id': return ref(e.v);
      case 'tern': return `(R.b(${ex(e.c)}) ? ${ex(e.a)} : ${ex(e.b)})`;
      case 'un': return e.op === '-' ? `R.neg(${ex(e.a)})` : e.op === '!' ? `(!R.b(${ex(e.a)}))` : ex(e.a);
      case 'bin': {
        const a = ex(e.a), b = ex(e.b);
        if (e.op === '&&' || e.op === '||') return `(R.b(${a}) ${e.op} R.b(${b}))`;
        if (['<', '>', '<=', '>=', '==', '!='].includes(e.op)) return `R.cmp('${e.op}', ${a}, ${b})`;
        if (e.op === '%') throw new Error('glsl: % is not understood here');
        return `R.${{ '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' }[e.op]}(${a}, ${b})`;
      }
      case 'idx': return `R.idx(${ex(e.a)}, ${ex(e.i)})`;
      case 'mem': return `R.swz(${ex(e.a)}, '${e.f}')`;
      case 'call': {
        const args = e.args.map(ex).join(', ');
        if (TYPES.has(e.f)) return `R.ctor('${e.f}', [${args}])`;
        if (fnNames.has(e.f)) return `F.${e.f}(${args})`;
        if (BUILTINS.includes(e.f)) return `R.${e.f}(${args})`;
        throw new Error(`glsl: no function ${e.f}`);
      }
    }
    throw new Error(`glsl: cannot run ${e.n}`);
  };
  const st = (s, lines, ind) => {
    switch (s.n) {
      case 'block': scope.push(new Set()); lines.push(`${ind}{`); for (const x of s.body) st(x, lines, ind + '  '); lines.push(`${ind}}`); scope.pop(); return;
      case 'ret': lines.push(`${ind}return ${s.e ? ex(s.e) : ''};`); return;
      case 'if': lines.push(`${ind}if (R.b(${ex(s.c)}))`); st({ n: 'block', body: [s.a] }, lines, ind); if (s.b) { lines.push(`${ind}else`); st({ n: 'block', body: [s.b] }, lines, ind); } return;
      case 'decl': for (const it of s.items) { const init = it.init ? ex(it.init) : `R.ctor('${it.type}', [0])`; scope[scope.length - 1].add(it.name); lines.push(`${ind}let v_${it.name} = ${init};`); } return;
      case 'set': { const r = ref(s.name); if (!r.startsWith('v_')) throw new Error(`glsl: ${s.name} cannot be assigned to`); const e = ex(s.e); lines.push(`${ind}${r} = ${s.op === '=' ? e : `R.${{ '+=': 'add', '-=': 'sub', '*=': 'mul', '/=': 'div' }[s.op]}(${r}, ${e})`};`); return; }
      case 'expr': lines.push(`${ind}${ex(s.e)};`); return;
      case 'break': lines.push(`${ind}break;`); return;
      case 'continue': lines.push(`${ind}continue;`); return;
      case 'for': {
        // (a scope of its own for the loop's variable; the step is run as the loop's last statement)
        scope.push(new Set()); lines.push(`${ind}{`);
        if (s.init) st(s.init, lines, ind + '  ');
        const step = []; if (s.step) st(s.step, step, '');
        lines.push(`${ind}  for (let __n = 0; R.b(${ex(s.c)}); ${step.map((l) => l.replace(/;$/, '')).join(', ') || ''}) {`);
        lines.push(`${ind}    if (++__n > 1e6) throw new Error('glsl: a loop ran a million times');`);
        st({ n: 'block', body: [s.body] }, lines, ind + '    ');
        lines.push(`${ind}  }`, `${ind}}`); scope.pop();
        return;
      }
    }
    throw new Error(`glsl: cannot run the statement ${s.n}`);
  };
  scope = [new Set()];
  for (const c of prog.consts) for (const it of c.items) { out.push(`C.${it.name} = ${ex(it.init)};`); globals.set(it.name, 'C'); }
  for (const fn of prog.fns) {
    scope = [new Set(fn.params.map((p) => p.name))];
    const lines = [`F.${fn.name} = function (${fn.params.map((p) => `v_${p.name}`).join(', ')}) {`];
    for (const s of fn.body) st(s, lines, '  ');
    lines.push('};'); out.push(lines.join('\n'));
  }
  out.push('return F;');
  return out.join('\n');
}

// a uniform's value as WebGL would take it from three (a flat array, or numbers, or { x, y, z, w })
function bindValue(u, value, f) {
  if (SAMPLERS.has(u.type)) {
    if (u.size) throw new Error(`glsl: arrays of samplers (${u.name}) are not understood here`);
    if (!value || typeof value.sample !== 'function') throw new Error(`glsl: the sampler ${u.name} was handed no sample(coords, lod)`);
    return value;
  }
  const comp = SIZE[u.type];
  const flat = (v) => {
    if (typeof v === 'number') return [v];
    if (v && v.elements) return Array.from(v.elements);
    if (v && v.x !== undefined) return [v.x, v.y, v.z, v.w].slice(0, comp);
    if (v && typeof v.length === 'number') return Array.from(v, (x) => (typeof x === 'number' ? x : flat(x))).flat();
    throw new Error(`glsl: no value for the uniform ${u.name}`);
  };
  const one = (vals) => {
    if (vals.length !== comp) throw new Error(`glsl: the uniform ${u.name} (${u.type}) was handed ${vals.length} numbers`);
    if (u.type.startsWith('mat')) return new Mat(Math.round(Math.sqrt(comp)), vals.map(f));
    return comp === 1 ? (u.type === 'bool' ? !!vals[0] : f(vals[0])) : vals.map(f);
  };
  const all = flat(value);
  if (!u.size) return one(all);
  if (all.length !== u.size * comp) throw new Error(`glsl: the uniform ${u.name}[${u.size}] (${u.type}) was handed ${all.length} numbers, not ${u.size * comp}`);
  return new Arr(Array.from({ length: u.size }, (_, k) => one(all.slice(k * comp, (k + 1) * comp))));
}

export function runGlsl(source, uniforms = {}, { f32 = true } = {}) {
  const f = f32 ? Math.fround : (x) => x;
  const { defines, tokens } = preprocess(source);
  const prog = parse(tokens);
  const js = emit(prog, f);
  const U = {};
  for (const u of prog.uniforms) U[u.name] = bindValue(u, uniforms[u.name], f);
  const R = runtime(f);
  const fn = new Function('R', 'U', js)(R, U);
  return { fn, uniforms: prog.uniforms, defines: [...defines.keys()], functions: prog.fns.map((x) => ({ name: x.name, ret: x.ret, params: x.params })), js };
}
