// ---------------------------------------------------------------------------
// Geometry helpers: world-UV boxes (UVs in metres so textures never stretch),
// window attribute for facades, and a static batcher that merges geometry per
// material and per spatial tile to keep draw calls low.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Axis aligned box with metre UVs.
 * opts.win: add window flag on side faces; opts.seed: per building variation;
 * opts.bay: window bay width used to centre the pattern on each face.
 */
export function boxGeo(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
  const win = opts.win ? 1 : 0;
  const seed = opts.seed || 0;
  const bay = opts.bay || 3;
  const baseY = opts.baseY !== undefined ? opts.baseY : minY;
  const pos = [], nor = [], uv = [], aw = [], idx = [];
  const face = (p0, p1, p2, p3, n, uvs, isSide) => {
    const i = pos.length / 3;
    for (const p of [p0, p1, p2, p3]) pos.push(p[0], p[1], p[2]);
    for (let k = 0; k < 4; k++) { nor.push(n[0], n[1], n[2]); aw.push(isSide ? win : 0, seed); }
    for (const u of uvs) uv.push(u[0], u[1]);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  // fit a whole number of window bays on each face so windows never get cut at corners
  const fit = (len) => (win ? (Math.max(1, Math.round(len / bay)) * bay) / len : 1);
  const lx = maxX - minX, lz = maxZ - minZ;
  const y0 = minY - baseY, y1 = maxY - baseY;
  const ux = lx * fit(lx), uz = lz * fit(lz);
  face([maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [1, 0, 0],
    [[0, y0], [uz, y0], [uz, y1], [0, y1]], true);
  face([minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [-1, 0, 0],
    [[0, y0], [uz, y0], [uz, y1], [0, y1]], true);
  face([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1],
    [[0, y0], [ux, y0], [ux, y1], [0, y1]], true);
  face([maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1],
    [[0, y0], [ux, y0], [ux, y1], [0, y1]], true);
  // +Y
  face([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0],
    [[minX, -maxZ], [maxX, -maxZ], [maxX, -minZ], [minX, -minZ]], false);
  // -Y
  face([minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0],
    [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]], false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(aw, 2));
  g.setIndex(idx);
  return g;
}

/** Prepare an arbitrary three geometry for merging: indexed + aWin attribute + metre UVs scaled. */
export function prep(geo, uvScale = 1) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const ix = []; for (let i = 0; i < n; i++) ix.push(i);
    geo.setIndex(ix);
  }
  if (uvScale !== 1 && geo.attributes.uv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  }
  if (!geo.attributes.aWin) {
    geo.setAttribute('aWin', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  for (const k of Object.keys(geo.attributes)) {
    if (!['position', 'normal', 'uv', 'aWin'].includes(k)) geo.deleteAttribute(k);
  }
  return geo;
}

/** Cylinder between two points (for pipes, cables, scaffold tubes). */
export function tubeBetween(a, b, radius, radial = 8, uvLen = 1) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(radius, radius, len, radial, 1, false);
  // metre-ish UVs: u around circumference, v along length
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * radius / uvLen, uv.getY(i) * len / uvLen);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return prep(g);
}

export class StaticBatch {
  constructor(tile = 140) {
    this.tile = tile;
    this.buckets = new Map(); // key -> {mat, geos, cast, receive}
  }

  add(geo, mat, { cast = true, receive = true } = {}) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    const tx = Math.floor(c.x / this.tile), tz = Math.floor(c.z / this.tile);
    const key = `${mat.uuid}|${tx}|${tz}|${cast ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) { b = { mat, geos: [], cast, receive }; this.buckets.set(key, b); }
    b.geos.push(geo);
  }

  box(minX, minY, minZ, maxX, maxY, maxZ, mat, opts = {}) {
    this.add(boxGeo(minX, minY, minZ, maxX, maxY, maxZ, opts), mat, opts);
  }

  build(parent) {
    const meshes = [];
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      if (!merged) { console.warn('merge failed'); continue; }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes.push(mesh);
      for (const g of b.geos) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}
