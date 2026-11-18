// ---------------------------------------------------------------------------
// Props: downloaded glTF models (instanced) and procedural modular pieces
// (water tanks, antennas, vents, sheds, cranes, scaffolding, billboards,
// cables, wall pipes). Procedural pieces are merged into the static batch.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { boxGeo, prep, tubeBetween } from './geometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const PROP_DEFS = {
  aircon: { file: 'exterior_aircon_unit.glb', nodes: ['exterior_aircon_unit'], scale: 2.1 },
  airconRust: { file: 'exterior_aircon_unit.glb', nodes: ['exterior_aircon_unit_rusted'], scale: 2.1 },
  barrel: { file: 'barrel_03.glb', scale: 1.0 },
  crate: { file: 'wooden_crate_01.glb', scale: 1.6 },
  box: { file: 'cardboard_box_01.glb', scale: 1.3 },
  powerbox: { file: 'power_box_01.glb', scale: 1.4 },
  utility: { file: 'utility_box_02.glb', scale: 1.15 },
  duct: { file: 'modular_airduct_rectangular_01.glb', nodes: ['modular_airduct_rectangular_01_tripple_01'], scale: 1.4 },
  ductBend: { file: 'modular_airduct_rectangular_01.glb', nodes: ['modular_airduct_rectangular_01_corner_02'], scale: 1.4 },
  trash: { file: 'metal_trash_can.glb', nodes: ['metal_trash_can_rust', 'metal_trash_can_rust_lid', 'metal_trash_can_rust_handle_left', 'metal_trash_can_rust_handle_right'], scale: 1.0 },
  camera: { file: 'security_camera_01.glb', scale: 1.6 },
};

export class PropLibrary {
  constructor(gltfLoader) {
    this.loader = gltfLoader;
    this.protos = {};
    this.placements = {};
  }

