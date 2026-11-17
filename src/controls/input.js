// Keyboard + mouse state. No game logic here.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // keys that went down since the last endFrame()
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.moveX = 0; this.moveY = 0;       // analogue move stick (touch), -1..1
    this.locked = false;
    this.dragging = false;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.sourceCapabilities?.firesTouchEvents) return;       // synthetic mouse event from a touch
      this.dragging = true;
      if (!this.locked) canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  // Used by the touch buttons: they behave exactly like keys.
  virtualDown(code) { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); }
  virtualUp(code) { this.keys.delete(code); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
