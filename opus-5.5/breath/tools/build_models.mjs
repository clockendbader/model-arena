// Build script: converts BodyParts3D OBJ meshes into the GLB assets used by the
// simulation, derives lung-lobe and heart surfaces, and generates the bronchial
// tree. Run once (see README.md, "Rebuilding the models"); the outputs are committed under assets/.
//
//   node tools/build_models.mjs <BP3D obj dir> <partof_element_parts.txt> <out assets dir>
//
// Why lobes are derived: BodyParts3D 4.0 contains the real segmental bronchial and
// vascular trees of every lobe, the ribcage, diaphragm and heart chambers, but no
// pleural surface for the lungs. Each lobe's volume is grown outward from its own
// real bronchial and vascular tree inside the real thoracic cavity (ribs, spine,
// diaphragm, mediastinum), so fissures and the cardiac notch fall where the
// anatomy puts them.

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const [OBJ_DIR, ELEM_FILE, OUT_DIR] = process.argv.slice(2);
if (!OBJ_DIR || !ELEM_FILE || !OUT_DIR) {
  console.error('usage: node build_models.mjs <objDir> <partof_element_parts.txt> <outAssetsDir>');
  process.exit(1);
}
await MeshoptSimplifier.ready;

// ---------------------------------------------------------------- helpers
const CX = 0, CY = -100, CZ = 1215; // mm, BP3D frame -> scene origin
// BP3D: +x patient-left, +y posterior, +z superior (mm).
// Scene: +x patient-left (viewer's right when facing the body), +y up, +z anterior (m).
const toScene = (x, y, z) => [(x - CX) / 1000, (z - CZ) / 1000, -(y - CY) / 1000];

const elemRows = fs.readFileSync(ELEM_FILE, 'utf8').split('\n').slice(1).map(l => l.split('\t'));
const elementsOf = fma => elemRows.filter(r => r[0] === fma).map(r => r[2].trim());

function readOBJ(id) {
  const file = path.join(OBJ_DIR, id + '.obj');
  const txt = fs.readFileSync(file, 'utf8');
  const pos = [], idx = [];
  let name = '';
  for (const line of txt.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      pos.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1).map(s => parseInt(s.split('/')[0], 10) - 1);
      for (let i = 1; i + 1 < p.length; i++) idx.push(p[0], p[i], p[i + 1]);
    } else if (line.startsWith('# English name')) name = line.split(':')[1].trim();
  }
  return { id, name, pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

function merge(meshes) {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.pos.length; ni += m.idx.length; }
  const pos = new Float32Array(nv), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const m of meshes) {
    pos.set(m.pos, ov);
    for (let i = 0; i < m.idx.length; i++) idx[oi + i] = m.idx[i] + ov / 3;
    ov += m.pos.length; oi += m.idx.length;
  }
  return { pos, idx };
}

function centroid(pos) {
  let x = 0, y = 0, z = 0; const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) { x += pos[i]; y += pos[i + 1]; z += pos[i + 2]; }
  return [x / n, y / n, z / n];
}

// weld duplicate vertices (BP3D files are indexed but merged groups are not)
function weld(mesh, eps = 1e-3) {
  const map = new Map(), out = [], remap = new Uint32Array(mesh.pos.length / 3);
  for (let i = 0; i < mesh.pos.length / 3; i++) {
    const k = `${Math.round(mesh.pos[3 * i] / eps)},${Math.round(mesh.pos[3 * i + 1] / eps)},${Math.round(mesh.pos[3 * i + 2] / eps)}`;
    let j = map.get(k);
    if (j === undefined) { j = out.length / 3; map.set(k, j); out.push(mesh.pos[3 * i], mesh.pos[3 * i + 1], mesh.pos[3 * i + 2]); }
    remap[i] = j;
  }
  const idx = [];
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = remap[mesh.idx[t]], b = remap[mesh.idx[t + 1]], c = remap[mesh.idx[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { pos: new Float32Array(out), idx: new Uint32Array(idx) };
}

function compact(pos, idx) {
  const remap = new Int32Array(pos.length / 3).fill(-1), out = [];
  const nidx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let r = remap[idx[i]];
    if (r < 0) { r = remap[idx[i]] = out.length / 3; out.push(pos[3 * idx[i]], pos[3 * idx[i] + 1], pos[3 * idx[i] + 2]); }
    nidx[i] = r;
  }
  return { pos: new Float32Array(out), idx: nidx };
}

function simplify(mesh, targetTris, err = 0.02) {
  const m = weld(mesh);
  if (m.idx.length / 3 <= targetTris) return m;
  const [idx] = MeshoptSimplifier.simplify(m.idx, m.pos, 3, Math.floor(targetTris) * 3, err, []);
  return compact(m.pos, idx);
}

function normals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

function signedVolume(pos, idx) {
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
  }
  return v;
}

function taubin(mesh, iters = 8, lambda = 0.5, mu = -0.53) {
  const nv = mesh.pos.length / 3;
  const nbr = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t], b = mesh.idx[t + 1], c = mesh.idx[t + 2];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  const nb = nbr.map(s => [...s]);
  let p = mesh.pos;
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 === 0 ? lambda : mu;
    const q = new Float32Array(p.length);
    for (let i = 0; i < nv; i++) {
      const l = nb[i];
      if (!l.length) { q[3 * i] = p[3 * i]; q[3 * i + 1] = p[3 * i + 1]; q[3 * i + 2] = p[3 * i + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (const j of l) { x += p[3 * j]; y += p[3 * j + 1]; z += p[3 * j + 2]; }
      x /= l.length; y /= l.length; z /= l.length;
      q[3 * i] = p[3 * i] + f * (x - p[3 * i]);
      q[3 * i + 1] = p[3 * i + 1] + f * (y - p[3 * i + 1]);
      q[3 * i + 2] = p[3 * i + 2] + f * (z - p[3 * i + 2]);
    }
    p = q;
  }
  return { pos: p, idx: mesh.idx };
}