  async load() {
    const files = {};
    for (const def of Object.values(PROP_DEFS)) files[def.file] = null;
    await Promise.all(Object.keys(files).map(async (f) => {
      try {
        files[f] = await this.loader.loadAsync(`assets/models/${f}`);
      } catch (e) {
        console.warn('prop failed', f, e);
      }
    }));
    for (const [name, def] of Object.entries(PROP_DEFS)) {
      const gltf = files[def.file];
      if (!gltf) continue;
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const parts = [];
      const wanted = def.nodes ? new Set(def.nodes) : null;
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (wanted) {
          let a = o, ok = false;
          while (a) { if (wanted.has(a.name)) { ok = true; break; } a = a.parent; }
          if (!ok) return;
        }
        parts.push({ geo: o.geometry, mat: o.material, matrix: o.matrixWorld.clone() });
      });
      if (!parts.length) continue;
      // bounding box in model space
      const bb = new THREE.Box3();
      for (const p of parts) {
        if (!p.geo.boundingBox) p.geo.computeBoundingBox();
        bb.union(p.geo.boundingBox.clone().applyMatrix4(p.matrix));
      }
      // recentre: bottom centre at origin
      const c = bb.getCenter(V(0, 0, 0));
      const recenter = new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z);
      for (const p of parts) {
        p.matrix.premultiply(recenter);
        p.mat.envMapIntensity = 1.0;
      }
      const size = bb.getSize(V(0, 0, 0));
      this.protos[name] = { parts, size, scale: def.scale };
      this.placements[name] = [];
    }
  }

  /** Place a prop. Returns its world AABB (for colliders) or null. */
  place(name, x, y, z, rotY = 0, scale = 1, world = null, surface = 'metal') {
    const p = this.protos[name];
    if (!p) return null;
    const s = p.scale * scale;
    const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rotY), V(s, s, s));
    this.placements[name].push(m);
    const hx = (p.size.x * s) / 2, hz = (p.size.z * s) / 2;
    const c = Math.abs(Math.cos(rotY)), si = Math.abs(Math.sin(rotY));
    const ex = hx * c + hz * si, ez = hx * si + hz * c;
    const box = { minX: x - ex, maxX: x + ex, minY: y, maxY: y + p.size.y * s, minZ: z - ez, maxZ: z + ez };
    if (world) world.addBox(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, surface, 'prop');
    return box;
  }

  build(parent) {
    for (const [name, list] of Object.entries(this.placements)) {
      if (!list.length) continue;
      const p = this.protos[name];
      for (const part of p.parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        const tmp = new THREE.Matrix4();
        list.forEach((m, i) => { tmp.multiplyMatrices(m, part.matrix); im.setMatrixAt(i, tmp); });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        parent.add(im);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Procedural pieces (all merged into the StaticBatch)
// ---------------------------------------------------------------------------

export function cylinderGeo(x, y, z, r, h, seg = 16, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg, 1, false);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * h);
  g.translate(x, y + h / 2, z);
  return prep(g);
}

/** Steel water tank on a frame. */
export function waterTank(batch, m, x, y, z, r = 1.6, h = 3.2, legH = 2.2, world = null) {
  // legs + frame
  const leg = r * 0.75;
  for (const [dx, dz] of [[-leg, -leg], [leg, -leg], [-leg, leg], [leg, leg]]) {
    batch.box(x + dx - 0.09, y, z + dz - 0.09, x + dx + 0.09, y + legH, z + dz + 0.09, m.metalDark);
  }
  batch.add(tubeBetween(V(x - leg, y + legH * 0.5, z - leg), V(x + leg, y + legH * 0.5, z + leg), 0.04), m.metalDark);
  batch.add(tubeBetween(V(x + leg, y + legH * 0.5, z - leg), V(x - leg, y + legH * 0.5, z + leg), 0.04), m.metalDark);
  batch.box(x - r, y + legH - 0.15, z - r, x + r, y + legH, z + r, m.metalDark);
  // tank + conical roof
  batch.add(cylinderGeo(x, y + legH, z, r, h, 20), m.rust);
  const cone = new THREE.ConeGeometry(r * 1.06, r * 0.55, 20, 1);
  cone.translate(x, y + legH + h + r * 0.275, z);
  batch.add(prep(cone), m.rust);
  // ladder
  const lx = x + r + 0.08;
  batch.add(tubeBetween(V(lx, y, z - 0.22), V(lx, y + legH + h, z - 0.22), 0.025), m.steel);
  batch.add(tubeBetween(V(lx, y, z + 0.22), V(lx, y + legH + h, z + 0.22), 0.025), m.steel);
  for (let k = 0.4; k < legH + h; k += 0.4) batch.add(tubeBetween(V(lx, y + k, z - 0.22), V(lx, y + k, z + 0.22), 0.018, 6), m.steel);
  if (world) world.addBox(x - r, y, z - r, x + r, y + legH + h + r * 0.4, z + r, 'metal', 'prop');
}

/** Lattice antenna mast with a red aviation light (returns light position). */
export function antenna(batch, m, x, y, z, h = 9, w = 0.5, world = null) {
  const hw = w / 2;
  const c = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  for (const [dx, dz] of c) batch.add(tubeBetween(V(x + dx, y, z + dz), V(x + dx * 0.4, y + h, z + dz * 0.4), 0.03, 6), m.steel);
  const steps = Math.floor(h / 0.9);
  for (let i = 0; i < steps; i++) {
    const y0 = y + i * 0.9, y1 = y0 + 0.9;
    const k0 = 1 - 0.6 * (i / steps), k1 = 1 - 0.6 * ((i + 1) / steps);
    for (let s = 0; s < 4; s++) {
      const a = c[s], b = c[(s + 1) % 4];
      batch.add(tubeBetween(V(x + a[0] * k0, y0, z + a[1] * k0), V(x + b[0] * k1, y1, z + b[1] * k1), 0.015, 4), m.steel);
    }
  }
  batch.add(tubeBetween(V(x, y + h, z), V(x, y + h + 2.5, z), 0.035, 6), m.steel);
  // dish
  const dish = new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
  dish.rotateZ(Math.PI / 2);
  dish.translate(x + 0.35, y + h * 0.65, z);
  batch.add(prep(dish), m.metal);
  if (world) world.addBox(x - hw, y, z - hw, x + hw, y + h, z + hw, 'metal', 'prop');
  return V(x, y + h + 2.5, z);
}

/** Box vent / small housing. */
export function vent(batch, m, x, y, z, w = 0.8, h = 0.7, d = 0.8, world = null) {
  batch.box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, m.metal);
  batch.box(x - w / 2 - 0.06, y + h, z - d / 2 - 0.06, x + w / 2 + 0.06, y + h + 0.08, z + d / 2 + 0.06, m.metalDark);
  batch.add(cylinderGeo(x, y + h + 0.08, z, Math.min(w, d) * 0.3, 0.35, 12), m.metalDark);
  if (world) world.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h + 0.43, z + d / 2, 'metal', 'prop');
}

