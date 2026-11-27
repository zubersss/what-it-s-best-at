// The tenth phone benchmark (build e9d4888, Sharp, 60 Hz, docs/benchmarks/2026-11-25-haven-e9d4888.txt)
// replayed against a governor, without a browser: run(governorModule, { model, seed, start }).
// Used by scripts/governor-sim.mjs. (Written by the readers of docs/briefs/shadows-governor-10.md
// to find why the governor sat at the floor on Haven and hunted; kept as they wrote it, so
// that the numbers in the brief can be had again.)
// The route is the benchmark's: Haven ledge, sun, wall, ship, dusk (12 s each: a jump that
// the app reports as IGNORE for 2.5 s, hold 4 s, turn 4 s, fly forward 4 s), a flight from
// Haven's ledge (on Haven until the safety net hands over to the Moon at 99.5 s), the Moon's
// five stops. A frame's GPU time is
//   G = A(stop) + S(stop) x MP - (what the savings that are on buy there) + noise
// plus, with chance q(stop), a frame late whatever is drawn (a re-bake, an upload the app
// did not mark, the GPU process): S from the cost test's "everything on at 1 MP / native"
// (ledge 2.06 ms/MP, forest 1.45, air 0.75), what savings buy from the three cost views
// (only what is large and repeats), and A, q fitted so the replay of TODAY's governor gives
// the phone's per-stop fps (the frames it drew at the settings it had).
// A jump to a stop calls the governor's jumped(), as App.applyBookmark does, when it has one.

export const NATIVE = 3088 * 1440, VS = 1000 / 60;

// What a saving buys, by kind of view (ms of GPU time). From the tenth cost table, only what
// is large and repeats in two views (CLAUDE.md: nothing under 3 ms is believed from one
// view): far-relief (3.9 ledge, 5.2 forest), clouds' shadows (2.7, 5.5), far-rock-shadows
// (3.0, 4.1), cloud-volume (2.0 ledge, 3.7 air), grass-mid (1.4, 4.5), pollen (1.3, 9.1 ->
// taken as 1.5). Everything else 0 (cloak is page work: it cannot shorten a GPU-bound frame).
// cloud-steps buys only while the cloud volume is drawn.
const GROUND_BUYS = { 'far-relief': 3.5, clouds: 2.5, 'far-rock-shadows': 2.0, 'cloud-volume': 2.0, 'grass-mid': 1.4, pollen: 1.0, grass: 0.5, 'cloud-steps': 0.6 };
const AIR_BUYS = { 'cloud-volume': 3.7, 'far-relief': 2.1, 'cloud-steps': 0.6 };

// Two readings of the same phone results (they cannot be told apart from frame lengths that
// are whole refreshes; both reproduce the per-stop fps under today's governor):
//  own:    the heavy stops' late frames are mostly the view's own (spikes no lever touches)
//  pixels: they are mostly the mean GPU time sitting at the 33 ms line (pixels and savings cure)
export const MODELS = {
  own: {
    'haven:ledge': { A: 24.2, S: 2.06, sd: 1.6, q: 0.17, buys: GROUND_BUYS, trees: false, ff: false },
    'haven:sun': { A: 23.0, S: 2.06, sd: 1.6, q: 0.06, buys: GROUND_BUYS, trees: true, ff: true },
    'haven:wall': { A: 21.0, S: 2.06, sd: 1.6, q: 0.0, buys: GROUND_BUYS, trees: false, ff: true },
    'haven:ship': { A: 24.5, S: 2.06, sd: 1.6, q: 0.20, buys: GROUND_BUYS, trees: false, ff: true },
    'haven:dusk': { A: 21.0, S: 2.06, sd: 1.6, q: 0.0, buys: GROUND_BUYS, trees: false, ff: true },
    'haven:flight': { A: 21.0, S: 0.75, sd: 1.6, q: 0.04, buys: AIR_BUYS, trees: false, ff: false, grass: false },
    'moon:descend': { A: 20.0, S: 1.5, sd: 1.6, q: 0.03, buys: {}, moon: true },
    'moon:ledge': { A: 21.5, S: 1.5, sd: 1.6, q: 0.24, buys: {}, moon: true },
    'moon:sun': { A: 21.0, S: 1.5, sd: 1.6, q: 0.07, buys: {}, moon: true },
    'moon:wall': { A: 21.0, S: 1.5, sd: 1.6, q: 0.15, buys: {}, moon: true },
    'moon:ship': { A: 21.0, S: 1.5, sd: 1.6, q: 0.07, buys: {}, moon: true },
    'moon:dusk': { A: 20.0, S: 1.5, sd: 1.6, q: 0.0, buys: {}, moon: true },
  },
  mixed: null,
  pixels: {
    'haven:ledge': { A: 30.8, S: 2.06, sd: 2.0, q: 0.03, buys: GROUND_BUYS, trees: false, ff: false },
    'haven:sun': { A: 31.2, S: 2.06, sd: 2.0, q: 0.02, buys: GROUND_BUYS, trees: true, ff: true },
    'haven:wall': { A: 26.0, S: 2.06, sd: 2.0, q: 0.0, buys: GROUND_BUYS, trees: false, ff: true },
    'haven:ship': { A: 36.4, S: 2.06, sd: 2.0, q: 0.03, buys: GROUND_BUYS, trees: false, ff: true },
    'haven:dusk': { A: 26.0, S: 2.06, sd: 2.0, q: 0.0, buys: GROUND_BUYS, trees: false, ff: true },
    'haven:flight': { A: 27.5, S: 0.75, sd: 2.0, q: 0.01, buys: AIR_BUYS, trees: false, ff: false, grass: false },
    'moon:descend': { A: 24.0, S: 1.5, sd: 2.0, q: 0.01, buys: {}, moon: true },
    'moon:ledge': { A: 29.6, S: 1.5, sd: 2.0, q: 0.03, buys: {}, moon: true },
    'moon:sun': { A: 26.8, S: 1.5, sd: 2.0, q: 0.02, buys: {}, moon: true },
    'moon:wall': { A: 28.4, S: 1.5, sd: 2.0, q: 0.03, buys: {}, moon: true },
    'moon:ship': { A: 26.8, S: 1.5, sd: 2.0, q: 0.02, buys: {}, moon: true },
    'moon:dusk': { A: 24.0, S: 1.5, sd: 2.0, q: 0.0, buys: {}, moon: true },
  },
};

