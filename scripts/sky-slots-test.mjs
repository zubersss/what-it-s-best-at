// The sky field's snapshots on the GPU (src/sky/skyField.js): the 'now' maps must be blended
// from the textures that hold the pair of snapshots round the clock, whatever arrived when.
// A snapshot once took its texture by its position in the list, numbered again at every
// arrival: the game drew f x the newer snapshot (an empty sky at the start of every two
// minutes) and nothing headless or in Node saw it, since Node blends the bytes themselves.
// Here the field runs with a renderer that only keeps count: which snapshot's bytes each
// texture was last written with, and which textures each blend read.
//   node scripts/sky-slots-test.mjs [--break reslot]
// --break reslot numbers the slots again at every arrival, as it was: the check must fail.
let wall = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => wall }, configurable: true });
const { SkyField, SLOTS } = await import('../src/sky/skyField.js');
const { default: haven } = await import('../src/worlds/haven.js');

const BREAK = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// a renderer that keeps count
function fakeRenderer(log) {
  let bound = null;
  const gl = {
    TEXTURE_2D: 1, RGBA8: 2, RG8: 3, RGBA: 4, RG: 5, UNSIGNED_BYTE: 6, NEAREST: 7, REPEAT: 8, CLAMP_TO_EDGE: 9,
    TEXTURE_MIN_FILTER: 10, TEXTURE_MAG_FILTER: 11, TEXTURE_WRAP_S: 12, TEXTURE_WRAP_T: 13,
    createTexture: () => ({ src: null, rows: 0 }), deleteTexture() {}, texStorage2D() {}, texParameteri() {},
    texSubImage2D(target, level, x, y, w, h, fmt, type, data) { bound.src = data; bound.rows = y + h; },
  };
  return {
    getContext: () => gl,
    state: { bindTexture(target, t) { bound = t; }, unbindTexture() { bound = null; } },
    setRenderTarget() {}, setScissorTest() {}, setScissor() {}, clear() {},
    render(quad) { const u = quad.material.uniforms; log.push([u.t0.value.sourceTexture, u.t1.value.sourceTexture, u.uF.value]); },
  };
}

const world = { ...haven, weather: { ...haven.weather, field: { width: 64 } } };
const log = [];
const field = new SkyField(fakeRenderer(log));
if (BREAK === 'reslot') {
  const take = field._take.bind(field);
  field._take = (t, snap) => { take(t, snap); field.slots.forEach((q, k) => { q.slot = k; }); };
}
field.setWorld(world, { preset: 'fair', origin: haven.scene.start });

// One frame: the clock at t; every blend of the frame must have read the pair's own bytes.
let blends = 0, wrong = 0, first = null, pairs = new Set();
function frame(t) {
  wall += 33; log.length = 0;
  field.update(t);
  if (!log.length) return;
  const [t0, t1] = field.pair, snaps = field.snaps, s0 = snaps.get(t0), s1 = snaps.get(t1);
  pairs.add(t0);
  for (const [a, b] of log) {
    blends++;
    const ok = s0 && s1 && [s0.A, s0.B, s0.C].includes(a.src) && [s1.A, s1.B, s1.C].includes(b.src) && a !== b;
    if (!ok) { wrong++; first = first ?? `at t = ${t.toFixed(0)} s (pair ${t0}, ${t1})`; }
  }
}
// forwards at 30 s a second for 25 minutes of the clock, back again, then two jumps
let t = 1890000;
for (let k = 0; k < 1500; k++) frame(t += 1);
check(pairs.size >= 10, `the clock ran forwards through ${pairs.size} pairs of snapshots`);
check(blends > 0 && wrong === 0, `forwards: every blend read the pair's own two snapshots (${blends} blends, ${wrong} wrong${first ? ', first ' + first : ''})`);
blends = wrong = 0; first = null; pairs = new Set();
for (let k = 0; k < 1500; k++) frame(t -= 1);
check(pairs.size >= 10 && blends > 0 && wrong === 0, `backwards through ${pairs.size} pairs: the same (${blends} blends, ${wrong} wrong${first ? ', first ' + first : ''})`);
blends = wrong = 0; first = null;
for (const jump of [36000, -90000]) { t += jump; for (let k = 0; k < 400; k++) frame(t += 1); }
check(blends > 0 && wrong === 0, `after two jumps of the clock: the same (${blends} blends, ${wrong} wrong${first ? ', first ' + first : ''})`);
check(field.slots.length <= SLOTS && new Set(field.slots.map((q) => q.slot)).size === field.slots.length, `no two held snapshots share a texture (${field.slots.map((q) => q.slot).join(', ')})`);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
