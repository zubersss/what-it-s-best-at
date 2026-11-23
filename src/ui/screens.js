// The full-screen panels (start screen, benchmark results) and two small overlays (the
// benchmark banner and a one-line toast). Plain DOM; styles live in index.html.
import { MODES } from '../perf/governor.js';

function el(tag, attrs = {}, text = '') {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  return e;
}

export class StartScreen {
  // handlers: { play(), benchmark(kind), mode() }; worlds: [{ id, name }], world: the one loaded
  constructor(build, mode, handlers, worlds = [], world = '') {
    this.handlers = handlers;
    const root = el('div', { id: 'start' });
    const card = el('div', { class: 'card' });
    card.append(el('h1', {}, 'Solar System Explorer'), el('p', { class: 'sub' }, 'Fifteen real worlds · the space between'));
    const row = el('div', { class: 'row' });
    const play = el('button', { class: 'primary' }, 'Play');
    const haven = el('button', {}, 'Haven benchmark · 3 min');
    const bench = el('button', {}, 'Benchmark · 3 min');
    const earth = el('button', {}, 'Earth benchmark · 3 min');
    const soak = el('button', {}, 'Soak test · 10 min');
    row.append(play, haven, bench, earth, soak);
    this.buttons = [play, haven, bench, earth, soak];
    haven.addEventListener('click', () => handlers.benchmark('haven'));
    // Where the game opens: choosing another world loads it (the page starts again there).
    const where = el('label', { class: 'where' }, 'Start on ');
    const pick = el('select');
    for (const w of worlds) { const o = el('option', { value: w.id }, w.name); if (w.id === world) o.selected = true; pick.append(o); }
    where.append(pick);
    pick.addEventListener('change', () => {
      try { localStorage.setItem('sse.world.2', pick.value); } catch { /* storage blocked: the address carries it */ }
      const u = new URL(location.href); u.searchParams.set('world', pick.value); location.href = u.toString();
    });
    this.modeBtn = el('button', { class: 'mode' });
    this.status = el('p', { class: 'status' }, 'Loading terrain…');
    card.append(row, where, this.modeBtn, el('p', { class: 'rotate' }, 'Turn the phone sideways for the best view'), this.status,
      el('p', { class: 'build' }, `build ${build.commit}${build.time ? ' · ' + build.time : ''}`));
    root.append(card);
    document.body.appendChild(root);
    this.root = root;
    this.setMode(mode);
    this.setReady(false);
    play.addEventListener('click', () => handlers.play());
    bench.addEventListener('click', () => handlers.benchmark('run'));
    earth.addEventListener('click', () => handlers.benchmark('earth'));
    soak.addEventListener('click', () => handlers.benchmark('soak'));
    this.modeBtn.addEventListener('click', () => handlers.mode());
  }

  setMode(mode) {
    const m = MODES[mode];
    this.modeBtn.textContent = `Mode: ${m.label} (${m.fps} fps) — tap to change`;
  }
  setReady(ready) {
    for (const b of this.buttons) b.disabled = !ready;
    if (ready) this.status.textContent = 'Benchmarks play by themselves: put the phone down and wait for the results.';
  }
  hide() { this.root.classList.add('hidden'); }
  show() { this.root.classList.remove('hidden'); }
  get visible() { return !this.root.classList.contains('hidden'); }
}

export class ResultsScreen {
  constructor(onClose) {
    const root = el('div', { id: 'results', class: 'hidden' });
    const card = el('div', { class: 'card' });
    this.title = el('h1', {}, 'Benchmark results');
    this.pre = el('pre');
    const row = el('div', { class: 'row' });
    this.copyBtn = el('button', { class: 'primary' }, 'Copy results');
    const close = el('button', {}, 'Close');
    row.append(this.copyBtn, close);
    card.append(this.title, row, this.pre);
    root.append(card);
    document.body.appendChild(root);
    this.root = root;
    this.copyBtn.addEventListener('click', () => this.copy());
    close.addEventListener('click', () => { this.hide(); onClose?.(); });
  }

  show(text) {
    this.text = text;
    this.pre.textContent = text;
    this.copyBtn.textContent = 'Copy results';
    this.root.classList.remove('hidden');
  }
  hide() { this.root.classList.add('hidden'); }

  async copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(this.text); ok = true; } catch { /* fall through */ }
    if (!ok) {
      // Older browsers / non-secure pages: select the text and use the legacy command.
      const r = document.createRange(); r.selectNodeContents(this.pre);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    this.copyBtn.textContent = ok ? 'Copied — paste it into the chat' : 'Select the text below and copy it';
  }
}

// A small banner during a benchmark run.
export class BenchBanner {
  constructor(onStop) {
    const root = el('div', { id: 'benchbar', class: 'hidden' });
    this.label = el('span');
    const stop = el('button', {}, 'Stop');
    root.append(this.label, stop);
    document.body.appendChild(root);
    this.root = root;
    stop.addEventListener('click', () => onStop());
  }
  set(text) { if (text !== this.text) { this.text = text; this.label.textContent = text; } }
  show(v) { this.root.classList.toggle('hidden', !v); }
}

// One line of feedback that fades by itself (mode changes).
export class Toast {
  constructor() {
    this.root = el('div', { id: 'toast', class: 'hidden' });
    document.body.appendChild(this.root);
  }
  show(text, ms = 2200) {
    this.root.textContent = text;
    this.root.classList.remove('hidden');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.root.classList.add('hidden'), ms);
  }
}
