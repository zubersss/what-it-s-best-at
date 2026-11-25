// The trees nearest the eye in the real game, at any world and view: species, distance,
// height, which make each is drawn with (close, near, far cards), and the trunk's colour.
// For finding what a tree in a picture is. (No picture is taken.)
//   node scripts/tree-probe.mjs --distdir <build> --world earth --shot ledge [--query "lat=..&lon=.."] [--seconds 900] [--n 8]
import { open, opt } from './lib/browser.mjs';
const { base, page, goto, close } = await open({ dist: true });
await goto(`${base}?world=${opt('world', 'haven')}&shot=${opt('shot', 'ledge')}&${opt('query', '')}`);
const secs = +opt('seconds', 900), t0 = Date.now();
while ((Date.now() - t0) / 1000 < secs) {
  if (await page.evaluate(() => window.__shotReady === true || !!window.__shotError)) break;
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(JSON.stringify(await page.evaluate(async (n) => {
  const a = window.__app, t = a.trees, { SPECIES } = await import(Array.from(document.scripts).map((s) => s.src).find((s) => s.includes('index')) || '').catch(() => ({}));
  const p = a.rig.pos, A = t.anchor, ex = p.x - A.x, ey = p.y - A.y, ez = p.z - A.z;
  const rows = (t._list || []).map((e) => ({ e, d: Math.hypot(e.x - ex, e.y - ey, e.z - ez) })).sort((x, y) => x.d - y.d).slice(0, 60);
  const make = (e) => { for (const trio of t.sets.flat()) for (const s of trio) { if (s.lod === 2 && !e.far) continue; for (let i = 0; i < s.count; i++) if (Math.abs(s.iA.array[i * 4] - e.x) < 1e-3 && Math.abs(s.iA.array[i * 4 + 1] - e.y) < 1e-3 && Math.abs(s.iA.array[i * 4 + 2] - e.z) < 1e-3) return ['close', 'near', 'far'][s.lod] + ' (shape ' + t.sets.indexOf(t.sets.find((v) => v.includes(trio))) + ')'; } return 'none'; };
  return { agl: a.rig.agl, count: t.count, names: t.names, fraction: t.fraction, closeOn: t.closeOn, trees: rows.filter(({ e, d }) => true).map(({ e, d }) => { const T = e.b.trees, q = e.q; const rx = e.x - ex, ry = e.y - ey, rz = e.z - ez, f = a.rig.forward, u = p.clone().normalize(), fx = f.x - u.x * (f.x * u.x + f.y * u.y + f.z * u.z), fy = f.y - u.y * (f.x * u.x + f.y * u.y + f.z * u.z), fz = f.z - u.z * (f.x * u.x + f.y * u.y + f.z * u.z), rgt = [fy * u.z - fz * u.y, fz * u.x - fx * u.z, fx * u.y - fy * u.x];
        const along = rx * fx + ry * fy + rz * fz, side = rx * rgt[0] + ry * rgt[1] + rz * rgt[2], fl = Math.hypot(fx, fy, fz), rl = Math.hypot(...rgt);
        return { d: +d.toFixed(1), tall: +T[q + 3].toFixed(1), species: T[q + 6], make: make(e), bearing: +(Math.atan2(side / rl, along / fl) * 180 / Math.PI).toFixed(1) }; }) };
}, +opt('n', 8)), null, 1));
await close();
