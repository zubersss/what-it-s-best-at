// How many layers of grass lie over each other in a view of the real game, and how many
// triangles the grass hands to the GPU. The grass is drawn alone, every fragment adding one
// to its pixel (additive, no depth test), and the picture is read back.
//
//   node scripts/grass-layers.mjs [--world haven] [--shot ledge] [--query "lat=..&lon=.."]
//        [--distdir build] [--size 660x309] [--timeout 1700] [--out layers.png]
//
// Three counts, each a mean over the pixels that have any grass ("grass pixels"):
//   raster: every fragment the triangles make, the ones a cut-out throws away included
//           (what a GPU that cannot reject early must run the fragment shader for);
//   drawn:  the fragments that are kept (a cut-out's holes not counted): the layers of
//           grass one would see through if each were glass;
//   shaded: the fragments that pass the depth test in the order the game draws them
//           (what is shaded when the depth test can reject before shading).
// ... for the whole grass and for each of its fields; and the share of the picture that is grass.
// --out: the 'drawn' count as a picture (black none, white 32 layers and more).
import { open, opt } from './lib/browser.mjs';
import { encodePNG } from './lib/png.mjs';
import { writeFile } from 'node:fs/promises';

const world = opt('world', 'haven'), shot = opt('shot', 'ledge'), query = opt('query', '');
const timeout = +opt('timeout', 1700) * 1000, out = opt('out', null);
const [W, H] = opt('size', '660x309').split('x').map(Number);
const { base, page, goto, close, errors } = await open({ dist: true, width: W, height: H, dsf: 1 });
let failed = false;
try {
  await goto(`${base}?world=${world}&shot=${shot}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout, polling: 500 });
  const res = await page.evaluate(() => {
    const a = window.__app, g = a.grass, r = a.renderer, gl = r.getContext(), cam = a.rig.camera;
    const fields = [...(g.fields || []), ...(g.clumps || []), ...(g.mids || []), ...(g.flowers || [])].filter((f, i, all) => f && f.mesh && all.indexOf(f) === i);
    const name = (f) => (g.clumps || []).includes(f) ? 'clumps' : (g.mids || []).includes(f) ? 'tufts' : (g.flowers || []).includes(f) || /aPart/.test(f.mesh.material.vertexShader) ? 'flowers' : 'blades';
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, n = w * h;
    const scene = new a.nearScene.constructor(), parent = g.mesh.parent;
    // (a picture of its own with a depth buffer: the canvas has none)
    const own = new a.post.scene.constructor(w, h, { depthBuffer: true });
    const keep = fields.map((f) => ({ m: f.mesh.material, fs: f.mesh.material.fragmentShader, blending: f.mesh.material.blending, dt: f.mesh.material.depthTest, dw: f.mesh.material.depthWrite, vis: f.mesh.visible }));
    scene.add(g.mesh);
    const count = (which, mode) => {
      fields.forEach((f, i) => {
        const m = f.mesh.material;
        let fs = keep[i].fs.replace(/fragColor\s*=\s*vec4\([^;]*;/g, 'fragColor = vec4(vec3(1.0 / 255.0), 1.0);');
        if (mode === 'raster') fs = fs.replace(/\bdiscard\b/g, '');
        m.fragmentShader = fs; m.blending = 2; m.depthTest = mode === 'shaded'; m.depthWrite = mode === 'shaded'; m.needsUpdate = true;
        f.mesh.visible = keep[i].vis && (which < 0 || which === i);
      });
      const tgt = r.getRenderTarget(), ac = r.autoClear;
      r.setRenderTarget(own); r.autoClear = true; r.setClearColor(0x000000, 1); r.clear(true, true, true);
      r.render(scene, cam);
      const px = new Uint8Array(n * 4); r.readRenderTargetPixels(own, 0, 0, w, h, px);
      r.setRenderTarget(tgt); r.autoClear = ac;
      const c = new Uint8Array(n); for (let i = 0; i < n; i++) c[i] = px[i * 4];
      return c;
    };
    const sum = (c) => { let s = 0, k = 0, top = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (c[i]) k++; if (c[i] > top) top = c[i]; } return { s, k, top }; };
    const rows = [];
    const all = { raster: count(-1, 'raster'), drawn: count(-1, 'drawn'), shaded: count(-1, 'shaded') };
    const gp = sum(all.drawn).k || 1;
    rows.push({ name: 'all grass', tris: g.triangles, inst: g.instances, raster: sum(all.raster).s / gp, drawn: sum(all.drawn).s / gp, shaded: sum(all.shaded).s / gp, top: sum(all.drawn).top, share: gp / n });
    fields.forEach((f, i) => {
      if (!keep[i].vis) return;
      const ra = sum(count(i, 'raster')), d = sum(count(i, 'drawn'));
      rows.push({ name: `${name(f)} ${f.f.spacing} m`, tris: f.geo.instanceCount * f.tris, inst: f.geo.instanceCount, raster: ra.s / gp, drawn: d.s / gp, top: d.top, share: d.k / n });
    });
    fields.forEach((f, i) => { const m = f.mesh.material, k = keep[i]; m.fragmentShader = k.fs; m.blending = k.blending; m.depthTest = k.dt; m.depthWrite = k.dw; m.needsUpdate = true; f.mesh.visible = k.vis; });
    parent.add(g.mesh); own.dispose();
    return { rows, w, h, drawn: Array.from(all.drawn) };
  });
  console.log(`${world} ${shot} ${query}   (${res.w} x ${res.h})`);
  console.log('field              triangles  instances   raster   drawn  shaded   most   share of picture');
  for (const r of res.rows) console.log(`${r.name.padEnd(18)} ${String(r.tris).padStart(9)}  ${String(r.inst).padStart(9)}  ${r.raster.toFixed(2).padStart(7)} ${r.drawn.toFixed(2).padStart(7)} ${(r.shaded == null ? '' : r.shaded.toFixed(2)).padStart(7)} ${String(r.top).padStart(6)}   ${(100 * r.share).toFixed(1)} %`);
  console.log('(layers: per pixel that has any grass; a field\'s rows are its share of that mean)');
  if (out) {
    const rgb = new Uint8Array(res.w * res.h * 3);
    for (let y = 0; y < res.h; y++) for (let x = 0; x < res.w; x++) { const v = Math.min(255, res.drawn[(res.h - 1 - y) * res.w + x] * 8), o = (y * res.w + x) * 3; rgb[o] = rgb[o + 1] = rgb[o + 2] = v; }
    await writeFile(out, encodePNG(res.w, res.h, rgb));
  }
  if (errors.length) { console.log('PAGE ERRORS: ' + errors.slice(0, 3).join(' | ')); failed = true; }
} catch (e) { console.log('FAILED: ' + String(e).split('\n')[0]); failed = true; }
await close();
process.exit(failed ? 1 : 0);
