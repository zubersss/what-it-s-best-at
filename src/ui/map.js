// The solar-system map: every body where it is at the game's date, seen from above the
// plane of the planets. Drag to move, pinch or wheel to zoom, tap a body to choose it:
// then "Set target" and "GO" do what the target list and the GO button do. Tapping a
// planet twice ("Look closer") shows its moons. A 2-D canvas over the game.
const OBLIQUITY = 23.43928 * Math.PI / 180, CE = Math.cos(OBLIQUITY), SE = Math.sin(OBLIQUITY);
const AU = 149597870700;

export class SystemMap {
  // hooks: { state(): { jd, cat, eph, home, you: [x, y, z] (from the Sun, ICRF, m), target, landable: Set, date: string },
  //          pick(id), go(), names: (id) => string }
  constructor(hooks) {
    this.hooks = hooks;
    const root = document.createElement('div');
    root.id = 'map'; root.className = 'hidden';
    root.innerHTML = `<canvas></canvas>
      <div class="bar"><button data-a="inner">Inner planets</button><button data-a="outer">Whole system</button><button data-a="here">Where I am</button><span class="date"></span><button data-a="close" class="x">Close</button></div>
      <div class="info hidden"><b></b><span></span><div><button data-a="target">Set target</button><button data-a="go" class="primary">GO</button><button data-a="closer">Look closer</button></div></div>`;
    document.body.appendChild(root);
    this.root = root; this.canvas = root.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.info = root.querySelector('.info'); this.dateEl = root.querySelector('.date');
    this.focus = 'sun'; this.scale = 2.2 * AU / 300; this.cx = 0; this.cy = 0;        // metres per CSS pixel; the map's centre (m, in the focus body's frame)
    this.sel = null; this.orbits = new Map(); this.orbitJd = -1e9; this.points = [];
    root.addEventListener('click', (e) => {
      const a = e.target?.dataset?.a;
      if (!a) return;
      e.preventDefault();
      if (a === 'close') this.hide();
      else if (a === 'inner') this.frame('sun', 1.9 * AU);
      else if (a === 'outer') this.frame('sun', 42 * AU);
      else if (a === 'here') this.here();
      else if (a === 'target' && this.sel) { hooks.pick(this.sel); this.draw(); }
      else if (a === 'go' && this.sel) { hooks.pick(this.sel); hooks.go(); this.hide(); }
      else if (a === 'closer' && this.sel) this.closer(this.sel);
    });
    // drag, pinch, wheel, tap
    const pts = new Map();
    let moved = 0, pinch = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; pinch = 0; });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) { this.cx -= (e.clientX - p[0]) * this.scale; this.cy += (e.clientY - p[1]) * this.scale; moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
      p[0] = e.clientX; p[1] = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 0 && d > 0) this.zoom(pinch / d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pinch = d; moved = 99;
      }
      this.draw();
    });
    const up = (e) => { if (pts.delete(e.pointerId) && moved < 8 && pts.size === 0) this.tap(e.clientX, e.clientY); pinch = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.25 : 0.8, e.clientX, e.clientY); this.draw(); }, { passive: false });
    window.addEventListener('resize', () => { if (this.visible) this.draw(); });
  }

  get visible() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); }
  toggle() { if (this.visible) this.hide(); else this.show(); }
  show() { this.root.classList.remove('hidden'); this.sel = this.hooks.state().target || null; this.here(); }

  // Shows the system the traveller is in: its planet with its moons, or the planets.
  here() {
    const s = this.hooks.state(), home = s.cat[s.home], planet = home.parent && home.parent !== 'sun' ? home.parent : s.home;
    const moons = Object.keys(s.cat).filter((k) => s.cat[k].parent === planet);
    if (moons.length) this.frame(planet, 1.25 * Math.max(...moons.map((k) => s.cat[k].orbit.a[0])));
    else this.frame('sun', Math.max(1.9 * AU, 1.25 * s.cat[planet].orbit.a[0]));
  }
  closer(id) {
    const s = this.hooks.state(), b = s.cat[id], planet = b.parent && b.parent !== 'sun' ? b.parent : id;
    const moons = Object.keys(s.cat).filter((k) => s.cat[k].parent === planet);
    this.frame(planet, moons.length ? 1.25 * Math.max(...moons.map((k) => s.cat[k].orbit.a[0])) : 40 * s.cat[planet].radius);
  }
  // Centres the map on a body with `reach` metres from the centre to the nearer screen edge.
  frame(focus, reach) {
    this.focus = focus; this.cx = 0; this.cy = 0;
    this.scale = reach / (0.46 * Math.min(window.innerWidth, window.innerHeight));
    this.draw();
  }
  zoom(f, px, py) {
    const w = window.innerWidth, h = window.innerHeight, mx = this.cx + (px - w / 2) * this.scale, my = this.cy - (py - h / 2) * this.scale;
    this.scale = Math.min(60 * AU / 200, Math.max(2e4, this.scale * f));
    this.cx = mx - (px - w / 2) * this.scale; this.cy = my + (py - h / 2) * this.scale;
  }
  tap(px, py) {
    let best = null, bd = 30;
    for (const p of this.points) { const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = p.id; } }
    this.sel = best;
    this.draw();
  }

  // (x, y) on the map's plane (the ecliptic) of a point given from the Sun in ICRF metres
  static flat(v, out) { out[0] = v[0]; out[1] = v[1] * CE + v[2] * SE; return out; }

  draw() {
    if (!this.visible) return;
    const s = this.hooks.state(), { cat, eph, jd } = s, ctx = this.ctx, c = this.canvas;
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(3, 4, 8, 0.93)'; ctx.fillRect(0, 0, w, h);
    const t = [0, 0, 0], f = [0, 0], o = [0, 0];
    const pos = (id) => (id === 'sun' ? [0, 0, 0] : eph.positionICRF(id, jd, [0, 0, 0]));
    SystemMap.flat(pos(this.focus), f);
    const X = (mx) => w / 2 + (mx - f[0] - this.cx) / this.scale, Y = (my) => h / 2 - (my - f[1] - this.cy) / this.scale;
    // orbits: one turn of each body round its parent, as it is now (made again when the date has moved on)
    if (Math.abs(jd - this.orbitJd) > 3) { this.orbits.clear(); this.orbitJd = jd; }
    const ids = Object.keys(cat).filter((k) => k !== 'sun');
    this.points = [];
    ctx.lineWidth = 1;
    for (const id of ids) {
      const b = cat[id], parent = b.parent || 'sun', a = b.orbit.a[0], pp = SystemMap.flat(pos(parent), [0, 0]);
      const rpx = a / this.scale;
      if (rpx < 9 && parent !== 'sun') continue;                 // a moon system too small to show
      if (rpx > 3 * Math.hypot(w, h) && Math.hypot(X(pp[0]) - w / 2, Y(pp[1]) - h / 2) > 3 * Math.hypot(w, h)) continue;
      let path = this.orbits.get(id);
      if (!path) {
        const period = 36525 * 360 / Math.abs(b.orbit.L[1]), N = 120;
        path = new Float64Array((N + 1) * 2);
        for (let k = 0; k <= N; k++) {
          const tj = jd + period * k / N;
          eph.positionICRF(id, tj, t); const q = pos(parent === 'sun' ? 'sun' : parent);
          const pj = parent === 'sun' ? [0, 0, 0] : eph.positionICRF(parent, tj, [0, 0, 0]);
          SystemMap.flat([t[0] - pj[0], t[1] - pj[1], t[2] - pj[2]], o); path[k * 2] = o[0]; path[k * 2 + 1] = o[1]; void q;
        }
        this.orbits.set(id, path);
      }
      ctx.strokeStyle = parent === 'sun' ? 'rgba(150, 165, 200, 0.32)' : 'rgba(150, 165, 200, 0.24)';
      ctx.beginPath();
      for (let k = 0; k < path.length; k += 2) { const x = X(pp[0] + path[k]), y = Y(pp[1] + path[k + 1]); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // the Sun
    { const x = X(0), y = Y(0); const g = ctx.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, '#fff6d8'); g.addColorStop(0.3, '#ffd870'); g.addColorStop(1, 'rgba(255, 200, 80, 0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); this.points.push({ id: 'sun', x, y }); }
    // bodies
    ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const labels = [];
    for (const id of ids.slice().sort((p, q) => cat[q].radius - cat[p].radius)) {       // (the larger body's name wins a crowded spot)
      const b = cat[id], parent = b.parent || 'sun';
      if (parent !== 'sun' && b.orbit.a[0] / this.scale < 9) continue;
      SystemMap.flat(pos(id), o);
      const x = X(o[0]), y = Y(o[1]);
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      const r = Math.max(parent === 'sun' ? 3.5 : 2.5, Math.min(9, 1.6 * Math.log10(b.radius / 1e5)));
      const col = b.color || [1, 1, 1], m = 255 / Math.max(...col);
      ctx.fillStyle = `rgb(${Math.round(col[0] * m)}, ${Math.round(col[1] * m)}, ${Math.round(col[2] * m)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (s.landable.has(id)) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, 7); ctx.stroke(); }
      if (id === s.target) { ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 7, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
      if (id === this.sel) { ctx.strokeStyle = '#ffffff'; ctx.strokeRect(x - r - 6, y - r - 6, 2 * r + 12, 2 * r + 12); }
      // (a name is left out where it would lie on one already written: zoom in to read it)
      const lx = x + r + 6, crowded = labels.some((q) => Math.abs(q[1] - y) < 13 && Math.abs(q[0] - lx) < 64);
      if (!crowded || id === this.sel) { labels.push([lx, y]); ctx.fillStyle = id === this.sel ? '#ffffff' : 'rgba(225, 228, 238, 0.86)'; ctx.fillText(this.hooks.names(id), lx, y); }
      this.points.push({ id, x, y });
    }
    // the traveller
    { SystemMap.flat(s.you, o); const x = X(o[0]), y = Y(o[1]);
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#7dffb0'; ctx.fillText('You', x + 10, y - 10); }
    // scale bar
    { const target = this.scale * 120, unit = target > 0.5 * AU ? AU : 1e6, n = Math.pow(10, Math.floor(Math.log10(target / unit))), k = target / unit / n, val = (k >= 5 ? 5 : k >= 2 ? 2 : 1) * n, len = val * unit / this.scale;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.beginPath(); ctx.moveTo(16, h - 22); ctx.lineTo(16 + len, h - 22); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'; ctx.fillText(unit === AU ? `${val} AU (${Math.round(val * 149.6)} million km)` : `${(val * 1000).toLocaleString('en-US')} km`, 16, h - 34); }
    this.dateEl.textContent = s.date;
    // what is chosen
    if (this.sel) {
      const b = this.sel === 'sun' ? null : cat[this.sel], p = pos(this.sel), d = Math.hypot(p[0] - s.you[0], p[1] - s.you[1], p[2] - s.you[2]);
      this.info.querySelector('b').textContent = this.hooks.names(this.sel);
      const far = d > 0.05 * AU ? `${(d / AU).toFixed(2)} AU away` : `${Math.round(d / 1000).toLocaleString('en-US')} km away`;
      this.info.querySelector('span').textContent = `${this.sel === s.home ? 'you are here' : far}${b && s.landable.has(this.sel) ? ' · you can land here' : this.sel === 'sun' ? '' : ' · to see from space'}`;
      this.info.querySelector('[data-a="closer"]').classList.toggle('hidden', this.sel === 'sun');
      this.info.classList.remove('hidden');
    } else this.info.classList.add('hidden');
  }
}
