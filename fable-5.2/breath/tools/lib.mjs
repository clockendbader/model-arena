// Mesh helpers for the BodyParts3D -> GLB pipeline.
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

// BodyParts3D: mm, +x = body left, +y = posterior, +z = up.
// Scene: 1 unit = 100 mm, +X = body left, +Y = up, +Z = anterior.
export const ORIGIN = { x: 0, y: -115, z: 1250 };
export const SCALE = 0.01;

export function readSTL(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 !== buf.length) throw new Error('not binary STL: ' + file);
  const pos = new Float32Array(n * 9);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12;
    for (let k = 0; k < 9; k++) { pos[i * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return pos;
}

// soup (mm, BP3D axes) -> scene axes
export function toScene(soup) {
  const out = new Float32Array(soup.length);
  for (let i = 0; i < soup.length; i += 3) {
    out[i] = (soup[i] - ORIGIN.x) * SCALE;
    out[i + 1] = (soup[i + 2] - ORIGIN.z) * SCALE;
    out[i + 2] = -(soup[i + 1] - ORIGIN.y) * SCALE;
  }
  return out;
}

// weld a triangle soup into an indexed mesh
export function weld(soup, eps = 1e-5) {
  const map = new Map();
  const positions = [];
  const indices = new Uint32Array(soup.length / 3);
  const inv = 1 / eps;
  for (let i = 0; i < soup.length; i += 3) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2];
    const key = Math.round(x * inv) + '_' + Math.round(y * inv) + '_' + Math.round(z * inv);
    let id = map.get(key);
    if (id === undefined) { id = positions.length / 3; map.set(key, id); positions.push(x, y, z); }
    indices[i / 3] = id;
  }
  // drop degenerate triangles
  const idx = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(idx) };
}

export function bbox(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v;
  }
  return { min, max };
}

export function components(mesh) {
  const nv = mesh.positions.length / 3;
  const parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const { indices } = mesh;
  for (let i = 0; i < indices.length; i += 3) {
    const a = find(indices[i]), b = find(indices[i + 1]), c = find(indices[i + 2]);
    if (a !== b) parent[b] = a;
    const a2 = find(a), c2 = find(c);
    if (a2 !== c2) parent[c2] = a2;
  }
  const label = new Int32Array(nv); const counts = new Map();
  for (let i = 0; i < nv; i++) { const r = find(i); label[i] = r; counts.set(r, (counts.get(r) || 0) + 1); }
  return { label, counts };
}

// keep only connected components with at least minVerts vertices (or the largest k)
export function keepComponents(mesh, { minVerts = 0, largest = 0 } = {}) {
  const { label, counts } = components(mesh);
  let keep = new Set();
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (largest) sorted.slice(0, largest).forEach(([r]) => keep.add(r));
  else sorted.forEach(([r, c]) => { if (c >= minVerts) keep.add(r); });
  const idx = [];
  for (let i = 0; i < mesh.indices.length; i += 3) if (keep.has(label[mesh.indices[i]])) idx.push(mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]);
  return compact({ positions: mesh.positions, indices: new Uint32Array(idx) });
}

export function compact(mesh) {
  const nv = mesh.positions.length / 3;
  const remap = new Int32Array(nv).fill(-1);
  const pos = []; let n = 0;
  const idx = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) {
    const v = mesh.indices[i];
    if (remap[v] < 0) { remap[v] = n++; pos.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]); }
    idx[i] = remap[v];
  }
  return { positions: new Float32Array(pos), indices: idx };
}

export async function simplify(mesh, targetTris, { error = 0.02, sloppy = false, lockBorder = false } = {}) {
  await MeshoptSimplifier.ready;
  const target = Math.max(3, Math.floor(targetTris) * 3);
  if (mesh.indices.length <= target) return mesh;
  let res;
  if (sloppy) res = MeshoptSimplifier.simplifySloppy(mesh.indices, mesh.positions, 3, target, error);
  else res = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, error, lockBorder ? ['LockBorder'] : []);
  return compact({ positions: mesh.positions, indices: res[0] });
}

// area-weighted smooth normals with a crease-free average
export function computeNormals(mesh) {
  const { positions: p, indices: ix } = mesh;
  const n = new Float32Array(p.length);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

export function signedVolume(mesh) {
  const { positions: p, indices: ix } = mesh; let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

// Laplacian (Taubin) smoothing to remove CT stair-stepping
export function smooth(mesh, iterations = 2, lambda = 0.5, mu = -0.53) {
  const nv = mesh.positions.length / 3;
  const nbr = Array.from({ length: nv }, () => new Set());
  const ix = mesh.indices;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i], b = ix[i + 1], c = ix[i + 2];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  let p = Float32Array.from(mesh.positions);
  const pass = (f) => {
    const q = new Float32Array(p.length);
    for (let v = 0; v < nv; v++) {
      const s = nbr[v]; if (!s.size) { q[v * 3] = p[v * 3]; q[v * 3 + 1] = p[v * 3 + 1]; q[v * 3 + 2] = p[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0; for (const u of s) { x += p[u * 3]; y += p[u * 3 + 1]; z += p[u * 3 + 2]; }
      x /= s.size; y /= s.size; z /= s.size;
      q[v * 3] = p[v * 3] + f * (x - p[v * 3]); q[v * 3 + 1] = p[v * 3 + 1] + f * (y - p[v * 3 + 1]); q[v * 3 + 2] = p[v * 3 + 2] + f * (z - p[v * 3 + 2]);
    }
    p = q;
  };
  for (let i = 0; i < iterations; i++) { pass(lambda); pass(mu); }
  return { positions: p, indices: mesh.indices };
}
