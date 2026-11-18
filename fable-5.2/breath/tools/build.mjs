// Build breath/assets/thorax.glb + airways.json from BodyParts3D STL files.
// usage: node build.mjs <stlDir> <outDir>
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { readSTL, toScene, weld, bbox, keepComponents, compact, simplify, computeNormals, smooth, signedVolume } from './lib.mjs';
import { reebSkeleton, finalizeRadii } from './skeleton.mjs';

const [stlDir, outDir] = process.argv.slice(2);
const load = (id, eps) => weld(toScene(readSTL(`${stlDir}/${id}.stl`)), eps);
const r4 = (v) => Math.round(v * 1e4) / 1e4;

function merge(meshes) {
  let nv = 0, ni = 0; for (const m of meshes) { nv += m.positions.length; ni += m.indices.length; }
  const positions = new Float32Array(nv), indices = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const m of meshes) {
    positions.set(m.positions, vo);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo / 3;
    vo += m.positions.length; io += m.indices.length;
  }
  return { positions, indices };
}
function filterTris(mesh, keep) {
  const p = mesh.positions, ix = mesh.indices, out = [];
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    if (keep((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3)) out.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  return compact({ positions: p, indices: new Uint32Array(out) });
}
let seed = 20261118;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const parts = []; // {name, mesh, extra}
const add = (name, mesh, extra = {}) => { parts.push({ name, mesh, extra }); console.log(name.padEnd(14), 'tris', mesh.indices.length / 3, 'verts', mesh.positions.length / 3); };

// ---------------------------------------------------------------- lungs
const LOBES = [
  ['lobe_rul', 'FMA7333', 15000], ['lobe_rml', 'FMA7383', 11000], ['lobe_rll', 'FMA7337', 21000],
  ['lobe_lul', 'FMA7370', 17000], ['lobe_lll', 'FMA7371', 19000],
];
const lobeFull = {};
for (const [name, id, target] of LOBES) {
  let m = keepComponents(load(id), { largest: 1 });
  lobeFull[name] = m;
  m = smooth(m, 1);
  add(name, await simplify(m, target, { error: 0.01 }));
}

// ---------------------------------------------------------------- airways (real)
const trachea = keepComponents(load('FMA7394'), { largest: 1 });
const bronchiRaw = keepComponents(load('FMA7409'), { largest: 2 });

// trachea centreline by horizontal slabs
const tb = bbox(trachea.positions);
const skel = []; // {p, r, parent, gen}
{
  const slab = 0.07; const n = Math.floor((tb.max[1] - tb.min[1]) / slab);
  for (let k = 0; k < n; k++) {
    const y1 = tb.max[1] - k * slab, y0 = y1 - slab; let cx = 0, cz = 0, c = 0;
    const P = trachea.positions;
    for (let i = 0; i < P.length; i += 3) if (P[i + 1] >= y0 && P[i + 1] < y1) { cx += P[i]; cz += P[i + 2]; c++; }
    if (!c) continue; cx /= c; cz /= c; let r = 0;
    for (let i = 0; i < P.length; i += 3) if (P[i + 1] >= y0 && P[i + 1] < y1) r += Math.hypot(P[i] - cx, P[i + 2] - cz);
    skel.push({ p: [cx, (y0 + y1) / 2, cz], r: r / c, parent: skel.length - 1, real: 1 });
  }
}
// The lowest trachea slabs already contain the start of the bifurcation: trim nodes whose radius balloons.
const rMed = skel.map(n => n.r).sort((a, b) => a - b)[skel.length >> 1];
while (skel.length > 4 && skel[skel.length - 1].r > rMed * 1.25) skel.pop();
const carinaIdx = skel.length - 1; const carina = skel[carinaIdx].p;
console.log('trachea nodes', skel.length, 'radius', rMed.toFixed(3), 'carina', carina.map(r4));

// bronchi: one Reeb skeleton per connected component (right / left tree)
{
  const { label, counts } = (await import('./lib.mjs')).components(bronchiRaw);
  const roots = [...counts.keys()];
  for (const root of roots) {
    const idx = []; for (let i = 0; i < bronchiRaw.indices.length; i += 3) if (label[bronchiRaw.indices[i]] === root) idx.push(bronchiRaw.indices[i], bronchiRaw.indices[i + 1], bronchiRaw.indices[i + 2]);
    const comp = compact({ positions: bronchiRaw.positions, indices: new Uint32Array(idx) });
    const { nodes } = reebSkeleton(comp, carina, 0.04);
    const children = finalizeRadii(comp, nodes);
    // fix invalid radii from neighbours
    for (let pass = 0; pass < 3; pass++) nodes.forEach((n, i) => { if (n.r <= 0) { const c = children[i][0]; n.r = n.parent >= 0 && nodes[n.parent].r > 0 ? nodes[n.parent].r : (c !== undefined ? nodes[c].r : 0.02); } });
    // prune short leaf spurs
    let alive = nodes.map(() => true);
    // drop orphan fragments (anything that does not trace back to the seed band)
    {
      const ok = nodes.map((n) => n.band === 0 ? 1 : 0);
      const resolve = (i) => { if (ok[i]) return ok[i]; const stack = []; let j = i; while (j >= 0 && !ok[j]) { stack.push(j); j = nodes[j].parent; } const v = j >= 0 ? ok[j] : -1; for (const k of stack) ok[k] = v; return v; };
      let dropped = 0; nodes.forEach((n, i) => { if (resolve(i) < 0) { alive[i] = false; dropped++; } });
      console.log('orphan nodes dropped', dropped, 'band-0 nodes', nodes.filter(n => n.band === 0).length);
    }
    for (let pass = 0; pass < 2; pass++) {
      const ch = nodes.map(() => 0); nodes.forEach((n, i) => { if (alive[i] && n.parent >= 0) ch[n.parent]++; });
      nodes.forEach((n, i) => {
        if (!alive[i] || ch[i] !== 0) return;
        let len = 0, j = i; const chain = [];
        while (nodes[j].parent >= 0 && ch[nodes[j].parent] === 1) { chain.push(j); len += dist(nodes[j].p, nodes[nodes[j].parent].p); j = nodes[j].parent; }
        chain.push(j); if (nodes[j].parent >= 0) len += dist(nodes[j].p, nodes[nodes[j].parent].p);
        if (len < 0.09 && nodes[j].parent >= 0) chain.forEach(k => alive[k] = false);
      });
    }
    // smooth chains
    for (let it = 0; it < 3; it++) {
      const ch = nodes.map(() => []); nodes.forEach((n, i) => { if (alive[i] && n.parent >= 0) ch[n.parent].push(i); });
      const np = nodes.map(n => n.p.slice()), nr = nodes.map(n => n.r);
      nodes.forEach((n, i) => {
        if (!alive[i] || n.parent < 0 || ch[i].length !== 1) return;
        const a = nodes[n.parent], b = nodes[ch[i][0]];
        for (let k = 0; k < 3; k++) np[i][k] = 0.25 * a.p[k] + 0.5 * n.p[k] + 0.25 * b.p[k];
        nr[i] = [a.r, n.r, b.r].sort((x, y) => x - y)[1];
      });
      nodes.forEach((n, i) => { n.p = np[i]; n.r = nr[i]; });
    }
    const base = skel.length; const map = new Map(); let k = 0;
    nodes.forEach((n, i) => { if (alive[i]) map.set(i, base + k++); });
    nodes.forEach((n, i) => { if (alive[i]) skel.push({ p: n.p, r: n.r, parent: n.parent >= 0 ? map.get(n.parent) : carinaIdx, real: 1 }); });
    console.log('bronchi component: nodes', k, 'x-centre', (comp.positions.reduce((s, v, i) => i % 3 === 0 ? s + v : s, 0) / (comp.positions.length / 3)).toFixed(2));
  }
}
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
{
  const ch = skel.map(() => 0); skel.forEach(n => { if (n.parent >= 0) ch[n.parent]++; });
  console.log('skeleton nodes', skel.length, 'tips', ch.filter(c => c === 0).length, 'forks', ch.filter(c => c > 1).length);
}

// per-vertex centreline attributes so the shader can constrict airways (asthma)
function centreAttr(mesh) {
  const P = mesh.positions; const nv = P.length / 3;
  const centre = new Float32Array(nv * 3), radius = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; let best = Infinity, bx = x, by = y, bz = z, br = 0.02;
    for (let i = 1; i < skel.length; i++) {
      const a = skel[skel[i].parent].p, b = skel[i].p;
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      let t = ((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / (abx * abx + aby * aby + abz * abz || 1);
      t = Math.max(0, Math.min(1, t));
      const qx = a[0] + abx * t, qy = a[1] + aby * t, qz = a[2] + abz * t;
      const rr = skel[skel[i].parent].r * (1 - t) + skel[i].r * t;
      // distance measured relative to the tube surface so thick tubes do not steal thin neighbours
      const d = Math.abs(Math.hypot(x - qx, y - qy, z - qz) - rr);
      if (d < best) { best = d; bx = qx; by = qy; bz = qz; br = rr; }
    }
    centre[v * 3] = bx; centre[v * 3 + 1] = by; centre[v * 3 + 2] = bz; radius[v] = br;
  }
  return { centre, radius };
}
{
  const t = await simplify(trachea, 11000, { error: 0.005 });
  add('trachea', t, centreAttr(t));
  const b = await simplify(bronchiRaw, 52000, { error: 0.004 });
  add('bronchi', b, centreAttr(b));
}
add('larynx', await simplify(keepComponents(load('FMA55099'), { largest: 1 }), 5000));

// ---------------------------------------------------------------- lobe interior samples (growth attractors)
function insideSampler(mesh) {
  // column ray casting along +x on a (y,z) lattice
  const P = mesh.positions, ix = mesh.indices; const bb = bbox(P);
  return (y, z) => {
    const xs = [];
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      const ay = P[a + 1] - y, az = P[a + 2] - z, by = P[b + 1] - y, bz = P[b + 2] - z, cy = P[c + 1] - y, cz = P[c + 2] - z;
      const d0 = ay * bz - az * by, d1 = by * cz - bz * cy, d2 = cy * az - cz * ay;
      if ((d0 >= 0 && d1 >= 0 && d2 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0)) {
        const s = d0 + d1 + d2; if (Math.abs(s) < 1e-12) continue;
        xs.push((P[a] * d1 + P[b] * d2 + P[c] * d0) / s);
      }
    }
    xs.sort((p, q) => p - q); return xs;
  };
}
const attract = {};
const H = 0.1, MARGIN = 0.045;
for (const [name] of LOBES) {
  const m = lobeFull[name]; const bb = bbox(m.positions); const cast = insideSampler(m);
  const pts = [];
  const cols = new Map();
  const col = (y, z) => { const k = Math.round(y * 1000) + '_' + Math.round(z * 1000); if (!cols.has(k)) cols.set(k, cast(y, z)); return cols.get(k); };
  const inside = (x, y, z) => { const xs = col(y, z); let c = 0; for (const v of xs) if (v < x) c++; return c % 2 === 1; };
  for (let y = bb.min[1] + H / 2; y < bb.max[1]; y += H) for (let z = bb.min[2] + H / 2; z < bb.max[2]; z += H) for (let x = bb.min[0] + H / 2; x < bb.max[0]; x += H) {
    // jitter on a lattice of 5 steps so ray columns are reused
    const jx = x + (rnd() - 0.5) * H * 0.7, jy = y + (Math.floor(rnd() * 5) - 2) * H * 0.16, jz = z + (Math.floor(rnd() * 5) - 2) * H * 0.16;
    if (!inside(jx, jy, jz)) continue;
    // keep a safety margin from the pleural surface
    const xs = col(jy, jz); let ok = true; for (const v of xs) if (Math.abs(v - jx) < MARGIN) ok = false;
    if (ok && inside(jx, jy + MARGIN, jz) && inside(jx, jy - MARGIN, jz) && inside(jx, jy, jz + MARGIN) && inside(jx, jy, jz - MARGIN)) pts.push(jx, jy, jz);
  }
  attract[name] = pts.map(v => Math.round(v * 1000) / 1000);
  let cx = 0, cy = 0, cz = 0; for (let i = 0; i < pts.length; i += 3) { cx += pts[i]; cy += pts[i + 1]; cz += pts[i + 2]; }
  console.log(name, 'attractors', pts.length / 3, 'volume L', signedVolume(m).toFixed(3));
}

// ---------------------------------------------------------------- heart + vessels
add('heart', await simplify(smooth(keepComponents(load('FMA7274'), { largest: 1 }), 1), 30000, { error: 0.01 }));
add('aorta', merge([
  await simplify(load('FMA3736'), 1500), await simplify(load('FMA3768'), 2400),
  await simplify(filterTris(load('FMA3784'), (x, y) => y > -2.6), 5000),
]));
add('vena_cava', merge([await simplify(load('FMA4720'), 1200), await simplify(filterTris(load('FMA10951'), (x, y) => y > -2.6), 2500)]));
add('pulm_arteries', await simplify(load('FMA66326'), 42000, { error: 0.004 }));
add('pulm_veins', await simplify(keepComponents(load('FMA66643'), { minVerts: 500 }), 30000, { error: 0.004 }));

// ---------------------------------------------------------------- diaphragm
add('diaphragm', await simplify(smooth(load('FMA13295'), 1), 20000, { error: 0.01 }));

// ---------------------------------------------------------------- skeleton
const RIBS = 'FMA7857 FMA7882 FMA7909 FMA7957 FMA8066 FMA8175 FMA8229 FMA8283 FMA8364 FMA8445 FMA8531 FMA8533 FMA7987 FMA8012 FMA8039 FMA8148 FMA8093 FMA8202 FMA8256 FMA8310 FMA8391 FMA8472 FMA8532 FMA8534'.split(' ');
const ribs = []; for (const id of RIBS) ribs.push(await simplify(keepComponents(load(id), { largest: 1 }), 3200, { error: 0.01 }));
add('ribs', merge(ribs));
add('cartilage', merge([await simplify(keepComponents(load('BP24'), { minVerts: 100 }), 6500), await simplify(keepComponents(load('BP28'), { minVerts: 100 }), 6500)]));
add('sternum', merge([await simplify(load('FMA7486'), 3500), await simplify(load('FMA7487'), 5000), await simplify(load('FMA7488'), 1200)]));
add('clavicles', merge([await simplify(load('FMA13322'), 2500), await simplify(load('FMA13323'), 2500)]));
const VERT = 'FMA12525 FMA9165 FMA9187 FMA9209 FMA9248 FMA9922 FMA9945 FMA9968 FMA9991 FMA10014 FMA10037 FMA10059 FMA10081 FMA13072 FMA13073'.split(' ');
const verts = []; for (const id of VERT) verts.push(await simplify(keepComponents(load(id), { largest: 1 }), 3200, { error: 0.01 }));
add('spine', merge(verts));
const DISC = 'FMA13900 FMA10458 FMA13495 FMA13500 FMA13501 FMA13502 FMA13503 FMA13504 FMA13505 FMA13506 FMA13507 FMA13508 FMA13509'.split(' ');
const discs = []; for (const id of DISC) discs.push(await simplify(keepComponents(load(id), { largest: 1 }), 500, { error: 0.02 }));
add('discs', merge(discs));

// ---------------------------------------------------------------- skin (glass torso)
{
  let skin = load('FMA7163', 1e-4);
  skin = filterTris(skin, (x, y, z) => y > -3.5 && !(Math.abs(x) > 1.63 && y < -1.3));
  skin = keepComponents(skin, { largest: 1 });
  skin = await simplify(skin, 64000, { error: 0.01 });
  add('skin', skin);
}

// ---------------------------------------------------------------- write GLB
const doc = new Document(); const buffer = doc.createBuffer(); const scene = doc.createScene('thorax');
for (const { name, mesh, extra } of parts) {
  const normals = computeNormals(mesh);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(mesh.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(mesh.indices).setBuffer(buffer));
  if (extra.centre) {
    prim.setAttribute('_CENTRE', doc.createAccessor().setType('VEC3').setArray(extra.centre).setBuffer(buffer));
    prim.setAttribute('_RADIUS', doc.createAccessor().setType('SCALAR').setArray(extra.radius).setBuffer(buffer));
  }
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}
fs.mkdirSync(outDir, { recursive: true });
await new NodeIO().write(`${outDir}/thorax.glb`, doc);

const airways = {
  units: '1 unit = 100 mm; +X body left, +Y up, +Z anterior',
  carina: carinaIdx,
  nodes: skel.flatMap(n => [r4(n.p[0]), r4(n.p[1]), r4(n.p[2]), r4(n.r), n.parent]),
  attractors: attract,
};
fs.writeFileSync(`${outDir}/airways.json`, JSON.stringify(airways));
console.log('wrote', (fs.statSync(`${outDir}/thorax.glb`).size / 1e6).toFixed(1), 'MB GLB,', (fs.statSync(`${outDir}/airways.json`).size / 1e3).toFixed(0), 'kB JSON');