// sample points over triangle surfaces (used for rasterising into voxels)
function surfaceSamples(mesh, step, cb) {
  const { pos, idx } = mesh;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const lab = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    const lac = Math.hypot(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]);
    const lbc = Math.hypot(pos[c] - pos[b], pos[c + 1] - pos[b + 1], pos[c + 2] - pos[b + 2]);
    const n = Math.max(1, Math.ceil(Math.max(lab, lac, lbc) / step));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      cb(pos[a] * w + pos[b] * u + pos[c] * v, pos[a + 1] * w + pos[b + 1] * u + pos[c + 1] * v, pos[a + 2] * w + pos[b + 2] * u + pos[c + 2] * v);
    }
  }
}

// ---------------------------------------------------------------- voxel grid
const H = 2; // mm
const OX = -152, OY = -228, OZ = 980;
const NX = 152, NY = 124, NZ = 212;
const NV = NX * NY * NZ;
const vi = (i, j, k) => i + NX * (j + NY * k);
const toVox = (x, y, z) => [Math.floor((x - OX) / H), Math.floor((y - OY) / H), Math.floor((z - OZ) / H)];
const inGrid = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ;
const vx = i => OX + (i + 0.5) * H, vy = j => OY + (j + 0.5) * H, vz = k => OZ + (k + 0.5) * H;

function rasterize(mesh, mask, value = 1) {
  surfaceSamples(mesh, H * 0.5, (x, y, z) => {
    const [i, j, k] = toVox(x, y, z);
    if (inGrid(i, j, k)) mask[vi(i, j, k)] = value;
  });
}

function dilate(mask, r) {
  let cur = mask;
  for (let s = 0; s < r; s++) {
    const nxt = new Uint8Array(cur);
    for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const p = vi(i, j, k);
      if (cur[p]) continue;
      if (cur[p - 1] || cur[p + 1] || cur[p - NX] || cur[p + NX] || cur[p - NX * NY] || cur[p + NX * NY]) nxt[p] = 1;
    }
    cur = nxt;
  }
  return cur;
}
function erode(mask, r) {
  let cur = mask;
  for (let s = 0; s < r; s++) {
    const nxt = new Uint8Array(cur);
    for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const p = vi(i, j, k);
      if (!cur[p]) continue;
      if (!cur[p - 1] || !cur[p + 1] || !cur[p - NX] || !cur[p + NX] || !cur[p - NX * NY] || !cur[p + NX * NY]) nxt[p] = 0;
    }
    cur = nxt;
  }
  return cur;
}
// voxels not reachable from the grid border through free (0) voxels => solid
function fillInterior(mask) {
  const ext = new Uint8Array(NV), q = new Int32Array(NV);
  let h = 0, t = 0;
  const push = p => { if (!mask[p] && !ext[p]) { ext[p] = 1; q[t++] = p; } };
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++)
    if (i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) push(vi(i, j, k));
  while (h < t) {
    const p = q[h++];
    const i = p % NX, j = Math.floor(p / NX) % NY, k = Math.floor(p / (NX * NY));
    if (i > 0) push(p - 1); if (i < NX - 1) push(p + 1);
    if (j > 0) push(p - NX); if (j < NY - 1) push(p + NX);
    if (k > 0) push(p - NX * NY); if (k < NZ - 1) push(p + NX * NY);
  }
  const out = new Uint8Array(NV);
  for (let p = 0; p < NV; p++) out[p] = ext[p] ? 0 : 1;
  return out;
}

function blur(mask, sigma = 1.0) {
  const R = Math.ceil(sigma * 2.5), ker = [];
  let s = 0;
  for (let d = -R; d <= R; d++) { const w = Math.exp(-d * d / (2 * sigma * sigma)); ker.push(w); s += w; }
  for (let i = 0; i < ker.length; i++) ker[i] /= s;
  let a = new Float32Array(NV);
  for (let p = 0; p < NV; p++) a[p] = mask[p] ? 1 : 0;
  const strides = [1, NX, NX * NY], dims = [NX, NY, NZ];
  for (let ax = 0; ax < 3; ax++) {
    const b = new Float32Array(NV), st = strides[ax], dim = dims[ax];
    for (let p = 0; p < NV; p++) {
      const c = ax === 0 ? p % NX : ax === 1 ? Math.floor(p / NX) % NY : Math.floor(p / (NX * NY));
      let v = 0;
      for (let d = -R; d <= R; d++) { const cc = c + d; if (cc >= 0 && cc < dim) v += a[p + d * st] * ker[d + R]; }
      b[p] = v;
    }
    a = b;
  }
  return a;
}

