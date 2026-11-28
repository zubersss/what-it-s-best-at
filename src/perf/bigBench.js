// The big benchmark: every run the owner has been asked for, one after another, with one text
// to paste at the end ("a benchmark a big one so you dont have to keep asking", 2026-11-28).
//
// Each run is one of the page's own benchmarks, started by its own link, exactly as when it is
// asked for alone: the page finishes a run, keeps its text (localStorage, so a run that the
// browser throws away is simply made again), and opens the next run's link. Nothing here knows
// how a benchmark works; this file only keeps the list and the place in it. No DOM, no three:
// scripts/big-bench-test.mjs replays a whole chain with a stand-in store.

export const BIG_KEY = 'sse.big';

// name: what the run is, in the owner's words; query: its link's parameters.
export const BIG_STEPS = [
  { name: 'A. As you play it: Sharp, the phone choosing what to give up; then what each thing costs', query: 'world=haven&bench=haven&mode=sharp' },
  { name: 'B. Everything on, the picture held at one size', query: 'world=haven&bench=haven&mode=sharp&scale=0.775&cost=0' },
  { name: 'C. Every saving on, the picture held at one size', query: 'world=haven&bench=haven&mode=sharp&scale=0.775&debug=floor&cost=0' },
  { name: 'D. From the air (90 m to 3 km up), as you play it', query: 'world=haven&bench=havenair&mode=sharp&cost=0' },
  { name: 'E. From the air, everything on, the picture held at one size', query: 'world=haven&bench=havenair&mode=sharp&scale=0.775&cost=0' },
  { name: 'F. As you play it again, the phone warm', query: 'world=haven&bench=haven&mode=sharp&cost=0' },
];
// (for the headless check of the chain itself: two short runs on Mars)
export const BIG_TEST_STEPS = [
  { name: 'A. Mars, the picture held at one size', query: 'world=mars&bench=run&mode=sharp&scale=0.5&cost=0' },
  { name: 'B. Mars again', query: 'world=mars&bench=run&mode=sharp&scale=0.5&cost=0' },
];

const stepsOf = (state) => (state && state.test ? BIG_TEST_STEPS : BIG_STEPS);
export const bigLink = (path, step, test) => `${path}?${step.query}&big=1${test ? '&bigtest=1' : ''}`;

export function bigRead(store) { try { const s = JSON.parse(store.getItem(BIG_KEY)); return s && Array.isArray(s.texts) ? s : null; } catch { return null; } }
function write(store, state) { try { store.setItem(BIG_KEY, JSON.stringify(state)); return true; } catch { return false; } }

// Begins a chain: the link of its first run. build: the page's build, kept so that a chain is
// never carried on by another build (the page updated in between: begin again).
export function bigBegin(store, path, build, test = false) {
  const state = { i: 0, texts: [], build, test: !!test, t0: Date.now() };
  write(store, state);
  return bigLink(path, stepsOf(state)[0], state.test);
}

// The chain's place when a page opens with &big=1: { label } for the banner, or { restart: link }
// when there is no chain to go on with (none stored, or another build's).
export function bigAt(store, path, build, test = false) {
  const state = bigRead(store);
  if (!state || state.build !== build || state.i >= stepsOf(state).length) return { restart: bigBegin(store, path, build, test) };
  const steps = stepsOf(state);
  return { label: `Big benchmark, run ${state.i + 1} of ${steps.length} · `, step: steps[state.i] };
}

// A run has finished with `text`: { next: the next run's link } or { text: all of it, done }.
export function bigDone(store, path, text) {
  const state = bigRead(store); if (!state) return { text, done: true };
  const steps = stepsOf(state);
  state.texts.push(`==== ${steps[state.i].name} ====\n${text}`); state.i++;
  if (state.i < steps.length && write(store, state)) return { next: bigLink(path, steps[state.i], state.test) };
  try { store.removeItem(BIG_KEY); } catch { /* nothing kept */ }
  const mins = Math.round((Date.now() - state.t0) / 60000);
  const head = `SOLAR SYSTEM EXPLORER — THE BIG BENCHMARK · build ${state.build} · ${state.texts.length} of ${steps.length} runs in ${mins} min\n` +
    steps.map((s) => `  ${s.name}`).join('\n') + (state.i < steps.length ? '\n  (stopped short: this browser would keep no more text)' : '');
  return { text: `${head}\n\n${state.texts.join('\n\n')}`, done: true };
}
