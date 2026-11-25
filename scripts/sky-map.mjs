// What stands where in a view of the sky, without a browser and in a second: the world's own
// weather model cast along the view's own rays, printed as a map of letters. For choosing views,
// and for telling what a thing in a picture IS before changing anything (the anvil lid over the
// storm view and the empty fair view were both settled with this, each in a second, where a
// picture is ten minutes).
//   node scripts/sky-map.mjs [--world haven] [--t 8.25] [--view "lat,lon,alt,heading,pitch,fov"]
//                            [--reach 16000] [--wide 72] [--high 22]
// A anvil (over half), a its torn edge; C low cloud the volume draws (within the reach), c thin;
// L low cloud beyond the reach (the far shell draws it), l thin; V a thick mid veil, v a thin one;
// h high cloud; . thin mid cloud; space clear.
import { skyModel, cameraAt, rayOf, onShell } from './lib/skyModel.mjs';
import { anvilGeometry, anvilCover } from '../src/weather/sky/cellShape.js';
import { makeSkyAt } from '../src/weather/sky/format.js';
import { opt } from './lib/browser.mjs';

const { world, prod, tOf, R } = await skyModel(opt('world', 'haven'));
const t = tOf(+opt('t', '8.25'));
const [lat, lon, alt, head, pitch, fov] = (opt('view', '-51.1478,33.5441,3000,243,6,55')).split(',').map(Number);
const reach = +opt('reach', String(world.clouds?.volume?.reach ?? 16000));
const W = +opt('wide', '72'), H = +opt('high', '22');
const out = makeSkyAt();
const anv = (prod.anvils ? prod.anvils(t) : []).map((a) => anvilGeometry(a, R));
const cam = cameraAt(R, lat, lon, alt, head, pitch);
console.log(`${world.name || world.id} at t=${opt('t', '8.25')} h from ${lat}, ${lon}, ${alt} m, heading ${head}, pitch ${pitch}, fov ${fov}`);
console.log(`${prod.cells(t).length} cells, ${anv.length} anvils${anv.length ? ` (radii ${anv.map((a) => Math.round(a.radius / 100) / 10).join(', ')} km at ${Math.round(anv[0].L - R)} m)` : ''}`);
console.log('A/a anvil, C/c the volume\'s low cloud, L/l the far shell\'s, V/v mid veil, h high, . thin mid, space clear');
for (let y = 0; y < H; y++) {
  let line = '';
  for (let x = 0; x < W; x++) {
    const d = rayOf(cam, (x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2, fov);
    const high = onShell(cam, d, R, 9000), mid = onShell(cam, d, R, 5000);
    let an = 0;
    if (high) for (const A of anv) an = Math.max(an, anvilCover(A, high.dir));
    const midC = mid ? prod.at(mid.pos, t, out).field.mid : 0;
    const highC = high ? prod.at(high.pos, t, out).field.high : 0;
    // the low layer, where the ray crosses the heights its masses can stand at
    let low = 0, dist = 0;
    for (const h of [1500, 2000, 2500, 3000, 3500, 4000]) {
      const s = onShell(cam, d, R, h);
      if (!s) continue;
      const a = prod.at(s.pos, t, out);
      if (h < a.field.base || h > a.field.base + a.field.thick) continue;
      const c = Math.max(a.field.heap, a.field.sheet);
      if (c > low) { low = c; dist = s.dist; }
    }
    const near = low > 0.1 && dist < reach;
    line += an > 0.5 ? 'A' : an > 0.05 ? 'a'
      : near ? (low > 0.5 ? 'C' : 'c') : low > 0.5 ? 'L' : low > 0.1 ? 'l'
        : midC > 0.85 ? 'V' : midC > 0.45 ? 'v' : highC > 0.5 ? 'h' : midC > 0.1 ? '.' : ' ';
  }
  console.log('|' + line + '|');
}