// Naive surface nets on a scalar field sampled at voxel centres.
function surfaceNets(F, thr) {
  const cx = NX - 1, cy = NY - 1, cz = NZ - 1;
  const cellV = new Int32Array(cx * cy * cz).fill(-1);
  const ci = (i, j, k) => i + cx * (j + cy * k);
  const verts = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { const d = a ^ b; if (d === 1 || d === 2 || d === 4) edges.push([a, b]); }
  const val = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let m = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[vi(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; if (val[c] > thr) m |= 1 << c; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const ia = (m >> a) & 1, ib = (m >> b) & 1;
      if (ia === ib) continue;
      const t = (thr - val[a]) / (val[b] - val[a]);
      sx += corner[a][0] + t * (corner[b][0] - corner[a][0]);
      sy += corner[a][1] + t * (corner[b][1] - corner[a][1]);
      sz += corner[a][2] + t * (corner[b][2] - corner[a][2]);
      n++;
    }
    cellV[ci(i, j, k)] = verts.length / 3;
    verts.push(vx(i + sx / n), vy(j + sy / n), vz(k + sz / n));
  }
  const idx = [];
  const dims = [NX, NY, NZ];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const p = [i, j, k];
    const inside0 = F[vi(i, j, k)] > thr;
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      if (p[a] + 1 >= dims[a] || p[b] < 1 || p[c] < 1 || p[b] >= dims[b] - 1 + 1 || p[c] >= dims[c] - 1 + 1) continue;
      const q = p.slice(); q[a]++;
      const inside1 = F[vi(q[0], q[1], q[2])] > thr;
      if (inside0 === inside1) continue;
      const cells = [[-1, -1], [0, -1], [0, 0], [-1, 0]].map(([db, dc]) => {
        const r = p.slice(); r[b] += db; r[c] += dc;
        if (r[b] < 0 || r[c] < 0 || r[b] >= dims[b] - 1 || r[c] >= dims[c] - 1 || r[a] >= dims[a] - 1) return -1;
        return cellV[ci(r[0], r[1], r[2])];
      });
      if (cells.some(v => v < 0)) continue;
      if (inside0) idx.push(cells[0], cells[1], cells[2], cells[0], cells[2], cells[3]);
      else idx.push(cells[0], cells[2], cells[1], cells[0], cells[3], cells[2]);
    }
  }
  return { pos: new Float32Array(verts), idx: new Uint32Array(idx) };
}

// ---------------------------------------------------------------- source groups
const names = {}; // FJ id -> English name
const load = id => { const m = readOBJ(id); names[id] = m.name; return m; };
const byName = {};
for (const f of fs.readdirSync(OBJ_DIR)) {
  if (!f.endsWith('.obj')) continue;
  const head = fs.readFileSync(path.join(OBJ_DIR, f), 'utf8').slice(0, 800);
  const m = head.match(/# English name : (.*)/);
  if (m) (byName[m[1].trim()] ||= []).push(f.slice(0, -4));
}
const one = n => { const ids = byName[n]; if (!ids) throw new Error('missing ' + n); return merge(ids.map(load)); };

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const cap = s => s[0].toUpperCase() + s.slice(1);

const ribs = {}, cartilages = {}, vertebrae = {}, disks = {};
for (const side of ['Left', 'Right']) ORD.forEach((o, i) => {
  ribs[`${side[0]}${i + 1}`] = one(`${side} ${o} rib`);
  if (i < 7) cartilages[`${side[0]}${i + 1}`] = one(`${side} ${o} costal cartilage`);
});
ORD.forEach((o, i) => {
  vertebrae[`T${i + 1}`] = one(`${cap(o)} thoracic vertebra`);
  if (i < 11) disks[`T${i + 1}`] = one(`Intervertebral disk of ${o} thoracic vertebra`);
});
const extraVert = { C7: one('Seventh cervical vertebra'), L1: one('First lumbar vertebra') };
const sternum = { manubrium: one('Manubrium'), body: one('Body of sternum'), xiphoid: one('Xiphoid process') };
const clavicles = { L: one('Left clavicle'), R: one('Right clavicle') };
const diaphragm = one('Diaphragm');
const trachea = one('Trachea');
const bronchusR = one('Right main bronchus proper');
const bronchusL = one('Left main bronchus');
const esophagus = one('Esophagus');
const aorta = merge(['Ascending aorta', 'Arch of aorta', 'Descending aorta'].map(n => one(n)));
const pulmTrunk = one('Pulmonary trunk');
const svc = one('Superior vena cava');
const heartParts = merge(elementsOf('FMA7088').map(load));

// Lobe trees (real BP3D segmental bronchial + vascular trees per lobe)
const LOBES = [
  { key: 'lung_right_upper', fma: 'FMA7333', side: 'R' },
  { key: 'lung_right_middle', fma: 'FMA7383', side: 'R' },
  { key: 'lung_right_lower', fma: 'FMA7337', side: 'R' },
  { key: 'lung_left_upper', fma: 'FMA7370', side: 'L' },
  { key: 'lung_left_lower', fma: 'FMA7371', side: 'L' },
];

// ---------------------------------------------------------------- cavity model
console.log('building thoracic cavity model…');
// chest-wall inner radius, sampled from each lung's own centre in cylindrical bins
const NT = 90, ZB = 3, NZB = Math.ceil((1400 - 980) / ZB);
// lung axis drifts medially/posteriorly towards the apex (apex sits beside T1)
const centreAt = (s, z) => { const u = Math.max(0, z - 1285); return [(s === 'R' ? -1 : 1) * Math.max(38, 62 - u * 0.45), -100 + u * 0.35]; };
const rmin = { R: new Float32Array(NT * NZB).fill(Infinity), L: new Float32Array(NT * NZB).fill(Infinity) };
const bone = [...Object.values(ribs), ...Object.values(cartilages), ...Object.values(sternum), ...Object.values(vertebrae), ...Object.values(disks)];
for (const m of bone) surfaceSamples(m, 1.5, (x, y, z) => {
  const zb = Math.floor((z - 980) / ZB);
  if (zb < 0 || zb >= NZB) return;
  for (const s of ['R', 'L']) {
    const c = centreAt(s, 980 + (zb + 0.5) * ZB);
    const dx = x - c[0], dy = y - c[1];
    const r = Math.hypot(dx, dy);
    const tb = ((Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * NT) % NT) + NT) % NT;
    const p = tb + NT * zb;
    if (r < rmin[s][p]) rmin[s][p] = r;
  }
});
// Fill intercostal gaps by interpolating along z; dome the apex above the 1st rib.
const APEX_Z = 1392;
for (const s of ['R', 'L']) {
  const R = rmin[s];
  for (let t = 0; t < NT; t++) {
    const zs = [];
    for (let z = 0; z < NZB; z++) if (isFinite(R[t + NT * z])) zs.push(z);
    if (!zs.length) continue; // direction without bone (towards mediastinum): unbounded
    for (let a = 0; a < zs.length - 1; a++) {
      const z0 = zs[a], z1 = zs[a + 1];
      for (let z = z0 + 1; z < z1; z++) R[t + NT * z] = R[t + NT * z0] + (R[t + NT * z1] - R[t + NT * z0]) * (z - z0) / (z1 - z0);
    }
    const top = zs[zs.length - 1], rt = R[t + NT * top];
    const hz = Math.max(6, (APEX_Z - 980) / ZB - top);
    for (let z = top + 1; z < NZB; z++) {
      const u = (z - top) / hz;
      R[t + NT * z] = u >= 1 ? 0 : rt * Math.sqrt(1 - u * u);
    }
    for (let z = 0; z < zs[0]; z++) R[t + NT * z] = R[t + NT * zs[0]];
  }
  // smooth (circular in theta)
  const S = new Float32Array(R);
  for (let z = 0; z < NZB; z++) for (let t = 0; t < NT; t++) {
    let v = 0, n = 0;
    for (let dt = -1; dt <= 1; dt++) for (let dz = -2; dz <= 2; dz++) {
      const zz = z + dz; if (zz < 0 || zz >= NZB) continue;
      const w = R[((t + dt + NT) % NT) + NT * zz];
      if (isFinite(w)) { v += w; n++; }
    }
    if (n && isFinite(R[t + NT * z])) S[t + NT * z] = v / n;
  }
  rmin[s] = S;
}
function insideChestWall(x, y, z) {
  const s = x < 0 ? 'R' : 'L';
  const zb = Math.floor((z - 980) / ZB);
  if (zb < 0 || zb >= NZB) return false;
  const c = centreAt(s, 980 + (zb + 0.5) * ZB);
  const dx = x - c[0], dy = y - c[1];
  const tb = ((Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * NT) % NT) + NT) % NT;
  const r = rmin[s][tb + NT * zb];
  return Math.hypot(dx, dy) < r - 1.5;
}

