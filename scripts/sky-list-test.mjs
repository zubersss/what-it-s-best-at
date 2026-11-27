// The field's lists asked every frame (src/weather/sky/listClock.js), without a browser, in
// seconds:  node scripts/sky-list-test.mjs [--break hold|nofast]
//
// The live storm cells and their anvils are asked for every frame (the sky system's cell
// uniforms). The model works out a whole moment for each new t (1.6 ms at the storm's hour in
// Node), so the field asks it at moments two seconds apart and blends between them. Promises:
//   1. THE SAME CLOUDS. At Haven's storm hour, its front and two more, through 20 s of frames at
//      30 a second, forwards and backwards: every cell within 5 cm of where the model puts it at
//      that very t, its strength within 0.005 and its top within 0.5 m; every anvil's ends within
//      5 cm; the same cells (a cell in one list only is one being born or ending, strength < 0.02).
//   2. ASKED SELDOM. At an ordinary clock, 20 s of frames ask the model at most 13 times (it was
//      600); with the clock at an hour a second, never more than once a frame (it was once).
// Fails (exit 1) on any broken promise; --break puts a fault in to see its check fail.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldLayout } from '../src/weather/sky/format.js';
import { makeProducer } from '../src/weather/sky/producer.js';
import { readWxLand } from '../src/weather/sky/land.js';
import { Steer } from '../src/weather/sky/steer.js';
import { ListClock, blendLists } from '../src/weather/sky/listClock.js';
import haven from '../src/worlds/haven.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BREAK = (() => { const i = process.argv.indexOf('--break'); return i > 0 ? process.argv[i + 1] : null; })();

const buf = readFileSync(path.join(root, 'public/data/haven_dem_4096.i16'));
const dem = { data: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1), width: 4096, height: 2048 };
const wxland = readWxLand(readFileSync(path.join(root, 'public/data/haven_wxland_1024.u8')), JSON.parse(readFileSync(path.join(root, 'public/data/haven_peaks.json'), 'utf8')).peaks);
const weather = haven.weather, R = haven.radius;
const producer = makeProducer({ weather, radius: R, dayHours: 24, origin: haven.scene.start, layout: fieldLayout({ weather }), land: dem, wxland });
const steer = new Steer(weather, R);
const tAt = (hours) => steer.t(new Date(Date.parse(haven.scene.dateUTC) + hours * 3600e3));

class Faulty extends ListClock {
  at(t) {
    if (BREAK === 'hold') { const k = Math.floor(t / this.step); return this._moment(k).map((x) => ({ ...x })); }       // no blend: the list of the moment before
    if (BREAK === 'nofast') { const k = Math.floor(t / this.step), w = t / this.step - k; return blendLists(this._moment(k), this._moment(k + 1), w); }   // two asks a frame on a fast clock
    return super.at(t);
  }
}
const clockOf = (ask) => (BREAK ? new Faulty(ask) : new ListClock(ask));

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const dist = (a, b) => R * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);      // (a cell's place: a unit vector)
const metres = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);           // (an anvil's ends: in metres)

// 1. the same clouds
for (const [name, hours] of [['storm', 8.25], ['front', 33], ['noon', 4], ['evening', 11]]) {
  for (const dir of [1, -1]) {
    const cells = clockOf((t) => producer.cells(t)), anvils = clockOf((t) => producer.anvils(t));
    const t0 = tAt(hours);
    let pos = 0, str = 0, top = 0, apos = 0, odd = 0, n = 0, na = 0;
    for (let f = 0; f < 600; f++) {
      const t = t0 + dir * f / 30;
      const got = cells.at(t), want = producer.cells(t);
      const byId = new Map(want.map((c) => [c.id, c]));
      for (const c of got) {
        const w = byId.get(c.id);
        if (!w) { if (c.strength >= 0.02) odd++; continue; }
        byId.delete(c.id); n++;
        pos = Math.max(pos, dist([c.x, c.y, c.z], [w.x, w.y, w.z])); str = Math.max(str, Math.abs(c.strength - w.strength)); top = Math.max(top, Math.abs(c.top - w.top));
      }
      for (const w of byId.values()) if (w.strength >= 0.02) odd++;
      const ga = anvils.at(t), wa = new Map(producer.anvils(t).map((a) => [a.id, a]));
      for (const a of ga) { const w = wa.get(a.id); if (!w) continue; na++; apos = Math.max(apos, metres(a.from, w.from), metres(a.to, w.to)); }
    }
    check(n > 0 && pos < 0.05 && str < 0.005 && top < 0.5 && odd === 0 && apos < 0.05,
      `${name} (${dir > 0 ? 'forwards' : 'backwards'}): ${n} cells and ${na} anvils compared, a cell ${(pos * 100).toFixed(2)} cm from the model's place at most, strength ${str.toFixed(4)}, top ${top.toFixed(3)} m, anvil ends ${(apos * 100).toFixed(2)} cm, ${odd} cells in one list only`);
  }
}

// 2. asked seldom
{
  let asks = 0; const c = clockOf((t) => { asks++; return producer.cells(t); });
  const t0 = tAt(8.25);
  for (let f = 0; f < 600; f++) c.at(t0 + f / 30);
  check(asks <= 13, `an ordinary clock: 600 frames asked the model ${asks} times (at most 13)`);
  let fast = 0, worst = 0; const c2 = clockOf((t) => { fast++; return producer.cells(t); });
  for (let f = 0; f < 120; f++) { const before = fast; c2.at(t0 + f * 120); worst = Math.max(worst, fast - before); }
  check(worst <= 1, `an hour a second: at most ${worst} ask(s) in a frame (at most 1)`);
  // a clock that slows from fast to ordinary settles into the blend
  let slow = 0; const c3 = clockOf((t) => { slow++; return producer.cells(t); });
  for (let f = 0; f < 30; f++) c3.at(t0 + f * 120);
  const s0 = slow;
  for (let f = 0; f < 300; f++) c3.at(t0 + 3600 + f / 30);
  check(slow - s0 <= 8, `fast, then ordinary: 300 ordinary frames asked ${slow - s0} times (at most 8)`);
}

if (failed) { console.log(`sky-list-test: ${failed} failed`); process.exit(1); }
console.log('sky-list-test: all passed');
