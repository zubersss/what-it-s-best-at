// The menu: everything that is not flown with the stick. One panel of large buttons
// (MENU on a phone, Tab on a keyboard): the map and targets, the clock, the camera and
// the picture, the journal and the sound. Plain DOM; styles live in index.html.
// A button's `stay` keeps the menu open (the clock's buttons are tapped again and again).
export class Menu {
  // sections(): [{ title, note?, items: [{ label, sub?, on?, act(), stay? }], date?: { value, min, max, set(ms) } }]
  constructor(sections) {
    this.sections = sections;
    this.root = document.createElement('div');
    this.root.id = 'menu'; this.root.className = 'hidden';
    this.panel = document.createElement('div'); this.panel.className = 'panel';
    this.root.appendChild(this.panel);
    this.notes = []; this.dates = [];
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.hide(); } });
    document.body.appendChild(this.root);
  }

  get visible() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); }
  toggle() { if (this.visible) this.hide(); else this.show(); }
  show() { this.render(); this.root.classList.remove('hidden'); }

  // A few times a second while the menu is up: the notes (the clock's read-out) and the
  // date field follow the game. The buttons are left alone: a button rebuilt between a
  // press and its release never gets its click.
  tick() {
    const ss = this.sections();
    for (let k = 0; k < ss.length; k++) {
      const n = this.notes[k], d = this.dates[k];
      if (n && ss[k].note != null && n.textContent !== ss[k].note) n.textContent = ss[k].note;
      if (d && ss[k].date && document.activeElement !== d && d.value !== ss[k].date.value) d.value = ss[k].date.value;
    }
  }

  // Rebuilds the panel (on show and after a `stay` button).
  render() {
    const focus = document.activeElement?.dataset?.keep;
    if (focus) { this.tick(); return; }                       // (a date being typed is left alone)
    this.panel.textContent = '';
    this.notes = []; this.dates = [];
    const all = this.sections();
    for (let k = 0; k < all.length; k++) {
      const s = all[k];
      const h = document.createElement('h2'); h.textContent = s.title; this.panel.appendChild(h);
      if (s.note) { const p = document.createElement('p'); p.className = 'note'; p.textContent = s.note; this.panel.appendChild(p); this.notes[k] = p; }
      const row = document.createElement('div'); row.className = 'items';
      for (const it of s.items) {
        const b = document.createElement('button');
        if (it.on) b.className = 'on';
        const n = document.createElement('b'); n.textContent = it.label; b.appendChild(n);
        if (it.sub) { const sp = document.createElement('span'); sp.textContent = it.sub; b.appendChild(sp); }
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); it.act(); if (it.stay) this.render(); else this.hide(); });
        row.appendChild(b);
      }
      if (s.date) {
        const lab = document.createElement('label'); lab.className = 'date'; lab.textContent = 'Go to a date ';
        const inp = document.createElement('input'); inp.type = 'date'; inp.dataset.keep = '1';
        inp.min = s.date.min; inp.max = s.date.max; inp.value = s.date.value;
        // (the field is left as it is: a date typed on a keyboard changes one part at a time)
        inp.addEventListener('change', () => { const ms = Date.parse(inp.value + 'T12:00:00Z'); if (Number.isFinite(ms)) s.date.set(ms); });
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        this.dates[k] = inp;
        lab.appendChild(inp); row.appendChild(lab);
      }
      this.panel.appendChild(row);
    }
  }
}
