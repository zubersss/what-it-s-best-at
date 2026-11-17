import { PARAMS } from './core/params.js';
import { getWorld } from './worlds/index.js';
import { App } from './app.js';

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.style.display = 'flex';
  el.textContent = msg;
  window.__shotError = msg;
  console.error(msg);
}

async function main() {
  const canvas = document.getElementById('view');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return fatal('WebGL 2 is required and is not available in this browser.');
  if (!gl.getExtension('EXT_color_buffer_float')) return fatal('This GPU/driver cannot render to float textures (EXT_color_buffer_float).');
  const world = getWorld(PARAMS.world);
  const app = new App({ canvas, context: gl, world, params: PARAMS });
  window.__app = app;
  await app.init();
  app.start();
}

main().catch((e) => fatal(String(e?.stack || e)));
