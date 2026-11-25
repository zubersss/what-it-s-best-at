// Makes the sky's snapshots off the page (a stub snapshot takes 0.2 to 0.35 s): sky/skyField.js
// asks for one time at a time and gets the snapshot's buffers back, transferred.
//   { kind: 'init', id, opts }   (opts: sky/skyProducer.js makeProducer's)
//   { kind: 'snap', id, t }   ->  { kind: 'snap', id, t, s }
import { makeProducer } from './skyProducer.js';
import { snapshotTransfer } from '../weather/sky/format.js';

let producer = null, id = -1;
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.kind === 'init') { producer = makeProducer(m.opts); id = m.id; return; }
  if (m.kind === 'snap' && producer && m.id === id) {
    const s = producer.snapshot(m.t);
    self.postMessage({ kind: 'snap', id, t: m.t, s }, snapshotTransfer(s));
  }
};