// diaphragm height map (upper surface)
const dMap = new Float32Array(NX * NY).fill(-Infinity);
surfaceSamples(diaphragm, 1, (x, y, z) => {
  const i = Math.floor((x - OX) / H), j = Math.floor((y - OY) / H);
  if (i < 0 || j < 0 || i >= NX || j >= NY) return;
  if (z > dMap[i + NX * j]) dMap[i + NX * j] = z;
});
{ // close small holes
  const c = new Float32Array(dMap);
  for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    let m = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) m = Math.max(m, dMap[i + di + NX * (j + dj)]);
    c[i + NX * j] = m;
  }
  dMap.set(c);
}

// heart: chambers + atrial walls + coronary vessels (which lie on the epicardium)
console.log('deriving heart volume…');
let heartMask = new Uint8Array(NV);
rasterize(heartParts, heartMask);
heartMask = dilate(heartMask, 4);
heartMask = fillInterior(heartMask);
heartMask = erode(heartMask, 2);
let heartVox = 0; for (let p = 0; p < NV; p++) heartVox += heartMask[p];
console.log('  heart volume (mL):', (heartVox * H * H * H / 1000).toFixed(0));

// mediastinal walls
let wall = new Uint8Array(NV);
for (const m of [aorta, pulmTrunk, svc, esophagus, trachea, ...Object.values(vertebrae), ...Object.values(disks), diaphragm]) rasterize(m, wall);
for (let p = 0; p < NV; p++) if (heartMask[p]) wall[p] = 1;
wall = dilate(wall, 1);

// cardiac notch: the left lung does not cover the lower anterior surface of the heart
const heartFront = new Float32Array(NX * NZ).fill(Infinity);
let heartTopZ = -Infinity;
for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (heartMask[vi(i, j, k)]) {
  heartFront[i + NX * k] = Math.min(heartFront[i + NX * k], vy(j));
  heartTopZ = Math.max(heartTopZ, vz(k));
}

const free = new Uint8Array(NV);
for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const p = vi(i, j, k);
  if (wall[p]) continue;
  const x = vx(i), y = vy(j), z = vz(k);
  if (z < 1035) continue;
  const dz = dMap[i + NX * j];
  if (isFinite(dz) && z < dz + 2) continue;
  if (!insideChestWall(x, y, z)) continue;
  if (x > 4 && z < heartTopZ - 30 && isFinite(heartFront[i + NX * k]) && y < heartFront[i + NX * k] - 1) continue; // notch
  free[p] = 1;
}

