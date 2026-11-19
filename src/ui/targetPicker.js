// The target list (the TARGET button on a phone): this world's real places and everything
// in the sky, each with how far it is; a tap picks one (the view turns to it), "No target"
// clears it, a tap outside closes the list. Plain DOM; styles live in index.html.
export class TargetPicker {
  // onPick(id or null)
  constructor(onPick) {
    this.onPick = onPick;
    this.root = document.createElement('div');
    this.root.id = 'picker'; this.root.className = 'hidden';
    this.panel = document.createElement('div'); this.panel.className = 'panel';
    this.root.appendChild(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.hide(); } });
    document.body.appendChild(this.root);
  }

  get visible() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  // groups: [{ title, items: [{ id, name, info }] }]; current: the chosen id (or null)
  show(groups, current) {
    this.panel.textContent = '';
    for (const g of groups) {
      if (!g.items.length) continue;
      const h = document.createElement('h2'); h.textContent = g.title; this.panel.appendChild(h);
      const row = document.createElement('div'); row.className = 'items';
      for (const it of g.items) row.appendChild(this._button(it.name, it.info, it.id === current, () => this.onPick(it.id)));
      this.panel.appendChild(row);
    }
    const row = document.createElement('div'); row.className = 'items';
    row.appendChild(this._button('No target', '', current == null, () => this.onPick(null)));
    this.panel.appendChild(row);
    this.root.classList.remove('hidden');
  }

  _button(name, info, on, act) {
    const b = document.createElement('button');
    if (on) b.className = 'on';
    const n = document.createElement('b'); n.textContent = name; b.appendChild(n);
    if (info) { const s = document.createElement('span'); s.textContent = info; b.appendChild(s); }
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); act(); this.hide(); });
    return b;
  }
}