/** Roof access shed with a door. */
export function shed(batch, m, x0, z0, x1, z1, y, h = 2.6, world = null, doorSide = 'z') {
  batch.box(x0, y, z0, x1, y + h, z1, m.concrete);
  batch.box(x0 - 0.15, y + h, z0 - 0.15, x1 + 0.15, y + h + 0.18, z1 + 0.15, m.metalDark);
  if (doorSide === 'z') {
    const cx = (x0 + x1) / 2;
    batch.box(cx - 0.5, y, z1, cx + 0.5, y + 2.1, z1 + 0.04, m.metalDark);
  } else {
    const cz = (z0 + z1) / 2;
    batch.box(x1, y, cz - 0.5, x1 + 0.04, y + 2.1, cz + 0.5, m.metalDark);
  }
  if (world) world.addBox(x0, y, z0, x1, y + h + 0.18, z1, 'concrete', 'prop');
}

/** Tower crane (background silhouette). Returns the jib tip lamp position. */
export function crane(batch, m, x, y, z, h, jibLen, rot) {
  const w = 1.6, hw = w / 2;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const R = (dx, dz) => [x + dx * ca - dz * sa, z + dx * sa + dz * ca];
  // mast
  const corners = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  for (const [dx, dz] of corners) {
    const [px, pz] = R(dx, dz);
    batch.add(tubeBetween(V(px, y, pz), V(px, y + h, pz), 0.07, 6), m.paintYellow);
  }
  for (let yy = 0; yy < h; yy += 2) {
    for (let s = 0; s < 4; s++) {
      const a = corners[s], b = corners[(s + 1) % 4];
      const [ax, az] = R(a[0], a[1]); const [bx, bz] = R(b[0], b[1]);
      batch.add(tubeBetween(V(ax, y + yy, az), V(bx, y + yy + 2, bz), 0.035, 4), m.paintYellow);
      batch.add(tubeBetween(V(ax, y + yy, az), V(bx, y + yy, bz), 0.035, 4), m.paintYellow);
    }
  }
  const top = y + h;
  // cab
  {
    const [cx, cz] = R(hw + 0.9, 0);
    batch.box(cx - 0.9, top - 2.4, cz - 0.9, cx + 0.9, top - 0.4, cz + 0.9, m.paintYellow);
  }
  // jib (triangular lattice) and counter jib
  const jib = (from, to, height) => {
    const steps = Math.ceil(Math.abs(to - from) / 2);
    const dir = Math.sign(to - from);
    for (let i = 0; i < steps; i++) {
      const d0 = from + dir * i * 2, d1 = d0 + dir * 2;
      const [a1x, a1z] = R(d0, -0.6), [a2x, a2z] = R(d0, 0.6), [b1x, b1z] = R(d1, -0.6), [b2x, b2z] = R(d1, 0.6);
      const [tx, tz] = R(d0, 0), [t2x, t2z] = R(d1, 0);
      batch.add(tubeBetween(V(a1x, top, a1z), V(b1x, top, b1z), 0.05, 4), m.paintYellow);
      batch.add(tubeBetween(V(a2x, top, a2z), V(b2x, top, b2z), 0.05, 4), m.paintYellow);
      batch.add(tubeBetween(V(tx, top + height, tz), V(t2x, top + height, t2z), 0.05, 4), m.paintYellow);
      batch.add(tubeBetween(V(a1x, top, a1z), V(t2x, top + height, t2z), 0.03, 4), m.paintYellow);
      batch.add(tubeBetween(V(a2x, top, a2z), V(t2x, top + height, t2z), 0.03, 4), m.paintYellow);
    }
  };
  jib(0, jibLen, 1.4);
  jib(0, -jibLen * 0.3, 1.0);
  // apex + ties
  const [ax0, az0] = R(0, 0);
  batch.add(tubeBetween(V(ax0, top, az0), V(ax0, top + 6, az0), 0.09, 6), m.paintYellow);
  const [jx, jz] = R(jibLen * 0.7, 0), [cxj, czj] = R(-jibLen * 0.3, 0);
  batch.add(tubeBetween(V(ax0, top + 6, az0), V(jx, top + 1.4, jz), 0.025, 4), m.cable);
  batch.add(tubeBetween(V(ax0, top + 6, az0), V(cxj, top + 1.0, czj), 0.025, 4), m.cable);
  // counterweight
  {
    const [wx, wz] = R(-jibLen * 0.27, 0);
    batch.box(wx - 1.2, top - 2.2, wz - 1.2, wx + 1.2, top, wz + 1.2, m.concrete);
  }
  // hook
  {
    const [hx, hz] = R(jibLen * 0.55, 0);
    batch.add(tubeBetween(V(hx, top, hz), V(hx, top - h * 0.45, hz), 0.02, 4), m.cable);
    batch.box(hx - 0.3, top - h * 0.45 - 0.6, hz - 0.3, hx + 0.3, top - h * 0.45, hz + 0.3, m.paintRed);
  }
  const [tipx, tipz] = R(jibLen, 0);
  return V(tipx, top + 0.5, tipz);
}