// ---------------------------------------------------------------- segment seeds
console.log('seeding lobes from BP3D segmental trees…');
const label = new Uint8Array(NV); // 1..5 lobe
const segLabel = new Uint8Array(NV); // segment id
const segments = []; // {name, lobe, pts:[]}
const q = new Int32Array(NV); let qh = 0, qt = 0;
const dist = new Uint16Array(NV);
LOBES.forEach((lobe, li) => {
  const ids = elementsOf(lobe.fma);
  for (const id of ids) {
    const m = load(id);
    const c = centroid(m.pos);
    const [i, j, k] = toVox(...c);
    // Some element names are shared with liver vessels; keep only elements inside the cavity.
    if (!inGrid(i, j, k) || !free[vi(i, j, k)]) { if (!inGrid(i, j, k) || !insideChestWall(...c)) { console.log('  skip', id, names[id]); continue; } }
    let segName = names[id];
    let s = segments.findIndex(g => g.name === segName && g.lobe === li);
    const isBronchial = /bronchial tree/i.test(segName);
    if (isBronchial && s < 0) { segments.push({ name: segName, lobe: li, pts: [] }); s = segments.length - 1; }
    surfaceSamples(m, H * 0.5, (x, y, z) => {
      const [a, b, cc] = toVox(x, y, z);
      if (!inGrid(a, b, cc)) return;
      const p = vi(a, b, cc);
      if (!free[p] || label[p]) return;
      label[p] = li + 1;
      if (isBronchial) { segLabel[p] = s + 1; segments[s].pts.push([x, y, z]); }
      q[qt++] = p;
    });
  }
});
console.log('  segments:', segments.map(s => `${LOBES[s.lobe].key}:${s.name}`).join(' | '));

// multi-source BFS: each free voxel joins the lobe whose tree reaches it first
const MAXD = 60; // voxels (120 mm)
while (qh < qt) {
  const p = q[qh++];
  const d = dist[p] + 1;
  if (d > MAXD) continue;
  const i = p % NX, j = Math.floor(p / NX) % NY, k = Math.floor(p / (NX * NY));
  const nb = [];
  if (i > 0) nb.push(p - 1); if (i < NX - 1) nb.push(p + 1);
  if (j > 0) nb.push(p - NX); if (j < NY - 1) nb.push(p + NX);
  if (k > 0) nb.push(p - NX * NY); if (k < NZ - 1) nb.push(p + NX * NY);
  const side = LOBES[label[p] - 1].side;
  for (const n of nb) if (free[n] && !label[n] && (side === 'R' ? vx(n % NX) < 6 : vx(n % NX) > -6)) { label[n] = label[p]; segLabel[n] = segLabel[p]; dist[n] = d; q[qt++] = n; }
}
// segment labels for voxels seeded by vessels: nearest bronchial segment of same lobe (second BFS)
{
  let h = 0, t = 0;
  for (let p = 0; p < NV; p++) if (segLabel[p]) q[t++] = p;
  while (h < t) {
    const p = q[h++];
    for (const n of [p - 1, p + 1, p - NX, p + NX, p - NX * NY, p + NX * NY]) {
      if (n < 0 || n >= NV) continue;
      if (label[n] === label[p] && !segLabel[n]) { segLabel[n] = segLabel[p]; q[t++] = n; }
    }
  }
}

// keep largest connected component per lobe (drop stray islands)
function largestComponent(lab, value) {
  const seen = new Uint8Array(NV); let best = null, bestN = 0;
  for (let p0 = 0; p0 < NV; p0++) {
    if (lab[p0] !== value || seen[p0]) continue;
    const comp = []; let h = 0; comp.push(p0); seen[p0] = 1;
    while (h < comp.length) {
      const p = comp[h++];
      for (const n of [p - 1, p + 1, p - NX, p + NX, p - NX * NY, p + NX * NY]) {
        if (n < 0 || n >= NV || seen[n] || lab[n] !== value) continue;
        seen[n] = 1; comp.push(n);
      }
    }
    if (comp.length > bestN) { bestN = comp.length; best = comp; }
  }
  const keep = new Uint8Array(NV); if (best) for (const p of best) keep[p] = 1;
  return keep;
}

// fissures: remove voxels touching another lobe (≈4 mm gap)
const carved = new Uint8Array(label);
for (let p = NX * NY; p < NV - NX * NY; p++) {
  const l = label[p]; if (!l) continue;
  for (const n of [p - 1, p + 1, p - NX, p + NX, p - NX * NY, p + NX * NY]) if (label[n] && label[n] !== l) { carved[p] = 0; break; }
}

const lobeMeshes = {}, lobeMasks = [];
let totalVol = 0;
LOBES.forEach((lobe, li) => {
  let m = largestComponent(carved, li + 1);
  const orig = m;
  m = dilate(erode(m, 3), 3); // opening: removes thin flaps in the costophrenic recess
  for (let p = 0; p < NV; p++) m[p] &= orig[p];
  m = largestComponent(m, 1);
  m = erode(dilate(m, 1), 1); // close pinholes
  for (let p = 0; p < NV; p++) if (m[p] && carved[p] !== li + 1 && carved[p] !== 0) m[p] = 0;
  lobeMasks.push(m);
  let n = 0; for (let p = 0; p < NV; p++) n += m[p];
  totalVol += n;
  console.log(`  ${lobe.key}: ${(n * 8 / 1000).toFixed(0)} mL`);
  const F = blur(m, 1.7);
  let mesh = surfaceNets(F, 0.5);
  mesh = taubin(mesh, 14);
  mesh = simplify(mesh, 14000, 0.01);
  if (signedVolume(mesh.pos, mesh.idx) < 0) for (let t = 0; t < mesh.idx.length; t += 3) { const a = mesh.idx[t + 1]; mesh.idx[t + 1] = mesh.idx[t + 2]; mesh.idx[t + 2] = a; }
  lobeMeshes[lobe.key] = mesh;
});
console.log('  total lung volume (mL):', (totalVol * 8 / 1000).toFixed(0));

