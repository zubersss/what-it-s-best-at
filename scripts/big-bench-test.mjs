// The big benchmark's chain (src/perf/bigBench.js) replayed with a stand-in store: every run in
// its order, each text kept, the last hands back all of them; a chain of another build begins
// again; a store that will keep no more ends the chain with what it has. No browser, a second.
//   node scripts/big-bench-test.mjs [--break order|build]
import { BIG_STEPS, BIG_TEST_STEPS, BIG_KEY, bigBegin, bigAt, bigDone } from '../src/perf/bigBench.js';
import { getWorld } from '../src/worlds/index.js';

const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
let failed = 0; const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };
const store = (limit = 1e9) => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (v.length > limit) throw new Error('full'); m.set(k, v); }, removeItem: (k) => m.delete(k), m }; };
const q = (link) => new URLSearchParams(link.split('?')[1]);

// a whole chain
{
  const s = store(), path = '/game/';
  let link = bigBegin(s, path, 'abc1234'), seen = [], text = null;
  for (let guard = 0; guard < 20 && link; guard++) {
    const p = q(link); seen.push(`${p.get('bench')}|${p.get('scale') || ''}|${p.get('debug') || ''}|${p.get('cost') || ''}`);
    const at = bigAt(s, path, 'abc1234');
    if (at.restart) { check('a run of the chain finds its place', false); break; }
    const d = bigDone(s, path, `text of run ${seen.length}`);
    if (brk === 'order' && seen.length === 2) { const st = JSON.parse(s.getItem(BIG_KEY)); st.i = 0; s.setItem(BIG_KEY, JSON.stringify(st)); }
    link = d.next || null; if (d.done) text = d.text;
  }
  check(`the chain makes ${BIG_STEPS.length} runs in the list's order (${seen.length} made)`, seen.length === BIG_STEPS.length && BIG_STEPS.every((st, i) => { const p = new URLSearchParams(st.query); return seen[i] === `${p.get('bench')}|${p.get('scale') || ''}|${p.get('debug') || ''}|${p.get('cost') || ''}`; }));
  check('every link is a run of the chain (big=1), on Haven, in Sharp', BIG_STEPS.every((st) => { const p = q(`x?${st.query}&big=1`); return p.get('big') === '1' && p.get('world') === 'haven' && p.get('mode') === 'sharp'; }));
  check('only the first run has the cost test', BIG_STEPS.every((st, i) => (new URLSearchParams(st.query).get('cost') === '0') === (i > 0)));
  check('the last run hands back every text under its name, and the list', !!text && BIG_STEPS.every((st, i) => text.includes(`==== ${st.name} ====\ntext of run ${i + 1}`)) && text.startsWith('SOLAR SYSTEM EXPLORER — THE BIG BENCHMARK · build abc1234'));
  check('nothing is kept after the chain', s.getItem(BIG_KEY) == null);
}
// another build's chain begins again; so does a page with no chain
{
  const s = store(); bigBegin(s, '/', 'old0000'); bigDone(s, '/', 'one');
  const at = bigAt(s, '/', brk === 'build' ? 'old0000' : 'new1111');
  check("a chain another build began is begun again, from its first run", !!at.restart && q(at.restart).get('bench') === new URLSearchParams(BIG_STEPS[0].query).get('bench') && JSON.parse(s.getItem(BIG_KEY)).texts.length === 0);
  const s2 = store(), at2 = bigAt(s2, '/', 'new1111'); check('a run opened with no chain kept begins one', !!at2.restart);
}
// a store that will keep no more: the chain ends with what it has, and says so
{
  const s = store(400); bigBegin(s, '/', 'abc1234');
  const d = bigDone(s, '/', 'x'.repeat(600));
  check('a store that is full ends the chain with what it has, and says so', d.done && d.text.includes('stopped short') && d.text.includes('x'.repeat(600)));
}
// the short chain of the headless check
{
  const s = store(); const link = bigBegin(s, '/', 'abc1234', true);
  check('the check\'s chain is its own two runs, on Mars', q(link).get('world') === 'mars' && q(link).get('bigtest') === '1' && BIG_TEST_STEPS.length === 2);
}
// the route from the air: five stops, each a view of Haven's, and the owner's view in the cost test
{
  const w = getWorld('haven'), a = w.scene.airStops || [];
  check(`Haven's route from the air has five stops, each one of its views (${a.join(', ')})`, a.length === 5 && a.every((n) => w.scene.bookmarks[n] && w.scene.bookmarks[n].alt != null && w.scene.bookmarks[n].timeOffsetHours != null));
  check('the keys 1 to 9 are the views they were', Object.keys(w.scene.bookmarks).slice(0, 9).join(' ') === 'ledge sun wall ship dusk mist storm front crown');
  check("the cost test has the owner's view over the wood at dawn", w.scene.costViews.some((v) => v.name === 'over the wood at dawn' && v.timeOffsetHours === 0.75));
}
console.log(failed ? `big-bench-test: ${failed} FAILED` : 'big-bench-test: all passed');
process.exit(failed ? 1 : 0);
