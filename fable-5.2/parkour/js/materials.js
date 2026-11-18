// ============================================================================
// materials.js — PBR material library (Poly Haven texture sets, ambientCG
// facades), plus the runner's-vision registry that tints route objects red.
// ============================================================================
import * as THREE from 'three';

// metres covered by one texture repeat
export const TILE = {
  concrete_floor_worn_001: 3.2, concrete_floor_02: 3.2, gravel_concrete_03: 2.6, asphalt_02: 4, bitumen: 3, red_brick_03: 2.2,
  concrete_wall_008: 3, painted_plaster_wall: 3, metal_plate_02: 2, blue_metal_plate: 2, corrugated_iron_02: 2.2, rusty_metal_02: 2.2, weathered_brown_planks: 2,
};
const RV_COLOR = new THREE.Color(0.95, 0.07, 0.035);

export class Materials {
  constructor(assets) {
    this.assets = assets; this.cache = new Map(); this.rvList = []; this.rvOn = true;
  }

  /** get a material by key: a texture-set name, a facade name, or "set#variant" */
  get(key) {
    let m = this.cache.get(key);
    if (m) return m;
    const [name, variant] = key.split('#');
    const A = this.assets;
    if (A.facades[name]) {
      const f = A.facades[name];
      m = new THREE.MeshStandardMaterial({
        map: f.map, normalMap: f.normalMap, roughnessMap: f.roughnessMap, metalnessMap: f.metalnessMap,
        metalness: f.metalnessMap ? 1 : 0.05, roughness: 1, vertexColors: true,
        emissiveMap: f.emissiveMap, emissive: f.emissiveMap ? new THREE.Color(1.0, 0.78, 0.5) : new THREE.Color(0),
        emissiveIntensity: name === 'Facade009' ? 0.9 : name === 'Facade012' ? 1.6 : 2.2,
        envMapIntensity: 1.15,
      });
      m.normalScale.set(1.2, 1.2);
    } else if (A.tex[name]) {
      const t = A.tex[name];
      m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, aoMap: t.arm, roughnessMap: t.arm, metalnessMap: t.arm, metalness: 1, roughness: 1, vertexColors: true });
      if (variant === 'yellow') m.color.set(0xe0a020);
      if (variant === 'dark') m.color.set(0x55595e);
      if (variant === 'red') m.color.set(0xb8442c);
      if (variant === 'white') m.color.set(0xd8d4cc);
    } else if (name === 'flat') {
      m = new THREE.MeshStandardMaterial({ color: variant ? Number(variant) : 0x808080, roughness: 0.6, metalness: 0.4, vertexColors: true });
    } else throw new Error('unknown material ' + key);
    m.name = key;
    this.cache.set(key, m);
    return m;
  }

  /** same material without per-vertex tint — for stand-alone meshes that carry no colour attribute */
  plain(key) {
    const k = key + '@plain';
    let m = this.cache.get(k);
    if (!m) { m = this.get(key).clone(); m.vertexColors = false; m.name = k; this.cache.set(k, m); }
    return m;
  }

  /** a route-marking variant of a material: glows red while runner's vision is on */
  rv(key, strength = 1) {
    const k = key + '@rv' + strength;
    let m = this.cache.get(k);
    if (m) return m;
    m = this.get(key).clone();
    m.name = k;
    m.userData.rv = { color: m.color.clone(), strength };
    this.cache.set(k, m); this.rvList.push(m);
    this._apply(m);
    return m;
  }
  /** register any material (e.g. a cloned glTF material) for runner's vision */
  registerRV(m, strength = 1) { m.userData.rv = { color: m.color.clone(), strength }; this.rvList.push(m); this._apply(m); return m; }

  _apply(m) {
    const d = m.userData.rv;
    if (this.rvOn) {
      m.color.copy(RV_COLOR); m.emissive.copy(RV_COLOR); m.emissiveIntensity = 0.75 * d.strength; m.emissiveMap = null;
    } else {
      m.color.copy(d.color); m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 0;
    }
    m.needsUpdate = true;
  }
  setRunnerVision(on) { this.rvOn = on; for (const m of this.rvList) this._apply(m); }
}