let heartMesh;
{
  const F = blur(heartMask, 1.3);
  heartMesh = taubin(surfaceNets(F, 0.5), 8);
  heartMesh = simplify(heartMesh, 9000, 0.01);
  if (signedVolume(heartMesh.pos, heartMesh.idx) < 0) for (let t = 0; t < heartMesh.idx.length; t += 3) { const a = heartMesh.idx[t + 1]; heartMesh.idx[t + 1] = heartMesh.idx[t + 2]; heartMesh.idx[t + 2] = a; }
}

// ---------------------------------------------------------------- airway tree
console.log('generating bronchial tree…');
let seed = 1234567;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => mul(a, 1 / (len(a) || 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = pts => mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);

function centreline(mesh, from, nb) {
  // average vertices in slabs along the principal direction away from `from`
  const P = []; for (let i = 0; i < mesh.pos.length; i += 3) P.push([mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]);
  const far = P.reduce((b, p) => len(sub(p, from)) > len(sub(b, from)) ? p : b, P[0]);
  const farSet = P.filter(p => len(sub(p, far)) < 12);
  const end = mean(farSet);
  const axis = norm(sub(end, from)), L = len(sub(end, from));
  const pts = [from];
  for (let b = 1; b <= nb; b++) {
    const t0 = (b - 0.5) / nb * L, t1 = (b + 0.5) / nb * L;
    const slab = P.filter(p => { const t = dot(sub(p, from), axis); return t >= t0 && t < t1; });
    pts.push(slab.length > 8 ? mean(slab) : add(from, mul(axis, b / nb * L)));
  }
  return pts;
}

const trP = []; for (let i = 0; i < trachea.pos.length; i += 3) trP.push([trachea.pos[i], trachea.pos[i + 1], trachea.pos[i + 2]]);
const trTopZ = Math.max(...trP.map(p => p[2])), trBotZ = Math.min(...trP.map(p => p[2]));
const trTop = mean(trP.filter(p => p[2] > trTopZ - 6));
const carina = mean(trP.filter(p => p[2] < trBotZ + 10));
const rmb = centreline(bronchusR, carina, 6);
const lmb = centreline(bronchusL, carina, 6);
console.log('  trachea top', trTop.map(Math.round), 'carina', carina.map(Math.round), 'RMB end', rmb.at(-1).map(Math.round), 'LMB end', lmb.at(-1).map(Math.round));

const nodes = []; // {p, r, parent, gen, seg, lobe}
const addNode = (p, r, parent, gen, seg = -1, lobe = -1) => { nodes.push({ p, r, parent, gen, seg, lobe }); return nodes.length - 1; };
const insideLung = p => { const [i, j, k] = toVox(...p); return inGrid(i, j, k) && label[vi(i, j, k)] > 0; };

// trachea (gen 0)
let n0 = addNode(trTop, 9, -1, 0);
const trMid = add(trTop, mul(sub(carina, trTop), 0.5));
let n1 = addNode(trMid, 9, n0, 0);
const nCar = addNode(carina, 8.5, n1, 0);
// main bronchi (gen 1) as polylines
function addPolyline(pts, r0, r1, parent, gen) {
  let last = parent;
  for (let i = 1; i < pts.length; i++) last = addNode(pts[i], r0 + (r1 - r0) * i / (pts.length - 1), last, gen);
  return last;
}
// right: upper-lobe bronchus leaves ~2.2 cm below the carina, then bronchus intermedius continues
const rmbLen = len(sub(rmb.at(-1), carina));
const rIdx = Math.max(1, Math.round(22 / rmbLen * (rmb.length - 1)));
const nRULtake = addPolyline(rmb.slice(0, rIdx + 1), 7, 6.5, nCar, 1);
const nRint = addPolyline(rmb.slice(rIdx), 6, 5.5, nRULtake, 1);
const nLmb = addPolyline(lmb, 6.5, 5.5, nCar, 1);

// attraction points per segment territory (voxel samples)
const segPts = segments.map(() => []);
for (let p = 0; p < NV; p++) {
  const s = segLabel[p]; if (!s) continue;
  const l = label[p]; if (!l || !lobeMasks[l - 1][p]) continue;
  if (rand() < 0.0105) segPts[s - 1].push([vx(p % NX) + (rand() - 0.5) * H, vy(Math.floor(p / NX) % NY) + (rand() - 0.5) * H, vz(Math.floor(p / (NX * NY))) + (rand() - 0.5) * H]);
}
console.log('  attraction points:', segPts.reduce((s, a) => s + a.length, 0));

const segByName = (lobeIdx, re) => segments.map((s, i) => i).filter(i => segments[i].lobe === lobeIdx && re.test(segments[i].name));

// recursive volume bisection (after Kitaoka/Tawhai space-filling algorithms)
function grow(parent, pts, gen, seg, lobe) {
  const P = nodes[parent].p;
  const pdir = norm(sub(P, nodes[nodes[parent].parent].p));
  if (pts.length <= 1 || gen > 22) {
    if (pts.length === 1) {
      let tgt = pts[0], d = sub(tgt, P);
      if (len(d) > 1) addNode(add(P, mul(d, 0.7)), Math.max(0.25, nodes[parent].r * 0.8), parent, gen, seg, lobe);
    }
    return;
  }
  // split plane contains the parent direction; orientation = widest spread of the cloud
  const c = mean(pts);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    let d = sub(p, c); d = sub(d, mul(pdir, dot(d, pdir)));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += d[a] * d[b];
  }
  let v = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]);
  for (let it = 0; it < 30; it++) { v = norm([dot(cov[0], v), dot(cov[1], v), dot(cov[2], v)]); }
  const A = [], B = [];
  for (const p of pts) (dot(sub(p, c), v) < 0 ? A : B).push(p);
  if (!A.length || !B.length) { const h = pts.length >> 1; A.splice(0, A.length, ...pts.slice(0, h)); B.splice(0, B.length, ...pts.slice(h)); }
  const total = pts.length;
  for (const S of [A, B]) {
    const cs = mean(S);
    let d = sub(cs, P);
    const L = len(d);
    if (L < 0.5) { grow(parent, S, gen + 1, seg, lobe); continue; }
    let dir = norm(d);
    // limit branching angle to 65° from the parent axis
    const cosA = dot(dir, pdir), maxA = Math.cos(65 * Math.PI / 180);
    if (cosA < maxA) {
      const perp = norm(sub(dir, mul(pdir, cosA)));
      dir = norm(add(mul(pdir, maxA), mul(perp, Math.sin(65 * Math.PI / 180))));
    }
    let l = Math.max(1.2, 0.42 * L);
    let end = add(P, mul(dir, l));
    for (let tries = 0; tries < 4 && !insideLung(end); tries++) { l *= 0.6; end = add(P, mul(dir, l)); }
    // Murray/Weibel-like diameter scaling with subtended volume
    const r = Math.max(0.22, nodes[parent].r * Math.pow(S.length / total, 1 / 2.9));
    const n = addNode(end, r, parent, gen, seg, lobe);
    grow(n, S, gen + 1, seg, lobe);
  }
}