MODELS.mixed = Object.fromEntries(Object.keys(MODELS.own).map((k) => [k, k.startsWith('haven:') && k !== 'haven:flight' ? MODELS.pixels[k] : MODELS.own[k]]));

// The thirteenth phone results (build daa009f, Sharp, 60 Hz, the picture held at 1.88 MP,
// paced, everything on, the governor taking no step: docs/benchmarks/2026-11-27-haven-daa009f-fixed-size-paced.txt).
// The phone as it is since the grass is handed over by blocks and the sky's packages landed:
// the model the governor's order of 2026-11-27 is checked against (the tenth's models above
// stay as their readers wrote them). What a saving buys is the FAMILIES' table (each twice,
// both takes alike), shared out among a family's steps by the single numbers that repeat:
//   the opening view: the sky's 5.0 (the cloud volume 3.5, its coarser steps 1.5; none of the
//     sky's small steps showed anything alone), glow 4.2 (the Sun's beams, where the Sun is in the picture), the
//     trees' 2.3 (full shapes less far 1.3, the far forest thinned 1.0); the grass's, the
//     shadows', the ground's and the rocks' families nothing;
//   from the air: the sky's 13.6 (10.0 and 2.6 at most), the ground's 7.2 (far relief 4.9, close-up detail 1.5).
// A and S: every stop ran at 1.88 MP with 3 to 31 % of its frames three refreshes long
// (27.1, 29.5, 25.5 and 26.7 frames a second at the steady stops): the mean GPU time sits
// under the 33.3 ms line by 0.5 to 1.9 of its spread there; some 5 ms a megapixel (the cost
// test's 1.00 against 2.07 MP, the least of its three views; 4 from the air). The Moon is
// a flat 30.0: as the tenth's.
const LEDGE13 = { 'cloud-volume': 3.5, 'cloud-steps': 1.5, 'sun-beams': 4.2, 'trees-far': 1.3, 'far-trees': 1.0 };
const NOSUN13 = { 'cloud-volume': 3.5, 'cloud-steps': 1.5, 'trees-far': 1.3, 'far-trees': 1.0 };
const AIR13 = { 'cloud-volume': 10.0, 'cloud-steps': 2.6, 'far-relief': 4.9, detail: 1.5 };
export const BUYS13 = { ledge: LEDGE13, nosun: NOSUN13, air: AIR13 };
MODELS.thirteenth = {
  'haven:ledge': { A: 22.2, S: 5, sd: 2.0, q: 0.02, buys: LEDGE13, trees: true, ff: true, sun: true, sky: true },
  'haven:sun': { A: 22.2, S: 5, sd: 2.0, q: 0.02, buys: LEDGE13, trees: true, ff: true, sun: true, sky: true },
  'haven:wall': { A: 20.1, S: 5, sd: 2.0, q: 0.0, buys: NOSUN13, trees: false, ff: true, sky: true },
  'haven:ship': { A: 22.9, S: 5, sd: 2.0, q: 0.02, buys: NOSUN13, trees: false, ff: true, sky: true },
  'haven:dusk': { A: 22.4, S: 5, sd: 2.0, q: 0.0, buys: LEDGE13, trees: false, ff: true, sun: true, sky: true },
  'haven:flight': { A: 22.7, S: 4, sd: 2.0, q: 0.01, buys: AIR13, trees: false, ff: false, grass: false, sky: true },
  ...Object.fromEntries(Object.keys(MODELS.own).filter((k) => k.startsWith('moon:')).map((k) => [k, MODELS.pixels[k]])),
};
// The sky as the game has it, for the models that say so (`sky`): its savings go through its
// setter, the built ones are live while clouds are drawn, and with the cloud volume switched
// off its coarser steps can buy nothing (the step's own `live` reads cloudVolume.enabled).
const SKY_LIVE = ['cloud-far', 'cloud-upper', 'rain-shafts', 'cloud-shade-rate', 'lenses', 'fog-sheet', 'cloud-shade-coarse'];
export function skyStub(app) {
  return { live: (id) => SKY_LIVE.includes(id) && !!app.clouds.mesh.visible, hasSaving: () => true,
    setSaving(id, off) { if (id === 'cloud-volume') app.cloudVolume.enabled = !off; } };
}
const STOPS = ['ledge', 'sun', 'wall', 'ship', 'dusk'];
// Where the route is at benchmark time t: { key, jumpAt, u (s into the stop), world }
export function where(t) {
  if (t < 60) { const k = Math.floor(t / 12); return { key: `haven:${STOPS[k]}`, name: `Haven ${STOPS[k]}`, start: k * 12, u: t - k * 12, world: 'haven' }; }
  if (t < 99.5) return { key: 'haven:flight', name: 'flight', start: 60, u: t - 60, world: 'haven' };
  if (t < 120) return { key: 'moon:descend', name: 'flight', start: 99.5, u: t - 99.5, world: 'moon' };
  const k = Math.min(4, Math.floor((t - 120) / 12)); return { key: `moon:${STOPS[k]}`, name: `Moon ${STOPS[k]}`, start: 120 + k * 12, u: t - 120 - k * 12, world: 'moon' };
}

