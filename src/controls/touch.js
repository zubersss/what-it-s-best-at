// Touch controls for phones (the target device is a Samsung S23 Ultra).
// Left part of the screen: a floating move stick. Rest of the screen: drag to look.
// A small button row maps onto the same actions the keyboard has. This is deliberately
// the only on-screen UI besides the debug HUD.
export class TouchControls {
  // actions: { view(): void }  (bookmark cycling lives in the app)
  constructor(canvas, input, actions) {
    this.canvas = canvas; this.input = input; this.actions = actions;
    this.stickId = null; this.lookId = null;
    this.sx = 0; this.sy = 0; this.lx = 0; this.ly = 0;
    this.enabled = false;
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div id="stick"><div id="knob"></div></div>
      <div id="tbuttons">
        <button data-key="KeyF">FLY</button>
        <button data-key="KeyZ" data-hold="1">ZOOM</button>
        <button data-act="view">VIEW</button>
        <button data-key="KeyH">HUD</button>
        <button data-act="full">FULL</button>
      </div>
      <div id="tupdown">
        <button data-key="Space" data-hold="1">&#9650;</button>
        <button data-key="KeyQ" data-hold="1">&#9660;</button>
      </div>`;
    document.body.appendChild(this.root);
    this.stick = this.root.querySelector('#stick'); this.knob = this.root.querySelector('#knob');

    for (const b of this.root.querySelectorAll('button')) {
      const key = b.dataset.key, hold = b.dataset.hold, act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.setPointerCapture?.(e.pointerId);
        if (key) input.virtualDown(key);
        if (act === 'view') actions.view();
        if (act === 'full') this.fullscreen();
        b.classList.add('on');
      });
      const up = (e) => { e.preventDefault(); if (key && hold) input.virtualUp(key); else if (key) input.virtualUp(key); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.enable();
      e.preventDefault();
      const w = canvas.clientWidth;
      if (e.clientX < w * 0.38 && this.stickId === null) {
        this.stickId = e.pointerId; this.sx = e.clientX; this.sy = e.clientY;
        this.stick.style.left = (e.clientX - 60) + 'px'; this.stick.style.top = (e.clientY - 60) + 'px';
        this.stick.classList.add('on'); this.knob.style.transform = 'translate(0px, 0px)';
      } else if (this.lookId === null) {
        this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
      }
    }, { passive: false });
    const move = (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.sx, dy = e.clientY - this.sy;
        const l = Math.hypot(dx, dy), R = 56;
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.moveX = dx / R; input.moveY = -dy / R;
      } else if (e.pointerId === this.lookId) {
        // look deltas are in the same units as mouse movement
        input.dx += (e.clientX - this.lx) * 1.6; input.dy += (e.clientY - this.ly) * 1.6;
        this.lx = e.clientX; this.ly = e.clientY;
      }
    };
    const end = (e) => {
      if (e.pointerId === this.stickId) { this.stickId = null; input.moveX = 0; input.moveY = 0; this.stick.classList.remove('on'); }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable();
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root.classList.remove('hidden');
    document.body.classList.add('touch');
  }

  async fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      else await document.exitFullscreen();
      await screen.orientation?.lock?.('landscape');
    } catch { /* not allowed on this browser: ignore */ }
    try { this.wake = this.wake || await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
  }
}
