// A few identical workers; each runs one job at a time. The caller decides what to run
// next (it re-prioritises every frame), so there is no queue in here to go stale.
export class WorkerPool {
  constructor(count, initMessage) {
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    this.ready = Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
      const w = new Worker(new URL('./chunkWorker.js', import.meta.url), { type: 'module' });
      const slot = { w, busy: false };
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'ready') { resolve(); return; }
        const p = this.pending.get(m.id);
        if (!p) { if (m.type === 'error') console.error(m.message); return; }
        this.pending.delete(m.id);
        slot.busy = false;
        if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
      };
      w.onerror = (e) => reject(new Error('terrain worker failed: ' + e.message));
      w.postMessage(initMessage);
      this.workers.push(slot);
    })));
  }

  get idle() { let n = 0; for (const s of this.workers) if (!s.busy) n++; return n; }
  get busy() { return this.workers.length - this.idle; }

  // Returns a promise for the worker's reply, or null when every worker is busy.
  run(message, transfer = []) {
    const slot = this.workers.find((s) => !s.busy);
    if (!slot) return null;
    slot.busy = true;
    const id = this.nextId++;
    message.id = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      slot.w.postMessage(message, transfer);
    });
  }
}
