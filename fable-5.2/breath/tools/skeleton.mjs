// Extract a centreline skeleton (with radii) from the BodyParts3D trachea + bronchus meshes
// using geodesic level-set bands (a discrete Reeb graph).
import { readSTL, toScene, weld, components, compact } from './lib.mjs';

function adjacency(mesh) {
  const nv = mesh.positions.length / 3;
  const nbr = Array.from({ length: nv }, () => []);
  const ix = mesh.indices;
  const add = (a, b) => { if (!nbr[a].includes(b)) nbr[a].push(b); if (!nbr[b].includes(a)) nbr[b].push(a); };
  for (let i = 0; i < ix.length; i += 3) { add(ix[i], ix[i + 1]); add(ix[i + 1], ix[i + 2]); add(ix[i], ix[i + 2]); }
  return nbr;
}

class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function geodesic(mesh, nbr, seeds) {
  const nv = mesh.positions.length / 3; const p = mesh.positions;
  const d = new Float64Array(nv).fill(Infinity); const h = new Heap();
  for (const s of seeds) { d[s] = 0; h.push(0, s); }
  while (h.size) {
    const [dist, v] = h.pop(); if (dist > d[v]) continue;
    for (const u of nbr[v]) {
      const nd = dist + Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 1] - p[v * 3 + 1], p[u * 3 + 2] - p[v * 3 + 2]);
      if (nd < d[u]) { d[u] = nd; h.push(nd, u); }
    }
  }
  return d;
}

// returns { nodes:[{p,r,parent,verts}], vertNode:Int32Array }
export function reebSkeleton(mesh, seedPoint, band) {
  const nbr = adjacency(mesh); const p = mesh.positions; const nv = p.length / 3;
  // seeds: vertices within a small radius of the vertex closest to seedPoint
  let best = -1, bd = Infinity;
  for (let i = 0; i < nv; i++) { const dd = Math.hypot(p[i * 3] - seedPoint[0], p[i * 3 + 1] - seedPoint[1], p[i * 3 + 2] - seedPoint[2]); if (dd < bd) { bd = dd; best = i; } }
  const d = geodesic(mesh, nbr, [best]);
  const bandOf = new Int32Array(nv); let maxBand = 0;
  for (let i = 0; i < nv; i++) { bandOf[i] = isFinite(d[i]) ? Math.floor(d[i] / band) : -1; if (bandOf[i] > maxBand) maxBand = bandOf[i]; }
  // connected components inside each band
  const comp = new Int32Array(nv).fill(-1); const nodes = [];
  for (let s = 0; s < nv; s++) {
    if (comp[s] >= 0 || bandOf[s] < 0) continue;
    const id = nodes.length; const stack = [s]; comp[s] = id; const verts = [];
    while (stack.length) { const v = stack.pop(); verts.push(v); for (const u of nbr[v]) if (comp[u] < 0 && bandOf[u] === bandOf[s]) { comp[u] = id; stack.push(u); } }
    let cx = 0, cy = 0, cz = 0; for (const v of verts) { cx += p[v * 3]; cy += p[v * 3 + 1]; cz += p[v * 3 + 2]; }
    cx /= verts.length; cy /= verts.length; cz /= verts.length;
    nodes.push({ p: [cx, cy, cz], band: bandOf[s], verts, parent: -1, r: 0 });
  }
  // parent links: the component in the previous band sharing most edges
  for (let id = 0; id < nodes.length; id++) {
    const n = nodes[id]; if (n.band === 0) continue;
    // normally the previous band; sliver triangles (flat end caps) can skip a band, so accept any lower one
    let bp = -1;
    for (let back = 1; back <= 6 && bp < 0; back++) {
      const votes = new Map();
      for (const v of n.verts) for (const u of nbr[v]) if (bandOf[u] === n.band - back) votes.set(comp[u], (votes.get(comp[u]) || 0) + 1);
      let bv = 0; for (const [k, c] of votes) if (c > bv) { bv = c; bp = k; }
    }
    n.parent = bp;
  }
  return { nodes, vertNode: comp };
}

export function finalizeRadii(mesh, nodes) {
  const p = mesh.positions;
  const children = nodes.map(() => []);
  nodes.forEach((n, i) => { if (n.parent >= 0) children[n.parent].push(i); });
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    // local axis from parent to (first) child
    const a = n.parent >= 0 ? nodes[n.parent].p : n.p;
    const b = children[i].length === 1 ? nodes[children[i][0]].p : n.p;
    let ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2]; const l = Math.hypot(ax, ay, az);
    if (l < 1e-6) { n.r = -1; continue; }
    ax /= l; ay /= l; az /= l;
    let s = 0; for (const v of n.verts) {
      const dx = p[v * 3] - n.p[0], dy = p[v * 3 + 1] - n.p[1], dz = p[v * 3 + 2] - n.p[2];
      const t = dx * ax + dy * ay + dz * az;
      s += Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - t * t));
    }
    n.r = s / n.verts.length;
  }
  return children;
}
