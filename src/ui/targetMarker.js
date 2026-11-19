// The chosen target on screen: thin corner brackets around it, its name, how far it is and
// how long the trip takes; at the edge of the screen an arrow toward it when it is off to a
// side or behind. Plain DOM over the canvas (no draw calls); styles live in index.html.
import * as THREE from 'three';

const MARGIN = 34;          // px kept clear at the screen's edges for the edge arrow

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

export class TargetMarker {
  constructor() {
    this.root = el('div'); this.root.id = 'target'; this.root.className = 'hidden';
    this.box = el('div', 'box');
    this.label = el('div', 'label');
    this.name = el('b'); this.info = el('span');
    this.label.append(this.name, this.info);
    this.arrow = el('div', 'arrow');
    this.root.append(this.box, this.label, this.arrow);
    document.body.appendChild(this.root);
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.text = '';
  }

  hide() { this.root.classList.add('hidden'); this.visible = false; }

  // camera: the view (its orientation; the view is camera-relative). dir: unit direction to
  // the target, in the view's world axes. angRadius: the target's angular radius (radians;
  // 0 for a place on the ground). name, info: the label's two lines.
  update(camera, dir, angRadius, name, info) {
    const W = window.innerWidth, H = window.innerHeight;
    const v = this._v.copy(dir).applyQuaternion(this._q.copy(camera.quaternion).invert());     // into the view's frame (-z ahead)
    const tanHalf = Math.tan(camera.fov * Math.PI / 360), aspect = W / H;
    const ahead = -v.z;
    let x = 0, y = 0, onScreen = false;
    if (ahead > 1e-6) {
      x = (v.x / ahead) / (tanHalf * aspect); y = (v.y / ahead) / tanHalf;      // -1..1 across the view
      const px = (x * 0.5 + 0.5) * W, py = (0.5 - y * 0.5) * H;
      onScreen = px > MARGIN && px < W - MARGIN && py > MARGIN && py < H - MARGIN;
      x = px; y = py;
    }
    if (this.root.classList.contains('hidden')) this.root.classList.remove('hidden');
    this.visible = true;
    const s = this.root.style;
    if (onScreen) {
      // brackets as large as the target looks (a few pixels at least), none once it fills the view
      const r = Math.min(H, Math.max(9, Math.tan(Math.min(angRadius, 1.4)) / tanHalf * H * 0.5 + 4));
      const big = r > H * 0.42;
      this.box.style.display = big ? 'none' : '';
      this.box.style.width = this.box.style.height = `${(2 * r).toFixed(0)}px`;
      this.box.style.transform = `translate(${(-r).toFixed(1)}px, ${(-r).toFixed(1)}px)`;
      this.label.style.transform = `translate(-50%, ${big ? 8 : (r + 6).toFixed(1)}px)`;
      this.arrow.style.display = 'none';
      s.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    } else {
      // Off screen: the arrow sits on the edge, on the line from the centre toward it
      // (straight behind counts as below).
      let dx = v.x, dy = v.y;
      if (Math.hypot(dx, dy) < 1e-6) { dx = 0; dy = -1; }
      const cx = W / 2, cy = H / 2, hx = cx - MARGIN, hy = cy - MARGIN;
      const k = Math.min(hx / Math.max(Math.abs(dx), 1e-9), hy / Math.max(Math.abs(dy), 1e-9));
      x = cx + dx * k; y = cy - dy * k;
      const ang = Math.atan2(-dy, dx);
      this.box.style.display = 'none';
      this.arrow.style.display = '';
      this.arrow.style.transform = `translate(-50%, -50%) rotate(${ang.toFixed(3)}rad)`;
      // the label just inside the arrow, toward the centre of the screen
      const n = Math.hypot(dx, dy), ox = -dx / n * 46, oy = dy / n * 26;
      this.label.style.transform = `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px))`;
      s.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    const text = name + '|' + info;
    if (text !== this.text) { this.text = text; this.name.textContent = name; this.info.textContent = info; }
  }
}