// lobar and segmental structure (named anatomy), then space-filling growth
function branchTo(parent, target, frac, r, gen, lobe = -1, seg = -1) {
  const P = nodes[parent].p;
  return addNode(add(P, mul(sub(target, P), frac)), r, parent, gen, seg, lobe);
}
function segmentalFrom(parent, segIds, gen, rSeg, lobe) {
  for (const s of segIds) {
    if (!segPts[s].length) continue;
    const tgt = mean(segments[s].pts.length ? segments[s].pts : segPts[s]);
    const n = branchTo(parent, tgt, 0.55, rSeg, gen, lobe, s);
    grow(n, segPts[s], gen + 1, s, lobe);
  }
}
const lobeTarget = li => mean(segments.flatMap((s, i) => s.lobe === li ? segPts[i] : []));
// Right upper lobe (lobe 0): apical, posterior, anterior
{
  const n = branchTo(nRULtake, lobeTarget(0), 0.3, 4.6, 2, 0);
  segmentalFrom(n, segByName(0, /./), 3, 3.0, 0);
}
// Right middle (1) and lower (2) from the bronchus intermedius
{
  const nm = branchTo(nRint, lobeTarget(1), 0.3, 3.6, 2, 1);
  segmentalFrom(nm, segByName(1, /./), 3, 2.6, 1);
  const nl = branchTo(nRint, lobeTarget(2), 0.22, 4.6, 2, 2);
  const sup = segByName(2, /superior/i), basal = segByName(2, /basal/i);
  segmentalFrom(nl, sup, 3, 3.0, 2);
  const basalT = mean(basal.flatMap(s => segPts[s]));
  const nb = branchTo(nl, basalT, 0.3, 4.0, 3, 2);
  segmentalFrom(nb, basal, 4, 2.8, 2);
}
// Left upper (3): upper division + lingula; left lower (4): superior + basal trunk
{
  const nu = branchTo(nLmb, lobeTarget(3), 0.28, 4.6, 2, 3);
  const upperDiv = segByName(3, /apical|posterior|anterior/i), ling = segByName(3, /lingular/i);
  const nud = branchTo(nu, mean(upperDiv.flatMap(s => segPts[s])), 0.3, 3.8, 3, 3);
  segmentalFrom(nud, upperDiv, 4, 2.8, 3);
  const nli = branchTo(nu, mean(ling.flatMap(s => segPts[s])), 0.3, 3.4, 3, 3);
  segmentalFrom(nli, ling, 4, 2.6, 3);
  const nl = branchTo(nLmb, lobeTarget(4), 0.22, 4.6, 2, 4);
  const sup = segByName(4, /superior/i), basal = segByName(4, /basal/i);
  segmentalFrom(nl, sup, 3, 3.0, 4);
  const nb = branchTo(nl, mean(basal.flatMap(s => segPts[s])), 0.3, 4.0, 3, 4);
  segmentalFrom(nb, basal, 4, 2.8, 4);
}
const maxGen = Math.max(...nodes.map(n => n.gen));
const genHist = {}; nodes.forEach(n => genHist[n.gen] = (genHist[n.gen] || 0) + 1);
console.log('  nodes:', nodes.length, 'max generation:', maxGen, genHist);

