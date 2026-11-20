// What the game remembers between visits, in the browser's own storage (nothing leaves
// the device): the places found, where the traveller last stood on each world, and the
// sound switch. One JSON value; a browser that blocks storage simply remembers nothing.
const KEY = 'sse.save.v1';

export class Save {
  constructor() {
    this.data = { found: {}, last: {}, sound: true };
    try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(this.data, JSON.parse(raw)); } catch { /* blocked or damaged: start afresh */ }
    if (typeof this.data.found !== 'object' || !this.data.found) this.data.found = {};
    if (typeof this.data.last !== 'object' || !this.data.last) this.data.last = {};
    this._dirty = false; this._since = 0;
  }

  // A place found: true if it was new. key = '<world>/<place id>'.
  find(key, when) {
    if (this.data.found[key]) return false;
    this.data.found[key] = when; this.touch(true);
    return true;
  }
  has(key) { return !!this.data.found[key]; }
  get count() { return Object.keys(this.data.found).length; }

  touch(now = false) { this._dirty = true; if (now) this.flush(); }
  // Called every frame with the time since the last: writes at most every few seconds.
  tick(dt) { this._since += dt; if (this._dirty && this._since > 4) this.flush(); }
  flush() {
    this._dirty = false; this._since = 0;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage blocked: nothing is kept */ }
  }
  clear() { this.data = { found: {}, last: {}, sound: this.data.sound, gov: this.data.gov }; this.flush(); }
}
