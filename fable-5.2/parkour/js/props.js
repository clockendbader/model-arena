// ============================================================================
// props.js — instanced placement of downloaded glTF props.
// Each "piece" is one or more nodes of a model, re-centred so its footprint
// sits on the origin; instances are queued and drawn as InstancedMeshes.
// ============================================================================
import * as THREE from 'three';

// piece key -> [model, node-name matcher(s)]
const PIECES = {
  aircon: ['exterior_aircon_unit', n => n === 'exterior_aircon_unit'],
  airconRusted: ['exterior_aircon_unit', n => n === 'exterior_aircon_unit_rusted'],
  utility1: ['utility_box_01', () => true],
  utility2: ['utility_box_02', () => true],
  crate: ['wooden_crate_02', () => true],
  barrel: ['Barrel_01', () => true],
  barrelBlue: ['barrel_03', () => true],
  propane: ['propane_tank', () => true],
  generator: ['portable_generator', () => true],
  cement: ['cement_bag', () => true],
  tyre: ['old_tyre', () => true],
  ductSeg: ['modular_airduct_rectangular_01', n => n.endsWith('tripple_01')],
  ductVent: ['modular_airduct_rectangular_01', n => n.endsWith('vent_01')],
  ductCorner: ['modular_airduct_rectangular_01', n => n.endsWith('corner_02')],
  fence: ['modular_chainlink_fence', n => n === 'modular_chainlink_fence_double'],
  fencePost: ['modular_chainlink_fence', n => n === 'modular_chainlink_fence_post'],
  pipeStraight: ['modular_industrial_pipes_01', n => n.endsWith('pipe02')],
  pipeBend: ['modular_industrial_pipes_01', n => n.endsWith('pipe03')],
  pipeValve: ['modular_industrial_pipes_01', n => n.endsWith('pipe08')],
  fireEscape: ['modular_fire_escape', () => true],
};

export class PropLibrary {
  constructor(assets, parent) { this.assets = assets; this.parent = parent; this.pieces = new Map(); this.queue = new Map(); }

  piece(key) {
    let p = this.pieces.get(key);
    if (p) return p;
    const [model, match] = PIECES[key];
    const gltf = this.assets.models[model];
    gltf.scene.updateMatrixWorld(true);
    const parts = [], box = new THREE.Box3();
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      let n = o; while (n && !match(n.name)) n = n.parent === gltf.scene ? null : n.parent;
      if (!n && !match(o.name)) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      g.computeBoundingBox(); box.union(g.boundingBox);
      parts.push({ geometry: g, material: o.material });
    });
    if (!parts.length) throw new Error('prop piece not found: ' + key);
    const c = box.getCenter(new THREE.Vector3());
    for (const part of parts) part.geometry.translate(-c.x, -box.min.y, -c.z);
    p = { parts, size: box.getSize(new THREE.Vector3()) };
    this.pieces.set(key, p);
    return p;
  }

  /** queue an instance. group = optional name to keep a set of instances in separate meshes (e.g. for runner's vision) */
  add(key, matrix, group = '') {
    const k = key + '|' + group;
    let q = this.queue.get(k);
    if (!q) this.queue.set(k, q = { key, group, mats: [] });
    q.mats.push(matrix.clone());
  }
  place(key, x, y, z, rotY = 0, scale = 1, group = '') {
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    this.add(key, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rotY), s), group);
  }

  /** build InstancedMeshes; materialFor(group, material) may substitute a material */
  flush(materialFor) {
    const out = [];
    for (const q of this.queue.values()) {
      const p = this.piece(q.key);
      for (const part of p.parts) {
        const mat = materialFor ? materialFor(q.group, part.material) : part.material;
        const im = new THREE.InstancedMesh(part.geometry, mat, q.mats.length);
        q.mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = im.receiveShadow = true;
        im.computeBoundingSphere();
        this.parent.add(im); out.push(im);
      }
    }
    this.queue.clear();
    return out;
  }
}
const UP = new THREE.Vector3(0, 1, 0);