// ---------------------------------------------------------------- export
const io = new NodeIO();
function writeGLB(file, parts) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('scene');
  for (const part of parts) {
    const m = part.mesh;
    const P = new Float32Array(m.pos.length);
    for (let i = 0; i < m.pos.length; i += 3) { const s = toScene(m.pos[i], m.pos[i + 1], m.pos[i + 2]); P[i] = s[0]; P[i + 1] = s[1]; P[i + 2] = s[2]; }
    // toScene is a proper rotation (det +1), so winding is preserved
    const N = normals(P, m.idx);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(P.length / 3 > 65535 ? m.idx : new Uint16Array(m.idx)).setBuffer(buf))
      .setMaterial(doc.createMaterial(part.material || part.name));
    const node = doc.createNode(part.name).setMesh(doc.createMesh(part.name).addPrimitive(prim));
    if (part.extras) node.setExtras(part.extras);
    scene.addChild(node);
  }
  return io.write(file, doc);
}

const modelsDir = path.join(OUT_DIR, 'models');
fs.mkdirSync(modelsDir, { recursive: true });
const S = (m, t, e = 0.01) => simplify(m, t, e);
const sc = p => toScene(...p);

// skeleton: ribs carry a pivot (rib head) for the breathing rotation
const skel = [];
for (const [k, m] of Object.entries(ribs)) {
  const P = []; for (let i = 0; i < m.pos.length; i += 3) P.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]);
  const maxY = Math.max(...P.map(p => p[1]));
  const post = P.filter(p => p[1] > maxY - 30).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
  const head = mean(post.slice(0, Math.max(5, Math.floor(post.length * 0.08))));
  const front = P.reduce((b, p) => p[1] < b[1] ? p : b, P[0]);
  skel.push({ name: `rib_${k}`, material: 'bone', mesh: S(m, 1400), extras: { pivot: sc(head), front: sc(front), index: +k.slice(1), side: k[0] } });
}
for (const [k, m] of Object.entries(cartilages)) skel.push({ name: `cartilage_${k}`, material: 'cartilage', mesh: S(m, 500), extras: { rib: `rib_${k}` } });
for (const [k, m] of Object.entries(vertebrae)) skel.push({ name: `vertebra_${k}`, material: 'bone', mesh: S(m, 1300) });
for (const [k, m] of Object.entries(extraVert)) skel.push({ name: `vertebra_${k}`, material: 'bone', mesh: S(m, 1300) });
for (const [k, m] of Object.entries(disks)) skel.push({ name: `disk_${k}`, material: 'cartilage', mesh: S(m, 400) });
for (const [k, m] of Object.entries(sternum)) skel.push({ name: `sternum_${k}`, material: 'bone', mesh: S(m, 1200) });
for (const [k, m] of Object.entries(clavicles)) skel.push({ name: `clavicle_${k}`, material: 'bone', mesh: S(m, 900) });
await writeGLB(path.join(modelsDir, 'skeleton.glb'), skel);

const organs = [
  ...LOBES.map(l => ({ name: l.key, material: 'lung', mesh: lobeMeshes[l.key] })),
  { name: 'heart', material: 'heart', mesh: heartMesh },
  { name: 'aorta', material: 'artery', mesh: S(aorta, 3500) },
  { name: 'pulmonary_trunk', material: 'vein_blue', mesh: S(pulmTrunk, 1500) },
  { name: 'superior_vena_cava', material: 'vein_blue', mesh: S(svc, 800) },
  { name: 'trachea', material: 'airway', mesh: S(trachea, 4000) },
  { name: 'bronchus_right', material: 'airway', mesh: S(bronchusR, 3000) },
  { name: 'bronchus_left', material: 'airway', mesh: S(bronchusL, 3000) },
  { name: 'diaphragm', material: 'diaphragm', mesh: S(diaphragm, 9000) },
  { name: 'esophagus', material: 'esophagus', mesh: S(esophagus, 1500) },
];
await writeGLB(path.join(modelsDir, 'organs.glb'), organs);

// glass torso from the BP3D skin, cropped to the trunk
{
  const skin = load('FJ2810');
  const keep = [];
  const ok = i => { const x = skin.pos[3 * i], z = skin.pos[3 * i + 2]; return z > 960 && z < 1445 && Math.abs(x) < 168; };
  for (let t = 0; t < skin.idx.length; t += 3) if (ok(skin.idx[t]) && ok(skin.idx[t + 1]) && ok(skin.idx[t + 2])) keep.push(skin.idx[t], skin.idx[t + 1], skin.idx[t + 2]);
  const crop = compact(skin.pos, new Uint32Array(keep));
  await writeGLB(path.join(modelsDir, 'torso.glb'), [{ name: 'torso_skin', material: 'glass', mesh: simplify(crop, 26000, 0.01) }]);
}

// airway tree + landmarks
const segOut = segments.map(s => ({ name: s.name, lobe: LOBES[s.lobe].key }));
const airway = {
  units: 'metres, scene frame (+x patient left, +y superior, +z anterior)',
  source: 'Procedurally generated by tools/build_models.mjs, guided by BodyParts3D segmental bronchial trees',
  segments: segOut,
  lobes: LOBES.map(l => l.key),
  // [x, y, z, radius(m), parent, generation, segment, lobe]
  nodes: nodes.map(n => { const p = sc(n.p); return [+p[0].toFixed(5), +p[1].toFixed(5), +p[2].toFixed(5), +(n.r / 1000).toFixed(5), n.parent, n.gen, n.seg, n.lobe]; }),
};
fs.mkdirSync(path.join(OUT_DIR, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'data', 'airways.json'), JSON.stringify(airway));
console.log('done.');
