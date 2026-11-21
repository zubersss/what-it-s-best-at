// Makes the clouds' noise off the main thread (cloudNoiseData.js) and hands it back.
import { cloudNoiseData } from './cloudNoiseData.js';
self.onmessage = (ev) => { const d = cloudNoiseData(ev.data.n); self.postMessage({ n: ev.data.n, buffer: d.buffer }, [d.buffer]); };