/** Scaffolding frame against a face. Bounds in world, levels every 2 m. */
export function scaffold(batch, m, x0, z0, x1, z1, y0, y1, plankEvery = 2) {
  const tubes = [];
  const stepX = Math.max(1, Math.round((x1 - x0) / 2)), stepZ = Math.max(1, Math.round((z1 - z0) / 2));
  const xs = [], zs = [];
  for (let i = 0; i <= stepX; i++) xs.push(x0 + ((x1 - x0) * i) / stepX);
  for (let i = 0; i <= stepZ; i++) zs.push(z0 + ((z1 - z0) * i) / stepZ);
  for (const x of xs) for (const z of [z0, z1]) tubes.push([V(x, y0, z), V(x, y1 + 1.0, z)]);
  for (const z of zs) for (const x of [x0, x1]) tubes.push([V(x, y0, z), V(x, y1 + 1.0, z)]);
  for (let y = y0 + plankEvery; y <= y1 + 1.01; y += plankEvery) {
    tubes.push([V(x0, y, z0), V(x1, y, z0)], [V(x0, y, z1), V(x1, y, z1)], [V(x0, y, z0), V(x0, y, z1)], [V(x1, y, z0), V(x1, y, z1)]);
  }
  // diagonals
  for (let i = 0; i < xs.length - 1; i++) tubes.push([V(xs[i], y0, z1), V(xs[i + 1], Math.min(y1, y0 + 2), z1)]);
  for (const [a, b] of tubes) batch.add(tubeBetween(a, b, 0.03, 6), m.steel);
}

/** Billboard frame with an emissive panel. Returns the panel mesh (not batched). */
export function billboard(batch, m, tex, x, y, z, w, h, rotY, legH = 2.5) {
  const ca = Math.cos(rotY), sa = Math.sin(rotY);
  const P = (dx, dy, dz) => V(x + dx * ca + dz * sa, y + dy, z - dx * sa + dz * ca);
  for (const dx of [-w * 0.35, w * 0.35]) {
    batch.add(tubeBetween(P(dx, 0, 0.3), P(dx, legH + h, 0.3), 0.09, 8), m.metalDark);
    batch.add(tubeBetween(P(dx, 0, 1.6), P(dx, legH + h * 0.6, 0.3), 0.06, 6), m.metalDark);
  }
  // catwalk
  const cw = new THREE.BoxGeometry(w, 0.08, 0.8);
  cw.translate(0, legH - 0.1, 0.55);
  cw.rotateY(rotY); cw.translate(x, y, z);
  batch.add(prep(cw), m.metalDark);
  // frame
  const fr = new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.25);
  fr.translate(0, legH + h / 2, 0.08); fr.rotateY(rotY); fr.translate(x, y, z);
  batch.add(prep(fr), m.metalDark);
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 2.6, roughness: 0.4 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel.position.copy(P(0, legH + h / 2, -0.06));
  panel.rotation.y = rotY + Math.PI;
  return panel;
}

/** Sagging cable between two points (catenary approximation). */
export function sagCable(batch, m, a, b, sag = 1.2, r = 0.022) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 24, r, 4, false);
  batch.add(prep(g), m.cable, { cast: false });
}