export function makeApp(scene) {
  const stubGl = { getExtension: () => null };
  const app = {
    renderer: { getContext: () => stubGl }, quality: { x: 1, y: 1, z: 1, w: 1 }, dust: { amount: 1 }, rocks: { setFraction() {} },
    terrainBudget(f, id) { this.budget = this.budget || {}; this.budget[id] = f; }, terrainPace(l) { this.pace = l; },
    post: { bloomEnabled: true, shaftsOn: true }, hero: { robe: {}, group: { visible: true } }, atmosphere: { airEnabled: true }, nearShadow: { fine: true },
    trees: { count: 0, reach: 0, setFraction() {} },
    grass: { keepClumps: 1, keepBlades: 1, mesh: { visible: true }, setMidShare() {}, setFraction() {} },
    farForest: { shown: false, count: 0, setFraction() {}, shadowsShown: false },
    cloudVolume: { wanted: true, enabled: true, steps: 36 }, clouds: { mesh: { visible: true }, shadows: true },
    pollen: { mesh: { visible: true }, setShare() {} }, rain: { mesh: { visible: false } }, farRocks: { setFraction() {}, shadows: true },
    terrain: { shared: { uRelief: { value: { x: 1 } } } },
  };
  return app;
}
// The scene at a stop: which parts are drawn (the steps' `live` tests read these).
export function setScene(app, m) {
  app.trees.count = m.trees ? 200 : 0; app.trees.reach = m.trees ? 1 : 0;
  app.farForest.shown = !!m.ff; app.farForest.count = m.ff ? 5000 : 0;
  const grass = !m.moon && m.grass !== false;
  app.grass.keepClumps = grass ? 1 : 0; app.grass.keepBlades = grass ? 1 : 0; app.grass.mesh.visible = grass;
  app.pollen.mesh.visible = grass;
  app.cloudVolume.wanted = !m.moon; app.clouds.mesh.visible = !m.moon;
  app.terrain.shared.uRelief.value.x = 1;
  // (the Sun in the picture: its beams are drawn; and the sky's own steps, where the model has them)
  app.post.shafts = m.sun ? 1 : 0; app.post.sunUv = [0.5, 0.5, m.sun ? 1 : 0];
  if (m.sky && !m.moon) app.sky ??= skyStub(app); else if (!m.sky) { if (app.sky) app.cloudVolume.enabled = true; app.sky = undefined; }
}

