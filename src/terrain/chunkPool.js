// Fixed-size pool of chunk GPU resources: one geometry, two textures, one material and
// one mesh per slot, all allocated up front. Nothing here grows after construction.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildIndices, buildGridUVs, vertexCount } from './chunkBuilder.js';

export class ChunkPool {
  constructor(makeMaterial, maxAnisotropy) {
    const G = CONFIG.GRID, T = CONFIG.NORMAL_RES + 1, S = CONFIG.SHADOW_RES + 1, nv = vertexCount(G);
    const index = new THREE.BufferAttribute(buildIndices(G), 1);
    const grid = new THREE.BufferAttribute(buildGridUVs(G), 2);
    this.trianglesPerChunk = index.count / 3;
    this.slots = [];
    this.free = [];
    this.group = new THREE.Group();
    for (let i = 0; i < CONFIG.CHUNK_POOL; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(index);
      geometry.setAttribute('aGrid', grid);
      const pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3); pos.setUsage(THREE.DynamicDrawUsage);
      const hm = new THREE.BufferAttribute(new Float32Array(nv * 2), 2); hm.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', pos);
      geometry.setAttribute('aHM', hm);
      const normalTex = new THREE.DataTexture(new Uint16Array(T * T * 4), T, T, THREE.RGBAFormat, THREE.HalfFloatType);
      normalTex.minFilter = THREE.LinearMipmapLinearFilter; normalTex.magFilter = THREE.LinearFilter;
      normalTex.generateMipmaps = true; normalTex.anisotropy = Math.min(4, maxAnisotropy);
      normalTex.wrapS = normalTex.wrapT = THREE.ClampToEdgeWrapping;
      const shadowTex = new THREE.DataTexture(new Uint8Array(S * S).fill(255), S, S, THREE.RedFormat, THREE.UnsignedByteType);
      shadowTex.minFilter = shadowTex.magFilter = THREE.LinearFilter;
      shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping;
      shadowTex.needsUpdate = true;
      const material = makeMaterial(normalTex, shadowTex);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false; mesh.visible = false;
      this.group.add(mesh);
      this.slots.push({ geometry, normalTex, shadowTex, material, mesh, node: null });
      this.free.push(i);
    }
    // normal map with mips (x4/3) + shadow + vertex data
    this.gpuBytes = CONFIG.CHUNK_POOL * (T * T * 8 * 4 / 3 + S * S + nv * 20) + index.count * 2;
  }

  upload(slotIndex, data) {
    const s = this.slots[slotIndex];
    s.geometry.attributes.position.array.set(data.positions); s.geometry.attributes.position.needsUpdate = true;
    s.geometry.attributes.aHM.array.set(data.attrs); s.geometry.attributes.aHM.needsUpdate = true;
    s.normalTex.image.data = data.normals; s.normalTex.needsUpdate = true;
    this.uploadShadow(slotIndex, data.shadow);
  }

  uploadShadow(slotIndex, shadow) {
    const s = this.slots[slotIndex];
    s.shadowTex.image.data = shadow; s.shadowTex.needsUpdate = true;
  }
}
