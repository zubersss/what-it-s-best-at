// How many layers of a part of the picture are drawn over each pixel: the part's meshes
// drawn alone into a picture of their own with no depth test, every fragment that
// survives its shader's cut-outs adding one. For scripts/overdraw.mjs (the meter of what
// a forest costs: layers of cut-out pixels) and for anyone at the console:
// __app.overdraw('trees'). Nothing of the game's own picture is touched.
import * as THREE from 'three';

// part: 'trees' | 'farForest' | 'grass' | 'leaves'. Returns { triangles, pixels, mean (layers
// a pixel over the whole picture), covered (share of the picture the part touches),
// meanCovered, max, width, height, layers: Uint8Array (one a pixel, top row first) }.
export function overdraw(app, part) {
  const roots = { trees: () => app.trees.meshes, farForest: () => [app.farForest.mesh], grass: () => [app.grass.mesh], leaves: () => [app.leaves.mesh, app.petals?.mesh].filter(Boolean) }[part]?.();
  if (!roots) return { error: 'no part called ' + part };
  const r = app.renderer, size = r.getDrawingBufferSize(new THREE.Vector2()), w = size.x, h = size.y;
  const scene = new THREE.Scene(), mats = new Map(), made = [];
  let triangles = 0;
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  for (const root of roots) root.traverse((o) => {
    if (!(o.isMesh || o.isPoints) || !shown(o) || !o.material?.fragmentShader) return;
    let m = mats.get(o.material);
    if (!m) {
      m = o.material.clone(); m.uniforms = o.material.uniforms;          // (the very uniforms: where things are this frame)
      m.fragmentShader = o.material.fragmentShader.replace(/fragColor\s*=\s*[^;]+;/g, 'fragColor = vec4(1.0 / 255.0);');
      m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation;
      m.transparent = true; m.depthTest = false; m.depthWrite = false; mats.set(o.material, m); made.push(m);
    }
    const c = new o.constructor(o.geometry, m); c.frustumCulled = false; c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld); c.matrixWorld.copy(o.matrixWorld);
    scene.add(c);
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3, inst = g.isInstancedBufferGeometry ? (Number.isFinite(g.instanceCount) ? g.instanceCount : 1) : 1;
    if (o.isMesh) triangles += n * inst * (g.drawRange.count < Infinity ? Math.min(1, g.drawRange.count / (n * 3)) : 1);
  });
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
  const keep = r.getRenderTarget(), col = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha(), auto = r.autoClear;
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.autoClear = true; r.clear(); r.render(scene, app.rig.camera);
  const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  r.setRenderTarget(keep); r.setClearColor(col, alpha); r.autoClear = auto; rt.dispose(); for (const m of made) m.dispose();
  const layers = new Uint8Array(w * h); let sum = 0, cov = 0, max = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = px[((h - 1 - y) * w + x) * 4]; layers[y * w + x] = v; sum += v; if (v) cov++; if (v > max) max = v; }
  return { triangles: Math.round(triangles), pixels: w * h, mean: sum / (w * h), covered: cov / (w * h), meanCovered: cov ? sum / cov : 0, max, width: w, height: h, layers };
}