// One run. opts: { model, seed, start (Haven's remembered level), known, seconds, onFrame }
export function run(Gov, opts = {}) {
  const { Governor, FRAME, FEATURE_STEPS } = Gov;
  const model = MODELS[opts.model || 'own'];
  let seed = opts.seed ?? 1;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; };
  const app = makeApp();
  const g = new Governor(app, 'sharp');
  const known = opts.known ?? { 'sharp:haven:2': opts.start ?? 7, 'sharp:moon:2': 2 };
  g.remember(known, () => {}); g.place = 'haven'; g.setNative(NATIVE);
  const isOff = (id) => (g.isOff ? g.isOff(id) : false);
  const seconds = opts.seconds ?? 180;
  let burstLeft = 0, now = 0, busyUntil = 0, lastRender = -1, softLeft = 0, prevSoft = false, curKey = null, jumpAt = -1e9, world = 'haven';
  const frames = [];
  // the governor's clock is the benchmark's (the log's times are the governor's own)
  while (now < seconds * 1000) {
    now += VS;
    const t = now / 1000, w = where(t);
    if (w.world !== world) { world = w.world; g.arrive(world); jumpAt = now; }
    if (w.key !== curKey) { if ((w.u < 0.05 && w.key !== 'moon:descend') || w.key === 'haven:flight') { jumpAt = now; g.jumped?.(); } curKey = w.key; }
    const m = model[w.key];
    setScene(app, m);
    opts.events?.(t, g, app, w);
    if (now < busyUntil) continue;
    if (!g.shouldRender(now)) continue;
    const dt = lastRender < 0 ? 2 * VS : now - lastRender; lastRender = now;
    // GPU time of this frame
    const mp = g.pixels / 1e6;
    let c = m.A + m.S * mp + m.sd * gauss();
    for (const id in m.buys) { if (!isOff(id)) continue; if (id === 'cloud-steps' && isOff('cloud-volume')) continue; c -= m.buys[id]; }
    // (late frames of the view's own: alone, or in runs of BURST on average with the same share)
    const B = opts.burst ?? 1;
    if (burstLeft > 0) { burstLeft--; c = Math.max(c, 34 + 9 * rnd()); }
    else if (rnd() < m.q / B) { burstLeft = B > 1 ? Math.floor(-Math.log(1 - rnd()) * (B - 1)) : 0; c = Math.max(c, 34 + 9 * rnd()); }                 // a frame late whatever is drawn
    if (now - jumpAt < 900 && t < 2) c += 120;              // the first jump's hitches (258, 225, 117 ms)
    c = Math.max(c, 9);                                      // the page's own work (7.6 to 10 ms)
    busyUntil = now + c - 0.01;
    // terrain arriving: more while turning and flying forward (35 % of frames over the run)
    const upP = w.key.endsWith('flight') || w.key === 'moon:descend' ? 0.3 : w.u < 4 ? 0.2 : w.u < 8 ? 0.5 : 0.4;
    const uploads = rnd() < upP;
    const ignore = now - jumpAt < 2500;
    const kind = ignore ? FRAME.IGNORE : softLeft > 0 ? FRAME.SOFT : FRAME.NORMAL;
    g.update(dt, kind, 9);
    softLeft = uploads ? 3 : Math.max(0, softLeft - 1);
    frames.push({ t, dt, key: w.key, name: w.name, mp: g.pixels / 1e6, off: g.featureLevel });
    opts.onFrame?.(t, g, dt);
  }
  return { g, frames, known };
}

// The benchmark's own read-out of a run (the phone's lines, for comparison).
export function report(res, label = '') {
  const { g, frames } = res, target = 1000 / 30;
  const fps = (a) => (a.length ? 1000 * a.length / a.reduce((x, y) => x + y.dt, 0) : 0);
  const lines = [];
  const n = frames.length, late15 = frames.filter((f) => f.dt > target * 1.5 + 0.5).length, late12 = frames.filter((f) => f.dt > target * 1.2).length;
  const steps = g.log;
  const c = (re) => steps.filter((s) => re.test(s.text)).length;
  lines.push(`${label} fps ${fps(frames).toFixed(1)} · late (governor's 1.2x) ${(100 * late12 / n).toFixed(1)} % · over 1.5x ${(100 * late15 / n).toFixed(2)} % · avg ${(frames.reduce((a, f) => a + f.mp, 0) / n).toFixed(2)} MP`);
  const names = [...new Set(frames.map((f) => f.name))];
  lines.push('  ' + names.map((nm) => { const fr = frames.filter((f) => f.name === nm); return `${nm} ${fps(fr).toFixed(1)}/${(100 * fr.filter((f) => f.dt > target * 1.2).length / fr.length).toFixed(0)}%/${(fr.reduce((a, f) => a + f.mp, 0) / fr.length).toFixed(2)}`; }).join(' · '));
  lines.push(`  steps ${steps.length} (res down ${c(/^resolution down/)}, up ${c(/^resolution up/)}; off ${c(/^off:/)}, back on ${c(/^back on:/)}; put back ${c(/did not cure/)}) · bg ${(100 * g.bg).toFixed(1)} % · ended ${(g.pixels / 1e6).toFixed(2)} MP, ${g.featureLevel} savings`);
  return lines.join('\n');
}
