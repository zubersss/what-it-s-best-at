// Quadtree nodes of the cube-sphere and the per-frame LOD selection.
import * as THREE from 'three';
import { faceToDir, dirToFace, nodeEdge } from './cubeSphere.js';

const _d = [0, 0, 0], _uv = [0, 0];

export class Node {
  constructor(face, level, ix, iy, parent, hs, relief) {
    this.face = face; this.level = level; this.ix = ix; this.iy = iy; this.parent = parent;
    this.children = null;
    this.slot = -1;            // chunk pool slot, -1 = not loaded
    this.loading = false;
    this.dead = false;
    this.size = 2 / (1 << level);
    this.a0 = -1 + ix * this.size; this.b0 = -1 + iy * this.size;
    this.edge = nodeEdge(level, hs.radius);
    faceToDir(face, this.a0 + this.size / 2, this.b0 + this.size / 2, _d);
    const h = hs.height(_d[0], _d[1], _d[2], this.edge);
    const r = hs.radius + h;
    this.center = new THREE.Vector3(_d[0] * r, _d[1] * r, _d[2] * r);
    // Estimates until the chunk is built and reports exact bounds.
    const margin = Math.min(relief, this.edge * 0.6);
    this.radius = this.edge * 0.72 + margin;
    this.minH = h - margin; this.maxH = h + margin;
    this.lastVisit = 0; this.lastSplit = 0;
    this.childrenLive = false; this.liveAt = 0;     // children drawn instead of this node, and since when
    this.dist = 0; this.inView = false;
  }

  split(hs, relief) {
    const l = this.level + 1, x = this.ix * 2, y = this.iy * 2;
    this.children = [
      new Node(this.face, l, x, y, this, hs, relief), new Node(this.face, l, x + 1, y, this, hs, relief),
      new Node(this.face, l, x, y + 1, this, hs, relief), new Node(this.face, l, x + 1, y + 1, this, hs, relief),
    ];
  }

  // Distance from the camera to (approximately) the closest point of this node.
  distanceTo(cam, camDir, camAlt, radius) {
    if (dirToFace(this.face, camDir[0], camDir[1], camDir[2], _uv)) {
      const a = Math.min(this.a0 + this.size, Math.max(this.a0, _uv[0]));
      const b = Math.min(this.b0 + this.size, Math.max(this.b0, _uv[1]));
      faceToDir(this.face, a, b, _d);
      const r = radius + Math.min(this.maxH, Math.max(this.minH, camAlt));
      const dx = cam.x - _d[0] * r, dy = cam.y - _d[1] * r, dz = cam.z - _d[2] * r;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return Math.max(0, cam.distanceTo(this.center) - this.radius);
  }
}
