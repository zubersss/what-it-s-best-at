// The journal: the real places of every world, and which of them the traveller has
// reached. A place is found by going there; then its line shows what it is and the day
// it was found. Plain DOM; styles live in index.html.
export class Journal {
  // worlds: [{ id, name, places: [{ id, name, fact }] }]; save: Save; onPick(worldId, placeId)
  constructor(worlds, save, onPick) {
    this.worlds = worlds; this.save = save; this.onPick = onPick;
    this.root = document.createElement('div');
    this.root.id = 'journal'; this.root.className = 'hidden';
    this.panel = document.createElement('div'); this.panel.className = 'panel';
    this.root.appendChild(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.hide(); } });
    document.body.appendChild(this.root);
  }
  get visible() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); }
  get total() { return this.worlds.reduce((a, w) => a + w.places.length, 0); }

  show(currentWorld) {
    const p = this.panel; p.textContent = '';
    const h = document.createElement('h1'); h.textContent = `Journal · ${this.save.count} of ${this.total} places found`; p.appendChild(h);
    const close = document.createElement('button'); close.className = 'x'; close.textContent = 'Close';
    close.addEventListener('click', () => this.hide()); h.appendChild(close);
    // the world underfoot first
    const order = this.worlds.slice().sort((a, b) => (b.id === currentWorld) - (a.id === currentWorld));
    for (const w of order) {
      const found = w.places.filter((q) => this.save.has(`${w.id}/${q.id}`)).length;
      const h2 = document.createElement('h2'); h2.textContent = `${w.name} · ${found} of ${w.places.length}`; p.appendChild(h2);
      for (const q of w.places) {
        const when = this.save.data.found[`${w.id}/${q.id}`];
        const row = document.createElement('div'); row.className = when ? 'place found' : 'place';
        const b = document.createElement('b'); b.textContent = (when ? '✓ ' : '○ ') + q.name; row.appendChild(b);
        const s = document.createElement('span');
        s.textContent = when ? `${q.fact || ''}${q.fact ? ' ' : ''}(found ${String(when).slice(0, 10)})` : (w.id === currentWorld ? 'Not found yet: tap to aim at it.' : 'Not found yet.');
        row.appendChild(s);
        if (w.id === currentWorld) row.addEventListener('click', () => { this.onPick(w.id, q.id); this.hide(); });
        p.appendChild(row);
      }
    }
    this.root.classList.remove('hidden');
    p.scrollTop = 0;
  }
}
