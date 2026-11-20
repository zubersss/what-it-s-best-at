// Fixed-size pool of chunk GPU resources, all allocated up front: four texture arrays with
// one layer per slot (vertices, morph heights, normal map with its mip maps, baked shadow)
// and ONE mesh that draws every visible chunk as an instance. Nothing grows after
// construction.
//
// Why one draw call: with a mesh, a material and four textures of its own per chunk, the
// page spent half of its time per frame handing about 190 draw calls to the GPU (third
// phone benchmark: 7 to 9 ms of a 16.8 ms frame). An instance costs sixteen numbers.
// Why the textures are filled by hand (WebGL calls, not three's uploader): three uploads a
// changed texture at the draw call that first uses it, in the middle of the scene's render
// pass, and has the GPU build the mip maps there: a second render job, for which a phone's
// tile-based GPU must write the half-drawn picture out and read it back. Every frame that
// took in a new chunk came late on the test phone. Here a chunk is uploaded between
// frames, mip maps included (the worker makes them), one layer of each array.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildIndices, buildGridUVs, vertexLayer, mipSizes } from './chunkBuilder.js';

export const INSTANCE_FLOATS = 16;       // per drawn chunk (see terrain.js and the vertex shader)

export class ChunkPool {
  constructor(renderer, makeMaterial) {
    const gl = renderer.getContext(), N = CONFIG.CHUNK_POOL;
    const G = CONFIG.GRID, T = CONFIG.NORMAL_RES + 1, S = CONFIG.SHADOW_RES + 1;
    const [VW, VH] = vertexLayer(G);
    this.gl = gl; this.renderer = renderer; this.T = T; this.S = S; this.VW = VW; this.VH = VH;
    this.mips = mipSizes(T);
    const an = renderer.extensions.get('EXT_texture_filter_anisotropic');
    const make = (internal, w, h, levels, min, mag, aniso) => {
      const tex = gl.createTexture();
      renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, w, h, N);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, min); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, mag);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso > 1 && an) gl.texParameterf(gl.TEXTURE_2D_ARRAY, an.TEXTURE_MAX_ANISOTROPY_EXT, aniso);
      renderer.state.unbindTexture();
      return tex;
    };
    this.glNormal = make(gl.RGBA16F, T, T, this.mips.length, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, Math.min(4, renderer.capabilities.getMaxAnisotropy()));
    this.glShadow = make(gl.R8, S, S, 1, gl.LINEAR, gl.LINEAR, 1);
    this.glVert = make(gl.RGBA32F, VW, VH, 1, gl.NEAREST, gl.NEAREST, 1);
    this.glMorph = make(gl.R32F, VW, VH, 1, gl.NEAREST, gl.NEAREST, 1);
    // three binds these as they are and never uploads to them
    this.normalTex = new THREE.ExternalTexture(this.glNormal); this.shadowTex = new THREE.ExternalTexture(this.glShadow);
    this.vertTex = new THREE.ExternalTexture(this.glVert); this.morphTex = new THREE.ExternalTexture(this.glMorph);

    const index = new THREE.BufferAttribute(buildIndices(G), 1);
    this.trianglesPerChunk = index.count / 3;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(index);
    geometry.setAttribute('aGrid', new THREE.BufferAttribute(buildGridUVs(G), 2));
    this.instances = new Float32Array(CONFIG.MAX_RENDER_CHUNKS * INSTANCE_FLOATS);
    this.instanceBuffer = new THREE.InstancedInterleavedBuffer(this.instances, INSTANCE_FLOATS, 1);
    this.instanceBuffer.setUsage(THREE.DynamicDrawUsage);
    for (let k = 0; k < INSTANCE_FLOATS / 4; k++) geometry.setAttribute('aI' + k, new THREE.InterleavedBufferAttribute(this.instanceBuffer, 4, k * 4));
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.material = makeMaterial(this);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;

    this.slots = [];
    this.free = [];
    for (let i = 0; i < N; i++) {
      // verts / morph: the CPU's copy of the chunk's vertex layers (for drawnHeight)
      this.slots.push({ node: null, verts: null, morph: null, morphX: 1e15, fade: 0, detail: [0, 0, 1], face: 0 });
      this.free.push(i);
    }
    // normal map with its mips + shadow + vertex layers
    const mipTexels = this.mips.reduce((a, n) => a + n * n, 0);
    this.gpuBytes = N * (mipTexels * 8 + S * S + VW * VH * 20) + index.count * 2;
  }

  // How many instances the next draw has (0 hides the mesh); the first n * INSTANCE_FLOATS
  // numbers of `instances` are sent.
  setCount(n) {
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) { this.instanceBuffer.clearUpdateRanges(); this.instanceBuffer.addUpdateRange(0, n * INSTANCE_FLOATS); this.instanceBuffer.needsUpdate = true; }
  }

  _begin() {
    const gl = this.gl, st = this.renderer.state;
    st.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); st.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); st.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  upload(slotIndex, data) {
    const gl = this.gl, st = this.renderer.state, s = this.slots[slotIndex], A = gl.TEXTURE_2D_ARRAY;
    s.verts = data.verts; s.morph = data.morph;
    this._begin();
    st.bindTexture(A, this.glNormal);
    for (let l = 0, at = 0; l < this.mips.length; l++) {
      const n = this.mips[l];
      gl.texSubImage3D(A, l, 0, 0, slotIndex, n, n, 1, gl.RGBA, gl.HALF_FLOAT, data.normals, at);
      at += n * n * 4;
    }
    st.bindTexture(A, this.glVert);
    gl.texSubImage3D(A, 0, 0, 0, slotIndex, this.VW, this.VH, 1, gl.RGBA, gl.FLOAT, data.verts);
    st.bindTexture(A, this.glMorph);
    gl.texSubImage3D(A, 0, 0, 0, slotIndex, this.VW, this.VH, 1, gl.RED, gl.FLOAT, data.morph);
    st.bindTexture(A, this.glShadow);
    gl.texSubImage3D(A, 0, 0, 0, slotIndex, this.S, this.S, 1, gl.RED, gl.UNSIGNED_BYTE, data.shadow);
    st.unbindTexture();
  }

  uploadShadow(slotIndex, shadow) {
    const gl = this.gl, st = this.renderer.state, A = gl.TEXTURE_2D_ARRAY;
    this._begin();
    st.bindTexture(A, this.glShadow);
    gl.texSubImage3D(A, 0, 0, 0, slotIndex, this.S, this.S, 1, gl.RED, gl.UNSIGNED_BYTE, shadow);
    st.unbindTexture();
  }
}
