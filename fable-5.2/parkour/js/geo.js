// ============================================================================
// geo.js — tiny helper for building merged static geometry (boxes, quads)
// with world-scale UVs and per-vertex tint. One GeoBuilder = one draw call.
// ============================================================================
import * as THREE from 'three';

export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
  get empty() { return this.idx.length === 0; }

  /** quad a,b,c,d (counter-clockwise seen from outside), uv = [u0,v0,u1,v1,u2,v2,u3,v3] */
  quad(a, b, c, d, uv, col = WHITE) {
    const i = this.p.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    this.uv.push(...uv);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** axis-aligned box, UVs in metres / tile. faces: any of x X y Y z Z (lower = min side) */
  box(x0, x1, y0, y1, z0, z1, { tile = 1, col = WHITE, faces = 'xXyYzZ', vOff = 0 } = {}) {
    const t = 1 / tile, v0 = (y0 + vOff) * t, v1 = (y1 + vOff) * t;
    if (faces.includes('X')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [-z1 * t, v0, -z0 * t, v0, -z0 * t, v1, -z1 * t, v1], col);
    if (faces.includes('x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [z0 * t, v0, z1 * t, v0, z1 * t, v1, z0 * t, v1], col);
    if (faces.includes('Z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0 * t, v0, x1 * t, v0, x1 * t, v1, x0 * t, v1], col);
    if (faces.includes('z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [-x1 * t, v0, -x0 * t, v0, -x0 * t, v1, -x1 * t, v1], col);
    if (faces.includes('Y')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0 * t, z1 * t, x1 * t, z1 * t, x1 * t, z0 * t, x0 * t, z0 * t], col);
    if (faces.includes('y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0 * t, z0 * t, x1 * t, z0 * t, x1 * t, z1 * t, x0 * t, z1 * t], col);
  }

  /** append a transformed BufferGeometry (position/normal/uv) */
  mesh(geo, matrix, col = WHITE) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix), v = new THREE.Vector3();
    const base = this.p.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix); this.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.c.push(col[0], col[1], col[2]);
      this.idx.push(base + i);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
const WHITE = [1, 1, 1];

/** A set of GeoBuilders keyed by material; flush() turns each into one shadow-casting mesh. */
export class Batch {
  constructor(materials, parent) { this.mats = materials; this.parent = parent; this.geo = new Map(); }
  g(key) { let b = this.geo.get(key); if (!b) this.geo.set(key, b = new GeoBuilder()); return b; }
  flush() {
    const out = [];
    for (const [key, b] of this.geo) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.build(), key.endsWith('@rv') ? this.mats.rv(key.slice(0, -3)) : this.mats.get(key));
      m.castShadow = m.receiveShadow = true; m.name = key;
      this.parent.add(m); out.push(m);
    }
    this.geo.clear();
    return out;
  }
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
